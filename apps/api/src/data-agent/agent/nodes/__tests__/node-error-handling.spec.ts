/**
 * Error handling tests for executor, sql-builder, and verifier nodes.
 *
 * Covers three bug fixes:
 *  A. Executor — records a stepResult.error when querySpec is missing (querySpecs empty or null)
 *  B. SQL Builder — null-safe parsing of structured output + fallback query generation on failure
 *  C. Verifier — simple query bypass logic + improved diagnosis when no results are available
 */

import { createExecutorNode } from '../executor.node';
import { createSqlBuilderNode } from '../sql-builder.node';
import { createVerifierNode } from '../verifier.node';
import { DataAgentStateType } from '../../state';

// ---------------------------------------------------------------------------
// Base state factory
// ---------------------------------------------------------------------------

function buildBaseState(overrides: Partial<DataAgentStateType> = {}): DataAgentStateType {
  return {
    userQuestion: 'what are the product categories?',
    chatId: 'chat-1',
    messageId: 'msg-1',
    userId: 'user-1',
    ontologyId: 'ont-1',
    connectionId: 'conn-1',
    databaseName: 'testdb',
    databaseType: 'postgresql',
    conversationContext: '',
    relevantDatasets: [],
    relevantDatasetDetails: [],
    userPreferences: [],
    clarificationRound: 0,
    plan: null,
    joinPlan: null,
    querySpecs: null,
    stepResults: null,
    verificationReport: null,
    explainerOutput: null,
    cannotAnswer: null,
    currentPhase: null,
    revisionCount: 0,
    revisionDiagnosis: null,
    revisionTarget: null,
    toolCalls: [],
    tokensUsed: { prompt: 0, completion: 0, total: 0 },
    error: null,
    messages: [],
    ...overrides,
  } as DataAgentStateType;
}

// ---------------------------------------------------------------------------
// Shared mock builders
// ---------------------------------------------------------------------------

function buildMockEmit() {
  return jest.fn();
}

/**
 * Minimal tracer mock: the trace() method calls the user-supplied fn() and
 * wraps the result in { response: <result> }.
 */
function buildMockTracer() {
  return {
    trace: jest.fn().mockImplementation(async (_meta: any, _msgs: any, fn: () => any) => ({
      response: await fn(),
    })),
  } as any;
}

// ---------------------------------------------------------------------------
// A. Executor — missing querySpec error recording
// ---------------------------------------------------------------------------

