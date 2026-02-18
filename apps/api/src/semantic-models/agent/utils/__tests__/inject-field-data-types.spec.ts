import { injectFieldDataTypes, injectRelationshipDataTypes, isEligibleForSampleData } from '../inject-field-data-types';
import { OSIDialect, OSIAIContext } from '../../osi/types';

// Test Data Helpers
function createTestColumns() {
  return [
    { name: 'id', dataType: 'integer', nativeType: 'int4', isNullable: false, isPrimaryKey: true },
    { name: 'name', dataType: 'varchar', nativeType: 'varchar(255)', isNullable: true, isPrimaryKey: false },
    { name: 'created_at', dataType: 'timestamp', nativeType: 'timestamptz', isNullable: false, isPrimaryKey: false },
    { name: 'amount', dataType: 'numeric', nativeType: 'numeric(10,2)', isNullable: true, isPrimaryKey: false },
  ];
}

function createTestDataset() {
  return {
    name: 'orders',
    source: 'mydb.public.orders',
    primary_key: ['id'],
    fields: [
      {
        name: 'id',
        expression: { dialects: [{ dialect: 'ANSI_SQL' as OSIDialect, expression: 'id' }] },
        ai_context: { synonyms: ['identifier'] },
      },
      {
        name: 'name',
        expression: { dialects: [{ dialect: 'ANSI_SQL' as OSIDialect, expression: 'name' }] },
        ai_context: { synonyms: ['customer_name'] },
      },
      {
        name: 'created_at',
        expression: { dialects: [{ dialect: 'ANSI_SQL' as OSIDialect, expression: 'created_at' }] },
        ai_context: { synonyms: ['timestamp'] },
      },
      {
        name: 'amount',
        expression: { dialects: [{ dialect: 'ANSI_SQL' as OSIDialect, expression: 'amount' }] },
        ai_context: { synonyms: ['price', 'total'] },
      },
    ],
  };
}

