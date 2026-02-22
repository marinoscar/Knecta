import { validateReadOnly, mapDuckDBType } from '../duckdb.util';

// ==========================================
// validateReadOnly
// ==========================================

describe('validateReadOnly', () => {
  // ----------------------------------------
  // Allowed queries
  // ----------------------------------------

  it('should allow a simple SELECT query', () => {
    expect(() => validateReadOnly('SELECT * FROM users')).not.toThrow();
  });

  it('should allow a SELECT with WHERE clause', () => {
    expect(() =>
      validateReadOnly('SELECT id, name FROM orders WHERE status = \'active\''),
    ).not.toThrow();
  });

  it('should allow a SELECT with JOIN', () => {
    expect(() =>
      validateReadOnly(
        'SELECT u.id, o.total FROM users u INNER JOIN orders o ON u.id = o.user_id',
      ),
    ).not.toThrow();
  });

  it('should allow a SELECT with subquery', () => {
    expect(() =>
      validateReadOnly(
        'SELECT * FROM (SELECT id, name FROM customers WHERE active = true) sub',
      ),
    ).not.toThrow();
  });

  it('should allow a SELECT with GROUP BY and HAVING', () => {
    expect(() =>
      validateReadOnly(
        'SELECT category, COUNT(*) AS cnt FROM products GROUP BY category HAVING cnt > 5',
      ),
    ).not.toThrow();
  });

  it('should allow a SELECT with CTEs', () => {
    expect(() =>
      validateReadOnly(
        'WITH ranked AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY created_at) rn FROM events) SELECT * FROM ranked WHERE rn = 1',
      ),
    ).not.toThrow();
  });

  it('should allow a SELECT with LIMIT and OFFSET', () => {
    expect(() =>
      validateReadOnly('SELECT * FROM products LIMIT 10 OFFSET 20'),
    ).not.toThrow();
  });

  // ----------------------------------------
  // Disallowed write/DDL keywords
  // ----------------------------------------

  it('should throw on INSERT', () => {
    expect(() =>
      validateReadOnly("INSERT INTO users (name) VALUES ('Alice')"),
    ).toThrow('Write operations are not permitted in read-only queries: INSERT');
  });

  it('should throw on UPDATE', () => {
    expect(() =>
      validateReadOnly("UPDATE users SET name = 'Bob' WHERE id = 1"),
    ).toThrow('Write operations are not permitted in read-only queries: UPDATE');
  });

  it('should throw on DELETE', () => {
    expect(() =>
      validateReadOnly('DELETE FROM users WHERE id = 1'),
    ).toThrow('Write operations are not permitted in read-only queries: DELETE');
  });

  it('should throw on DROP', () => {
    expect(() =>
      validateReadOnly('DROP TABLE users'),
    ).toThrow('Write operations are not permitted in read-only queries: DROP');
  });

  it('should throw on CREATE', () => {
    expect(() =>
      validateReadOnly('CREATE TABLE new_table (id INT)'),
    ).toThrow('Write operations are not permitted in read-only queries: CREATE');
  });

  it('should throw on ALTER', () => {
    expect(() =>
      validateReadOnly('ALTER TABLE users ADD COLUMN email VARCHAR'),
    ).toThrow('Write operations are not permitted in read-only queries: ALTER');
  });

  it('should throw on TRUNCATE', () => {
    expect(() =>
      validateReadOnly('TRUNCATE TABLE users'),
    ).toThrow('Write operations are not permitted in read-only queries: TRUNCATE');
  });

  it('should throw on COPY', () => {
    expect(() =>
      validateReadOnly("COPY users TO '/tmp/users.csv'"),
    ).toThrow('Write operations are not permitted in read-only queries: COPY');
  });

  it('should throw on GRANT', () => {
    expect(() =>
      validateReadOnly('GRANT SELECT ON users TO alice'),
    ).toThrow('Write operations are not permitted in read-only queries: GRANT');
  });

  it('should throw on REVOKE', () => {
    expect(() =>
      validateReadOnly('REVOKE SELECT ON users FROM alice'),
    ).toThrow('Write operations are not permitted in read-only queries: REVOKE');
  });

  it('should throw on MERGE', () => {
    expect(() =>
      validateReadOnly('MERGE INTO target USING source ON target.id = source.id WHEN MATCHED THEN UPDATE SET name = source.name'),
    ).toThrow('Write operations are not permitted in read-only queries: MERGE');
  });

  it('should throw on REPLACE', () => {
    expect(() =>
      validateReadOnly("REPLACE INTO users VALUES (1, 'Alice')"),
    ).toThrow('Write operations are not permitted in read-only queries: REPLACE');
  });

  it('should throw on CALL', () => {
    expect(() =>
      validateReadOnly('CALL my_procedure()'),
    ).toThrow('Write operations are not permitted in read-only queries: CALL');
  });

  it('should throw on EXECUTE', () => {
    expect(() =>
      validateReadOnly('EXECUTE my_plan'),
    ).toThrow('Write operations are not permitted in read-only queries: EXECUTE');
  });

  // ----------------------------------------
  // Case-insensitive detection
  // ----------------------------------------

  it('should detect INSERT case-insensitively (lowercase)', () => {
    expect(() =>
      validateReadOnly("insert into users (name) values ('Alice')"),
    ).toThrow(/INSERT/);
  });

  it('should detect DELETE case-insensitively (mixed case)', () => {
    expect(() =>
      validateReadOnly('Delete From users WHERE id = 1'),
    ).toThrow(/DELETE/);
  });

  it('should detect DROP case-insensitively (uppercase)', () => {
    expect(() =>
      validateReadOnly('DROP TABLE users'),
    ).toThrow(/DROP/);
  });

  it('should detect ALTER case-insensitively (camelCase-like)', () => {
    expect(() =>
      validateReadOnly('alter table users add column email varchar'),
    ).toThrow(/ALTER/);
  });

  it('should detect TRUNCATE case-insensitively', () => {
    expect(() =>
      validateReadOnly('truncate table users'),
    ).toThrow(/TRUNCATE/);
  });
});

