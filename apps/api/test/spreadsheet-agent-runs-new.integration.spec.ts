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

function createMockRunWithProject(overrides: Partial<any> = {}): any {
  const projectId = overrides.projectId ?? randomUUID();
  const run = createMockRun({ ...overrides, projectId });
  return {
    ...run,
    project: overrides.project ?? { id: projectId, name: 'Test Project' },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Spreadsheet Agent - New Runs Endpoints (Integration)', () => {
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

  // ── LIST ALL RUNS ──────────────────────────────────────────────────────────

  describe('GET /api/spreadsheet-agent/runs', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .get('/api/spreadsheet-agent/runs')
        .expect(401);
    });

    it('should return 200 for viewer (spreadsheet_agent:read)', async () => {
      const viewer = await createMockViewerUser(context);
      context.prismaMock.spreadsheetRun.findMany.mockResolvedValue([]);
      context.prismaMock.spreadsheetRun.count.mockResolvedValue(0);

      await request(context.app.getHttpServer())
        .get('/api/spreadsheet-agent/runs')
        .set(authHeader(viewer.accessToken))
        .expect(200);
    });

    it('should return 200 for contributor', async () => {
      const contributor = await createMockContributorUser(context);
      context.prismaMock.spreadsheetRun.findMany.mockResolvedValue([]);
      context.prismaMock.spreadsheetRun.count.mockResolvedValue(0);

      await request(context.app.getHttpServer())
        .get('/api/spreadsheet-agent/runs')
        .set(authHeader(contributor.accessToken))
        .expect(200);
    });

    it('should return 200 for admin', async () => {
      const admin = await createMockAdminUser(context);
      context.prismaMock.spreadsheetRun.findMany.mockResolvedValue([]);
      context.prismaMock.spreadsheetRun.count.mockResolvedValue(0);

      await request(context.app.getHttpServer())
        .get('/api/spreadsheet-agent/runs')
        .set(authHeader(admin.accessToken))
        .expect(200);
    });

    it('should return paginated runs with total, page, pageSize', async () => {
      const contributor = await createMockContributorUser(context);
      const projectId = randomUUID();
      const runs = [
        createMockRunWithProject({ projectId, status: 'completed', project: { id: projectId, name: 'Project A' } }),
        createMockRunWithProject({ status: 'failed' }),
      ];
      context.prismaMock.spreadsheetRun.findMany.mockResolvedValue(runs);
      context.prismaMock.spreadsheetRun.count.mockResolvedValue(2);

      const response = await request(context.app.getHttpServer())
        .get('/api/spreadsheet-agent/runs')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data.runs).toHaveLength(2);
      expect(response.body.data.total).toBe(2);
      expect(response.body.data.page).toBe(1);
      expect(response.body.data.pageSize).toBe(20);
    });

    it('should include project { id, name } on each run', async () => {
      const contributor = await createMockContributorUser(context);
      const projectId = randomUUID();
      const run = createMockRunWithProject({
        projectId,
        status: 'completed',
        project: { id: projectId, name: 'My Project' },
      });
      context.prismaMock.spreadsheetRun.findMany.mockResolvedValue([run]);
      context.prismaMock.spreadsheetRun.count.mockResolvedValue(1);

      const response = await request(context.app.getHttpServer())
        .get('/api/spreadsheet-agent/runs')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      const returnedRun = response.body.data.runs[0];
      expect(returnedRun.project).toBeDefined();
      expect(returnedRun.project.id).toBe(projectId);
      expect(returnedRun.project.name).toBe('My Project');
    });

    it('should filter by status when provided', async () => {
      const contributor = await createMockContributorUser(context);
      const run = createMockRunWithProject({ status: 'failed' });
      context.prismaMock.spreadsheetRun.findMany.mockResolvedValue([run]);
      context.prismaMock.spreadsheetRun.count.mockResolvedValue(1);

      const response = await request(context.app.getHttpServer())
        .get('/api/spreadsheet-agent/runs?status=failed')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data.runs).toHaveLength(1);
      expect(response.body.data.runs[0].status).toBe('failed');
      expect(context.prismaMock.spreadsheetRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'failed' }),
        }),
      );
    });

    it('should return empty list when no runs exist', async () => {
      const contributor = await createMockContributorUser(context);
      context.prismaMock.spreadsheetRun.findMany.mockResolvedValue([]);
      context.prismaMock.spreadsheetRun.count.mockResolvedValue(0);

      const response = await request(context.app.getHttpServer())
        .get('/api/spreadsheet-agent/runs')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data.runs).toEqual([]);
      expect(response.body.data.total).toBe(0);
    });

    it('should return tokensUsed as structured object extracted from stats', async () => {
      const contributor = await createMockContributorUser(context);
      const run = createMockRunWithProject({
        status: 'completed',
        stats: {
          tokensUsed: { prompt: 1500, completion: 800, total: 2300 },
        },
      });
      context.prismaMock.spreadsheetRun.findMany.mockResolvedValue([run]);
      context.prismaMock.spreadsheetRun.count.mockResolvedValue(1);

      const response = await request(context.app.getHttpServer())
        .get('/api/spreadsheet-agent/runs')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      const returnedRun = response.body.data.runs[0];
      expect(returnedRun.tokensUsed).toEqual({
        prompt: 1500,
        completion: 800,
        total: 2300,
      });
    });

    it('should return tokensUsed as zero object when stats is null', async () => {
      const contributor = await createMockContributorUser(context);
      const run = createMockRunWithProject({ status: 'failed', stats: null });
      context.prismaMock.spreadsheetRun.findMany.mockResolvedValue([run]);
      context.prismaMock.spreadsheetRun.count.mockResolvedValue(1);

      const response = await request(context.app.getHttpServer())
        .get('/api/spreadsheet-agent/runs')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data.runs[0].tokensUsed).toEqual({
        prompt: 0,
        completion: 0,
        total: 0,
      });
    });

    it('should accept page and pageSize query params', async () => {
      const contributor = await createMockContributorUser(context);
      context.prismaMock.spreadsheetRun.findMany.mockResolvedValue([]);
      context.prismaMock.spreadsheetRun.count.mockResolvedValue(0);

      const response = await request(context.app.getHttpServer())
        .get('/api/spreadsheet-agent/runs?page=2&pageSize=5')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data.page).toBe(2);
      expect(response.body.data.pageSize).toBe(5);
      expect(context.prismaMock.spreadsheetRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 5 }),
      );
    });
  });

  // ── LIST PROJECT RUNS ──────────────────────────────────────────────────────

  describe('GET /api/spreadsheet-agent/projects/:id/runs', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .get(`/api/spreadsheet-agent/projects/${randomUUID()}/runs`)
        .expect(401);
    });

    it('should return 200 for viewer (spreadsheet_agent:read)', async () => {
      const viewer = await createMockViewerUser(context);
      const projectId = randomUUID();
      const project = createMockProject({ id: projectId });
      context.prismaMock.spreadsheetProject.findUnique.mockResolvedValue(project);
      context.prismaMock.spreadsheetRun.findMany.mockResolvedValue([]);
      context.prismaMock.spreadsheetRun.count.mockResolvedValue(0);

      await request(context.app.getHttpServer())
        .get(`/api/spreadsheet-agent/projects/${projectId}/runs`)
        .set(authHeader(viewer.accessToken))
        .expect(200);
    });

    it('should return 404 when project does not exist', async () => {
      const contributor = await createMockContributorUser(context);
      context.prismaMock.spreadsheetProject.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .get(`/api/spreadsheet-agent/projects/${randomUUID()}/runs`)
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });

    it('should return 400 for invalid UUID format', async () => {
      const contributor = await createMockContributorUser(context);

      await request(context.app.getHttpServer())
        .get('/api/spreadsheet-agent/projects/not-a-uuid/runs')
        .set(authHeader(contributor.accessToken))
        .expect(400);
    });

    it('should return runs for a specific project', async () => {
      const contributor = await createMockContributorUser(context);
      const projectId = randomUUID();
      const project = createMockProject({ id: projectId });
      const runs = [
        createMockRun({ projectId, status: 'completed' }),
        createMockRun({ projectId, status: 'failed' }),
      ];

      context.prismaMock.spreadsheetProject.findUnique.mockResolvedValue(project);
      context.prismaMock.spreadsheetRun.findMany.mockResolvedValue(runs);
      context.prismaMock.spreadsheetRun.count.mockResolvedValue(2);

      const response = await request(context.app.getHttpServer())
        .get(`/api/spreadsheet-agent/projects/${projectId}/runs`)
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data.runs).toHaveLength(2);
      expect(response.body.data.total).toBe(2);
      expect(response.body.data.page).toBe(1);
      expect(response.body.data.pageSize).toBe(20);
    });

    it('should return empty list when project has no runs', async () => {
      const contributor = await createMockContributorUser(context);
      const projectId = randomUUID();
      const project = createMockProject({ id: projectId });

      context.prismaMock.spreadsheetProject.findUnique.mockResolvedValue(project);
      context.prismaMock.spreadsheetRun.findMany.mockResolvedValue([]);
      context.prismaMock.spreadsheetRun.count.mockResolvedValue(0);

      const response = await request(context.app.getHttpServer())
        .get(`/api/spreadsheet-agent/projects/${projectId}/runs`)
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data.runs).toEqual([]);
      expect(response.body.data.total).toBe(0);
    });

    it('should filter runs by status when provided', async () => {
      const contributor = await createMockContributorUser(context);
      const projectId = randomUUID();
      const project = createMockProject({ id: projectId });
      const run = createMockRun({ projectId, status: 'completed' });

      context.prismaMock.spreadsheetProject.findUnique.mockResolvedValue(project);
      context.prismaMock.spreadsheetRun.findMany.mockResolvedValue([run]);
      context.prismaMock.spreadsheetRun.count.mockResolvedValue(1);

      const response = await request(context.app.getHttpServer())
        .get(`/api/spreadsheet-agent/projects/${projectId}/runs?status=completed`)
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data.runs).toHaveLength(1);
      expect(response.body.data.runs[0].status).toBe('completed');
      expect(context.prismaMock.spreadsheetRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ projectId, status: 'completed' }),
        }),
      );
    });

    it('should accept page and pageSize query params', async () => {
      const contributor = await createMockContributorUser(context);
      const projectId = randomUUID();
      const project = createMockProject({ id: projectId });

      context.prismaMock.spreadsheetProject.findUnique.mockResolvedValue(project);
      context.prismaMock.spreadsheetRun.findMany.mockResolvedValue([]);
      context.prismaMock.spreadsheetRun.count.mockResolvedValue(0);

      const response = await request(context.app.getHttpServer())
        .get(`/api/spreadsheet-agent/projects/${projectId}/runs?page=2&pageSize=5`)
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data.page).toBe(2);
      expect(response.body.data.pageSize).toBe(5);
      expect(context.prismaMock.spreadsheetRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 5 }),
      );
    });

    it('should return tokensUsed as structured object from stats', async () => {
      const contributor = await createMockContributorUser(context);
      const projectId = randomUUID();
      const project = createMockProject({ id: projectId });
      const run = createMockRun({
        projectId,
        status: 'completed',
        stats: { tokensUsed: { prompt: 500, completion: 200, total: 700 } },
      });

      context.prismaMock.spreadsheetProject.findUnique.mockResolvedValue(project);
      context.prismaMock.spreadsheetRun.findMany.mockResolvedValue([run]);
      context.prismaMock.spreadsheetRun.count.mockResolvedValue(1);

      const response = await request(context.app.getHttpServer())
        .get(`/api/spreadsheet-agent/projects/${projectId}/runs`)
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data.runs[0].tokensUsed).toEqual({
        prompt: 500,
        completion: 200,
        total: 700,
      });
    });

    it('should return 200 for admin', async () => {
      const admin = await createMockAdminUser(context);
      const projectId = randomUUID();
      const project = createMockProject({ id: projectId });

      context.prismaMock.spreadsheetProject.findUnique.mockResolvedValue(project);
      context.prismaMock.spreadsheetRun.findMany.mockResolvedValue([]);
      context.prismaMock.spreadsheetRun.count.mockResolvedValue(0);

      await request(context.app.getHttpServer())
        .get(`/api/spreadsheet-agent/projects/${projectId}/runs`)
        .set(authHeader(admin.accessToken))
        .expect(200);
    });
  });

  // ── DELETE RUN ─────────────────────────────────────────────────────────────

  describe('DELETE /api/spreadsheet-agent/runs/:runId', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .delete(`/api/spreadsheet-agent/runs/${randomUUID()}`)
        .expect(401);
    });

    it('should return 403 for viewer (no spreadsheet_agent:delete)', async () => {
      const viewer = await createMockViewerUser(context);

      await request(context.app.getHttpServer())
        .delete(`/api/spreadsheet-agent/runs/${randomUUID()}`)
        .set(authHeader(viewer.accessToken))
        .expect(403);
    });

    it('should return 400 for invalid UUID format', async () => {
      const contributor = await createMockContributorUser(context);

      await request(context.app.getHttpServer())
        .delete('/api/spreadsheet-agent/runs/not-a-uuid')
        .set(authHeader(contributor.accessToken))
        .expect(400);
    });

    it('should return 404 for non-existent run', async () => {
      const contributor = await createMockContributorUser(context);
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .delete(`/api/spreadsheet-agent/runs/${randomUUID()}`)
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });

    it('should delete a failed run and return 204', async () => {
      const contributor = await createMockContributorUser(context);
      const run = createMockRun({ status: 'failed' });
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);
      context.prismaMock.spreadsheetRun.delete.mockResolvedValue(run);
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      await request(context.app.getHttpServer())
        .delete(`/api/spreadsheet-agent/runs/${run.id}`)
        .set(authHeader(contributor.accessToken))
        .expect(204);

      expect(context.prismaMock.spreadsheetRun.delete).toHaveBeenCalledWith({
        where: { id: run.id },
      });
    });

    it('should delete a cancelled run and return 204', async () => {
      const contributor = await createMockContributorUser(context);
      const run = createMockRun({ status: 'cancelled' });
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);
      context.prismaMock.spreadsheetRun.delete.mockResolvedValue(run);
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      await request(context.app.getHttpServer())
        .delete(`/api/spreadsheet-agent/runs/${run.id}`)
        .set(authHeader(contributor.accessToken))
        .expect(204);

      expect(context.prismaMock.spreadsheetRun.delete).toHaveBeenCalledWith({
        where: { id: run.id },
      });
    });

    it('should return 400 when deleting a completed run', async () => {
      const contributor = await createMockContributorUser(context);
      const run = createMockRun({ status: 'completed' });
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);

      await request(context.app.getHttpServer())
        .delete(`/api/spreadsheet-agent/runs/${run.id}`)
        .set(authHeader(contributor.accessToken))
        .expect(400);

      expect(context.prismaMock.spreadsheetRun.delete).not.toHaveBeenCalled();
    });

    it('should return 400 when deleting a pending run', async () => {
      const contributor = await createMockContributorUser(context);
      const run = createMockRun({ status: 'pending' });
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);

      await request(context.app.getHttpServer())
        .delete(`/api/spreadsheet-agent/runs/${run.id}`)
        .set(authHeader(contributor.accessToken))
        .expect(400);
    });

    it('should return 400 when deleting an ingesting run', async () => {
      const contributor = await createMockContributorUser(context);
      const run = createMockRun({ status: 'ingesting' });
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);

      await request(context.app.getHttpServer())
        .delete(`/api/spreadsheet-agent/runs/${run.id}`)
        .set(authHeader(contributor.accessToken))
        .expect(400);
    });

    it('should return 400 when deleting an analyzing run', async () => {
      const contributor = await createMockContributorUser(context);
      const run = createMockRun({ status: 'analyzing' });
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);

      await request(context.app.getHttpServer())
        .delete(`/api/spreadsheet-agent/runs/${run.id}`)
        .set(authHeader(contributor.accessToken))
        .expect(400);
    });

    it('should return 400 when deleting a review_pending run', async () => {
      const contributor = await createMockContributorUser(context);
      const run = createMockRun({ status: 'review_pending' });
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);

      await request(context.app.getHttpServer())
        .delete(`/api/spreadsheet-agent/runs/${run.id}`)
        .set(authHeader(contributor.accessToken))
        .expect(400);
    });

    it('should create an audit event on successful deletion', async () => {
      const admin = await createMockAdminUser(context);
      const run = createMockRun({ status: 'failed' });
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);
      context.prismaMock.spreadsheetRun.delete.mockResolvedValue(run);
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      await request(context.app.getHttpServer())
        .delete(`/api/spreadsheet-agent/runs/${run.id}`)
        .set(authHeader(admin.accessToken))
        .expect(204);

      expect(context.prismaMock.auditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'spreadsheet_run:delete',
            targetType: 'spreadsheet_run',
            targetId: run.id,
          }),
        }),
      );
    });

    it('should allow admin to delete a failed run', async () => {
      const admin = await createMockAdminUser(context);
      const run = createMockRun({ status: 'failed' });
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);
      context.prismaMock.spreadsheetRun.delete.mockResolvedValue(run);
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      await request(context.app.getHttpServer())
        .delete(`/api/spreadsheet-agent/runs/${run.id}`)
        .set(authHeader(admin.accessToken))
        .expect(204);
    });

    it('should allow admin to delete a cancelled run', async () => {
      const admin = await createMockAdminUser(context);
      const run = createMockRun({ status: 'cancelled' });
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);
      context.prismaMock.spreadsheetRun.delete.mockResolvedValue(run);
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      await request(context.app.getHttpServer())
        .delete(`/api/spreadsheet-agent/runs/${run.id}`)
        .set(authHeader(admin.accessToken))
        .expect(204);
    });

    it('should not call delete when run is not deletable', async () => {
      const admin = await createMockAdminUser(context);
      const run = createMockRun({ status: 'extracting' });
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);

      await request(context.app.getHttpServer())
        .delete(`/api/spreadsheet-agent/runs/${run.id}`)
        .set(authHeader(admin.accessToken))
        .expect(400);

      expect(context.prismaMock.spreadsheetRun.delete).not.toHaveBeenCalled();
    });
  });

  // ── mapRun tokensUsed extraction ────────────────────────────────────────────
  // These tests cover the mapRun behavior indirectly via GET /runs/:runId
  // since mapRun is a private method. The integration route exercises it.

  describe('mapRun tokensUsed extraction (via GET /api/spreadsheet-agent/runs/:runId)', () => {
    it('should return tokensUsed with prompt, completion, total from stats', async () => {
      const contributor = await createMockContributorUser(context);
      const run = createMockRun({
        status: 'completed',
        stats: {
          tokensUsed: { prompt: 2000, completion: 1000, total: 3000 },
          duration: 45000,
        },
      });
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);

      const response = await request(context.app.getHttpServer())
        .get(`/api/spreadsheet-agent/runs/${run.id}`)
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data.tokensUsed).toEqual({
        prompt: 2000,
        completion: 1000,
        total: 3000,
      });
    });

    it('should return { prompt:0, completion:0, total:0 } when stats is null', async () => {
      const contributor = await createMockContributorUser(context);
      const run = createMockRun({ status: 'failed', stats: null });
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);

      const response = await request(context.app.getHttpServer())
        .get(`/api/spreadsheet-agent/runs/${run.id}`)
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data.tokensUsed).toEqual({
        prompt: 0,
        completion: 0,
        total: 0,
      });
    });

    it('should return { prompt:0, completion:0, total:0 } when stats has no tokensUsed key', async () => {
      const contributor = await createMockContributorUser(context);
      const run = createMockRun({
        status: 'completed',
        stats: { duration: 5000, fileCount: 2 }, // no tokensUsed field
      });
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);

      const response = await request(context.app.getHttpServer())
        .get(`/api/spreadsheet-agent/runs/${run.id}`)
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data.tokensUsed).toEqual({
        prompt: 0,
        completion: 0,
        total: 0,
      });
    });

    it('should handle partial tokensUsed fields (missing completion)', async () => {
      const contributor = await createMockContributorUser(context);
      const run = createMockRun({
        status: 'completed',
        stats: {
          tokensUsed: { prompt: 100, total: 100 }, // missing completion
        },
      });
      context.prismaMock.spreadsheetRun.findUnique.mockResolvedValue(run);

      const response = await request(context.app.getHttpServer())
        .get(`/api/spreadsheet-agent/runs/${run.id}`)
        .set(authHeader(contributor.accessToken))
        .expect(200);

      // completion defaults to 0 when missing
      expect(response.body.data.tokensUsed).toEqual({
        prompt: 100,
        completion: 0,
        total: 100,
      });
    });
  });
});