describe('injectFieldDataTypes', () => {
  it('should inject data_type and is_primary_key for matching columns', () => {
    const dataset = createTestDataset();
    const columns = createTestColumns();

    injectFieldDataTypes(dataset, columns);

    const idField = dataset.fields![0];
    expect((idField.ai_context as OSIAIContext).data_type).toBe('integer');
    expect((idField.ai_context as OSIAIContext).is_primary_key).toBe(true);

    const nameField = dataset.fields![1];
    expect((nameField.ai_context as OSIAIContext).data_type).toBe('varchar');
    expect((nameField.ai_context as OSIAIContext).is_primary_key).toBe(false);
  });

  it('should handle case-insensitive column name matching', () => {
    const dataset = createTestDataset();
    // Change field name to uppercase
    dataset.fields![0].name = 'ID';
    const columns = createTestColumns();

    injectFieldDataTypes(dataset, columns);

    const idField = dataset.fields![0];
    expect((idField.ai_context as OSIAIContext).data_type).toBe('integer');
    expect((idField.ai_context as OSIAIContext).is_primary_key).toBe(true);
  });

  it('should skip fields that do not match any column (calculated expression fields)', () => {
    const dataset = createTestDataset();
    dataset.fields!.push({
      name: 'calculated_field',
      expression: { dialects: [{ dialect: 'ANSI_SQL' as OSIDialect, expression: 'amount * 1.1' }] },
      ai_context: { synonyms: ['total_with_tax'] },
    });
    const columns = createTestColumns();

    injectFieldDataTypes(dataset, columns);

    const calculatedField = dataset.fields![4];
    // Should not have data_type injected
    expect((calculatedField.ai_context as OSIAIContext).data_type).toBeUndefined();
    // But should still have its original ai_context
    expect((calculatedField.ai_context as OSIAIContext).synonyms).toEqual(['total_with_tax']);
  });

  it('should convert string ai_context to object before injecting', () => {
    const dataset = createTestDataset();
    (dataset.fields![0] as any).ai_context = 'This is a string context';
    const columns = createTestColumns();

    injectFieldDataTypes(dataset, columns);

    const idField = dataset.fields![0];
    expect(typeof idField.ai_context).toBe('object');
    expect((idField.ai_context as OSIAIContext).instructions).toBe('This is a string context');
    expect((idField.ai_context as OSIAIContext).data_type).toBe('integer');
    expect((idField.ai_context as OSIAIContext).is_primary_key).toBe(true);
  });

  it('should create ai_context object when it is null/undefined', () => {
    const dataset = createTestDataset();
    delete (dataset.fields![0] as any).ai_context;
    const columns = createTestColumns();

    injectFieldDataTypes(dataset, columns);

    const idField = dataset.fields![0];
    expect(idField.ai_context).toBeDefined();
    expect((idField.ai_context as OSIAIContext).data_type).toBe('integer');
    expect((idField.ai_context as OSIAIContext).is_primary_key).toBe(true);
  });

  it('should preserve existing ai_context properties', () => {
    const dataset = createTestDataset();
    (dataset.fields![0].ai_context as OSIAIContext).synonyms = ['identifier', 'pk'];
    (dataset.fields![0].ai_context as OSIAIContext).instructions = 'Primary key field';
    const columns = createTestColumns();

    injectFieldDataTypes(dataset, columns);

    const idField = dataset.fields![0];
    expect((idField.ai_context as OSIAIContext).synonyms).toEqual(['identifier', 'pk']);
    expect((idField.ai_context as OSIAIContext).instructions).toBe('Primary key field');
    expect((idField.ai_context as OSIAIContext).data_type).toBe('integer');
    expect((idField.ai_context as OSIAIContext).is_primary_key).toBe(true);
  });

  it('should inject is_primary_key', () => {
    const dataset = createTestDataset();
    const columns = createTestColumns();

    injectFieldDataTypes(dataset, columns);

    const idField = dataset.fields![0];
    expect((idField.ai_context as OSIAIContext).is_primary_key).toBe(true);

    const nameField = dataset.fields![1];
    expect((nameField.ai_context as OSIAIContext).is_primary_key).toBe(false);
  });

  it('should handle empty fields array gracefully', () => {
    const dataset = createTestDataset();
    dataset.fields = [];
    const columns = createTestColumns();

    // Should not throw
    expect(() => injectFieldDataTypes(dataset, columns)).not.toThrow();
  });

  it('should handle empty columns array gracefully', () => {
    const dataset = createTestDataset();
    const columns: any[] = [];

    injectFieldDataTypes(dataset, columns);

    // Fields should not have data_type injected
    const idField = dataset.fields![0];
    expect((idField.ai_context as OSIAIContext).data_type).toBeUndefined();
    // But should still have their original ai_context
    expect((idField.ai_context as OSIAIContext).synonyms).toEqual(['identifier']);
  });
});

