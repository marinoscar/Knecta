/**
 * Focused tests for the web search tool-binding behavior in createNavigatorNode.
 *
 * These tests verify that:
 * - When webSearchTool is null, only the three ontology tools are bound.
 * - When webSearchTool is provided, it is appended to the ontology tools.
 *
 * The navigator's full ReAct loop is NOT tested here — that is the domain of
 * integration tests. We only inspect the tools array passed to llm.bindTools().
 */

import { createNavigatorNode } from '../navigator.node';

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

// Suppress the DynamicStructuredTool ts-expect-error pattern and real Neo4j calls
jest.mock('../../../../ontologies/neo-ontology.service');

jest.mock('../../tools/list-datasets.tool', () => ({
  createListDatasetsTool: jest.fn(() => ({ name: 'list_datasets' })),
}));

jest.mock('../../tools/get-dataset-details.tool', () => ({
  createGetDatasetDetailsTool: jest.fn(() => ({ name: 'get_dataset_details' })),
}));

jest.mock('../../tools/get-relationships.tool', () => ({
  createGetRelationshipsTool: jest.fn(() => ({ name: 'get_relationships' })),
}));

jest.mock('../../prompts/navigator.prompt', () => ({
  buildNavigatorPrompt: jest.fn(() => 'mock system prompt'),
}));

