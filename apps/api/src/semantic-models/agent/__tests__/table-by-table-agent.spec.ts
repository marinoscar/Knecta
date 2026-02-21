import { validateAndFixModel } from '../validation/structural-validator';
import { extractJson, extractTokenUsage } from '../utils';
import { buildGenerateDatasetPrompt } from '../prompts/generate-dataset-prompt';
import { buildGenerateRelationshipsPrompt } from '../prompts/generate-relationships-prompt';
import { createAssembleModelNode } from '../nodes/assemble-model';
import { SemanticModelsService } from '../../semantic-models.service';
import { ColumnInfo, ForeignKeyInfo } from '../../../connections/drivers/driver.interface';
import { OSIDialect } from '../osi/types';

// Test Data Helpers
function createValidField() {
  return {
    name: 'id',
    expression: { dialects: [{ dialect: 'ANSI_SQL' as OSIDialect, expression: 'id' }] },
    label: 'ID',
    description: 'Primary key',
    ai_context: { synonyms: ['identifier', 'primary_key', 'record_id'] },
  };
}

function createValidDataset() {
  return {
    name: 'orders',
    label: 'Customer Orders',
    source: 'mydb.public.orders',
    primary_key: ['id'],
    description: 'Order records',
    ai_context: { synonyms: ['order', 'purchase', 'transaction'] },
    fields: [createValidField()],
  };
}

function createValidModel() {
  return {
    semantic_model: [{
      name: 'Test Model',
      description: 'Test semantic model',
      datasets: [createValidDataset()],
      ai_context: { synonyms: ['test'], instructions: 'Test model' },
    }],
  };
}

function createValidMetric() {
  return {
    name: 'total_orders',
    expression: { dialects: [{ dialect: 'ANSI_SQL' as OSIDialect, expression: 'COUNT(*)' }] },
    description: 'Total number of orders',
    ai_context: { synonyms: ['order_count', 'num_orders'] },
  };
}

