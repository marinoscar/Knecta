import {
  extractFKSuffix,
  pluralize,
  singularize,
  matchTableName,
  areTypesCompatible,
  generateFKCandidates,
} from '../../src/semantic-models/agent/utils/naming-heuristics';
import { OSIDataset, OSIDialect, OSIAIContext } from '../../src/semantic-models/agent/osi/types';
import { ForeignKeyInfo } from '../../src/connections/drivers/driver.interface';

// ==========================================
// Helper Functions for Test Data
// ==========================================

function createTestDataset(
  name: string,
  source: string,
  fields: Array<{ name: string; dataType: string; isPrimaryKey?: boolean }>,
): OSIDataset {
  return {
    name,
    source,
    primary_key: fields.filter((f) => f.isPrimaryKey).map((f) => f.name),
    fields: fields.map((f) => ({
      name: f.name,
      expression: { dialects: [{ dialect: 'ANSI_SQL' as OSIDialect, expression: f.name }] },
      ai_context: {
        data_type: f.dataType,
        is_primary_key: f.isPrimaryKey || false,
      } as OSIAIContext,
    })),
  };
}

function createTestForeignKey(
  fromSchema: string,
  fromTable: string,
  fromColumns: string[],
  toSchema: string,
  toTable: string,
  toColumns: string[],
): ForeignKeyInfo {
  return {
    constraintName: `fk_${fromTable}_${toTable}`,
    fromSchema,
    fromTable,
    fromColumns,
    toSchema,
    toTable,
    toColumns,
  };
}

// ==========================================
// extractFKSuffix Tests
// ==========================================

describe('extractFKSuffix', () => {
  it('should extract standard _id suffix', () => {
    const result = extractFKSuffix('customer_id');
    expect(result).toEqual({ prefix: 'customer', suffix: '_id' });
  });

  it('should extract _code suffix', () => {
    const result = extractFKSuffix('product_code');
    expect(result).toEqual({ prefix: 'product', suffix: '_code' });
  });

  it('should extract _key suffix', () => {
    const result = extractFKSuffix('account_key');
    expect(result).toEqual({ prefix: 'account', suffix: '_key' });
  });

  it('should extract _ref suffix', () => {
    const result = extractFKSuffix('user_ref');
    expect(result).toEqual({ prefix: 'user', suffix: '_ref' });
  });

  it('should extract _num suffix', () => {
    const result = extractFKSuffix('invoice_num');
    expect(result).toEqual({ prefix: 'invoice', suffix: '_num' });
  });

  it('should extract _no suffix', () => {
    const result = extractFKSuffix('order_no');
    expect(result).toEqual({ prefix: 'order', suffix: '_no' });
  });

  it('should extract _fk suffix', () => {
    const result = extractFKSuffix('customer_fk');
    expect(result).toEqual({ prefix: 'customer', suffix: '_fk' });
  });

  it('should extract no-separator id suffix (productid)', () => {
    const result = extractFKSuffix('productid');
    expect(result).toEqual({ prefix: 'product', suffix: 'id' });
  });

  it('should return null for column named just "id" (too short)', () => {
    const result = extractFKSuffix('id');
    expect(result).toBeNull();
  });

  it('should return null for column with no FK suffix', () => {
    const result = extractFKSuffix('name');
    expect(result).toBeNull();
  });

  it('should match "valid" as ending with "id" (edge case)', () => {
    // This is a known edge case: 'valid' ends with 'id' and length > 2
    const result = extractFKSuffix('valid');
    expect(result).toEqual({ prefix: 'val', suffix: 'id' });
  });

  it('should match "acid" as ending with "id" (short prefix edge case)', () => {
    const result = extractFKSuffix('acid');
    expect(result).toEqual({ prefix: 'ac', suffix: 'id' });
  });

  it('should return null for empty string', () => {
    const result = extractFKSuffix('');
    expect(result).toBeNull();
  });

  it('should be case-insensitive for suffix matching', () => {
    const result = extractFKSuffix('Customer_ID');
    expect(result).toEqual({ prefix: 'Customer', suffix: '_id' });
  });

  it('should return null for no-separator code suffix (ProductCode)', () => {
    // The function only recognizes 'id' as a no-separator suffix
    // 'code' requires '_code' separator
    const result = extractFKSuffix('ProductCode');
    expect(result).toBeNull();
  });

  it('should not match _id in the middle of a column name', () => {
    const result = extractFKSuffix('_id_value');
    expect(result).toBeNull();
  });

  it('should prioritize longer suffixes over shorter ones', () => {
    // _code should be matched before 'code' would be extracted
    const result = extractFKSuffix('product_code');
    expect(result).toEqual({ prefix: 'product', suffix: '_code' });
  });
});

