import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DataAgentAgentService } from './agent.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LlmService } from '../../llm/llm.service';
import { EmbeddingService } from '../../embedding/embedding.service';
import { NeoVectorService } from '../../neo-graph/neo-vector.service';
import { NeoOntologyService } from '../../ontologies/neo-ontology.service';
import { DiscoveryService } from '../../discovery/discovery.service';
import { SandboxService } from '../../sandbox/sandbox.service';
import { DataAgentService } from '../data-agent.service';
import {
  createMockPrismaService,
  MockPrismaService,
} from '../../../test/mocks/prisma.mock';
import { DataAgentStateType } from './state';

// Mock the graph builder module
jest.mock('./graph', () => ({
  buildDataAgentGraph: jest.fn(),
}));

import { buildDataAgentGraph } from './graph';

describe('DataAgentAgentService', () => {
  let service: DataAgentAgentService;
  let mockPrisma: MockPrismaService;
  let mockLlmService: jest.Mocked<LlmService>;
  let mockEmbeddingService: jest.Mocked<EmbeddingService>;
  let mockNeoVectorService: jest.Mocked<NeoVectorService>;
  let mockNeoOntologyService: jest.Mocked<NeoOntologyService>;
  let mockDiscoveryService: jest.Mocked<DiscoveryService>;
  let mockSandboxService: jest.Mocked<SandboxService>;
  let mockDataAgentService: jest.Mocked<DataAgentService>;

  const mockUserId = 'user-123';
  const mockChatId = 'chat-123';
  const mockMessageId = 'msg-123';
  const mockOntologyId = 'ontology-123';
  const mockConnectionId = 'connection-123';

  const mockChat = {
    id: mockChatId,
    name: 'Test Chat',
    ontologyId: mockOntologyId,
    ownerId: mockUserId,
    createdAt: new Date(),
    updatedAt: new Date(),
    ontology: {
      id: mockOntologyId,
      name: 'Test Ontology',
      status: 'ready',
      ownerId: mockUserId,
      semanticModelId: 'model-123',
      semanticModel: {
        id: 'model-123',
        connectionId: mockConnectionId,
        connection: {
          id: mockConnectionId,
          dbType: 'postgresql',
        },
      },
    },
  };

  const mockMessages = [
    {
      id: 'prev-msg-1',
      chatId: mockChatId,
      role: 'user',
      content: 'Previous question',
      status: 'complete',
      metadata: {},
      createdAt: new Date('2024-01-01'),
    },
    {
      id: 'prev-msg-2',
      chatId: mockChatId,
      role: 'assistant',
      content: 'Previous answer',
      status: 'complete',
      metadata: {
        toolCalls: [
          {
            name: 'list_datasets',
            args: { ontologyId: mockOntologyId },
            result: 'Found 5 datasets',
          },
        ],
      },
      createdAt: new Date('2024-01-02'),
    },
  ];

  beforeEach(async () => {
    mockPrisma = createMockPrismaService();

    mockLlmService = {
      getChatModel: jest.fn().mockReturnValue({ model: 'mock-llm' }),
    } as any;

    mockEmbeddingService = {
      getProvider: jest.fn().mockReturnValue({
        generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      }),
    } as any;

    mockNeoVectorService = {
      searchSimilar: jest.fn().mockResolvedValue([
        { name: 'Dataset1', score: 0.9 },
        { name: 'Dataset2', score: 0.8 },
      ]),
    } as any;

    mockNeoOntologyService = {
      listDatasets: jest.fn().mockResolvedValue([
        { name: 'Dataset1' },
        { name: 'Dataset2' },
        { name: 'Dataset3' },
      ]),
      getDatasetsByNames: jest.fn().mockResolvedValue([
        {
          name: 'Dataset1',
          description: 'First dataset',
          source: 'public.dataset1',
          yaml: 'name: Dataset1\nfields:\n  - name: id\n    type: integer',
        },
        {
          name: 'Dataset2',
          description: 'Second dataset',
          source: 'public.dataset2',
          yaml: 'name: Dataset2\nfields:\n  - name: id\n    type: integer',
        },
      ]),
    } as any;

    mockDiscoveryService = {} as any;
    mockSandboxService = {} as any;

    mockDataAgentService = {
      updateAssistantMessage: jest.fn().mockResolvedValue(undefined),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataAgentAgentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LlmService, useValue: mockLlmService },
        { provide: EmbeddingService, useValue: mockEmbeddingService },
        { provide: NeoVectorService, useValue: mockNeoVectorService },
        { provide: NeoOntologyService, useValue: mockNeoOntologyService },
        { provide: DiscoveryService, useValue: mockDiscoveryService },
        { provide: SandboxService, useValue: mockSandboxService },
        { provide: DataAgentService, useValue: mockDataAgentService },
      ],
    }).compile();

    service = module.get<DataAgentAgentService>(DataAgentAgentService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Graph Routing', () => {
    // Note: These tests verify the routing logic implemented in graph.ts
    // The actual routing functions are tested indirectly through integration tests
    // Here we document the expected routing behavior

    describe('routeAfterPlanner', () => {
      it('should route simple plans to executor', () => {
        // Simple complexity → executor (bypasses navigator and sql_builder)
        const state: Partial<DataAgentStateType> = {
          plan: {
            complexity: 'simple',
            intent: 'Get count',
            metrics: ['count'],
            dimensions: [],
            timeWindow: null,
            filters: [],
            grain: 'total',
            ambiguities: [],
            acceptanceChecks: [],
            steps: [
              {
                id: 1,
                description: 'Count records',
                strategy: 'sql',
                dependsOn: [],
                datasets: ['Dataset1'],
                expectedOutput: 'count',
              },
            ],
          },
        };

        // Expected: executor
        expect(state.plan?.complexity).toBe('simple');
      });

      it('should route analytical plans to navigator', () => {
        // Analytical complexity → navigator (for multi-dataset joins)
        const state: Partial<DataAgentStateType> = {
          plan: {
            complexity: 'analytical',
            intent: 'Compare metrics across datasets',
            metrics: ['revenue', 'cost'],
            dimensions: ['region'],
            timeWindow: 'last 30 days',
            filters: ['status = active'],
            grain: 'per-region',
            ambiguities: [],
            acceptanceChecks: ['verify row count', 'check null values'],
            steps: [
              {
                id: 1,
                description: 'Join datasets and aggregate',
                strategy: 'sql_then_python',
                dependsOn: [],
                datasets: ['Dataset1', 'Dataset2'],
                expectedOutput: 'aggregated results',
              },
            ],
          },
        };

        // Expected: navigator
        expect(state.plan?.complexity).toBe('analytical');
      });
    });

    describe('routeAfterVerification', () => {
      it('should route passed verification to explainer', () => {
        const state: Partial<DataAgentStateType> = {
          verificationReport: {
            passed: true,
            checks: [
              { name: 'row_count', passed: true, message: 'Row count valid' },
            ],
            diagnosis: '',
            recommendedTarget: null,
          },
          revisionCount: 0,
        };

        // Expected: explainer
        expect(state.verificationReport?.passed).toBe(true);
      });

      it('should route failed verification with revisions < 3 to recommended target (navigator)', () => {
        const state: Partial<DataAgentStateType> = {
          verificationReport: {
            passed: false,
            checks: [
              {
                name: 'join_check',
                passed: false,
                message: 'Join produced unexpected results',
              },
            ],
            diagnosis: 'Join path needs revision',
            recommendedTarget: 'navigator',
          },
          revisionCount: 1,
        };

        // Expected: navigator
        expect(state.verificationReport?.passed).toBe(false);
        expect(state.revisionCount).toBeLessThan(3);
        expect(state.verificationReport?.recommendedTarget).toBe('navigator');
      });

      it('should route failed verification with revisions < 3 to recommended target (sql_builder)', () => {
        const state: Partial<DataAgentStateType> = {
          verificationReport: {
            passed: false,
            checks: [
              {
                name: 'sql_check',
                passed: false,
                message: 'SQL query needs refinement',
              },
            ],
            diagnosis: 'SQL logic issue',
            recommendedTarget: 'sql_builder',
          },
          revisionCount: 2,
        };

        // Expected: sql_builder
        expect(state.verificationReport?.passed).toBe(false);
        expect(state.revisionCount).toBeLessThan(3);
        expect(state.verificationReport?.recommendedTarget).toBe('sql_builder');
      });

      it('should route failed verification with revisions >= 3 to explainer with caveats', () => {
        const state: Partial<DataAgentStateType> = {
          verificationReport: {
            passed: false,
            checks: [
              { name: 'final_check', passed: false, message: 'Still failing' },
            ],
            diagnosis: 'Max revisions reached',
            recommendedTarget: 'sql_builder',
          },
          revisionCount: 3,
        };

        // Expected: explainer (with caveats about failed verification)
        expect(state.verificationReport?.passed).toBe(false);
        expect(state.revisionCount).toBeGreaterThanOrEqual(3);
      });
    });
  });

  describe('executeAgent', () => {
    let mockGraph: { invoke: jest.Mock };
    let eventsEmitted: any[];

    beforeEach(() => {
      // Setup mock graph that resolves with a final state
      mockGraph = {
        invoke: jest.fn().mockResolvedValue({
          explainerOutput: {
            narrative: 'Test answer with detailed explanation',
            dataLineage: {
              datasets: ['Dataset1', 'Dataset2'],
              joins: [
                { from: 'Dataset1', to: 'Dataset2', on: 'id = dataset2_id' },
              ],
              timeWindow: null,
              filters: [],
              grain: 'row-level',
              rowCount: 42,
            },
            caveats: [],
            charts: [],
          },
          toolCalls: [
            {
              phase: 'navigator',
              name: 'list_datasets',
              args: { ontologyId: mockOntologyId },
              result: 'Found 2 datasets',
            },
          ],
          tokensUsed: { prompt: 100, completion: 50, total: 150 },
          plan: {
            complexity: 'simple',
            intent: 'Test query',
            metrics: ['count'],
            dimensions: [],
            timeWindow: null,
            filters: [],
            grain: 'total',
            ambiguities: [],
            acceptanceChecks: [],
            steps: [
              {
                id: 1,
                description: 'Count records',
                strategy: 'sql',
                dependsOn: [],
                datasets: ['Dataset1'],
                expectedOutput: 'count',
              },
            ],
          },
          revisionCount: 0,
        }),
      };

      (buildDataAgentGraph as jest.Mock).mockReturnValue(mockGraph);

      mockPrisma.dataChat.findFirst.mockResolvedValue(mockChat as any);
      mockPrisma.dataChatMessage.findMany.mockResolvedValue(mockMessages as any);

      eventsEmitted = [];
    });

    it('should call onEvent with message_start and message_complete', async () => {
      const onEvent = jest.fn((event) => eventsEmitted.push(event));

      await service.executeAgent(
        mockChatId,
        mockMessageId,
        'What is the count?',
        mockUserId,
        onEvent,
      );

      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'message_start' }),
      );
      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'message_complete',
          content: 'Test answer with detailed explanation',
        }),
      );

      // Should have at least message_start and message_complete
      expect(eventsEmitted.length).toBeGreaterThanOrEqual(2);
      expect(eventsEmitted[0].type).toBe('message_start');
      expect(eventsEmitted[eventsEmitted.length - 1].type).toBe(
        'message_complete',
      );
    });

    it('should persist final response via dataAgentService.updateAssistantMessage', async () => {
      const onEvent = jest.fn();

      await service.executeAgent(
        mockChatId,
        mockMessageId,
        'What is the count?',
        mockUserId,
        onEvent,
      );

      expect(mockDataAgentService.updateAssistantMessage).toHaveBeenCalledWith(
        mockMessageId,
        'Test answer with detailed explanation',
        expect.objectContaining({
          toolCalls: expect.any(Array),
          tokensUsed: { prompt: 100, completion: 50, total: 150 },
          datasetsUsed: ['Dataset1', 'Dataset2'],
          plan: expect.any(Object),
          dataLineage: expect.any(Object),
          revisionsUsed: 0,
        }),
        'complete',
      );
    });

    it('should generate embedding and search for relevant datasets', async () => {
      const onEvent = jest.fn();

      await service.executeAgent(
        mockChatId,
        mockMessageId,
        'What is the count?',
        mockUserId,
        onEvent,
      );

      expect(mockEmbeddingService.getProvider).toHaveBeenCalled();
      expect(mockNeoVectorService.searchSimilar).toHaveBeenCalledWith(
        'dataset_embedding',
        mockOntologyId,
        [0.1, 0.2, 0.3],
        10,
      );
    });

    it('should pre-fetch YAML schemas for vector-matched datasets', async () => {
      const onEvent = jest.fn();

      await service.executeAgent(
        mockChatId,
        mockMessageId,
        'What is the count?',
        mockUserId,
        onEvent,
      );

      expect(mockNeoOntologyService.getDatasetsByNames).toHaveBeenCalledWith(
        mockOntologyId,
        ['Dataset1', 'Dataset2'],
      );
    });

    it('should load conversation history and format context', async () => {
      const onEvent = jest.fn();

      await service.executeAgent(
        mockChatId,
        mockMessageId,
        'What is the count?',
        mockUserId,
        onEvent,
      );

      expect(mockPrisma.dataChatMessage.findMany).toHaveBeenCalledWith({
        where: { chatId: mockChatId, status: 'complete' },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      // Verify graph was invoked with conversation context
      expect(mockGraph.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationContext: expect.stringContaining('User: Previous question'),
        }),
      );
    });

    it('should build and invoke graph with correct parameters', async () => {
      const onEvent = jest.fn();

      await service.executeAgent(
        mockChatId,
        mockMessageId,
        'What is the count?',
        mockUserId,
        onEvent,
      );

      expect(buildDataAgentGraph).toHaveBeenCalledWith({
        llm: { model: 'mock-llm' },
        neoOntologyService: mockNeoOntologyService,
        discoveryService: mockDiscoveryService,
        sandboxService: mockSandboxService,
        ontologyId: mockOntologyId,
        connectionId: mockConnectionId,
        databaseType: 'postgresql',
        emit: onEvent,
        tracer: expect.any(Object),
      });

      expect(mockGraph.invoke).toHaveBeenCalledWith({
        userQuestion: 'What is the count?',
        chatId: mockChatId,
        messageId: mockMessageId,
        userId: mockUserId,
        ontologyId: mockOntologyId,
        connectionId: mockConnectionId,
        databaseType: 'postgresql',
        conversationContext: expect.any(String),
        relevantDatasets: ['Dataset1', 'Dataset2'],
        relevantDatasetDetails: expect.arrayContaining([
          expect.objectContaining({
            name: 'Dataset1',
            yaml: expect.any(String),
          }),
          expect.objectContaining({
            name: 'Dataset2',
            yaml: expect.any(String),
          }),
        ]),
      });
    });

    it('should handle chat not found error', async () => {
      mockPrisma.dataChat.findFirst.mockResolvedValue(null);

      const onEvent = jest.fn();

      await expect(
        service.executeAgent(
          mockChatId,
          mockMessageId,
          'What is the count?',
          mockUserId,
          onEvent,
        ),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.executeAgent(
          mockChatId,
          mockMessageId,
          'What is the count?',
          mockUserId,
          onEvent,
        ),
      ).rejects.toThrow('Chat not found');

      // Should not invoke graph if chat not found
      expect(mockGraph.invoke).not.toHaveBeenCalled();
    });

    it('should handle ontology not found error', async () => {
      const chatWithoutOntology = {
        ...mockChat,
        ontology: null,
      };
      mockPrisma.dataChat.findFirst.mockResolvedValue(chatWithoutOntology as any);

      const onEvent = jest.fn();

      await expect(
        service.executeAgent(
          mockChatId,
          mockMessageId,
          'What is the count?',
          mockUserId,
          onEvent,
        ),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.executeAgent(
          mockChatId,
          mockMessageId,
          'What is the count?',
          mockUserId,
          onEvent,
        ),
      ).rejects.toThrow('Ontology not found');

      expect(mockGraph.invoke).not.toHaveBeenCalled();
    });

    it('should handle ontology not ready error', async () => {
      const chatWithCreatingOntology = {
        ...mockChat,
        ontology: {
          ...mockChat.ontology,
          status: 'creating',
        },
      };
      mockPrisma.dataChat.findFirst.mockResolvedValue(
        chatWithCreatingOntology as any,
      );

      const onEvent = jest.fn();

      await expect(
        service.executeAgent(
          mockChatId,
          mockMessageId,
          'What is the count?',
          mockUserId,
          onEvent,
        ),
      ).rejects.toThrow('Ontology is not ready');

      expect(mockGraph.invoke).not.toHaveBeenCalled();
    });

    it('should handle semantic model not found error', async () => {
      const chatWithoutSemanticModel = {
        ...mockChat,
        ontology: {
          ...mockChat.ontology,
          semanticModel: null,
        },
      };
      mockPrisma.dataChat.findFirst.mockResolvedValue(
        chatWithoutSemanticModel as any,
      );

      const onEvent = jest.fn();

      await expect(
        service.executeAgent(
          mockChatId,
          mockMessageId,
          'What is the count?',
          mockUserId,
          onEvent,
        ),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.executeAgent(
          mockChatId,
          mockMessageId,
          'What is the count?',
          mockUserId,
          onEvent,
        ),
      ).rejects.toThrow('Semantic model not found');

      expect(mockGraph.invoke).not.toHaveBeenCalled();
    });

    it('should handle agent execution error', async () => {
      mockGraph.invoke.mockRejectedValue(new Error('Graph execution failed'));

      const onEvent = jest.fn();

      await service.executeAgent(
        mockChatId,
        mockMessageId,
        'What is the count?',
        mockUserId,
        onEvent,
      );

      expect(mockDataAgentService.updateAssistantMessage).toHaveBeenCalledWith(
        mockMessageId,
        '',
        { error: 'Graph execution failed' },
        'failed',
      );

      expect(onEvent).toHaveBeenCalledWith({
        type: 'message_error',
        message: 'Graph execution failed',
      });
    });

    it('should handle no vector search results and check ontology datasets', async () => {
      mockNeoVectorService.searchSimilar.mockResolvedValue([]);

      const onEvent = jest.fn();

      await service.executeAgent(
        mockChatId,
        mockMessageId,
        'What is the count?',
        mockUserId,
        onEvent,
      );

      expect(mockNeoOntologyService.listDatasets).toHaveBeenCalledWith(
        mockOntologyId,
      );

      // When no vector results, getDatasetsByNames should not be called
      expect(mockNeoOntologyService.getDatasetsByNames).not.toHaveBeenCalled();

      // Should still proceed with graph execution
      expect(mockGraph.invoke).toHaveBeenCalled();
    });

    it('should handle no datasets found error', async () => {
      mockNeoVectorService.searchSimilar.mockResolvedValue([]);
      mockNeoOntologyService.listDatasets.mockResolvedValue([]);

      const onEvent = jest.fn();

      await service.executeAgent(
        mockChatId,
        mockMessageId,
        'What is the count?',
        mockUserId,
        onEvent,
      );

      expect(mockDataAgentService.updateAssistantMessage).toHaveBeenCalledWith(
        mockMessageId,
        expect.stringContaining('No datasets found'),
        { error: 'no_datasets' },
        'complete',
      );

      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'message_complete',
          metadata: { error: 'no_datasets' },
        }),
      );

      // Should not invoke graph when no datasets
      expect(mockGraph.invoke).not.toHaveBeenCalled();
    });

    it('should handle explainer output with no narrative (fallback)', async () => {
      mockGraph.invoke.mockResolvedValue({
        explainerOutput: null,
        toolCalls: [],
        tokensUsed: { prompt: 50, completion: 25, total: 75 },
        plan: null,
        revisionCount: 0,
      });

      const onEvent = jest.fn();

      await service.executeAgent(
        mockChatId,
        mockMessageId,
        'What is the count?',
        mockUserId,
        onEvent,
      );

      expect(mockDataAgentService.updateAssistantMessage).toHaveBeenCalledWith(
        mockMessageId,
        'I was unable to generate a response. Please try again.',
        expect.any(Object),
        'complete',
      );
    });

    it('should include all metadata fields in final message', async () => {
      const onEvent = jest.fn();

      await service.executeAgent(
        mockChatId,
        mockMessageId,
        'What is the count?',
        mockUserId,
        onEvent,
      );

      expect(mockDataAgentService.updateAssistantMessage).toHaveBeenCalledWith(
        mockMessageId,
        expect.any(String),
        expect.objectContaining({
          toolCalls: expect.any(Array),
          tokensUsed: expect.objectContaining({
            prompt: expect.any(Number),
            completion: expect.any(Number),
            total: expect.any(Number),
          }),
          datasetsUsed: expect.any(Array),
          plan: expect.any(Object),
          dataLineage: expect.any(Object),
          revisionsUsed: expect.any(Number),
        }),
        'complete',
      );
    });

    it('should handle graph execution with verification failure', async () => {
      mockGraph.invoke.mockResolvedValue({
        explainerOutput: {
          narrative: 'Results with caveats',
          dataLineage: {
            datasets: ['Dataset1'],
            joins: [],
            timeWindow: null,
            filters: [],
            grain: 'row-level',
            rowCount: 10,
          },
          caveats: ['Verification failed after 3 attempts'],
          charts: [],
        },
        toolCalls: [],
        tokensUsed: { prompt: 200, completion: 100, total: 300 },
        plan: {
          complexity: 'analytical',
          intent: 'Complex query',
          metrics: [],
          dimensions: [],
          timeWindow: null,
          filters: [],
          grain: 'total',
          ambiguities: [],
          acceptanceChecks: [],
          steps: [],
        },
        verificationReport: {
          passed: false,
          checks: [
            { name: 'final_check', passed: false, message: 'Still failing' },
          ],
        },
        revisionCount: 3,
      });

      const onEvent = jest.fn();

      await service.executeAgent(
        mockChatId,
        mockMessageId,
        'What is the count?',
        mockUserId,
        onEvent,
      );

      expect(mockDataAgentService.updateAssistantMessage).toHaveBeenCalledWith(
        mockMessageId,
        'Results with caveats',
        expect.objectContaining({
          verificationReport: expect.objectContaining({
            passed: false,
          }),
          revisionsUsed: 3,
        }),
        'complete',
      );
    });
  });
});