// Structural Validator Tests
describe('validateAndFixModel', () => {
  it('should pass a valid model', () => {
    const model = createValidModel();
    const result = validateAndFixModel(model);
    expect(result.isValid).toBe(true);
    expect(result.fatalIssues).toHaveLength(0);
  });

  it('should warn when dataset is missing label', () => {
    const model = createValidModel();
    delete (model.semantic_model[0].datasets[0] as any).label;
    const result = validateAndFixModel(model);
    expect(result.isValid).toBe(true);
    expect(result.warnings.some(w => w.includes('label'))).toBe(true);
  });

  it('should warn when field is missing label', () => {
    const model = createValidModel();
    delete (model.semantic_model[0].datasets[0].fields![0] as any).label;
    const result = validateAndFixModel(model);
    expect(result.isValid).toBe(true);
    expect(result.warnings.some(w => w.includes('label'))).toBe(true);
  });

  it('should not warn about label when dataset and field have labels', () => {
    const model = createValidModel();
    const result = validateAndFixModel(model);
    expect(result.warnings.filter(w => w.includes('"label"')).length).toBe(0);
  });

  it('should fail when root has no semantic_model array', () => {
    const result = validateAndFixModel({});
    expect(result.isValid).toBe(false);
    expect(result.fatalIssues[0]).toContain('semantic_model');
  });

  it('should fail when root semantic_model is empty array', () => {
    const result = validateAndFixModel({ semantic_model: [] });
    expect(result.isValid).toBe(false);
    expect(result.fatalIssues[0]).toContain('semantic_model');
  });

  it('should fail when model has no name', () => {
    const model = { semantic_model: [{ datasets: [createValidDataset()] }] };
    const result = validateAndFixModel(model);
    expect(result.isValid).toBe(false);
    expect(result.fatalIssues.some(i => i.includes('name'))).toBe(true);
  });

  it('should fail when datasets are empty', () => {
    const model = { semantic_model: [{ name: 'test', datasets: [] }] };
    const result = validateAndFixModel(model);
    expect(result.isValid).toBe(false);
    expect(result.fatalIssues.some(i => i.includes('datasets'))).toBe(true);
  });

  it('should auto-fix missing ai_context on model', () => {
    const model = createValidModel();
    delete (model.semantic_model[0] as any).ai_context;
    const result = validateAndFixModel(model);
    expect(result.isValid).toBe(true);
    expect(result.fixedIssues.length).toBeGreaterThan(0);
    expect(result.fixedIssues.some(i => i.includes('model-level ai_context'))).toBe(true);
    expect((model.semantic_model[0] as any).ai_context).toBeDefined();
  });

  it('should auto-fix missing ai_context on datasets', () => {
    const model = createValidModel();
    delete (model.semantic_model[0].datasets[0] as any).ai_context;
    const result = validateAndFixModel(model);
    expect(result.fixedIssues.some(i => i.includes('ai_context'))).toBe(true);
    expect((model.semantic_model[0].datasets[0] as any).ai_context).toBeDefined();
  });

  it('should auto-fix missing ai_context on fields', () => {
    const model = createValidModel();
    delete (model.semantic_model[0].datasets[0].fields![0] as any).ai_context;
    const result = validateAndFixModel(model);
    expect(result.fixedIssues.some(i => i.includes('ai_context'))).toBe(true);
    expect((model.semantic_model[0].datasets[0].fields![0] as any).ai_context).toBeDefined();
  });

  it('should auto-fix missing expression on fields', () => {
    const model = createValidModel();
    delete (model.semantic_model[0].datasets[0].fields![0] as any).expression;
    const result = validateAndFixModel(model);
    expect(result.fixedIssues.some(i => i.includes('expression'))).toBe(true);
    expect((model.semantic_model[0].datasets[0].fields![0] as any).expression).toBeDefined();
    expect((model.semantic_model[0].datasets[0].fields![0] as any).expression.dialects[0].expression).toBe('id');
  });

  it('should fail for relationship with mismatched column lengths', () => {
    const model = createValidModel();
    // @ts-expect-error - testing runtime behavior
    model.semantic_model[0].relationships = [{
      name: 'test_rel',
      from: 'orders',
      to: 'customers',
      from_columns: ['customer_id', 'extra_col'],
      to_columns: ['id'],
    }];
    const result = validateAndFixModel(model);
    expect(result.isValid).toBe(false);
    expect(result.fatalIssues.some(i => i.includes('equal length'))).toBe(true);
  });

  it('should warn for relationship referencing non-existent dataset', () => {
    const model = createValidModel();
    // @ts-expect-error - testing runtime behavior
    model.semantic_model[0].relationships = [{
      name: 'test_rel',
      from: 'nonexistent',
      to: 'orders',
      from_columns: ['id'],
      to_columns: ['id'],
    }];
    const result = validateAndFixModel(model);
    expect(result.warnings.some(i => i.includes('non-existent'))).toBe(true);
  });

  it('should fail for metric without expression', () => {
    const model = createValidModel();
    // @ts-expect-error - testing runtime behavior
    model.semantic_model[0].metrics = [{
      name: 'test_metric',
    }];
    const result = validateAndFixModel(model);
    expect(result.isValid).toBe(false);
    expect(result.fatalIssues.some(i => i.includes('expression'))).toBe(true);
  });

  it('should warn when field ai_context lacks data_type', () => {
    const model = createValidModel();
    // createValidField creates a field with ai_context: { synonyms: [...] } but no data_type
    const result = validateAndFixModel(model);
    expect(result.isValid).toBe(true); // It's just a warning, not fatal
    expect(result.warnings.some(w => w.includes('data_type'))).toBe(true);
  });

  it('should not warn when field ai_context has data_type', () => {
    const model = createValidModel();
    (model.semantic_model[0].datasets[0].fields![0].ai_context as any) = {
      synonyms: ['identifier'],
      data_type: 'integer',
      native_type: 'int4',
    };
    const result = validateAndFixModel(model);
    expect(result.warnings.some(w => w.includes('data_type'))).toBe(false);
  });
});

// Utility Function Tests
describe('extractJson', () => {
  it('should parse plain JSON', () => {
    const result = extractJson('{"key": "value"}');
    expect(result).toEqual({ key: 'value' });
  });

  it('should parse JSON wrapped in json markdown code block', () => {
    const result = extractJson('```json\n{"key": "value"}\n```');
    expect(result).toEqual({ key: 'value' });
  });

  it('should parse JSON with surrounding text', () => {
    const result = extractJson('Here is the JSON: {"key": "value"} and more text');
    expect(result).toEqual({ key: 'value' });
  });

  it('should return null for invalid JSON', () => {
    const result = extractJson('not json at all');
    expect(result).toBeNull();
  });
});

describe('extractTokenUsage', () => {
  it('should extract from usage_metadata', () => {
    const response = { usage_metadata: { input_tokens: 100, output_tokens: 50, total_tokens: 150 } };
    expect(extractTokenUsage(response)).toEqual({ prompt: 100, completion: 50, total: 150 });
  });

  it('should extract from response_metadata.tokenUsage', () => {
    const response = { response_metadata: { tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 } } };
    expect(extractTokenUsage(response)).toEqual({ prompt: 100, completion: 50, total: 150 });
  });

  it('should return zeros for missing metadata', () => {
    expect(extractTokenUsage({})).toEqual({ prompt: 0, completion: 0, total: 0 });
  });

  it('should prefer usage_metadata over response_metadata', () => {
    const response = {
      usage_metadata: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
      response_metadata: { tokenUsage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 } },
    };
    expect(extractTokenUsage(response)).toEqual({ prompt: 100, completion: 50, total: 150 });
  });
});

