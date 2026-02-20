import {
  buildDataAgentGraph,
  routeAfterPlanner,
  routeAfterNavigator,
  routeAfterVerification,
} from './graph';
import {
  createPlannerNode,
  createNavigatorNode,
  createSqlBuilderNode,
  createExecutorNode,
  createVerifierNode,
  createExplainerNode,
} from './nodes';

// Mock all node creators
jest.mock('./nodes', () => ({
  createPlannerNode: jest.fn(),
  createNavigatorNode: jest.fn(),
  createSqlBuilderNode: jest.fn(),
  createExecutorNode: jest.fn(),
  createVerifierNode: jest.fn(),
  createExplainerNode: jest.fn(),
}));

describe('buildDataAgentGraph', () => {
  let mockRegularLlm: any;
  let mockStructuredLlm: any;
  let mockNeoOntologyService: any;
  let mockDiscoveryService: any;
  let mockSandboxService: any;
  let mockEmit: jest.Mock;
  let mockTracer: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create distinct mock LLM instances
    mockRegularLlm = { id: 'regular', model: 'gpt-4o' };
    mockStructuredLlm = { id: 'structured', model: 'gpt-4o-no-reasoning' };

    mockNeoOntologyService = { listDatasets: jest.fn() };
    mockDiscoveryService = { getDatabases: jest.fn() };
    mockSandboxService = { executePython: jest.fn() };
    mockEmit = jest.fn();
    mockTracer = { trace: jest.fn() };

    // Mock node creators to return simple node functions
    (createPlannerNode as jest.Mock).mockReturnValue(jest.fn());
    (createNavigatorNode as jest.Mock).mockReturnValue(jest.fn());
    (createSqlBuilderNode as jest.Mock).mockReturnValue(jest.fn());
    (createExecutorNode as jest.Mock).mockReturnValue(jest.fn());
    (createVerifierNode as jest.Mock).mockReturnValue(jest.fn());
    (createExplainerNode as jest.Mock).mockReturnValue(jest.fn());
  });

  describe('LLM routing to nodes', () => {
    it('should pass structuredLlm to planner node', () => {
      buildDataAgentGraph({
        llm: mockRegularLlm,
        structuredLlm: mockStructuredLlm,
        neoOntologyService: mockNeoOntologyService,
        discoveryService: mockDiscoveryService,
        sandboxService: mockSandboxService,
        ontologyId: 'ontology-123',
        connectionId: 'connection-123',
        databaseType: 'postgresql',
        emit: mockEmit,
        tracer: mockTracer,
      });

      expect(createPlannerNode).toHaveBeenCalledWith(
        mockStructuredLlm,
        mockEmit,
        mockTracer,
      );
    });

    it('should pass structuredLlm to sql_builder node', () => {
      buildDataAgentGraph({
        llm: mockRegularLlm,
        structuredLlm: mockStructuredLlm,
        neoOntologyService: mockNeoOntologyService,
        discoveryService: mockDiscoveryService,
        sandboxService: mockSandboxService,
        ontologyId: 'ontology-123',
        connectionId: 'connection-123',
        databaseType: 'postgresql',
        emit: mockEmit,
        tracer: mockTracer,
      });

      expect(createSqlBuilderNode).toHaveBeenCalledWith(
        mockStructuredLlm,
        mockNeoOntologyService,
        'ontology-123',
        'postgresql',
        mockEmit,
        mockTracer,
      );
    });

    it('should pass regular llm to navigator node', () => {
      buildDataAgentGraph({
        llm: mockRegularLlm,
        structuredLlm: mockStructuredLlm,
        neoOntologyService: mockNeoOntologyService,
        discoveryService: mockDiscoveryService,
        sandboxService: mockSandboxService,
        ontologyId: 'ontology-123',
        connectionId: 'connection-123',
        databaseType: 'postgresql',
        emit: mockEmit,
        tracer: mockTracer,
      });

      expect(createNavigatorNode).toHaveBeenCalledWith(
        mockRegularLlm,
        mockNeoOntologyService,
        'ontology-123',
        mockEmit,
        mockTracer,
      );
    });

    it('should pass both llm and structuredLlm to executor node', () => {
      buildDataAgentGraph({
        llm: mockRegularLlm,
        structuredLlm: mockStructuredLlm,
        neoOntologyService: mockNeoOntologyService,
        discoveryService: mockDiscoveryService,
        sandboxService: mockSandboxService,
        ontologyId: 'ontology-123',
        connectionId: 'connection-123',
        databaseType: 'postgresql',
        emit: mockEmit,
        tracer: mockTracer,
      });

      expect(createExecutorNode).toHaveBeenCalledWith(
        mockRegularLlm,
        mockStructuredLlm,
        mockDiscoveryService,
        mockSandboxService,
        'connection-123',
        mockEmit,
        mockTracer,
      );
    });

    it('should pass regular llm to verifier node', () => {
      buildDataAgentGraph({
        llm: mockRegularLlm,
        structuredLlm: mockStructuredLlm,
        neoOntologyService: mockNeoOntologyService,
        discoveryService: mockDiscoveryService,
        sandboxService: mockSandboxService,
        ontologyId: 'ontology-123',
        connectionId: 'connection-123',
        databaseType: 'postgresql',
        emit: mockEmit,
        tracer: mockTracer,
      });

      expect(createVerifierNode).toHaveBeenCalledWith(
        mockRegularLlm,
        mockSandboxService,
        mockEmit,
        mockTracer,
      );
    });

    it('should pass regular llm to explainer node', () => {
      buildDataAgentGraph({
        llm: mockRegularLlm,
        structuredLlm: mockStructuredLlm,
        neoOntologyService: mockNeoOntologyService,
        discoveryService: mockDiscoveryService,
        sandboxService: mockSandboxService,
        ontologyId: 'ontology-123',
        connectionId: 'connection-123',
        databaseType: 'postgresql',
        emit: mockEmit,
        tracer: mockTracer,
      });

      expect(createExplainerNode).toHaveBeenCalledWith(
        mockRegularLlm,
        mockSandboxService,
        mockEmit,
        mockTracer,
      );
    });
  });

  describe('Dual LLM pattern validation', () => {
    it('should accept both llm and structuredLlm as required dependencies', () => {
      // This test verifies the interface requires both LLM instances
      const deps = {
        llm: mockRegularLlm,
        structuredLlm: mockStructuredLlm,
        neoOntologyService: mockNeoOntologyService,
        discoveryService: mockDiscoveryService,
        sandboxService: mockSandboxService,
        ontologyId: 'ontology-123',
        connectionId: 'connection-123',
        databaseType: 'postgresql',
        emit: mockEmit,
        tracer: mockTracer,
      };

      expect(() => buildDataAgentGraph(deps)).not.toThrow();
    });

    it('should use different LLM instances for structured vs reasoning nodes', () => {
      buildDataAgentGraph({
        llm: mockRegularLlm,
        structuredLlm: mockStructuredLlm,
        neoOntologyService: mockNeoOntologyService,
        discoveryService: mockDiscoveryService,
        sandboxService: mockSandboxService,
        ontologyId: 'ontology-123',
        connectionId: 'connection-123',
        databaseType: 'postgresql',
        emit: mockEmit,
        tracer: mockTracer,
      });

      // Verify planner uses structuredLlm
      const plannerLlm = (createPlannerNode as jest.Mock).mock.calls[0][0];
      expect(plannerLlm).toBe(mockStructuredLlm);

      // Verify sql_builder uses structuredLlm
      const sqlBuilderLlm = (createSqlBuilderNode as jest.Mock).mock.calls[0][0];
      expect(sqlBuilderLlm).toBe(mockStructuredLlm);

      // Verify navigator uses regular llm
      const navigatorLlm = (createNavigatorNode as jest.Mock).mock.calls[0][0];
      expect(navigatorLlm).toBe(mockRegularLlm);

      // Verify executor uses regular llm
      const executorLlm = (createExecutorNode as jest.Mock).mock.calls[0][0];
      expect(executorLlm).toBe(mockRegularLlm);

      // Verify verifier uses regular llm
      const verifierLlm = (createVerifierNode as jest.Mock).mock.calls[0][0];
      expect(verifierLlm).toBe(mockRegularLlm);

      // Verify explainer uses regular llm
      const explainerLlm = (createExplainerNode as jest.Mock).mock.calls[0][0];
      expect(explainerLlm).toBe(mockRegularLlm);
    });

    it('should create all 6 nodes when building the graph', () => {
      buildDataAgentGraph({
        llm: mockRegularLlm,
        structuredLlm: mockStructuredLlm,
        neoOntologyService: mockNeoOntologyService,
        discoveryService: mockDiscoveryService,
        sandboxService: mockSandboxService,
        ontologyId: 'ontology-123',
        connectionId: 'connection-123',
        databaseType: 'postgresql',
        emit: mockEmit,
        tracer: mockTracer,
      });

      expect(createPlannerNode).toHaveBeenCalledTimes(1);
      expect(createNavigatorNode).toHaveBeenCalledTimes(1);
      expect(createSqlBuilderNode).toHaveBeenCalledTimes(1);
      expect(createExecutorNode).toHaveBeenCalledTimes(1);
      expect(createVerifierNode).toHaveBeenCalledTimes(1);
      expect(createExplainerNode).toHaveBeenCalledTimes(1);
    });
  });

  describe('Routing functions', () => {
    describe('routeAfterPlanner', () => {
      it('should route to __end__ when clarification is needed', () => {
        const state = {
          plan: {
            shouldClarify: true,
            clarificationQuestions: [
              { question: 'What time window?', assumption: 'last 30 days' },
            ],
            complexity: 'analytical',
          },
        } as any;
        expect(routeAfterPlanner(state)).toBe('__end__');
      });

      it('should route conversational queries to explainer', () => {
        const state = {
          plan: {
            shouldClarify: false,
            clarificationQuestions: [],
            complexity: 'conversational',
          },
        } as any;
        expect(routeAfterPlanner(state)).toBe('explainer');
      });

      it('should route simple queries to navigator (NOT executor)', () => {
        const state = {
          plan: {
            shouldClarify: false,
            clarificationQuestions: [],
            complexity: 'simple',
          },
        } as any;
        expect(routeAfterPlanner(state)).toBe('navigator');
      });

      it('should route analytical queries to navigator', () => {
        const state = {
          plan: {
            shouldClarify: false,
            clarificationQuestions: [],
            complexity: 'analytical',
          },
        } as any;
        expect(routeAfterPlanner(state)).toBe('navigator');
      });

      it('should route to navigator when plan is null', () => {
        const state = { plan: null } as any;
        expect(routeAfterPlanner(state)).toBe('navigator');
      });
    });

    describe('routeAfterNavigator', () => {
      it('should route to explainer when cannotAnswer is set', () => {
        const state = {
          cannotAnswer: {
            reason: 'Datasets not found',
            missingDatasets: ['sales'],
            availableDatasets: ['orders', 'products'],
          },
        } as any;
        expect(routeAfterNavigator(state)).toBe('explainer');
      });

      it('should route to sql_builder when cannotAnswer is null', () => {
        const state = {
          cannotAnswer: null,
        } as any;
        expect(routeAfterNavigator(state)).toBe('sql_builder');
      });

      it('should route to sql_builder when cannotAnswer is undefined', () => {
        const state = {} as any;
        expect(routeAfterNavigator(state)).toBe('sql_builder');
      });
    });

    describe('routeAfterVerification', () => {
      it('should route to explainer when verification passed', () => {
        const state = {
          verificationReport: {
            passed: true,
            checks: [],
            diagnosis: '',
            recommendedTarget: null,
          },
          revisionCount: 0,
        } as any;
        expect(routeAfterVerification(state)).toBe('explainer');
      });

      it('should route to explainer when no verification report', () => {
        const state = {
          verificationReport: null,
          revisionCount: 0,
        } as any;
        expect(routeAfterVerification(state)).toBe('explainer');
      });

      it('should route to explainer when max revisions reached', () => {
        const state = {
          verificationReport: {
            passed: false,
            checks: [],
            diagnosis: 'fail',
            recommendedTarget: 'sql_builder',
          },
          revisionCount: 3,
        } as any;
        expect(routeAfterVerification(state)).toBe('explainer');
      });

      it('should route to navigator when recommended', () => {
        const state = {
          verificationReport: {
            passed: false,
            checks: [],
            diagnosis: 'join issue',
            recommendedTarget: 'navigator',
          },
          revisionCount: 1,
        } as any;
        expect(routeAfterVerification(state)).toBe('navigator');
      });

      it('should route to sql_builder by default on failure', () => {
        const state = {
          verificationReport: {
            passed: false,
            checks: [],
            diagnosis: 'SQL error',
            recommendedTarget: 'sql_builder',
          },
          revisionCount: 1,
        } as any;
        expect(routeAfterVerification(state)).toBe('sql_builder');
      });
    });
  });
});
