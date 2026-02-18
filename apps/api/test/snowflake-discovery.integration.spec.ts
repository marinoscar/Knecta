/**
 * Snowflake Driver - Mocked Integration Tests
 *
 * Tests all SnowflakeDriver methods with a fully mocked snowflake-sdk.
 * No real Snowflake connection is required.
 */

import { SnowflakeDriver } from '../src/connections/drivers/snowflake.driver';

// ---------------------------------------------------------------------------
// Mock snowflake-sdk at module level
// ---------------------------------------------------------------------------

const mockDestroy = jest.fn((cb) => cb(null));

/**
 * Build a mock statement object whose getColumns() returns column-name objects
 * matching the query type.
 */
function buildMockStmt(columnNames) {
  return {
    getColumns: () => columnNames.map((name) => ({ getName: () => name })),
  };
}

/**
 * The mock execute function.  It inspects sqlText and dispatches the right
 * mock rows + columns.
 */
const mockExecute = jest.fn(
  (opts) => {
    const { sqlText, complete } = opts;

    // ------------------------------------------------------------------
    // testConnection ping
    // ------------------------------------------------------------------
    if (sqlText === 'SELECT 1') {
      const stmt = buildMockStmt(['1']);
      complete(null, stmt, [{ '1': 1 }]);
      return;
    }

    // ------------------------------------------------------------------
    // SHOW DATABASES
    // ------------------------------------------------------------------
    if (sqlText.trim().toUpperCase().startsWith('SHOW DATABASES')) {
      const stmt = buildMockStmt(['name']);
      complete(null, stmt, [{ name: 'MY_DB' }, { name: 'SNOWFLAKE' }]);
      return;
    }

    // ------------------------------------------------------------------
    // SHOW SCHEMAS
    // ------------------------------------------------------------------
    if (sqlText.trim().toUpperCase().startsWith('SHOW SCHEMAS')) {
      const stmt = buildMockStmt(['name']);
      complete(null, stmt, [
        { name: 'PUBLIC' },
        { name: 'INFORMATION_SCHEMA' },
      ]);
      return;
    }

    // ------------------------------------------------------------------
    // INFORMATION_SCHEMA.TABLES
    // ------------------------------------------------------------------
    if (sqlText.includes('INFORMATION_SCHEMA.TABLES')) {
      const stmt = buildMockStmt([
        'TABLE_NAME',
        'TABLE_SCHEMA',
        'TABLE_TYPE',
        'ROW_COUNT',
      ]);
      complete(null, stmt, [
        {
          TABLE_NAME: 'USERS',
          TABLE_SCHEMA: 'PUBLIC',
          TABLE_TYPE: 'BASE TABLE',
          ROW_COUNT: 1000,
        },
        {
          TABLE_NAME: 'USER_VIEW',
          TABLE_SCHEMA: 'PUBLIC',
          TABLE_TYPE: 'VIEW',
          ROW_COUNT: null,
        },
      ]);
      return;
    }

    // ------------------------------------------------------------------
    // INFORMATION_SCHEMA.COLUMNS
    // ------------------------------------------------------------------
    if (sqlText.includes('INFORMATION_SCHEMA.COLUMNS')) {
      const stmt = buildMockStmt([
        'COLUMN_NAME',
        'DATA_TYPE',
        'NATIVE_TYPE',
        'IS_NULLABLE',
        'COLUMN_DEFAULT',
        'CHARACTER_MAXIMUM_LENGTH',
        'NUMERIC_PRECISION',
        'NUMERIC_SCALE',
        'COMMENT',
      ]);
      complete(null, stmt, [
        {
          COLUMN_NAME: 'ID',
          DATA_TYPE: 'NUMBER',
          NATIVE_TYPE: 'NUMBER',
          IS_NULLABLE: 'NO',
          COLUMN_DEFAULT: null,
          CHARACTER_MAXIMUM_LENGTH: null,
          NUMERIC_PRECISION: 38,
          NUMERIC_SCALE: 0,
          COMMENT: 'Primary key',
        },
        {
          COLUMN_NAME: 'EMAIL',
          DATA_TYPE: 'VARCHAR',
          NATIVE_TYPE: 'VARCHAR',
          IS_NULLABLE: 'YES',
          COLUMN_DEFAULT: null,
          CHARACTER_MAXIMUM_LENGTH: 255,
          NUMERIC_PRECISION: null,
          NUMERIC_SCALE: null,
          COMMENT: null,
        },
      ]);
      return;
    }

    // ------------------------------------------------------------------
    // SHOW PRIMARY KEYS
    // ------------------------------------------------------------------
    if (sqlText.trim().toUpperCase().startsWith('SHOW PRIMARY KEYS')) {
      const stmt = buildMockStmt(['column_name']);
      complete(null, stmt, [{ column_name: 'ID' }]);
      return;
    }

    // ------------------------------------------------------------------
    // SHOW IMPORTED KEYS (foreign keys)
    // ------------------------------------------------------------------
    if (sqlText.trim().toUpperCase().startsWith('SHOW IMPORTED KEYS')) {
      const stmt = buildMockStmt([
        'fk_name',
        'fk_schema_name',
        'fk_table_name',
        'fk_column_name',
        'pk_schema_name',
        'pk_table_name',
        'pk_column_name',
      ]);
      complete(null, stmt, [
        {
          fk_name: 'FK_ORDERS_USER',
          fk_schema_name: 'PUBLIC',
          fk_table_name: 'ORDERS',
          fk_column_name: 'USER_ID',
          pk_schema_name: 'PUBLIC',
          pk_table_name: 'USERS',
          pk_column_name: 'ID',
        },
      ]);
      return;
    }

    // ------------------------------------------------------------------
    // getSampleData — SELECT * ... LIMIT
    // ------------------------------------------------------------------
    if (sqlText.includes('SELECT *') && sqlText.includes('LIMIT')) {
      const stmt = buildMockStmt(['ID', 'EMAIL']);
      complete(null, stmt, [
        { ID: 1, EMAIL: 'alice@example.com' },
        { ID: 2, EMAIL: 'bob@example.com' },
      ]);
      return;
    }

    // ------------------------------------------------------------------
    // getColumnStats — COUNT(DISTINCT ...) stats query
    // ------------------------------------------------------------------
    if (sqlText.includes('COUNT(DISTINCT')) {
      const stmt = buildMockStmt([
        'distinctCount',
        'nullCount',
        'totalCount',
        'min',
        'max',
      ]);
      complete(null, stmt, [
        {
          distinctCount: '950',
          nullCount: '50',
          totalCount: '1000',
          min: 'alice@example.com',
          max: 'zara@example.com',
        },
      ]);
      return;
    }

    // ------------------------------------------------------------------
    // getColumnStats — SELECT DISTINCT sample values query
    // ------------------------------------------------------------------
    if (sqlText.includes('SELECT DISTINCT')) {
      const stmt = buildMockStmt(['value']);
      complete(null, stmt, [
        { value: 'alice@example.com' },
        { value: 'bob@example.com' },
      ]);
      return;
    }

    // ------------------------------------------------------------------
    // executeReadOnlyQuery — arbitrary SELECT
    // ------------------------------------------------------------------
    const stmt = buildMockStmt(['ID', 'NAME']);
    complete(null, stmt, [
      { ID: 1, NAME: 'Row1' },
      { ID: 2, NAME: 'Row2' },
    ]);
  },
);

