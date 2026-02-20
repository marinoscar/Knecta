import { describe, it, expect } from 'vitest';
import type { LlmTraceRecord } from '../../../types';
import {
  extractPlanFromTraces,
  extractStepStatusesFromTraces,
  extractPhaseDetailsFromTraces,
  extractSqlQueriesFromTraces,
  aggregateTokensFromTraces,
  computeTimingFromTraces,
  deriveInsightsFromTraces,
} from '../../../components/data-agent/traceInsightsParser';

// ─── Test Helper ───

/**
 * Factory function to create LlmTraceRecord with sane defaults
 */
function makeTrace(overrides: Partial<LlmTraceRecord> = {}): LlmTraceRecord {
  return {
    id: `trace-${Math.random().toString(36).substr(2, 9)}`,
    messageId: 'msg-test-123',
    phase: 'executor',
    callIndex: 0,
    stepId: null,
    purpose: 'test trace',
    provider: 'openai',
    model: 'gpt-4',
    temperature: 0.7,
    structuredOutput: false,
    promptMessages: [{ role: 'user', content: 'test prompt' }],
    responseContent: 'test response',
    toolCalls: null,
    promptTokens: 100,
    completionTokens: 50,
    totalTokens: 150,
    startedAt: '2026-02-19T10:00:00.000Z',
    completedAt: '2026-02-19T10:00:05.000Z',
    durationMs: 5000,
    error: null,
    ...overrides,
  };
}

// ─── Realistic Artifact Data ───

const REALISTIC_PLAN_ARTIFACT = {
  complexity: 'analytical',
  intent: 'Find total sales by region',
  shouldClarify: false,
  clarificationQuestions: null,
  steps: [
    {
      id: 1,
      description: 'Query sales by region from orders table',
      strategy: 'sql',
    },
    {
      id: 2,
      description: 'Aggregate sales by region',
      strategy: 'python',
    },
  ],
};

const REALISTIC_QUERY_SPEC = {
  queries: [
    {
      stepId: 1,
      description: 'Get sales by region',
      fullSql: 'SELECT region, SUM(amount) as total FROM orders GROUP BY region',
      pilotSql: null,
    },
    {
      stepId: 2,
      description: 'Get customer counts',
      fullSql: 'SELECT region, COUNT(DISTINCT customer_id) FROM orders GROUP BY region',
      pilotSql: 'SELECT region, COUNT(DISTINCT customer_id) FROM orders WHERE region = $1 GROUP BY region',
    },
  ],
};

// ─── Tests: extractPlanFromTraces ───

describe('extractPlanFromTraces', () => {
  it('should return plan from planner trace with structuredOutput=true', () => {
    const traces = [
      makeTrace({
        phase: 'planner',
        structuredOutput: true,
        responseContent: JSON.stringify(REALISTIC_PLAN_ARTIFACT),
      }),
    ];

    const result = extractPlanFromTraces(traces);

    expect(result).toEqual({
      complexity: 'analytical',
      intent: 'Find total sales by region',
      steps: [
        {
          id: 1,
          description: 'Query sales by region from orders table',
          strategy: 'sql',
        },
        {
          id: 2,
          description: 'Aggregate sales by region',
          strategy: 'python',
        },
      ],
    });
  });

  it('should return null when no planner trace exists', () => {
    const traces = [
      makeTrace({ phase: 'executor' }),
      makeTrace({ phase: 'explainer' }),
    ];

    const result = extractPlanFromTraces(traces);

    expect(result).toBeNull();
  });

  it('should return null when responseContent is invalid JSON', () => {
    const traces = [
      makeTrace({
        phase: 'planner',
        structuredOutput: true,
        responseContent: 'not valid json {',
      }),
    ];

    const result = extractPlanFromTraces(traces);

    expect(result).toBeNull();
  });

  it('should return null when parsed JSON has no steps array', () => {
    const traces = [
      makeTrace({
        phase: 'planner',
        structuredOutput: true,
        responseContent: JSON.stringify({ complexity: 'simple', intent: 'test' }),
      }),
    ];

    const result = extractPlanFromTraces(traces);

    expect(result).toBeNull();
  });

  it('should ignore planner traces with errors', () => {
    const traces = [
      makeTrace({
        phase: 'planner',
        structuredOutput: true,
        responseContent: JSON.stringify(REALISTIC_PLAN_ARTIFACT),
        error: 'LLM timeout',
      }),
      makeTrace({
        phase: 'planner',
        structuredOutput: true,
        responseContent: JSON.stringify({ complexity: 'simple', intent: 'backup', steps: [] }),
      }),
    ];

    const result = extractPlanFromTraces(traces);

    expect(result).toEqual({
      complexity: 'simple',
      intent: 'backup',
      steps: [],
    });
  });

  it('should ignore planner traces with structuredOutput=false', () => {
    const traces = [
      makeTrace({
        phase: 'planner',
        structuredOutput: false,
        responseContent: JSON.stringify(REALISTIC_PLAN_ARTIFACT),
      }),
    ];

    const result = extractPlanFromTraces(traces);

    expect(result).toBeNull();
  });
});

