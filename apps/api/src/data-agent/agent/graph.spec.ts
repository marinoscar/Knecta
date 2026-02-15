import { buildDataAgentGraph } from './graph';
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

    it('should pass regular llm to executor node', () => {
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
});
