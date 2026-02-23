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
    description: overrides.description ?? 'Test description',
    storageProvider: overrides.storageProvider ?? 's3',
    outputBucket: overrides.outputBucket ?? 'test-bucket',
    outputPrefix: overrides.outputPrefix ?? `spreadsheet-agent/${id}`,
    reviewMode: overrides.reviewMode ?? 'review',
    status: overrides.status ?? 'draft',
    fileCount: overrides.fileCount ?? 0,
    tableCount: overrides.tableCount ?? 0,
    totalRows: overrides.totalRows ?? BigInt(0),
    totalSizeBytes: overrides.totalSizeBytes ?? BigInt(0),
    createdByUserId: overrides.createdByUserId ?? null,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
  };
}

function createMockFile(overrides: Partial<any> = {}): any {
  return {
    id: overrides.id ?? randomUUID(),
    projectId: overrides.projectId ?? randomUUID(),
    storageObjectId: overrides.storageObjectId ?? null,
    fileName: overrides.fileName ?? 'test.xlsx',
    fileType: overrides.fileType ?? 'xlsx',
    fileSizeBytes: overrides.fileSizeBytes ?? BigInt(1024),
    fileHash: overrides.fileHash ?? 'abc123',
    storagePath: overrides.storagePath ?? 'spreadsheet-agent/test/test.xlsx',
    sheetCount: overrides.sheetCount ?? 1,
    status: overrides.status ?? 'pending',
    analysis: overrides.analysis ?? null,
    errorMessage: overrides.errorMessage ?? null,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
  };
}