// ─── Tests: extractStepStatusesFromTraces ───

describe('extractStepStatusesFromTraces', () => {
  const plan = {
    complexity: 'simple',
    intent: 'test',
    steps: [
      { id: 1, description: 'Step 1', strategy: 'sql' },
      { id: 2, description: 'Step 2', strategy: 'python' },
    ],
  };

  it('should return statuses matching plan steps with executor traces', () => {
    const traces = [
      makeTrace({ phase: 'executor', stepId: 1 }),
      makeTrace({ phase: 'executor', stepId: 2 }),
    ];

    const result = extractStepStatusesFromTraces(plan, traces);

    expect(result).toEqual([
      {
        stepId: 1,
        description: 'Step 1',
        strategy: 'sql',
        status: 'complete',
        resultSummary: undefined,
      },
      {
        stepId: 2,
        description: 'Step 2',
        strategy: 'python',
        status: 'complete',
        resultSummary: undefined,
      },
    ]);
  });

  it('should extract row count from query_database tool calls', () => {
    const traces = [
      makeTrace({
        phase: 'executor',
        stepId: 1,
        toolCalls: [
          {
            name: 'query_database',
            args: {
              result: {
                rowCount: 42,
                rows: [],
              },
            },
          },
        ],
      }),
    ];

    const result = extractStepStatusesFromTraces(plan, traces);

    expect(result[0].resultSummary).toBe('42 rows');
  });

  it('should mark steps as failed when executor trace has error', () => {
    const traces = [
      makeTrace({
        phase: 'executor',
        stepId: 1,
        error: 'SQL syntax error',
      }),
      makeTrace({ phase: 'executor', stepId: 2 }),
    ];

    const result = extractStepStatusesFromTraces(plan, traces);

    expect(result[0]).toEqual({
      stepId: 1,
      description: 'Step 1',
      strategy: 'sql',
      status: 'failed',
      resultSummary: 'SQL syntax error',
    });
    expect(result[1].status).toBe('complete');
  });

  it('should return pending status when no executor phase ran', () => {
    const traces = [
      makeTrace({ phase: 'planner' }),
      makeTrace({ phase: 'navigator' }),
    ];

    const result = extractStepStatusesFromTraces(plan, traces);

    expect(result).toEqual([
      {
        stepId: 1,
        description: 'Step 1',
        strategy: 'sql',
        status: 'pending',
        resultSummary: undefined,
      },
      {
        stepId: 2,
        description: 'Step 2',
        strategy: 'python',
        status: 'pending',
        resultSummary: undefined,
      },
    ]);
  });

  it('should return empty array when plan is null', () => {
    const traces = [makeTrace({ phase: 'executor', stepId: 1 })];

    const result = extractStepStatusesFromTraces(null, traces);

    expect(result).toEqual([]);
  });

  it('should handle multiple executor traces per step', () => {
    const traces = [
      makeTrace({
        phase: 'executor',
        stepId: 1,
        toolCalls: [
          {
            name: 'query_database',
            args: { result: { rowCount: 10 } },
          },
        ],
      }),
      makeTrace({
        phase: 'executor',
        stepId: 1,
        toolCalls: [
          {
            name: 'query_database',
            args: { result: { rowCount: 20 } },
          },
        ],
      }),
    ];

    const result = extractStepStatusesFromTraces(plan, traces);

    // Should use the last row count found (loop overwrites)
    expect(result[0].resultSummary).toBe('20 rows');
  });

  it('should ignore non-query_database tool calls', () => {
    const traces = [
      makeTrace({
        phase: 'executor',
        stepId: 1,
        toolCalls: [
          {
            name: 'run_python',
            args: { result: { output: 'test' } },
          },
          {
            name: 'query_database',
            args: { result: { rowCount: 5 } },
          },
        ],
      }),
    ];

    const result = extractStepStatusesFromTraces(plan, traces);

    expect(result[0].resultSummary).toBe('5 rows');
  });
});