describe('isEligibleForSampleData', () => {
  it('should return true for varchar with maxLength < 50', () => {
    expect(isEligibleForSampleData({ name: 'status', dataType: 'varchar', nativeType: 'varchar(30)', isNullable: true, isPrimaryKey: false, maxLength: 30 })).toBe(true);
  });

  it('should return true for character varying with maxLength < 50', () => {
    expect(isEligibleForSampleData({ name: 'code', dataType: 'character varying', nativeType: 'varchar(20)', isNullable: true, isPrimaryKey: false, maxLength: 20 })).toBe(true);
  });

  it('should return true for nvarchar with maxLength < 50', () => {
    expect(isEligibleForSampleData({ name: 'label', dataType: 'nvarchar', nativeType: 'nvarchar(45)', isNullable: true, isPrimaryKey: false, maxLength: 45 })).toBe(true);
  });

  it('should return true for char with maxLength < 50', () => {
    expect(isEligibleForSampleData({ name: 'flag', dataType: 'char', nativeType: 'char(2)', isNullable: true, isPrimaryKey: false, maxLength: 2 })).toBe(true);
  });

  it('should return false for varchar with maxLength >= 50', () => {
    expect(isEligibleForSampleData({ name: 'description', dataType: 'varchar', nativeType: 'varchar(255)', isNullable: true, isPrimaryKey: false, maxLength: 255 })).toBe(false);
  });

  it('should return false for varchar without maxLength', () => {
    expect(isEligibleForSampleData({ name: 'notes', dataType: 'varchar', nativeType: 'varchar', isNullable: true, isPrimaryKey: false })).toBe(false);
  });

  it('should return false for text type (unlimited)', () => {
    expect(isEligibleForSampleData({ name: 'body', dataType: 'text', nativeType: 'text', isNullable: true, isPrimaryKey: false })).toBe(false);
  });

  it('should return false for integer', () => {
    expect(isEligibleForSampleData({ name: 'id', dataType: 'integer', nativeType: 'int4', isNullable: false, isPrimaryKey: true })).toBe(false);
  });

  it('should return false for boolean', () => {
    expect(isEligibleForSampleData({ name: 'active', dataType: 'boolean', nativeType: 'bool', isNullable: false, isPrimaryKey: false })).toBe(false);
  });

  it('should return false for json', () => {
    expect(isEligibleForSampleData({ name: 'metadata', dataType: 'json', nativeType: 'json', isNullable: true, isPrimaryKey: false })).toBe(false);
  });

  it('should return false for uuid', () => {
    expect(isEligibleForSampleData({ name: 'ref', dataType: 'uuid', nativeType: 'uuid', isNullable: false, isPrimaryKey: false })).toBe(false);
  });

  it('should return false for date', () => {
    expect(isEligibleForSampleData({ name: 'created', dataType: 'date', nativeType: 'date', isNullable: true, isPrimaryKey: false })).toBe(false);
  });

  it('should return false for timestamp', () => {
    expect(isEligibleForSampleData({ name: 'ts', dataType: 'timestamp', nativeType: 'timestamptz', isNullable: true, isPrimaryKey: false })).toBe(false);
  });

  it('should return false for bytea', () => {
    expect(isEligibleForSampleData({ name: 'data', dataType: 'bytea', nativeType: 'bytea', isNullable: true, isPrimaryKey: false })).toBe(false);
  });
});