describe('createExecutorNode — missing querySpec error recording', () => {
  let mockDiscoveryService: any;
  let mockSandboxService: any;
  let mockLlm: any;
  let mockStructuredLlm: any;
  let mockEmit: jest.Mock;
  let mockTracer: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDiscoveryService = {
      executeQuery: jest.fn().mockResolvedValue({
        data: { rowCount: 1, columns: ['id', 'name'], rows: [['1', 'Electronics']] },
      }),
    };

    mockSandboxService = {
      executeCode: jest.fn().mockResolvedValue({ stdout: '', stderr: '', returnCode: 0, files: [] }),
    };

    // The executor calls llm.bindTools() at factory creation time (not per-invocation)
    // and then uses the result (invoker) to invoke. Mock it so nothing breaks.
    mockLlm = {
      bindTools: jest.fn().mockReturnThis(),
      invoke: jest.fn().mockResolvedValue({ content: '' }),
    };

    mockStructuredLlm = {
      withStructuredOutput: jest.fn().mockReturnValue({
        invoke: jest.fn().mockResolvedValue({ parsed: null, raw: { usage: {} } }),
      }),
    };

    mockEmit = buildMockEmit();
    mockTracer = buildMockTracer();
  });

  it('should record an error on stepResult when querySpecs is an empty array and strategy is sql', async () => {
    const plan = {
      complexity: 'simple' as const,
      intent: 'list categories',
      metrics: [],
      dimensions: [],
      timeWindow: null,
      filters: [],
      grain: 'row',
      ambiguities: [],
      acceptanceChecks: [],
      shouldClarify: false,
      clarificationQuestions: [],
      confidenceLevel: 'high' as const,
      steps: [
        {
          id: 1,
          description: 'Fetch product categories',
          strategy: 'sql' as const,
          dependsOn: [],
          datasets: ['products'],
          expectedOutput: 'category list',
        },
      ],
    };

    const state = buildBaseState({ plan, querySpecs: [] });

    const node = createExecutorNode(
      mockLlm,
      mockStructuredLlm,
      mockDiscoveryService,
      mockSandboxService,
      'conn-1',
      'testdb',
      mockEmit,
      mockTracer,
      null,
    );

    const result = await node(state);

    expect(result.stepResults).toBeDefined();
    expect(result.stepResults).toHaveLength(1);
    expect(result.stepResults![0].error).toContain('No SQL query was generated');
  });

  it('should emit a tool_error event when querySpec is missing', async () => {
    const plan = {
      complexity: 'simple' as const,
      intent: 'list categories',
      metrics: [],
      dimensions: [],
      timeWindow: null,
      filters: [],
      grain: 'row',
      ambiguities: [],
      acceptanceChecks: [],
      shouldClarify: false,
      clarificationQuestions: [],
      confidenceLevel: 'high' as const,
      steps: [
        {
          id: 1,
          description: 'Fetch product categories',
          strategy: 'sql' as const,
          dependsOn: [],
          datasets: ['products'],
          expectedOutput: 'category list',
        },
      ],
    };

    const state = buildBaseState({ plan, querySpecs: [] });

    const node = createExecutorNode(
      mockLlm,
      mockStructuredLlm,
      mockDiscoveryService,
      mockSandboxService,
      'conn-1',
      'testdb',
      mockEmit,
      mockTracer,
      null,
    );

    await node(state);

    const toolErrorCalls = mockEmit.mock.calls.filter(
      (call: any[]) => call[0].type === 'tool_error',
    );
    expect(toolErrorCalls.length).toBeGreaterThanOrEqual(1);
    const toolError = toolErrorCalls[0][0];
    expect(toolError.name).toBe('query_database');
    expect(toolError.error).toContain('No SQL query was generated');
  });

  it('should record an error on stepResult when querySpecs is null and strategy is sql', async () => {
    const plan = {
      complexity: 'simple' as const,
      intent: 'list categories',
      metrics: [],
      dimensions: [],
      timeWindow: null,
      filters: [],
      grain: 'row',
      ambiguities: [],
      acceptanceChecks: [],
      shouldClarify: false,
      clarificationQuestions: [],
      confidenceLevel: 'high' as const,
      steps: [
        {
          id: 1,
          description: 'Fetch product categories',
          strategy: 'sql' as const,
          dependsOn: [],
          datasets: ['products'],
          expectedOutput: 'category list',
        },
      ],
    };

    // querySpecs is explicitly null
    const state = buildBaseState({ plan, querySpecs: null });

    const node = createExecutorNode(
      mockLlm,
      mockStructuredLlm,
      mockDiscoveryService,
      mockSandboxService,
      'conn-1',
      'testdb',
      mockEmit,
      mockTracer,
      null,
    );

    const result = await node(state);

    expect(result.stepResults).toBeDefined();
    expect(result.stepResults).toHaveLength(1);
    expect(result.stepResults![0].error).toContain('No SQL query was generated');
  });

  it('should execute query and populate sqlResult when a matching querySpec exists', async () => {
    const plan = {
      complexity: 'simple' as const,
      intent: 'list categories',
      metrics: [],
      dimensions: [],
      timeWindow: null,
      filters: [],
      grain: 'row',
      ambiguities: [],
      acceptanceChecks: [],
      shouldClarify: false,
      clarificationQuestions: [],
      confidenceLevel: 'high' as const,
      steps: [
        {
          id: 1,
          description: 'Fetch product categories',
          strategy: 'sql' as const,
          dependsOn: [],
          datasets: ['products'],
          expectedOutput: 'category list',
        },
      ],
    };

    const querySpecs = [
      {
        stepId: 1,
        description: 'Fetch product categories',
        pilotSql: 'SELECT * FROM products LIMIT 10',
        fullSql: 'SELECT * FROM products',
        expectedColumns: ['id', 'name'],
        notes: '',
      },
    ];

    const state = buildBaseState({ plan, querySpecs });

    const node = createExecutorNode(
      mockLlm,
      mockStructuredLlm,
      mockDiscoveryService,
      mockSandboxService,
      'conn-1',
      'testdb',
      mockEmit,
      mockTracer,
      null,
    );

    const result = await node(state);

    // executeQuery should have been called (at least for the pilot run)
    expect(mockDiscoveryService.executeQuery).toHaveBeenCalled();
    expect(result.stepResults).toBeDefined();
    expect(result.stepResults).toHaveLength(1);
    // sqlResult should be populated (no error)
    expect(result.stepResults![0].sqlResult).toBeDefined();
    expect(result.stepResults![0].error).toBeUndefined();
  });

  it('should not call executeQuery when querySpecs is empty', async () => {
    const plan = {
      complexity: 'simple' as const,
      intent: 'list categories',
      metrics: [],
      dimensions: [],
      timeWindow: null,
      filters: [],
      grain: 'row',
      ambiguities: [],
      acceptanceChecks: [],
      shouldClarify: false,
      clarificationQuestions: [],
      confidenceLevel: 'high' as const,
      steps: [
        {
          id: 1,
          description: 'Fetch product categories',
          strategy: 'sql' as const,
          dependsOn: [],
          datasets: ['products'],
          expectedOutput: 'category list',
        },
      ],
    };

    const state = buildBaseState({ plan, querySpecs: [] });

    const node = createExecutorNode(
      mockLlm,
      mockStructuredLlm,
      mockDiscoveryService,
      mockSandboxService,
      'conn-1',
      'testdb',
      mockEmit,
      mockTracer,
      null,
    );

    await node(state);

    expect(mockDiscoveryService.executeQuery).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// B. SQL Builder — null-safe parsing + fallback query generation
// ---------------------------------------------------------------------------

describe('createSqlBuilderNode — null-safe parsing and fallback queries', () => {
  let mockEmit: jest.Mock;
  let mockTracer: any;
  let mockNeoOntologyService: any;

  // The sql-builder node internally calls:
  //   const baseLlm = webSearchTool ? llm.bindTools([...]) : llm;
  //   const structuredLlm = baseLlm.withStructuredOutput(...);
  //   const { response } = await tracer.trace(..., () => structuredLlm.invoke(messages));
  //
  // So we need an llm object whose withStructuredOutput() returns an object with invoke().
  function buildStructuredLlmMock(invokeResult: any) {
    const invokeFn = jest.fn().mockResolvedValue(invokeResult);
    const structuredLlmObj = { invoke: invokeFn };
    const withStructuredOutput = jest.fn().mockReturnValue(structuredLlmObj);
    const llm = {
      bindTools: jest.fn().mockReturnThis(),
      withStructuredOutput,
    };
    return { llm, invokeFn, withStructuredOutput };
  }

  function buildPlan(datasets = ['products']) {
    return {
      complexity: 'simple' as const,
      intent: 'list categories',
      metrics: [],
      dimensions: [],
      timeWindow: null,
      filters: [],
      grain: 'row',
      ambiguities: [],
      acceptanceChecks: [],
      shouldClarify: false,
      clarificationQuestions: [],
      confidenceLevel: 'high' as const,
      steps: [
        {
          id: 1,
          description: 'Fetch categories',
          strategy: 'sql' as const,
          dependsOn: [],
          datasets,
          expectedOutput: 'category rows',
        },
      ],
    };
  }

  function buildJoinPlan(source = 'public.products') {
    return {
      relevantDatasets: [
        {
          name: 'products',
          description: 'Product catalog',
          source,
          yaml: 'name: products\nfields:\n  - name: id\n  - name: category',
        },
      ],
      joinPaths: [],
      notes: '',
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockEmit = buildMockEmit();
    mockTracer = buildMockTracer();
    mockNeoOntologyService = {
      getDatasetsByNames: jest.fn().mockResolvedValue([]),
    };
  });

  it('should return fallback querySpecs when structured output parsed is null', async () => {
    const mockRaw = { usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } };
    const { llm } = buildStructuredLlmMock({ parsed: null, raw: mockRaw });

    const plan = buildPlan();
    const joinPlan = buildJoinPlan('public.products');
    const state = buildBaseState({ plan, joinPlan });

    const node = createSqlBuilderNode(
      llm,
      mockNeoOntologyService,
      'ont-1',
      'postgresql',
      mockEmit,
      mockTracer,
      null,
    );

    const result = await node(state);

    expect(result.querySpecs).toBeDefined();
    expect(result.querySpecs!.length).toBeGreaterThan(0);
    // The fallback uses the dataset source as the table name
    expect(result.querySpecs![0].fullSql).toContain('public.products');
  });

  it('should return fallback querySpecs when structured output returns empty queries array', async () => {
    const mockRaw = { usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } };
    const { llm } = buildStructuredLlmMock({ parsed: { queries: [] }, raw: mockRaw });

    const plan = buildPlan();
    const joinPlan = buildJoinPlan('public.products');
    const state = buildBaseState({ plan, joinPlan });

    const node = createSqlBuilderNode(
      llm,
      mockNeoOntologyService,
      'ont-1',
      'postgresql',
      mockEmit,
      mockTracer,
      null,
    );

    const result = await node(state);

    expect(result.querySpecs).toBeDefined();
    expect(result.querySpecs!.length).toBeGreaterThan(0);
    expect(result.querySpecs![0].fullSql).toContain('public.products');
  });

  it('should use the LLM-generated queries when structured output is valid and non-empty', async () => {
    const generatedQuery = {
      stepId: 1,
      description: 'Fetch all categories',
      pilotSql: 'SELECT DISTINCT category FROM products LIMIT 10',
      fullSql: 'SELECT DISTINCT category FROM products ORDER BY category',
      expectedColumns: ['category'],
      notes: 'Fetches all product categories',
    };
    const mockRaw = { usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } };
    const { llm } = buildStructuredLlmMock({ parsed: { queries: [generatedQuery] }, raw: mockRaw });

    const plan = buildPlan();
    const joinPlan = buildJoinPlan('public.products');
    const state = buildBaseState({ plan, joinPlan });

    const node = createSqlBuilderNode(
      llm,
      mockNeoOntologyService,
      'ont-1',
      'postgresql',
      mockEmit,
      mockTracer,
      null,
    );

    const result = await node(state);

    expect(result.querySpecs).toBeDefined();
    expect(result.querySpecs).toHaveLength(1);
    // Should use the LLM-generated SQL, not the fallback
    expect(result.querySpecs![0].fullSql).toBe(generatedQuery.fullSql);
    expect(result.querySpecs![0].pilotSql).toBe(generatedQuery.pilotSql);
  });

  it('should return fallback querySpecs and set an error field when invoke throws', async () => {
    const invokeFn = jest.fn().mockRejectedValue(new Error('LLM connection timeout'));
    const structuredLlmObj = { invoke: invokeFn };
    const llm = {
      bindTools: jest.fn().mockReturnThis(),
      withStructuredOutput: jest.fn().mockReturnValue(structuredLlmObj),
    };

    const plan = buildPlan();
    const joinPlan = buildJoinPlan('public.products');
    const state = buildBaseState({ plan, joinPlan });

    const node = createSqlBuilderNode(
      llm,
      mockNeoOntologyService,
      'ont-1',
      'postgresql',
      mockEmit,
      mockTracer,
      null,
    );

    const result = await node(state);

    // Even on failure the node should return fallback specs (non-empty)
    expect(result.querySpecs).toBeDefined();
    expect(result.querySpecs!.length).toBeGreaterThan(0);
    // An error field should be set to describe what happened
    expect(result.error).toBeDefined();
    expect(result.error).toContain('SQL Builder error');
  });

  it('should include the dataset source in fallback pilotSql', async () => {
    const mockRaw = { usage: {} };
    const { llm } = buildStructuredLlmMock({ parsed: null, raw: mockRaw });

    const plan = buildPlan(['orders']);
    const joinPlan = {
      relevantDatasets: [
        {
          name: 'orders',
          description: 'Order records',
          source: 'sales.orders',
          yaml: 'name: orders',
        },
      ],
      joinPaths: [],
      notes: '',
    };
    const state = buildBaseState({ plan, joinPlan });

    const node = createSqlBuilderNode(
      llm,
      mockNeoOntologyService,
      'ont-1',
      'postgresql',
      mockEmit,
      mockTracer,
      null,
    );

    const result = await node(state);

    expect(result.querySpecs![0].pilotSql).toContain('sales.orders');
  });
});