jest.mock('../../utils/data-agent-tracer', () => ({
  DataAgentTracer: jest.fn().mockImplementation(() => ({
    trace: jest.fn(),
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal mock LLM whose bindTools() call we can inspect.
 * bindTools returns a new "llmWithTools" whose invoke() immediately throws
 * so the ReAct loop is short-circuited on the very first iteration.
 * We only care that bindTools was called with the right argument.
 */
function buildMockLlm() {
  const bindToolsMock = jest.fn();

  // llmWithTools.invoke throws to abort the loop immediately
  const llmWithTools = {
    invoke: jest.fn().mockRejectedValue(new Error('abort')),
  };

  bindToolsMock.mockReturnValue(llmWithTools);

  return {
    bindTools: bindToolsMock,
    bindToolsMock,
  };
}

function buildMockNeoOntologyService() {
  return {
    listDatasets: jest.fn().mockResolvedValue([]),
    getDatasetsByNames: jest.fn().mockResolvedValue([]),
    getAllRelationships: jest.fn().mockResolvedValue([]),
  } as any;
}

function buildMockEmit() {
  return jest.fn();
}

function buildMockTracer() {
  return {
    trace: jest.fn().mockRejectedValue(new Error('abort')),
  } as any;
}

/** Minimal state that satisfies the DataAgentStateType used by navigator */
function buildMinimalState() {
  return {
    plan: {
      steps: [
        {
          stepId: 1,
          question: 'How many wells exist?',
          strategy: 'sql',
          datasets: ['wells'],
          complexity: 'simple',
        },
      ],
    },
    messages: [],
    currentPhase: 'planner',
    tokensUsed: { prompt: 0, completion: 0, total: 0 },
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createNavigatorNode — web search tool binding', () => {
  const ONTOLOGY_ID = 'test-ontology-id';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('without web search tool (webSearchTool = null)', () => {
    it('should call bindTools with exactly the three ontology tools', async () => {
      const { bindTools, bindToolsMock } = buildMockLlm();
      const llm = { bindTools };
      const neoService = buildMockNeoOntologyService();
      const emit = buildMockEmit();
      const tracer = buildMockTracer();

      const node = createNavigatorNode(llm, neoService, ONTOLOGY_ID, emit, tracer, null);

      // Run the node — it will error out in the ReAct loop but that is fine
      await node(buildMinimalState()).catch(() => {});

      expect(bindToolsMock).toHaveBeenCalledTimes(1);

      const toolsPassedToBindTools: any[] = bindToolsMock.mock.calls[0][0];

      // Only the three ontology tools — no web search
      expect(toolsPassedToBindTools).toHaveLength(3);
      expect(toolsPassedToBindTools.map((t) => t.name)).toEqual([
        'list_datasets',
        'get_dataset_details',
        'get_relationships',
      ]);
    });

    it('should not include any web search tool when webSearchTool is null', async () => {
      const { bindTools, bindToolsMock } = buildMockLlm();
      const llm = { bindTools };
      const node = createNavigatorNode(
        llm,
        buildMockNeoOntologyService(),
        ONTOLOGY_ID,
        buildMockEmit(),
        buildMockTracer(),
        null,
      );

      await node(buildMinimalState()).catch(() => {});

      const toolsPassedToBindTools: any[] = bindToolsMock.mock.calls[0][0];
      const hasWebSearch = toolsPassedToBindTools.some(
        (t) => t.type === 'web_search' || t.type === 'web_search_20250305',
      );
      expect(hasWebSearch).toBe(false);
    });
  });

  describe('with web search tool provided', () => {
    it('should call bindTools with the three ontology tools plus the web search tool', async () => {
      const { bindTools, bindToolsMock } = buildMockLlm();
      const llm = { bindTools };
      const neoService = buildMockNeoOntologyService();
      const emit = buildMockEmit();
      const tracer = buildMockTracer();

      const webSearchTool = { type: 'web_search' };

      const node = createNavigatorNode(llm, neoService, ONTOLOGY_ID, emit, tracer, webSearchTool);

      await node(buildMinimalState()).catch(() => {});

      expect(bindToolsMock).toHaveBeenCalledTimes(1);

      const toolsPassedToBindTools: any[] = bindToolsMock.mock.calls[0][0];

      // Three ontology tools + one web search tool
      expect(toolsPassedToBindTools).toHaveLength(4);
    });

    it('should place the web search tool last in the tools array', async () => {
      const { bindTools, bindToolsMock } = buildMockLlm();
      const llm = { bindTools };

      const webSearchTool = { type: 'web_search' };

      const node = createNavigatorNode(
        llm,
        buildMockNeoOntologyService(),
        ONTOLOGY_ID,
        buildMockEmit(),
        buildMockTracer(),
        webSearchTool,
      );

      await node(buildMinimalState()).catch(() => {});

      const toolsPassedToBindTools: any[] = bindToolsMock.mock.calls[0][0];
      const lastTool = toolsPassedToBindTools[toolsPassedToBindTools.length - 1];

      expect(lastTool).toBe(webSearchTool);
    });

    it('should include all three ontology tools when web search is provided', async () => {
      const { bindTools, bindToolsMock } = buildMockLlm();
      const llm = { bindTools };

      const webSearchTool = { type: 'web_search' };

      const node = createNavigatorNode(
        llm,
        buildMockNeoOntologyService(),
        ONTOLOGY_ID,
        buildMockEmit(),
        buildMockTracer(),
        webSearchTool,
      );

      await node(buildMinimalState()).catch(() => {});

      const toolsPassedToBindTools: any[] = bindToolsMock.mock.calls[0][0];
      const ontologyToolNames = toolsPassedToBindTools
        .filter((t) => t.name)
        .map((t) => t.name);

      expect(ontologyToolNames).toContain('list_datasets');
      expect(ontologyToolNames).toContain('get_dataset_details');
      expect(ontologyToolNames).toContain('get_relationships');
    });

    it('should work with an anthropic-style web search tool object', async () => {
      const { bindTools, bindToolsMock } = buildMockLlm();
      const llm = { bindTools };

      const anthropicWebSearchTool = {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 5,
      };

      const node = createNavigatorNode(
        llm,
        buildMockNeoOntologyService(),
        ONTOLOGY_ID,
        buildMockEmit(),
        buildMockTracer(),
        anthropicWebSearchTool,
      );

      await node(buildMinimalState()).catch(() => {});

      const toolsPassedToBindTools: any[] = bindToolsMock.mock.calls[0][0];

      expect(toolsPassedToBindTools).toHaveLength(4);
      expect(toolsPassedToBindTools[3]).toBe(anthropicWebSearchTool);
    });
  });

  describe('default parameter behavior', () => {
    it('should default webSearchTool to null when omitted', async () => {
      const { bindTools, bindToolsMock } = buildMockLlm();
      const llm = { bindTools };

      // Call without the webSearchTool argument — relies on default = null
      const node = createNavigatorNode(
        llm,
        buildMockNeoOntologyService(),
        ONTOLOGY_ID,
        buildMockEmit(),
        buildMockTracer(),
        // webSearchTool intentionally omitted
      );

      await node(buildMinimalState()).catch(() => {});

      const toolsPassedToBindTools: any[] = bindToolsMock.mock.calls[0][0];

      // Should still only have three ontology tools (default null)
      expect(toolsPassedToBindTools).toHaveLength(3);
    });
  });
});
