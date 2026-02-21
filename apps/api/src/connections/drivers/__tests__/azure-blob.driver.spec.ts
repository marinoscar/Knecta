import {
  BlobServiceClient,
  StorageSharedKeyCredential,
} from '@azure/storage-blob';
import { AzureBlobDriver } from '../azure-blob.driver';
import { ConnectionParams } from '../driver.interface';

// ==========================================
// Mock @azure/storage-blob
// ==========================================

jest.mock('@azure/storage-blob');

const MockBlobServiceClient = BlobServiceClient as jest.MockedClass<typeof BlobServiceClient>;
const MockStorageSharedKeyCredential =
  StorageSharedKeyCredential as jest.MockedClass<typeof StorageSharedKeyCredential>;

// ==========================================
// Async iterable factory
// ==========================================

function createMockAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      let index = 0;
      return {
        async next() {
          if (index < items.length) {
            return { value: items[index++], done: false as const };
          }
          return { value: undefined as unknown as T, done: true as const };
        },
      };
    },
  };
}

// ==========================================
// Test helpers
// ==========================================

function makeParams(overrides: Partial<ConnectionParams> = {}): ConnectionParams {
  return {
    host: 'https://myaccount.blob.core.windows.net',
    port: 0,
    username: 'myaccount',
    password: 'base64AccountKey==',
    useSsl: true,
    options: { authMethod: 'key' },
    ...overrides,
  };
}

function makeSasParams(overrides: Partial<ConnectionParams> = {}): ConnectionParams {
  return makeParams({
    options: { authMethod: 'sas' },
    password: '?sv=2021-08-06&ss=b&srt=sco&sp=r&se=2026-01-01T00:00:00Z&st=2026-01-01T00:00:00Z&spr=https&sig=abc123',
    ...overrides,
  });
}

// ==========================================
// AzureBlobDriver — testConnection
// ==========================================

