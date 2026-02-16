import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { DataAgentService } from './data-agent.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  createMockPrismaService,
  MockPrismaService,
} from '../../test/mocks/prisma.mock';
import { CreateChatDto } from './dto/create-chat.dto';
import { UpdateChatDto } from './dto/update-chat.dto';
import { ChatQueryDto } from './dto/chat-query.dto';

describe('DataAgentService', () => {
  let service: DataAgentService;
  let mockPrisma: MockPrismaService;

  const mockUserId = 'user-123';
  const mockOntologyId = 'ontology-123';
  const mockChatId = 'chat-123';

  const mockOntology = {
    id: mockOntologyId,
    name: 'Test Ontology',
    status: 'ready',
    createdByUserId: mockUserId,
    semanticModelId: 'model-123',
    semanticModel: {
      createdByUserId: mockUserId,
    },
  };

  const mockChat = {
    id: mockChatId,
    name: 'Test Chat',
    ontologyId: mockOntologyId,
    ownerId: mockUserId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockMessage = {
    id: 'msg-123',
    chatId: mockChatId,
    role: 'user',
    content: 'Hello',
    status: 'complete',
    metadata: {},
    createdAt: new Date(),
  };

  beforeEach(async () => {
    mockPrisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataAgentService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<DataAgentService>(DataAgentService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createChat', () => {
    it('should create chat when ontology exists and is ready', async () => {
      const dto: CreateChatDto = {
        name: 'New Chat',
        ontologyId: mockOntologyId,
      };

      mockPrisma.ontology.findFirst.mockResolvedValue(mockOntology as any);
      mockPrisma.dataChat.create.mockResolvedValue(mockChat as any);

      const result = await service.createChat(dto, mockUserId);

      expect(result).toEqual(mockChat);
      expect(mockPrisma.ontology.findFirst).toHaveBeenCalledWith({
        where: {
          id: mockOntologyId,
        },
        include: {
          semanticModel: true,
        },
      });
      expect(mockPrisma.dataChat.create).toHaveBeenCalledWith({
        data: {
          name: 'New Chat',
          ontologyId: mockOntologyId,
          ownerId: mockUserId,
          llmProvider: null,
        },
      });
    });

    it('should create chat with llmProvider when specified', async () => {
      const dto: CreateChatDto = {
        name: 'New Chat',
        ontologyId: mockOntologyId,
        llmProvider: 'anthropic',
      };

      mockPrisma.ontology.findFirst.mockResolvedValue(mockOntology as any);
      mockPrisma.dataChat.create.mockResolvedValue({
        ...mockChat,
        llmProvider: 'anthropic',
      } as any);

      const result = await service.createChat(dto, mockUserId);

      expect(result.llmProvider).toBe('anthropic');
      expect(mockPrisma.dataChat.create).toHaveBeenCalledWith({
        data: {
          name: 'New Chat',
          ontologyId: mockOntologyId,
          ownerId: mockUserId,
          llmProvider: 'anthropic',
        },
      });
    });

    it('should throw NotFoundException when ontology not found', async () => {
      const dto: CreateChatDto = {
        name: 'New Chat',
        ontologyId: 'nonexistent-id',
      };

      mockPrisma.ontology.findFirst.mockResolvedValue(null);

      await expect(service.createChat(dto, mockUserId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.createChat(dto, mockUserId)).rejects.toThrow(
        'Ontology with ID nonexistent-id not found',
      );

      expect(mockPrisma.dataChat.create).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when ontology not ready', async () => {
      const dto: CreateChatDto = {
        name: 'New Chat',
        ontologyId: mockOntologyId,
      };

      const creatingOntology = {
        ...mockOntology,
        status: 'creating',
      };

      mockPrisma.ontology.findFirst.mockResolvedValue(creatingOntology as any);

      await expect(service.createChat(dto, mockUserId)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.createChat(dto, mockUserId)).rejects.toThrow(
        'Ontology must be in ready status',
      );

      expect(mockPrisma.dataChat.create).not.toHaveBeenCalled();
    });
  });

  describe('findChats', () => {
    it('should return paginated chats with search', async () => {
      const query: ChatQueryDto = {
        page: 1,
        pageSize: 20,
        search: 'test',
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      };

      const mockChats = [
        {
          ...mockChat,
          ontology: { name: 'Test Ontology', status: 'ready' },
        },
      ];

      mockPrisma.dataChat.findMany.mockResolvedValue(mockChats as any);
      mockPrisma.dataChat.count.mockResolvedValue(1);

      const result = await service.findChats(query, mockUserId);

      expect(result).toEqual({
        items: mockChats,
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });

      expect(mockPrisma.dataChat.findMany).toHaveBeenCalledWith({
        where: {
          ownerId: mockUserId,
          name: { contains: 'test', mode: 'insensitive' },
        },
        skip: 0,
        take: 20,
        orderBy: { updatedAt: 'desc' },
        include: {
          ontology: {
            select: {
              name: true,
              status: true,
            },
          },
        },
      });
    });

    it('should return empty results when no chats found', async () => {
      const query: ChatQueryDto = {
        page: 1,
        pageSize: 20,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      };

      mockPrisma.dataChat.findMany.mockResolvedValue([]);
      mockPrisma.dataChat.count.mockResolvedValue(0);

      const result = await service.findChats(query, mockUserId);

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });

    it('should filter by ontologyId when provided', async () => {
      const query: ChatQueryDto = {
        page: 1,
        pageSize: 20,
        ontologyId: mockOntologyId,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      };

      mockPrisma.dataChat.findMany.mockResolvedValue([]);
      mockPrisma.dataChat.count.mockResolvedValue(0);

      await service.findChats(query, mockUserId);

      expect(mockPrisma.dataChat.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ontologyId: mockOntologyId,
          }),
        }),
      );
    });
  });

  describe('findChatById', () => {
    it('should return chat with messages', async () => {
      const chatWithMessages = {
        ...mockChat,
        messages: [mockMessage],
        ontology: { name: 'Test Ontology', status: 'ready' },
      };

      mockPrisma.dataChat.findFirst.mockResolvedValue(chatWithMessages as any);

      const result = await service.findChatById(mockChatId, mockUserId);

      expect(result).toEqual(chatWithMessages);
      expect(mockPrisma.dataChat.findFirst).toHaveBeenCalledWith({
        where: {
          id: mockChatId,
          ownerId: mockUserId,
        },
        include: {
          messages: {
            orderBy: {
              createdAt: 'asc',
            },
          },
          ontology: {
            select: {
              name: true,
              status: true,
            },
          },
        },
      });
    });

    it('should throw NotFoundException when chat not found', async () => {
      mockPrisma.dataChat.findFirst.mockResolvedValue(null);

      await expect(
        service.findChatById('nonexistent-id', mockUserId),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.findChatById('nonexistent-id', mockUserId),
      ).rejects.toThrow('Chat with ID nonexistent-id not found');
    });
  });

  describe('updateChat', () => {
    it('should rename chat', async () => {
      const dto: UpdateChatDto = {
        name: 'Renamed Chat',
      };

      const updatedChat = {
        ...mockChat,
        name: 'Renamed Chat',
        updatedAt: new Date(),
      };

      mockPrisma.dataChat.findFirst.mockResolvedValue(mockChat as any);
      mockPrisma.dataChat.update.mockResolvedValue(updatedChat as any);

      const result = await service.updateChat(mockChatId, dto, mockUserId);

      expect(result.name).toBe('Renamed Chat');
      expect(mockPrisma.dataChat.update).toHaveBeenCalledWith({
        where: { id: mockChatId },
        data: {
          name: 'Renamed Chat',
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should update llmProvider', async () => {
      const dto: UpdateChatDto = {
        llmProvider: 'openai',
      };

      const updatedChat = {
        ...mockChat,
        llmProvider: 'openai',
        updatedAt: new Date(),
      };

      mockPrisma.dataChat.findFirst.mockResolvedValue(mockChat as any);
      mockPrisma.dataChat.update.mockResolvedValue(updatedChat as any);

      const result = await service.updateChat(mockChatId, dto, mockUserId);

      expect(result.llmProvider).toBe('openai');
      expect(mockPrisma.dataChat.update).toHaveBeenCalledWith({
        where: { id: mockChatId },
        data: {
          llmProvider: 'openai',
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should clear llmProvider when set to null', async () => {
      const dto: UpdateChatDto = {
        llmProvider: null,
      };

      const updatedChat = {
        ...mockChat,
        llmProvider: null,
        updatedAt: new Date(),
      };

      mockPrisma.dataChat.findFirst.mockResolvedValue({
        ...mockChat,
        llmProvider: 'anthropic',
      } as any);
      mockPrisma.dataChat.update.mockResolvedValue(updatedChat as any);

      const result = await service.updateChat(mockChatId, dto, mockUserId);

      expect(result.llmProvider).toBeNull();
      expect(mockPrisma.dataChat.update).toHaveBeenCalledWith({
        where: { id: mockChatId },
        data: {
          llmProvider: null,
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should update both name and llmProvider', async () => {
      const dto: UpdateChatDto = {
        name: 'New Name',
        llmProvider: 'anthropic',
      };

      const updatedChat = {
        ...mockChat,
        name: 'New Name',
        llmProvider: 'anthropic',
        updatedAt: new Date(),
      };

      mockPrisma.dataChat.findFirst.mockResolvedValue(mockChat as any);
      mockPrisma.dataChat.update.mockResolvedValue(updatedChat as any);

      const result = await service.updateChat(mockChatId, dto, mockUserId);

      expect(result.name).toBe('New Name');
      expect(result.llmProvider).toBe('anthropic');
      expect(mockPrisma.dataChat.update).toHaveBeenCalledWith({
        where: { id: mockChatId },
        data: {
          name: 'New Name',
          llmProvider: 'anthropic',
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should throw NotFoundException when chat not found', async () => {
      const dto: UpdateChatDto = {
        name: 'Renamed Chat',
      };

      mockPrisma.dataChat.findFirst.mockResolvedValue(null);

      await expect(
        service.updateChat('nonexistent-id', dto, mockUserId),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.updateChat('nonexistent-id', dto, mockUserId),
      ).rejects.toThrow('Chat with ID nonexistent-id not found');

      expect(mockPrisma.dataChat.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteChat', () => {
    it('should delete chat and cascade messages', async () => {
      mockPrisma.dataChat.findFirst.mockResolvedValue(mockChat as any);
      mockPrisma.dataChat.delete.mockResolvedValue(mockChat as any);

      await service.deleteChat(mockChatId, mockUserId);

      expect(mockPrisma.dataChat.delete).toHaveBeenCalledWith({
        where: { id: mockChatId },
      });
    });

    it('should throw NotFoundException when chat not found', async () => {
      mockPrisma.dataChat.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteChat('nonexistent-id', mockUserId),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.deleteChat('nonexistent-id', mockUserId),
      ).rejects.toThrow('Chat with ID nonexistent-id not found');

      expect(mockPrisma.dataChat.delete).not.toHaveBeenCalled();
    });
  });

  describe('createMessagePair', () => {
    it('should create user and assistant messages in transaction', async () => {
      const userMessage = {
        id: 'user-msg-123',
        chatId: mockChatId,
        role: 'user',
        content: 'Test question',
        status: 'complete',
        metadata: {},
        createdAt: new Date(),
      };

      const assistantMessage = {
        id: 'asst-msg-123',
        chatId: mockChatId,
        role: 'assistant',
        content: '',
        status: 'generating',
        metadata: {},
        createdAt: new Date(),
      };

      mockPrisma.dataChat.findFirst.mockResolvedValue(mockChat as any);
      mockPrisma.$transaction.mockResolvedValue([
        userMessage,
        assistantMessage,
      ] as any);
      mockPrisma.dataChat.update.mockResolvedValue(mockChat as any);

      const result = await service.createMessagePair(
        mockChatId,
        'Test question',
        mockUserId,
      );

      expect(result.userMessage).toEqual(userMessage);
      expect(result.assistantMessage).toEqual(assistantMessage);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.dataChat.update).toHaveBeenCalledWith({
        where: { id: mockChatId },
        data: { updatedAt: expect.any(Date) },
      });
    });

    it('should touch chat updatedAt', async () => {
      mockPrisma.dataChat.findFirst.mockResolvedValue(mockChat as any);
      mockPrisma.$transaction.mockResolvedValue([{}, {}] as any);
      mockPrisma.dataChat.update.mockResolvedValue(mockChat as any);

      await service.createMessagePair(mockChatId, 'Test', mockUserId);

      expect(mockPrisma.dataChat.update).toHaveBeenCalledWith({
        where: { id: mockChatId },
        data: { updatedAt: expect.any(Date) },
      });
    });
  });

  describe('claimMessage', () => {
    it('should claim generating message', async () => {
      mockPrisma.dataChatMessage.updateMany.mockResolvedValue({ count: 1 } as any);

      const result = await service.claimMessage('msg-123');

      expect(result).toBe(true);
      expect(mockPrisma.dataChatMessage.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'msg-123',
          status: 'generating',
          metadata: {
            equals: {},
          },
        },
        data: {
          metadata: {
            claimed: true,
          },
        },
      });
    });

    it('should return false when already claimed', async () => {
      mockPrisma.dataChatMessage.updateMany.mockResolvedValue({ count: 0 } as any);

      const result = await service.claimMessage('msg-123');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockPrisma.dataChatMessage.updateMany.mockRejectedValue(
        new Error('DB error'),
      );

      const result = await service.claimMessage('msg-123');

      expect(result).toBe(false);
    });
  });

  describe('getChatMessages', () => {
    it('should return messages in order', async () => {
      const messages = [
        { ...mockMessage, id: 'msg-1', createdAt: new Date('2024-01-01') },
        { ...mockMessage, id: 'msg-2', createdAt: new Date('2024-01-02') },
      ];

      mockPrisma.dataChatMessage.findMany.mockResolvedValue(messages as any);

      const result = await service.getChatMessages(mockChatId);

      expect(result).toEqual(messages);
      expect(mockPrisma.dataChatMessage.findMany).toHaveBeenCalledWith({
        where: { chatId: mockChatId },
        orderBy: { createdAt: 'asc' },
      });
    });
  });

  describe('persistTraces', () => {
    it('persists traces using prisma.llmTrace.createMany', async () => {
      const messageId = 'msg-456';
      const traces = [
        {
          phase: 'planner',
          callIndex: 0,
          stepId: 1,
          purpose: 'Generate plan',
          provider: 'openai',
          model: 'gpt-4',
          temperature: 0.7,
          structuredOutput: true,
          promptMessages: [
            { role: 'system', content: 'System prompt' },
            { role: 'human', content: 'User question' },
          ],
          responseContent: 'Plan response',
          toolCalls: [{ name: 'get_sample_data', args: { table: 'users' } }],
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          startedAt: 1000,
          completedAt: 2000,
          durationMs: 1000,
        },
        {
          phase: 'navigator',
          callIndex: 1,
          stepId: undefined,
          purpose: 'Find datasets',
          provider: 'openai',
          model: 'gpt-4',
          temperature: undefined,
          structuredOutput: false,
          promptMessages: [{ role: 'human', content: 'Find datasets' }],
          responseContent: 'Navigator response',
          toolCalls: undefined,
          promptTokens: 80,
          completionTokens: 40,
          totalTokens: 120,
          startedAt: 3000,
          completedAt: 4000,
          durationMs: 1000,
          error: undefined,
        },
      ];

      mockPrisma.llmTrace.createMany.mockResolvedValue({ count: 2 } as any);

      await service.persistTraces(messageId, traces as any);

      expect(mockPrisma.llmTrace.createMany).toHaveBeenCalledWith({
        data: [
          {
            messageId,
            phase: 'planner',
            callIndex: 0,
            stepId: 1,
            purpose: 'Generate plan',
            provider: 'openai',
            model: 'gpt-4',
            temperature: 0.7,
            structuredOutput: true,
            promptMessages: [
              { role: 'system', content: 'System prompt' },
              { role: 'human', content: 'User question' },
            ],
            responseContent: 'Plan response',
            toolCalls: [{ name: 'get_sample_data', args: { table: 'users' } }],
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
            startedAt: new Date(1000),
            completedAt: new Date(2000),
            durationMs: 1000,
            error: null,
          },
          {
            messageId,
            phase: 'navigator',
            callIndex: 1,
            stepId: null,
            purpose: 'Find datasets',
            provider: 'openai',
            model: 'gpt-4',
            temperature: null,
            structuredOutput: false,
            promptMessages: [{ role: 'human', content: 'Find datasets' }],
            responseContent: 'Navigator response',
            toolCalls: undefined,
            promptTokens: 80,
            completionTokens: 40,
            totalTokens: 120,
            startedAt: new Date(3000),
            completedAt: new Date(4000),
            durationMs: 1000,
            error: null,
          },
        ],
      });
    });

    it('does nothing when traces array is empty', async () => {
      const messageId = 'msg-789';

      await service.persistTraces(messageId, []);

      expect(mockPrisma.llmTrace.createMany).not.toHaveBeenCalled();
    });
  });

  describe('getMessageTraces', () => {
    const mockMessageId = 'msg-999';

    it('returns traces ordered by callIndex', async () => {
      const mockTraces = [
        {
          id: 'trace-1',
          messageId: mockMessageId,
          phase: 'planner',
          callIndex: 0,
          stepId: null,
          purpose: 'Plan',
          provider: 'openai',
          model: 'gpt-4',
          temperature: null,
          structuredOutput: false,
          promptMessages: [],
          responseContent: 'Response 1',
          toolCalls: null,
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          startedAt: new Date(),
          completedAt: new Date(),
          durationMs: 1000,
          error: null,
          createdAt: new Date(),
        },
        {
          id: 'trace-2',
          messageId: mockMessageId,
          phase: 'navigator',
          callIndex: 1,
          stepId: null,
          purpose: 'Navigate',
          provider: 'openai',
          model: 'gpt-4',
          temperature: null,
          structuredOutput: false,
          promptMessages: [],
          responseContent: 'Response 2',
          toolCalls: null,
          promptTokens: 80,
          completionTokens: 40,
          totalTokens: 120,
          startedAt: new Date(),
          completedAt: new Date(),
          durationMs: 800,
          error: null,
          createdAt: new Date(),
        },
      ];

      mockPrisma.dataChat.findFirst.mockResolvedValue(mockChat as any);
      mockPrisma.dataChatMessage.findFirst.mockResolvedValue({
        ...mockMessage,
        id: mockMessageId,
      } as any);
      mockPrisma.llmTrace.findMany.mockResolvedValue(mockTraces as any);

      const result = await service.getMessageTraces(
        mockMessageId,
        mockChatId,
        mockUserId,
      );

      expect(result).toEqual(mockTraces);
      expect(mockPrisma.llmTrace.findMany).toHaveBeenCalledWith({
        where: { messageId: mockMessageId },
        orderBy: { callIndex: 'asc' },
      });
    });

    it('throws NotFoundException when chat not found', async () => {
      mockPrisma.dataChat.findFirst.mockResolvedValue(null);

      await expect(
        service.getMessageTraces(mockMessageId, 'nonexistent-chat', mockUserId),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.getMessageTraces(mockMessageId, 'nonexistent-chat', mockUserId),
      ).rejects.toThrow('Chat not found');

      expect(mockPrisma.llmTrace.findMany).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when message not found', async () => {
      mockPrisma.dataChat.findFirst.mockResolvedValue(mockChat as any);
      mockPrisma.dataChatMessage.findFirst.mockResolvedValue(null);

      await expect(
        service.getMessageTraces(mockMessageId, mockChatId, mockUserId),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.getMessageTraces(mockMessageId, mockChatId, mockUserId),
      ).rejects.toThrow('Message not found');

      expect(mockPrisma.llmTrace.findMany).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when message belongs to different chat', async () => {
      const differentChatId = 'other-chat-id';

      mockPrisma.dataChat.findFirst.mockResolvedValue(mockChat as any);
      mockPrisma.dataChatMessage.findFirst.mockResolvedValue(null); // Wrong chatId means null

      await expect(
        service.getMessageTraces(mockMessageId, differentChatId, mockUserId),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.getMessageTraces(mockMessageId, differentChatId, mockUserId),
      ).rejects.toThrow('Message not found');

      expect(mockPrisma.llmTrace.findMany).not.toHaveBeenCalled();
    });
  });
});