describe('sample_data injection', () => {
  it('should inject sample_data for eligible columns when sampleDataMap is provided', () => {
    const dataset = createTestDataset();
    // Add a short varchar field to the test data
    dataset.fields!.push({
      name: 'status',
      expression: { dialects: [{ dialect: 'ANSI_SQL' as OSIDialect, expression: 'status' }] },
      ai_context: { synonyms: ['state'] },
    });
    const columns = [
      ...createTestColumns(),
      { name: 'status', dataType: 'varchar', nativeType: 'varchar(20)', isNullable: true, isPrimaryKey: false, maxLength: 20 },
    ];
    const sampleDataMap = new Map<string, string[]>();
    sampleDataMap.set('status', ['active', 'pending', 'inactive', 'archived', 'draft', 'extra']);

    injectFieldDataTypes(dataset, columns, sampleDataMap);

    const statusField = dataset.fields![4];
    const ctx = statusField.ai_context as OSIAIContext;
    expect(ctx.sample_data).toBeDefined();
    expect(ctx.sample_data).toHaveLength(5); // max 5
    expect(ctx.sample_data).toEqual(['active', 'pending', 'inactive', 'archived', 'draft']);
  });

  it('should truncate sample values to 25 characters', () => {
    const dataset = createTestDataset();
    dataset.fields!.push({
      name: 'code',
      expression: { dialects: [{ dialect: 'ANSI_SQL' as OSIDialect, expression: 'code' }] },
      ai_context: { synonyms: ['identifier'] },
    });
    const columns = [
      ...createTestColumns(),
      { name: 'code', dataType: 'varchar', nativeType: 'varchar(40)', isNullable: true, isPrimaryKey: false, maxLength: 40 },
    ];
    const sampleDataMap = new Map<string, string[]>();
    sampleDataMap.set('code', ['abcdefghijklmnopqrstuvwxyz1234567890']);

    injectFieldDataTypes(dataset, columns, sampleDataMap);

    const codeField = dataset.fields![4];
    const ctx = codeField.ai_context as OSIAIContext;
    expect(ctx.sample_data).toEqual(['abcdefghijklmnopqrstuvwxy']); // 25 chars
  });

  it('should inject empty array for eligible column with no sample data', () => {
    const dataset = createTestDataset();
    dataset.fields!.push({
      name: 'status',
      expression: { dialects: [{ dialect: 'ANSI_SQL' as OSIDialect, expression: 'status' }] },
      ai_context: { synonyms: ['state'] },
    });
    const columns = [
      ...createTestColumns(),
      { name: 'status', dataType: 'varchar', nativeType: 'varchar(20)', isNullable: true, isPrimaryKey: false, maxLength: 20 },
    ];
    const sampleDataMap = new Map<string, string[]>();
    // No entry for 'status' in the map

    injectFieldDataTypes(dataset, columns, sampleDataMap);

    const statusField = dataset.fields![4];
    const ctx = statusField.ai_context as OSIAIContext;
    expect(ctx.sample_data).toEqual([]);
  });

  it('should not inject sample_data for ineligible columns', () => {
    const dataset = createTestDataset();
    const columns = createTestColumns();
    const sampleDataMap = new Map<string, string[]>();
    sampleDataMap.set('id', ['1', '2', '3', '4', '5']);

    injectFieldDataTypes(dataset, columns, sampleDataMap);

    // 'id' is integer, not eligible
    const idField = dataset.fields![0];
    expect((idField.ai_context as OSIAIContext).sample_data).toBeUndefined();
  });

  it('should not inject sample_data when sampleDataMap is not provided', () => {
    const dataset = createTestDataset();
    // Add eligible field
    dataset.fields!.push({
      name: 'status',
      expression: { dialects: [{ dialect: 'ANSI_SQL' as OSIDialect, expression: 'status' }] },
      ai_context: { synonyms: ['state'] },
    });
    const columns = [
      ...createTestColumns(),
      { name: 'status', dataType: 'varchar', nativeType: 'varchar(20)', isNullable: true, isPrimaryKey: false, maxLength: 20 },
    ];

    injectFieldDataTypes(dataset, columns); // no sampleDataMap

    const statusField = dataset.fields![4];
    expect((statusField.ai_context as OSIAIContext).sample_data).toBeUndefined();
  });
});