const mockConnect = jest.fn(
  (cb) => {
    // Return the same mock connection object as "conn"
    cb(null, mockConnectionObj);
  },
);

const mockConnectionObj = {
  connect: mockConnect,
  execute: mockExecute,
  destroy: mockDestroy,
};

const mockCreateConnection = jest.fn(() => mockConnectionObj);

// Mock the snowflake-sdk module — intercepts both static and dynamic imports
jest.mock('snowflake-sdk', () => ({
  createConnection: mockCreateConnection,
}));

// ---------------------------------------------------------------------------
// Test params
// ---------------------------------------------------------------------------

const testParams = {
  host: 'test.snowflakecomputing.com',
  port: 443,
  username: 'testuser',
  password: 'testpass',
  useSsl: true,
  options: {
    account: 'test-account',
    warehouse: 'TEST_WH',
    role: 'TEST_ROLE',
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SnowflakeDriver (mocked integration)', () => {
  let driver;

  beforeEach(() => {
    driver = new SnowflakeDriver();
    jest.clearAllMocks();

    // Re-apply default mock implementation after clearAllMocks
    mockConnect.mockImplementation(
      (cb) => {
        cb(null, mockConnectionObj);
      },
    );
    mockExecute.mockImplementation(
      (opts) => {
        const { sqlText, complete } = opts;

        if (sqlText === 'SELECT 1') {
          complete(null, buildMockStmt(['1']), [{ '1': 1 }]);
          return;
        }
        if (sqlText.trim().toUpperCase().startsWith('SHOW DATABASES')) {
          complete(null, buildMockStmt(['name']), [
            { name: 'MY_DB' },
            { name: 'SNOWFLAKE' },
          ]);
          return;
        }
        if (sqlText.trim().toUpperCase().startsWith('SHOW SCHEMAS')) {
          complete(null, buildMockStmt(['name']), [
            { name: 'PUBLIC' },
            { name: 'INFORMATION_SCHEMA' },
          ]);
          return;
        }
        if (sqlText.includes('INFORMATION_SCHEMA.TABLES')) {
          complete(
            null,
            buildMockStmt([
              'TABLE_NAME',
              'TABLE_SCHEMA',
              'TABLE_TYPE',
              'ROW_COUNT',
            ]),
            [
              {
                TABLE_NAME: 'USERS',
                TABLE_SCHEMA: 'PUBLIC',
                TABLE_TYPE: 'BASE TABLE',
                ROW_COUNT: 1000,
              },
              {
                TABLE_NAME: 'USER_VIEW',
                TABLE_SCHEMA: 'PUBLIC',
                TABLE_TYPE: 'VIEW',
                ROW_COUNT: null,
              },
            ],
          );
          return;
        }
        if (sqlText.includes('INFORMATION_SCHEMA.COLUMNS')) {
          complete(
            null,
            buildMockStmt([
              'COLUMN_NAME',
              'DATA_TYPE',
              'NATIVE_TYPE',
              'IS_NULLABLE',
              'COLUMN_DEFAULT',
              'CHARACTER_MAXIMUM_LENGTH',
              'NUMERIC_PRECISION',
              'NUMERIC_SCALE',
              'COMMENT',
            ]),
            [
              {
                COLUMN_NAME: 'ID',
                DATA_TYPE: 'NUMBER',
                NATIVE_TYPE: 'NUMBER',
                IS_NULLABLE: 'NO',
                COLUMN_DEFAULT: null,
                CHARACTER_MAXIMUM_LENGTH: null,
                NUMERIC_PRECISION: 38,
                NUMERIC_SCALE: 0,
                COMMENT: 'Primary key',
              },
              {
                COLUMN_NAME: 'EMAIL',
                DATA_TYPE: 'VARCHAR',
                NATIVE_TYPE: 'VARCHAR',
                IS_NULLABLE: 'YES',
                COLUMN_DEFAULT: null,
                CHARACTER_MAXIMUM_LENGTH: 255,
                NUMERIC_PRECISION: null,
                NUMERIC_SCALE: null,
                COMMENT: null,
              },
            ],
          );
          return;
        }
        if (sqlText.trim().toUpperCase().startsWith('SHOW PRIMARY KEYS')) {
          complete(null, buildMockStmt(['column_name']), [
            { column_name: 'ID' },
          ]);
          return;
        }
        if (sqlText.trim().toUpperCase().startsWith('SHOW IMPORTED KEYS')) {
          complete(
            null,
            buildMockStmt([
              'fk_name',
              'fk_schema_name',
              'fk_table_name',
              'fk_column_name',
              'pk_schema_name',
              'pk_table_name',
              'pk_column_name',
            ]),
            [
              {
                fk_name: 'FK_ORDERS_USER',
                fk_schema_name: 'PUBLIC',
                fk_table_name: 'ORDERS',
                fk_column_name: 'USER_ID',
                pk_schema_name: 'PUBLIC',
                pk_table_name: 'USERS',
                pk_column_name: 'ID',
              },
            ],
          );
          return;
        }
        if (sqlText.includes('SELECT *') && sqlText.includes('LIMIT')) {
          complete(null, buildMockStmt(['ID', 'EMAIL']), [
            { ID: 1, EMAIL: 'alice@example.com' },
            { ID: 2, EMAIL: 'bob@example.com' },
          ]);
          return;
        }
        if (sqlText.includes('COUNT(DISTINCT')) {
          complete(
            null,
            buildMockStmt([
              'distinctCount',
              'nullCount',
              'totalCount',
              'min',
              'max',
            ]),
            [
              {
                distinctCount: '950',
                nullCount: '50',
                totalCount: '1000',
                min: 'alice@example.com',
                max: 'zara@example.com',
              },
            ],
          );
          return;
        }
        if (sqlText.includes('SELECT DISTINCT')) {
          complete(null, buildMockStmt(['value']), [
            { value: 'alice@example.com' },
            { value: 'bob@example.com' },
          ]);
          return;
        }
        // Default
        complete(null, buildMockStmt(['ID', 'NAME']), [
          { ID: 1, NAME: 'Row1' },
          { ID: 2, NAME: 'Row2' },
        ]);
      },
    );
    mockDestroy.mockImplementation(
      (cb) => cb(null),
    );
    mockCreateConnection.mockReturnValue(mockConnectionObj);
  });

  // =========================================================================
  // testConnection
  // =========================================================================

  describe('testConnection', () => {
    it('should return success result with correct shape', async () => {
      const result = await driver.testConnection(testParams);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Connection successful');
      expect(typeof result.latencyMs).toBe('number');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should return error without throwing when account is missing', async () => {
      const paramsWithoutAccount = {
        ...testParams,
        options: {},
      };

      const result = await driver.testConnection(paramsWithoutAccount);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Account identifier is required');
      expect(typeof result.latencyMs).toBe('number');
    });

    it('should return error result when connection fails', async () => {
      mockConnect.mockImplementationOnce(
        (cb) => {
          cb(new Error('Invalid credentials'), null);
        },
      );

      const result = await driver.testConnection(testParams);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid credentials');
      expect(typeof result.latencyMs).toBe('number');
    });

    it('should return error result when execute fails after connect', async () => {
      mockExecute.mockImplementationOnce(
        (opts) => {
          opts.complete(new Error('Query failed'), null, undefined);
        },
      );

      const result = await driver.testConnection(testParams);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Query failed');
    });
  });

  // =========================================================================
  // listDatabases
  // =========================================================================

  describe('listDatabases', () => {
    it('should return DatabaseInfo[] and filter out SNOWFLAKE system database', async () => {
      const result = await driver.listDatabases(testParams);

      expect(Array.isArray(result)).toBe(true);
      // MY_DB should be present
      expect(result).toContainEqual({ name: 'MY_DB' });
      // SNOWFLAKE system DB should be filtered out
      const names = result.map((db) => db.name);
      expect(names).not.toContain('SNOWFLAKE');
    });

    it('should call SHOW DATABASES on the connection', async () => {
      await driver.listDatabases(testParams);

      const executeCalls = mockExecute.mock.calls;
      const showDbCall = executeCalls.find(([opts]) =>
        opts.sqlText.trim().toUpperCase().startsWith('SHOW DATABASES'),
      );
      expect(showDbCall).toBeDefined();
    });

    it('should destroy the connection after listing databases', async () => {
      await driver.listDatabases(testParams);

      expect(mockDestroy).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // listSchemas
  // =========================================================================

  describe('listSchemas', () => {
    it('should return SchemaInfo[] and filter out INFORMATION_SCHEMA', async () => {
      const result = await driver.listSchemas(testParams, 'MY_DB');

      expect(Array.isArray(result)).toBe(true);
      expect(result).toContainEqual({ name: 'PUBLIC', database: 'MY_DB' });
      // INFORMATION_SCHEMA must be filtered
      const names = result.map((s) => s.name);
      expect(names).not.toContain('INFORMATION_SCHEMA');
    });

    it('should include the database parameter in each SchemaInfo', async () => {
      const result = await driver.listSchemas(testParams, 'MY_DB');

      result.forEach((schema) => {
        expect(schema.database).toBe('MY_DB');
      });
    });

    it('should destroy the connection after listing schemas', async () => {
      await driver.listSchemas(testParams, 'MY_DB');

      expect(mockDestroy).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // listTables
  // =========================================================================

  describe('listTables', () => {
    it('should return TableInfo[] with correct type mapping', async () => {
      const result = await driver.listTables(testParams, 'MY_DB', 'PUBLIC');

      expect(Array.isArray(result)).toBe(true);

      const usersTable = result.find((t) => t.name === 'USERS');
      expect(usersTable).toBeDefined();
      expect(usersTable.type).toBe('TABLE');
      expect(usersTable.rowCountEstimate).toBe(1000);

      const viewTable = result.find((t) => t.name === 'USER_VIEW');
      expect(viewTable).toBeDefined();
      expect(viewTable.type).toBe('VIEW');
      expect(viewTable.rowCountEstimate).toBeUndefined();
    });

    it('should include schema and database on every TableInfo', async () => {
      const result = await driver.listTables(testParams, 'MY_DB', 'PUBLIC');

      result.forEach((table) => {
        expect(table.database).toBe('MY_DB');
        expect(typeof table.schema).toBe('string');
      });
    });

    it('should destroy the connection after listing tables', async () => {
      await driver.listTables(testParams, 'MY_DB', 'PUBLIC');

      expect(mockDestroy).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // listColumns
  // =========================================================================

  describe('listColumns', () => {
    it('should return ColumnInfo[] with correct types and nullable flags', async () => {
      const result = await driver.listColumns(
        testParams,
        'MY_DB',
        'PUBLIC',
        'USERS',
      );

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);

      const idCol = result.find((c) => c.name === 'ID');
      expect(idCol).toBeDefined();
      expect(idCol.dataType).toBe('NUMBER');
      expect(idCol.nativeType).toBe('NUMBER');
      expect(idCol.isNullable).toBe(false);
      expect(idCol.numericPrecision).toBe(38);
      expect(idCol.numericScale).toBe(0);
      expect(idCol.comment).toBe('Primary key');

      const emailCol = result.find((c) => c.name === 'EMAIL');
      expect(emailCol).toBeDefined();
      expect(emailCol.dataType).toBe('VARCHAR');
      expect(emailCol.isNullable).toBe(true);
      expect(emailCol.maxLength).toBe(255);
      expect(emailCol.numericPrecision).toBeUndefined();
    });

    it('should mark ID as primary key based on SHOW PRIMARY KEYS result', async () => {
      const result = await driver.listColumns(
        testParams,
        'MY_DB',
        'PUBLIC',
        'USERS',
      );

      const idCol = result.find((c) => c.name === 'ID');
      expect(idCol.isPrimaryKey).toBe(true);

      const emailCol = result.find((c) => c.name === 'EMAIL');
      expect(emailCol.isPrimaryKey).toBe(false);
    });

    it('should destroy the connection after listing columns', async () => {
      await driver.listColumns(testParams, 'MY_DB', 'PUBLIC', 'USERS');

      expect(mockDestroy).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // listForeignKeys
  // =========================================================================

  describe('listForeignKeys', () => {
    it('should return ForeignKeyInfo[] with grouped columns per constraint', async () => {
      const result = await driver.listForeignKeys(testParams, 'MY_DB', 'PUBLIC');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);

      const fk = result[0];
      expect(fk.constraintName).toBe('FK_ORDERS_USER');
      expect(fk.fromSchema).toBe('PUBLIC');
      expect(fk.fromTable).toBe('ORDERS');
      expect(fk.fromColumns).toEqual(['USER_ID']);
      expect(fk.toSchema).toBe('PUBLIC');
      expect(fk.toTable).toBe('USERS');
      expect(fk.toColumns).toEqual(['ID']);
    });

    it('should group multiple column pairs under a single constraint', async () => {
      // Override to return two rows for the same constraint (composite FK)
      mockExecute.mockImplementationOnce(
        (opts) => {
          opts.complete(
            null,
            buildMockStmt([
              'fk_name',
              'fk_schema_name',
              'fk_table_name',
              'fk_column_name',
              'pk_schema_name',
              'pk_table_name',
              'pk_column_name',
            ]),
            [
              {
                fk_name: 'FK_COMPOSITE',
                fk_schema_name: 'PUBLIC',
                fk_table_name: 'ORDERS',
                fk_column_name: 'TENANT_ID',
                pk_schema_name: 'PUBLIC',
                pk_table_name: 'TENANTS',
                pk_column_name: 'ID',
              },
              {
                fk_name: 'FK_COMPOSITE',
                fk_schema_name: 'PUBLIC',
                fk_table_name: 'ORDERS',
                fk_column_name: 'ORDER_ID',
                pk_schema_name: 'PUBLIC',
                pk_table_name: 'TENANTS',
                pk_column_name: 'ORDER_REF',
              },
            ],
          );
        },
      );

      const result = await driver.listForeignKeys(testParams, 'MY_DB', 'PUBLIC');

      expect(result.length).toBe(1);
      expect(result[0].fromColumns).toEqual(['TENANT_ID', 'ORDER_ID']);
      expect(result[0].toColumns).toEqual(['ID', 'ORDER_REF']);
    });

    it('should return empty array when no foreign keys exist', async () => {
      mockExecute.mockImplementationOnce(
        (opts) => {
          opts.complete(null, buildMockStmt(['fk_name']), []);
        },
      );

      const result = await driver.listForeignKeys(testParams, 'MY_DB', 'PUBLIC');

      expect(result).toEqual([]);
    });

    it('should destroy the connection after listing foreign keys', async () => {
      await driver.listForeignKeys(testParams, 'MY_DB', 'PUBLIC');

      expect(mockDestroy).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // getSampleData
  // =========================================================================

  describe('getSampleData', () => {
    it('should return SampleDataResult with columns and row arrays', async () => {
      const result = await driver.getSampleData(
        testParams,
        'MY_DB',
        'PUBLIC',
        'USERS',
      );

      expect(result).toHaveProperty('columns');
      expect(result).toHaveProperty('rows');
      expect(Array.isArray(result.columns)).toBe(true);
      expect(Array.isArray(result.rows)).toBe(true);

      expect(result.columns).toEqual(['ID', 'EMAIL']);
      expect(result.rows.length).toBe(2);
      // Each row is a value array in column order
      expect(result.rows[0]).toEqual([1, 'alice@example.com']);
      expect(result.rows[1]).toEqual([2, 'bob@example.com']);
    });

    it('should use the provided limit in the SQL query', async () => {
      await driver.getSampleData(testParams, 'MY_DB', 'PUBLIC', 'USERS', 3);

      const executeCalls = mockExecute.mock.calls;
      const sampleCall = executeCalls.find(([opts]) =>
        opts.sqlText.includes('SELECT *') &&
        opts.sqlText.includes('LIMIT 3'),
      );
      expect(sampleCall).toBeDefined();
    });

    it('should destroy the connection after getting sample data', async () => {
      await driver.getSampleData(testParams, 'MY_DB', 'PUBLIC', 'USERS');

      expect(mockDestroy).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // getColumnStats
  // =========================================================================

  describe('getColumnStats', () => {
    it('should return ColumnStatsResult with all numeric fields and sample values', async () => {
      const result = await driver.getColumnStats(
        testParams,
        'MY_DB',
        'PUBLIC',
        'USERS',
        'EMAIL',
      );

      expect(result).toHaveProperty('distinctCount');
      expect(result).toHaveProperty('nullCount');
      expect(result).toHaveProperty('totalCount');
      expect(result).toHaveProperty('sampleValues');
      expect(result).toHaveProperty('min');
      expect(result).toHaveProperty('max');

      expect(result.distinctCount).toBe(950);
      expect(result.nullCount).toBe(50);
      expect(result.totalCount).toBe(1000);
      expect(result.min).toBe('alice@example.com');
      expect(result.max).toBe('zara@example.com');
      expect(Array.isArray(result.sampleValues)).toBe(true);
      expect(result.sampleValues).toContain('alice@example.com');
      expect(result.sampleValues).toContain('bob@example.com');
    });

    it('should issue two execute calls (stats + sample values)', async () => {
      await driver.getColumnStats(
        testParams,
        'MY_DB',
        'PUBLIC',
        'USERS',
        'EMAIL',
      );

      // Expect at least two execute calls for this method
      expect(mockExecute.mock.calls.length).toBeGreaterThanOrEqual(2);

      const sqlTexts = mockExecute.mock.calls.map(
        ([opts]) => opts.sqlText,
      );
      const hasStatsQuery = sqlTexts.some((s) => s.includes('COUNT(DISTINCT'));
      const hasSampleQuery = sqlTexts.some((s) => s.includes('SELECT DISTINCT'));
      expect(hasStatsQuery).toBe(true);
      expect(hasSampleQuery).toBe(true);
    });

    it('should destroy the connection after getting column stats', async () => {
      await driver.getColumnStats(
        testParams,
        'MY_DB',
        'PUBLIC',
        'USERS',
        'EMAIL',
      );

      expect(mockDestroy).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // executeReadOnlyQuery
  // =========================================================================

  describe('executeReadOnlyQuery', () => {
    it('should return QueryResult with columns, rows, and rowCount for SELECT query', async () => {
      const result = await driver.executeReadOnlyQuery(
        testParams,
        'SELECT ID, NAME FROM MY_TABLE',
      );

      expect(result).toHaveProperty('columns');
      expect(result).toHaveProperty('rows');
      expect(result).toHaveProperty('rowCount');
      expect(Array.isArray(result.columns)).toBe(true);
      expect(Array.isArray(result.rows)).toBe(true);
      expect(typeof result.rowCount).toBe('number');

      expect(result.columns).toEqual(['ID', 'NAME']);
      expect(result.rowCount).toBe(2);
    });

    it('should respect the maxRows limit', async () => {
      // Override execute to return 5 rows
      mockExecute.mockImplementationOnce(
        (opts) => {
          opts.complete(
            null,
            buildMockStmt(['ID']),
            [
              { ID: 1 },
              { ID: 2 },
              { ID: 3 },
              { ID: 4 },
              { ID: 5 },
            ],
          );
        },
      );

      const result = await driver.executeReadOnlyQuery(
        testParams,
        'SELECT ID FROM MY_TABLE',
        3,
      );

      expect(result.rows.length).toBe(3);
      expect(result.rowCount).toBe(5); // total before limit
    });

    it('should throw for INSERT queries', async () => {
      await expect(
        driver.executeReadOnlyQuery(
          testParams,
          "INSERT INTO users VALUES (1, 'test')",
        ),
      ).rejects.toThrow('Write operations are not allowed');
    });

    it('should throw for UPDATE queries', async () => {
      await expect(
        driver.executeReadOnlyQuery(
          testParams,
          "UPDATE users SET name = 'x' WHERE id = 1",
        ),
      ).rejects.toThrow('Write operations are not allowed');
    });

    it('should throw for DELETE queries', async () => {
      await expect(
        driver.executeReadOnlyQuery(
          testParams,
          'DELETE FROM users WHERE id = 1',
        ),
      ).rejects.toThrow('Write operations are not allowed');
    });

    it('should throw for DROP queries', async () => {
      await expect(
        driver.executeReadOnlyQuery(testParams, 'DROP TABLE users'),
      ).rejects.toThrow('Write operations are not allowed');
    });

    it('should destroy the connection after executing a read-only query', async () => {
      await driver.executeReadOnlyQuery(
        testParams,
        'SELECT ID, NAME FROM MY_TABLE',
      );

      expect(mockDestroy).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Connection error propagation
  // =========================================================================

  describe('connection error handling', () => {
    it('should propagate connection failure from listDatabases', async () => {
      mockConnect.mockImplementationOnce(
        (cb) => {
          cb(new Error('Network unreachable'), null);
        },
      );

      await expect(driver.listDatabases(testParams)).rejects.toThrow(
        'Network unreachable',
      );
    });

    it('should propagate connection failure from listSchemas', async () => {
      mockConnect.mockImplementationOnce(
        (cb) => {
          cb(new Error('Authentication failed'), null);
        },
      );

      await expect(
        driver.listSchemas(testParams, 'MY_DB'),
      ).rejects.toThrow('Authentication failed');
    });

    it('should propagate execute failure from listTables', async () => {
      mockExecute.mockImplementationOnce(
        (opts) => {
          opts.complete(new Error('Schema not found'), null, undefined);
        },
      );

      await expect(
        driver.listTables(testParams, 'MY_DB', 'MISSING_SCHEMA'),
      ).rejects.toThrow('Schema not found');
    });

    it('should require account identifier to build a connection', async () => {
      const paramsWithoutAccount = {
        ...testParams,
        options: {},
      };

      await expect(
        driver.listDatabases(paramsWithoutAccount),
      ).rejects.toThrow('Account identifier is required');
    });
  });
});
