// ==========================================
// Unit Tests for generate_relationships Node
// ==========================================

import { createGenerateRelationshipsNode } from '../../src/semantic-models/agent/nodes/generate-relationships';
import { AgentStateType } from '../../src/semantic-models/agent/state';
import { SemanticModelsService } from '../../src/semantic-models/semantic-models.service';

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const mockCandidate = {
  fromSchema: 'public',
  fromTable: 'orders',
  fromColumns: ['customer_id'],
  toSchema: 'public',
  toTable: 'customers',
  toColumns: ['id'],
  source: 'database_constraint' as const,
  confidence: 'high' as const,
} as any;

const mockDataset = {
  name: 'public.customers',
  source: 'testdb.public.customers',
  primary_key: ['id'],
  fields: [{ name: 'id' }, { name: 'name' }],
} as any;

const validRelationships = [
  {
    name: 'order_customer',
    from: 'public.orders',
    to: 'public.customers',
    from_columns: ['customer_id'],
    to_columns: ['id'],
  },
];

const mockRawResponse = {
  content: 'some content',
  usage_metadata: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
};

// ---------------------------------------------------------------------------
// Mock LLM factory
// ---------------------------------------------------------------------------

function createMockLlm(options: {
  structuredResult?: any;
  structuredError?: Error;
  plainResult?: any;
  bindResult?: any;
}): any {
  const mockStructuredInvoke = jest.fn();
  if (options.structuredError) {
    mockStructuredInvoke.mockRejectedValue(options.structuredError);
  } else if (options.structuredResult !== undefined) {
    mockStructuredInvoke.mockResolvedValue(options.structuredResult);
  }

  const mockInvoke = jest.fn();
  if (options.plainResult !== undefined) {
    mockInvoke.mockResolvedValue(options.plainResult);
  }

  const mockBind = jest.fn();
  if (options.bindResult !== undefined) {
    mockBind.mockReturnValue(options.bindResult);
  }

  return {
    withStructuredOutput: jest.fn().mockReturnValue({ invoke: mockStructuredInvoke }),
    invoke: mockInvoke,
    bind: mockBind,
  };
}

// ---------------------------------------------------------------------------
// Describe block
// ---------------------------------------------------------------------------