// Prompt Builder Tests
describe('buildGenerateDatasetPrompt', () => {
  const baseParams = {
    tableName: 'public.orders',
    databaseName: 'mydb',
    columns: [
      { name: 'id', dataType: 'integer', nativeType: 'int4', isNullable: false, isPrimaryKey: true },
      { name: 'customer_id', dataType: 'integer', nativeType: 'int4', isNullable: false, isPrimaryKey: false },
    ],
    sampleData: { columns: ['id', 'customer_id'], rows: [[1, 100], [2, 101]] },
    foreignKeys: [],
    columnStats: new Map(),
    modelName: 'Test Model',
  };

  it('should include table name and database name', () => {
    const prompt = buildGenerateDatasetPrompt(baseParams);
    expect(prompt).toContain('public.orders');
    expect(prompt).toContain('mydb');
    expect(prompt).toContain('Test Model');
  });

  it('should include foreign keys when provided', () => {
    const params = {
      ...baseParams,
      foreignKeys: [{
        constraintName: 'fk_orders_customer',
        fromSchema: 'public',
        fromTable: 'orders',
        fromColumns: ['customer_id'],
        toSchema: 'public',
        toTable: 'customers',
        toColumns: ['id'],
      }],
    };
    const prompt = buildGenerateDatasetPrompt(params);
    expect(prompt).toContain('Foreign Keys');
    expect(prompt).toContain('fk_orders_customer');
  });

  it('should include instructions when provided', () => {
    const params = {
      ...baseParams,
      instructions: 'This is an e-commerce database',
    };
    const prompt = buildGenerateDatasetPrompt(params);
    expect(prompt).toContain('This is an e-commerce database');
    expect(prompt).toContain('Business Context');
  });

  it('should not include instructions section when not provided', () => {
    const prompt = buildGenerateDatasetPrompt(baseParams);
    expect(prompt).not.toContain('Business Context');
  });

  it('should request JSON output format', () => {
    const prompt = buildGenerateDatasetPrompt(baseParams);
    expect(prompt).toContain('valid JSON object');
    expect(prompt).toContain('"dataset"');
    expect(prompt).toContain('"metrics"');
  });

  it('should require fully qualified column names in metric expressions', () => {
    const prompt = buildGenerateDatasetPrompt(baseParams);
    expect(prompt).toContain('schema.table.column');
    expect(prompt).toContain('public.orders.amount');
    expect(prompt).toContain('NOT `SUM(amount)`');
  });

  it('should include OSI spec when osiSpecText is provided', () => {
    const params = {
      ...baseParams,
      osiSpecText: 'OSI Spec content here',
    };
    const prompt = buildGenerateDatasetPrompt(params);
    expect(prompt).toContain('OSI Specification Reference');
    expect(prompt).toContain('OSI Spec content here');
  });

  it('should not include OSI spec section when osiSpecText is not provided', () => {
    const prompt = buildGenerateDatasetPrompt(baseParams);
    expect(prompt).not.toContain('OSI Specification Reference');
  });
});

