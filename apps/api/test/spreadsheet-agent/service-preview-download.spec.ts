/**
 * Unit tests for SpreadsheetAgentService.getTablePreview() and
 * SpreadsheetAgentService.getTableDownloadUrl().
 *
 * All external dependencies (PrismaService, ConfigService, StorageProvider,
 * DuckDBSession) are mocked. No database or network I/O occurs.
 */

import { NotFoundException, ConflictException } from '@nestjs/common';
import { SpreadsheetAgentService } from '../../src/spreadsheet-agent/spreadsheet-agent.service';
import { STORAGE_PROVIDER } from '../../src/storage/providers/storage-provider.interface';

// ─── Mock: DuckDBSession ──────────────────────────────────────────────────────
// We mock the DuckDBSession class at the module level so that the service's
// import of it is intercepted.

jest.mock('../../src/connections/drivers/duckdb.util', () => {
  return {
    DuckDBSession: {
      create: jest.fn(),
    },
  };
});

// Grab the mocked constructor so individual tests can configure it.
import { DuckDBSession } from '../../src/connections/drivers/duckdb.util';
const mockDuckDBSessionCreate = DuckDBSession.create as jest.Mock;

// ─── Factories ────────────────────────────────────────────────────────────────

function makeTable(overrides: Partial<any> = {}): any {
  return {
    id:             'table-uuid-1',
    projectId:      'project-uuid-1',
    fileId:         'file-uuid-1',
    tableName:      'orders',
    status:         'ready',
    outputPath:     'spreadsheet-agent/project-uuid-1/orders.parquet',
    rowCount:       BigInt(100),
    outputSizeBytes: BigInt(2048),
    createdAt:      new Date(),
    updatedAt:      new Date(),
    ...overrides,
  };
}

// ─── Build service with mocked dependencies ───────────────────────────────────

function buildService(overrides: {
  tableFindUnique?: jest.Mock;
  configGet?: jest.Mock;
  storageGetSignedDownloadUrl?: jest.Mock;
  storageGetBucket?: jest.Mock;
} = {}) {
  const mockPrisma = {
    spreadsheetTable: {
      findUnique: overrides.tableFindUnique ?? jest.fn().mockResolvedValue(null),
    },
    // Other Prisma tables required by the constructor (never called in these tests)
    spreadsheetProject: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn(), findMany: jest.fn(), delete: jest.fn() },
    spreadsheetFile:    { findUnique: jest.fn(), create: jest.fn(), count: jest.fn(), findMany: jest.fn(), delete: jest.fn(), findFirst: jest.fn() },
    spreadsheetRun:     { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), count: jest.fn(), findMany: jest.fn(), delete: jest.fn(), findFirst: jest.fn() },
    auditEvent:         { create: jest.fn() },
    $transaction:       jest.fn(),
  } as any;

  const mockConfig = {
    get: overrides.configGet ?? jest.fn().mockImplementation((key: string, def?: any) => def ?? undefined),
  } as any;

  const mockStorage = {
    getSignedDownloadUrl: overrides.storageGetSignedDownloadUrl ?? jest.fn().mockResolvedValue('https://example.com/signed-url'),
    getBucket:            overrides.storageGetBucket ?? jest.fn().mockReturnValue('test-bucket'),
    upload:               jest.fn(),
    download:             jest.fn(),
    delete:               jest.fn(),
    exists:               jest.fn(),
    getMetadata:          jest.fn(),
    setMetadata:          jest.fn(),
    initMultipartUpload:  jest.fn(),
    getSignedUploadUrl:   jest.fn(),
    completeMultipartUpload: jest.fn(),
    abortMultipartUpload: jest.fn(),
  } as any;

  // SpreadsheetAgentService uses @Inject(STORAGE_PROVIDER) but since we
  // instantiate the class directly, we pass the mock as the third argument.
  const service = new SpreadsheetAgentService(mockPrisma, mockConfig, mockStorage);

  return { service, mockPrisma, mockConfig, mockStorage };
}

// ─── getTablePreview ──────────────────────────────────────────────────────────

