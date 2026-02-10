import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingService } from './embedding.service';
import { OpenAIEmbeddingProvider } from './providers/openai-embedding.provider';

describe('EmbeddingService', () => {
  let service: EmbeddingService;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmbeddingService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<EmbeddingService>(EmbeddingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getEnabledProviders', () => {
    it('should return OpenAI provider when key configured', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'llm.openai.apiKey') return 'test-openai-key';
        if (key === 'embedding.defaultProvider') return 'openai';
        return undefined;
      });

      const result = service.getEnabledProviders();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: 'openai',
        enabled: true,
        dimensions: 1536,
        isDefault: true,
      });
    });

    it('should return empty array when no keys configured', () => {
      mockConfigService.get.mockReturnValue(undefined);

      const result = service.getEnabledProviders();

      expect(result).toHaveLength(0);
    });

    it('should mark provider as default when configured', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'llm.openai.apiKey') return 'test-key';
        if (key === 'embedding.defaultProvider') return 'openai';
        return undefined;
      });

      const result = service.getEnabledProviders();

      expect(result[0].isDefault).toBe(true);
    });

    it('should not mark provider as default when another is configured', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'llm.openai.apiKey') return 'test-key';
        if (key === 'embedding.defaultProvider') return 'other';
        return undefined;
      });

      const result = service.getEnabledProviders();

      expect(result[0].isDefault).toBe(false);
    });
  });

  describe('getProvider', () => {
    it('should return OpenAI provider when key configured', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'llm.openai.apiKey') return 'test-openai-key';
        if (key === 'embedding.defaultProvider') return 'openai';
        return undefined;
      });

      const result = service.getProvider();

      expect(result).toBeInstanceOf(OpenAIEmbeddingProvider);
    });

    it('should throw when OpenAI key not configured', () => {
      mockConfigService.get.mockReturnValue(undefined);

      expect(() => service.getProvider('openai')).toThrow(
        BadRequestException,
      );
      expect(() => service.getProvider('openai')).toThrow(
        'OpenAI API key not configured',
      );
    });

    it('should use default provider when none specified', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'llm.openai.apiKey') return 'test-key';
        if (key === 'embedding.defaultProvider') return 'openai';
        return undefined;
      });

      const result = service.getProvider();

      expect(result).toBeInstanceOf(OpenAIEmbeddingProvider);
    });

    it('should throw for unsupported provider', () => {
      mockConfigService.get.mockReturnValue(undefined);

      expect(() => service.getProvider('unsupported')).toThrow(
        BadRequestException,
      );
      expect(() => service.getProvider('unsupported')).toThrow(
        'Unsupported embedding provider: unsupported',
      );
    });

    it('should use openai as fallback default', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'llm.openai.apiKey') return 'test-key';
        return undefined;
      });

      const result = service.getProvider();

      expect(result).toBeInstanceOf(OpenAIEmbeddingProvider);
    });
  });

  describe('getDefaultProvider', () => {
    it('should return configured default provider', () => {
      mockConfigService.get.mockReturnValue('openai');

      const result = service.getDefaultProvider();

      expect(result).toBe('openai');
    });

    it('should return openai when no default configured', () => {
      mockConfigService.get.mockReturnValue(undefined);

      const result = service.getDefaultProvider();

      expect(result).toBe('openai');
    });
  });
});