describe('buildGenerateRelationshipsPrompt', () => {
  const baseParams = {
    modelName: 'Test Model',
    databaseName: 'mydb',
    datasetSummaries: [
      { name: 'orders', source: 'mydb.public.orders', primaryKey: ['id'], columns: ['id', 'customer_id'] },
      { name: 'customers', source: 'mydb.public.customers', primaryKey: ['id'], columns: ['id', 'name'] },
    ],
    relationshipCandidates: [],
  };

  it('should include model name and database name', () => {
    const prompt = buildGenerateRelationshipsPrompt(baseParams);
    expect(prompt).toContain('Test Model');
    expect(prompt).toContain('mydb');
  });

  it('should include dataset summaries', () => {
    const prompt = buildGenerateRelationshipsPrompt(baseParams);
    expect(prompt).toContain('orders');
    expect(prompt).toContain('customers');
    expect(prompt).toContain('customer_id');
  });

  it('should include high confidence candidates with overlap evidence', () => {
    const params = {
      ...baseParams,
      relationshipCandidates: [{
        fromSchema: 'public',
        fromTable: 'orders',
        fromColumns: ['customer_id'],
        toSchema: 'public',
        toTable: 'customers',
        toColumns: ['id'],
        source: 'database_constraint' as const,
        confidence: 'high' as const,
        constraintName: 'fk_orders_customer',
        overlap: {
          overlapRatio: 0.95,
          childDistinctCount: 950,
          parentDistinctCount: 500,
          nullRatio: 0.01,
          childSampleSize: 1000,
          cardinality: 'one_to_many' as const,
        },
      }],
    };
    const prompt = buildGenerateRelationshipsPrompt(params);
    expect(prompt).toContain('High Confidence');
    expect(prompt).toContain('orders.customer_id');
    expect(prompt).toContain('fk_orders_customer');
  });

  it('should show no candidates message when none provided', () => {
    const prompt = buildGenerateRelationshipsPrompt(baseParams);
    expect(prompt).toContain('No relationship candidates found');
  });

  it('should include instructions when provided', () => {
    const params = {
      ...baseParams,
      instructions: 'E-commerce platform database',
    };
    const prompt = buildGenerateRelationshipsPrompt(params);
    expect(prompt).toContain('E-commerce platform database');
    expect(prompt).toContain('Business Context');
  });

  it('should request JSON output format', () => {
    const prompt = buildGenerateRelationshipsPrompt(baseParams);
    expect(prompt).toContain('valid JSON object');
    expect(prompt).toContain('"relationships"');
    expect(prompt).toContain('"model_metrics"');
    expect(prompt).toContain('"model_ai_context"');
  });

  it('should require fully qualified column names in metric expressions', () => {
    const prompt = buildGenerateRelationshipsPrompt(baseParams);
    expect(prompt).toContain('schema.table.column');
    expect(prompt).toContain('NOT `SUM(total_amount)`');
  });

  it('should include OSI spec when osiSpecText is provided', () => {
    const params = {
      ...baseParams,
      osiSpecText: 'OSI Spec content here',
    };
    const prompt = buildGenerateRelationshipsPrompt(params);
    expect(prompt).toContain('OSI Specification Reference');
    expect(prompt).toContain('OSI Spec content here');
  });

  it('should not include OSI spec section when osiSpecText is not provided', () => {
    const prompt = buildGenerateRelationshipsPrompt(baseParams);
    expect(prompt).not.toContain('OSI Specification Reference');
  });
});

