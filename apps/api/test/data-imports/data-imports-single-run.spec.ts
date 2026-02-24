/**
 * Tests for single-run enforcement and cleanup logic in DataImportsService.
 *
 * These tests verify the cleanupPreviousRun() behaviour (called indirectly
 * via createRun()) and the delete() connection-protection logic.
 *
 * All Prisma and storage dependencies are mocked — no real database or S3
 * calls occur.
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
  createMockContributorUser,
  authHeader,
} from '../helpers/auth-mock.helper';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function createMockImport(overrides: Partial<any> = {}): any {
  const id = overrides.id ?? randomUUID();
  return {
    id,
    name: overrides.name ?? 'Test Import',
    sourceFileName: overrides.sourceFileName ?? 'data.csv',
    sourceFileType: overrides.sourceFileType ?? 'csv',
    sourceFileSizeBytes: overrides.sourceFileSizeBytes ?? 1024,
    sourceStoragePath: overrides.sourceStoragePath ?? `data-imports/${id}/source/data.csv`,
    status: overrides.status ?? 'draft',
    parseResult: overrides.parseResult ?? {
      type: 'csv',
      detectedDelimiter: ',',
      detectedEncoding: 'UTF-8',
      hasHeader: true,
      columns: [{ name: 'id', detectedType: 'BIGINT' }],
      sampleRows: [[1]],
      rowCountEstimate: 1,
    },
    config: overrides.config ?? null,
    outputTables: overrides.outputTables ?? null,
    totalRowCount: overrides.totalRowCount ?? 0,
    totalSizeBytes: overrides.totalSizeBytes ?? 0,
    connectionId: overrides.connectionId ?? null,
    errorMessage: overrides.errorMessage ?? null,
    createdByUserId: overrides.createdByUserId ?? null,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
    _count: overrides._count ?? { runs: 0 },
    connection: overrides.connection ?? null,
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Data Imports — Single-Run Enforcement', () => {
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

  // ── Re-run allowed statuses ─────────────────────────────────────────────

  describe('createRun() — allowed re-run statuses', () => {
    it('should allow re-running a "ready" import', async () => {
      const contributor = await createMockContributorUser(context);
      const connectionId = randomUUID();
      const mockImport = createMockImport({
        status: 'ready',
        connectionId,
        outputTables: [
          {
            tableName: 'orders',
            s3Key: `data-imports/abc/tables/orders.parquet`,
            rowCount: 10,
            sizeBytes: 512,
            connectionId,
            columns: [{ name: 'id', type: 'BIGINT' }],
          },
        ],
      });
      const mockRun = createMockRun({ importId: mockImport.id });

      // findUnique called multiple times: once in getById (for the import check),
      // once again in getById after cleanupPreviousRun updates the import
      context.prismaMock.dataImport.findUnique.mockResolvedValue(mockImport);
      context.prismaMock.dataImportRun.deleteMany.mockResolvedValue({ count: 1 });
      context.prismaMock.semanticModel.count.mockResolvedValue(0);
      context.prismaMock.dataConnection.delete.mockResolvedValue({ id: connectionId });
      context.prismaMock.dataImport.update.mockResolvedValue({
        ...mockImport,
        status: 'pending',
        outputTables: null,
        connectionId: null,
      });
      context.prismaMock.dataImportRun.create.mockResolvedValue(mockRun);

      const res = await request(context.app.getHttpServer())
        .post('/api/data-imports/runs')
        .set(authHeader(contributor.accessToken))
        .send({ importId: mockImport.id })
        .expect(201);

      expect(res.body.data.importId).toBe(mockImport.id);
      expect(res.body.data.status).toBe('pending');
    });

    it('should allow re-running a "partial" import', async () => {
      const contributor = await createMockContributorUser(context);
      const mockImport = createMockImport({ status: 'partial', connectionId: null });
      const mockRun = createMockRun({ importId: mockImport.id });

      context.prismaMock.dataImport.findUnique.mockResolvedValue(mockImport);
      context.prismaMock.dataImportRun.deleteMany.mockResolvedValue({ count: 0 });
      context.prismaMock.dataImport.update.mockResolvedValue({
        ...mockImport,
        status: 'pending',
        outputTables: null,
        connectionId: null,
      });
      context.prismaMock.dataImportRun.create.mockResolvedValue(mockRun);

      const res = await request(context.app.getHttpServer())
        .post('/api/data-imports/runs')
        .set(authHeader(contributor.accessToken))
        .send({ importId: mockImport.id })
        .expect(201);

      expect(res.body.data.status).toBe('pending');
    });
  });

  // ── Cleanup of previous run artifacts ──────────────────────────────────

  describe('createRun() — cleanup of previous run artifacts', () => {
    it('should delete previous runs and reset import state before creating a new run', async () => {
      const contributor = await createMockContributorUser(context);
      const importId = randomUUID();
      const connectionId = randomUUID();
      const mockImport = createMockImport({
        id: importId,
        status: 'ready',
        connectionId,
        outputTables: [
          {
            tableName: 'sales',
            s3Key: `data-imports/${importId}/tables/sales.parquet`,
            rowCount: 100,
            sizeBytes: 2048,
            connectionId,
            columns: [{ name: 'id', type: 'BIGINT' }],
          },
        ],
      });
      const mockRun = createMockRun({ importId });

      context.prismaMock.dataImport.findUnique.mockResolvedValue(mockImport);
      context.prismaMock.dataImportRun.deleteMany.mockResolvedValue({ count: 2 });
      context.prismaMock.semanticModel.count.mockResolvedValue(0);
      context.prismaMock.dataConnection.delete.mockResolvedValue({ id: connectionId });
      context.prismaMock.dataImport.update.mockResolvedValue({
        ...mockImport,
        status: 'pending',
        outputTables: null,
        connectionId: null,
        totalRowCount: null,
        totalSizeBytes: null,
        errorMessage: null,
      });
      context.prismaMock.dataImportRun.create.mockResolvedValue(mockRun);

      await request(context.app.getHttpServer())
        .post('/api/data-imports/runs')
        .set(authHeader(contributor.accessToken))
        .send({ importId })
        .expect(201);

      // Verify old runs were deleted
      expect(context.prismaMock.dataImportRun.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { importId } }),
      );

      // Verify import state was reset
      expect(context.prismaMock.dataImport.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: importId },
          data: expect.objectContaining({
            status: 'pending',
            outputTables: null,
            connectionId: null,
          }),
        }),
      );

      // Verify the old connection was deleted (no semantic model references it)
      expect(context.prismaMock.dataConnection.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: connectionId } }),
      );
    });

    it('should keep the connection alive when a semantic model references it', async () => {
      const contributor = await createMockContributorUser(context);
      const importId = randomUUID();
      const connectionId = randomUUID();
      const mockImport = createMockImport({
        id: importId,
        status: 'ready',
        connectionId,
        outputTables: [
          {
            tableName: 'sales',
            s3Key: `data-imports/${importId}/tables/sales.parquet`,
            rowCount: 50,
            sizeBytes: 1024,
            connectionId,
            columns: [{ name: 'id', type: 'BIGINT' }],
          },
        ],
      });
      const mockRun = createMockRun({ importId });

      context.prismaMock.dataImport.findUnique.mockResolvedValue(mockImport);
      context.prismaMock.dataImportRun.deleteMany.mockResolvedValue({ count: 1 });
      // 1 semantic model references the connection
      context.prismaMock.semanticModel.count.mockResolvedValue(1);
      context.prismaMock.dataImport.update.mockResolvedValue({
        ...mockImport,
        status: 'pending',
        outputTables: null,
        connectionId: null,
      });
      context.prismaMock.dataImportRun.create.mockResolvedValue(mockRun);

      await request(context.app.getHttpServer())
        .post('/api/data-imports/runs')
        .set(authHeader(contributor.accessToken))
        .send({ importId })
        .expect(201);

      // The connection must NOT be deleted
      expect(context.prismaMock.dataConnection.delete).not.toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: connectionId } }),
      );

      // But old runs should still be cleaned up
      expect(context.prismaMock.dataImportRun.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { importId } }),
      );
    });

    it('should not attempt to delete a connection when import has no connectionId', async () => {
      const contributor = await createMockContributorUser(context);
      const importId = randomUUID();
      const mockImport = createMockImport({
        id: importId,
        status: 'failed',
        connectionId: null,
        outputTables: null,
      });
      const mockRun = createMockRun({ importId });

      context.prismaMock.dataImport.findUnique.mockResolvedValue(mockImport);
      context.prismaMock.dataImportRun.deleteMany.mockResolvedValue({ count: 1 });
      context.prismaMock.dataImport.update.mockResolvedValue({
        ...mockImport,
        status: 'pending',
      });
      context.prismaMock.dataImportRun.create.mockResolvedValue(mockRun);

      await request(context.app.getHttpServer())
        .post('/api/data-imports/runs')
        .set(authHeader(contributor.accessToken))
        .send({ importId })
        .expect(201);

      // No connection to delete — should not call delete at all
      expect(context.prismaMock.dataConnection.delete).not.toHaveBeenCalled();
      // No semantic model count check needed either
      expect(context.prismaMock.semanticModel.count).not.toHaveBeenCalled();
    });
  });

  // ── delete() — connection protection ────────────────────────────────────

  describe('delete() — import-level connection protection', () => {
    it('should delete the import-level connection when no semantic model references it', async () => {
      const contributor = await createMockContributorUser(context);
      const connectionId = randomUUID();
      const mockImport = createMockImport({
        status: 'ready',
        connectionId,
        outputTables: null,
        _count: { runs: 0 },
        connection: { id: connectionId, name: 'Import: Test Import', dbType: 's3', options: {} },
      });

      context.prismaMock.dataImport.findUnique.mockResolvedValue(mockImport);
      context.prismaMock.semanticModel.count.mockResolvedValue(0);
      context.prismaMock.dataConnection.delete.mockResolvedValue({ id: connectionId });
      context.prismaMock.dataImport.delete.mockResolvedValue(mockImport);

      await request(context.app.getHttpServer())
        .delete(`/api/data-imports/${mockImport.id}`)
        .set(authHeader(contributor.accessToken))
        .expect(204);

      expect(context.prismaMock.dataConnection.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: connectionId } }),
      );
      expect(context.prismaMock.dataImport.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: mockImport.id } }),
      );
    });

    it('should keep the import-level connection when a semantic model references it', async () => {
      const contributor = await createMockContributorUser(context);
      const connectionId = randomUUID();
      const mockImport = createMockImport({
        status: 'ready',
        connectionId,
        outputTables: null,
        _count: { runs: 0 },
        connection: { id: connectionId, name: 'Import: Test Import', dbType: 's3', options: {} },
      });

      context.prismaMock.dataImport.findUnique.mockResolvedValue(mockImport);
      // 1 semantic model still references the connection
      context.prismaMock.semanticModel.count.mockResolvedValue(1);
      context.prismaMock.dataImport.delete.mockResolvedValue(mockImport);

      await request(context.app.getHttpServer())
        .delete(`/api/data-imports/${mockImport.id}`)
        .set(authHeader(contributor.accessToken))
        .expect(204);

      // Connection must NOT be deleted
      expect(context.prismaMock.dataConnection.delete).not.toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: connectionId } }),
      );
      // But the import itself must be deleted
      expect(context.prismaMock.dataImport.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: mockImport.id } }),
      );
    });

    it('should not touch connection table when import has no connectionId at all', async () => {
      const contributor = await createMockContributorUser(context);
      const mockImport = createMockImport({
        status: 'draft',
        connectionId: null,
        outputTables: null,
        _count: { runs: 0 },
        connection: null,
      });

      context.prismaMock.dataImport.findUnique.mockResolvedValue(mockImport);
      context.prismaMock.dataImport.delete.mockResolvedValue(mockImport);

      await request(context.app.getHttpServer())
        .delete(`/api/data-imports/${mockImport.id}`)
        .set(authHeader(contributor.accessToken))
        .expect(204);

      // No semantic model count check and no connection deletion
      expect(context.prismaMock.semanticModel.count).not.toHaveBeenCalled();
      expect(context.prismaMock.dataConnection.delete).not.toHaveBeenCalled();
    });
  });
});