// ==========================================
// pluralize Tests
// ==========================================

describe('pluralize', () => {
  it('should pluralize regular word (product → products)', () => {
    expect(pluralize('product')).toBe('products');
  });

  it('should handle consonant + y → ies (category → categories)', () => {
    expect(pluralize('category')).toBe('categories');
  });

  it('should not change vowel + y (day → days)', () => {
    expect(pluralize('day')).toBe('days');
  });

  it('should add es for words ending in x (box → boxes)', () => {
    expect(pluralize('box')).toBe('boxes');
  });

  it('should add es for words ending in ch (match → matches)', () => {
    expect(pluralize('match')).toBe('matches');
  });

  it('should add es for words ending in sh (dish → dishes)', () => {
    expect(pluralize('dish')).toBe('dishes');
  });

  it('should not pluralize words ending in s (glass → glass) - known behavior', () => {
    // The function checks for 's' first and returns as-is (line 135)
    // This happens before the 's, x, z, sh, ch → es' check
    expect(pluralize('glass')).toBe('glass');
  });

  it('should add es for words ending in z (buzz → buzzes)', () => {
    expect(pluralize('buzz')).toBe('buzzes');
  });

  it('should not pluralize words already ending in s (address → address)', () => {
    // Known bug: the function returns the word as-is if it ends with 's'
    expect(pluralize('address')).toBe('address');
  });

  it('should preserve case', () => {
    expect(pluralize('Product')).toBe('Products');
  });

  it('should handle empty string', () => {
    expect(pluralize('')).toBe('s');
  });

  it('should handle single character', () => {
    expect(pluralize('x')).toBe('xes');
  });
});

// ==========================================
// singularize Tests
// ==========================================

describe('singularize', () => {
  it('should singularize regular plural (products → product)', () => {
    expect(singularize('products')).toBe('product');
  });

  it('should handle ies → y (categories → category)', () => {
    expect(singularize('categories')).toBe('category');
  });

  it('should remove trailing s (users → user)', () => {
    expect(singularize('users')).toBe('user');
  });

  it('should not change singular word (user → user)', () => {
    expect(singularize('user')).toBe('user');
  });

  it('should handle addresses → addresse (imperfect edge case)', () => {
    // Known limitation: doesn't handle 'es' endings specially
    expect(singularize('addresses')).toBe('addresse');
  });

  it('should handle boxes → boxe (imperfect edge case)', () => {
    expect(singularize('boxes')).toBe('boxe');
  });

  it('should preserve case', () => {
    expect(singularize('Products')).toBe('Product');
  });

  it('should handle empty string', () => {
    expect(singularize('')).toBe('');
  });

  it('should handle single character s', () => {
    expect(singularize('s')).toBe('s');
  });

  it('should not singularize word ending in ies if too short', () => {
    expect(singularize('ies')).toBe('ie');
  });
});

// ==========================================
// matchTableName Tests
// ==========================================

describe('matchTableName', () => {
  const tableNames = ['products', 'customers', 'orders', 'users'];

  it('should match exact table name (product → products)', () => {
    const result = matchTableName('product', tableNames);
    expect(result).toBe('products');
  });

  it('should match exact table name when prefix is already plural', () => {
    const result = matchTableName('products', tableNames);
    expect(result).toBe('products');
  });

  it('should match via plural (product → products)', () => {
    const result = matchTableName('product', tableNames);
    expect(result).toBe('products');
  });

  it('should match via singularize (customers → customer)', () => {
    const result = matchTableName('customer', tableNames);
    expect(result).toBe('customers');
  });

  it('should match via abbreviation (cust → customers)', () => {
    const result = matchTableName('cust', tableNames);
    expect(result).toBe('customers');
  });

  it('should match via abbreviation (usr → users)', () => {
    const result = matchTableName('usr', tableNames);
    expect(result).toBe('users');
  });

  it('should match via abbreviation (prod → products)', () => {
    const result = matchTableName('prod', tableNames);
    expect(result).toBe('products');
  });

  it('should return null when no match found', () => {
    const result = matchTableName('xyz', tableNames);
    expect(result).toBeNull();
  });

  it('should be case insensitive (Product → products)', () => {
    const result = matchTableName('Product', tableNames);
    expect(result).toBe('products');
  });

  it('should preserve original case of table name', () => {
    const mixedCaseTables = ['Products', 'Customers'];
    const result = matchTableName('product', mixedCaseTables);
    expect(result).toBe('Products');
  });

  it('should handle empty table names array', () => {
    const result = matchTableName('product', []);
    expect(result).toBeNull();
  });

  it('should handle empty prefix', () => {
    const result = matchTableName('', tableNames);
    expect(result).toBeNull();
  });

  it('should match abbreviation org → organizations', () => {
    const result = matchTableName('org', ['organizations']);
    expect(result).toBe('organizations');
  });

  it('should match abbreviation dept → departments', () => {
    const result = matchTableName('dept', ['departments']);
    expect(result).toBe('departments');
  });

  it('should match abbreviation emp → employees', () => {
    const result = matchTableName('emp', ['employees']);
    expect(result).toBe('employees');
  });
});

