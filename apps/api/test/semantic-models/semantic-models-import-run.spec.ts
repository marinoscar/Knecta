/**
 * Tests for import-based semantic model run creation validation.
 *
 * These tests cover the dataImportId validation path in
 * SemanticModelsService.createRun(). When a caller provides a dataImportId
 * the service must verify:
 *   1. The data import exists.
 *   2. The import is in 'ready' status.
 *   3. The import's connectionId matches the provided connectionId.
 *
 * All Prisma dependencies are mocked — no real database calls occur.
 */

import request from 'supertest';
import { randomBytes, randomUUID } from 'crypto';
import {
  TestContext,
  createTestApp,
  closeTestApp,
} from '../helpers/test-app.helper';
import { resetPrismaMock } from '../mocks/prisma.mock';
import { setupBaseMocks } from '../fixtures/mock-setup.helper';
import {
  createMockContributorUser,
  authHeader,
} from '../helpers/auth-mock.helper';
import {
  createMockConnection,
  createMockSemanticModelRun,
} from '../fixtures/test-data.factory';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function createMockDataImport(overrides: Partial<any> = {}): any {
  const id = overrides.id ?? randomUUID();
  return {
    id,
    name: overrides.name ?? 'Test Import',
    sourceFileName: overrides.sourceFileName ?? 'data.csv',
    sourceFileType: overrides.sourceFileType ?? 'csv',
    sourceFileSizeBytes: 1024,
    sourceStoragePath: `data-imports/${id}/source/data.csv`,
    status: overrides.status ?? 'ready',
    parseResult: { type: 'csv' },
    config: null,
    outputTables: overrides.outputTables ?? [
      {
        tableName: 'orders',
        s3Key: `data-imports/${id}/tables/orders.parquet`,
        rowCount: 10,
        sizeBytes: 512,
        connectionId: overrides.connectionId ?? null,
        columns: [{ name: 'id', type: 'BIGINT' }],
      },
    ],
    totalRowCount: 10,
    totalSizeBytes: 512,
    connectionId: overrides.connectionId ?? null,
    errorMessage: null,
    createdByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { runs: 0 },
    connection: null,
  };
}