function createMockTable(overrides: Partial<any> = {}): any {
  return {
    id: overrides.id ?? randomUUID(),
    projectId: overrides.projectId ?? randomUUID(),
    fileId: overrides.fileId ?? randomUUID(),
    sheetName: overrides.sheetName ?? 'Sheet1',
    tableName: overrides.tableName ?? 'test_table',
    description: overrides.description ?? null,
    columns: overrides.columns ?? [],
    rowCount: overrides.rowCount ?? BigInt(100),
    outputPath: overrides.outputPath ?? null,
    outputSizeBytes: overrides.outputSizeBytes ?? BigInt(2048),
    status: overrides.status ?? 'ready',
    errorMessage: overrides.errorMessage ?? null,
    extractionNotes: overrides.extractionNotes ?? null,
    // Included relation from listTables/getTable
    file: overrides.file ?? { fileName: 'test.xlsx' },
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Spreadsheet Agent - Projects (Integration)', () => {
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

  // ── LIST PROJECTS ──────────────────────────────────────────────────────────

  describe('GET /api/spreadsheet-agent/projects', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .get('/api/spreadsheet-agent/projects')
        .expect(401);
    });

    it('should return 200 for viewer (viewer has spreadsheet_agent:read)', async () => {
      const viewer = await createMockViewerUser(context);
      context.prismaMock.spreadsheetProject.findMany.mockResolvedValue([]);
      context.prismaMock.spreadsheetProject.count.mockResolvedValue(0);

      await request(context.app.getHttpServer())
        .get('/api/spreadsheet-agent/projects')
        .set(authHeader(viewer.accessToken))
        .expect(200);
    });

    it('should return empty list when no projects', async () => {
      const contributor = await createMockContributorUser(context);
      context.prismaMock.spreadsheetProject.findMany.mockResolvedValue([]);
      context.prismaMock.spreadsheetProject.count.mockResolvedValue(0);

      const response = await request(context.app.getHttpServer())
        .get('/api/spreadsheet-agent/projects')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data.items).toEqual([]);
      expect(response.body.data.total).toBe(0);
      expect(response.body.data).toHaveProperty('page');
      expect(response.body.data).toHaveProperty('pageSize');
      expect(response.body.data).toHaveProperty('totalPages');
    });

    it('should return paginated projects with BigInt fields as numbers', async () => {
      const contributor = await createMockContributorUser(context);
      const projects = [
        createMockProject({ name: 'Project 1', totalRows: BigInt(500), totalSizeBytes: BigInt(8192) }),
        createMockProject({ name: 'Project 2' }),
      ];

      context.prismaMock.spreadsheetProject.findMany.mockResolvedValue(projects);
      context.prismaMock.spreadsheetProject.count.mockResolvedValue(2);

      const response = await request(context.app.getHttpServer())
        .get('/api/spreadsheet-agent/projects')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data.items).toHaveLength(2);
      expect(response.body.data.total).toBe(2);
      expect(response.body.data.totalPages).toBe(1);
      // BigInt fields are serialised as numbers by mapProject()
      expect(typeof response.body.data.items[0].totalRows).toBe('number');
      expect(typeof response.body.data.items[0].totalSizeBytes).toBe('number');
      expect(response.body.data.items[0].totalRows).toBe(500);
    });

    it('should accept search, status, page, and pageSize query params', async () => {
      const contributor = await createMockContributorUser(context);
      context.prismaMock.spreadsheetProject.findMany.mockResolvedValue([]);
      context.prismaMock.spreadsheetProject.count.mockResolvedValue(0);

      const response = await request(context.app.getHttpServer())
        .get('/api/spreadsheet-agent/projects?search=sales&status=ready&page=1&pageSize=10')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data.page).toBe(1);
      expect(response.body.data.pageSize).toBe(10);
    });

    it('should return 200 for admin user', async () => {
      const admin = await createMockAdminUser(context);
      context.prismaMock.spreadsheetProject.findMany.mockResolvedValue([]);
      context.prismaMock.spreadsheetProject.count.mockResolvedValue(0);

      await request(context.app.getHttpServer())
        .get('/api/spreadsheet-agent/projects')
        .set(authHeader(admin.accessToken))
        .expect(200);
    });
  });

  // ── CREATE PROJECT ─────────────────────────────────────────────────────────

  describe('POST /api/spreadsheet-agent/projects', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .post('/api/spreadsheet-agent/projects')
        .send({ name: 'Test', storageProvider: 's3' })
        .expect(401);
    });

    it('should return 403 for viewer (no spreadsheet_agent:write)', async () => {
      const viewer = await createMockViewerUser(context);

      await request(context.app.getHttpServer())
        .post('/api/spreadsheet-agent/projects')
        .set(authHeader(viewer.accessToken))
        .send({ name: 'Test', storageProvider: 's3' })
        .expect(403);
    });

    it('should create a project for a contributor', async () => {
      const contributor = await createMockContributorUser(context);
      const projectId = randomUUID();
      const created = createMockProject({
        id: projectId,
        name: 'New Project',
        createdByUserId: contributor.id,
      });
      const updated = { ...created, outputPrefix: `spreadsheet-agent/${projectId}` };

      context.prismaMock.spreadsheetProject.create.mockResolvedValue(created);
      context.prismaMock.spreadsheetProject.update.mockResolvedValue(updated);
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      const response = await request(context.app.getHttpServer())
        .post('/api/spreadsheet-agent/projects')
        .set(authHeader(contributor.accessToken))
        .send({ name: 'New Project', storageProvider: 's3', reviewMode: 'review' })
        .expect(201);

      expect(response.body.data.name).toBe('New Project');
      expect(response.body.data.outputPrefix).toBe(`spreadsheet-agent/${projectId}`);
      expect(context.prismaMock.spreadsheetProject.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'New Project',
            createdByUserId: contributor.id,
          }),
        }),
      );
    });

    it('should create a project for admin', async () => {
      const admin = await createMockAdminUser(context);
      const projectId = randomUUID();
      const created = createMockProject({ id: projectId, name: 'Admin Project', createdByUserId: admin.id });
      const updated = { ...created, outputPrefix: `spreadsheet-agent/${projectId}` };

      context.prismaMock.spreadsheetProject.create.mockResolvedValue(created);
      context.prismaMock.spreadsheetProject.update.mockResolvedValue(updated);
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      await request(context.app.getHttpServer())
        .post('/api/spreadsheet-agent/projects')
        .set(authHeader(admin.accessToken))
        .send({ name: 'Admin Project', storageProvider: 's3' })
        .expect(201);
    });

    it('should return 400 when name is missing', async () => {
      const contributor = await createMockContributorUser(context);

      await request(context.app.getHttpServer())
        .post('/api/spreadsheet-agent/projects')
        .set(authHeader(contributor.accessToken))
        .send({ storageProvider: 's3' })
        .expect(400);
    });

    it('should return 400 when storageProvider is missing', async () => {
      const contributor = await createMockContributorUser(context);

      await request(context.app.getHttpServer())
        .post('/api/spreadsheet-agent/projects')
        .set(authHeader(contributor.accessToken))
        .send({ name: 'Test Project' })
        .expect(400);
    });

    it('should return 400 for invalid storageProvider value', async () => {
      const contributor = await createMockContributorUser(context);

      await request(context.app.getHttpServer())
        .post('/api/spreadsheet-agent/projects')
        .set(authHeader(contributor.accessToken))
        .send({ name: 'Test', storageProvider: 'gcs' })
        .expect(400);
    });
  });

  // ── GET PROJECT ────────────────────────────────────────────────────────────

  describe('GET /api/spreadsheet-agent/projects/:id', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .get(`/api/spreadsheet-agent/projects/${randomUUID()}`)
        .expect(401);
    });

    it('should return 404 for non-existent project', async () => {
      const contributor = await createMockContributorUser(context);
      context.prismaMock.spreadsheetProject.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .get(`/api/spreadsheet-agent/projects/${randomUUID()}`)
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });

    it('should return project by ID with BigInt fields as numbers', async () => {
      const contributor = await createMockContributorUser(context);
      const project = createMockProject({
        name: 'Found Project',
        totalRows: BigInt(1000),
        totalSizeBytes: BigInt(204800),
      });
      context.prismaMock.spreadsheetProject.findUnique.mockResolvedValue(project);

      const response = await request(context.app.getHttpServer())
        .get(`/api/spreadsheet-agent/projects/${project.id}`)
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data.name).toBe('Found Project');
      expect(response.body.data.id).toBe(project.id);
      expect(typeof response.body.data.totalRows).toBe('number');
      expect(response.body.data.totalRows).toBe(1000);
    });

    it('should return 400 for invalid UUID format', async () => {
      const contributor = await createMockContributorUser(context);

      await request(context.app.getHttpServer())
        .get('/api/spreadsheet-agent/projects/not-a-uuid')
        .set(authHeader(contributor.accessToken))
        .expect(400);
    });

    it('should return 200 for viewer accessing project', async () => {
      const viewer = await createMockViewerUser(context);
      const project = createMockProject({ name: 'Viewer Project' });
      context.prismaMock.spreadsheetProject.findUnique.mockResolvedValue(project);

      const response = await request(context.app.getHttpServer())
        .get(`/api/spreadsheet-agent/projects/${project.id}`)
        .set(authHeader(viewer.accessToken))
        .expect(200);

      expect(response.body.data.name).toBe('Viewer Project');
    });
  });

  // ── UPDATE PROJECT ─────────────────────────────────────────────────────────

  describe('PATCH /api/spreadsheet-agent/projects/:id', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .patch(`/api/spreadsheet-agent/projects/${randomUUID()}`)
        .send({ name: 'Updated' })
        .expect(401);
    });

    it('should return 403 for viewer (no spreadsheet_agent:write)', async () => {
      const viewer = await createMockViewerUser(context);

      await request(context.app.getHttpServer())
        .patch(`/api/spreadsheet-agent/projects/${randomUUID()}`)
        .set(authHeader(viewer.accessToken))
        .send({ name: 'Updated' })
        .expect(403);
    });

    it('should update project name for contributor', async () => {
      const contributor = await createMockContributorUser(context);
      const project = createMockProject({ createdByUserId: contributor.id });
      context.prismaMock.spreadsheetProject.findUnique.mockResolvedValue(project);
      context.prismaMock.spreadsheetProject.update.mockResolvedValue({
        ...project,
        name: 'Updated Name',
      });
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      const response = await request(context.app.getHttpServer())
        .patch(`/api/spreadsheet-agent/projects/${project.id}`)
        .set(authHeader(contributor.accessToken))
        .send({ name: 'Updated Name' })
        .expect(200);

      expect(response.body.data.name).toBe('Updated Name');
    });

    it('should return 404 for non-existent project', async () => {
      const contributor = await createMockContributorUser(context);
      context.prismaMock.spreadsheetProject.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .patch(`/api/spreadsheet-agent/projects/${randomUUID()}`)
        .set(authHeader(contributor.accessToken))
        .send({ name: 'Updated' })
        .expect(404);
    });

    it('should update description and reviewMode', async () => {
      const contributor = await createMockContributorUser(context);
      const project = createMockProject({ createdByUserId: contributor.id });
      context.prismaMock.spreadsheetProject.findUnique.mockResolvedValue(project);
      context.prismaMock.spreadsheetProject.update.mockResolvedValue({
        ...project,
        description: 'New description',
        reviewMode: 'auto',
      });
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      const response = await request(context.app.getHttpServer())
        .patch(`/api/spreadsheet-agent/projects/${project.id}`)
        .set(authHeader(contributor.accessToken))
        .send({ description: 'New description', reviewMode: 'auto' })
        .expect(200);

      expect(response.body.data.description).toBe('New description');
      expect(response.body.data.reviewMode).toBe('auto');
    });
  });

  // ── DELETE PROJECT ─────────────────────────────────────────────────────────

  describe('DELETE /api/spreadsheet-agent/projects/:id', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .delete(`/api/spreadsheet-agent/projects/${randomUUID()}`)
        .expect(401);
    });

    it('should return 403 for viewer (no spreadsheet_agent:delete)', async () => {
      const viewer = await createMockViewerUser(context);

      await request(context.app.getHttpServer())
        .delete(`/api/spreadsheet-agent/projects/${randomUUID()}`)
        .set(authHeader(viewer.accessToken))
        .expect(403);
    });

    it('should delete project and return 204', async () => {
      const admin = await createMockAdminUser(context);
      const project = createMockProject();
      context.prismaMock.spreadsheetProject.findUnique.mockResolvedValue(project);
      context.prismaMock.spreadsheetProject.delete.mockResolvedValue(project);
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      await request(context.app.getHttpServer())
        .delete(`/api/spreadsheet-agent/projects/${project.id}`)
        .set(authHeader(admin.accessToken))
        .expect(204);

      expect(context.prismaMock.spreadsheetProject.delete).toHaveBeenCalledWith({
        where: { id: project.id },
      });
    });

    it('should return 404 for non-existent project', async () => {
      const admin = await createMockAdminUser(context);
      context.prismaMock.spreadsheetProject.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .delete(`/api/spreadsheet-agent/projects/${randomUUID()}`)
        .set(authHeader(admin.accessToken))
        .expect(404);
    });

    it('should allow contributor to delete project', async () => {
      const contributor = await createMockContributorUser(context);
      const project = createMockProject({ createdByUserId: contributor.id });
      context.prismaMock.spreadsheetProject.findUnique.mockResolvedValue(project);
      context.prismaMock.spreadsheetProject.delete.mockResolvedValue(project);
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      await request(context.app.getHttpServer())
        .delete(`/api/spreadsheet-agent/projects/${project.id}`)
        .set(authHeader(contributor.accessToken))
        .expect(204);
    });
  });

  // ── LIST FILES ─────────────────────────────────────────────────────────────

  describe('GET /api/spreadsheet-agent/projects/:id/files', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .get(`/api/spreadsheet-agent/projects/${randomUUID()}/files`)
        .expect(401);
    });

    it('should return 404 when project does not exist', async () => {
      const contributor = await createMockContributorUser(context);
      context.prismaMock.spreadsheetProject.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .get(`/api/spreadsheet-agent/projects/${randomUUID()}/files`)
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });

    it('should return files for a project with BigInt as numbers', async () => {
      const contributor = await createMockContributorUser(context);
      const projectId = randomUUID();
      const project = createMockProject({ id: projectId });
      const files = [
        createMockFile({ projectId, fileName: 'data.xlsx', fileSizeBytes: BigInt(2048) }),
        createMockFile({ projectId, fileName: 'sales.csv', fileSizeBytes: BigInt(512) }),
      ];

      context.prismaMock.spreadsheetProject.findUnique.mockResolvedValue(project);
      context.prismaMock.spreadsheetFile.findMany.mockResolvedValue(files);

      const response = await request(context.app.getHttpServer())
        .get(`/api/spreadsheet-agent/projects/${projectId}/files`)
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data.items).toHaveLength(2);
      expect(response.body.data.total).toBe(2);
      // BigInt fileSizeBytes serialised as number
      expect(typeof response.body.data.items[0].fileSizeBytes).toBe('number');
      expect(response.body.data.items[0].fileSizeBytes).toBe(2048);
    });

    it('should return empty list when project has no files', async () => {
      const contributor = await createMockContributorUser(context);
      const projectId = randomUUID();
      const project = createMockProject({ id: projectId });

      context.prismaMock.spreadsheetProject.findUnique.mockResolvedValue(project);
      context.prismaMock.spreadsheetFile.findMany.mockResolvedValue([]);

      const response = await request(context.app.getHttpServer())
        .get(`/api/spreadsheet-agent/projects/${projectId}/files`)
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data.items).toEqual([]);
      expect(response.body.data.total).toBe(0);
    });
  });

  // ── DELETE FILE ────────────────────────────────────────────────────────────

  describe('DELETE /api/spreadsheet-agent/projects/:id/files/:fileId', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .delete(`/api/spreadsheet-agent/projects/${randomUUID()}/files/${randomUUID()}`)
        .expect(401);
    });

    it('should return 403 for viewer (no spreadsheet_agent:delete)', async () => {
      const viewer = await createMockViewerUser(context);

      await request(context.app.getHttpServer())
        .delete(`/api/spreadsheet-agent/projects/${randomUUID()}/files/${randomUUID()}`)
        .set(authHeader(viewer.accessToken))
        .expect(403);
    });

    it('should return 404 when file does not exist', async () => {
      const contributor = await createMockContributorUser(context);
      const projectId = randomUUID();
      context.prismaMock.spreadsheetFile.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .delete(`/api/spreadsheet-agent/projects/${projectId}/files/${randomUUID()}`)
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });

    it('should return 404 when file belongs to different project', async () => {
      const contributor = await createMockContributorUser(context);
      const projectId = randomUUID();
      const file = createMockFile({ projectId: randomUUID() }); // different project

      context.prismaMock.spreadsheetFile.findUnique.mockResolvedValue(file);

      await request(context.app.getHttpServer())
        .delete(`/api/spreadsheet-agent/projects/${projectId}/files/${file.id}`)
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });

    it('should return 409 when an active run exists', async () => {
      const contributor = await createMockContributorUser(context);
      const projectId = randomUUID();
      const fileId = randomUUID();
      const file = createMockFile({ id: fileId, projectId });

      context.prismaMock.spreadsheetFile.findUnique.mockResolvedValue(file);
      context.prismaMock.spreadsheetRun.findFirst.mockResolvedValue({ id: randomUUID() });

      await request(context.app.getHttpServer())
        .delete(`/api/spreadsheet-agent/projects/${projectId}/files/${fileId}`)
        .set(authHeader(contributor.accessToken))
        .expect(409);
    });

    it('should delete file and return 204 when no active run', async () => {
      const contributor = await createMockContributorUser(context);
      const projectId = randomUUID();
      const fileId = randomUUID();
      const file = createMockFile({ id: fileId, projectId });

      context.prismaMock.spreadsheetFile.findUnique.mockResolvedValue(file);
      context.prismaMock.spreadsheetRun.findFirst.mockResolvedValue(null);
      context.prismaMock.spreadsheetFile.delete.mockResolvedValue(file);
      context.prismaMock.spreadsheetProject.update.mockResolvedValue({} as any);
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      await request(context.app.getHttpServer())
        .delete(`/api/spreadsheet-agent/projects/${projectId}/files/${fileId}`)
        .set(authHeader(contributor.accessToken))
        .expect(204);
    });
  });

  // ── LIST TABLES ────────────────────────────────────────────────────────────

  describe('GET /api/spreadsheet-agent/projects/:id/tables', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .get(`/api/spreadsheet-agent/projects/${randomUUID()}/tables`)
        .expect(401);
    });

    it('should return 404 when project does not exist', async () => {
      const contributor = await createMockContributorUser(context);
      context.prismaMock.spreadsheetProject.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .get(`/api/spreadsheet-agent/projects/${randomUUID()}/tables`)
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });

    it('should return paginated tables with BigInt fields as numbers', async () => {
      const contributor = await createMockContributorUser(context);
      const projectId = randomUUID();
      const project = createMockProject({ id: projectId });
      const tables = [
        createMockTable({ projectId, tableName: 'orders', rowCount: BigInt(250), outputSizeBytes: BigInt(4096) }),
        createMockTable({ projectId, tableName: 'products', rowCount: BigInt(100) }),
      ];

      context.prismaMock.spreadsheetProject.findUnique.mockResolvedValue(project);
      context.prismaMock.spreadsheetTable.findMany.mockResolvedValue(tables);
      context.prismaMock.spreadsheetTable.count.mockResolvedValue(2);

      const response = await request(context.app.getHttpServer())
        .get(`/api/spreadsheet-agent/projects/${projectId}/tables`)
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data.items).toHaveLength(2);
      expect(response.body.data.total).toBe(2);
      expect(response.body.data).toHaveProperty('page');
      expect(response.body.data).toHaveProperty('pageSize');
      expect(response.body.data).toHaveProperty('totalPages');
      // BigInt fields serialised as numbers
      expect(typeof response.body.data.items[0].rowCount).toBe('number');
      expect(typeof response.body.data.items[0].outputSizeBytes).toBe('number');
      expect(response.body.data.items[0].rowCount).toBe(250);
    });

    it('should accept fileId and status filter params', async () => {
      const contributor = await createMockContributorUser(context);
      const projectId = randomUUID();
      const fileId = randomUUID();
      const project = createMockProject({ id: projectId });

      context.prismaMock.spreadsheetProject.findUnique.mockResolvedValue(project);
      context.prismaMock.spreadsheetTable.findMany.mockResolvedValue([]);
      context.prismaMock.spreadsheetTable.count.mockResolvedValue(0);

      await request(context.app.getHttpServer())
        .get(`/api/spreadsheet-agent/projects/${projectId}/tables?fileId=${fileId}&status=ready`)
        .set(authHeader(contributor.accessToken))
        .expect(200);
    });

    it('should return 200 for viewer', async () => {
      const viewer = await createMockViewerUser(context);
      const projectId = randomUUID();
      const project = createMockProject({ id: projectId });

      context.prismaMock.spreadsheetProject.findUnique.mockResolvedValue(project);
      context.prismaMock.spreadsheetTable.findMany.mockResolvedValue([]);
      context.prismaMock.spreadsheetTable.count.mockResolvedValue(0);

      await request(context.app.getHttpServer())
        .get(`/api/spreadsheet-agent/projects/${projectId}/tables`)
        .set(authHeader(viewer.accessToken))
        .expect(200);
    });
  });
});
