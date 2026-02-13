// Mock createReactAgent before importing
const mockStream = jest.fn();
const mockAgent = { stream: mockStream };
jest.mock('@langchain/langgraph/prebuilt', () => ({
  createReactAgent: jest.fn(() => mockAgent),
}), { virtual: true });

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

// Helper to create async iterable for agent.stream()
async function* makeStream(updates: any[]) {
  for (const update of updates) {
    yield update;
  }
}

describe('DataAgentAgentService', () => {
  let service: DataAgentAgentService;
  let prisma: PrismaService;
  let llmService: LlmService;
  let embeddingService: EmbeddingService;
  let neoVectorService: NeoVectorService;
  let neoOntologyService: NeoOntologyService;
  let discoveryService: DiscoveryService;
  let sandboxService: SandboxService;
  let dataAgentService: DataAgentService;

  const mockUserId = 'user-123';
  const mockChatId = 'chat-123';
  const mockMessageId = 'msg-123';
  const mockOntologyId = 'ontology-123';
  const mockConnectionId = 'conn-123';

  const mockChat = {
    id: mockChatId,
    ownerId: mockUserId,
    ontology: {
      id: mockOntologyId,
      status: 'ready',
      semanticModel: {
        id: 'sm-123',
        connectionId: mockConnectionId,
        connection: { id: mockConnectionId, dbType: 'PostgreSQL' },
      },
    },
  };

  const mockDatasets = [
    { name: 'customers', description: 'Customer data', yaml: 'name: customers', score: 0.9 },
    { name: 'orders', description: 'Order data', yaml: 'name: orders', score: 0.8 },
  ];

  const mockEmbeddingProvider = {
    generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  };

  const mockLlmModel = {
    invoke: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataAgentAgentService,
        {
          provide: PrismaService,
          useValue: {
            dataChat: {
              findFirst: jest.fn(),
            },
            dataChatMessage: {
              findMany: jest.fn(),
            },
          },
        },
        {
          provide: LlmService,
          useValue: {
            getChatModel: jest.fn(),
          },
        },
        {
          provide: EmbeddingService,
          useValue: {
            getProvider: jest.fn(),
          },
        },
        {
          provide: NeoVectorService,
          useValue: {
            searchSimilar: jest.fn(),
          },
        },
        {
          provide: NeoOntologyService,
          useValue: {
            listDatasets: jest.fn(),
            getDatasetRelationships: jest.fn(),
          },
        },
        {
          provide: DiscoveryService,
          useValue: {},
        },
        {
          provide: SandboxService,
          useValue: {},
        },
        {
          provide: DataAgentService,
          useValue: {
            updateAssistantMessage: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DataAgentAgentService>(DataAgentAgentService);
    prisma = module.get<PrismaService>(PrismaService);
    llmService = module.get<LlmService>(LlmService);
    embeddingService = module.get<EmbeddingService>(EmbeddingService);
    neoVectorService = module.get<NeoVectorService>(NeoVectorService);
    neoOntologyService = module.get<NeoOntologyService>(NeoOntologyService);
    discoveryService = module.get<DiscoveryService>(DiscoveryService);
    sandboxService = module.get<SandboxService>(SandboxService);
    dataAgentService = module.get<DataAgentService>(DataAgentService);

    // Default mocks
    (prisma.dataChat.findFirst as jest.Mock).mockResolvedValue(mockChat);
    (prisma.dataChatMessage.findMany as jest.Mock).mockResolvedValue([]);
    (embeddingService.getProvider as jest.Mock).mockReturnValue(mockEmbeddingProvider);
    (neoVectorService.searchSimilar as jest.Mock).mockResolvedValue(mockDatasets);
    (neoOntologyService.listDatasets as jest.Mock).mockResolvedValue([
      { name: 'customers', description: 'Customer data', source: '' },
    ]);
    (neoOntologyService.getDatasetRelationships as jest.Mock).mockResolvedValue([]);
    (llmService.getChatModel as jest.Mock).mockReturnValue(mockLlmModel);
    (dataAgentService.updateAssistantMessage as jest.Mock).mockResolvedValue(undefined);

    // Default successful stream
    mockStream.mockReturnValue(makeStream([
      {
        agent: {
          messages: [
            {
              _getType: () => 'ai',
              tool_calls: [{ id: 'tc-1', name: 'query_database', args: { sql: 'SELECT 1' } }],
              content: '',
              usage_metadata: { input_tokens: 100, output_tokens: 50 },
            },
          ],
        },
      },
      {
        tools: {
          messages: [
            {
              _getType: () => 'tool',
              content: '1 rows returned',
              tool_call_id: 'tc-1',
            },
          ],
        },
      },
      {
        agent: {
          messages: [
            {
              _getType: () => 'ai',
              tool_calls: [],
              content: 'The answer is 1.',
              usage_metadata: { input_tokens: 200, output_tokens: 100 },
            },
          ],
        },
      },
    ]));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('executeAgent', () => {
    const userQuestion = 'How many customers are there?';
    const onEvent = jest.fn();

    it('should search with top-K of 10', async () => {
      await service.executeAgent(mockChatId, mockMessageId, userQuestion, mockUserId, onEvent);

      expect(neoVectorService.searchSimilar).toHaveBeenCalledWith(
        'dataset_embedding',
        mockOntologyId,
        expect.any(Array),
        10,
      );
    });

    it('should fallback to listDatasets when vector search returns empty', async () => {
      (neoVectorService.searchSimilar as jest.Mock).mockResolvedValue([]);
      (neoOntologyService.listDatasets as jest.Mock).mockResolvedValue([
        { name: 'customers', description: 'Customer data', source: '' },
      ]);

      await service.executeAgent(mockChatId, mockMessageId, userQuestion, mockUserId, onEvent);

      expect(neoOntologyService.listDatasets).toHaveBeenCalledWith(mockOntologyId);
      expect(mockStream).toHaveBeenCalled();
    });

    it('should fail when ontology has no datasets at all', async () => {
      (neoVectorService.searchSimilar as jest.Mock).mockResolvedValue([]);
      (neoOntologyService.listDatasets as jest.Mock).mockResolvedValue([]);

      await service.executeAgent(mockChatId, mockMessageId, userQuestion, mockUserId, onEvent);

      expect(dataAgentService.updateAssistantMessage).toHaveBeenCalledWith(
        mockMessageId,
        expect.stringContaining('No datasets found'),
        expect.objectContaining({ error: 'no_datasets' }),
        'complete',
      );
      expect(mockStream).not.toHaveBeenCalled();
    });

    it('should set recursionLimit to 30', async () => {
      await service.executeAgent(mockChatId, mockMessageId, userQuestion, mockUserId, onEvent);

      expect(mockStream).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ recursionLimit: 30 }),
      );
    });

    it('should create 5 tools including list_datasets', async () => {
      const { createReactAgent } = require('@langchain/langgraph/prebuilt');

      await service.executeAgent(mockChatId, mockMessageId, userQuestion, mockUserId, onEvent);

      const createReactAgentCalls = (createReactAgent as jest.Mock).mock.calls;
      expect(createReactAgentCalls.length).toBeGreaterThan(0);

      const toolsArg = createReactAgentCalls[createReactAgentCalls.length - 1][0].tools;
      expect(toolsArg).toHaveLength(5);
    });

    it('should fetch relationships for relevant datasets', async () => {
      await service.executeAgent(mockChatId, mockMessageId, userQuestion, mockUserId, onEvent);

      expect(neoOntologyService.getDatasetRelationships).toHaveBeenCalledWith(
        mockOntologyId,
        ['customers', 'orders'],
      );
    });

    it('should match tool results by tool_call_id', async () => {
      const events: any[] = [];
      const testOnEvent = (e: any) => events.push(e);

      await service.executeAgent(mockChatId, mockMessageId, userQuestion, mockUserId, testOnEvent);

      const toolCallEvent = events.find(e => e.type === 'tool_call');
      const toolResultEvent = events.find(e => e.type === 'tool_result');

      expect(toolCallEvent).toBeDefined();
      expect(toolCallEvent.name).toBe('query_database');
      expect(toolResultEvent).toBeDefined();
      expect(toolResultEvent.name).toBe('query_database');
    });

    it('should persist tool call results in metadata', async () => {
      await service.executeAgent(mockChatId, mockMessageId, userQuestion, mockUserId, onEvent);

      expect(dataAgentService.updateAssistantMessage).toHaveBeenCalledWith(
        mockMessageId,
        expect.any(String),
        expect.objectContaining({
          toolCalls: expect.arrayContaining([
            expect.objectContaining({
              name: 'query_database',
              result: expect.any(String),
            }),
          ]),
        }),
        'complete',
      );
    });

    it('should include conversation history with tool context', async () => {
      const previousMessages = [
        {
          id: 'prev-1',
          chatId: mockChatId,
          role: 'user',
          content: 'What is the total revenue?',
          status: 'complete',
          createdAt: new Date('2026-01-01'),
          metadata: null,
        },
        {
          id: 'prev-2',
          chatId: mockChatId,
          role: 'assistant',
          content: 'The total revenue is $1000.',
          status: 'complete',
          createdAt: new Date('2026-01-02'),
          metadata: {
            toolCalls: [
              {
                name: 'query_database',
                args: { sql: 'SELECT SUM(amount) FROM orders' },
                result: 'Total: 1000',
              },
            ],
          },
        },
      ];

      (prisma.dataChatMessage.findMany as jest.Mock).mockResolvedValue(previousMessages);

      await service.executeAgent(mockChatId, mockMessageId, userQuestion, mockUserId, onEvent);

      // Verify that conversation history was loaded
      expect(prisma.dataChatMessage.findMany).toHaveBeenCalledWith({
        where: { chatId: mockChatId, status: 'complete' },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      // The system prompt builder is called with conversation context
      // We can't directly verify the prompt content, but we can verify the agent was created
      expect(mockStream).toHaveBeenCalled();
    });

    it('should emit message_start event at beginning', async () => {
      const events: any[] = [];
      const testOnEvent = (e: any) => events.push(e);

      await service.executeAgent(mockChatId, mockMessageId, userQuestion, mockUserId, testOnEvent);

      expect(events[0]).toEqual({ type: 'message_start' });
    });

    it('should emit tool_call events for each tool invocation', async () => {
      const events: any[] = [];
      const testOnEvent = (e: any) => events.push(e);

      await service.executeAgent(mockChatId, mockMessageId, userQuestion, mockUserId, testOnEvent);

      const toolCallEvents = events.filter(e => e.type === 'tool_call');
      expect(toolCallEvents.length).toBeGreaterThan(0);
      expect(toolCallEvents[0]).toMatchObject({
        type: 'tool_call',
        name: 'query_database',
        args: expect.any(Object),
      });
    });

    it('should emit tool_result events for each tool result', async () => {
      const events: any[] = [];
      const testOnEvent = (e: any) => events.push(e);

      await service.executeAgent(mockChatId, mockMessageId, userQuestion, mockUserId, testOnEvent);

      const toolResultEvents = events.filter(e => e.type === 'tool_result');
      expect(toolResultEvents.length).toBeGreaterThan(0);
      expect(toolResultEvents[0]).toMatchObject({
        type: 'tool_result',
        name: 'query_database',
        result: expect.any(String),
      });
    });

    it('should emit text event with final response', async () => {
      const events: any[] = [];
      const testOnEvent = (e: any) => events.push(e);

      await service.executeAgent(mockChatId, mockMessageId, userQuestion, mockUserId, testOnEvent);

      const textEvents = events.filter(e => e.type === 'text');
      expect(textEvents.length).toBeGreaterThan(0);
      expect(textEvents[0].content).toBe('The answer is 1.');
    });

    it('should emit token_update event with usage', async () => {
      const events: any[] = [];
      const testOnEvent = (e: any) => events.push(e);

      await service.executeAgent(mockChatId, mockMessageId, userQuestion, mockUserId, testOnEvent);

      const tokenUpdateEvent = events.find(e => e.type === 'token_update');
      expect(tokenUpdateEvent).toBeDefined();
      expect(tokenUpdateEvent.tokensUsed).toEqual({
        prompt: 300, // 100 + 200
        completion: 150, // 50 + 100
        total: 450,
      });
    });

    it('should emit message_complete event at end', async () => {
      const events: any[] = [];
      const testOnEvent = (e: any) => events.push(e);

      await service.executeAgent(mockChatId, mockMessageId, userQuestion, mockUserId, testOnEvent);

      const messageCompleteEvent = events.find(e => e.type === 'message_complete');
      expect(messageCompleteEvent).toBeDefined();
      expect(messageCompleteEvent).toMatchObject({
        type: 'message_complete',
        content: 'The answer is 1.',
        metadata: expect.objectContaining({
          toolCalls: expect.any(Array),
          tokensUsed: expect.any(Object),
        }),
      });
    });

    it('should handle agent errors gracefully', async () => {
      const events: any[] = [];
      const testOnEvent = (e: any) => events.push(e);
      const errorMessage = 'LLM connection failed';

      mockStream.mockImplementation(() => {
        throw new Error(errorMessage);
      });

      await service.executeAgent(mockChatId, mockMessageId, userQuestion, mockUserId, testOnEvent);

      expect(dataAgentService.updateAssistantMessage).toHaveBeenCalledWith(
        mockMessageId,
        '',
        expect.objectContaining({ error: errorMessage }),
        'failed',
      );

      const errorEvent = events.find(e => e.type === 'message_error');
      expect(errorEvent).toBeDefined();
      expect(errorEvent.message).toBe(errorMessage);
    });

    it('should throw NotFoundException when chat not found', async () => {
      (prisma.dataChat.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.executeAgent(mockChatId, mockMessageId, userQuestion, mockUserId, onEvent),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.executeAgent(mockChatId, mockMessageId, userQuestion, mockUserId, onEvent),
      ).rejects.toThrow('Chat not found');
    });

    it('should throw NotFoundException when ontology not found', async () => {
      (prisma.dataChat.findFirst as jest.Mock).mockResolvedValue({
        ...mockChat,
        ontology: null,
      });

      await expect(
        service.executeAgent(mockChatId, mockMessageId, userQuestion, mockUserId, onEvent),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.executeAgent(mockChatId, mockMessageId, userQuestion, mockUserId, onEvent),
      ).rejects.toThrow('Ontology not found');
    });

    it('should throw error when ontology is not ready', async () => {
      (prisma.dataChat.findFirst as jest.Mock).mockResolvedValue({
        ...mockChat,
        ontology: {
          ...mockChat.ontology,
          status: 'creating',
        },
      });

      await expect(
        service.executeAgent(mockChatId, mockMessageId, userQuestion, mockUserId, onEvent),
      ).rejects.toThrow('Ontology is not ready');
    });

    it('should throw NotFoundException when semantic model not found', async () => {
      (prisma.dataChat.findFirst as jest.Mock).mockResolvedValue({
        ...mockChat,
        ontology: {
          ...mockChat.ontology,
          semanticModel: null,
        },
      });

      await expect(
        service.executeAgent(mockChatId, mockMessageId, userQuestion, mockUserId, onEvent),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.executeAgent(mockChatId, mockMessageId, userQuestion, mockUserId, onEvent),
      ).rejects.toThrow('Semantic model not found');
    });

    it('should skip relationships when no relevant datasets found', async () => {
      (neoVectorService.searchSimilar as jest.Mock).mockResolvedValue([]);
      (neoOntologyService.listDatasets as jest.Mock).mockResolvedValue([
        { name: 'customers', description: '', source: '' },
      ]);

      await service.executeAgent(mockChatId, mockMessageId, userQuestion, mockUserId, onEvent);

      // Should not call getDatasetRelationships when datasetNames is empty
      expect(neoOntologyService.getDatasetRelationships).not.toHaveBeenCalled();
    });

    it('should truncate tool results to 2000 characters', async () => {
      const longResult = 'x'.repeat(3000);
      mockStream.mockReturnValue(makeStream([
        {
          agent: {
            messages: [
              {
                _getType: () => 'ai',
                tool_calls: [{ id: 'tc-1', name: 'query_database', args: { sql: 'SELECT 1' } }],
                content: '',
                usage_metadata: { input_tokens: 100, output_tokens: 50 },
              },
            ],
          },
        },
        {
          tools: {
            messages: [
              {
                _getType: () => 'tool',
                content: longResult,
                tool_call_id: 'tc-1',
              },
            ],
          },
        },
        {
          agent: {
            messages: [
              {
                _getType: () => 'ai',
                tool_calls: [],
                content: 'Done.',
                usage_metadata: { input_tokens: 200, output_tokens: 100 },
              },
            ],
          },
        },
      ]));

      const events: any[] = [];
      const testOnEvent = (e: any) => events.push(e);

      await service.executeAgent(mockChatId, mockMessageId, userQuestion, mockUserId, testOnEvent);

      const toolResultEvent = events.find(e => e.type === 'tool_result');
      expect(toolResultEvent.result).toHaveLength(2000);
    });

    it('should handle multiple tool calls in parallel', async () => {
      mockStream.mockReturnValue(makeStream([
        {
          agent: {
            messages: [
              {
                _getType: () => 'ai',
                tool_calls: [
                  { id: 'tc-1', name: 'query_database', args: { sql: 'SELECT 1' } },
                  { id: 'tc-2', name: 'get_dataset_details', args: { datasetName: 'customers' } },
                ],
                content: '',
                usage_metadata: { input_tokens: 100, output_tokens: 50 },
              },
            ],
          },
        },
        {
          tools: {
            messages: [
              {
                _getType: () => 'tool',
                content: '1 rows',
                tool_call_id: 'tc-1',
              },
              {
                _getType: () => 'tool',
                content: 'Dataset: customers',
                tool_call_id: 'tc-2',
              },
            ],
          },
        },
        {
          agent: {
            messages: [
              {
                _getType: () => 'ai',
                tool_calls: [],
                content: 'Found 1 customer.',
                usage_metadata: { input_tokens: 200, output_tokens: 100 },
              },
            ],
          },
        },
      ]));

      const events: any[] = [];
      const testOnEvent = (e: any) => events.push(e);

      await service.executeAgent(mockChatId, mockMessageId, userQuestion, mockUserId, testOnEvent);

      const toolCallEvents = events.filter(e => e.type === 'tool_call');
      const toolResultEvents = events.filter(e => e.type === 'tool_result');

      expect(toolCallEvents).toHaveLength(2);
      expect(toolResultEvents).toHaveLength(2);

      // Verify correct matching by tool_call_id
      expect(toolResultEvents[0].name).toBe('query_database');
      expect(toolResultEvents[1].name).toBe('get_dataset_details');
    });

    it('should provide default response when agent produces no final content', async () => {
      mockStream.mockReturnValue(makeStream([
        {
          agent: {
            messages: [
              {
                _getType: () => 'ai',
                tool_calls: [],
                content: '',
                usage_metadata: { input_tokens: 100, output_tokens: 50 },
              },
            ],
          },
        },
      ]));

      await service.executeAgent(mockChatId, mockMessageId, userQuestion, mockUserId, onEvent);

      expect(dataAgentService.updateAssistantMessage).toHaveBeenCalledWith(
        mockMessageId,
        'I was unable to generate a response. Please try again.',
        expect.any(Object),
        'complete',
      );
    });
  });
});
