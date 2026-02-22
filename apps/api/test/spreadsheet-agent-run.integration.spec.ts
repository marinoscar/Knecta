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
    startedAt: overrides.startedAt ?? null,
    completedAt: overrides.completedAt ?? null,
    createdByUserId: overrides.createdByUserId ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Spreadsheet Agent - Runs (Integration)', () => {
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

  // ── CREATE RUN ─────────────────────────────────────────────────────────────

  describe('POST /api/spreadsheet-agent/runs', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .post('/api/spreadsheet-agent/runs')
        .send({ projectId: randomUUID() })
        .expect(401);
    });

    it('should return 403 for viewer (no spreadsheet_agent:write)', async () => {
      const viewer = await createMockViewerUser(context);

      await request(context.app.getHttpServer())
        .post('/api/spreadsheet-agent/runs')
        .set(authHeader(viewer.accessToken))
        .send({ projectId: randomUUID() })
        .expect(403);
    });

    it('should return 400 for missing projectId', async () => {
      const contributor = await createMockContributorUser(context);

      await request(context.app.getHttpServer())
        .post('/api/spreadsheet-agent/runs')
        .set(authHeader(contributor.accessToken))
        .send({})
        .expect(400);
    });

    it('should return 400 for invalid projectId (not a UUID)', async () => {
      const contributor = await createMockContributorUser(context);

      await request(context.app.getHttpServer())
        .post('/api/spreadsheet-agent/runs')
        .set(authHeader(contributor.accessToken))
        .send({ projectId: 'not-a-uuid' })
        .expect(400);
    });

    it('should return 404 when project does not exist', async () => {
      const contributor = await createMockContributorUser(context);
      context.prismaMock.spreadsheetProject.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .post('/api/spreadsheet-agent/runs')
        .set(authHeader(contributor.accessToken))
        .send({ projectId: randomUUID() })
        .expect(404);
    });

    it('should return 409 when project has no files', async () => {
      const contributor = await createMockContributorUser(context);
      const projectId = randomUUID();
      const project = createMockProject({ id: projectId });

      context.prismaMock.spreadsheetProject.findUnique.mockResolvedValue(project);
      context.prismaMock.spreadsheetFile.count.mockResolvedValue(0);

      await request(context.app.getHttpServer())
        .post('/api/spreadsheet-agent/runs')
        .set(authHeader(contributor.accessToken))
        .send({ projectId })
        .expect(409);
    });

    it('should return 409 when an active run already exists', async () => {
      const contributor = await createMockContributorUser(context);
      const projectId = randomUUID();
      const project = createMockProject({ id: projectId });

      context.prismaMock.spreadsheetProject.findUnique.mockResolvedValue(project);
      context.prismaMock.spreadsheetFile.count.mockResolvedValue(2);
      context.prismaMock.spreadsheetRun.findFirst.mockResolvedValue({ id: randomUUID() });

      await request(context.app.getHttpServer())
        .post('/api/spreadsheet-agent/runs')
        .set(authHeader(contributor.accessToken))
        .send({ projectId })
        .expect(409);
    });

    it('should create a run for contributor when project has files and no active run', async () => {
      const contributor = await createMockContributorUser(context);
      const projectId = randomUUID();
      const project = createMockProject({ id: projectId });
      const run = createMockRun({ projectId, createdByUserId: contributor.id, status: 'pending' });

      context.prismaMock.spreadsheetProject.findUnique.mockResolvedValue(project);
      context.prismaMock.spreadsheetFile.count.mockResolvedValue(2);
      context.prismaMock.spreadsheetRun.findFirst.mockResolvedValue(null);
      context.prismaMock.spreadsheetRun.create.mockResolvedValue(run);
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      const response = await request(context.app.getHttpServer())
        .post('/api/spreadsheet-agent/runs')
        .set(authHeader(contributor.accessToken))
        .send({ projectId })
        .expect(201);

      expect(response.body.data.projectId).toBe(projectId);
      expect(response.body.data.status).toBe('pending');
      expect(context.prismaMock.spreadsheetRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            projectId,
            createdByUserId: contributor.id,
          }),
        }),
      );
    });

    it('should create a run for admin', async () => {
      const admin = await createMockAdminUser(context);
      const projectId = randomUUID();
      const project = createMockProject({ id: projectId });
      const run = createMockRun({ projectId, createdByUserId: admin.id });

      context.prismaMock.spreadsheetProject.findUnique.mockResolvedValue(project);
      context.prismaMock.spreadsheetFile.count.mockResolvedValue(1);
      context.prismaMock.spreadsheetRun.findFirst.mockResolvedValue(null);
      context.prismaMock.spreadsheetRun.create.mockResolvedValue(run);
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      const response = await request(context.app.getHttpServer())
        .post('/api/spreadsheet-agent/runs')
        .set(authHeader(admin.accessToken))
        .send({ projectId })
        .expect(201);

      expect(response.body.data.projectId).toBe(projectId);
    });

    it('should accept optional config in body', async () => {
      const contributor = await createMockContributorUser(context);
      const projectId = randomUUID();
      const project = createMockProject({ id: projectId });
      const run = createMockRun({
        projectId,
        config: { reviewMode: 'auto', concurrency: 3 },
        createdByUserId: contributor.id,
      });

      context.prismaMock.spreadsheetProject.findUnique.mockResolvedValue(project);
      context.prismaMock.spreadsheetFile.count.mockResolvedValue(1);
      context.prismaMock.spreadsheetRun.findFirst.mockResolvedValue(null);
      context.prismaMock.spreadsheetRun.create.mockResolvedValue(run);
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      const response = await request(context.app.getHttpServer())
        .post('/api/spreadsheet-agent/runs')
        .set(authHeader(contributor.accessToken))
        .send({ projectId, config: { reviewMode: 'auto', concurrency: 3 } })
        .expect(201);

      expect(response.body.data.config).toEqual({ reviewMode: 'auto', concurrency: 3 });
    });
  });

  // ── GET RUN ────────────────────────────────────────────────────────────────

  describe('GET /api/spreadsheet-agent/runs/:runId', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .get(`/api/spreadsheet-agent/runs/${randomUUID()}`)
        .expect(401);
    });

    it('should return 404 for non-existent run', async () => {
      const contributor = await createMockContributorUser(context);
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .get(`/api/spreadsheet-agent/runs/${randomUUID()}`)
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });

    it('should return a run by ID', async () => {
      const contributor = await createMockContributorUser(context);
      const run = createMockRun({ status: 'analyzing' });
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);

      const response = await request(context.app.getHttpServer())
        .get(`/api/spreadsheet-agent/runs/${run.id}`)
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data.id).toBe(run.id);
      expect(response.body.data.status).toBe('analyzing');
    });

    it('should return 400 for invalid UUID format', async () => {
      const contributor = await createMockContributorUser(context);

      await request(context.app.getHttpServer())
        .get('/api/spreadsheet-agent/runs/not-a-uuid')
        .set(authHeader(contributor.accessToken))
        .expect(400);
    });

    it('should return run with all relevant fields', async () => {
      const contributor = await createMockContributorUser(context);
      const projectId = randomUUID();
      const run = createMockRun({
        projectId,
        status: 'review_pending',
        extractionPlan: { tables: [{ tableName: 'orders', sheetName: 'Sheet1' }] },
        config: { reviewMode: 'review' },
      });
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);

      const response = await request(context.app.getHttpServer())
        .get(`/api/spreadsheet-agent/runs/${run.id}`)
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data.projectId).toBe(projectId);
      expect(response.body.data.extractionPlan).toBeDefined();
    });

    it('should return 200 for viewer', async () => {
      const viewer = await createMockViewerUser(context);
      const run = createMockRun({ status: 'completed' });
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);

      const response = await request(context.app.getHttpServer())
        .get(`/api/spreadsheet-agent/runs/${run.id}`)
        .set(authHeader(viewer.accessToken))
        .expect(200);

      expect(response.body.data.status).toBe('completed');
    });
  });

  // ── CANCEL RUN ─────────────────────────────────────────────────────────────

  describe('POST /api/spreadsheet-agent/runs/:runId/cancel', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .post(`/api/spreadsheet-agent/runs/${randomUUID()}/cancel`)
        .expect(401);
    });

    it('should return 403 for viewer (no spreadsheet_agent:write)', async () => {
      const viewer = await createMockViewerUser(context);

      await request(context.app.getHttpServer())
        .post(`/api/spreadsheet-agent/runs/${randomUUID()}/cancel`)
        .set(authHeader(viewer.accessToken))
        .expect(403);
    });

    it('should return 404 for non-existent run', async () => {
      const contributor = await createMockContributorUser(context);
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .post(`/api/spreadsheet-agent/runs/${randomUUID()}/cancel`)
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });

    it('should cancel a pending run', async () => {
      const contributor = await createMockContributorUser(context);
      const run = createMockRun({ status: 'pending' });
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);
      context.prismaMock.spreadsheetRun.update.mockResolvedValue({ ...run, status: 'cancelled' });
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      // POST without @HttpCode decorator defaults to 201 in NestJS
      const response = await request(context.app.getHttpServer())
        .post(`/api/spreadsheet-agent/runs/${run.id}/cancel`)
        .set(authHeader(contributor.accessToken))
        .expect(201);

      expect(response.body.data.status).toBe('cancelled');
    });

    it('should cancel an actively analyzing run', async () => {
      const contributor = await createMockContributorUser(context);
      const run = createMockRun({ status: 'analyzing' });
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);
      context.prismaMock.spreadsheetRun.update.mockResolvedValue({ ...run, status: 'cancelled' });
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      // POST without @HttpCode decorator defaults to 201 in NestJS
      const response = await request(context.app.getHttpServer())
        .post(`/api/spreadsheet-agent/runs/${run.id}/cancel`)
        .set(authHeader(contributor.accessToken))
        .expect(201);

      expect(response.body.data.status).toBe('cancelled');
      expect(context.prismaMock.spreadsheetRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: run.id },
          data: { status: 'cancelled' },
        }),
      );
    });

    it('should return 400 when run is already completed', async () => {
      const contributor = await createMockContributorUser(context);
      const run = createMockRun({ status: 'completed' });
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);

      await request(context.app.getHttpServer())
        .post(`/api/spreadsheet-agent/runs/${run.id}/cancel`)
        .set(authHeader(contributor.accessToken))
        .expect(400);
    });

    it('should return 400 when run is already failed', async () => {
      const contributor = await createMockContributorUser(context);
      const run = createMockRun({ status: 'failed' });
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);

      await request(context.app.getHttpServer())
        .post(`/api/spreadsheet-agent/runs/${run.id}/cancel`)
        .set(authHeader(contributor.accessToken))
        .expect(400);
    });

    it('should return 400 when run is already cancelled', async () => {
      const contributor = await createMockContributorUser(context);
      const run = createMockRun({ status: 'cancelled' });
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);

      await request(context.app.getHttpServer())
        .post(`/api/spreadsheet-agent/runs/${run.id}/cancel`)
        .set(authHeader(contributor.accessToken))
        .expect(400);
    });

    it('should allow admin to cancel run', async () => {
      const admin = await createMockAdminUser(context);
      const run = createMockRun({ status: 'ingesting' });
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);
      context.prismaMock.spreadsheetRun.update.mockResolvedValue({ ...run, status: 'cancelled' });
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      // POST without @HttpCode decorator defaults to 201 in NestJS
      const response = await request(context.app.getHttpServer())
        .post(`/api/spreadsheet-agent/runs/${run.id}/cancel`)
        .set(authHeader(admin.accessToken))
        .expect(201);

      expect(response.body.data.status).toBe('cancelled');
    });
  });

  // ── APPROVE PLAN ───────────────────────────────────────────────────────────

  describe('POST /api/spreadsheet-agent/runs/:runId/approve', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .post(`/api/spreadsheet-agent/runs/${randomUUID()}/approve`)
        .send({ modifications: [] })
        .expect(401);
    });

    it('should return 403 for viewer (no spreadsheet_agent:write)', async () => {
      const viewer = await createMockViewerUser(context);

      await request(context.app.getHttpServer())
        .post(`/api/spreadsheet-agent/runs/${randomUUID()}/approve`)
        .set(authHeader(viewer.accessToken))
        .send({ modifications: [] })
        .expect(403);
    });

    it('should return 404 for non-existent run', async () => {
      const contributor = await createMockContributorUser(context);
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .post(`/api/spreadsheet-agent/runs/${randomUUID()}/approve`)
        .set(authHeader(contributor.accessToken))
        .send({ modifications: [] })
        .expect(404);
    });

    it('should return 400 when run is not in review_pending state', async () => {
      const contributor = await createMockContributorUser(context);
      const run = createMockRun({ status: 'analyzing' });
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);

      await request(context.app.getHttpServer())
        .post(`/api/spreadsheet-agent/runs/${run.id}/approve`)
        .set(authHeader(contributor.accessToken))
        .send({ modifications: [] })
        .expect(400);
    });

    it('should return 400 when trying to approve a pending run', async () => {
      const contributor = await createMockContributorUser(context);
      const run = createMockRun({ status: 'pending' });
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);

      await request(context.app.getHttpServer())
        .post(`/api/spreadsheet-agent/runs/${run.id}/approve`)
        .set(authHeader(contributor.accessToken))
        .send({ modifications: [] })
        .expect(400);
    });

    it('should approve plan with no modifications', async () => {
      const contributor = await createMockContributorUser(context);
      const run = createMockRun({
        status: 'review_pending',
        extractionPlan: { tables: [{ tableName: 'orders', sheetName: 'Sheet1' }] },
      });
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);
      context.prismaMock.spreadsheetRun.update.mockResolvedValue({
        ...run,
        status: 'pending',
        extractionPlanModified: null,
      });
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      // POST without @HttpCode decorator defaults to 201 in NestJS
      const response = await request(context.app.getHttpServer())
        .post(`/api/spreadsheet-agent/runs/${run.id}/approve`)
        .set(authHeader(contributor.accessToken))
        .send({})
        .expect(201);

      expect(response.body.data.status).toBe('pending');
    });

    it('should approve plan with include/skip modifications', async () => {
      const contributor = await createMockContributorUser(context);
      const run = createMockRun({
        status: 'review_pending',
        extractionPlan: {
          tables: [
            { tableName: 'orders', sheetName: 'Sheet1' },
            { tableName: 'drafts', sheetName: 'Sheet2' },
          ],
        },
      });
      const modifications = [
        { tableName: 'orders', action: 'include' },
        { tableName: 'drafts', action: 'skip' },
      ];

      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);
      context.prismaMock.spreadsheetRun.update.mockResolvedValue({
        ...run,
        status: 'pending',
        extractionPlanModified: modifications,
      });
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      // POST without @HttpCode decorator defaults to 201 in NestJS
      const response = await request(context.app.getHttpServer())
        .post(`/api/spreadsheet-agent/runs/${run.id}/approve`)
        .set(authHeader(contributor.accessToken))
        .send({ modifications })
        .expect(201);

      expect(response.body.data.status).toBe('pending');
      // Verify update was called with extractionPlanModified and status=pending
      expect(context.prismaMock.spreadsheetRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: run.id },
          data: expect.objectContaining({
            status: 'pending',
          }),
        }),
      );
    });

    it('should approve plan with column overrides', async () => {
      const contributor = await createMockContributorUser(context);
      const run = createMockRun({ status: 'review_pending' });
      const modifications = [
        {
          tableName: 'orders',
          action: 'include',
          overrides: {
            tableName: 'sales_orders',
            columns: [
              { outputName: 'order_id', outputType: 'integer' },
              { outputName: 'amount', outputType: 'decimal' },
            ],
          },
        },
      ];

      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);
      context.prismaMock.spreadsheetRun.update.mockResolvedValue({
        ...run,
        status: 'pending',
        extractionPlanModified: modifications,
      });
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      // POST without @HttpCode decorator defaults to 201 in NestJS
      const response = await request(context.app.getHttpServer())
        .post(`/api/spreadsheet-agent/runs/${run.id}/approve`)
        .set(authHeader(contributor.accessToken))
        .send({ modifications })
        .expect(201);

      expect(response.body.data.status).toBe('pending');
    });

    it('should allow admin to approve plan', async () => {
      const admin = await createMockAdminUser(context);
      const run = createMockRun({ status: 'review_pending' });

      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);
      context.prismaMock.spreadsheetRun.update.mockResolvedValue({ ...run, status: 'pending' });
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      // POST without @HttpCode decorator defaults to 201 in NestJS
      const response = await request(context.app.getHttpServer())
        .post(`/api/spreadsheet-agent/runs/${run.id}/approve`)
        .set(authHeader(admin.accessToken))
        .send({ modifications: [] })
        .expect(201);

      expect(response.body.data.status).toBe('pending');
    });
  });
});
