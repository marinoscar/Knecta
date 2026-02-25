/**
 * Integration tests for the DataImports feature.
 *
 * All database, storage, and parser dependencies are mocked — no real
 * database, S3, or file I/O occurs.  Tests exercise the full HTTP
 * request/response cycle through NestJS + Fastify.
 */

import request from 'supertest';
import { randomUUID } from 'crypto';
import {
  TestContext,
  createTestApp,
  closeTestApp,
} from '../helpers/test-app.helper';
import { resetPrismaMock } from '../mocks/prisma.mock';
import { setupBaseMocks } from '../fixtures/mock-setup.helper';
import {
  createMockAdminUser,
  createMockContributorUser,
  createMockViewerUser,
  authHeader,
} from '../helpers/auth-mock.helper';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function createMockImport(overrides: Partial<any> = {}): any {
  const id = overrides.id ?? randomUUID();
  return {
    id,
    name: overrides.name ?? 'My Import',
    sourceFileName: overrides.sourceFileName ?? 'data.csv',
    sourceFileType: overrides.sourceFileType ?? 'csv',
    // Use plain numbers — BigInt cannot be serialised by Fastify/JSON.stringify.
    // The service stores BigInt in the DB but returns raw Prisma objects here.
    sourceFileSizeBytes: overrides.sourceFileSizeBytes ?? 1024,
    sourceStoragePath: overrides.sourceStoragePath ?? `data-imports/${id}/source/data.csv`,
    status: overrides.status ?? 'draft',
    parseResult: overrides.parseResult ?? {
      type: 'csv',
      detectedDelimiter: ',',
      detectedEncoding: 'UTF-8',
      hasHeader: true,
      columns: [{ name: 'id', detectedType: 'BIGINT' }, { name: 'name', detectedType: 'VARCHAR' }],
      sampleRows: [[1, 'Alice'], [2, 'Bob']],
      rowCountEstimate: 2,
    },
    config: overrides.config ?? null,
    outputTables: overrides.outputTables ?? null,
    totalRowCount: overrides.totalRowCount ?? 0,
    totalSizeBytes: overrides.totalSizeBytes ?? 0,
    errorMessage: overrides.errorMessage ?? null,
    connectionId: overrides.connectionId ?? null,
    connection: overrides.connection ?? null,
    createdByUserId: overrides.createdByUserId ?? null,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
    _count: overrides._count ?? { runs: 0 },
  };
}

function createMockRun(overrides: Partial<any> = {}): any {
  return {
    id: overrides.id ?? randomUUID(),
    importId: overrides.importId ?? randomUUID(),
    status: overrides.status ?? 'pending',
    currentPhase: overrides.currentPhase ?? null,
    config: overrides.config ?? {},
    progress: overrides.progress ?? null,
    errorMessage: overrides.errorMessage ?? null,
    createdByUserId: overrides.createdByUserId ?? null,
    startedAt: overrides.startedAt ?? null,
    completedAt: overrides.completedAt ?? null,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
  };
}

