import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { LlmService } from './llm.service';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';

jest.mock('@langchain/openai');
jest.mock('@langchain/anthropic');

describe('LlmService', () => {
  let service: LlmService;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock ConfigService
    mockConfigService = {
      get: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<LlmService>(LlmService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getChatModel', () => {
    describe('backward compatibility', () => {
      it('should create LLM with default provider and temperature 0 when called with no args', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'llm.defaultProvider') return 'openai';
          if (key === 'llm.openai.apiKey') return 'test-openai-key';
          if (key === 'llm.openai.model') return 'gpt-4o';
          return undefined;
        });

        service.getChatModel();

        expect(ChatOpenAI).toHaveBeenCalledWith({
          openAIApiKey: 'test-openai-key',
          modelName: 'gpt-4o',
          maxRetries: 3,
          temperature: 0,
        });
      });
    });

    describe('provider selection', () => {
      it('should create ChatAnthropic when provider is anthropic', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'llm.anthropic.apiKey') return 'test-anthropic-key';
          if (key === 'llm.anthropic.model') return 'claude-sonnet-4-5-20250929';
          return undefined;
        });

        service.getChatModel('anthropic');

        expect(ChatAnthropic).toHaveBeenCalledWith({
          anthropicApiKey: 'test-anthropic-key',
          modelName: 'claude-sonnet-4-5-20250929',
          maxRetries: 3,
          temperature: 0,
        });
      });

      it('should create ChatOpenAI when provider is openai', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'llm.openai.apiKey') return 'test-openai-key';
          if (key === 'llm.openai.model') return 'gpt-4o';
          return undefined;
        });

        service.getChatModel('openai');

        expect(ChatOpenAI).toHaveBeenCalledWith({
          openAIApiKey: 'test-openai-key',
          modelName: 'gpt-4o',
          maxRetries: 3,
          temperature: 0,
        });
      });

      it('should create ChatOpenAI for azure provider', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'llm.azure.apiKey') return 'test-azure-key';
          if (key === 'llm.azure.endpoint') return 'https://test.openai.azure.com';
          if (key === 'llm.azure.deployment') return 'gpt-4o';
          if (key === 'llm.azure.apiVersion') return '2024-02-01';
          return undefined;
        });

        service.getChatModel('azure');

        expect(ChatOpenAI).toHaveBeenCalledWith({
          openAIApiKey: 'test-azure-key',
          maxRetries: 3,
          configuration: {
            baseURL: 'https://test.openai.azure.com/openai/deployments/gpt-4o',
            defaultQuery: { 'api-version': '2024-02-01' },
            defaultHeaders: { 'api-key': 'test-azure-key' },
          },
          temperature: 0,
        });
      });
    });

    describe('temperature override', () => {
      it('should pass temperature 0.5 when specified in config', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'llm.openai.apiKey') return 'test-openai-key';
          if (key === 'llm.openai.model') return 'gpt-4o';
          return undefined;
        });

        service.getChatModel('openai', { temperature: 0.5 });

        expect(ChatOpenAI).toHaveBeenCalledWith({
          openAIApiKey: 'test-openai-key',
          modelName: 'gpt-4o',
          maxRetries: 3,
          temperature: 0.5,
        });
      });

      it('should pass temperature 1.0 for anthropic', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'llm.anthropic.apiKey') return 'test-anthropic-key';
          if (key === 'llm.anthropic.model') return 'claude-sonnet-4-5-20250929';
          return undefined;
        });

        service.getChatModel('anthropic', { temperature: 1.0 });

        expect(ChatAnthropic).toHaveBeenCalledWith({
          anthropicApiKey: 'test-anthropic-key',
          modelName: 'claude-sonnet-4-5-20250929',
          maxRetries: 3,
          temperature: 1.0,
        });
      });
    });

    describe('model override', () => {
      it('should use override model instead of env config for openai', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'llm.openai.apiKey') return 'test-openai-key';
          if (key === 'llm.openai.model') return 'gpt-4o';
          return undefined;
        });

        service.getChatModel('openai', { model: 'gpt-4o-mini' });

        expect(ChatOpenAI).toHaveBeenCalledWith({
          openAIApiKey: 'test-openai-key',
          modelName: 'gpt-4o-mini',
          maxRetries: 3,
          temperature: 0,
        });
      });

      it('should use override model for anthropic', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'llm.anthropic.apiKey') return 'test-anthropic-key';
          if (key === 'llm.anthropic.model') return 'claude-sonnet-4-5-20250929';
          return undefined;
        });

        service.getChatModel('anthropic', { model: 'claude-opus-4-6' });

        expect(ChatAnthropic).toHaveBeenCalledWith({
          anthropicApiKey: 'test-anthropic-key',
          modelName: 'claude-opus-4-6',
          maxRetries: 3,
          temperature: 0,
        });
      });

      it('should use override deployment for azure', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'llm.azure.apiKey') return 'test-azure-key';
          if (key === 'llm.azure.endpoint') return 'https://test.openai.azure.com';
          if (key === 'llm.azure.deployment') return 'gpt-4o';
          if (key === 'llm.azure.apiVersion') return '2024-02-01';
          return undefined;
        });

        service.getChatModel('azure', { model: 'gpt-4o-mini' });

        expect(ChatOpenAI).toHaveBeenCalledWith({
          openAIApiKey: 'test-azure-key',
          maxRetries: 3,
          configuration: {
            baseURL: 'https://test.openai.azure.com/openai/deployments/gpt-4o-mini',
            defaultQuery: { 'api-version': '2024-02-01' },
            defaultHeaders: { 'api-key': 'test-azure-key' },
          },
          temperature: 0,
        });
      });
    });

    describe('reasoning for OpenAI', () => {
      it('should pass reasoning: { effort } when reasoningLevel is high', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'llm.openai.apiKey') return 'test-openai-key';
          if (key === 'llm.openai.model') return 'o1';
          return undefined;
        });

        service.getChatModel('openai', { reasoningLevel: 'high' });

        expect(ChatOpenAI).toHaveBeenCalledWith({
          openAIApiKey: 'test-openai-key',
          modelName: 'o1',
          maxRetries: 3,
          reasoning: { effort: 'high' },
        });
      });

      it('should pass reasoning: { effort } medium for openai', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'llm.openai.apiKey') return 'test-openai-key';
          if (key === 'llm.openai.model') return 'o1';
          return undefined;
        });

        service.getChatModel('openai', { reasoningLevel: 'medium' });

        expect(ChatOpenAI).toHaveBeenCalledWith({
          openAIApiKey: 'test-openai-key',
          modelName: 'o1',
          maxRetries: 3,
          reasoning: { effort: 'medium' },
        });
      });

      it('should pass reasoning: { effort } low for openai', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'llm.openai.apiKey') return 'test-openai-key';
          if (key === 'llm.openai.model') return 'o1';
          return undefined;
        });

        service.getChatModel('openai', { reasoningLevel: 'low' });

        expect(ChatOpenAI).toHaveBeenCalledWith({
          openAIApiKey: 'test-openai-key',
          modelName: 'o1',
          maxRetries: 3,
          reasoning: { effort: 'low' },
        });
      });

      it('should omit temperature and include reasoning when reasoningLevel is set', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'llm.openai.apiKey') return 'test-openai-key';
          if (key === 'llm.openai.model') return 'o1';
          return undefined;
        });

        service.getChatModel('openai', { reasoningLevel: 'high' });

        const callArgs = (ChatOpenAI as jest.MockedClass<typeof ChatOpenAI>).mock.calls[0][0];
        expect(callArgs).not.toHaveProperty('temperature');
        expect(callArgs).toHaveProperty('reasoning', { effort: 'high' });
      });

      it('should not include modelKwargs in the constructor call (regression)', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'llm.openai.apiKey') return 'test-openai-key';
          if (key === 'llm.openai.model') return 'o1';
          return undefined;
        });

        service.getChatModel('openai', { reasoningLevel: 'high' });

        const callArgs = (ChatOpenAI as jest.MockedClass<typeof ChatOpenAI>).mock.calls[0][0];
        expect(callArgs).not.toHaveProperty('modelKwargs');
      });
    });

    describe('reasoning for Anthropic (adaptive)', () => {
      it('should pass thinking config with type adaptive', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'llm.anthropic.apiKey') return 'test-anthropic-key';
          if (key === 'llm.anthropic.model') return 'claude-opus-4-6';
          return undefined;
        });

        service.getChatModel('anthropic', { reasoningLevel: 'adaptive' });

        expect(ChatAnthropic).toHaveBeenCalledWith({
          anthropicApiKey: 'test-anthropic-key',
          modelName: 'claude-opus-4-6',
          maxRetries: 3,
          thinking: { type: 'adaptive' },
        });
      });
    });

    describe('reasoning for Anthropic (budget)', () => {
      it('should pass thinking with budget_tokens when reasoningLevel is numeric', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'llm.anthropic.apiKey') return 'test-anthropic-key';
          if (key === 'llm.anthropic.model') return 'claude-opus-4-6';
          return undefined;
        });

        service.getChatModel('anthropic', { reasoningLevel: '10000' });

        expect(ChatAnthropic).toHaveBeenCalledWith({
          anthropicApiKey: 'test-anthropic-key',
          modelName: 'claude-opus-4-6',
          maxRetries: 3,
          thinking: { type: 'enabled', budget_tokens: 10000 },
        });
      });

      it('should ignore budget less than 1024', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'llm.anthropic.apiKey') return 'test-anthropic-key';
          if (key === 'llm.anthropic.model') return 'claude-opus-4-6';
          return undefined;
        });

        service.getChatModel('anthropic', { reasoningLevel: '500' });

        expect(ChatAnthropic).toHaveBeenCalledWith({
          anthropicApiKey: 'test-anthropic-key',
          modelName: 'claude-opus-4-6',
          maxRetries: 3,
          temperature: 0,
        });
      });

      it('should handle budget at minimum threshold', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'llm.anthropic.apiKey') return 'test-anthropic-key';
          if (key === 'llm.anthropic.model') return 'claude-opus-4-6';
          return undefined;
        });

        service.getChatModel('anthropic', { reasoningLevel: '1024' });

        expect(ChatAnthropic).toHaveBeenCalledWith({
          anthropicApiKey: 'test-anthropic-key',
          modelName: 'claude-opus-4-6',
          maxRetries: 3,
          thinking: { type: 'enabled', budget_tokens: 1024 },
        });
      });
    });

    describe('reasoning for Azure', () => {
      it('should pass reasoning: { effort } when reasoningLevel is high for azure', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'llm.azure.apiKey') return 'test-azure-key';
          if (key === 'llm.azure.endpoint') return 'https://test.openai.azure.com';
          if (key === 'llm.azure.deployment') return 'o1';
          if (key === 'llm.azure.apiVersion') return '2024-02-01';
          return undefined;
        });

        service.getChatModel('azure', { reasoningLevel: 'high' });

        expect(ChatOpenAI).toHaveBeenCalledWith({
          openAIApiKey: 'test-azure-key',
          maxRetries: 3,
          configuration: {
            baseURL: 'https://test.openai.azure.com/openai/deployments/o1',
            defaultQuery: { 'api-version': '2024-02-01' },
            defaultHeaders: { 'api-key': 'test-azure-key' },
          },
          reasoning: { effort: 'high' },
        });
      });

      it('should omit temperature and include reasoning when reasoningLevel is set for azure', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'llm.azure.apiKey') return 'test-azure-key';
          if (key === 'llm.azure.endpoint') return 'https://test.openai.azure.com';
          if (key === 'llm.azure.deployment') return 'o1';
          if (key === 'llm.azure.apiVersion') return '2024-02-01';
          return undefined;
        });

        service.getChatModel('azure', { reasoningLevel: 'medium' });

        const callArgs = (ChatOpenAI as jest.MockedClass<typeof ChatOpenAI>).mock.calls[0][0];
        expect(callArgs).not.toHaveProperty('temperature');
        expect(callArgs).toHaveProperty('reasoning', { effort: 'medium' });
      });

      it('should not include modelKwargs in the azure constructor call (regression)', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'llm.azure.apiKey') return 'test-azure-key';
          if (key === 'llm.azure.endpoint') return 'https://test.openai.azure.com';
          if (key === 'llm.azure.deployment') return 'o1';
          if (key === 'llm.azure.apiVersion') return '2024-02-01';
          return undefined;
        });

        service.getChatModel('azure', { reasoningLevel: 'high' });

        const callArgs = (ChatOpenAI as jest.MockedClass<typeof ChatOpenAI>).mock.calls[0][0];
        expect(callArgs).not.toHaveProperty('modelKwargs');
      });
    });

    describe('maxRetries', () => {
      it('should pass default maxRetries of 3 when not configured', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'llm.openai.apiKey') return 'test-openai-key';
          if (key === 'llm.openai.model') return 'gpt-4o';
          // llm.maxRetries returns undefined → defaults to 3
          return undefined;
        });

        service.getChatModel('openai');

        const callArgs = (ChatOpenAI as jest.MockedClass<typeof ChatOpenAI>).mock.calls[0][0];
        expect(callArgs).toHaveProperty('maxRetries', 3);
      });

      it('should pass custom maxRetries when configured', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'llm.openai.apiKey') return 'test-openai-key';
          if (key === 'llm.openai.model') return 'gpt-4o';
          if (key === 'llm.maxRetries') return 5;
          return undefined;
        });

        service.getChatModel('openai');

        const callArgs = (ChatOpenAI as jest.MockedClass<typeof ChatOpenAI>).mock.calls[0][0];
        expect(callArgs).toHaveProperty('maxRetries', 5);
      });

      it('should pass maxRetries: 0 to disable retries when configured as 0', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'llm.openai.apiKey') return 'test-openai-key';
          if (key === 'llm.openai.model') return 'gpt-4o';
          if (key === 'llm.maxRetries') return 0;
          return undefined;
        });

        service.getChatModel('openai');

        const callArgs = (ChatOpenAI as jest.MockedClass<typeof ChatOpenAI>).mock.calls[0][0];
        expect(callArgs).toHaveProperty('maxRetries', 0);
      });
    });

    describe('missing API key throws', () => {
      it('should throw BadRequestException when openai API key is missing', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'llm.openai.apiKey') return undefined;
          return undefined;
        });

        expect(() => service.getChatModel('openai')).toThrow(BadRequestException);
        expect(() => service.getChatModel('openai')).toThrow(
          'OpenAI API key not configured',
        );
      });

      it('should throw BadRequestException when anthropic API key is missing', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'llm.anthropic.apiKey') return undefined;
          return undefined;
        });

        expect(() => service.getChatModel('anthropic')).toThrow(
          BadRequestException,
        );
        expect(() => service.getChatModel('anthropic')).toThrow(
          'Anthropic API key not configured',
        );
      });

      it('should throw BadRequestException when azure is not fully configured', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'llm.azure.apiKey') return 'test-key';
          if (key === 'llm.azure.endpoint') return undefined; // Missing endpoint
          if (key === 'llm.azure.deployment') return 'gpt-4o';
          return undefined;
        });

        expect(() => service.getChatModel('azure')).toThrow(BadRequestException);
        expect(() => service.getChatModel('azure')).toThrow(
          'Azure OpenAI not fully configured',
        );
      });

      it('should throw BadRequestException for unsupported provider', () => {
        expect(() => service.getChatModel('unsupported' as any)).toThrow(
          BadRequestException,
        );
        expect(() => service.getChatModel('unsupported' as any)).toThrow(
          'Unsupported LLM provider: unsupported',
        );
      });
    });
  });

  describe('getEnabledProviders', () => {
    it('should return all configured providers', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'llm.defaultProvider') return 'openai';
        if (key === 'llm.openai.apiKey') return 'test-openai-key';
        if (key === 'llm.openai.model') return 'gpt-4o';
        if (key === 'llm.anthropic.apiKey') return 'test-anthropic-key';
        if (key === 'llm.anthropic.model') return 'claude-sonnet-4-5-20250929';
        if (key === 'llm.azure.apiKey') return 'test-azure-key';
        if (key === 'llm.azure.endpoint') return 'https://test.openai.azure.com';
        if (key === 'llm.azure.deployment') return 'gpt-4o';
        return undefined;
      });

      const providers = service.getEnabledProviders();

      expect(providers).toHaveLength(3);
      expect(providers).toContainEqual({
        name: 'openai',
        enabled: true,
        model: 'gpt-4o',
        isDefault: true,
      });
      expect(providers).toContainEqual({
        name: 'anthropic',
        enabled: true,
        model: 'claude-sonnet-4-5-20250929',
        isDefault: false,
      });
      expect(providers).toContainEqual({
        name: 'azure',
        enabled: true,
        model: 'gpt-4o',
        isDefault: false,
      });
    });
  });

  describe('getDefaultProvider', () => {
    it('should return configured default provider', () => {
      mockConfigService.get.mockReturnValue('anthropic');

      const defaultProvider = service.getDefaultProvider();

      expect(defaultProvider).toBe('anthropic');
    });

    it('should return openai when no default configured', () => {
      mockConfigService.get.mockReturnValue(undefined);

      const defaultProvider = service.getDefaultProvider();

      expect(defaultProvider).toBe('openai');
    });
  });
});