// ==========================================
// areTypesCompatible Tests
// ==========================================

describe('areTypesCompatible', () => {
  it('should match same type (integer and integer)', () => {
    expect(areTypesCompatible('integer', 'integer')).toBe(true);
  });

  it('should match compatible integer types (int4 and bigint)', () => {
    expect(areTypesCompatible('int4', 'bigint')).toBe(true);
  });

  it('should match compatible integer types (integer and int)', () => {
    expect(areTypesCompatible('integer', 'int')).toBe(true);
  });

  it('should match compatible integer types (smallint and int8)', () => {
    expect(areTypesCompatible('smallint', 'int8')).toBe(true);
  });

  it('should match compatible string types (varchar and text)', () => {
    expect(areTypesCompatible('varchar', 'text')).toBe(true);
  });

  it('should match compatible string types (char and nvarchar)', () => {
    expect(areTypesCompatible('char', 'nvarchar')).toBe(true);
  });

  it('should match compatible string types (character varying and text)', () => {
    expect(areTypesCompatible('character varying', 'text')).toBe(true);
  });

  it('should not match incompatible types (integer and varchar)', () => {
    expect(areTypesCompatible('integer', 'varchar')).toBe(false);
  });

  it('should not match incompatible types (uuid and integer)', () => {
    expect(areTypesCompatible('uuid', 'integer')).toBe(false);
  });

  it('should not match incompatible types (text and integer)', () => {
    expect(areTypesCompatible('text', 'integer')).toBe(false);
  });

  it('should match uuid types (uuid and uuid)', () => {
    expect(areTypesCompatible('uuid', 'uuid')).toBe(true);
  });

  it('should match uuid types (uuid and uniqueidentifier)', () => {
    expect(areTypesCompatible('uuid', 'uniqueidentifier')).toBe(true);
  });

  it('should be case insensitive (INTEGER and int)', () => {
    expect(areTypesCompatible('INTEGER', 'int')).toBe(true);
  });

  it('should be case insensitive (VARCHAR and TEXT)', () => {
    expect(areTypesCompatible('VARCHAR', 'TEXT')).toBe(true);
  });

  it('should handle types with extra whitespace', () => {
    expect(areTypesCompatible('  integer  ', 'int')).toBe(true);
  });

  it('should not match unknown types (custom_type and integer)', () => {
    expect(areTypesCompatible('custom_type', 'integer')).toBe(false);
  });

  it('should not match two unknown types', () => {
    expect(areTypesCompatible('custom_type1', 'custom_type2')).toBe(false);
  });

  it('should match numeric types (numeric and decimal)', () => {
    expect(areTypesCompatible('numeric', 'decimal')).toBe(true);
  });

  it('should match numeric types (float and double precision)', () => {
    expect(areTypesCompatible('float', 'double precision')).toBe(true);
  });

  it('should not match numeric and integer groups', () => {
    expect(areTypesCompatible('numeric', 'integer')).toBe(false);
  });

  it('should handle empty string types', () => {
    expect(areTypesCompatible('', '')).toBe(false);
  });
});

// ==========================================
// generateFKCandidates Tests (Integration-level)
// ==========================================