// ==========================================
// mapDuckDBType
// ==========================================

describe('mapDuckDBType', () => {
  // ----------------------------------------
  // Integer types
  // ----------------------------------------

  it('should map BOOLEAN to boolean', () => {
    expect(mapDuckDBType('BOOLEAN')).toBe('boolean');
  });

  it('should map TINYINT to tinyint', () => {
    expect(mapDuckDBType('TINYINT')).toBe('tinyint');
  });

  it('should map SMALLINT to smallint', () => {
    expect(mapDuckDBType('SMALLINT')).toBe('smallint');
  });

  it('should map INTEGER to integer', () => {
    expect(mapDuckDBType('INTEGER')).toBe('integer');
  });

  it('should map INT to integer', () => {
    expect(mapDuckDBType('INT')).toBe('integer');
  });

  it('should map BIGINT to bigint', () => {
    expect(mapDuckDBType('BIGINT')).toBe('bigint');
  });

  it('should map HUGEINT to hugeint', () => {
    expect(mapDuckDBType('HUGEINT')).toBe('hugeint');
  });

  // ----------------------------------------
  // Floating-point types
  // ----------------------------------------

  it('should map FLOAT to real', () => {
    expect(mapDuckDBType('FLOAT')).toBe('real');
  });

  it('should map REAL to real', () => {
    expect(mapDuckDBType('REAL')).toBe('real');
  });

  it('should map DOUBLE to double precision', () => {
    expect(mapDuckDBType('DOUBLE')).toBe('double precision');
  });

  it('should map DOUBLE PRECISION to double precision', () => {
    expect(mapDuckDBType('DOUBLE PRECISION')).toBe('double precision');
  });

  // ----------------------------------------
  // String types
  // ----------------------------------------

  it('should map VARCHAR to text', () => {
    expect(mapDuckDBType('VARCHAR')).toBe('text');
  });

  it('should map TEXT to text', () => {
    expect(mapDuckDBType('TEXT')).toBe('text');
  });

  it('should map STRING to text', () => {
    expect(mapDuckDBType('STRING')).toBe('text');
  });

  // ----------------------------------------
  // Date/time types
  // ----------------------------------------

  it('should map DATE to date', () => {
    expect(mapDuckDBType('DATE')).toBe('date');
  });

  it('should map TIMESTAMP to timestamp', () => {
    expect(mapDuckDBType('TIMESTAMP')).toBe('timestamp');
  });

  it('should map TIMESTAMP WITH TIME ZONE to timestamptz', () => {
    expect(mapDuckDBType('TIMESTAMP WITH TIME ZONE')).toBe('timestamptz');
  });

  it('should map TIMESTAMPTZ to timestamptz', () => {
    expect(mapDuckDBType('TIMESTAMPTZ')).toBe('timestamptz');
  });

  // ----------------------------------------
  // Binary types
  // ----------------------------------------

  it('should map BLOB to bytea', () => {
    expect(mapDuckDBType('BLOB')).toBe('bytea');
  });

  it('should map BYTES to bytea', () => {
    expect(mapDuckDBType('BYTES')).toBe('bytea');
  });

  it('should map BINARY to bytea', () => {
    expect(mapDuckDBType('BINARY')).toBe('bytea');
  });

  // ----------------------------------------
  // Complex / JSON types
  // ----------------------------------------

  it('should map LIST to json', () => {
    expect(mapDuckDBType('LIST')).toBe('json');
  });

  it('should map STRUCT to json', () => {
    expect(mapDuckDBType('STRUCT')).toBe('json');
  });

  it('should map MAP to json', () => {
    expect(mapDuckDBType('MAP')).toBe('json');
  });

  // ----------------------------------------
  // DECIMAL / NUMERIC with parameters
  // ----------------------------------------

  it('should map DECIMAL(18,2) to numeric', () => {
    expect(mapDuckDBType('DECIMAL(18,2)')).toBe('numeric');
  });

  it('should map DECIMAL(10,4) to numeric', () => {
    expect(mapDuckDBType('DECIMAL(10,4)')).toBe('numeric');
  });

  it('should map NUMERIC(20,5) to numeric', () => {
    expect(mapDuckDBType('NUMERIC(20,5)')).toBe('numeric');
  });

  it('should map bare DECIMAL to numeric', () => {
    expect(mapDuckDBType('DECIMAL')).toBe('numeric');
  });

  it('should map bare NUMERIC to numeric', () => {
    expect(mapDuckDBType('NUMERIC')).toBe('numeric');
  });

  // ----------------------------------------
  // Case-insensitive input
  // ----------------------------------------

  it('should map lowercase integer to integer', () => {
    expect(mapDuckDBType('integer')).toBe('integer');
  });

  it('should map lowercase varchar to text', () => {
    expect(mapDuckDBType('varchar')).toBe('text');
  });

  it('should map lowercase boolean to boolean', () => {
    expect(mapDuckDBType('boolean')).toBe('boolean');
  });

  it('should map lowercase timestamp to timestamp', () => {
    expect(mapDuckDBType('timestamp')).toBe('timestamp');
  });

  it('should map mixed-case Decimal to numeric', () => {
    expect(mapDuckDBType('Decimal(18,2)')).toBe('numeric');
  });

  // ----------------------------------------
  // Unknown types fall through as lowercase
  // ----------------------------------------

  it('should return lowercase for unknown type UUID', () => {
    expect(mapDuckDBType('UUID')).toBe('uuid');
  });

  it('should return lowercase for unknown type INTERVAL', () => {
    expect(mapDuckDBType('INTERVAL')).toBe('interval');
  });

  it('should return lowercase for an arbitrary unknown type', () => {
    expect(mapDuckDBType('SOME_CUSTOM_TYPE')).toBe('some_custom_type');
  });

  it('should trim whitespace before mapping', () => {
    expect(mapDuckDBType('  INTEGER  ')).toBe('integer');
  });
});