describe('AzureBlobDriver.testConnection', () => {
  let driver: AzureBlobDriver;
  let mockGetProperties: jest.Mock;
  let mockGetContainerClient: jest.Mock;
  let mockContainerGetProperties: jest.Mock;

  beforeEach(() => {
    driver = new AzureBlobDriver();

    mockContainerGetProperties = jest.fn();
    mockGetProperties = jest.fn();
    mockGetContainerClient = jest.fn().mockReturnValue({
      getProperties: mockContainerGetProperties,
    });

    MockBlobServiceClient.prototype.getProperties = mockGetProperties;
    MockBlobServiceClient.prototype.getContainerClient = mockGetContainerClient;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return success when account-level getProperties succeeds (key auth)', async () => {
    mockGetProperties.mockResolvedValue({});

    const result = await driver.testConnection(makeParams());

    expect(result.success).toBe(true);
    expect(result.message).toBe('Connection successful');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('should return failure when account-level getProperties throws (key auth)', async () => {
    mockGetProperties.mockRejectedValue(new Error('AuthenticationFailed'));

    const result = await driver.testConnection(makeParams());

    expect(result.success).toBe(false);
    expect(result.message).toBe('AuthenticationFailed');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('should return success when account-level getProperties succeeds (SAS auth)', async () => {
    mockGetProperties.mockResolvedValue({});

    const result = await driver.testConnection(makeSasParams());

    expect(result.success).toBe(true);
    expect(result.message).toBe('Connection successful');
  });

  it('should use container getProperties when options.containerName is set', async () => {
    mockContainerGetProperties.mockResolvedValue({});

    const params = makeParams({ options: { authMethod: 'key', containerName: 'my-container' } });
    const result = await driver.testConnection(params);

    expect(result.success).toBe(true);
    expect(mockGetContainerClient).toHaveBeenCalledWith('my-container');
    expect(mockContainerGetProperties).toHaveBeenCalled();
    // Should NOT have called account-level getProperties
    expect(mockGetProperties).not.toHaveBeenCalled();
  });

  it('should return failure when container getProperties throws', async () => {
    mockContainerGetProperties.mockRejectedValue(new Error('ContainerNotFound'));

    const params = makeParams({
      options: { authMethod: 'key', containerName: 'missing-container' },
    });
    const result = await driver.testConnection(params);

    expect(result.success).toBe(false);
    expect(result.message).toBe('ContainerNotFound');
  });

  it('should handle non-Error rejection with unknown error message', async () => {
    mockGetProperties.mockRejectedValue({ code: 'SomeCode' });

    const result = await driver.testConnection(makeParams());

    expect(result.success).toBe(false);
    expect(result.message).toBe('Unknown error');
  });
});

// ==========================================
// AzureBlobDriver — listDatabases
// ==========================================

describe('AzureBlobDriver.listDatabases', () => {
  let driver: AzureBlobDriver;

  beforeEach(() => {
    driver = new AzureBlobDriver();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return all containers from listContainers', async () => {
    MockBlobServiceClient.prototype.listContainers = jest.fn().mockReturnValue(
      createMockAsyncIterable([
        { name: 'container-a' },
        { name: 'container-b' },
      ]),
    );

    const result = await driver.listDatabases(makeParams());

    expect(result).toEqual([{ name: 'container-a' }, { name: 'container-b' }]);
  });

  it('should return empty array when no containers exist', async () => {
    MockBlobServiceClient.prototype.listContainers = jest
      .fn()
      .mockReturnValue(createMockAsyncIterable([]));

    const result = await driver.listDatabases(makeParams());

    expect(result).toEqual([]);
  });

  it('should return single container when options.containerName is set (no SDK call)', async () => {
    const listContainersMock = jest.fn();
    MockBlobServiceClient.prototype.listContainers = listContainersMock;

    const params = makeParams({
      options: { authMethod: 'key', containerName: 'pinned-container' },
    });
    const result = await driver.listDatabases(params);

    expect(result).toEqual([{ name: 'pinned-container' }]);
    expect(listContainersMock).not.toHaveBeenCalled();
  });

  it('should return multiple containers correctly', async () => {
    MockBlobServiceClient.prototype.listContainers = jest.fn().mockReturnValue(
      createMockAsyncIterable([
        { name: 'raw' },
        { name: 'curated' },
        { name: 'archive' },
      ]),
    );

    const result = await driver.listDatabases(makeParams());

    expect(result).toHaveLength(3);
    expect(result.map((d) => d.name)).toEqual(['raw', 'curated', 'archive']);
  });
});

// ==========================================
// AzureBlobDriver — listSchemas
// ==========================================

describe('AzureBlobDriver.listSchemas', () => {
  let driver: AzureBlobDriver;
  let mockListBlobsByHierarchy: jest.Mock;
  let mockGetContainerClient: jest.Mock;

  beforeEach(() => {
    driver = new AzureBlobDriver();

    mockListBlobsByHierarchy = jest.fn();
    mockGetContainerClient = jest.fn().mockReturnValue({
      listBlobsByHierarchy: mockListBlobsByHierarchy,
    });

    MockBlobServiceClient.prototype.getContainerClient = mockGetContainerClient;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return virtual directory prefixes as schemas', async () => {
    mockListBlobsByHierarchy.mockReturnValue(
      createMockAsyncIterable([
        { kind: 'prefix', name: 'sales/' },
        { kind: 'prefix', name: 'finance/' },
      ]),
    );

    const result = await driver.listSchemas(makeParams(), 'my-container');

    expect(result).toEqual([
      { name: 'sales', database: 'my-container' },
      { name: 'finance', database: 'my-container' },
    ]);
  });

  it('should prepend _root schema when parquet blobs exist at root level', async () => {
    mockListBlobsByHierarchy.mockReturnValue(
      createMockAsyncIterable([
        { kind: 'prefix', name: 'data/' },
        { kind: 'blob', name: 'snapshot.parquet' },
        { kind: 'blob', name: 'readme.md' },
      ]),
    );

    const result = await driver.listSchemas(makeParams(), 'my-container');

    expect(result[0]).toEqual({ name: '_root', database: 'my-container' });
    expect(result).toContainEqual({ name: 'data', database: 'my-container' });
  });

  it('should not add _root schema when no parquet blobs at root level', async () => {
    mockListBlobsByHierarchy.mockReturnValue(
      createMockAsyncIterable([
        { kind: 'prefix', name: 'data/' },
        { kind: 'blob', name: 'readme.txt' },
      ]),
    );

    const result = await driver.listSchemas(makeParams(), 'my-container');

    expect(result.some((s) => s.name === '_root')).toBe(false);
  });

  it('should strip pathPrefix from schema names', async () => {
    mockListBlobsByHierarchy.mockReturnValue(
      createMockAsyncIterable([
        { kind: 'prefix', name: 'prefix/sales/' },
        { kind: 'prefix', name: 'prefix/finance/' },
      ]),
    );

    const params = makeParams({ options: { authMethod: 'key', pathPrefix: 'prefix' } });
    const result = await driver.listSchemas(params, 'my-container');

    expect(result).toEqual([
      { name: 'sales', database: 'my-container' },
      { name: 'finance', database: 'my-container' },
    ]);
  });

  it('should deduplicate schema names', async () => {
    mockListBlobsByHierarchy.mockReturnValue(
      createMockAsyncIterable([
        { kind: 'prefix', name: 'data/' },
        { kind: 'prefix', name: 'data/' }, // duplicate
      ]),
    );

    const result = await driver.listSchemas(makeParams(), 'my-container');

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('data');
  });

  it('should handle empty container', async () => {
    mockListBlobsByHierarchy.mockReturnValue(createMockAsyncIterable([]));

    const result = await driver.listSchemas(makeParams(), 'my-container');

    expect(result).toEqual([]);
  });
});

// ==========================================
// AzureBlobDriver — listTables
// ==========================================

describe('AzureBlobDriver.listTables', () => {
  let driver: AzureBlobDriver;
  let mockListBlobsByHierarchy: jest.Mock;
  let mockListBlobsFlat: jest.Mock;
  let mockGetContainerClient: jest.Mock;

  beforeEach(() => {
    driver = new AzureBlobDriver();

    mockListBlobsByHierarchy = jest.fn();
    mockListBlobsFlat = jest.fn();

    mockGetContainerClient = jest.fn().mockReturnValue({
      listBlobsByHierarchy: mockListBlobsByHierarchy,
      listBlobsFlat: mockListBlobsFlat,
    });

    MockBlobServiceClient.prototype.getContainerClient = mockGetContainerClient;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return flat parquet files as tables', async () => {
    mockListBlobsByHierarchy.mockReturnValue(
      createMockAsyncIterable([
        { kind: 'blob', name: 'sales/orders.parquet' },
        { kind: 'blob', name: 'sales/returns.parquet' },
        { kind: 'blob', name: 'sales/readme.txt' }, // should be ignored
      ]),
    );

    const result = await driver.listTables(makeParams(), 'my-container', 'sales');

    const names = result.map((t) => t.name);
    expect(names).toContain('orders');
    expect(names).toContain('returns');
    expect(names).not.toContain('readme');
    expect(result.every((t) => t.schema === 'sales' && t.database === 'my-container')).toBe(true);
    expect(result.every((t) => t.type === 'TABLE')).toBe(true);
  });

  it('should detect partitioned folders containing parquet files', async () => {
    mockListBlobsByHierarchy.mockReturnValue(
      createMockAsyncIterable([
        { kind: 'prefix', name: 'sales/events/' },
      ]),
    );
    mockListBlobsFlat.mockReturnValue(
      createMockAsyncIterable([{ name: 'sales/events/date=2026-01-01/part-0.parquet' }]),
    );

    const result = await driver.listTables(makeParams(), 'my-container', 'sales');

    expect(result).toContainEqual(
      expect.objectContaining({ name: 'events', schema: 'sales', type: 'TABLE' }),
    );
  });

  it('should skip sub-folders with no parquet files', async () => {
    mockListBlobsByHierarchy.mockReturnValue(
      createMockAsyncIterable([
        { kind: 'prefix', name: 'sales/empty-folder/' },
      ]),
    );
    mockListBlobsFlat.mockReturnValue(
      createMockAsyncIterable([{ name: 'sales/empty-folder/data.csv' }]),
    );

    const result = await driver.listTables(makeParams(), 'my-container', 'sales');

    expect(result).toHaveLength(0);
  });

  it('should handle _root schema by listing at container root', async () => {
    mockListBlobsByHierarchy.mockReturnValue(
      createMockAsyncIterable([
        { kind: 'blob', name: 'snapshot.parquet' },
      ]),
    );

    const result = await driver.listTables(makeParams(), 'my-container', '_root');

    expect(result).toContainEqual(
      expect.objectContaining({ name: 'snapshot', schema: '_root' }),
    );
    // The listing prefix for _root should be empty string
    expect(mockListBlobsByHierarchy).toHaveBeenCalledWith('/', { prefix: '' });
  });

  it('should handle _root schema with pathPrefix', async () => {
    mockListBlobsByHierarchy.mockReturnValue(
      createMockAsyncIterable([
        { kind: 'blob', name: 'data/raw/snapshot.parquet' },
      ]),
    );

    const params = makeParams({ options: { authMethod: 'key', pathPrefix: 'data/raw' } });
    const result = await driver.listTables(params, 'my-container', '_root');

    expect(result).toContainEqual(expect.objectContaining({ name: 'snapshot' }));
    expect(mockListBlobsByHierarchy).toHaveBeenCalledWith('/', { prefix: 'data/raw/' });
  });

  it('should not duplicate folders checked multiple times', async () => {
    mockListBlobsByHierarchy.mockReturnValue(
      createMockAsyncIterable([
        { kind: 'prefix', name: 'sales/events/' },
        { kind: 'prefix', name: 'sales/events/' }, // duplicate
      ]),
    );
    mockListBlobsFlat.mockReturnValue(
      createMockAsyncIterable([{ name: 'sales/events/part.parquet' }]),
    );

    const result = await driver.listTables(makeParams(), 'my-container', 'sales');

    const eventsTables = result.filter((t) => t.name === 'events');
    expect(eventsTables).toHaveLength(1);
  });
});

// ==========================================
// AzureBlobDriver — URI builders
// ==========================================

describe('AzureBlobDriver — URI builders', () => {
  let driver: AzureBlobDriver;

  beforeEach(() => {
    driver = new AzureBlobDriver();
  });

  describe('buildParquetUri', () => {
    it('should build a simple parquet URI without pathPrefix', () => {
      const params = makeParams({ options: { authMethod: 'key' } });
      const uri = (driver as unknown as Record<string, (...args: unknown[]) => string>)
        .buildParquetUri(params, 'my-container', 'sales', 'orders');
      expect(uri).toBe('az://my-container/sales/orders.parquet');
    });

    it('should include pathPrefix in the URI', () => {
      const params = makeParams({ options: { authMethod: 'key', pathPrefix: 'raw/data' } });
      const uri = (driver as unknown as Record<string, (...args: unknown[]) => string>)
        .buildParquetUri(params, 'my-container', 'sales', 'orders');
      expect(uri).toBe('az://my-container/raw/data/sales/orders.parquet');
    });

    it('should use az:// scheme', () => {
      const params = makeParams();
      const uri = (driver as unknown as Record<string, (...args: unknown[]) => string>)
        .buildParquetUri(params, 'my-container', 'finance', 'gl_entries');
      expect(uri).toMatch(/^az:\/\//);
    });
  });

  describe('buildPartitionedUri', () => {
    it('should build a glob URI without pathPrefix', () => {
      const params = makeParams({ options: { authMethod: 'key' } });
      const uri = (driver as unknown as Record<string, (...args: unknown[]) => string>)
        .buildPartitionedUri(params, 'my-container', 'sales', 'events');
      expect(uri).toBe('az://my-container/sales/events/**/*.parquet');
    });

    it('should include pathPrefix in the glob URI', () => {
      const params = makeParams({ options: { authMethod: 'key', pathPrefix: 'raw' } });
      const uri = (driver as unknown as Record<string, (...args: unknown[]) => string>)
        .buildPartitionedUri(params, 'my-container', 'sales', 'events');
      expect(uri).toBe('az://my-container/raw/sales/events/**/*.parquet');
    });
  });
});

// ==========================================
// AzureBlobDriver — buildSessionOptions
// ==========================================

describe('AzureBlobDriver — buildSessionOptions', () => {
  let driver: AzureBlobDriver;

  beforeEach(() => {
    driver = new AzureBlobDriver();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should build account-key session options', () => {
    const params = makeParams({
      username: 'storageaccount',
      password: 'myAccountKey==',
      host: 'https://storageaccount.blob.core.windows.net',
      options: { authMethod: 'key' },
    });
    const opts = (driver as unknown as Record<string, (...args: unknown[]) => unknown>)
      .buildSessionOptions(params) as {
      storageType: string;
      credentials: Record<string, unknown>;
    };

    expect(opts.storageType).toBe('azure_blob');
    expect(opts.credentials['accountName']).toBe('storageaccount');
    expect(opts.credentials['accountKey']).toBe('myAccountKey==');
    expect(opts.credentials['accountUrl']).toBe('https://storageaccount.blob.core.windows.net');
    expect(opts.credentials['sasToken']).toBeUndefined();
  });

  it('should build SAS-token session options', () => {
    const params = makeSasParams({
      username: 'storageaccount',
      host: 'https://storageaccount.blob.core.windows.net',
      password: '?sv=2021&sig=abc123',
    });
    const opts = (driver as unknown as Record<string, (...args: unknown[]) => unknown>)
      .buildSessionOptions(params) as {
      storageType: string;
      credentials: Record<string, unknown>;
    };

    expect(opts.storageType).toBe('azure_blob');
    expect(opts.credentials['accountName']).toBe('storageaccount');
    // Leading '?' should be stripped for DuckDB
    expect(opts.credentials['sasToken']).toBe('sv=2021&sig=abc123');
    expect(opts.credentials['accountKey']).toBeUndefined();
  });

  it('should not strip SAS token that does not start with ?', () => {
    const params = makeSasParams({
      password: 'sv=2021&sig=abc123', // no leading '?'
    });
    const opts = (driver as unknown as Record<string, (...args: unknown[]) => unknown>)
      .buildSessionOptions(params) as {
      credentials: Record<string, unknown>;
    };

    expect(opts.credentials['sasToken']).toBe('sv=2021&sig=abc123');
  });

  it('should construct accountUrl from host when full URL is provided', () => {
    const params = makeParams({
      host: 'https://myaccount.blob.core.windows.net',
      username: 'myaccount',
    });
    const opts = (driver as unknown as Record<string, (...args: unknown[]) => unknown>)
      .buildSessionOptions(params) as { credentials: Record<string, unknown> };

    expect(opts.credentials['accountUrl']).toBe('https://myaccount.blob.core.windows.net');
  });

  it('should prepend https:// when host does not include protocol', () => {
    const params = makeParams({
      host: 'myaccount.blob.core.windows.net',
      username: 'myaccount',
    });
    const opts = (driver as unknown as Record<string, (...args: unknown[]) => unknown>)
      .buildSessionOptions(params) as { credentials: Record<string, unknown> };

    expect(opts.credentials['accountUrl']).toBe('https://myaccount.blob.core.windows.net');
  });

  it('should fall back to standard Azure URL when host is empty', () => {
    const params = makeParams({ host: '', username: 'myaccount' });
    const opts = (driver as unknown as Record<string, (...args: unknown[]) => unknown>)
      .buildSessionOptions(params) as { credentials: Record<string, unknown> };

    expect(opts.credentials['accountUrl']).toBe('https://myaccount.blob.core.windows.net');
  });
});

// ==========================================
// AzureBlobDriver — getStorageType
// ==========================================

describe('AzureBlobDriver.getStorageType', () => {
  it('should return azure_blob', () => {
    const driver = new AzureBlobDriver();
    expect(driver.getStorageType()).toBe('azure_blob');
  });
});

// ==========================================
// AzureBlobDriver — BlobServiceClient construction
// ==========================================

describe('AzureBlobDriver — BlobServiceClient construction', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should use StorageSharedKeyCredential for key auth', async () => {
    MockStorageSharedKeyCredential.mockImplementation(
      () => ({} as StorageSharedKeyCredential),
    );
    MockBlobServiceClient.prototype.getProperties = jest.fn().mockResolvedValue({});

    const driver = new AzureBlobDriver();
    await driver.testConnection(makeParams());

    expect(MockStorageSharedKeyCredential).toHaveBeenCalledWith(
      'myaccount',
      'base64AccountKey==',
    );
  });

  it('should NOT use StorageSharedKeyCredential for SAS auth', async () => {
    MockBlobServiceClient.prototype.getProperties = jest.fn().mockResolvedValue({});

    const driver = new AzureBlobDriver();
    await driver.testConnection(makeSasParams());

    expect(MockStorageSharedKeyCredential).not.toHaveBeenCalled();
  });

  it('should embed SAS token in the service client URL for SAS auth', async () => {
    MockBlobServiceClient.prototype.getProperties = jest.fn().mockResolvedValue({});

    const driver = new AzureBlobDriver();
    const params = makeSasParams({
      host: 'https://myaccount.blob.core.windows.net',
      password: '?sv=2021&sig=abc',
    });
    await driver.testConnection(params);

    // The BlobServiceClient constructor should have been called with a URL that
    // includes the SAS token as a query string
    const constructorArg = MockBlobServiceClient.mock.calls[0][0];
    expect(constructorArg).toContain('sv=2021');
    expect(constructorArg).toContain('sig=abc');
  });
});