// ─── Tests: extractPhaseDetailsFromTraces ───

describe('extractPhaseDetailsFromTraces', () => {
  it('should group traces by phase correctly', () => {
    const traces = [
      makeTrace({ phase: 'planner', callIndex: 0 }),
      makeTrace({ phase: 'navigator', callIndex: 1 }),
      makeTrace({ phase: 'navigator', callIndex: 2 }),
      makeTrace({ phase: 'executor', callIndex: 3 }),
    ];

    const result = extractPhaseDetailsFromTraces(traces);

    expect(result).toHaveLength(6); // All 6 phases
    expect(result.find((p) => p.phase === 'planner')?.traceCount).toBe(1);
    expect(result.find((p) => p.phase === 'navigator')?.traceCount).toBe(2);
    expect(result.find((p) => p.phase === 'executor')?.traceCount).toBe(1);
    expect(result.find((p) => p.phase === 'sql_builder')?.traceCount).toBe(0);
  });

  it('should compute per-phase duration and token totals', () => {
    const traces = [
      makeTrace({
        phase: 'planner',
        startedAt: '2026-02-19T10:00:00.000Z',
        completedAt: '2026-02-19T10:00:03.000Z',
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      }),
      makeTrace({
        phase: 'planner',
        startedAt: '2026-02-19T10:00:01.000Z',
        completedAt: '2026-02-19T10:00:05.000Z',
        promptTokens: 200,
        completionTokens: 100,
        totalTokens: 300,
      }),
    ];

    const result = extractPhaseDetailsFromTraces(traces);
    const plannerPhase = result.find((p) => p.phase === 'planner')!;

    // Duration: from earliest start (10:00:00) to latest end (10:00:05) = 5000ms
    expect(plannerPhase.durationMs).toBe(5000);
    expect(plannerPhase.tokens).toEqual({
      prompt: 300,
      completion: 150,
      total: 450,
    });
  });

  it('should collect tool calls from traces', () => {
    const traces = [
      makeTrace({
        phase: 'navigator',
        toolCalls: [
          {
            name: 'get_dataset_details',
            args: { result: { name: 'orders', columns: [] } },
          },
          {
            name: 'get_relationships',
            args: { result: [] },
          },
        ],
      }),
      makeTrace({
        phase: 'navigator',
        toolCalls: [
          {
            name: 'list_datasets',
            args: { result: ['orders', 'customers'] },
          },
        ],
      }),
    ];

    const result = extractPhaseDetailsFromTraces(traces);
    const navigatorPhase = result.find((p) => p.phase === 'navigator')!;

    expect(navigatorPhase.toolCalls).toHaveLength(3);
    expect(navigatorPhase.toolCalls[0].name).toBe('get_dataset_details');
    expect(navigatorPhase.toolCalls[0].isComplete).toBe(true);
    expect(navigatorPhase.toolCalls[0].result).toBeTruthy();
  });

  it('should mark missing phases with status pending and zero values', () => {
    const traces = [makeTrace({ phase: 'planner' })];

    const result = extractPhaseDetailsFromTraces(traces);

    const navigatorPhase = result.find((p) => p.phase === 'navigator')!;
    expect(navigatorPhase.status).toBe('pending');
    expect(navigatorPhase.durationMs).toBe(0);
    expect(navigatorPhase.tokens).toEqual({ prompt: 0, completion: 0, total: 0 });
    expect(navigatorPhase.toolCalls).toEqual([]);
    expect(navigatorPhase.traceCount).toBe(0);
  });

  it('should always return all 6 phases in order', () => {
    const traces = [makeTrace({ phase: 'executor' })];

    const result = extractPhaseDetailsFromTraces(traces);

    expect(result.map((p) => p.phase)).toEqual([
      'planner',
      'navigator',
      'sql_builder',
      'executor',
      'verifier',
      'explainer',
    ]);
  });

  it('should handle traces with null toolCalls', () => {
    const traces = [
      makeTrace({ phase: 'planner', toolCalls: null }),
      makeTrace({ phase: 'executor', toolCalls: null }),
    ];

    const result = extractPhaseDetailsFromTraces(traces);

    expect(result.find((p) => p.phase === 'planner')?.toolCalls).toEqual([]);
    expect(result.find((p) => p.phase === 'executor')?.toolCalls).toEqual([]);
  });

  it('should handle tool calls with missing result in args', () => {
    const traces = [
      makeTrace({
        phase: 'executor',
        toolCalls: [
          {
            name: 'query_database',
            args: {},
          },
        ],
      }),
    ];

    const result = extractPhaseDetailsFromTraces(traces);
    const executorPhase = result.find((p) => p.phase === 'executor')!;

    expect(executorPhase.toolCalls[0].result).toBeUndefined();
  });
});

