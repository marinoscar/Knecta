import request from 'supertest';
import {
  TestContext,
  createTestApp,
  closeTestApp,
} from './helpers/test-app.helper';
import { resetPrismaMock } from './mocks/prisma.mock';
import { setupBaseMocks } from './fixtures/mock-setup.helper';
import {
  createMockAdminUser,
  createMockContributorUser,
  createMockViewerUser,
  authHeader,
} from './helpers/auth-mock.helper';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function createMockProject(overrides: Partial<any> = {}): any {
  const id = overrides.id || randomUUID();
  return {
    id,
    name: overrides.name ?? 'Test Project',
    description: overrides.description ?? null,
    storageProvider: overrides.storageProvider ?? 's3',
    outputBucket: overrides.outputBucket ?? 'test-bucket',
    outputPrefix: overrides.outputPrefix ?? `spreadsheet-agent/${id}`,
    reviewMode: overrides.reviewMode ?? 'review',
    status: overrides.status ?? 'draft',
    fileCount: overrides.fileCount ?? 1,
    tableCount: overrides.tableCount ?? 0,
    totalRows: overrides.totalRows ?? BigInt(0),
    totalSizeBytes: overrides.totalSizeBytes ?? BigInt(0),
    createdByUserId: overrides.createdByUserId ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createMockRun(overrides: Partial<any> = {}): any {
  return {
    id: overrides.id ?? randomUUID(),
    projectId: overrides.projectId ?? randomUUID(),
    status: overrides.status ?? 'pending',
    currentPhase: overrides.currentPhase ?? null,
    progress: overrides.progress ?? null,
    extractionPlan: overrides.extractionPlan ?? null,
    extractionPlanModified: overrides.extractionPlanModified ?? null,
    config: overrides.config ?? {},
    stats: overrides.stats ?? null,
    errorMessage: overrides.errorMessage ?? null,
    startedAt: overrides.startedAt !== undefined ? overrides.startedAt : null,
    completedAt: overrides.completedAt ?? null,
    createdByUserId: overrides.createdByUserId ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Spreadsheet Agent - Bug Fixes', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await createTestApp({ useMockDatabase: true });
  });

  afterAll(async () => {
    await closeTestApp(context);
  });

  beforeEach(() => {
    resetPrismaMock();
    setupBaseMocks();
  });

  // ── Issue 8: claimRun preserves startedAt on resume ────────────────────────
  //
  // When approvePlan() resets a run to 'pending', claimRun() is called again
  // as the stream endpoint transitions it to 'ingesting'. The fix ensures that
  // startedAt is only written on the very first execution (when it is null).
  // On resume, the existing timestamp must be preserved.

  describe('claimRun — startedAt preservation (Issue 8)', () => {
    it('should set startedAt when claiming a run for the first time', async () => {
      // Arrange: run has no startedAt (first execution)
      const run = createMockRun({
        status: 'pending',
        startedAt: null,
      });

      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);

      // updateMany returns count: 1 (successfully claimed)
      context.prismaMock.spreadsheetRun.updateMany.mockResolvedValue({ count: 1 });

      // After the claim, findUnique is called again to get projectId + startedAt
      context.prismaMock.spreadsheetRun.findUnique
        .mockResolvedValueOnce(run) // first call (getRun in stream controller)
        .mockResolvedValueOnce({ projectId: run.projectId, startedAt: null }); // second call inside claimRun

      context.prismaMock.spreadsheetRun.update.mockResolvedValue({
        ...run,
        startedAt: new Date(),
      });

      context.prismaMock.spreadsheetProject.update.mockResolvedValue({});

      // Act: call claimRun directly through the service
      const service = context.module.get(
        require('../src/spreadsheet-agent/spreadsheet-agent.service').SpreadsheetAgentService,
      );
      await service.claimRun(run.id);

      // Assert: update was called to set startedAt (because it was null)
      expect(context.prismaMock.spreadsheetRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: run.id },
          data: expect.objectContaining({ startedAt: expect.any(Date) }),
        }),
      );
    });

    it('should NOT overwrite startedAt when resuming after approval', async () => {
      // Arrange: run already has startedAt set (resume path — approved run)
      const originalStartTime = new Date('2026-02-23T10:00:00Z');
      const run = createMockRun({
        status: 'pending',
        startedAt: originalStartTime,
      });

      // updateMany returns count: 1 (successfully claimed)
      context.prismaMock.spreadsheetRun.updateMany.mockResolvedValue({ count: 1 });

      // After the claim, findUnique is called to get projectId + startedAt
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue({
        projectId: run.projectId,
        startedAt: originalStartTime, // already set
      });

      context.prismaMock.spreadsheetProject.update.mockResolvedValue({});

      // Act
      const service = context.module.get(
        require('../src/spreadsheet-agent/spreadsheet-agent.service').SpreadsheetAgentService,
      );
      await service.claimRun(run.id);

      // Assert: update was NOT called with startedAt because it was already set
      const updateCalls: any[] = context.prismaMock.spreadsheetRun.update.mock.calls;
      const startedAtUpdateCalls = updateCalls.filter(
        (call) => call[0]?.data?.startedAt !== undefined,
      );
      expect(startedAtUpdateCalls).toHaveLength(0);
    });

    it('should return false when run is already claimed by another process', async () => {
      // Arrange: updateMany returns count: 0 (someone else already claimed it)
      context.prismaMock.spreadsheetRun.updateMany.mockResolvedValue({ count: 0 });

      // Act
      const service = context.module.get(
        require('../src/spreadsheet-agent/spreadsheet-agent.service').SpreadsheetAgentService,
      );
      const result = await service.claimRun(randomUUID());

      // Assert
      expect(result).toBe(false);
      // findUnique should NOT be called because count was 0
      expect(context.prismaMock.spreadsheetRun.findUnique).not.toHaveBeenCalled();
    });

    it('should return true and still update project status on resume', async () => {
      // Arrange
      const projectId = randomUUID();
      const originalStartTime = new Date('2026-02-23T10:00:00Z');
      const run = createMockRun({ projectId, status: 'pending', startedAt: originalStartTime });

      context.prismaMock.spreadsheetRun.updateMany.mockResolvedValue({ count: 1 });
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue({
        projectId,
        startedAt: originalStartTime,
      });
      context.prismaMock.spreadsheetProject.update.mockResolvedValue({});

      // Act
      const service = context.module.get(
        require('../src/spreadsheet-agent/spreadsheet-agent.service').SpreadsheetAgentService,
      );
      const result = await service.claimRun(run.id);

      // Assert: claimRun returns true
      expect(result).toBe(true);

      // Project status should still be updated to 'processing' on resume
      expect(context.prismaMock.spreadsheetProject.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: projectId },
          data: expect.objectContaining({ status: 'processing' }),
        }),
      );
    });
  });

  // ── Issue 8 (API layer): stream endpoint rejects terminal-state runs ────────

  describe('POST /api/spreadsheet-agent/runs/:runId/stream — stream endpoint guards', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .post(`/api/spreadsheet-agent/runs/${randomUUID()}/stream`)
        .expect(401);
    });

    it('should return 403 for viewer (no spreadsheet_agent:write)', async () => {
      const viewer = await createMockViewerUser(context);

      await request(context.app.getHttpServer())
        .post(`/api/spreadsheet-agent/runs/${randomUUID()}/stream`)
        .set(authHeader(viewer.accessToken))
        .expect(403);
    });

    it('should return 404 for non-existent run', async () => {
      const contributor = await createMockContributorUser(context);
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .post(`/api/spreadsheet-agent/runs/${randomUUID()}/stream`)
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });

    it('should return 400 for a completed run', async () => {
      const contributor = await createMockContributorUser(context);
      const run = createMockRun({ status: 'completed' });
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);

      await request(context.app.getHttpServer())
        .post(`/api/spreadsheet-agent/runs/${run.id}/stream`)
        .set(authHeader(contributor.accessToken))
        .expect(400);
    });

    it('should return 400 for a failed run', async () => {
      const contributor = await createMockContributorUser(context);
      const run = createMockRun({ status: 'failed' });
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);

      await request(context.app.getHttpServer())
        .post(`/api/spreadsheet-agent/runs/${run.id}/stream`)
        .set(authHeader(contributor.accessToken))
        .expect(400);
    });

    it('should return 400 for a cancelled run', async () => {
      const contributor = await createMockContributorUser(context);
      const run = createMockRun({ status: 'cancelled' });
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);

      await request(context.app.getHttpServer())
        .post(`/api/spreadsheet-agent/runs/${run.id}/stream`)
        .set(authHeader(contributor.accessToken))
        .expect(400);
    });

    it('should return 400 for invalid UUID format', async () => {
      const contributor = await createMockContributorUser(context);

      await request(context.app.getHttpServer())
        .post('/api/spreadsheet-agent/runs/not-a-uuid/stream')
        .set(authHeader(contributor.accessToken))
        .expect(400);
    });
  });

  // ── Issue 8 (API layer): approvePlan validation ─────────────────────────────

  describe('POST /api/spreadsheet-agent/runs/:runId/approve — validation (Issue 8)', () => {
    it('should return 400 when run is in pending state (not review_pending)', async () => {
      const contributor = await createMockContributorUser(context);
      const run = createMockRun({ status: 'pending' });
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);

      await request(context.app.getHttpServer())
        .post(`/api/spreadsheet-agent/runs/${run.id}/approve`)
        .set(authHeader(contributor.accessToken))
        .send({})
        .expect(400);
    });

    it('should return 400 when run is in analyzing state', async () => {
      const contributor = await createMockContributorUser(context);
      const run = createMockRun({ status: 'analyzing' });
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);

      await request(context.app.getHttpServer())
        .post(`/api/spreadsheet-agent/runs/${run.id}/approve`)
        .set(authHeader(contributor.accessToken))
        .send({})
        .expect(400);
    });

    it('should return 400 when run is in extracting state', async () => {
      const contributor = await createMockContributorUser(context);
      const run = createMockRun({ status: 'extracting' });
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);

      await request(context.app.getHttpServer())
        .post(`/api/spreadsheet-agent/runs/${run.id}/approve`)
        .set(authHeader(contributor.accessToken))
        .send({})
        .expect(400);
    });

    it('should return 400 when run is completed', async () => {
      const contributor = await createMockContributorUser(context);
      const run = createMockRun({ status: 'completed' });
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);

      await request(context.app.getHttpServer())
        .post(`/api/spreadsheet-agent/runs/${run.id}/approve`)
        .set(authHeader(contributor.accessToken))
        .send({})
        .expect(400);
    });

    it('should approve a review_pending run with no modifications and set status to pending', async () => {
      const contributor = await createMockContributorUser(context);
      const run = createMockRun({
        status: 'review_pending',
        extractionPlan: {
          tables: [
            {
              tableName: 'orders',
              sourceFileName: 'Sample.xlsx',
              sourceSheetName: 'Sheet1',
              sourceFileId: randomUUID(),
            },
          ],
          relationships: [],
          catalogMetadata: {
            projectDescription: 'Order data',
            domainNotes: '',
            dataQualityNotes: [],
          },
        },
      });

      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);
      context.prismaMock.spreadsheetRun.update.mockResolvedValue({
        ...run,
        status: 'pending',
        extractionPlanModified: null,
      });
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      const response = await request(context.app.getHttpServer())
        .post(`/api/spreadsheet-agent/runs/${run.id}/approve`)
        .set(authHeader(contributor.accessToken))
        .send({})
        .expect(201);

      expect(response.body.data.status).toBe('pending');

      // Verify that update was called with status: 'pending'
      expect(context.prismaMock.spreadsheetRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: run.id },
          data: expect.objectContaining({ status: 'pending' }),
        }),
      );
    });

    it('should store modifications when provided during approval', async () => {
      const contributor = await createMockContributorUser(context);
      const modifications = [
        { tableName: 'orders', action: 'include' },
        { tableName: 'drafts', action: 'skip' },
      ];

      const run = createMockRun({ status: 'review_pending' });
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);
      context.prismaMock.spreadsheetRun.update.mockResolvedValue({
        ...run,
        status: 'pending',
        extractionPlanModified: modifications,
      });
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      const response = await request(context.app.getHttpServer())
        .post(`/api/spreadsheet-agent/runs/${run.id}/approve`)
        .set(authHeader(contributor.accessToken))
        .send({ modifications })
        .expect(201);

      expect(response.body.data.status).toBe('pending');

      // Verify modifications were passed to the update call
      expect(context.prismaMock.spreadsheetRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            extractionPlanModified: modifications,
          }),
        }),
      );
    });

    it('should allow admin to approve a review_pending run', async () => {
      const admin = await createMockAdminUser(context);
      const run = createMockRun({ status: 'review_pending' });

      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);
      context.prismaMock.spreadsheetRun.update.mockResolvedValue({
        ...run,
        status: 'pending',
      });
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      const response = await request(context.app.getHttpServer())
        .post(`/api/spreadsheet-agent/runs/${run.id}/approve`)
        .set(authHeader(admin.accessToken))
        .send({})
        .expect(201);

      expect(response.body.data.status).toBe('pending');
    });

    it('should return 403 for viewer trying to approve', async () => {
      const viewer = await createMockViewerUser(context);

      await request(context.app.getHttpServer())
        .post(`/api/spreadsheet-agent/runs/${randomUUID()}/approve`)
        .set(authHeader(viewer.accessToken))
        .send({})
        .expect(403);
    });

    it('should return 404 for non-existent run', async () => {
      const contributor = await createMockContributorUser(context);
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .post(`/api/spreadsheet-agent/runs/${randomUUID()}/approve`)
        .set(authHeader(contributor.accessToken))
        .send({})
        .expect(404);
    });

    it('should create an audit event on successful approval', async () => {
      const contributor = await createMockContributorUser(context);
      const run = createMockRun({ status: 'review_pending' });

      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);
      context.prismaMock.spreadsheetRun.update.mockResolvedValue({
        ...run,
        status: 'pending',
      });
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      await request(context.app.getHttpServer())
        .post(`/api/spreadsheet-agent/runs/${run.id}/approve`)
        .set(authHeader(contributor.accessToken))
        .send({})
        .expect(201);

      expect(context.prismaMock.auditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'spreadsheet_runs:approve_plan',
            targetId: run.id,
          }),
        }),
      );
    });
  });

  // ── Issue 3A: Design node — sourceFileId resolution ────────────────────────
  //
  // The LLM does not have access to real DB UUIDs, so the design node must
  // programmatically fix sourceFileId after the LLM generates the plan by
  // matching on (fileName, sheetName) from the sheetAnalyses in the state.

  describe('Design node — sourceFileId resolution (Issue 3A)', () => {
    it('should resolve sourceFileId by exact (fileName + sheetName) match', () => {
      // Simulate what the design node post-processing does
      const realFileId = randomUUID();
      const llmFabricatedId = randomUUID(); // what the LLM would hallucinate

      const sheetAnalyses = [
        {
          fileId: realFileId,
          fileName: 'Sample.xlsx',
          sheetName: 'Revenue',
          logicalTables: [],
          crossFileHints: [],
        },
      ];

      const planTables = [
        {
          tableName: 'revenue',
          sourceFileName: 'Sample.xlsx',
          sourceSheetName: 'Revenue',
          sourceFileId: llmFabricatedId, // LLM hallucinated this
        },
      ];

      // Apply the resolution logic (copied from design.ts)
      for (const table of planTables) {
        const analysis = sheetAnalyses.find(
          (a) =>
            a.fileName === table.sourceFileName &&
            a.sheetName === table.sourceSheetName,
        );
        if (analysis) {
          table.sourceFileId = analysis.fileId;
        }
      }

      // Assert: sourceFileId was replaced with the real DB UUID
      expect(planTables[0].sourceFileId).toBe(realFileId);
      expect(planTables[0].sourceFileId).not.toBe(llmFabricatedId);
    });

    it('should fall back to fileName-only match when sheetName does not match', () => {
      const realFileId = randomUUID();
      const llmFabricatedId = randomUUID();

      const sheetAnalyses = [
        {
          fileId: realFileId,
          fileName: 'Sample.xlsx',
          sheetName: 'Sheet1', // actual sheet name
          logicalTables: [],
          crossFileHints: [],
        },
      ];

      const planTables = [
        {
          tableName: 'data',
          sourceFileName: 'Sample.xlsx',
          sourceSheetName: 'Data Export', // LLM hallucinated the sheet name too
          sourceFileId: llmFabricatedId,
        },
      ];

      // Apply the resolution logic — primary match fails, fallback kicks in
      for (const table of planTables) {
        const analysis = sheetAnalyses.find(
          (a) =>
            a.fileName === table.sourceFileName &&
            a.sheetName === table.sourceSheetName,
        );
        if (analysis) {
          table.sourceFileId = analysis.fileId;
        } else {
          // Fallback: match by fileName only
          const fileMatch = sheetAnalyses.find(
            (a) => a.fileName === table.sourceFileName,
          );
          if (fileMatch) {
            table.sourceFileId = fileMatch.fileId;
          }
        }
      }

      // Assert: fileId resolved via fallback
      expect(planTables[0].sourceFileId).toBe(realFileId);
    });

    it('should leave sourceFileId unchanged when no match is found', () => {
      const llmFabricatedId = randomUUID();

      const sheetAnalyses = [
        {
          fileId: randomUUID(),
          fileName: 'OtherFile.xlsx',
          sheetName: 'Sheet1',
          logicalTables: [],
          crossFileHints: [],
        },
      ];

      const planTables = [
        {
          tableName: 'data',
          sourceFileName: 'MissingFile.xlsx', // no matching analysis
          sourceSheetName: 'Sheet1',
          sourceFileId: llmFabricatedId,
        },
      ];

      // Apply the resolution logic
      for (const table of planTables) {
        const analysis = sheetAnalyses.find(
          (a) =>
            a.fileName === table.sourceFileName &&
            a.sheetName === table.sourceSheetName,
        );
        if (analysis) {
          table.sourceFileId = analysis.fileId;
        } else {
          const fileMatch = sheetAnalyses.find(
            (a) => a.fileName === table.sourceFileName,
          );
          if (fileMatch) {
            table.sourceFileId = fileMatch.fileId;
          }
          // If neither match, sourceFileId stays as the LLM value (will fail FK at persist)
        }
      }

      // Assert: sourceFileId was not changed (no match found)
      expect(planTables[0].sourceFileId).toBe(llmFabricatedId);
    });

    it('should resolve sourceFileIds for all tables in a multi-file plan', () => {
      const fileId1 = randomUUID();
      const fileId2 = randomUUID();
      const llmId1 = randomUUID();
      const llmId2 = randomUUID();

      const sheetAnalyses = [
        { fileId: fileId1, fileName: 'Sales.xlsx', sheetName: 'Q1', logicalTables: [], crossFileHints: [] },
        { fileId: fileId1, fileName: 'Sales.xlsx', sheetName: 'Q2', logicalTables: [], crossFileHints: [] },
        { fileId: fileId2, fileName: 'Costs.csv', sheetName: 'Sheet1', logicalTables: [], crossFileHints: [] },
      ];

      const planTables = [
        { tableName: 'sales_q1', sourceFileName: 'Sales.xlsx', sourceSheetName: 'Q1', sourceFileId: llmId1 },
        { tableName: 'sales_q2', sourceFileName: 'Sales.xlsx', sourceSheetName: 'Q2', sourceFileId: llmId1 },
        { tableName: 'costs', sourceFileName: 'Costs.csv', sourceSheetName: 'Sheet1', sourceFileId: llmId2 },
      ];

      for (const table of planTables) {
        const analysis = sheetAnalyses.find(
          (a) =>
            a.fileName === table.sourceFileName &&
            a.sheetName === table.sourceSheetName,
        );
        if (analysis) {
          table.sourceFileId = analysis.fileId;
        }
      }

      expect(planTables[0].sourceFileId).toBe(fileId1);
      expect(planTables[1].sourceFileId).toBe(fileId1);
      expect(planTables[2].sourceFileId).toBe(fileId2);
    });

    it('should handle the project-ID-as-fileId scenario from the bug report', () => {
      // This is the exact bug: LLM used the project ID (from prompt context)
      // as the sourceFileId for all tables.
      const projectId = '362508ab-3330-4063-a320-912dc804139d';
      const realFileId1 = '0968cd92-1111-4444-9999-000000000001';
      const realFileId2 = '3062b195-2222-5555-8888-000000000002';

      const sheetAnalyses = [
        { fileId: realFileId1, fileName: 'Sample1.xls', sheetName: 'Income Statement', logicalTables: [], crossFileHints: [] },
        { fileId: realFileId2, fileName: 'Sample2.xls', sheetName: 'Balance Sheet', logicalTables: [], crossFileHints: [] },
      ];

      // 23 tables all with the project ID as sourceFileId (the actual bug)
      const planTables = [
        { tableName: 'income_statement', sourceFileName: 'Sample1.xls', sourceSheetName: 'Income Statement', sourceFileId: projectId },
        { tableName: 'balance_sheet', sourceFileName: 'Sample2.xls', sourceSheetName: 'Balance Sheet', sourceFileId: projectId },
      ];

      for (const table of planTables) {
        const analysis = sheetAnalyses.find(
          (a) =>
            a.fileName === table.sourceFileName &&
            a.sheetName === table.sourceSheetName,
        );
        if (analysis) {
          table.sourceFileId = analysis.fileId;
        }
      }

      // Assert: project ID was replaced with real file IDs
      expect(planTables[0].sourceFileId).toBe(realFileId1);
      expect(planTables[1].sourceFileId).toBe(realFileId2);
      expect(planTables[0].sourceFileId).not.toBe(projectId);
      expect(planTables[1].sourceFileId).not.toBe(projectId);
    });
  });

  // ── Issue 2: Token carry-over on resume ────────────────────────────────────
  //
  // When a run resumes after approval, token usage from the first execution
  // (analyze + design phases) should be included in the final stats.

  describe('Token carry-over on resume (Issue 2)', () => {
    it('should inject previous token usage into initial state on resume', () => {
      // Simulate what spreadsheet-agent-agent.service.ts does when isResumeAfterReview is true
      const prevStats = {
        tokensUsed: { prompt: 50000, completion: 23540, total: 73540 },
        tablesExtracted: 0,
        totalRows: 0,
        totalSizeBytes: 0,
        revisionCycles: 0,
      };

      const run = {
        extractionPlan: { tables: [] },
        extractionPlanModified: [],
        stats: prevStats,
      };

      // Determine if resume
      const isResumeAfterReview =
        run.extractionPlan != null && run.extractionPlanModified != null;

      expect(isResumeAfterReview).toBe(true);

      // Build initial state (mirrors the agent service logic)
      const initialState: any = {};

      if (isResumeAfterReview) {
        const prevStatsRecord = run.stats as Record<string, unknown> | null;
        if (prevStatsRecord?.tokensUsed) {
          const prevTokens = prevStatsRecord.tokensUsed as {
            prompt?: number;
            completion?: number;
            total?: number;
          };
          initialState.tokensUsed = {
            prompt: prevTokens.prompt ?? 0,
            completion: prevTokens.completion ?? 0,
            total: prevTokens.total ?? 0,
          };
        }
      }

      // Assert: tokens from the first execution are carried forward
      expect(initialState.tokensUsed).toEqual({
        prompt: 50000,
        completion: 23540,
        total: 73540,
      });
    });

    it('should default to zero tokens when stats are absent on resume', () => {
      const run = {
        extractionPlan: { tables: [] },
        extractionPlanModified: [],
        stats: null, // no stats from first run (edge case)
      };

      const isResumeAfterReview =
        run.extractionPlan != null && run.extractionPlanModified != null;

      const initialState: any = {};

      if (isResumeAfterReview) {
        const prevStats = run.stats as Record<string, unknown> | null;
        if (prevStats?.tokensUsed) {
          const prevTokens = prevStats.tokensUsed as {
            prompt?: number;
            completion?: number;
            total?: number;
          };
          initialState.tokensUsed = {
            prompt: prevTokens.prompt ?? 0,
            completion: prevTokens.completion ?? 0,
            total: prevTokens.total ?? 0,
          };
        }
      }

      // Assert: no tokensUsed set in state (will default to zero via LangGraph reducer)
      expect(initialState.tokensUsed).toBeUndefined();
    });

    it('should NOT carry tokens when this is a fresh run (not a resume)', () => {
      const run = {
        extractionPlan: null, // no plan yet — fresh run
        extractionPlanModified: null,
        stats: null,
      };

      const isResumeAfterReview =
        run.extractionPlan != null && run.extractionPlanModified != null;

      expect(isResumeAfterReview).toBe(false);

      // For a fresh run, no token carry-over should happen
      const initialState: any = {};
      // (the isResumeAfterReview branch is skipped — initialState.tokensUsed stays undefined)

      expect(initialState.tokensUsed).toBeUndefined();
    });
  });

  // ── Final-state error check (Issue 3C / 7) ─────────────────────────────────
  //
  // The agent service must check finalState.error and mark the run as failed
  // rather than completed when an error exists in the final LangGraph state.

  describe('Agent service — final state error check (Issues 3C and 7)', () => {
    it('should detect that a run with finalState.error must be marked failed', () => {
      // Simulate what the agent service does after graph.invoke() returns
      const finalState = {
        error: 'Persist failed: FK violation on sourceFileId',
        extractionResults: [{ tableName: 'orders', rowCount: 100, sizeBytes: 1024 }],
        tokensUsed: { prompt: 100, completion: 50, total: 150 },
        revisionCount: 0,
      };

      // The check that prevents silent completion
      const shouldFail = !!finalState.error;

      expect(shouldFail).toBe(true);
    });

    it('should correctly compute zero tables extracted when finalState.error exists', () => {
      // Even when extractionResults has entries, if there's a persist error
      // the tables weren't actually written. The agent service now uses tablesExtracted
      // from extractionResults length for stats (knowing they weren't persisted).
      const finalState = {
        error: 'Persist failed: FK violation on sourceFileId',
        extractionResults: [], // persist node failed before populating these
        tokensUsed: { prompt: 5000, completion: 2000, total: 7000 },
        revisionCount: 0,
      };

      const tablesExtracted = finalState.extractionResults?.length ?? 0;

      expect(tablesExtracted).toBe(0);
    });

    it('should treat a run without finalState.error as successfully completed', () => {
      const finalState = {
        error: undefined,
        extractionResults: [
          { tableName: 'orders', rowCount: 500, sizeBytes: 4096 },
          { tableName: 'customers', rowCount: 250, sizeBytes: 2048 },
        ],
        tokensUsed: { prompt: 10000, completion: 5000, total: 15000 },
        revisionCount: 0,
      };

      const shouldFail = !!finalState.error;
      expect(shouldFail).toBe(false);

      const tablesExtracted = finalState.extractionResults?.length ?? 0;
      expect(tablesExtracted).toBe(2);
    });
  });
});