// ---------------------------------------------------------------------------
// C. Verifier — simple query bypass + better diagnosis
// ---------------------------------------------------------------------------

describe('createVerifierNode — simple query bypass and diagnosis', () => {
  let mockEmit: jest.Mock;
  let mockTracer: any;
  let mockSandboxService: any;
  let mockLlm: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockEmit = buildMockEmit();
    mockTracer = buildMockTracer();
    mockSandboxService = {
      executeCode: jest.fn().mockResolvedValue({
        stdout: '{"passed":true,"checks":[]}',
        stderr: '',
        returnCode: 0,
        files: [],
      }),
    };
    mockLlm = {
      bindTools: jest.fn().mockReturnThis(),
      invoke: jest.fn().mockResolvedValue({ content: '' }),
    };
  });

  function buildSimplePlan(numDatasets = 1) {
    return {
      complexity: 'simple' as const,
      intent: 'simple question',
      metrics: [],
      dimensions: [],
      timeWindow: null,
      filters: [],
      grain: 'row',
      ambiguities: [],
      acceptanceChecks: [],
      shouldClarify: false,
      clarificationQuestions: [],
      confidenceLevel: 'high' as const,
      steps: [
        {
          id: 1,
          description: 'Simple query',
          strategy: 'sql' as const,
          dependsOn: [],
          datasets: Array.from({ length: numDatasets }, (_, i) => `dataset_${i + 1}`),
          expectedOutput: 'rows',
        },
      ],
    };
  }

  function buildAnalyticalPlan(numDatasets = 1) {
    return {
      complexity: 'analytical' as const,
      intent: 'analytical question',
      metrics: ['revenue'],
      dimensions: ['region'],
      timeWindow: 'last 30 days',
      filters: [],
      grain: 'daily',
      ambiguities: [],
      acceptanceChecks: [],
      shouldClarify: false,
      clarificationQuestions: [],
      confidenceLevel: 'high' as const,
      steps: [
        {
          id: 1,
          description: 'Analytical query',
          strategy: 'sql' as const,
          dependsOn: [],
          datasets: Array.from({ length: numDatasets }, (_, i) => `dataset_${i + 1}`),
          expectedOutput: 'aggregated rows',
        },
      ],
    };
  }

  function buildJoinPlanWithPaths(numPaths = 0) {
    const joinPaths = Array.from({ length: numPaths }, (_, i) => ({
      datasets: [`dataset_${i + 1}`, `dataset_${i + 2}`],
      edges: [
        {
          fromDataset: `dataset_${i + 1}`,
          toDataset: `dataset_${i + 2}`,
          fromColumns: ['id'],
          toColumns: [`dataset_${i + 1}_id`],
          relationshipName: 'has',
        },
      ],
    }));
    return {
      relevantDatasets: [],
      joinPaths,
      notes: '',
    };
  }

  it('should auto-pass (bypass verification) for a simple single-step query with 1 dataset, even when joinPlan has join paths', async () => {
    const plan = buildSimplePlan(1);
    // joinPlan with many join paths — bypass should still apply because isSingleStepSimple is true
    const joinPlan = buildJoinPlanWithPaths(5);
    const state = buildBaseState({ plan, joinPlan, stepResults: null });

    const node = createVerifierNode(mockLlm, mockSandboxService, mockEmit, mockTracer, null);

    const result = await node(state);

    expect(result.verificationReport).toBeDefined();
    expect(result.verificationReport!.passed).toBe(true);
    const checkNames = result.verificationReport!.checks.map((c) => c.name);
    expect(checkNames).toContain('simple_query_bypass');
    // Sandbox should NOT have been called for a bypassed query
    expect(mockSandboxService.executeCode).not.toHaveBeenCalled();
  });

  it('should auto-pass for a simple single-step query with 2 datasets', async () => {
    const plan = buildSimplePlan(2);
    const joinPlan = buildJoinPlanWithPaths(1);
    const state = buildBaseState({ plan, joinPlan, stepResults: null });

    const node = createVerifierNode(mockLlm, mockSandboxService, mockEmit, mockTracer, null);

    const result = await node(state);

    expect(result.verificationReport).toBeDefined();
    expect(result.verificationReport!.passed).toBe(true);
    expect(result.verificationReport!.checks[0].name).toBe('simple_query_bypass');
    expect(mockSandboxService.executeCode).not.toHaveBeenCalled();
  });

  it('should NOT bypass verification for a simple single-step query with 3 or more datasets', async () => {
    const plan = buildSimplePlan(3);
    // hasJoins = true (joinPlan has paths), isSingleStepSimple = false (3 datasets > 2)
    const joinPlan = buildJoinPlanWithPaths(2);

    // Provide a stepResult so the verifier has something to verify
    const stepResults = [
      {
        stepId: 1,
        description: 'Simple query',
        strategy: 'sql' as const,
        sqlResult: { rowCount: 5, columns: ['id'], data: 'id\n---\n1' },
      },
    ];

    const state = buildBaseState({ plan, joinPlan, stepResults });

    const node = createVerifierNode(mockLlm, mockSandboxService, mockEmit, mockTracer, null);

    const result = await node(state);

    // The bypass should NOT have kicked in — the LLM path (or at least the no-code path) runs
    const checkNames = result.verificationReport!.checks.map((c) => c.name);
    expect(checkNames).not.toContain('simple_query_bypass');
  });

  it('should NOT bypass verification for an analytical single-step query with 1 dataset', async () => {
    const plan = buildAnalyticalPlan(1);
    // No join paths — but complexity is analytical, so the simple bypass does not apply
    const joinPlan = buildJoinPlanWithPaths(0);

    const stepResults = [
      {
        stepId: 1,
        description: 'Analytical query',
        strategy: 'sql' as const,
        sqlResult: { rowCount: 10, columns: ['revenue'], data: 'revenue\n---\n100' },
      },
    ];

    const state = buildBaseState({ plan, joinPlan, stepResults });

    const node = createVerifierNode(mockLlm, mockSandboxService, mockEmit, mockTracer, null);

    const result = await node(state);

    const checkNames = result.verificationReport!.checks.map((c) => c.name);
    expect(checkNames).not.toContain('simple_query_bypass');
  });

  it('should diagnose "SQL Builder failed" and target navigator when querySpecs is empty and no results', async () => {
    const plan = buildAnalyticalPlan(2);
    const joinPlan = buildJoinPlanWithPaths(1);

    // No step results, no query specs — SQL Builder never ran or produced nothing
    const state = buildBaseState({ plan, joinPlan, stepResults: [], querySpecs: [] });

    const node = createVerifierNode(mockLlm, mockSandboxService, mockEmit, mockTracer, null);

    const result = await node(state);

    expect(result.verificationReport).toBeDefined();
    expect(result.verificationReport!.passed).toBe(false);
    expect(result.verificationReport!.diagnosis).toContain('SQL Builder failed');
    expect(result.revisionTarget).toBe('navigator');
  });

  it('should diagnose "SQL Builder failed" and target navigator when querySpecs is null and no results', async () => {
    const plan = buildAnalyticalPlan(2);
    const joinPlan = buildJoinPlanWithPaths(1);

    // querySpecs is null (SQL Builder never ran)
    const state = buildBaseState({ plan, joinPlan, stepResults: [], querySpecs: null });

    const node = createVerifierNode(mockLlm, mockSandboxService, mockEmit, mockTracer, null);

    const result = await node(state);

    expect(result.verificationReport!.passed).toBe(false);
    expect(result.verificationReport!.diagnosis).toContain('SQL Builder failed');
    expect(result.revisionTarget).toBe('navigator');
  });

  it('should target sql_builder (not navigator) when querySpecs exist but execution produced no results', async () => {
    const plan = buildAnalyticalPlan(1);
    const joinPlan = buildJoinPlanWithPaths(1);

    // There ARE query specs (SQL Builder ran) but execution failed to produce any results
    const querySpecs = [
      {
        stepId: 1,
        description: 'Analytical query',
        pilotSql: 'SELECT revenue FROM sales LIMIT 10',
        fullSql: 'SELECT revenue FROM sales',
        expectedColumns: ['revenue'],
        notes: '',
      },
    ];

    const state = buildBaseState({ plan, joinPlan, stepResults: [], querySpecs });

    const node = createVerifierNode(mockLlm, mockSandboxService, mockEmit, mockTracer, null);

    const result = await node(state);

    expect(result.verificationReport!.passed).toBe(false);
    expect(result.revisionTarget).toBe('sql_builder');
  });

  it('should increment revisionCount when verification fails due to missing results', async () => {
    const plan = buildAnalyticalPlan(2);
    const joinPlan = buildJoinPlanWithPaths(1);
    const state = buildBaseState({
      plan,
      joinPlan,
      stepResults: [],
      querySpecs: null,
      revisionCount: 1,
    });

    const node = createVerifierNode(mockLlm, mockSandboxService, mockEmit, mockTracer, null);

    const result = await node(state);

    expect(result.revisionCount).toBe(2);
  });

  it('should set revisionDiagnosis when verification fails due to missing results', async () => {
    const plan = buildAnalyticalPlan(2);
    const joinPlan = buildJoinPlanWithPaths(1);
    const state = buildBaseState({ plan, joinPlan, stepResults: [], querySpecs: null });

    const node = createVerifierNode(mockLlm, mockSandboxService, mockEmit, mockTracer, null);

    const result = await node(state);

    expect(result.revisionDiagnosis).toBeDefined();
    expect(typeof result.revisionDiagnosis).toBe('string');
    expect(result.revisionDiagnosis!.length).toBeGreaterThan(0);
  });
});