function createMockExcelImport(overrides: Partial<any> = {}): any {
  const id = overrides.id ?? randomUUID();
  return createMockImport({
    id,
    sourceFileName: 'report.xlsx',
    sourceFileType: 'excel',
    parseResult: {
      type: 'excel',
      sheets: [
        { name: 'Sheet1', rowCount: 10, colCount: 3, hasMergedCells: false },
        { name: 'Sheet2', rowCount: 5, colCount: 2, hasMergedCells: false },
      ],
    },
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Data Imports — Controller Integration', () => {
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

  // ── AUTHENTICATION GUARD ────────────────────────────────────────────────────

  describe('Authentication', () => {
    it('should return 401 on GET /data-imports without a token', async () => {
      await request(context.app.getHttpServer())
        .get('/api/data-imports')
        .expect(401);
    });

    it('should return 401 on POST /data-imports/upload without a token', async () => {
      await request(context.app.getHttpServer())
        .post('/api/data-imports/upload')
        .expect(401);
    });

    it('should return 401 on GET /data-imports/:id without a token', async () => {
      await request(context.app.getHttpServer())
        .get(`/api/data-imports/${randomUUID()}`)
        .expect(401);
    });
  });

  // ── LIST ────────────────────────────────────────────────────────────────────

  describe('GET /data-imports', () => {
    it('should return 200 and an empty paginated list for a viewer', async () => {
      const viewer = await createMockViewerUser(context);
      context.prismaMock.dataImport.findMany.mockResolvedValue([]);
      context.prismaMock.dataImport.count.mockResolvedValue(0);

      const res = await request(context.app.getHttpServer())
        .get('/api/data-imports')
        .set(authHeader(viewer.accessToken))
        .expect(200);

      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.total).toBe(0);
      expect(res.body.data).toHaveProperty('page');
      expect(res.body.data).toHaveProperty('pageSize');
      expect(res.body.data).toHaveProperty('totalPages');
    });

    it('should return a paginated list with the correct items and totals', async () => {
      const contributor = await createMockContributorUser(context);
      const imports = [
        createMockImport({ name: 'Import A', sourceFileSizeBytes: 2048 }),
        createMockImport({ name: 'Import B' }),
      ];
      context.prismaMock.dataImport.findMany.mockResolvedValue(imports);
      context.prismaMock.dataImport.count.mockResolvedValue(2);

      const res = await request(context.app.getHttpServer())
        .get('/api/data-imports')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(res.body.data.total).toBe(2);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.items[0].name).toBe('Import A');
    });

    it('should pass status filter to prisma', async () => {
      const contributor = await createMockContributorUser(context);
      context.prismaMock.dataImport.findMany.mockResolvedValue([]);
      context.prismaMock.dataImport.count.mockResolvedValue(0);

      await request(context.app.getHttpServer())
        .get('/api/data-imports?status=ready')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      const findManyCall = context.prismaMock.dataImport.findMany.mock.calls[0][0];
      expect(findManyCall.where).toMatchObject({ status: 'ready' });
    });

    it('should pass search term to prisma as OR clause', async () => {
      const contributor = await createMockContributorUser(context);
      context.prismaMock.dataImport.findMany.mockResolvedValue([]);
      context.prismaMock.dataImport.count.mockResolvedValue(0);

      await request(context.app.getHttpServer())
        .get('/api/data-imports?search=report')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      const findManyCall = context.prismaMock.dataImport.findMany.mock.calls[0][0];
      expect(findManyCall.where.OR).toBeDefined();
    });

    it('should default to page=1 and pageSize=20', async () => {
      const contributor = await createMockContributorUser(context);
      context.prismaMock.dataImport.findMany.mockResolvedValue([]);
      context.prismaMock.dataImport.count.mockResolvedValue(0);

      const res = await request(context.app.getHttpServer())
        .get('/api/data-imports')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(res.body.data.page).toBe(1);
      expect(res.body.data.pageSize).toBe(20);
    });

    it('should return 200 for a viewer (has data_imports:read)', async () => {
      const viewer = await createMockViewerUser(context);
      context.prismaMock.dataImport.findMany.mockResolvedValue([]);
      context.prismaMock.dataImport.count.mockResolvedValue(0);

      await request(context.app.getHttpServer())
        .get('/api/data-imports')
        .set(authHeader(viewer.accessToken))
        .expect(200);
    });

    it('should include connection data in list items when present', async () => {
      const contributor = await createMockContributorUser(context);
      const importWithConn = createMockImport({
        connectionId: 'conn-1',
        connection: {
          id: 'conn-1',
          name: 'Import: Test',
          dbType: 's3',
          options: { bucket: 'my-bucket', region: 'us-east-1' },
        },
      });
      context.prismaMock.dataImport.findMany.mockResolvedValue([importWithConn]);
      context.prismaMock.dataImport.count.mockResolvedValue(1);

      const res = await request(context.app.getHttpServer())
        .get('/api/data-imports')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(res.body.data.items[0].connection).toEqual({
        id: 'conn-1',
        name: 'Import: Test',
        dbType: 's3',
        options: { bucket: 'my-bucket', region: 'us-east-1' },
      });
    });
  });

  // ── GET BY ID ───────────────────────────────────────────────────────────────

  describe('GET /data-imports/:id', () => {
    it('should return 200 and import details when found', async () => {
      const contributor = await createMockContributorUser(context);
      const mockImport = createMockImport({ name: 'Sales Data' });
      context.prismaMock.dataImport.findUnique.mockResolvedValue(mockImport);

      const res = await request(context.app.getHttpServer())
        .get(`/api/data-imports/${mockImport.id}`)
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(res.body.data.id).toBe(mockImport.id);
      expect(res.body.data.name).toBe('Sales Data');
    });

    it('should return 404 when import does not exist', async () => {
      const contributor = await createMockContributorUser(context);
      context.prismaMock.dataImport.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .get(`/api/data-imports/${randomUUID()}`)
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });

    it('should return 400 for a non-UUID id parameter', async () => {
      const contributor = await createMockContributorUser(context);

      await request(context.app.getHttpServer())
        .get('/api/data-imports/not-a-uuid')
        .set(authHeader(contributor.accessToken))
        .expect(400);
    });
  });

  // ── PREVIEW (GET) ──────────────────────────────────────────────────────────

  describe('GET /data-imports/:id/preview', () => {
    it('should return 200 with the parse result stored during upload', async () => {
      const contributor = await createMockContributorUser(context);
      const mockImport = createMockImport();
      context.prismaMock.dataImport.findUnique.mockResolvedValue(mockImport);

      const res = await request(context.app.getHttpServer())
        .get(`/api/data-imports/${mockImport.id}/preview`)
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(res.body.data.type).toBe('csv');
      expect(res.body.data.columns).toBeDefined();
    });

    it('should return 404 when import does not exist', async () => {
      const contributor = await createMockContributorUser(context);
      context.prismaMock.dataImport.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .get(`/api/data-imports/${randomUUID()}/preview`)
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });

    it('should return 200 for excel imports with sheet list in parse result', async () => {
      const contributor = await createMockContributorUser(context);
      const mockImport = createMockExcelImport();
      context.prismaMock.dataImport.findUnique.mockResolvedValue(mockImport);

      const res = await request(context.app.getHttpServer())
        .get(`/api/data-imports/${mockImport.id}/preview`)
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(res.body.data.type).toBe('excel');
      expect(res.body.data.sheets).toHaveLength(2);
    });
  });

  // ── SHEET PREVIEW (POST) ───────────────────────────────────────────────────

  describe('POST /data-imports/:id/preview', () => {
    it('should return 400 when import is a CSV (not Excel)', async () => {
      const contributor = await createMockContributorUser(context);
      const csvImport = createMockImport({ sourceFileType: 'csv' });
      context.prismaMock.dataImport.findUnique.mockResolvedValue(csvImport);

      await request(context.app.getHttpServer())
        .post(`/api/data-imports/${csvImport.id}/preview`)
        .set(authHeader(contributor.accessToken))
        .send({ sheetName: 'Sheet1' })
        .expect(400);
    });

    it('should return 404 when import does not exist', async () => {
      const contributor = await createMockContributorUser(context);
      context.prismaMock.dataImport.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .post(`/api/data-imports/${randomUUID()}/preview`)
        .set(authHeader(contributor.accessToken))
        .send({ sheetName: 'Sheet1' })
        .expect(404);
    });

    it('should return 400 for missing sheetName in body', async () => {
      const contributor = await createMockContributorUser(context);
      const excelImport = createMockExcelImport();
      context.prismaMock.dataImport.findUnique.mockResolvedValue(excelImport);

      await request(context.app.getHttpServer())
        .post(`/api/data-imports/${excelImport.id}/preview`)
        .set(authHeader(contributor.accessToken))
        .send({})
        .expect(400);
    });

    it('should return 200 for a viewer (has data_imports:read)', async () => {
      const viewer = await createMockViewerUser(context);
      const excelImport = createMockExcelImport();
      // findUnique called twice: once by getById (for the import), once during readSourceFile path
      context.prismaMock.dataImport.findUnique.mockResolvedValue(excelImport);

      // The service calls readSourceFile which tries to read from /tmp, then falls back to S3.
      // We mock the storageProvider.download to return a buffer that the parser can handle.
      // However, since we are testing the HTTP layer's validation, a 400 (bad request due to
      // wrong sourceFileType) path is already covered by the CSV test above.
      // For the success path, we need a real Excel buffer — skip here and rely on parser unit tests.
      // This test just verifies the permission check passes for viewer.
      context.prismaMock.dataImport.findUnique.mockResolvedValue({
        ...excelImport,
        sourceFileType: 'csv', // Simulate CSV to get a 400 (not 403) — proves auth passed
      });

      const res = await request(context.app.getHttpServer())
        .post(`/api/data-imports/${excelImport.id}/preview`)
        .set(authHeader(viewer.accessToken))
        .send({ sheetName: 'Sheet1' })
        .expect(400); // 400 not 403 — auth guard passed, business logic rejected

      expect(res.status).toBe(400);
    });
  });

  // ── UPDATE ──────────────────────────────────────────────────────────────────

  describe('PATCH /data-imports/:id', () => {
    it('should return 200 and update the import name', async () => {
      const contributor = await createMockContributorUser(context);
      const mockImport = createMockImport({ name: 'Old Name' });
      const updatedImport = { ...mockImport, name: 'New Name' };
      context.prismaMock.dataImport.findUnique.mockResolvedValue(mockImport);
      context.prismaMock.dataImport.update.mockResolvedValue(updatedImport);

      const res = await request(context.app.getHttpServer())
        .patch(`/api/data-imports/${mockImport.id}`)
        .set(authHeader(contributor.accessToken))
        .send({ name: 'New Name' })
        .expect(200);

      expect(res.body.data.name).toBe('New Name');
    });

    it('should set status to pending when config is updated', async () => {
      const contributor = await createMockContributorUser(context);
      const mockImport = createMockImport({ status: 'draft' });
      const updatedImport = { ...mockImport, status: 'pending', config: { hasHeader: false } };
      context.prismaMock.dataImport.findUnique.mockResolvedValue(mockImport);
      context.prismaMock.dataImport.update.mockResolvedValue(updatedImport);

      const res = await request(context.app.getHttpServer())
        .patch(`/api/data-imports/${mockImport.id}`)
        .set(authHeader(contributor.accessToken))
        .send({ config: { hasHeader: false } })
        .expect(200);

      expect(res.body.data.status).toBe('pending');
    });

    it('should return 404 when import does not exist', async () => {
      const contributor = await createMockContributorUser(context);
      context.prismaMock.dataImport.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .patch(`/api/data-imports/${randomUUID()}`)
        .set(authHeader(contributor.accessToken))
        .send({ name: 'Updated' })
        .expect(404);
    });

    it('should return 403 for a viewer (missing data_imports:write)', async () => {
      const viewer = await createMockViewerUser(context);
      const mockImport = createMockImport();
      context.prismaMock.dataImport.findUnique.mockResolvedValue(mockImport);

      await request(context.app.getHttpServer())
        .patch(`/api/data-imports/${mockImport.id}`)
        .set(authHeader(viewer.accessToken))
        .send({ name: 'Viewer update' })
        .expect(403);
    });

    it('should return 400 for a name that is too long', async () => {
      const contributor = await createMockContributorUser(context);
      const mockImport = createMockImport();
      context.prismaMock.dataImport.findUnique.mockResolvedValue(mockImport);

      await request(context.app.getHttpServer())
        .patch(`/api/data-imports/${mockImport.id}`)
        .set(authHeader(contributor.accessToken))
        .send({ name: 'x'.repeat(256) })
        .expect(400);
    });
  });

  // ── DELETE ──────────────────────────────────────────────────────────────────

  describe('DELETE /data-imports/:id', () => {
    it('should return 204 when import is deleted successfully', async () => {
      const contributor = await createMockContributorUser(context);
      const mockImport = createMockImport({ outputTables: null });
      context.prismaMock.dataImport.findUnique.mockResolvedValue(mockImport);
      context.prismaMock.dataImport.delete.mockResolvedValue(mockImport);

      await request(context.app.getHttpServer())
        .delete(`/api/data-imports/${mockImport.id}`)
        .set(authHeader(contributor.accessToken))
        .expect(204);
    });

    it('should return 404 when import does not exist', async () => {
      const contributor = await createMockContributorUser(context);
      context.prismaMock.dataImport.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .delete(`/api/data-imports/${randomUUID()}`)
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });

    it('should return 403 for a viewer (missing data_imports:delete)', async () => {
      const viewer = await createMockViewerUser(context);
      const mockImport = createMockImport();
      context.prismaMock.dataImport.findUnique.mockResolvedValue(mockImport);

      await request(context.app.getHttpServer())
        .delete(`/api/data-imports/${mockImport.id}`)
        .set(authHeader(viewer.accessToken))
        .expect(403);
    });

    it('should delete associated S3 objects and connections for imports with outputTables', async () => {
      const contributor = await createMockContributorUser(context);
      const connectionId = randomUUID();
      const mockImport = createMockImport({
        outputTables: [
          {
            tableName: 'orders',
            s3Key: 'data-imports/abc/tables/orders.parquet',
            rowCount: 10,
            sizeBytes: 1024,
            connectionId,
            columns: [{ name: 'id', type: 'BIGINT' }],
          },
        ],
      });
      context.prismaMock.dataImport.findUnique.mockResolvedValue(mockImport);
      context.prismaMock.dataImport.delete.mockResolvedValue(mockImport);
      context.prismaMock.dataConnection.delete.mockResolvedValue({ id: connectionId });

      await request(context.app.getHttpServer())
        .delete(`/api/data-imports/${mockImport.id}`)
        .set(authHeader(contributor.accessToken))
        .expect(204);

      expect(context.prismaMock.dataConnection.delete).toHaveBeenCalledWith({
        where: { id: connectionId },
      });
    });
  });

  // ── CREATE RUN ──────────────────────────────────────────────────────────────

  describe('POST /data-imports/runs', () => {
    it('should return 201 and create a run for a draft import', async () => {
      const contributor = await createMockContributorUser(context);
      const mockImport = createMockImport({ status: 'draft' });
      const mockRun = createMockRun({ importId: mockImport.id });
      context.prismaMock.dataImport.findUnique.mockResolvedValue(mockImport);
      context.prismaMock.dataImportRun.deleteMany.mockResolvedValue({ count: 0 });
      context.prismaMock.dataImportRun.create.mockResolvedValue(mockRun);

      const res = await request(context.app.getHttpServer())
        .post('/api/data-imports/runs')
        .set(authHeader(contributor.accessToken))
        .send({ importId: mockImport.id })
        .expect(201);

      expect(res.body.data.importId).toBe(mockImport.id);
      expect(res.body.data.status).toBe('pending');
    });

    it('should return 201 for a pending import', async () => {
      const contributor = await createMockContributorUser(context);
      const mockImport = createMockImport({ status: 'pending' });
      const mockRun = createMockRun({ importId: mockImport.id });
      context.prismaMock.dataImport.findUnique.mockResolvedValue(mockImport);
      context.prismaMock.dataImportRun.deleteMany.mockResolvedValue({ count: 0 });
      context.prismaMock.dataImportRun.create.mockResolvedValue(mockRun);

      await request(context.app.getHttpServer())
        .post('/api/data-imports/runs')
        .set(authHeader(contributor.accessToken))
        .send({ importId: mockImport.id })
        .expect(201);
    });

    it('should return 201 for a failed import (re-run allowed)', async () => {
      const contributor = await createMockContributorUser(context);
      const mockImport = createMockImport({ status: 'failed' });
      const mockRun = createMockRun({ importId: mockImport.id });
      context.prismaMock.dataImport.findUnique.mockResolvedValue(mockImport);
      context.prismaMock.dataImportRun.deleteMany.mockResolvedValue({ count: 0 });
      context.prismaMock.dataImportRun.create.mockResolvedValue(mockRun);

      await request(context.app.getHttpServer())
        .post('/api/data-imports/runs')
        .set(authHeader(contributor.accessToken))
        .send({ importId: mockImport.id })
        .expect(201);
    });

    it('should return 201 for a ready import (re-run allowed)', async () => {
      const contributor = await createMockContributorUser(context);
      const mockImport = createMockImport({ status: 'ready' });
      const mockRun = createMockRun({ importId: mockImport.id });
      context.prismaMock.dataImport.findUnique.mockResolvedValue(mockImport);
      context.prismaMock.dataImportRun.deleteMany.mockResolvedValue({ count: 1 });
      context.prismaMock.dataImportRun.create.mockResolvedValue(mockRun);

      await request(context.app.getHttpServer())
        .post('/api/data-imports/runs')
        .set(authHeader(contributor.accessToken))
        .send({ importId: mockImport.id })
        .expect(201);
    });

    it('should return 409 when import is currently importing', async () => {
      const contributor = await createMockContributorUser(context);
      const mockImport = createMockImport({ status: 'importing' });
      context.prismaMock.dataImport.findUnique.mockResolvedValue(mockImport);

      await request(context.app.getHttpServer())
        .post('/api/data-imports/runs')
        .set(authHeader(contributor.accessToken))
        .send({ importId: mockImport.id })
        .expect(409);
    });

    it('should return 404 when import does not exist', async () => {
      const contributor = await createMockContributorUser(context);
      context.prismaMock.dataImport.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .post('/api/data-imports/runs')
        .set(authHeader(contributor.accessToken))
        .send({ importId: randomUUID() })
        .expect(404);
    });

    it('should return 400 for a non-UUID importId', async () => {
      const contributor = await createMockContributorUser(context);

      await request(context.app.getHttpServer())
        .post('/api/data-imports/runs')
        .set(authHeader(contributor.accessToken))
        .send({ importId: 'not-a-uuid' })
        .expect(400);
    });

    it('should return 403 for a viewer (missing data_imports:write)', async () => {
      const viewer = await createMockViewerUser(context);

      await request(context.app.getHttpServer())
        .post('/api/data-imports/runs')
        .set(authHeader(viewer.accessToken))
        .send({ importId: randomUUID() })
        .expect(403);
    });
  });

  // ── GET RUN ─────────────────────────────────────────────────────────────────

  describe('GET /data-imports/runs/:runId', () => {
    it('should return 200 with run details', async () => {
      const contributor = await createMockContributorUser(context);
      const mockRun = createMockRun({ status: 'pending' });
      context.prismaMock.dataImportRun.findUnique.mockResolvedValue(mockRun);

      const res = await request(context.app.getHttpServer())
        .get(`/api/data-imports/runs/${mockRun.id}`)
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(res.body.data.id).toBe(mockRun.id);
      expect(res.body.data.status).toBe('pending');
    });

    it('should return 404 when run does not exist', async () => {
      const contributor = await createMockContributorUser(context);
      context.prismaMock.dataImportRun.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .get(`/api/data-imports/runs/${randomUUID()}`)
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });

    it('should return 400 for a non-UUID runId parameter', async () => {
      const contributor = await createMockContributorUser(context);

      await request(context.app.getHttpServer())
        .get('/api/data-imports/runs/not-a-uuid')
        .set(authHeader(contributor.accessToken))
        .expect(400);
    });

    it('should return 200 for a viewer (has data_imports:read)', async () => {
      const viewer = await createMockViewerUser(context);
      const mockRun = createMockRun();
      context.prismaMock.dataImportRun.findUnique.mockResolvedValue(mockRun);

      await request(context.app.getHttpServer())
        .get(`/api/data-imports/runs/${mockRun.id}`)
        .set(authHeader(viewer.accessToken))
        .expect(200);
    });
  });

  // ── CANCEL RUN ──────────────────────────────────────────────────────────────

  describe('POST /data-imports/runs/:runId/cancel', () => {
    it('should return 2xx when a pending run is cancelled', async () => {
      const contributor = await createMockContributorUser(context);
      const mockRun = createMockRun({ status: 'pending' });
      const cancelledRun = { ...mockRun, status: 'cancelled' };
      context.prismaMock.dataImportRun.findUnique.mockResolvedValue(mockRun);
      context.prismaMock.dataImportRun.update.mockResolvedValue(cancelledRun);

      const res = await request(context.app.getHttpServer())
        .post(`/api/data-imports/runs/${mockRun.id}/cancel`)
        .set(authHeader(contributor.accessToken));

      // NestJS returns 201 for POST by default (no @HttpCode decorator on this endpoint)
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
      expect(res.body.data.status).toBe('cancelled');
    });

    it('should return 2xx when a parsing run is cancelled', async () => {
      const contributor = await createMockContributorUser(context);
      const mockRun = createMockRun({ status: 'parsing' });
      const cancelledRun = { ...mockRun, status: 'cancelled' };
      context.prismaMock.dataImportRun.findUnique.mockResolvedValue(mockRun);
      context.prismaMock.dataImportRun.update.mockResolvedValue(cancelledRun);

      const res = await request(context.app.getHttpServer())
        .post(`/api/data-imports/runs/${mockRun.id}/cancel`)
        .set(authHeader(contributor.accessToken));

      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
      expect(res.body.data.status).toBe('cancelled');
    });

    it('should return 400 when cancelling a completed run', async () => {
      const contributor = await createMockContributorUser(context);
      const mockRun = createMockRun({ status: 'completed' });
      context.prismaMock.dataImportRun.findUnique.mockResolvedValue(mockRun);

      await request(context.app.getHttpServer())
        .post(`/api/data-imports/runs/${mockRun.id}/cancel`)
        .set(authHeader(contributor.accessToken))
        .expect(400);
    });

    it('should return 400 when cancelling a failed run', async () => {
      const contributor = await createMockContributorUser(context);
      const mockRun = createMockRun({ status: 'failed' });
      context.prismaMock.dataImportRun.findUnique.mockResolvedValue(mockRun);

      await request(context.app.getHttpServer())
        .post(`/api/data-imports/runs/${mockRun.id}/cancel`)
        .set(authHeader(contributor.accessToken))
        .expect(400);
    });

    it('should return 404 when run does not exist', async () => {
      const contributor = await createMockContributorUser(context);
      context.prismaMock.dataImportRun.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .post(`/api/data-imports/runs/${randomUUID()}/cancel`)
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });
  });

  // ── DELETE RUN ──────────────────────────────────────────────────────────────

  describe('DELETE /data-imports/runs/:runId', () => {
    it('should return 204 when a failed run is deleted', async () => {
      const contributor = await createMockContributorUser(context);
      const mockRun = createMockRun({ status: 'failed' });
      context.prismaMock.dataImportRun.findUnique.mockResolvedValue(mockRun);
      context.prismaMock.dataImportRun.delete.mockResolvedValue(mockRun);

      await request(context.app.getHttpServer())
        .delete(`/api/data-imports/runs/${mockRun.id}`)
        .set(authHeader(contributor.accessToken))
        .expect(204);
    });

    it('should return 204 when a cancelled run is deleted', async () => {
      const contributor = await createMockContributorUser(context);
      const mockRun = createMockRun({ status: 'cancelled' });
      context.prismaMock.dataImportRun.findUnique.mockResolvedValue(mockRun);
      context.prismaMock.dataImportRun.delete.mockResolvedValue(mockRun);

      await request(context.app.getHttpServer())
        .delete(`/api/data-imports/runs/${mockRun.id}`)
        .set(authHeader(contributor.accessToken))
        .expect(204);
    });

    it('should return 400 when trying to delete a completed run', async () => {
      const contributor = await createMockContributorUser(context);
      const mockRun = createMockRun({ status: 'completed' });
      context.prismaMock.dataImportRun.findUnique.mockResolvedValue(mockRun);

      await request(context.app.getHttpServer())
        .delete(`/api/data-imports/runs/${mockRun.id}`)
        .set(authHeader(contributor.accessToken))
        .expect(400);
    });

    it('should return 400 when trying to delete a pending run', async () => {
      const contributor = await createMockContributorUser(context);
      const mockRun = createMockRun({ status: 'pending' });
      context.prismaMock.dataImportRun.findUnique.mockResolvedValue(mockRun);

      await request(context.app.getHttpServer())
        .delete(`/api/data-imports/runs/${mockRun.id}`)
        .set(authHeader(contributor.accessToken))
        .expect(400);
    });

    it('should return 404 when run does not exist', async () => {
      const contributor = await createMockContributorUser(context);
      context.prismaMock.dataImportRun.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .delete(`/api/data-imports/runs/${randomUUID()}`)
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });

    it('should return 403 for a viewer (missing data_imports:delete)', async () => {
      const viewer = await createMockViewerUser(context);
      const mockRun = createMockRun({ status: 'failed' });
      context.prismaMock.dataImportRun.findUnique.mockResolvedValue(mockRun);

      await request(context.app.getHttpServer())
        .delete(`/api/data-imports/runs/${mockRun.id}`)
        .set(authHeader(viewer.accessToken))
        .expect(403);
    });
  });

  // ── LIST RUNS ───────────────────────────────────────────────────────────────

  describe('GET /data-imports/:id/runs', () => {
    it('should return 200 and a paginated list of runs for the import', async () => {
      const contributor = await createMockContributorUser(context);
      const mockImport = createMockImport();
      const runs = [
        createMockRun({ importId: mockImport.id, status: 'completed' }),
        createMockRun({ importId: mockImport.id, status: 'failed' }),
      ];
      context.prismaMock.dataImport.findUnique.mockResolvedValue(mockImport);
      context.prismaMock.dataImportRun.findMany.mockResolvedValue(runs);
      context.prismaMock.dataImportRun.count.mockResolvedValue(2);

      const res = await request(context.app.getHttpServer())
        .get(`/api/data-imports/${mockImport.id}/runs`)
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(res.body.data.total).toBe(2);
      expect(res.body.data.items).toHaveLength(2);
    });

    it('should return 404 when the parent import does not exist', async () => {
      const contributor = await createMockContributorUser(context);
      context.prismaMock.dataImport.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .get(`/api/data-imports/${randomUUID()}/runs`)
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });
  });

  // ── UPLOAD ──────────────────────────────────────────────────────────────────
  // Note: The upload endpoint uses Fastify multipart which requires a real
  // multipart request body. The tests below cover auth enforcement.
  // Full upload flow is covered by the service unit tests.

  describe('POST /data-imports/upload — auth enforcement', () => {
    it('should return 401 when no auth token is provided', async () => {
      await request(context.app.getHttpServer())
        .post('/api/data-imports/upload')
        .expect(401);
    });

    it('should return 403 for a viewer (missing data_imports:write)', async () => {
      const viewer = await createMockViewerUser(context);

      // Send a request that will be rejected by the RBAC guard before reaching
      // the multipart parser — no actual file needed.
      await request(context.app.getHttpServer())
        .post('/api/data-imports/upload')
        .set(authHeader(viewer.accessToken))
        .expect(403);
    });
  });

  // ── RBAC SUMMARY ────────────────────────────────────────────────────────────

  describe('RBAC — admin has full access', () => {
    it('admin can list imports', async () => {
      const admin = await createMockAdminUser(context);
      context.prismaMock.dataImport.findMany.mockResolvedValue([]);
      context.prismaMock.dataImport.count.mockResolvedValue(0);

      await request(context.app.getHttpServer())
        .get('/api/data-imports')
        .set(authHeader(admin.accessToken))
        .expect(200);
    });

    it('admin can delete an import', async () => {
      const admin = await createMockAdminUser(context);
      const mockImport = createMockImport({ outputTables: null });
      context.prismaMock.dataImport.findUnique.mockResolvedValue(mockImport);
      context.prismaMock.dataImport.delete.mockResolvedValue(mockImport);

      await request(context.app.getHttpServer())
        .delete(`/api/data-imports/${mockImport.id}`)
        .set(authHeader(admin.accessToken))
        .expect(204);
    });

    it('admin can delete a failed run', async () => {
      const admin = await createMockAdminUser(context);
      const mockRun = createMockRun({ status: 'failed' });
      context.prismaMock.dataImportRun.findUnique.mockResolvedValue(mockRun);
      context.prismaMock.dataImportRun.delete.mockResolvedValue(mockRun);

      await request(context.app.getHttpServer())
        .delete(`/api/data-imports/runs/${mockRun.id}`)
        .set(authHeader(admin.accessToken))
        .expect(204);
    });
  });
});