describe('injectRelationshipDataTypes', () => {
  function createTestDatasets() {
    return [
      {
        name: 'orders',
        source: 'mydb.public.orders',
        primary_key: ['id'],
        fields: [
          {
            name: 'id',
            expression: { dialects: [{ dialect: 'ANSI_SQL' as OSIDialect, expression: 'id' }] },
            ai_context: {
              synonyms: ['order_id'],
              data_type: 'integer',
            } as OSIAIContext,
          },
          {
            name: 'customer_id',
            expression: { dialects: [{ dialect: 'ANSI_SQL' as OSIDialect, expression: 'customer_id' }] },
            ai_context: {
              synonyms: ['cust_id'],
              data_type: 'integer',
            } as OSIAIContext,
          },
        ],
      },
      {
        name: 'customers',
        source: 'mydb.public.customers',
        primary_key: ['id'],
        fields: [
          {
            name: 'id',
            expression: { dialects: [{ dialect: 'ANSI_SQL' as OSIDialect, expression: 'id' }] },
            ai_context: {
              synonyms: ['customer_id'],
              data_type: 'integer',
            } as OSIAIContext,
          },
        ],
      },
    ];
  }

  function createTestRelationships() {
    return [
      {
        name: 'orders_to_customers',
        from: 'orders',
        to: 'customers',
        from_columns: ['customer_id'],
        to_columns: ['id'],
        ai_context: { notes: 'FK relationship' } as OSIAIContext,
      },
    ];
  }

  it('should enrich relationship ai_context with column_types from matching datasets', () => {
    const datasets = createTestDatasets();
    const relationships = createTestRelationships();

    injectRelationshipDataTypes(relationships, datasets);

    const rel = relationships[0];
    const ctx = rel.ai_context as any;
    expect(ctx.column_types).toBeDefined();
    expect(ctx.column_types.from_columns).toBeDefined();
    expect(ctx.column_types.from_columns.customer_id).toEqual({
      data_type: 'integer',
    });
    expect(ctx.column_types.to_columns).toBeDefined();
    expect(ctx.column_types.to_columns.id).toEqual({
      data_type: 'integer',
    });
  });

  it('should handle from_columns and to_columns correctly', () => {
    const datasets = createTestDatasets();
    const relationships = [
      {
        name: 'multi_column_rel',
        from: 'orders',
        to: 'customers',
        from_columns: ['customer_id', 'id'],
        to_columns: ['id', 'id'],
        ai_context: {} as OSIAIContext,
      },
    ];

    injectRelationshipDataTypes(relationships, datasets);

    const rel = relationships[0];
    const ctx = rel.ai_context as any;
    expect(ctx.column_types.from_columns.customer_id).toBeDefined();
    expect(ctx.column_types.from_columns.id).toBeDefined();
    expect(ctx.column_types.to_columns.id).toBeDefined();
  });

  it('should preserve existing ai_context properties', () => {
    const datasets = createTestDatasets();
    const relationships = createTestRelationships();
    (relationships[0].ai_context as any).notes = 'Important relationship';
    (relationships[0].ai_context as any).confidence = 'high';

    injectRelationshipDataTypes(relationships, datasets);

    const ctx = relationships[0].ai_context as any;
    expect(ctx.notes).toBe('Important relationship');
    expect(ctx.confidence).toBe('high');
    expect(ctx.column_types).toBeDefined();
  });

  it('should convert string ai_context to object', () => {
    const datasets = createTestDatasets();
    const relationships = createTestRelationships();
    (relationships[0] as any).ai_context = 'String context';

    injectRelationshipDataTypes(relationships, datasets);

    const ctx = relationships[0].ai_context as any;
    expect(typeof ctx).toBe('object');
    expect(ctx.notes).toBe('String context');
    expect(ctx.column_types).toBeDefined();
  });

  it('should handle relationships referencing non-existent datasets', () => {
    const datasets = createTestDatasets();
    const relationships = [
      {
        name: 'bad_rel',
        from: 'nonexistent',
        to: 'orders',
        from_columns: ['id'],
        to_columns: ['id'],
        ai_context: {} as OSIAIContext,
      },
    ];

    // Should not throw
    expect(() => injectRelationshipDataTypes(relationships, datasets)).not.toThrow();

    // Should inject to_columns but not from_columns
    const ctx = relationships[0].ai_context as any;
    expect(ctx.column_types).toBeDefined();
    expect(ctx.column_types?.from_columns).toBeUndefined();
    expect(ctx.column_types?.to_columns).toBeDefined();
    expect(ctx.column_types?.to_columns?.id).toEqual({
      data_type: 'integer',
    });
  });

  it('should handle empty relationships array gracefully', () => {
    const datasets = createTestDatasets();
    const relationships: any[] = [];

    // Should not throw
    expect(() => injectRelationshipDataTypes(relationships, datasets)).not.toThrow();
  });

  it('should handle fields without data_type in ai_context', () => {
    const datasets = createTestDatasets();
    // Remove data_type from one field
    delete (datasets[0].fields![0].ai_context as any).data_type;

    const relationships = [
      {
        name: 'test_rel',
        from: 'orders',
        to: 'customers',
        from_columns: ['id'],
        to_columns: ['id'],
        ai_context: {} as OSIAIContext,
      },
    ];

    // Should not throw
    expect(() => injectRelationshipDataTypes(relationships, datasets)).not.toThrow();

    const ctx = relationships[0].ai_context as any;
    // from_columns.id should not be in column_types because it lacks data_type
    expect(ctx.column_types?.from_columns?.id).toBeUndefined();
    // But to_columns.id should still be there
    expect(ctx.column_types?.to_columns?.id).toBeDefined();
  });
});