// ─── Tests: extractSqlQueriesFromTraces ───

describe('extractSqlQueriesFromTraces', () => {
  it('should parse SQL queries from sql_builder trace', () => {
    const traces = [
      makeTrace({
        phase: 'sql_builder',
        structuredOutput: true,
        responseContent: JSON.stringify(REALISTIC_QUERY_SPEC),
      }),
    ];

    const result = extractSqlQueriesFromTraces(traces);

    expect(result).toEqual([
      {
        stepId: 1,
        sql: 'SELECT region, SUM(amount) as total FROM orders GROUP BY region',
        description: 'Get sales by region',
      },
      {
        stepId: 2,
        sql: 'SELECT region, COUNT(DISTINCT customer_id) FROM orders GROUP BY region',
        description: 'Get customer counts',
      },
    ]);
  });

  it('should prefer fullSql over pilotSql', () => {
    const traces = [
      makeTrace({
        phase: 'sql_builder',
        structuredOutput: true,
        responseContent: JSON.stringify({
          queries: [
            {
              stepId: 1,
              description: 'Test query',
              fullSql: 'SELECT * FROM full',
              pilotSql: 'SELECT * FROM pilot',
            },
          ],
        }),
      }),
    ];

    const result = extractSqlQueriesFromTraces(traces);

    expect(result[0].sql).toBe('SELECT * FROM full');
  });

  it('should use pilotSql when fullSql is missing', () => {
    const traces = [
      makeTrace({
        phase: 'sql_builder',
        structuredOutput: true,
        responseContent: JSON.stringify({
          queries: [
            {
              stepId: 1,
              description: 'Test query',
              pilotSql: 'SELECT * FROM pilot',
            },
          ],
        }),
      }),
    ];

    const result = extractSqlQueriesFromTraces(traces);

    expect(result[0].sql).toBe('SELECT * FROM pilot');
  });

  it('should return empty array when no sql_builder trace', () => {
    const traces = [
      makeTrace({ phase: 'planner' }),
      makeTrace({ phase: 'executor' }),
    ];

    const result = extractSqlQueriesFromTraces(traces);

    expect(result).toEqual([]);
  });

  it('should handle malformed responseContent', () => {
    const traces = [
      makeTrace({
        phase: 'sql_builder',
        structuredOutput: true,
        responseContent: 'not json {',
      }),
    ];

    const result = extractSqlQueriesFromTraces(traces);

    expect(result).toEqual([]);
  });

  it('should handle queries array nested in parsed object', () => {
    const traces = [
      makeTrace({
        phase: 'sql_builder',
        structuredOutput: true,
        responseContent: JSON.stringify({
          queries: [
            { stepId: 1, fullSql: 'SELECT 1', description: 'test' },
          ],
        }),
      }),
    ];

    const result = extractSqlQueriesFromTraces(traces);

    expect(result).toHaveLength(1);
  });

  it('should handle queries as top-level array', () => {
    const traces = [
      makeTrace({
        phase: 'sql_builder',
        structuredOutput: true,
        responseContent: JSON.stringify([
          { stepId: 1, fullSql: 'SELECT 1', description: 'test' },
        ]),
      }),
    ];

    const result = extractSqlQueriesFromTraces(traces);

    expect(result).toHaveLength(1);
  });

  it('should return empty array when queries is not an array', () => {
    const traces = [
      makeTrace({
        phase: 'sql_builder',
        structuredOutput: true,
        responseContent: JSON.stringify({ queries: 'not an array' }),
      }),
    ];

    const result = extractSqlQueriesFromTraces(traces);

    expect(result).toEqual([]);
  });

  it('should ignore sql_builder traces with errors', () => {
    const traces = [
      makeTrace({
        phase: 'sql_builder',
        structuredOutput: true,
        responseContent: JSON.stringify(REALISTIC_QUERY_SPEC),
        error: 'LLM error',
      }),
    ];

    const result = extractSqlQueriesFromTraces(traces);

    expect(result).toEqual([]);
  });

  it('should ignore sql_builder traces with structuredOutput=false', () => {
    const traces = [
      makeTrace({
        phase: 'sql_builder',
        structuredOutput: false,
        responseContent: JSON.stringify(REALISTIC_QUERY_SPEC),
      }),
    ];

    const result = extractSqlQueriesFromTraces(traces);

    expect(result).toEqual([]);
  });
});

