import { injectFieldDataTypes, injectRelationshipDataTypes } from '../inject-field-data-types';
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
  it('should inject data_type and native_type for matching columns', () => {
    const dataset = createTestDataset();
    const columns = createTestColumns();

    injectFieldDataTypes(dataset, columns);

    const idField = dataset.fields![0];
    expect((idField.ai_context as OSIAIContext).data_type).toBe('integer');
    expect((idField.ai_context as OSIAIContext).native_type).toBe('int4');

    const nameField = dataset.fields![1];
    expect((nameField.ai_context as OSIAIContext).data_type).toBe('varchar');
    expect((nameField.ai_context as OSIAIContext).native_type).toBe('varchar(255)');
  });

  it('should handle case-insensitive column name matching', () => {
    const dataset = createTestDataset();
    // Change field name to uppercase
    dataset.fields![0].name = 'ID';
    const columns = createTestColumns();

    injectFieldDataTypes(dataset, columns);

    const idField = dataset.fields![0];
    expect((idField.ai_context as OSIAIContext).data_type).toBe('integer');
    expect((idField.ai_context as OSIAIContext).native_type).toBe('int4');
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
    expect((idField.ai_context as OSIAIContext).native_type).toBe('int4');
  });

  it('should create ai_context object when it is null/undefined', () => {
    const dataset = createTestDataset();
    delete (dataset.fields![0] as any).ai_context;
    const columns = createTestColumns();

    injectFieldDataTypes(dataset, columns);

    const idField = dataset.fields![0];
    expect(idField.ai_context).toBeDefined();
    expect((idField.ai_context as OSIAIContext).data_type).toBe('integer');
    expect((idField.ai_context as OSIAIContext).native_type).toBe('int4');
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
    expect((idField.ai_context as OSIAIContext).native_type).toBe('int4');
  });

  it('should inject is_nullable and is_primary_key', () => {
    const dataset = createTestDataset();
    const columns = createTestColumns();

    injectFieldDataTypes(dataset, columns);

    const idField = dataset.fields![0];
    expect((idField.ai_context as OSIAIContext).is_nullable).toBe(false);
    expect((idField.ai_context as OSIAIContext).is_primary_key).toBe(true);

    const nameField = dataset.fields![1];
    expect((nameField.ai_context as OSIAIContext).is_nullable).toBe(true);
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
              native_type: 'int4',
            } as OSIAIContext,
          },
          {
            name: 'customer_id',
            expression: { dialects: [{ dialect: 'ANSI_SQL' as OSIDialect, expression: 'customer_id' }] },
            ai_context: {
              synonyms: ['cust_id'],
              data_type: 'integer',
              native_type: 'int4',
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
              native_type: 'int4',
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
      native_type: 'int4',
    });
    expect(ctx.column_types.to_columns).toBeDefined();
    expect(ctx.column_types.to_columns.id).toEqual({
      data_type: 'integer',
      native_type: 'int4',
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
      native_type: 'int4',
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
    delete (datasets[0].fields![0].ai_context as any).native_type;

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