// Standard valid body for creating a semantic model run
function validRunBody(connectionId: string, overrides: Partial<any> = {}) {
  return {
    connectionId,
    databaseName: 'importdb',
    selectedSchemas: ['main'],
    selectedTables: ['main.orders'],
    name: 'Import Semantic Model',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Semantic Models — Import-Based Run Validation', () => {
  let context: TestContext;

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
    context = await createTestApp({ useMockDatabase: true });
  });

  afterAll(async () => {
    await closeTestApp(context);
  });

  beforeEach(() => {
    resetPrismaMock();
    setupBaseMocks();
  });

  // ── Success path with dataImportId ──────────────────────────────────────

  describe('createRun() with valid dataImportId', () => {
    it('should return 201 when dataImportId points to a ready import with matching connectionId', async () => {
      const contributor = await createMockContributorUser(context);
      const connectionId = randomUUID();
      const dataImportId = randomUUID();

      const mockConnection = createMockConnection({
        id: connectionId,
        name: 'Import Connection',
        dbType: 'postgresql',
        createdByUserId: contributor.id,
      });

      const mockImport = createMockDataImport({
        id: dataImportId,
        status: 'ready',
        connectionId,
      });

      const mockRun = createMockSemanticModelRun({
        connectionId,
        databaseName: 'importdb',
        selectedSchemas: ['main'],
        selectedTables: ['main.orders'],
        name: 'Import Semantic Model',
        status: 'pending',
        createdByUserId: contributor.id,
      });

      context.prismaMock.dataConnection.findUnique.mockResolvedValue(mockConnection);
      context.prismaMock.dataImport.findUnique.mockResolvedValue(mockImport);
      context.prismaMock.semanticModelRun.create.mockResolvedValue(mockRun);
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      const res = await request(context.app.getHttpServer())
        .post('/api/semantic-models/runs')
        .set(authHeader(contributor.accessToken))
        .send(validRunBody(connectionId, { dataImportId }))
        .expect(201);

      expect(res.body.data).toHaveProperty('status', 'pending');
      expect(res.body.data).toHaveProperty('connectionId', connectionId);

      // Verify the import was looked up
      expect(context.prismaMock.dataImport.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: dataImportId } }),
      );
    });

    it('should record the dataImportId in the audit event when provided', async () => {
      const contributor = await createMockContributorUser(context);
      const connectionId = randomUUID();
      const dataImportId = randomUUID();

      context.prismaMock.dataConnection.findUnique.mockResolvedValue(
        createMockConnection({ id: connectionId, createdByUserId: contributor.id }),
      );
      context.prismaMock.dataImport.findUnique.mockResolvedValue(
        createMockDataImport({ id: dataImportId, status: 'ready', connectionId }),
      );
      context.prismaMock.semanticModelRun.create.mockResolvedValue(
        createMockSemanticModelRun({ connectionId, createdByUserId: contributor.id }),
      );
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      await request(context.app.getHttpServer())
        .post('/api/semantic-models/runs')
        .set(authHeader(contributor.accessToken))
        .send(validRunBody(connectionId, { dataImportId }))
        .expect(201);

      expect(context.prismaMock.auditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            meta: expect.objectContaining({ dataImportId }),
          }),
        }),
      );
    });
  });

  // ── Backward compatibility: no dataImportId ─────────────────────────────

  describe('createRun() without dataImportId (backward compatibility)', () => {
    it('should return 201 and skip import validation when dataImportId is absent', async () => {
      const contributor = await createMockContributorUser(context);
      const connectionId = randomUUID();

      const mockConnection = createMockConnection({
        id: connectionId,
        name: 'Direct Connection',
        dbType: 'postgresql',
        createdByUserId: contributor.id,
      });
      const mockRun = createMockSemanticModelRun({
        connectionId,
        databaseName: 'mydb',
        selectedSchemas: ['public'],
        selectedTables: ['public.users'],
        name: 'Direct Semantic Model',
        status: 'pending',
        createdByUserId: contributor.id,
      });

      context.prismaMock.dataConnection.findUnique.mockResolvedValue(mockConnection);
      context.prismaMock.semanticModelRun.create.mockResolvedValue(mockRun);
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      const res = await request(context.app.getHttpServer())
        .post('/api/semantic-models/runs')
        .set(authHeader(contributor.accessToken))
        .send({
          connectionId,
          databaseName: 'mydb',
          selectedSchemas: ['public'],
          selectedTables: ['public.users'],
          name: 'Direct Semantic Model',
          // No dataImportId
        })
        .expect(201);

      expect(res.body.data).toHaveProperty('status', 'pending');

      // Import lookup must NOT have been called
      expect(context.prismaMock.dataImport.findUnique).not.toHaveBeenCalled();
    });
  });

  // ── Failure: dataImportId not found ─────────────────────────────────────

  describe('createRun() with non-existent dataImportId', () => {
    it('should return 404 when the dataImportId does not correspond to any import', async () => {
      const contributor = await createMockContributorUser(context);
      const connectionId = randomUUID();
      const dataImportId = randomUUID();

      context.prismaMock.dataConnection.findUnique.mockResolvedValue(
        createMockConnection({ id: connectionId, createdByUserId: contributor.id }),
      );
      // Import does not exist
      context.prismaMock.dataImport.findUnique.mockResolvedValue(null);

      const res = await request(context.app.getHttpServer())
        .post('/api/semantic-models/runs')
        .set(authHeader(contributor.accessToken))
        .send(validRunBody(connectionId, { dataImportId }))
        .expect(404);

      expect(res.body).toHaveProperty('message');
      expect(res.body.message).toMatch(new RegExp(dataImportId));
    });
  });

  // ── Failure: import is not in 'ready' status ────────────────────────────

  describe('createRun() when import is not ready', () => {
    const nonReadyStatuses = ['draft', 'pending', 'importing', 'failed', 'partial'];

    nonReadyStatuses.forEach((status) => {
      it(`should return 400 when the import is in '${status}' status`, async () => {
        const contributor = await createMockContributorUser(context);
        const connectionId = randomUUID();
        const dataImportId = randomUUID();

        context.prismaMock.dataConnection.findUnique.mockResolvedValue(
          createMockConnection({ id: connectionId, createdByUserId: contributor.id }),
        );
        context.prismaMock.dataImport.findUnique.mockResolvedValue(
          createMockDataImport({ id: dataImportId, status, connectionId }),
        );

        const res = await request(context.app.getHttpServer())
          .post('/api/semantic-models/runs')
          .set(authHeader(contributor.accessToken))
          .send(validRunBody(connectionId, { dataImportId }))
          .expect(400);

        expect(res.body).toHaveProperty('message');
        // Error message should mention the current status
        expect(res.body.message).toMatch(new RegExp(status));
      });
    });
  });

  // ── Failure: connectionId mismatch ───────────────────────────────────────

  describe('createRun() with mismatched connectionId', () => {
    it('should return 400 when the connectionId does not match the import connection', async () => {
      const contributor = await createMockContributorUser(context);
      const requestConnectionId = randomUUID();
      const importConnectionId = randomUUID(); // different connection
      const dataImportId = randomUUID();

      // The connection in the request exists
      context.prismaMock.dataConnection.findUnique.mockResolvedValue(
        createMockConnection({ id: requestConnectionId, createdByUserId: contributor.id }),
      );
      // The import is ready but points to a different connection
      context.prismaMock.dataImport.findUnique.mockResolvedValue(
        createMockDataImport({
          id: dataImportId,
          status: 'ready',
          connectionId: importConnectionId, // different from requestConnectionId
        }),
      );

      const res = await request(context.app.getHttpServer())
        .post('/api/semantic-models/runs')
        .set(authHeader(contributor.accessToken))
        .send(validRunBody(requestConnectionId, { dataImportId }))
        .expect(400);

      expect(res.body).toHaveProperty('message');
      expect(res.body.message).toMatch(/connection/i);
    });

    it('should return 400 when the import has no connectionId set (import never executed)', async () => {
      const contributor = await createMockContributorUser(context);
      const connectionId = randomUUID();
      const dataImportId = randomUUID();

      context.prismaMock.dataConnection.findUnique.mockResolvedValue(
        createMockConnection({ id: connectionId, createdByUserId: contributor.id }),
      );
      // Import is "ready" but has no connectionId (edge-case data inconsistency)
      context.prismaMock.dataImport.findUnique.mockResolvedValue(
        createMockDataImport({
          id: dataImportId,
          status: 'ready',
          connectionId: null, // null != connectionId
        }),
      );

      await request(context.app.getHttpServer())
        .post('/api/semantic-models/runs')
        .set(authHeader(contributor.accessToken))
        .send(validRunBody(connectionId, { dataImportId }))
        .expect(400);
    });
  });

  // ── dataImportId validation doesn't override connection check ───────────

  describe('createRun() — connection still validated before import', () => {
    it('should return 404 for the connection before even checking the import', async () => {
      const contributor = await createMockContributorUser(context);
      const connectionId = randomUUID();
      const dataImportId = randomUUID();

      // Connection doesn't exist
      context.prismaMock.dataConnection.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .post('/api/semantic-models/runs')
        .set(authHeader(contributor.accessToken))
        .send(validRunBody(connectionId, { dataImportId }))
        .expect(404);

      // Import lookup should NOT have been called
      expect(context.prismaMock.dataImport.findUnique).not.toHaveBeenCalled();
    });
  });
});