// ─── Tests: aggregateTokensFromTraces ───

describe('aggregateTokensFromTraces', () => {
  it('should sum tokens correctly across all traces', () => {
    const traces = [
      makeTrace({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      }),
      makeTrace({
        promptTokens: 200,
        completionTokens: 100,
        totalTokens: 300,
      }),
      makeTrace({
        promptTokens: 150,
        completionTokens: 75,
        totalTokens: 225,
      }),
    ];

    const result = aggregateTokensFromTraces(traces);

    expect(result).toEqual({
      prompt: 450,
      completion: 225,
      total: 675,
    });
  });

  it('should return zeros when empty', () => {
    const result = aggregateTokensFromTraces([]);

    expect(result).toEqual({
      prompt: 0,
      completion: 0,
      total: 0,
    });
  });

  it('should handle traces with zero tokens', () => {
    const traces = [
      makeTrace({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      }),
      makeTrace({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      }),
    ];

    const result = aggregateTokensFromTraces(traces);

    expect(result).toEqual({
      prompt: 100,
      completion: 50,
      total: 150,
    });
  });
});

// ─── Tests: computeTimingFromTraces ───

describe('computeTimingFromTraces', () => {
  it('should compute correct duration from timestamps', () => {
    const traces = [
      makeTrace({
        startedAt: '2026-02-19T10:00:00.000Z',
        completedAt: '2026-02-19T10:00:03.000Z',
      }),
      makeTrace({
        startedAt: '2026-02-19T10:00:01.000Z',
        completedAt: '2026-02-19T10:00:05.000Z',
      }),
    ];

    const result = computeTimingFromTraces(traces);

    expect(result).toEqual({
      durationMs: 5000,
      startedAt: '2026-02-19T10:00:00.000Z',
      completedAt: '2026-02-19T10:00:05.000Z',
    });
  });

  it('should return null when empty', () => {
    const result = computeTimingFromTraces([]);

    expect(result).toBeNull();
  });

  it('should handle single trace', () => {
    const traces = [
      makeTrace({
        startedAt: '2026-02-19T10:00:00.000Z',
        completedAt: '2026-02-19T10:00:02.500Z',
      }),
    ];

    const result = computeTimingFromTraces(traces);

    expect(result).toEqual({
      durationMs: 2500,
      startedAt: '2026-02-19T10:00:00.000Z',
      completedAt: '2026-02-19T10:00:02.500Z',
    });
  });

  it('should find earliest start and latest completion across many traces', () => {
    const traces = [
      makeTrace({
        startedAt: '2026-02-19T10:00:05.000Z',
        completedAt: '2026-02-19T10:00:08.000Z',
      }),
      makeTrace({
        startedAt: '2026-02-19T10:00:01.000Z',
        completedAt: '2026-02-19T10:00:04.000Z',
      }),
      makeTrace({
        startedAt: '2026-02-19T10:00:03.000Z',
        completedAt: '2026-02-19T10:00:10.000Z',
      }),
    ];

    const result = computeTimingFromTraces(traces);

    expect(result).toEqual({
      durationMs: 9000,
      startedAt: '2026-02-19T10:00:01.000Z',
      completedAt: '2026-02-19T10:00:10.000Z',
    });
  });
});