describe('generateFKCandidates', () => {
  it('should generate candidate for standard FK pattern (orders.customer_id → customers.id)', () => {
    const datasets = [
      createTestDataset('customers', 'public.customers', [
        { name: 'id', dataType: 'integer', isPrimaryKey: true },
        { name: 'name', dataType: 'varchar' },
      ]),
      createTestDataset('orders', 'public.orders', [
        { name: 'id', dataType: 'integer', isPrimaryKey: true },
        { name: 'customer_id', dataType: 'integer' },
        { name: 'amount', dataType: 'numeric' },
      ]),
    ];

    const candidates = generateFKCandidates(datasets, []);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      fromSchema: 'public',
      fromTable: 'orders',
      fromColumns: ['customer_id'],
      toSchema: 'public',
      toTable: 'customers',
      toColumns: ['id'],
      source: 'naming_pattern',
      confidence: 'medium',
    });
    expect(candidates[0].namingScore).toBeGreaterThan(0.8); // High score for exact match + _id
  });

  it('should generate candidate for _code suffix (catalog.product_code → products.code)', () => {
    const datasets = [
      createTestDataset('products', 'public.products', [
        { name: 'code', dataType: 'varchar', isPrimaryKey: true },
        { name: 'name', dataType: 'varchar' },
      ]),
      createTestDataset('catalog', 'public.catalog', [
        { name: 'id', dataType: 'integer', isPrimaryKey: true },
        { name: 'product_code', dataType: 'varchar' },
      ]),
    ];

    const candidates = generateFKCandidates(datasets, []);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      fromSchema: 'public',
      fromTable: 'catalog',
      fromColumns: ['product_code'],
      toSchema: 'public',
      toTable: 'products',
      toColumns: ['code'],
      source: 'naming_pattern',
    });
    expect(candidates[0].namingScore).toBeGreaterThan(0.6); // Good score for exact match + _code
  });

  it('should generate candidate for abbreviation (orders.cust_id → customers.id)', () => {
    const datasets = [
      createTestDataset('customers', 'public.customers', [
        { name: 'id', dataType: 'integer', isPrimaryKey: true },
      ]),
      createTestDataset('orders', 'public.orders', [
        { name: 'id', dataType: 'integer', isPrimaryKey: true },
        { name: 'cust_id', dataType: 'integer' },
      ]),
    ];

    const candidates = generateFKCandidates(datasets, []);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      fromSchema: 'public',
      fromTable: 'orders',
      fromColumns: ['cust_id'],
      toSchema: 'public',
      toTable: 'customers',
      toColumns: ['id'],
      source: 'naming_pattern',
    });
    expect(candidates[0].namingScore).toBeLessThan(0.6); // Lower score for abbreviation
  });

  it('should generate candidate for no-separator id (orderlines.productid → products.id)', () => {
    const datasets = [
      createTestDataset('products', 'public.products', [
        { name: 'id', dataType: 'integer', isPrimaryKey: true },
      ]),
      createTestDataset('orderlines', 'public.orderlines', [
        { name: 'id', dataType: 'integer', isPrimaryKey: true },
        { name: 'productid', dataType: 'integer' },
      ]),
    ];

    const candidates = generateFKCandidates(datasets, []);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      fromTable: 'orderlines',
      fromColumns: ['productid'],
      toTable: 'products',
      toColumns: ['id'],
    });
  });

  it('should skip FK candidate if explicit FK constraint already exists', () => {
    const datasets = [
      createTestDataset('customers', 'public.customers', [
        { name: 'id', dataType: 'integer', isPrimaryKey: true },
      ]),
      createTestDataset('orders', 'public.orders', [
        { name: 'id', dataType: 'integer', isPrimaryKey: true },
        { name: 'customer_id', dataType: 'integer' },
      ]),
    ];

    const explicitFKs = [
      createTestForeignKey('public', 'orders', ['customer_id'], 'public', 'customers', ['id']),
    ];

    const candidates = generateFKCandidates(datasets, explicitFKs);

    expect(candidates).toHaveLength(0);
  });

  it('should skip PK columns (customers.id should not generate candidate)', () => {
    const datasets = [
      createTestDataset('customers', 'public.customers', [
        { name: 'id', dataType: 'integer', isPrimaryKey: true },
      ]),
      createTestDataset('orders', 'public.orders', [
        { name: 'id', dataType: 'integer', isPrimaryKey: true },
      ]),
    ];

    const candidates = generateFKCandidates(datasets, []);

    // No candidates should be generated because both 'id' columns are PKs
    expect(candidates).toHaveLength(0);
  });

  it('should skip self-reference (table matching its own name)', () => {
    const datasets = [
      createTestDataset('categories', 'public.categories', [
        { name: 'id', dataType: 'integer', isPrimaryKey: true },
        { name: 'category_id', dataType: 'integer' }, // This would match 'categories' but is in same table
      ]),
    ];

    const candidates = generateFKCandidates(datasets, []);

    // Should not generate a self-referencing candidate (or at least, not via the naming heuristic)
    // Actually, the code explicitly checks for same schema+table, so expect 0
    expect(candidates).toHaveLength(0);
  });

  it('should skip candidate with incompatible types (varchar FK to integer PK)', () => {
    const datasets = [
      createTestDataset('customers', 'public.customers', [
        { name: 'id', dataType: 'integer', isPrimaryKey: true },
      ]),
      createTestDataset('orders', 'public.orders', [
        { name: 'id', dataType: 'integer', isPrimaryKey: true },
        { name: 'customer_id', dataType: 'varchar' }, // Type mismatch!
      ]),
    ];

    const candidates = generateFKCandidates(datasets, []);

    expect(candidates).toHaveLength(0);
  });

  it('should generate multiple candidates for multiple FK-like columns', () => {
    const datasets = [
      createTestDataset('customers', 'public.customers', [
        { name: 'id', dataType: 'integer', isPrimaryKey: true },
      ]),
      createTestDataset('products', 'public.products', [
        { name: 'id', dataType: 'integer', isPrimaryKey: true },
      ]),
      createTestDataset('orders', 'public.orders', [
        { name: 'id', dataType: 'integer', isPrimaryKey: true },
        { name: 'customer_id', dataType: 'integer' },
        { name: 'product_id', dataType: 'integer' },
      ]),
    ];

    const candidates = generateFKCandidates(datasets, []);

    expect(candidates).toHaveLength(2);
    expect(candidates.map((c) => c.fromColumns[0]).sort()).toEqual(['customer_id', 'product_id']);
  });

  it('should return empty array for empty datasets', () => {
    const candidates = generateFKCandidates([], []);
    expect(candidates).toHaveLength(0);
  });

  it('should return empty array for datasets with no FK suffix columns', () => {
    const datasets = [
      createTestDataset('customers', 'public.customers', [
        { name: 'name', dataType: 'varchar' },
        { name: 'email', dataType: 'varchar' },
        { name: 'status', dataType: 'varchar' },
      ]),
    ];

    const candidates = generateFKCandidates(datasets, []);
    expect(candidates).toHaveLength(0);
  });

  it('should handle composite PK tables (skip if PK has multiple columns)', () => {
    const datasets = [
      createTestDataset('composite_pk_table', 'public.composite_pk_table', [
        { name: 'id1', dataType: 'integer', isPrimaryKey: true },
        { name: 'id2', dataType: 'integer', isPrimaryKey: true },
      ]),
      createTestDataset('orders', 'public.orders', [
        { name: 'id', dataType: 'integer', isPrimaryKey: true },
        { name: 'composite_id', dataType: 'integer' },
      ]),
    ];

    const candidates = generateFKCandidates(datasets, []);

    // Should skip because composite_pk_table has composite PK
    expect(candidates).toHaveLength(0);
  });

  it('should generate low-score candidates for FK suffix with type-compatible PK but no name match', () => {
    const datasets = [
      createTestDataset('unrelated_table', 'public.unrelated_table', [
        { name: 'pk_col', dataType: 'integer', isPrimaryKey: true },
      ]),
      createTestDataset('orders', 'public.orders', [
        { name: 'id', dataType: 'integer', isPrimaryKey: true },
        { name: 'mystery_id', dataType: 'integer' }, // FK suffix but no table name match
      ]),
    ];

    const candidates = generateFKCandidates(datasets, []);

    // Should generate a low-score candidate (namingScore = 0.3)
    expect(candidates.length).toBeGreaterThan(0);
    const mysteryCandidate = candidates.find((c) => c.fromColumns[0] === 'mystery_id');
    expect(mysteryCandidate).toBeDefined();
    expect(mysteryCandidate?.namingScore).toBe(0.3);
    expect(mysteryCandidate?.toTable).toBe('unrelated_table');
  });

  it('should handle dataset without fields gracefully', () => {
    const datasets: OSIDataset[] = [
      {
        name: 'empty_table',
        source: 'public.empty_table',
        fields: undefined,
      },
      createTestDataset('customers', 'public.customers', [
        { name: 'id', dataType: 'integer', isPrimaryKey: true },
      ]),
    ];

    // Should not throw
    expect(() => generateFKCandidates(datasets, [])).not.toThrow();
    const candidates = generateFKCandidates(datasets, []);
    expect(candidates).toHaveLength(0);
  });

  it('should handle dataset with fields missing ai_context', () => {
    const datasets: OSIDataset[] = [
      {
        name: 'bad_table',
        source: 'public.bad_table',
        fields: [
          {
            name: 'id',
            expression: { dialects: [{ dialect: 'ANSI_SQL' as OSIDialect, expression: 'id' }] },
            // No ai_context
          },
        ],
      },
    ];

    // Should not throw
    expect(() => generateFKCandidates(datasets, [])).not.toThrow();
    const candidates = generateFKCandidates(datasets, []);
    expect(candidates).toHaveLength(0);
  });

  it('should match _key suffix to key column or PK', () => {
    const datasets = [
      createTestDataset('accounts', 'public.accounts', [
        { name: 'key', dataType: 'varchar', isPrimaryKey: true },
      ]),
      createTestDataset('transactions', 'public.transactions', [
        { name: 'id', dataType: 'integer', isPrimaryKey: true },
        { name: 'account_key', dataType: 'varchar' },
      ]),
    ];

    const candidates = generateFKCandidates(datasets, []);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      fromTable: 'transactions',
      fromColumns: ['account_key'],
      toTable: 'accounts',
      toColumns: ['key'],
    });
  });

  it('should fallback to PK if _code column not found in target table', () => {
    const datasets = [
      createTestDataset('products', 'public.products', [
        { name: 'id', dataType: 'varchar', isPrimaryKey: true }, // PK, no 'code' column
      ]),
      createTestDataset('catalog', 'public.catalog', [
        { name: 'id', dataType: 'integer', isPrimaryKey: true },
        { name: 'product_code', dataType: 'varchar' },
      ]),
    ];

    const candidates = generateFKCandidates(datasets, []);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      fromColumns: ['product_code'],
      toTable: 'products',
      toColumns: ['id'], // Fallback to PK
    });
  });

  it('should handle case-insensitive table matching', () => {
    const datasets = [
      createTestDataset('Customers', 'public.Customers', [
        { name: 'id', dataType: 'integer', isPrimaryKey: true },
      ]),
      createTestDataset('Orders', 'public.Orders', [
        { name: 'id', dataType: 'integer', isPrimaryKey: true },
        { name: 'customer_id', dataType: 'integer' },
      ]),
    ];

    const candidates = generateFKCandidates(datasets, []);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      fromTable: 'Orders',
      toTable: 'Customers',
    });
  });

  it('should parse three-part source names (database.schema.table)', () => {
    const datasets = [
      createTestDataset('customers', 'mydb.public.customers', [
        { name: 'id', dataType: 'integer', isPrimaryKey: true },
      ]),
      createTestDataset('orders', 'mydb.public.orders', [
        { name: 'id', dataType: 'integer', isPrimaryKey: true },
        { name: 'customer_id', dataType: 'integer' },
      ]),
    ];

    const candidates = generateFKCandidates(datasets, []);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      fromSchema: 'public',
      fromTable: 'orders',
      toSchema: 'public',
      toTable: 'customers',
    });
  });

  it('should handle single-part source names (defaults to public schema)', () => {
    const datasets = [
      createTestDataset('customers', 'customers', [
        { name: 'id', dataType: 'integer', isPrimaryKey: true },
      ]),
      createTestDataset('orders', 'orders', [
        { name: 'id', dataType: 'integer', isPrimaryKey: true },
        { name: 'customer_id', dataType: 'integer' },
      ]),
    ];

    const candidates = generateFKCandidates(datasets, []);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      fromSchema: 'public',
      fromTable: 'orders',
      toSchema: 'public',
      toTable: 'customers',
    });
  });

  it('should generate candidates across different schemas', () => {
    const datasets = [
      createTestDataset('customers', 'sales.customers', [
        { name: 'id', dataType: 'integer', isPrimaryKey: true },
      ]),
      createTestDataset('orders', 'public.orders', [
        { name: 'id', dataType: 'integer', isPrimaryKey: true },
        { name: 'customer_id', dataType: 'integer' },
      ]),
    ];

    const candidates = generateFKCandidates(datasets, []);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      fromSchema: 'public',
      fromTable: 'orders',
      toSchema: 'sales',
      toTable: 'customers',
    });
  });
});
