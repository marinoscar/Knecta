import { describe, it, expect } from 'vitest';
import {
  extractPlan,
  extractStepStatuses,
  extractPhaseDetails,
  extractLiveTokens,
  formatDuration,
  formatTokenCount,
  extractJoinPlan,
  joinPlanToGraph,
  extractLiveLlmTraces,
  extractDiscovery,
  formatDurationMs,
} from '../../../components/data-agent/insightsUtils';
import type { DataAgentStreamEvent } from '../../../types';

describe('insightsUtils', () => {
  describe('formatDuration', () => {
    it('formats 0ms as "0:00"', () => {
      expect(formatDuration(0)).toBe('0:00');
    });

    it('formats 5000ms as "0:05"', () => {
      expect(formatDuration(5000)).toBe('0:05');
    });

    it('formats 92000ms as "1:32"', () => {
      expect(formatDuration(92000)).toBe('1:32');
    });

    it('formats 3600000ms as "60:00"', () => {
      expect(formatDuration(3600000)).toBe('60:00');
    });

    it('pads seconds with leading zero', () => {
      expect(formatDuration(9000)).toBe('0:09');
      expect(formatDuration(69000)).toBe('1:09');
    });
  });

  describe('formatTokenCount', () => {
    it('formats 0 as "0"', () => {
      expect(formatTokenCount(0)).toBe('0');
    });

    it('formats 1000 as "1,000"', () => {
      expect(formatTokenCount(1000)).toBe('1,000');
    });

    it('formats 123456 as "123,456"', () => {
      expect(formatTokenCount(123456)).toBe('123,456');
    });

    it('formats numbers without thousands separator when < 1000', () => {
      expect(formatTokenCount(999)).toBe('999');
    });
  });

  describe('extractPlan - live mode', () => {
    it('returns null when no planner artifact event', () => {
      const events: DataAgentStreamEvent[] = [
        { type: 'phase_start', phase: 'planner' },
      ];

      const result = extractPlan(events, null, true);

      expect(result).toBeNull();
    });

    it('returns plan from phase_artifact event with phase="planner"', () => {
      const planArtifact = {
        complexity: 'simple',
        intent: 'Get user count',
        steps: [
          { id: 1, description: 'Query users table', strategy: 'sql' },
        ],
      };

      const events: DataAgentStreamEvent[] = [
        { type: 'phase_start', phase: 'planner' },
        { type: 'phase_artifact', phase: 'planner', artifact: planArtifact },
      ];

      const result = extractPlan(events, null, true);

      expect(result).toEqual(planArtifact);
    });

    it('ignores phase_artifact events from other phases', () => {
      const events: DataAgentStreamEvent[] = [
        { type: 'phase_artifact', phase: 'navigator', artifact: { some: 'data' } },
      ];

      const result = extractPlan(events, null, true);

      expect(result).toBeNull();
    });
  });

  describe('extractPlan - history mode', () => {
    it('returns null when metadata is null', () => {
      const result = extractPlan([], null, false);

      expect(result).toBeNull();
    });

    it('returns null when metadata.plan is undefined', () => {
      const metadata = { durationMs: 5000 };

      const result = extractPlan([], metadata, false);

      expect(result).toBeNull();
    });

    it('returns metadata.plan when present', () => {
      const plan = {
        complexity: 'analytical',
        intent: 'Analyze sales trends',
        steps: [
          { id: 1, description: 'Get sales data', strategy: 'sql' },
          { id: 2, description: 'Calculate trends', strategy: 'python' },
        ],
      };

      const metadata = { plan };

      const result = extractPlan([], metadata, false);

      expect(result).toEqual(plan);
    });
  });

  describe('extractStepStatuses - live mode', () => {
    it('returns empty array when plan is null', () => {
      const events: DataAgentStreamEvent[] = [];

      const result = extractStepStatuses(null, events, null, true);

      expect(result).toEqual([]);
    });

    it('marks steps as pending when no events', () => {
      const plan = {
        complexity: 'simple',
        intent: 'Test',
        steps: [
          { id: 1, description: 'Step 1', strategy: 'sql' },
          { id: 2, description: 'Step 2', strategy: 'python' },
        ],
      };

      const events: DataAgentStreamEvent[] = [];

      const result = extractStepStatuses(plan, events, null, true);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        stepId: 1,
        description: 'Step 1',
        strategy: 'sql',
        status: 'pending',
      });
      expect(result[1]).toEqual({
        stepId: 2,
        description: 'Step 2',
        strategy: 'python',
        status: 'pending',
      });
    });

    it('marks step as running when step_start received', () => {
      const plan = {
        complexity: 'simple',
        intent: 'Test',
        steps: [
          { id: 1, description: 'Step 1', strategy: 'sql' },
        ],
      };

      const events: DataAgentStreamEvent[] = [
        { type: 'step_start', stepId: 1, description: 'Step 1' },
      ];

      const result = extractStepStatuses(plan, events, null, true);

      expect(result[0].status).toBe('running');
    });

    it('marks step as complete when step_complete received', () => {
      const plan = {
        complexity: 'simple',
        intent: 'Test',
        steps: [
          { id: 1, description: 'Step 1', strategy: 'sql' },
        ],
      };

      const events: DataAgentStreamEvent[] = [
        { type: 'step_start', stepId: 1 },
        { type: 'step_complete', stepId: 1 },
      ];

      const result = extractStepStatuses(plan, events, null, true);

      expect(result[0].status).toBe('complete');
    });

    it('extracts result summary from step_complete artifact', () => {
      const plan = {
        complexity: 'simple',
        intent: 'Test',
        steps: [
          { id: 1, description: 'Query data', strategy: 'sql' },
        ],
      };

      const events: DataAgentStreamEvent[] = [
        { type: 'step_start', stepId: 1 },
        {
          type: 'step_complete',
          stepId: 1,
          artifact: {
            sqlResult: { rowCount: 42, columns: ['id'], data: '...' },
          },
        },
      ];

      const result = extractStepStatuses(plan, events, null, true);

      expect(result[0].resultSummary).toBe('42 rows');
    });
  });

  describe('extractStepStatuses - history mode', () => {
    it('returns steps as complete when stepResults exist', () => {
      const plan = {
        complexity: 'analytical',
        intent: 'Test',
        steps: [
          { id: 1, description: 'Get data', strategy: 'sql' },
          { id: 2, description: 'Analyze', strategy: 'python' },
        ],
      };

      const metadata = {
        stepResults: [
          {
            stepId: 1,
            description: 'Get data',
            strategy: 'sql',
            sqlResult: { rowCount: 100, columns: ['id'], data: '...' },
          },
          {
            stepId: 2,
            description: 'Analyze',
            strategy: 'python',
            pythonResult: { stdout: 'done', charts: [] },
          },
        ],
      };

      const result = extractStepStatuses(plan, [], metadata, false);

      expect(result).toHaveLength(2);
      expect(result[0].status).toBe('complete');
      expect(result[0].resultSummary).toBe('100 rows');
      expect(result[1].status).toBe('complete');
      expect(result[1].resultSummary).toBe('Python complete');
    });

    it('marks step as failed when stepResult has error', () => {
      const plan = {
        complexity: 'simple',
        intent: 'Test',
        steps: [
          { id: 1, description: 'Query data', strategy: 'sql' },
        ],
      };

      const metadata = {
        stepResults: [
          {
            stepId: 1,
            description: 'Query data',
            strategy: 'sql',
            error: 'SQL syntax error',
          },
        ],
      };

      const result = extractStepStatuses(plan, [], metadata, false);

      expect(result[0].status).toBe('failed');
      expect(result[0].resultSummary).toBe('SQL syntax error');
    });

    it('shows rowCount as resultSummary for SQL results', () => {
      const plan = {
        complexity: 'simple',
        intent: 'Test',
        steps: [
          { id: 1, description: 'Query data', strategy: 'sql' },
        ],
      };

      const metadata = {
        stepResults: [
          {
            stepId: 1,
            sqlResult: { rowCount: 250, columns: ['col1'], data: '...' },
          },
        ],
      };

      const result = extractStepStatuses(plan, [], metadata, false);

      expect(result[0].resultSummary).toBe('250 rows');
    });
  });

  describe('extractPhaseDetails - live mode', () => {
    it('returns all 6 phases as pending when no events', () => {
      const events: DataAgentStreamEvent[] = [];

      const result = extractPhaseDetails(events, null, true);

      expect(result).toHaveLength(6);
      expect(result.map((p) => p.phase)).toEqual([
        'planner',
        'navigator',
        'sql_builder',
        'executor',
        'verifier',
        'explainer',
      ]);
      expect(result.every((p) => p.status === 'pending')).toBe(true);
      expect(result.every((p) => p.toolCalls.length === 0)).toBe(true);
    });

    it('marks phase as active on phase_start', () => {
      const events: DataAgentStreamEvent[] = [
        { type: 'phase_start', phase: 'navigator' },
      ];

      const result = extractPhaseDetails(events, null, true);

      const navPhase = result.find((p) => p.phase === 'navigator');
      expect(navPhase?.status).toBe('active');
    });

    it('marks phase as complete on phase_complete', () => {
      const events: DataAgentStreamEvent[] = [
        { type: 'phase_start', phase: 'planner' },
        { type: 'phase_complete', phase: 'planner' },
      ];

      const result = extractPhaseDetails(events, null, true);

      const plannerPhase = result.find((p) => p.phase === 'planner');
      expect(plannerPhase?.status).toBe('complete');
    });

    it('adds tool calls from tool_start/tool_end events', () => {
      const events: DataAgentStreamEvent[] = [
        { type: 'phase_start', phase: 'navigator' },
        { type: 'tool_start', phase: 'navigator', name: 'list_datasets' },
        {
          type: 'tool_end',
          phase: 'navigator',
          name: 'list_datasets',
          result: '["orders", "products"]',
        },
      ];

      const result = extractPhaseDetails(events, null, true);

      const navPhase = result.find((p) => p.phase === 'navigator');
      expect(navPhase?.toolCalls).toHaveLength(1);
      expect(navPhase?.toolCalls[0]).toEqual({
        name: 'list_datasets',
        result: '"[\\"orders\\", \\"products\\"]"',
        isComplete: true,
      });
    });

    it('handles multiple tool calls in a phase', () => {
      const events: DataAgentStreamEvent[] = [
        { type: 'phase_start', phase: 'executor' },
        { type: 'tool_start', phase: 'executor', name: 'query_database' },
        { type: 'tool_end', phase: 'executor', name: 'query_database', result: '100 rows' },
        { type: 'tool_start', phase: 'executor', name: 'run_python' },
        { type: 'tool_end', phase: 'executor', name: 'run_python', result: 'success' },
      ];

      const result = extractPhaseDetails(events, null, true);

      const execPhase = result.find((p) => p.phase === 'executor');
      expect(execPhase?.toolCalls).toHaveLength(2);
      expect(execPhase?.toolCalls[0].name).toBe('query_database');
      expect(execPhase?.toolCalls[1].name).toBe('run_python');
      expect(execPhase?.toolCalls.every((tc) => tc.isComplete)).toBe(true);
    });
  });

  describe('extractPhaseDetails - history mode', () => {
    it('groups tool calls by phase from metadata', () => {
      const metadata = {
        toolCalls: [
          {
            phase: 'navigator',
            name: 'list_datasets',
            args: {},
            result: '["orders"]',
          },
          {
            phase: 'executor',
            stepId: 1,
            name: 'query_database',
            args: { sql: 'SELECT 1' },
            result: '100 rows',
          },
        ],
      };

      const result = extractPhaseDetails([], metadata, false);

      const navPhase = result.find((p) => p.phase === 'navigator');
      const execPhase = result.find((p) => p.phase === 'executor');

      expect(navPhase?.toolCalls).toHaveLength(1);
      expect(navPhase?.toolCalls[0]).toEqual({
        name: 'list_datasets',
        result: '"[\\"orders\\"]"',
        isComplete: true,
      });

      expect(execPhase?.toolCalls).toHaveLength(1);
      expect(execPhase?.toolCalls[0].name).toBe('query_database');
    });

    it('marks phases with tool calls as complete', () => {
      const metadata = {
        toolCalls: [
          {
            phase: 'planner',
            name: 'get_sample_data',
            args: {},
            result: 'sample',
          },
        ],
      };

      const result = extractPhaseDetails([], metadata, false);

      const plannerPhase = result.find((p) => p.phase === 'planner');
      expect(plannerPhase?.status).toBe('complete');

      // Phases without tool calls should be pending
      const navPhase = result.find((p) => p.phase === 'navigator');
      expect(navPhase?.status).toBe('pending');
    });

    it('handles empty toolCalls array', () => {
      const metadata = { toolCalls: [] };

      const result = extractPhaseDetails([], metadata, false);

      expect(result).toHaveLength(6);
      expect(result.every((p) => p.status === 'pending')).toBe(true);
      expect(result.every((p) => p.toolCalls.length === 0)).toBe(true);
    });

    it('filters out tool calls with unknown phases', () => {
      const metadata = {
        toolCalls: [
          {
            phase: 'unknown_phase',
            name: 'some_tool',
            args: {},
            result: 'result',
          },
        ],
      };

      const result = extractPhaseDetails([], metadata, false);

      // All phases should still be pending since unknown phase is filtered
      expect(result.every((p) => p.status === 'pending')).toBe(true);
    });
  });

  describe('extractLiveTokens', () => {
    it('should return null when no token_update events exist', () => {
      const events: DataAgentStreamEvent[] = [
        { type: 'phase_start', phase: 'planner' },
        { type: 'phase_complete', phase: 'planner' },
      ];
      expect(extractLiveTokens(events)).toBeNull();
    });

    it('should return null for empty events array', () => {
      expect(extractLiveTokens([])).toBeNull();
    });

    it('should extract tokens from a single token_update event', () => {
      const events: DataAgentStreamEvent[] = [
        { type: 'token_update', phase: 'planner', tokensUsed: { prompt: 100, completion: 50, total: 150 } },
      ];
      expect(extractLiveTokens(events)).toEqual({ prompt: 100, completion: 50, total: 150 });
    });

    it('should accumulate tokens from multiple token_update events', () => {
      const events: DataAgentStreamEvent[] = [
        { type: 'phase_start', phase: 'planner' },
        { type: 'token_update', phase: 'planner', tokensUsed: { prompt: 100, completion: 50, total: 150 } },
        { type: 'phase_complete', phase: 'planner' },
        { type: 'phase_start', phase: 'navigator' },
        { type: 'token_update', phase: 'navigator', tokensUsed: { prompt: 200, completion: 80, total: 280 } },
        { type: 'phase_complete', phase: 'navigator' },
      ];
      expect(extractLiveTokens(events)).toEqual({ prompt: 300, completion: 130, total: 430 });
    });

    it('should handle token_update events with missing tokensUsed', () => {
      const events: DataAgentStreamEvent[] = [
        { type: 'token_update', phase: 'planner' } as any, // no tokensUsed field
      ];
      expect(extractLiveTokens(events)).toEqual({ prompt: 0, completion: 0, total: 0 });
    });

    it('should handle token_update events with partial tokensUsed fields', () => {
      const events: DataAgentStreamEvent[] = [
        { type: 'token_update', phase: 'planner', tokensUsed: { prompt: 100 } as any },
        { type: 'token_update', phase: 'navigator', tokensUsed: { completion: 50 } as any },
      ];
      expect(extractLiveTokens(events)).toEqual({ prompt: 100, completion: 50, total: 0 });
    });
  });

  describe('extractJoinPlan - live mode', () => {
    it('returns null when no navigator artifact event', () => {
      const events: DataAgentStreamEvent[] = [
        { type: 'phase_start', phase: 'navigator' },
      ];

      const result = extractJoinPlan(events, null, true);

      expect(result).toBeNull();
    });

    it('returns joinPlan from phase_artifact event where phase="navigator"', () => {
      const joinPlanArtifact = {
        relevantDatasets: [
          { name: 'orders', description: 'Customer orders', source: 'public.orders', yaml: 'name: orders' },
        ],
        joinPaths: [],
        notes: 'Found 1 dataset',
      };

      const events: DataAgentStreamEvent[] = [
        { type: 'phase_start', phase: 'navigator' },
        { type: 'phase_artifact', phase: 'navigator', artifact: joinPlanArtifact },
      ];

      const result = extractJoinPlan(events, null, true);

      expect(result).toEqual(joinPlanArtifact);
    });

    it('ignores phase_artifact events from other phases', () => {
      const events: DataAgentStreamEvent[] = [
        { type: 'phase_artifact', phase: 'planner', artifact: { plan: 'data' } },
      ];

      const result = extractJoinPlan(events, null, true);

      expect(result).toBeNull();
    });
  });

  describe('extractJoinPlan - history mode', () => {
    it('returns null when metadata is null', () => {
      const result = extractJoinPlan([], null, false);

      expect(result).toBeNull();
    });

    it('returns null when metadata.joinPlan is undefined', () => {
      const metadata = { durationMs: 5000 };

      const result = extractJoinPlan([], metadata, false);

      expect(result).toBeNull();
    });

    it('returns metadata.joinPlan when present', () => {
      const joinPlan = {
        relevantDatasets: [
          { name: 'customers', description: 'Customer accounts', source: 'public.customers', yaml: 'name: customers' },
          { name: 'orders', description: 'Customer orders', source: 'public.orders', yaml: 'name: orders' },
        ],
        joinPaths: [
          {
            datasets: ['orders', 'customers'],
            edges: [
              {
                fromDataset: 'orders',
                toDataset: 'customers',
                fromColumns: ['customer_id'],
                toColumns: ['id'],
                relationshipName: 'placed_by',
              },
            ],
          },
        ],
        notes: 'Found 2 datasets and 1 join path',
      };

      const metadata = { joinPlan };

      const result = extractJoinPlan([], metadata, false);

      expect(result).toEqual(joinPlan);
    });
  });

  describe('joinPlanToGraph', () => {
    const sampleJoinPlan = {
      relevantDatasets: [
        { name: 'orders', description: 'Customer orders', source: 'public.orders', yaml: 'name: orders\nfields: []' },
        { name: 'customers', description: 'Customer accounts', source: 'public.customers', yaml: 'name: customers\nfields: []' },
        { name: 'products', description: 'Product catalog', source: 'public.products', yaml: 'name: products\nfields: []' },
      ],
      joinPaths: [
        {
          datasets: ['orders', 'customers'],
          edges: [
            { fromDataset: 'orders', toDataset: 'customers', fromColumns: ['customer_id'], toColumns: ['id'], relationshipName: 'placed_by' },
          ],
        },
        {
          datasets: ['orders', 'products'],
          edges: [
            { fromDataset: 'orders', toDataset: 'products', fromColumns: ['product_id'], toColumns: ['id'], relationshipName: 'contains' },
          ],
        },
      ],
      notes: 'Found 3 datasets and 2 join paths',
    };

    it('produces correct nodes from relevantDatasets', () => {
      const graph = joinPlanToGraph(sampleJoinPlan);

      expect(graph.nodes).toHaveLength(3);
      expect(graph.nodes[0]).toMatchObject({
        label: 'Dataset',
        name: 'orders',
        properties: {
          name: 'orders',
          source: 'public.orders',
          description: 'Customer orders',
          yaml: 'name: orders\nfields: []',
        },
      });
      expect(graph.nodes[1]).toMatchObject({
        label: 'Dataset',
        name: 'customers',
      });
      expect(graph.nodes[2]).toMatchObject({
        label: 'Dataset',
        name: 'products',
      });
    });

    it('produces correct edges from joinPaths', () => {
      const graph = joinPlanToGraph(sampleJoinPlan);

      expect(graph.edges).toHaveLength(2);
      expect(graph.edges[0]).toMatchObject({
        type: 'RELATES_TO',
        properties: {
          name: 'placed_by',
          fromColumns: 'customer_id',
          toColumns: 'id',
        },
      });
      expect(graph.edges[1]).toMatchObject({
        type: 'RELATES_TO',
        properties: {
          name: 'contains',
          fromColumns: 'product_id',
          toColumns: 'id',
        },
      });
    });

    it('deduplicates edges appearing in multiple joinPaths', () => {
      const joinPlanWithDuplicates = {
        relevantDatasets: [
          { name: 'orders', description: 'Orders', source: 'public.orders', yaml: '' },
          { name: 'customers', description: 'Customers', source: 'public.customers', yaml: '' },
        ],
        joinPaths: [
          {
            datasets: ['orders', 'customers'],
            edges: [
              { fromDataset: 'orders', toDataset: 'customers', fromColumns: ['customer_id'], toColumns: ['id'], relationshipName: 'placed_by' },
            ],
          },
          {
            datasets: ['customers', 'orders'],
            edges: [
              { fromDataset: 'orders', toDataset: 'customers', fromColumns: ['customer_id'], toColumns: ['id'], relationshipName: 'placed_by' },
            ],
          },
        ],
        notes: 'Duplicate edges',
      };

      const graph = joinPlanToGraph(joinPlanWithDuplicates);

      expect(graph.edges).toHaveLength(1);
    });

    it('skips edges referencing datasets not in relevantDatasets', () => {
      const joinPlanWithMissingDataset = {
        relevantDatasets: [
          { name: 'orders', description: 'Orders', source: 'public.orders', yaml: '' },
        ],
        joinPaths: [
          {
            datasets: ['orders', 'customers'],
            edges: [
              { fromDataset: 'orders', toDataset: 'customers', fromColumns: ['customer_id'], toColumns: ['id'], relationshipName: 'placed_by' },
            ],
          },
        ],
        notes: 'Missing dataset',
      };

      const graph = joinPlanToGraph(joinPlanWithMissingDataset);

      expect(graph.edges).toHaveLength(0);
    });

    it('returns empty edges array when joinPaths is empty', () => {
      const joinPlanNoJoins = {
        relevantDatasets: [
          { name: 'orders', description: 'Orders', source: 'public.orders', yaml: '' },
          { name: 'customers', description: 'Customers', source: 'public.customers', yaml: '' },
        ],
        joinPaths: [],
        notes: 'No joins',
      };

      const graph = joinPlanToGraph(joinPlanNoJoins);

      expect(graph.nodes).toHaveLength(2);
      expect(graph.edges).toHaveLength(0);
    });

    it('returns empty nodes and edges when relevantDatasets is empty', () => {
      const emptyJoinPlan = {
        relevantDatasets: [],
        joinPaths: [],
        notes: 'Empty',
      };

      const graph = joinPlanToGraph(emptyJoinPlan);

      expect(graph.nodes).toHaveLength(0);
      expect(graph.edges).toHaveLength(0);
    });

    it('stores yaml, source, description in node properties', () => {
      const graph = joinPlanToGraph(sampleJoinPlan);

      const ordersNode = graph.nodes.find((n) => n.name === 'orders');
      expect(ordersNode).toBeDefined();
      expect(ordersNode?.properties).toMatchObject({
        name: 'orders',
        source: 'public.orders',
        description: 'Customer orders',
        yaml: 'name: orders\nfields: []',
      });
    });
  });

  describe('extractDiscovery - live mode', () => {
    it('returns null when no discovery events exist', () => {
      const events: DataAgentStreamEvent[] = [
        { type: 'phase_start', phase: 'planner' },
      ];

      const result = extractDiscovery(events, null, true);

      expect(result).toBeNull();
    });

    it('returns status running when only discovery_start event exists', () => {
      const events: DataAgentStreamEvent[] = [
        { type: 'discovery_start' },
      ];

      const result = extractDiscovery(events, null, true);

      expect(result).toEqual({
        status: 'running',
        matchedDatasets: [],
        datasetsWithYaml: 0,
        preferencesLoaded: 0,
      });
    });

    it('returns complete data when discovery_complete event exists', () => {
      const events: DataAgentStreamEvent[] = [
        { type: 'discovery_start' },
        {
          type: 'discovery_complete',
          embeddingDurationMs: 342,
          vectorSearchDurationMs: 89,
          yamlFetchDurationMs: 67,
          matchedDatasets: [
            { name: 'og_field_dw', score: 0.92 },
            { name: 'og_well_dw', score: 0.87 },
          ],
          datasetsWithYaml: 2,
          preferencesLoaded: 3,
        },
      ];

      const result = extractDiscovery(events, null, true);

      expect(result).toEqual({
        status: 'complete',
        embeddingDurationMs: 342,
        vectorSearchDurationMs: 89,
        yamlFetchDurationMs: 67,
        matchedDatasets: [
          { name: 'og_field_dw', score: 0.92 },
          { name: 'og_well_dw', score: 0.87 },
        ],
        datasetsWithYaml: 2,
        preferencesLoaded: 3,
      });
    });
  });

  describe('extractDiscovery - history mode', () => {
    it('returns null when metadata is null', () => {
      const result = extractDiscovery([], null, false);

      expect(result).toBeNull();
    });

    it('returns null when metadata has no discovery field', () => {
      const metadata = { durationMs: 5000 };

      const result = extractDiscovery([], metadata, false);

      expect(result).toBeNull();
    });

    it('returns complete data from metadata.discovery', () => {
      const metadata = {
        discovery: {
          embeddingDurationMs: 342,
          vectorSearchDurationMs: 89,
          yamlFetchDurationMs: 67,
          matchedDatasets: [
            { name: 'og_field_dw', score: 0.92 },
            { name: 'og_well_dw', score: 0.87 },
          ],
          datasetsWithYaml: 2,
          preferencesLoaded: 3,
        },
      };

      const result = extractDiscovery([], metadata, false);

      expect(result).toEqual({
        status: 'complete',
        embeddingDurationMs: 342,
        vectorSearchDurationMs: 89,
        yamlFetchDurationMs: 67,
        matchedDatasets: [
          { name: 'og_field_dw', score: 0.92 },
          { name: 'og_well_dw', score: 0.87 },
        ],
        datasetsWithYaml: 2,
        preferencesLoaded: 3,
      });
    });
  });

  describe('formatDurationMs', () => {
    it('returns "500ms" for value 500', () => {
      expect(formatDurationMs(500)).toBe('500ms');
    });

    it('returns "0ms" for value 0', () => {
      expect(formatDurationMs(0)).toBe('0ms');
    });

    it('returns formatted time string for values >= 1000', () => {
      expect(formatDurationMs(1000)).toBe('0:01');
      expect(formatDurationMs(5000)).toBe('0:05');
      expect(formatDurationMs(92000)).toBe('1:32');
    });
  });

  describe('extractLiveLlmTraces', () => {
    it('returns empty array when no trace events exist', () => {
      const events: DataAgentStreamEvent[] = [
        { type: 'phase_start', phase: 'planner' },
        { type: 'phase_complete', phase: 'planner' },
      ];

      const result = extractLiveLlmTraces(events);

      expect(result).toEqual([]);
    });

    it('pairs start and end events by callIndex', () => {
      const events: DataAgentStreamEvent[] = [
        {
          type: 'llm_call_start',
          callIndex: 0,
          phase: 'planner',
          stepId: 1,
          purpose: 'Generate plan',
          provider: 'openai',
          model: 'gpt-4',
          structuredOutput: false,
          promptSummary: { messageCount: 2, totalChars: 500 },
        },
        {
          type: 'llm_call_end',
          callIndex: 0,
          phase: 'planner',
          stepId: 1,
          purpose: 'Generate plan',
          durationMs: 1500,
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          responsePreview: 'Plan response',
          toolCallCount: 0,
        },
      ];

      const result = extractLiveLlmTraces(events);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        callIndex: 0,
        phase: 'planner',
        stepId: 1,
        purpose: 'Generate plan',
        provider: 'openai',
        model: 'gpt-4',
        structuredOutput: false,
        promptSummary: { messageCount: 2, totalChars: 500 },
        status: 'complete',
        durationMs: 1500,
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        responsePreview: 'Plan response',
        toolCallCount: 0,
      });
    });

    it('shows running status for started but not completed traces', () => {
      const events: DataAgentStreamEvent[] = [
        {
          type: 'llm_call_start',
          callIndex: 0,
          phase: 'navigator',
          purpose: 'Find datasets',
          provider: 'anthropic',
          model: 'claude-3-5-sonnet-20241022',
          structuredOutput: true,
          promptSummary: { messageCount: 1, totalChars: 300 },
        },
      ];

      const result = extractLiveLlmTraces(events);

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('running');
      expect(result[0].durationMs).toBeUndefined();
      expect(result[0].promptTokens).toBeUndefined();
    });

    it('shows error status when end event has error', () => {
      const events: DataAgentStreamEvent[] = [
        {
          type: 'llm_call_start',
          callIndex: 0,
          phase: 'executor',
          purpose: 'Run query',
          provider: 'openai',
          model: 'gpt-4',
          structuredOutput: false,
          promptSummary: { messageCount: 1, totalChars: 200 },
        },
        {
          type: 'llm_call_end',
          callIndex: 0,
          phase: 'executor',
          purpose: 'Run query',
          durationMs: 500,
          error: 'Database connection failed',
        },
      ];

      const result = extractLiveLlmTraces(events);

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('error');
      expect(result[0].error).toBe('Database connection failed');
      expect(result[0].durationMs).toBe(500);
    });

    it('sorts by callIndex', () => {
      const events: DataAgentStreamEvent[] = [
        {
          type: 'llm_call_start',
          callIndex: 2,
          phase: 'verifier',
          purpose: 'Verify',
          provider: 'openai',
          model: 'gpt-4',
          structuredOutput: false,
        },
        {
          type: 'llm_call_start',
          callIndex: 0,
          phase: 'planner',
          purpose: 'Plan',
          provider: 'openai',
          model: 'gpt-4',
          structuredOutput: false,
        },
        {
          type: 'llm_call_start',
          callIndex: 1,
          phase: 'navigator',
          purpose: 'Navigate',
          provider: 'openai',
          model: 'gpt-4',
          structuredOutput: false,
        },
      ];

      const result = extractLiveLlmTraces(events);

      expect(result).toHaveLength(3);
      expect(result[0].callIndex).toBe(0);
      expect(result[1].callIndex).toBe(1);
      expect(result[2].callIndex).toBe(2);
    });

    it('handles multiple traces with mixed statuses', () => {
      const events: DataAgentStreamEvent[] = [
        {
          type: 'llm_call_start',
          callIndex: 0,
          phase: 'planner',
          purpose: 'Plan',
          provider: 'openai',
          model: 'gpt-4',
          structuredOutput: true,
        },
        {
          type: 'llm_call_end',
          callIndex: 0,
          phase: 'planner',
          purpose: 'Plan',
          durationMs: 1000,
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          responsePreview: 'Plan complete',
          toolCallCount: 1,
        },
        {
          type: 'llm_call_start',
          callIndex: 1,
          phase: 'navigator',
          purpose: 'Navigate',
          provider: 'openai',
          model: 'gpt-4',
          structuredOutput: false,
        },
      ];

      const result = extractLiveLlmTraces(events);

      expect(result).toHaveLength(2);
      expect(result[0].status).toBe('complete');
      expect(result[1].status).toBe('running');
    });

    it('handles end event without matching start', () => {
      const events: DataAgentStreamEvent[] = [
        {
          type: 'llm_call_end',
          callIndex: 5,
          phase: 'planner',
          purpose: 'Plan',
          durationMs: 1000,
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
      ];

      const result = extractLiveLlmTraces(events);

      // End event without start is ignored
      expect(result).toEqual([]);
    });
  });
});