// ─── Tests: deriveInsightsFromTraces ───

describe('deriveInsightsFromTraces', () => {
  it('should return sensible defaults for empty traces', () => {
    const result = deriveInsightsFromTraces([]);

    expect(result).toEqual({
      plan: null,
      stepStatuses: [],
      phaseDetails: [
        {
          phase: 'planner',
          label: 'Planner',
          status: 'pending',
          toolCalls: [],
          durationMs: 0,
          tokens: { prompt: 0, completion: 0, total: 0 },
          traceCount: 0,
        },
        {
          phase: 'navigator',
          label: 'Navigator',
          status: 'pending',
          toolCalls: [],
          durationMs: 0,
          tokens: { prompt: 0, completion: 0, total: 0 },
          traceCount: 0,
        },
        {
          phase: 'sql_builder',
          label: 'SQL Builder',
          status: 'pending',
          toolCalls: [],
          durationMs: 0,
          tokens: { prompt: 0, completion: 0, total: 0 },
          traceCount: 0,
        },
        {
          phase: 'executor',
          label: 'Executor',
          status: 'pending',
          toolCalls: [],
          durationMs: 0,
          tokens: { prompt: 0, completion: 0, total: 0 },
          traceCount: 0,
        },
        {
          phase: 'verifier',
          label: 'Verifier',
          status: 'pending',
          toolCalls: [],
          durationMs: 0,
          tokens: { prompt: 0, completion: 0, total: 0 },
          traceCount: 0,
        },
        {
          phase: 'explainer',
          label: 'Explainer',
          status: 'pending',
          toolCalls: [],
          durationMs: 0,
          tokens: { prompt: 0, completion: 0, total: 0 },
          traceCount: 0,
        },
      ],
      tokens: { prompt: 0, completion: 0, total: 0 },
      durationMs: null,
      startedAt: null,
      completedAt: null,
      providerModel: null,
      sqlQueries: [],
    });
  });

  it('should derive full insights from realistic trace data', () => {
    const traces = [
      makeTrace({
        phase: 'planner',
        callIndex: 0,
        structuredOutput: true,
        responseContent: JSON.stringify(REALISTIC_PLAN_ARTIFACT),
        startedAt: '2026-02-19T10:00:00.000Z',
        completedAt: '2026-02-19T10:00:02.000Z',
        promptTokens: 150,
        completionTokens: 100,
        totalTokens: 250,
        provider: 'openai',
        model: 'gpt-4-turbo',
      }),
      makeTrace({
        phase: 'navigator',
        callIndex: 1,
        toolCalls: [
          {
            name: 'get_dataset_details',
            args: { result: { name: 'orders' } },
          },
        ],
        startedAt: '2026-02-19T10:00:02.000Z',
        completedAt: '2026-02-19T10:00:05.000Z',
        promptTokens: 200,
        completionTokens: 50,
        totalTokens: 250,
      }),
      makeTrace({
        phase: 'sql_builder',
        callIndex: 2,
        structuredOutput: true,
        responseContent: JSON.stringify(REALISTIC_QUERY_SPEC),
        startedAt: '2026-02-19T10:00:05.000Z',
        completedAt: '2026-02-19T10:00:07.000Z',
        promptTokens: 300,
        completionTokens: 200,
        totalTokens: 500,
      }),
      makeTrace({
        phase: 'executor',
        callIndex: 3,
        stepId: 1,
        toolCalls: [
          {
            name: 'query_database',
            args: { result: { rowCount: 42 } },
          },
        ],
        startedAt: '2026-02-19T10:00:07.000Z',
        completedAt: '2026-02-19T10:00:08.000Z',
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      }),
      makeTrace({
        phase: 'executor',
        callIndex: 4,
        stepId: 2,
        toolCalls: [
          {
            name: 'run_python',
            args: { result: { output: 'Done' } },
          },
        ],
        startedAt: '2026-02-19T10:00:08.000Z',
        completedAt: '2026-02-19T10:00:10.000Z',
        promptTokens: 50,
        completionTokens: 25,
        totalTokens: 75,
      }),
    ];

    const result = deriveInsightsFromTraces(traces);

    // Plan
    expect(result.plan).toEqual({
      complexity: 'analytical',
      intent: 'Find total sales by region',
      steps: [
        {
          id: 1,
          description: 'Query sales by region from orders table',
          strategy: 'sql',
        },
        {
          id: 2,
          description: 'Aggregate sales by region',
          strategy: 'python',
        },
      ],
    });

    // Step statuses
    expect(result.stepStatuses).toEqual([
      {
        stepId: 1,
        description: 'Query sales by region from orders table',
        strategy: 'sql',
        status: 'complete',
        resultSummary: '42 rows',
      },
      {
        stepId: 2,
        description: 'Aggregate sales by region',
        strategy: 'python',
        status: 'complete',
        resultSummary: undefined,
      },
    ]);

    // Tokens
    expect(result.tokens).toEqual({
      prompt: 800,
      completion: 425,
      total: 1225,
    });

    // Timing
    expect(result.durationMs).toBe(10000);
    expect(result.startedAt).toBe('2026-02-19T10:00:00.000Z');
    expect(result.completedAt).toBe('2026-02-19T10:00:10.000Z');

    // Provider/model
    expect(result.providerModel).toEqual({
      provider: 'openai',
      model: 'gpt-4-turbo',
    });

    // SQL queries
    expect(result.sqlQueries).toEqual([
      {
        stepId: 1,
        sql: 'SELECT region, SUM(amount) as total FROM orders GROUP BY region',
        description: 'Get sales by region',
      },
      {
        stepId: 2,
        sql: 'SELECT region, COUNT(DISTINCT customer_id) FROM orders GROUP BY region',
        description: 'Get customer counts',
      },
    ]);

    // Phase details
    expect(result.phaseDetails).toHaveLength(6);
    const plannerPhase = result.phaseDetails.find((p) => p.phase === 'planner')!;
    expect(plannerPhase.status).toBe('complete');
    expect(plannerPhase.tokens.total).toBe(250);
    expect(plannerPhase.traceCount).toBe(1);

    const navigatorPhase = result.phaseDetails.find((p) => p.phase === 'navigator')!;
    expect(navigatorPhase.toolCalls).toHaveLength(1);
    expect(navigatorPhase.toolCalls[0].name).toBe('get_dataset_details');

    const verifierPhase = result.phaseDetails.find((p) => p.phase === 'verifier')!;
    expect(verifierPhase.status).toBe('pending');
  });

  it('should handle partial execution (early stop)', () => {
    const traces = [
      makeTrace({
        phase: 'planner',
        structuredOutput: true,
        responseContent: JSON.stringify({
          complexity: 'simple',
          intent: 'test',
          steps: [{ id: 1, description: 'step 1', strategy: 'sql' }],
        }),
      }),
    ];

    const result = deriveInsightsFromTraces(traces);

    expect(result.plan).toBeTruthy();
    expect(result.stepStatuses[0].status).toBe('pending');
    expect(result.phaseDetails.find((p) => p.phase === 'planner')?.status).toBe('complete');
    expect(result.phaseDetails.find((p) => p.phase === 'executor')?.status).toBe('pending');
  });

  it('should handle execution with errors', () => {
    const traces = [
      makeTrace({
        phase: 'planner',
        structuredOutput: true,
        responseContent: JSON.stringify({
          complexity: 'simple',
          intent: 'test',
          steps: [{ id: 1, description: 'step 1', strategy: 'sql' }],
        }),
      }),
      makeTrace({
        phase: 'executor',
        stepId: 1,
        error: 'Query failed',
      }),
    ];

    const result = deriveInsightsFromTraces(traces);

    expect(result.stepStatuses[0].status).toBe('failed');
    expect(result.stepStatuses[0].resultSummary).toBe('Query failed');
  });
});
