import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DataAgentController } from './data-agent.controller';
import { DataAgentService } from './data-agent.service';

describe('DataAgentController', () => {
  let controller: DataAgentController;
  let service: DataAgentService;

  const mockUserId = 'user-123';
  const mockChatId = 'chat-123';
  const mockMessageId = 'msg-123';

  const mockService = {
    getMessageTraces: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DataAgentController],
      providers: [
        {
          provide: DataAgentService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<DataAgentController>(DataAgentController);
    service = module.get<DataAgentService>(DataAgentService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getMessageTraces', () => {
    it('returns traces for valid message', async () => {
      const mockTraces = [
        {
          id: 'trace-1',
          messageId: mockMessageId,
          phase: 'planner',
          callIndex: 0,
          stepId: null,
          purpose: 'Generate plan',
          provider: 'openai',
          model: 'gpt-4',
          temperature: null,
          structuredOutput: false,
          promptMessages: [
            { role: 'system', content: 'System prompt' },
          ],
          responseContent: 'Plan response',
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
      ];

      mockService.getMessageTraces.mockResolvedValue(mockTraces);

      const result = await controller.getMessageTraces(
        mockChatId,
        mockMessageId,
        mockUserId,
      );

      expect(result).toEqual({ data: mockTraces });
      expect(service.getMessageTraces).toHaveBeenCalledWith(
        mockMessageId,
        mockChatId,
        mockUserId,
      );
    });

    it('returns 404 for non-existent chat', async () => {
      mockService.getMessageTraces.mockRejectedValue(
        new NotFoundException('Chat not found'),
      );

      await expect(
        controller.getMessageTraces('nonexistent-chat', mockMessageId, mockUserId),
      ).rejects.toThrow(NotFoundException);
      await expect(
        controller.getMessageTraces('nonexistent-chat', mockMessageId, mockUserId),
      ).rejects.toThrow('Chat not found');
    });

    it('returns 404 for non-existent message', async () => {
      mockService.getMessageTraces.mockRejectedValue(
        new NotFoundException('Message not found'),
      );

      await expect(
        controller.getMessageTraces(mockChatId, 'nonexistent-msg', mockUserId),
      ).rejects.toThrow(NotFoundException);
      await expect(
        controller.getMessageTraces(mockChatId, 'nonexistent-msg', mockUserId),
      ).rejects.toThrow('Message not found');
    });
  });
});