// Assemble Model Node Tests
describe('createAssembleModelNode', () => {
  let mockService: any;
  let mockEmit: any;

  beforeEach(() => {
    mockService = {
      updateRunProgress: jest.fn().mockResolvedValue(undefined),
    };
    mockEmit = jest.fn();
  });

  it('should assemble a valid OSI model from state', async () => {
    const node = createAssembleModelNode(mockService, 'run-1', mockEmit);

    const state = {
      connectionId: 'test-conn-id',
      userId: 'test-user-id',
      databaseName: 'mydb',
      selectedSchemas: ['public'],
      selectedTables: ['public.orders'],
      runId: 'run-1',
      modelName: 'My Model',
      instructions: null,
      datasets: [createValidDataset()],
      foreignKeys: [],
      tableMetrics: [[createValidMetric()]],
      failedTables: [],
      relationshipCandidates: [],
      relationships: [],
      modelMetrics: [],
      modelAiContext: { synonyms: ['test'], instructions: 'test model' },
      semanticModel: null,
      tokensUsed: { prompt: 0, completion: 0, total: 0 },
      semanticModelId: null,
      osiSpecText: '',
      error: null,
    };

    const result = await node(state);
    expect(result.semanticModel).toBeDefined();
    const model = result.semanticModel as any;
    expect(model.semantic_model).toBeDefined();
    expect(model.semantic_model[0].name).toBe('My Model');
    expect(model.semantic_model[0].datasets).toHaveLength(1);
    expect(model.semantic_model[0].datasets[0].name).toBe('orders');
  });

  it('should use default model name when not provided', async () => {
    const node = createAssembleModelNode(mockService, 'run-1', mockEmit);

    const state = {
      connectionId: 'test-conn-id',
      userId: 'test-user-id',
      databaseName: 'mydb',
      selectedSchemas: ['public'],
      selectedTables: ['public.orders'],
      runId: 'run-1',
      modelName: null,
      instructions: null,
      datasets: [createValidDataset()],
      foreignKeys: [],
      tableMetrics: [],
      failedTables: [],
      relationshipCandidates: [],
      relationships: [],
      modelMetrics: [],
      modelAiContext: { synonyms: [], instructions: '' },
      semanticModel: null,
      tokensUsed: { prompt: 0, completion: 0, total: 0 },
      semanticModelId: null,
      osiSpecText: '',
      error: null,
    };

    const result = await node(state);
    const model = result.semanticModel as any;
    expect(model.semantic_model[0].name).toBe('Model for mydb');
  });

  it('should flatten table metrics and model metrics', async () => {
    const node = createAssembleModelNode(mockService, 'run-1', mockEmit);

    const tableMetric1 = createValidMetric();
    const tableMetric2 = { ...createValidMetric(), name: 'table_metric_2' };
    const modelMetric = { ...createValidMetric(), name: 'model_metric' };

    const state = {
      connectionId: 'test-conn-id',
      userId: 'test-user-id',
      databaseName: 'mydb',
      selectedSchemas: ['public'],
      selectedTables: ['public.orders'],
      runId: 'run-1',
      modelName: 'My Model',
      instructions: null,
      datasets: [createValidDataset()],
      foreignKeys: [],
      tableMetrics: [[tableMetric1], [tableMetric2]],
      failedTables: [],
      relationshipCandidates: [],
      relationships: [],
      modelMetrics: [modelMetric],
      modelAiContext: { synonyms: [], instructions: '' },
      semanticModel: null,
      tokensUsed: { prompt: 0, completion: 0, total: 0 },
      semanticModelId: null,
      osiSpecText: '',
      error: null,
    };

    const result = await node(state);
    const model = result.semanticModel as any;
    expect(model.semantic_model[0].metrics).toHaveLength(3);
    expect(model.semantic_model[0].metrics.map((m: any) => m.name)).toEqual([
      'total_orders',
      'table_metric_2',
      'model_metric',
    ]);
  });

  it('should call updateRunProgress with correct parameters', async () => {
    const node = createAssembleModelNode(mockService, 'run-123', mockEmit);

    const state = {
      connectionId: 'test-conn-id',
      userId: 'test-user-id',
      databaseName: 'mydb',
      selectedSchemas: ['public'],
      selectedTables: ['public.orders', 'public.customers', 'public.products'],
      runId: 'run-123',
      modelName: 'My Model',
      instructions: null,
      datasets: [createValidDataset(), createValidDataset()],
      foreignKeys: [],
      tableMetrics: [],
      failedTables: ['public.failed_table'],
      relationshipCandidates: [],
      relationships: [],
      modelMetrics: [],
      modelAiContext: { synonyms: [], instructions: '' },
      semanticModel: null,
      tokensUsed: { prompt: 100, completion: 50, total: 150 },
      semanticModelId: null,
      osiSpecText: '',
      error: null,
    };

    await node(state);

    expect(mockService.updateRunProgress).toHaveBeenCalledWith('run-123', {
      currentStep: 'assemble_model',
      currentStepLabel: 'Assembling Model',
      completedTables: 2,
      totalTables: 3,
      failedTables: ['public.failed_table'],
      percentComplete: 90,
      tokensUsed: { prompt: 100, completion: 50, total: 150 },
      steps: [],
    });
  });

  it('should handle updateRunProgress failure gracefully', async () => {
    mockService.updateRunProgress.mockRejectedValue(new Error('Update failed'));
    const node = createAssembleModelNode(mockService, 'run-1', mockEmit);

    const state = {
      connectionId: 'test-conn-id',
      userId: 'test-user-id',
      databaseName: 'mydb',
      selectedSchemas: ['public'],
      selectedTables: ['public.orders'],
      runId: 'run-1',
      modelName: 'My Model',
      instructions: null,
      datasets: [createValidDataset()],
      foreignKeys: [],
      tableMetrics: [],
      failedTables: [],
      relationshipCandidates: [],
      relationships: [],
      modelMetrics: [],
      modelAiContext: { synonyms: [], instructions: '' },
      semanticModel: null,
      tokensUsed: { prompt: 0, completion: 0, total: 0 },
      semanticModelId: null,
      osiSpecText: '',
      error: null,
    };

    // Should not throw
    await expect(node(state)).resolves.toBeDefined();
  });
});

