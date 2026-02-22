import {
  S3Client,
  ListBucketsCommand,
  ListObjectsV2Command,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { S3Driver } from '../s3.driver';
import { ConnectionParams } from '../driver.interface';

// ==========================================
// Mock @aws-sdk/client-s3
// ==========================================

jest.mock('@aws-sdk/client-s3');

const MockS3Client = S3Client as jest.MockedClass<typeof S3Client>;

// ==========================================
// Test helpers
// ==========================================

function makeParams(overrides: Partial<ConnectionParams> = {}): ConnectionParams {
  return {
    host: 'us-east-1',
    port: 0,
    username: 'AKIAIOSFODNN7EXAMPLE',
    password: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    useSsl: true,
    options: {},
    ...overrides,
  };
}

// ==========================================
// S3Driver — testConnection
// ==========================================

describe('S3Driver.testConnection', () => {
  let driver: S3Driver;
  let mockSend: jest.Mock;

  beforeEach(() => {
    driver = new S3Driver();
    mockSend = jest.fn();
    MockS3Client.prototype.send = mockSend;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return success when ListBucketsCommand succeeds', async () => {
    mockSend.mockResolvedValue({ Buckets: [{ Name: 'my-bucket' }] });

    const result = await driver.testConnection(makeParams());

    expect(result.success).toBe(true);
    expect(result.message).toBe('Connection successful');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(mockSend).toHaveBeenCalledWith(expect.any(ListBucketsCommand));
  });

  it('should return failure when ListBucketsCommand throws', async () => {
    mockSend.mockRejectedValue(new Error('InvalidAccessKeyId'));

    const result = await driver.testConnection(makeParams());

    expect(result.success).toBe(false);
    expect(result.message).toBe('InvalidAccessKeyId');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('should use HeadBucketCommand when options.bucket is set', async () => {
    mockSend.mockResolvedValue({});

    const params = makeParams({ options: { bucket: 'specific-bucket' } });
    const result = await driver.testConnection(params);

    expect(result.success).toBe(true);
    expect(mockSend).toHaveBeenCalledWith(expect.any(HeadBucketCommand));
    // Should NOT have called ListBucketsCommand
    const callArgs = mockSend.mock.calls.map((c) => c[0]);
    expect(callArgs.some((c) => c instanceof ListBucketsCommand)).toBe(false);
  });

  it('should return failure when HeadBucketCommand throws', async () => {
    mockSend.mockRejectedValue(new Error('NoSuchBucket'));

    const params = makeParams({ options: { bucket: 'nonexistent-bucket' } });
    const result = await driver.testConnection(params);

    expect(result.success).toBe(false);
    expect(result.message).toBe('NoSuchBucket');
  });

  it('should handle non-Error rejection with unknown error message', async () => {
    mockSend.mockRejectedValue('string error');

    const result = await driver.testConnection(makeParams());

    expect(result.success).toBe(false);
    expect(result.message).toBe('Unknown error');
  });
});

// ==========================================
// S3Driver — listDatabases
// ==========================================

describe('S3Driver.listDatabases', () => {
  let driver: S3Driver;
  let mockSend: jest.Mock;

  beforeEach(() => {
    driver = new S3Driver();
    mockSend = jest.fn();
    MockS3Client.prototype.send = mockSend;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return all buckets from ListBucketsCommand', async () => {
    mockSend.mockResolvedValue({
      Buckets: [{ Name: 'bucket-a' }, { Name: 'bucket-b' }, { Name: 'bucket-c' }],
    });

    const result = await driver.listDatabases(makeParams());

    expect(result).toEqual([{ name: 'bucket-a' }, { name: 'bucket-b' }, { name: 'bucket-c' }]);
    expect(mockSend).toHaveBeenCalledWith(expect.any(ListBucketsCommand));
  });

  it('should return empty array when no buckets exist', async () => {
    mockSend.mockResolvedValue({ Buckets: [] });

    const result = await driver.listDatabases(makeParams());

    expect(result).toEqual([]);
  });

  it('should filter out buckets with empty names', async () => {
    mockSend.mockResolvedValue({
      Buckets: [{ Name: 'valid-bucket' }, { Name: '' }, { Name: undefined }],
    });

    const result = await driver.listDatabases(makeParams());

    expect(result).toEqual([{ name: 'valid-bucket' }]);
  });

  it('should return single bucket when options.bucket is set (no SDK call)', async () => {
    const params = makeParams({ options: { bucket: 'configured-bucket' } });

    const result = await driver.listDatabases(params);

    expect(result).toEqual([{ name: 'configured-bucket' }]);
    // Should NOT call S3 at all — no need to list when bucket is pinned
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('should handle null Buckets in response', async () => {
    mockSend.mockResolvedValue({ Buckets: null });

    const result = await driver.listDatabases(makeParams());

    expect(result).toEqual([]);
  });
});

// ==========================================
// S3Driver — listSchemas
// ==========================================

describe('S3Driver.listSchemas', () => {
  let driver: S3Driver;
  let mockSend: jest.Mock;

  beforeEach(() => {
    driver = new S3Driver();
    mockSend = jest.fn();
    MockS3Client.prototype.send = mockSend;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return folder prefixes as schemas', async () => {
    mockSend.mockResolvedValue({
      CommonPrefixes: [{ Prefix: 'sales/' }, { Prefix: 'finance/' }],
      Contents: [],
      IsTruncated: false,
    });

    const result = await driver.listSchemas(makeParams(), 'my-bucket');

    expect(result).toEqual([
      { name: 'sales', database: 'my-bucket' },
      { name: 'finance', database: 'my-bucket' },
    ]);
  });

  it('should prepend _root schema when parquet files exist at root level', async () => {
    mockSend.mockResolvedValue({
      CommonPrefixes: [{ Prefix: 'data/' }],
      Contents: [{ Key: 'snapshot.parquet' }, { Key: 'readme.txt' }],
      IsTruncated: false,
    });

    const result = await driver.listSchemas(makeParams(), 'my-bucket');

    expect(result[0]).toEqual({ name: '_root', database: 'my-bucket' });
    expect(result).toContainEqual({ name: 'data', database: 'my-bucket' });
  });

  it('should not add _root schema when no parquet files at root level', async () => {
    mockSend.mockResolvedValue({
      CommonPrefixes: [{ Prefix: 'data/' }],
      Contents: [{ Key: 'readme.txt' }],
      IsTruncated: false,
    });

    const result = await driver.listSchemas(makeParams(), 'my-bucket');

    expect(result.some((s) => s.name === '_root')).toBe(false);
  });

  it('should scope listing to pathPrefix when set', async () => {
    mockSend.mockResolvedValue({
      CommonPrefixes: [{ Prefix: 'raw/sales/' }, { Prefix: 'raw/finance/' }],
      Contents: [],
      IsTruncated: false,
    });

    const params = makeParams({ options: { pathPrefix: 'raw' } });
    const result = await driver.listSchemas(params, 'my-bucket');

    // Schema names should have the pathPrefix stripped
    expect(result).toEqual([
      { name: 'sales', database: 'my-bucket' },
      { name: 'finance', database: 'my-bucket' },
    ]);
    // The SDK send was called once
    expect(mockSend).toHaveBeenCalledTimes(1);
    // The command sent should be a ListObjectsV2Command
    expect(mockSend.mock.calls[0][0]).toBeInstanceOf(ListObjectsV2Command);
  });

  it('should handle paginated results', async () => {
    // First page
    mockSend
      .mockResolvedValueOnce({
        CommonPrefixes: [{ Prefix: 'schema_a/' }],
        Contents: [],
        IsTruncated: true,
        NextContinuationToken: 'token-1',
      })
      // Second page
      .mockResolvedValueOnce({
        CommonPrefixes: [{ Prefix: 'schema_b/' }],
        Contents: [],
        IsTruncated: false,
      });

    const result = await driver.listSchemas(makeParams(), 'my-bucket');

    expect(result).toEqual([
      { name: 'schema_a', database: 'my-bucket' },
      { name: 'schema_b', database: 'my-bucket' },
    ]);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('should skip prefixes with null or undefined Prefix property', async () => {
    mockSend.mockResolvedValue({
      CommonPrefixes: [{ Prefix: 'valid/' }, { Prefix: null }, {}],
      Contents: [],
      IsTruncated: false,
    });

    const result = await driver.listSchemas(makeParams(), 'my-bucket');

    expect(result).toEqual([{ name: 'valid', database: 'my-bucket' }]);
  });
});

// ==========================================
// S3Driver — listTables
// ==========================================

describe('S3Driver.listTables', () => {
  let driver: S3Driver;
  let mockSend: jest.Mock;

  beforeEach(() => {
    driver = new S3Driver();
    mockSend = jest.fn();
    MockS3Client.prototype.send = mockSend;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return parquet files as tables', async () => {
    mockSend.mockResolvedValue({
      Contents: [
        { Key: 'sales/orders.parquet' },
        { Key: 'sales/returns.parquet' },
        { Key: 'sales/readme.txt' }, // should be ignored
      ],
      CommonPrefixes: [],
      IsTruncated: false,
    });

    const result = await driver.listTables(makeParams(), 'my-bucket', 'sales');

    const names = result.map((t) => t.name);
    expect(names).toContain('orders');
    expect(names).toContain('returns');
    expect(names).not.toContain('readme');
    expect(result.every((t) => t.schema === 'sales' && t.database === 'my-bucket')).toBe(true);
    expect(result.every((t) => t.type === 'TABLE')).toBe(true);
  });

  it('should detect partitioned folders that contain parquet files', async () => {
    // First call — the schema-level listing returns a sub-folder
    mockSend
      .mockResolvedValueOnce({
        Contents: [],
        CommonPrefixes: [{ Prefix: 'sales/events/' }],
        IsTruncated: false,
      })
      // Second call — check inside the sub-folder; contains parquet
      .mockResolvedValueOnce({
        Contents: [{ Key: 'sales/events/part-0001.parquet' }],
      });

    const result = await driver.listTables(makeParams(), 'my-bucket', 'sales');

    expect(result).toEqual([
      expect.objectContaining({ name: 'events', schema: 'sales', database: 'my-bucket', type: 'TABLE' }),
    ]);
  });

  it('should skip sub-folders with no parquet files', async () => {
    mockSend
      .mockResolvedValueOnce({
        Contents: [],
        CommonPrefixes: [{ Prefix: 'sales/empty-folder/' }],
        IsTruncated: false,
      })
      .mockResolvedValueOnce({
        Contents: [{ Key: 'sales/empty-folder/data.csv' }], // not parquet
      });

    const result = await driver.listTables(makeParams(), 'my-bucket', 'sales');

    expect(result).toHaveLength(0);
  });

  it('should handle _root schema by listing at bucket root', async () => {
    mockSend.mockResolvedValue({
      Contents: [{ Key: 'snapshot.parquet' }],
      CommonPrefixes: [],
      IsTruncated: false,
    });

    const result = await driver.listTables(makeParams(), 'my-bucket', '_root');

    expect(result).toEqual([
      expect.objectContaining({ name: 'snapshot', schema: '_root', database: 'my-bucket' }),
    ]);
    // The SDK should have been called with a ListObjectsV2Command for the _root listing
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0]).toBeInstanceOf(ListObjectsV2Command);
  });

  it('should handle _root schema with pathPrefix', async () => {
    mockSend.mockResolvedValue({
      Contents: [{ Key: 'data/raw/snapshot.parquet' }],
      CommonPrefixes: [],
      IsTruncated: false,
    });

    const params = makeParams({ options: { pathPrefix: 'data/raw' } });
    const result = await driver.listTables(params, 'my-bucket', '_root');

    expect(result).toContainEqual(
      expect.objectContaining({ name: 'snapshot', schema: '_root' }),
    );
  });
});

// ==========================================
// S3Driver — buildParquetUri (via protected method — tested through class)
// ==========================================

describe('S3Driver — URI builders', () => {
  // Access protected methods by casting to any
  let driver: S3Driver;

  beforeEach(() => {
    driver = new S3Driver();
  });

  describe('buildParquetUri', () => {
    it('should build simple parquet URI without pathPrefix', () => {
      const params = makeParams({ options: {} });
      const uri = (driver as unknown as Record<string, (...args: unknown[]) => string>)
        .buildParquetUri(params, 'my-bucket', 'sales', 'orders');
      expect(uri).toBe('s3://my-bucket/sales/orders.parquet');
    });

    it('should include pathPrefix in the URI', () => {
      const params = makeParams({ options: { pathPrefix: 'raw/data' } });
      const uri = (driver as unknown as Record<string, (...args: unknown[]) => string>)
        .buildParquetUri(params, 'my-bucket', 'sales', 'orders');
      expect(uri).toBe('s3://my-bucket/raw/data/sales/orders.parquet');
    });

    it('should handle _root schema without pathPrefix', () => {
      const params = makeParams({ options: {} });
      const uri = (driver as unknown as Record<string, (...args: unknown[]) => string>)
        .buildParquetUri(params, 'my-bucket', '_root', 'snapshot');
      expect(uri).toBe('s3://my-bucket/snapshot.parquet');
    });

    it('should handle _root schema with pathPrefix', () => {
      const params = makeParams({ options: { pathPrefix: 'prefix' } });
      const uri = (driver as unknown as Record<string, (...args: unknown[]) => string>)
        .buildParquetUri(params, 'my-bucket', '_root', 'snapshot');
      expect(uri).toBe('s3://my-bucket/prefix/snapshot.parquet');
    });
  });

  describe('buildPartitionedUri', () => {
    it('should build glob URI without pathPrefix', () => {
      const params = makeParams({ options: {} });
      const uri = (driver as unknown as Record<string, (...args: unknown[]) => string>)
        .buildPartitionedUri(params, 'my-bucket', 'sales', 'events');
      expect(uri).toBe('s3://my-bucket/sales/events/**/*.parquet');
    });

    it('should include pathPrefix in the glob URI', () => {
      const params = makeParams({ options: { pathPrefix: 'raw' } });
      const uri = (driver as unknown as Record<string, (...args: unknown[]) => string>)
        .buildPartitionedUri(params, 'my-bucket', 'sales', 'events');
      expect(uri).toBe('s3://my-bucket/raw/sales/events/**/*.parquet');
    });

    it('should handle _root schema without pathPrefix', () => {
      const params = makeParams({ options: {} });
      const uri = (driver as unknown as Record<string, (...args: unknown[]) => string>)
        .buildPartitionedUri(params, 'my-bucket', '_root', 'events');
      expect(uri).toBe('s3://my-bucket/events/**/*.parquet');
    });

    it('should handle _root schema with pathPrefix', () => {
      const params = makeParams({ options: { pathPrefix: 'raw' } });
      const uri = (driver as unknown as Record<string, (...args: unknown[]) => string>)
        .buildPartitionedUri(params, 'my-bucket', '_root', 'events');
      expect(uri).toBe('s3://my-bucket/raw/events/**/*.parquet');
    });
  });

  // ----------------------------------------
  // buildSessionOptions
  // ----------------------------------------

  describe('buildSessionOptions', () => {
    it('should map credentials from params correctly', () => {
      const params = makeParams({
        host: 'us-west-2',
        username: 'ACCESS_KEY',
        password: 'SECRET_KEY',
        options: {},
      });
      const opts = (driver as unknown as Record<string, (...args: unknown[]) => unknown>)
        .buildSessionOptions(params) as { storageType: string; credentials: Record<string, unknown> };

      expect(opts.storageType).toBe('s3');
      expect(opts.credentials).toMatchObject({
        region: 'us-west-2',
        accessKeyId: 'ACCESS_KEY',
        secretAccessKey: 'SECRET_KEY',
      });
    });

    it('should prefer options.region over params.host', () => {
      const params = makeParams({
        host: 'us-east-1',
        options: { region: 'eu-west-1' },
      });
      const opts = (driver as unknown as Record<string, (...args: unknown[]) => unknown>)
        .buildSessionOptions(params) as { credentials: Record<string, unknown> };

      expect(opts.credentials['region']).toBe('eu-west-1');
    });

    it('should fall back to us-east-1 when no region is provided', () => {
      const params = makeParams({ host: '', options: {} });
      const opts = (driver as unknown as Record<string, (...args: unknown[]) => unknown>)
        .buildSessionOptions(params) as { credentials: Record<string, unknown> };

      expect(opts.credentials['region']).toBe('us-east-1');
    });

    it('should include endpointUrl when set in options', () => {
      const params = makeParams({
        options: { endpointUrl: 'http://minio:9000' },
      });
      const opts = (driver as unknown as Record<string, (...args: unknown[]) => unknown>)
        .buildSessionOptions(params) as { credentials: Record<string, unknown> };

      expect(opts.credentials['endpointUrl']).toBe('http://minio:9000');
    });

    it('should not include endpointUrl when not set', () => {
      const params = makeParams({ options: {} });
      const opts = (driver as unknown as Record<string, (...args: unknown[]) => unknown>)
        .buildSessionOptions(params) as { credentials: Record<string, unknown> };

      expect(opts.credentials['endpointUrl']).toBeUndefined();
    });
  });
});

// ==========================================
// S3Driver — getStorageType
// ==========================================

describe('S3Driver.getStorageType', () => {
  it('should return s3', () => {
    const driver = new S3Driver();
    expect(driver.getStorageType()).toBe('s3');
  });
});