describe('generate_relationships node', () => {
  let mockSemanticModelsService: jest.Mocked<SemanticModelsService>;
  let emitProgress: jest.Mock;
  let state: AgentStateType;

  beforeEach(() => {
    mockSemanticModelsService = {
      updateRunProgress: jest.fn().mockResolvedValue(undefined),
    } as any;

    emitProgress = jest.fn();

    state = {
      connectionId: 'conn-1',
      userId: 'user-1',
      databaseName: 'testdb',
      selectedSchemas: ['public'],
      selectedTables: ['public.customers', 'public.orders'],
      runId: 'run-1',
      modelName: 'Test Model',
      instructions: null,
      osiSpecText: '',
      datasets: [],
      foreignKeys: [],
      tableMetrics: [],
      failedTables: [],
      relationshipCandidates: [],
      relationships: [],
      modelMetrics: [],
      modelAiContext: null,
      semanticModel: null,
      tokensUsed: { prompt: 0, completion: 0, total: 0 },
      semanticModelId: null,
      error: null,
    };
  });

  // ==========================================
  // Test 1: No datasets
  // ==========================================

  it('returns empty arrays when no datasets', async () => {
    state.datasets = [];

    const mockLlm = createMockLlm({});
    const node = createGenerateRelationshipsNode(
      mockLlm,
      mockSemanticModelsService,
      'run-1',
      emitProgress,
    );

    const result = await node(state);

    expect(result).toEqual({
      relationships: [],
      modelMetrics: [],
      modelAiContext: null,
    });

    // LLM should not be called at all
    expect(mockLlm.withStructuredOutput).not.toHaveBeenCalled();
    expect(mockLlm.invoke).not.toHaveBeenCalled();
  });

  // ==========================================
  // Test 2: Happy path via withStructuredOutput
  // ==========================================

  it('generates relationships via withStructuredOutput', async () => {
    state.datasets = [mockDataset];
    state.relationshipCandidates = [mockCandidate];
    state.tokensUsed = { prompt: 10, completion: 5, total: 15 };

    const structuredResult = {
      parsed: {
        relationships: validRelationships,
        model_metrics: [],
        model_ai_context: null,
      },
      raw: mockRawResponse,
    };

    const mockLlm = createMockLlm({ structuredResult });
    const node = createGenerateRelationshipsNode(
      mockLlm,
      mockSemanticModelsService,
      'run-1',
      emitProgress,
    );

    const result = await node(state);

    // Relationships returned correctly
    expect(result.relationships).toHaveLength(1);
    expect(result.relationships![0]).toMatchObject({
      name: 'order_customer',
      from: 'public.orders',
      to: 'public.customers',
    });

    // Model-level artifacts
    expect(result.modelMetrics).toEqual([]);
    expect(result.modelAiContext).toBeNull();

    // Token accounting: initial (10/5/15) + call (100/50/150) = 110/55/165
    expect(result.tokensUsed).toEqual({
      prompt: 110,
      completion: 55,
      total: 165,
    });

    // Token update event was emitted
    const tokenEvents = emitProgress.mock.calls.filter(
      (call) => call[0].type === 'token_update',
    );
    expect(tokenEvents.length).toBeGreaterThan(0);

    // withStructuredOutput was called on the LLM
    expect(mockLlm.withStructuredOutput).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'generate_relationships', includeRaw: true }),
    );
  });

  // ==========================================
  // Test 3: Fallback to plain invoke
  // ==========================================

  it('falls back to plain invoke when withStructuredOutput fails', async () => {
    state.datasets = [mockDataset];
    state.relationshipCandidates = [mockCandidate];

    const plainResult = {
      content: JSON.stringify({
        relationships: validRelationships,
        model_metrics: [],
        model_ai_context: null,
      }),
      usage_metadata: { input_tokens: 80, output_tokens: 40, total_tokens: 120 },
    };

    const mockLlm = createMockLlm({
      structuredError: new Error('withStructuredOutput not supported'),
      plainResult,
    });

    const node = createGenerateRelationshipsNode(
      mockLlm,
      mockSemanticModelsService,
      'run-1',
      emitProgress,
    );

    const result = await node(state);

    // Fallback should still return relationships
    expect(result.relationships).toHaveLength(1);
    expect(result.relationships![0].name).toBe('order_customer');

    // Plain invoke was called as fallback
    expect(mockLlm.invoke).toHaveBeenCalledTimes(1);

    // Tokens extracted from plain response
    expect(result.tokensUsed).toEqual({
      prompt: 80,
      completion: 40,
      total: 120,
    });
  });

  // ==========================================
  // Test 4: Retry when candidates exist but zero relationships produced
  // ==========================================

  it('retries when candidates exist but zero relationships produced', async () => {
    state.datasets = [mockDataset];
    state.relationshipCandidates = [mockCandidate];

    // First call: returns empty relationships
    const firstStructuredInvoke = jest.fn().mockResolvedValue({
      parsed: { relationships: [], model_metrics: [], model_ai_context: null },
      raw: { content: '', usage_metadata: { input_tokens: 50, output_tokens: 20, total_tokens: 70 } },
    });

    // Retry LLM (bound with temperature): returns real relationships
    const retryStructuredInvoke = jest.fn().mockResolvedValue({
      parsed: { relationships: validRelationships, model_metrics: [], model_ai_context: null },
      raw: { content: '', usage_metadata: { input_tokens: 60, output_tokens: 25, total_tokens: 85 } },
    });

    const retryLlm = {
      withStructuredOutput: jest.fn().mockReturnValue({ invoke: retryStructuredInvoke }),
      invoke: jest.fn(),
      bind: jest.fn(),
    };

    const mockLlm = {
      withStructuredOutput: jest.fn().mockReturnValue({ invoke: firstStructuredInvoke }),
      invoke: jest.fn(),
      bind: jest.fn().mockReturnValue(retryLlm),
    };

    const node = createGenerateRelationshipsNode(
      mockLlm as any,
      mockSemanticModelsService,
      'run-1',
      emitProgress,
    );

    const result = await node(state);

    // Retry event was emitted
    const retryTextEvents = emitProgress.mock.calls.filter(
      (call) => call[0].type === 'text' && call[0].content?.includes('Retrying'),
    );
    expect(retryTextEvents).toHaveLength(1);

    // Result contains relationships from retry
    expect(result.relationships).toHaveLength(1);
    expect(result.relationships![0].name).toBe('order_customer');

    // Tokens from BOTH calls are accumulated: 70 + 85 = 155
    expect(result.tokensUsed!.total).toBe(155);
    expect(result.tokensUsed!.prompt).toBe(110);    // 50 + 60
    expect(result.tokensUsed!.completion).toBe(45); // 20 + 25

    // llm.bind was called to create retry LLM with temperature override
    expect(mockLlm.bind).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0.2 }),
    );
  });

  // ==========================================
  // Test 5: Both attempts fail — warning emitted
  // ==========================================

  it('emits warning when both initial and retry attempts produce empty relationships', async () => {
    state.datasets = [mockDataset];
    state.relationshipCandidates = [mockCandidate];

    const emptyResult = {
      parsed: { relationships: [], model_metrics: [], model_ai_context: null },
      raw: { content: '', usage_metadata: { input_tokens: 30, output_tokens: 10, total_tokens: 40 } },
    };

    // Retry LLM also returns empty
    const retryLlm = {
      withStructuredOutput: jest.fn().mockReturnValue({
        invoke: jest.fn().mockResolvedValue(emptyResult),
      }),
      invoke: jest.fn(),
      bind: jest.fn(),
    };

    const mockLlm = {
      withStructuredOutput: jest.fn().mockReturnValue({
        invoke: jest.fn().mockResolvedValue(emptyResult),
      }),
      invoke: jest.fn(),
      bind: jest.fn().mockReturnValue(retryLlm),
    };

    const node = createGenerateRelationshipsNode(
      mockLlm as any,
      mockSemanticModelsService,
      'run-1',
      emitProgress,
    );

    const result = await node(state);

    // Warning event about saving without relationships
    const warningEvents = emitProgress.mock.calls.filter(
      (call) =>
        call[0].type === 'text' &&
        call[0].content?.includes('Warning') &&
        call[0].content?.includes('without relationships'),
    );
    expect(warningEvents).toHaveLength(1);

    // Result still has empty relationships
    expect(result.relationships).toEqual([]);
  });

  // ==========================================
  // Test 6: No retry when no candidates exist
  // ==========================================

  it('does not retry when no candidates exist and first call returns empty relationships', async () => {
    state.datasets = [mockDataset];
    state.relationshipCandidates = []; // No candidates

    const emptyResult = {
      parsed: { relationships: [], model_metrics: [], model_ai_context: null },
      raw: mockRawResponse,
    };

    const mockLlm = createMockLlm({
      structuredResult: emptyResult,
    });

    const node = createGenerateRelationshipsNode(
      mockLlm,
      mockSemanticModelsService,
      'run-1',
      emitProgress,
    );

    const result = await node(state);

    // No retry was triggered
    expect(mockLlm.bind).not.toHaveBeenCalled();

    // No "Retrying..." text event
    const retryEvents = emitProgress.mock.calls.filter(
      (call) => call[0].type === 'text' && call[0].content?.includes('Retrying'),
    );
    expect(retryEvents).toHaveLength(0);

    // No warning event either (no candidates, so silence is correct)
    const warningEvents = emitProgress.mock.calls.filter(
      (call) =>
        call[0].type === 'text' && call[0].content?.includes('Warning'),
    );
    expect(warningEvents).toHaveLength(0);

    // Empty result returned
    expect(result.relationships).toEqual([]);
  });

  // ==========================================
  // Additional: updateRunProgress is called
  // ==========================================

  it('calls updateRunProgress with correct step metadata', async () => {
    state.datasets = [mockDataset];
    state.selectedTables = ['public.customers'];

    const structuredResult = {
      parsed: { relationships: [], model_metrics: [], model_ai_context: null },
      raw: mockRawResponse,
    };

    const mockLlm = createMockLlm({ structuredResult });
    const node = createGenerateRelationshipsNode(
      mockLlm,
      mockSemanticModelsService,
      'run-1',
      emitProgress,
    );

    await node(state);

    expect(mockSemanticModelsService.updateRunProgress).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        currentStep: 'generate_relationships',
        currentStepLabel: 'Generating Relationships',
        percentComplete: 88,
      }),
    );
  });
});