// Parallel Discover and Generate Tests
describe('createDiscoverAndGenerateNode (parallel processing)', () => {
  const createMockDiscoveryService = () => ({
    listColumns: jest.fn(),
    getForeignKeys: jest.fn(),
    getSampleData: jest.fn(),
    getColumnStats: jest.fn(),
    getDistinctColumnValues: jest.fn(),
  });

  const createMockSemanticModelsService = () => ({
    updateRunProgress: jest.fn().mockResolvedValue(undefined),
  });

  const createMockLLM = () => ({
    invoke: jest.fn(),
  });

  const createMockColumns = (tableName: string): ColumnInfo[] => [
    {
      name: 'id',
      dataType: 'integer',
      nativeType: 'int4',
      isNullable: false,
      isPrimaryKey: true,
    },
    {
      name: 'name',
      dataType: 'character varying',
      nativeType: 'varchar',
      isNullable: true,
      isPrimaryKey: false,
    },
  ];

  const createValidLLMResponse = (tableName: string) => ({
    content: JSON.stringify({
      dataset: {
        name: tableName.replace('.', '_'),
        source: `mydb.${tableName}`,
        primary_key: ['id'],
        description: `Dataset for ${tableName}`,
        fields: [
          {
            name: 'id',
            expression: { dialects: [{ dialect: 'ANSI_SQL', expression: 'id' }] },
            label: 'ID',
            description: 'Primary key',
            ai_context: { synonyms: ['identifier'] },
          },
          {
            name: 'name',
            expression: { dialects: [{ dialect: 'ANSI_SQL', expression: 'name' }] },
            label: 'Name',
            description: 'Name field',
            ai_context: { synonyms: ['title', 'label'] },
          },
        ],
        ai_context: { synonyms: [tableName] },
      },
      metrics: [],
    }),
    usage_metadata: {
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
    },
  });

  const createMockState = (tables: string[]) => ({
    connectionId: 'test-conn',
    userId: 'test-user',
    databaseName: 'mydb',
    selectedSchemas: ['public'],
    selectedTables: tables,
    runId: 'run-123',
    modelName: 'Test Model',
    instructions: null,
    datasets: [],
    foreignKeys: [],
    tableMetrics: [],
    failedTables: [],
    relationshipCandidates: [],
    relationships: [],
    modelMetrics: [],
    modelAiContext: { synonyms: [], instructions: '' },
    semanticModel: null,
    tokensUsed: { prompt: 0, completion: 0, total: 0 },
    semanticModelId: null,
    osiSpecText: '',
    error: null,
  });

  let originalEnvValue: string | undefined;

  beforeEach(() => {
    // Save original env var
    originalEnvValue = process.env.SEMANTIC_MODEL_CONCURRENCY;
  });

  afterEach(() => {
    // Restore env var
    if (originalEnvValue === undefined) {
      delete process.env.SEMANTIC_MODEL_CONCURRENCY;
    } else {
      process.env.SEMANTIC_MODEL_CONCURRENCY = originalEnvValue;
    }
  });

  it('should process multiple tables in parallel', async () => {
    const mockDiscovery = createMockDiscoveryService();
    const mockService = createMockSemanticModelsService();
    const mockLLM = createMockLLM();
    const mockEmit = jest.fn();

    const tables = ['public.table1', 'public.table2', 'public.table3'];

    // Mock discovery responses
    mockDiscovery.listColumns.mockResolvedValue({ data: createMockColumns('table1') });
    mockDiscovery.getForeignKeys.mockResolvedValue({ data: [] });
    mockDiscovery.getSampleData.mockResolvedValue({ data: { columns: ['id', 'name'], rows: [[1, 'test']] } });
    mockDiscovery.getColumnStats.mockResolvedValue({ data: { sampleValues: ['test'], distinctCount: 1, nullCount: 0 } });
    mockDiscovery.getDistinctColumnValues.mockResolvedValue(['test']);

    // Mock LLM responses with slight delay to verify parallel execution
    mockLLM.invoke.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      return createValidLLMResponse('table1');
    });

    const { createDiscoverAndGenerateNode } = require('../nodes/discover-and-generate');
    const node = createDiscoverAndGenerateNode(
      mockLLM as any,
      mockDiscovery as any,
      mockService as any,
      'test-conn',
      'test-user',
      'mydb',
      'run-123',
      mockEmit,
    );

    const state = createMockState(tables);
    const startTime = Date.now();
    const result = await node(state);
    const duration = Date.now() - startTime;

    // With concurrency > 1, processing 3 tables with 50ms delay each should take less than 500ms
    // Sequential would take ~150ms+
    expect(duration).toBeLessThan(500);

    expect(result.datasets).toHaveLength(3);
    expect(mockLLM.invoke).toHaveBeenCalledTimes(3);

    // Verify progress events show parallel processing
    const progressEvents = mockEmit.mock.calls.filter(c => c[0].type === 'progress');
    expect(progressEvents.length).toBeGreaterThan(0);
  });

  it('should handle individual table failures without stopping other tables', async () => {
    const mockDiscovery = createMockDiscoveryService();
    const mockService = createMockSemanticModelsService();
    const mockLLM = createMockLLM();
    const mockEmit = jest.fn();

    const tables = ['public.table1', 'public.table2', 'public.table3'];

    // Mock discovery responses
    mockDiscovery.listColumns.mockImplementation(async (connId, db, schema, table) => {
      if (table === 'table2') {
        throw new Error('Discovery failed for table2');
      }
      return { data: createMockColumns(table) };
    });
    mockDiscovery.getForeignKeys.mockResolvedValue({ data: [] });
    mockDiscovery.getSampleData.mockResolvedValue({ data: { columns: ['id', 'name'], rows: [[1, 'test']] } });
    mockDiscovery.getColumnStats.mockResolvedValue({ data: { sampleValues: ['test'], distinctCount: 1, nullCount: 0 } });
    mockDiscovery.getDistinctColumnValues.mockResolvedValue(['test']);

    // Mock LLM responses
    mockLLM.invoke.mockImplementation(async () => createValidLLMResponse('table1'));

    const { createDiscoverAndGenerateNode } = require('../nodes/discover-and-generate');
    const node = createDiscoverAndGenerateNode(
      mockLLM as any,
      mockDiscovery as any,
      mockService as any,
      'test-conn',
      'test-user',
      'mydb',
      'run-123',
      mockEmit,
    );

    const state = createMockState(tables);
    const result = await node(state);

    // Should have 2 successful datasets (table1 and table3)
    expect(result.datasets).toHaveLength(2);
    expect(result.failedTables).toEqual(['public.table2']);

    // Verify table_error event was emitted
    const errorEvents = mockEmit.mock.calls.filter(c => c[0].type === 'table_error');
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0][0].tableName).toBe('public.table2');
  });

  it('should pre-fetch foreign keys before parallel processing', async () => {
    const mockDiscovery = createMockDiscoveryService();
    const mockService = createMockSemanticModelsService();
    const mockLLM = createMockLLM();
    const mockEmit = jest.fn();

    const tables = ['public.table1', 'public.table2', 'schema2.table3'];

    const mockFKs: ForeignKeyInfo[] = [
      {
        constraintName: 'fk_test',
        fromSchema: 'public',
        fromTable: 'table1',
        fromColumns: ['ref_id'],
        toSchema: 'public',
        toTable: 'table2',
        toColumns: ['id'],
      },
    ];

    // Mock discovery responses
    mockDiscovery.listColumns.mockResolvedValue({ data: createMockColumns('table1') });
    mockDiscovery.getForeignKeys.mockResolvedValue({ data: mockFKs });
    mockDiscovery.getSampleData.mockResolvedValue({ data: { columns: ['id', 'name'], rows: [[1, 'test']] } });
    mockDiscovery.getColumnStats.mockResolvedValue({ data: { sampleValues: ['test'], distinctCount: 1, nullCount: 0 } });
    mockDiscovery.getDistinctColumnValues.mockResolvedValue(['test']);

    // Mock LLM responses
    mockLLM.invoke.mockResolvedValue(createValidLLMResponse('table1'));

    const { createDiscoverAndGenerateNode } = require('../nodes/discover-and-generate');
    const node = createDiscoverAndGenerateNode(
      mockLLM as any,
      mockDiscovery as any,
      mockService as any,
      'test-conn',
      'test-user',
      'mydb',
      'run-123',
      mockEmit,
    );

    const state = createMockState(tables);
    await node(state);

    // getForeignKeys should be called once per unique schema (public and schema2)
    expect(mockDiscovery.getForeignKeys).toHaveBeenCalledTimes(2);
    expect(mockDiscovery.getForeignKeys).toHaveBeenCalledWith('test-conn', 'mydb', 'public');
    expect(mockDiscovery.getForeignKeys).toHaveBeenCalledWith('test-conn', 'mydb', 'schema2');
  });

  it('should respect SEMANTIC_MODEL_CONCURRENCY env var', async () => {
    process.env.SEMANTIC_MODEL_CONCURRENCY = '3';

    const mockDiscovery = createMockDiscoveryService();
    const mockService = createMockSemanticModelsService();
    const mockLLM = createMockLLM();
    const mockEmit = jest.fn();

    const tables = Array.from({ length: 6 }, (_, i) => `public.table${i + 1}`);

    let activeCount = 0;
    let maxConcurrent = 0;

    // Mock discovery responses
    mockDiscovery.listColumns.mockResolvedValue({ data: createMockColumns('table1') });
    mockDiscovery.getForeignKeys.mockResolvedValue({ data: [] });
    mockDiscovery.getSampleData.mockResolvedValue({ data: { columns: ['id', 'name'], rows: [[1, 'test']] } });
    mockDiscovery.getColumnStats.mockResolvedValue({ data: { sampleValues: ['test'], distinctCount: 1, nullCount: 0 } });
    mockDiscovery.getDistinctColumnValues.mockResolvedValue(['test']);

    // Mock LLM with tracking
    mockLLM.invoke.mockImplementation(async () => {
      activeCount++;
      maxConcurrent = Math.max(maxConcurrent, activeCount);
      await new Promise(resolve => setTimeout(resolve, 20));
      activeCount--;
      return createValidLLMResponse('table1');
    });

    const { createDiscoverAndGenerateNode } = require('../nodes/discover-and-generate');
    const node = createDiscoverAndGenerateNode(
      mockLLM as any,
      mockDiscovery as any,
      mockService as any,
      'test-conn',
      'test-user',
      'mydb',
      'run-123',
      mockEmit,
    );

    const state = createMockState(tables);
    await node(state);

    // Should respect concurrency limit of 3
    expect(maxConcurrent).toBeLessThanOrEqual(3);
    expect(maxConcurrent).toBeGreaterThan(1); // Should be parallel
  });

  it('should default to DEFAULT_TABLE_CONCURRENCY when env var is not set', async () => {
    delete process.env.SEMANTIC_MODEL_CONCURRENCY;

    const mockDiscovery = createMockDiscoveryService();
    const mockService = createMockSemanticModelsService();
    const mockLLM = createMockLLM();
    const mockEmit = jest.fn();

    const tables = Array.from({ length: 10 }, (_, i) => `public.table${i + 1}`);

    let activeCount = 0;
    let maxConcurrent = 0;

    // Mock discovery responses
    mockDiscovery.listColumns.mockResolvedValue({ data: createMockColumns('table1') });
    mockDiscovery.getForeignKeys.mockResolvedValue({ data: [] });
    mockDiscovery.getSampleData.mockResolvedValue({ data: { columns: ['id', 'name'], rows: [[1, 'test']] } });
    mockDiscovery.getColumnStats.mockResolvedValue({ data: { sampleValues: ['test'], distinctCount: 1, nullCount: 0 } });
    mockDiscovery.getDistinctColumnValues.mockResolvedValue(['test']);

    // Mock LLM with tracking
    mockLLM.invoke.mockImplementation(async () => {
      activeCount++;
      maxConcurrent = Math.max(maxConcurrent, activeCount);
      await new Promise(resolve => setTimeout(resolve, 20));
      activeCount--;
      return createValidLLMResponse('table1');
    });

    const { createDiscoverAndGenerateNode, DEFAULT_TABLE_CONCURRENCY } = require('../nodes/discover-and-generate');
    const node = createDiscoverAndGenerateNode(
      mockLLM as any,
      mockDiscovery as any,
      mockService as any,
      'test-conn',
      'test-user',
      'mydb',
      'run-123',
      mockEmit,
    );

    const state = createMockState(tables);
    await node(state);

    // Should use default concurrency (5)
    expect(DEFAULT_TABLE_CONCURRENCY).toBe(5);
    expect(maxConcurrent).toBeLessThanOrEqual(5);
    expect(maxConcurrent).toBeGreaterThan(1);
  });

  it('should clamp concurrency to 1-20 range', async () => {
    const testCases = [
      { envValue: '0', expectedMax: 1 },
      { envValue: '-5', expectedMax: 1 },
      { envValue: '50', expectedMax: 20 },
      { envValue: 'abc', expectedMax: 5 }, // Falls back to default
    ];

    for (const { envValue, expectedMax } of testCases) {
      process.env.SEMANTIC_MODEL_CONCURRENCY = envValue;

      const mockDiscovery = createMockDiscoveryService();
      const mockService = createMockSemanticModelsService();
      const mockLLM = createMockLLM();
      const mockEmit = jest.fn();

      const numTables = expectedMax + 5; // More tables than max concurrency
      const tables = Array.from({ length: numTables }, (_, i) => `public.table${i + 1}`);

      let activeCount = 0;
      let maxConcurrent = 0;

      // Mock discovery responses
      mockDiscovery.listColumns.mockResolvedValue({ data: createMockColumns('table1') });
      mockDiscovery.getForeignKeys.mockResolvedValue({ data: [] });
      mockDiscovery.getSampleData.mockResolvedValue({ data: { columns: ['id', 'name'], rows: [[1, 'test']] } });
      mockDiscovery.getColumnStats.mockResolvedValue({ data: { sampleValues: ['test'], distinctCount: 1, nullCount: 0 } });
      mockDiscovery.getDistinctColumnValues.mockResolvedValue(['test']);

      // Mock LLM with tracking
      mockLLM.invoke.mockImplementation(async () => {
        activeCount++;
        maxConcurrent = Math.max(maxConcurrent, activeCount);
        await new Promise(resolve => setTimeout(resolve, 10));
        activeCount--;
        return createValidLLMResponse('table1');
      });

      const { createDiscoverAndGenerateNode } = require('../nodes/discover-and-generate');
      const node = createDiscoverAndGenerateNode(
        mockLLM as any,
        mockDiscovery as any,
        mockService as any,
        'test-conn',
        'test-user',
        'mydb',
        'run-123',
        mockEmit,
      );

      const state = createMockState(tables);
      await node(state);

      expect(maxConcurrent).toBeLessThanOrEqual(expectedMax);
    }
  });
});
