import { randomBytes } from 'crypto';
import { NotFoundException } from '@nestjs/common';
import { DiscoveryService } from '../discovery.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../../test/mocks/prisma.mock';
import { getDiscoveryDriver } from '../../connections/drivers';
import type { DiscoveryDriver, QueryResult } from '../../connections/drivers';

// Mock the drivers module
jest.mock('../../connections/drivers', () => ({
  getDiscoveryDriver: jest.fn(),
}));

describe('DiscoveryService', () => {
  let service: DiscoveryService;
  let mockPrisma: ReturnType<typeof createMockPrismaService>;
  let mockDriver: jest.Mocked<DiscoveryDriver>;

  const mockConnection = {
    id: 'conn-1',
    name: 'Test Connection',
    dbType: 'postgresql',
    host: 'localhost',
    port: 5432,
    databaseName: 'default_db', // Important: different from target database
    username: 'user',
    encryptedCredential: null,
    useSsl: false,
    options: null,
    createdByUserId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    description: null,
    lastTestedAt: null,
    lastTestResult: null,
    lastTestMessage: null,
  };

  beforeAll(() => {
    // CRITICAL: Must set ENCRYPTION_KEY before constructing service
    process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
  });

  beforeEach(() => {
    // Create mock Prisma instance
    mockPrisma = createMockPrismaService();

    // Create mock driver with all required methods
    mockDriver = {
      executeReadOnlyQuery: jest.fn(),
      listDatabases: jest.fn(),
      listSchemas: jest.fn(),
      listTables: jest.fn(),
      listColumns: jest.fn(),
      listForeignKeys: jest.fn(),
      getSampleData: jest.fn(),
      getColumnStats: jest.fn(),
      getColumnValueOverlap: jest.fn(),
    } as any;

    // Mock getDiscoveryDriver to return our mock driver
    (getDiscoveryDriver as jest.Mock).mockReturnValue(mockDriver);

    // Default mock for connection lookup
    mockPrisma.dataConnection.findUnique.mockResolvedValue(mockConnection as any);

    // Instantiate service directly (no NestJS TestingModule needed)
    service = new DiscoveryService(mockPrisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  describe('getDistinctColumnValues', () => {
    describe('database parameter forwarding', () => {
      it('should forward the target database in params, not the connection\'s databaseName', async () => {
        // Arrange
        const mockQueryResult: QueryResult = {
          columns: ['value'],
          rows: [['val1'], ['val2']],
          rowCount: 2,
        };
        mockDriver.executeReadOnlyQuery.mockResolvedValue(mockQueryResult);

        // Act - target database is 'target_db', different from connection's 'default_db'
        await service.getDistinctColumnValues(
          'conn-1',
          'target_db',
          'public',
          'products',
          'description',
        );

        // Assert - verify the first argument (params) has databaseName overridden
        expect(mockDriver.executeReadOnlyQuery).toHaveBeenCalledTimes(1);
        const callArgs = mockDriver.executeReadOnlyQuery.mock.calls[0];
        const params = callArgs[0];

        expect(params).toMatchObject({
          databaseName: 'target_db', // Should be the target, not 'default_db'
        });
      });

      it('should preserve other connection params (host, port, username, ssl)', async () => {
        // Arrange
        const mockQueryResult: QueryResult = {
          columns: ['value'],
          rows: [['val1']],
          rowCount: 1,
        };
        mockDriver.executeReadOnlyQuery.mockResolvedValue(mockQueryResult);

        // Act
        await service.getDistinctColumnValues(
          'conn-1',
          'target_db',
          'public',
          'products',
          'description',
        );

        // Assert
        const callArgs = mockDriver.executeReadOnlyQuery.mock.calls[0];
        const params = callArgs[0];

        expect(params).toMatchObject({
          host: 'localhost',
          port: 5432,
          username: 'user',
          useSsl: false,
          databaseName: 'target_db', // Only databaseName should be overridden
        });
      });
    });

    describe('return values', () => {
      it('should return distinct values from query result', async () => {
        // Arrange
        const mockQueryResult: QueryResult = {
          columns: ['value'],
          rows: [['val1'], ['val2'], ['val3']],
          rowCount: 3,
        };
        mockDriver.executeReadOnlyQuery.mockResolvedValue(mockQueryResult);

        // Act
        const result = await service.getDistinctColumnValues(
          'conn-1',
          'target_db',
          'public',
          'products',
          'description',
        );

        // Assert
        expect(result).toEqual(['val1', 'val2', 'val3']);
      });

      it('should convert all row values to strings', async () => {
        // Arrange
        const mockQueryResult: QueryResult = {
          columns: ['value'],
          rows: [[123], [null], [true], ['text']],
          rowCount: 4,
        };
        mockDriver.executeReadOnlyQuery.mockResolvedValue(mockQueryResult);

        // Act
        const result = await service.getDistinctColumnValues(
          'conn-1',
          'target_db',
          'public',
          'products',
          'status',
        );

        // Assert
        expect(result).toEqual(['123', 'null', 'true', 'text']);
        expect(result.every(v => typeof v === 'string')).toBe(true);
      });

      it('should return empty array when no rows are returned', async () => {
        // Arrange
        const mockQueryResult: QueryResult = {
          columns: ['value'],
          rows: [],
          rowCount: 0,
        };
        mockDriver.executeReadOnlyQuery.mockResolvedValue(mockQueryResult);

        // Act
        const result = await service.getDistinctColumnValues(
          'conn-1',
          'target_db',
          'public',
          'products',
          'description',
        );

        // Assert
        expect(result).toEqual([]);
      });
    });

    describe('SQL generation for PostgreSQL', () => {
      it('should build correct SQL without orderByColumn', async () => {
        // Arrange
        const mockQueryResult: QueryResult = {
          columns: ['value'],
          rows: [['val1']],
          rowCount: 1,
        };
        mockDriver.executeReadOnlyQuery.mockResolvedValue(mockQueryResult);

        // Act
        await service.getDistinctColumnValues(
          'conn-1',
          'target_db',
          'public',
          'products',
          'description',
          undefined, // no orderByColumn
          5,
        );

        // Assert
        const callArgs = mockDriver.executeReadOnlyQuery.mock.calls[0];
        const sql = callArgs[1];

        expect(sql).toContain('SELECT DISTINCT');
        expect(sql).toContain('"description"::text AS value');
        expect(sql).toContain('FROM (');
        expect(sql).toContain('"public"."products"');
        expect(sql).toContain('WHERE "description" IS NOT NULL');
        expect(sql).toContain('LIMIT 100'); // Subquery sample limit
        expect(sql).toContain('LIMIT 5'); // Outer distinct limit
        expect(sql).not.toContain('ORDER BY'); // No ordering without recency column
      });

      it('should build correct SQL with orderByColumn', async () => {
        // Arrange
        const mockQueryResult: QueryResult = {
          columns: ['value'],
          rows: [['val1']],
          rowCount: 1,
        };
        mockDriver.executeReadOnlyQuery.mockResolvedValue(mockQueryResult);

        // Act
        await service.getDistinctColumnValues(
          'conn-1',
          'target_db',
          'public',
          'products',
          'description',
          'updated_at',
          5,
        );

        // Assert
        const callArgs = mockDriver.executeReadOnlyQuery.mock.calls[0];
        const sql = callArgs[1];

        expect(sql).toContain('SELECT DISTINCT');
        expect(sql).toContain('"description"::text AS value');
        expect(sql).toContain('FROM (');
        expect(sql).toContain('SELECT "description", "updated_at"');
        expect(sql).toContain('"public"."products"');
        expect(sql).toContain('WHERE "description" IS NOT NULL');
        expect(sql).toContain('ORDER BY "updated_at" DESC');
        expect(sql).toContain('LIMIT 100'); // Subquery limit
        expect(sql).toMatch(/\) sub/); // Subquery alias
        expect(sql).toContain('LIMIT 5'); // Outer limit
      });

      it('should use custom limit value', async () => {
        // Arrange
        const mockQueryResult: QueryResult = {
          columns: ['value'],
          rows: [['val1']],
          rowCount: 1,
        };
        mockDriver.executeReadOnlyQuery.mockResolvedValue(mockQueryResult);

        // Act
        await service.getDistinctColumnValues(
          'conn-1',
          'target_db',
          'public',
          'products',
          'description',
          undefined,
          10, // custom limit
        );

        // Assert
        const callArgs = mockDriver.executeReadOnlyQuery.mock.calls[0];
        const sql = callArgs[1];

        expect(sql).toContain('LIMIT 10');
      });

      it('should sanitize and quote identifiers correctly', async () => {
        // Arrange
        const mockQueryResult: QueryResult = {
          columns: ['value'],
          rows: [['val1']],
          rowCount: 1,
        };
        mockDriver.executeReadOnlyQuery.mockResolvedValue(mockQueryResult);

        // Act - identifiers with special characters should be sanitized
        await service.getDistinctColumnValues(
          'conn-1',
          'target_db',
          'my_schema',
          'product_table',
          'col_name',
        );

        // Assert
        const callArgs = mockDriver.executeReadOnlyQuery.mock.calls[0];
        const sql = callArgs[1];

        // PostgreSQL uses double quotes
        expect(sql).toContain('"my_schema"."product_table"');
        expect(sql).toContain('"col_name"');
      });
    });

    describe('error handling', () => {
      it('should throw NotFoundException when connection does not exist', async () => {
        // Arrange
        mockPrisma.dataConnection.findUnique.mockResolvedValue(null);

        // Act & Assert
        await expect(
          service.getDistinctColumnValues(
            'nonexistent-id',
            'target_db',
            'public',
            'products',
            'description',
          ),
        ).rejects.toThrow(NotFoundException);

        expect(mockDriver.executeReadOnlyQuery).not.toHaveBeenCalled();
      });

      it('should propagate driver errors', async () => {
        // Arrange
        const driverError = new Error('Connection timeout');
        mockDriver.executeReadOnlyQuery.mockRejectedValue(driverError);

        // Act & Assert
        await expect(
          service.getDistinctColumnValues(
            'conn-1',
            'target_db',
            'public',
            'products',
            'description',
          ),
        ).rejects.toThrow('Connection timeout');
      });
    });

    describe('driver selection', () => {
      it('should call getDiscoveryDriver with connection dbType', async () => {
        // Arrange
        const mockQueryResult: QueryResult = {
          columns: ['value'],
          rows: [['val1']],
          rowCount: 1,
        };
        mockDriver.executeReadOnlyQuery.mockResolvedValue(mockQueryResult);

        // Act
        await service.getDistinctColumnValues(
          'conn-1',
          'target_db',
          'public',
          'products',
          'description',
        );

        // Assert
        expect(getDiscoveryDriver).toHaveBeenCalledWith('postgresql');
      });
    });
  });
});