describe('SpreadsheetAgentService.getTablePreview', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns columns and rows for a ready table with an outputPath', async () => {
    const table = makeTable({ status: 'ready', outputPath: 'path/to/orders.parquet' });

    const mockSession = {
      query: jest.fn().mockResolvedValue({
        columns: ['id', 'amount'],
        rows: [
          [1, 99.99],
          [2, 149.99],
        ],
      }),
      close: jest.fn().mockResolvedValue(undefined),
    };
    mockDuckDBSessionCreate.mockResolvedValue(mockSession);

    const { service, mockPrisma, mockConfig } = buildService({
      tableFindUnique: jest.fn().mockResolvedValue(table),
      configGet: jest.fn().mockImplementation((key: string, def?: any) => {
        const values: Record<string, string> = {
          'storage.s3.accessKeyId':     'AKID',
          'storage.s3.secretAccessKey': 'SECRET',
          'storage.s3.region':          'us-east-1',
        };
        return values[key] ?? def ?? undefined;
      }),
    });

    const result = await service.getTablePreview('project-uuid-1', 'table-uuid-1', 50);

    expect(result.columns).toEqual(['id', 'amount']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ id: 1, amount: 99.99 });
    expect(result.rows[1]).toEqual({ id: 2, amount: 149.99 });
    expect(result.totalRows).toBe(100);
    expect(mockSession.close).toHaveBeenCalled();
  });

  it('closes the DuckDB session even when the query throws', async () => {
    const table = makeTable({ status: 'ready', outputPath: 'path/to/orders.parquet' });

    const mockSession = {
      query: jest.fn().mockRejectedValue(new Error('S3 access denied')),
      close: jest.fn().mockResolvedValue(undefined),
    };
    mockDuckDBSessionCreate.mockResolvedValue(mockSession);

    const { service } = buildService({
      tableFindUnique: jest.fn().mockResolvedValue(table),
    });

    await expect(
      service.getTablePreview('project-uuid-1', 'table-uuid-1', 50),
    ).rejects.toThrow('S3 access denied');

    // The finally block must have called close
    expect(mockSession.close).toHaveBeenCalled();
  });

  it('throws NotFoundException when the table does not exist', async () => {
    const { service } = buildService({
      tableFindUnique: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service.getTablePreview('project-uuid-1', 'nonexistent-table', 50),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when the table belongs to a different project', async () => {
    const table = makeTable({ projectId: 'different-project-uuid' });

    const { service } = buildService({
      tableFindUnique: jest.fn().mockResolvedValue(table),
    });

    await expect(
      service.getTablePreview('project-uuid-1', 'table-uuid-1', 50),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws ConflictException when the table is not in ready status', async () => {
    const table = makeTable({ status: 'extracting' });

    const { service } = buildService({
      tableFindUnique: jest.fn().mockResolvedValue(table),
    });

    await expect(
      service.getTablePreview('project-uuid-1', 'table-uuid-1', 50),
    ).rejects.toThrow(ConflictException);
  });

  it('includes the status in the ConflictException message for a non-ready table', async () => {
    const table = makeTable({ status: 'failed' });

    const { service } = buildService({
      tableFindUnique: jest.fn().mockResolvedValue(table),
    });

    await expect(
      service.getTablePreview('project-uuid-1', 'table-uuid-1', 50),
    ).rejects.toThrow(/failed/);
  });

  it('throws ConflictException when the table has no outputPath', async () => {
    const table = makeTable({ status: 'ready', outputPath: null });

    const { service } = buildService({
      tableFindUnique: jest.fn().mockResolvedValue(table),
    });

    await expect(
      service.getTablePreview('project-uuid-1', 'table-uuid-1', 50),
    ).rejects.toThrow(ConflictException);
  });

  it('constructs the correct S3 URI from the bucket and outputPath', async () => {
    const table = makeTable({
      status: 'ready',
      outputPath: 'spreadsheet-agent/project-uuid-1/orders.parquet',
    });

    const mockSession = {
      query: jest.fn().mockResolvedValue({ columns: [], rows: [] }),
      close: jest.fn().mockResolvedValue(undefined),
    };
    mockDuckDBSessionCreate.mockResolvedValue(mockSession);

    const mockStorageGetBucket = jest.fn().mockReturnValue('my-bucket');

    const { service } = buildService({
      tableFindUnique: jest.fn().mockResolvedValue(table),
      storageGetBucket: mockStorageGetBucket,
    });

    await service.getTablePreview('project-uuid-1', 'table-uuid-1', 10);

    const querySql: string = mockSession.query.mock.calls[0][0];
    expect(querySql).toContain("s3://my-bucket/spreadsheet-agent/project-uuid-1/orders.parquet");
  });

  it('clamps the limit to a maximum of 500', async () => {
    const table = makeTable({ status: 'ready', outputPath: 'path/to/orders.parquet' });

    const mockSession = {
      query: jest.fn().mockResolvedValue({ columns: [], rows: [] }),
      close: jest.fn().mockResolvedValue(undefined),
    };
    mockDuckDBSessionCreate.mockResolvedValue(mockSession);

    const { service } = buildService({
      tableFindUnique: jest.fn().mockResolvedValue(table),
    });

    await service.getTablePreview('project-uuid-1', 'table-uuid-1', 9999);

    const querySql: string = mockSession.query.mock.calls[0][0];
    expect(querySql).toContain('LIMIT 500');
  });

  it('uses a minimum limit of 1 (negative input clamped up)', async () => {
    // When limit = 0, the service expression `limit || 50` evaluates to 50.
    // Pass a negative value to exercise the Math.max(1, ...) floor.
    const table = makeTable({ status: 'ready', outputPath: 'path/to/orders.parquet' });

    const mockSession = {
      query: jest.fn().mockResolvedValue({ columns: [], rows: [] }),
      close: jest.fn().mockResolvedValue(undefined),
    };
    mockDuckDBSessionCreate.mockResolvedValue(mockSession);

    const { service } = buildService({
      tableFindUnique: jest.fn().mockResolvedValue(table),
    });

    await service.getTablePreview('project-uuid-1', 'table-uuid-1', -5);

    const querySql: string = mockSession.query.mock.calls[0][0];
    expect(querySql).toContain('LIMIT 1');
  });

});

// ─── getTableDownloadUrl ──────────────────────────────────────────────────────

describe('SpreadsheetAgentService.getTableDownloadUrl', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a signed download URL for a ready table', async () => {
    const table = makeTable({
      status: 'ready',
      outputPath: 'spreadsheet-agent/project-uuid-1/orders.parquet',
      tableName: 'orders',
      outputSizeBytes: BigInt(4096),
    });

    const signedUrl = 'https://s3.example.com/signed/orders.parquet?token=abc';
    const mockGetSignedDownloadUrl = jest.fn().mockResolvedValue(signedUrl);

    const { service } = buildService({
      tableFindUnique: jest.fn().mockResolvedValue(table),
      storageGetSignedDownloadUrl: mockGetSignedDownloadUrl,
    });

    const result = await service.getTableDownloadUrl('project-uuid-1', 'table-uuid-1');

    expect(result.downloadUrl).toBe(signedUrl);
    expect(result.fileName).toBe('orders.parquet');
    expect(result.sizeBytes).toBe(4096);
    expect(typeof result.expiresAt).toBe('string');
  });

  it('calls getSignedDownloadUrl with the correct key and content-disposition', async () => {
    const table = makeTable({
      status: 'ready',
      outputPath: 'spreadsheet-agent/project-uuid-1/invoices.parquet',
      tableName: 'invoices',
    });

    const mockGetSignedDownloadUrl = jest.fn().mockResolvedValue('https://signed.url');

    const { service } = buildService({
      tableFindUnique: jest.fn().mockResolvedValue(table),
      storageGetSignedDownloadUrl: mockGetSignedDownloadUrl,
    });

    await service.getTableDownloadUrl('project-uuid-1', 'table-uuid-1');

    expect(mockGetSignedDownloadUrl).toHaveBeenCalledWith(
      'spreadsheet-agent/project-uuid-1/invoices.parquet',
      expect.objectContaining({
        responseContentDisposition: expect.stringContaining('invoices.parquet'),
      }),
    );
  });

  it('throws NotFoundException when the table does not exist', async () => {
    const { service } = buildService({
      tableFindUnique: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service.getTableDownloadUrl('project-uuid-1', 'nonexistent-table'),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when the table belongs to a different project', async () => {
    const table = makeTable({ projectId: 'other-project' });

    const { service } = buildService({
      tableFindUnique: jest.fn().mockResolvedValue(table),
    });

    await expect(
      service.getTableDownloadUrl('project-uuid-1', 'table-uuid-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws ConflictException when the table is not in ready status', async () => {
    const table = makeTable({ status: 'validating' });

    const { service } = buildService({
      tableFindUnique: jest.fn().mockResolvedValue(table),
    });

    await expect(
      service.getTableDownloadUrl('project-uuid-1', 'table-uuid-1'),
    ).rejects.toThrow(ConflictException);
  });

  it('throws ConflictException when the table has no outputPath', async () => {
    const table = makeTable({ status: 'ready', outputPath: null });

    const { service } = buildService({
      tableFindUnique: jest.fn().mockResolvedValue(table),
    });

    await expect(
      service.getTableDownloadUrl('project-uuid-1', 'table-uuid-1'),
    ).rejects.toThrow(ConflictException);
  });

  it('returns the correct fileName derived from tableName', async () => {
    const table = makeTable({
      status: 'ready',
      outputPath: 'some/path/sales_data.parquet',
      tableName: 'sales_data',
    });

    const { service } = buildService({
      tableFindUnique: jest.fn().mockResolvedValue(table),
      storageGetSignedDownloadUrl: jest.fn().mockResolvedValue('https://url'),
    });

    const result = await service.getTableDownloadUrl('project-uuid-1', 'table-uuid-1');

    expect(result.fileName).toBe('sales_data.parquet');
  });

  it('returns sizeBytes as a JavaScript number (converted from BigInt)', async () => {
    const table = makeTable({
      status: 'ready',
      outputPath: 'path/to/big-table.parquet',
      outputSizeBytes: BigInt(1_048_576), // 1 MB
    });

    const { service } = buildService({
      tableFindUnique: jest.fn().mockResolvedValue(table),
      storageGetSignedDownloadUrl: jest.fn().mockResolvedValue('https://url'),
    });

    const result = await service.getTableDownloadUrl('project-uuid-1', 'table-uuid-1');

    expect(typeof result.sizeBytes).toBe('number');
    expect(result.sizeBytes).toBe(1_048_576);
  });

  it('uses the configured signedUrlExpiry from ConfigService', async () => {
    const table = makeTable({
      status: 'ready',
      outputPath: 'path/to/file.parquet',
    });

    const mockGetSignedDownloadUrl = jest.fn().mockResolvedValue('https://url');

    const { service } = buildService({
      tableFindUnique: jest.fn().mockResolvedValue(table),
      storageGetSignedDownloadUrl: mockGetSignedDownloadUrl,
      configGet: jest.fn().mockImplementation((key: string, def?: any) => {
        if (key === 'storage.signedUrlExpiry') return 7200;
        return def ?? undefined;
      }),
    });

    await service.getTableDownloadUrl('project-uuid-1', 'table-uuid-1');

    expect(mockGetSignedDownloadUrl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ expiresIn: 7200 }),
    );
  });

  it('sets expiresAt to approximately now + expiresIn seconds', async () => {
    const table = makeTable({ status: 'ready', outputPath: 'path/to/file.parquet' });

    const { service } = buildService({
      tableFindUnique: jest.fn().mockResolvedValue(table),
      storageGetSignedDownloadUrl: jest.fn().mockResolvedValue('https://url'),
      configGet: jest.fn().mockImplementation((key: string, def?: any) => {
        if (key === 'storage.signedUrlExpiry') return 3600;
        return def ?? undefined;
      }),
    });

    const before = Date.now();
    const result = await service.getTableDownloadUrl('project-uuid-1', 'table-uuid-1');
    const after = Date.now();

    const expiresAtMs = new Date(result.expiresAt).getTime();

    // expiresAt should be roughly now + 3600 seconds
    expect(expiresAtMs).toBeGreaterThanOrEqual(before + 3600 * 1000 - 100);
    expect(expiresAtMs).toBeLessThanOrEqual(after + 3600 * 1000 + 100);
  });

});
