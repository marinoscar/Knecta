import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingProvider, EmbeddingProviderInfo } from './providers/embedding-provider.interface';
import { OpenAIEmbeddingProvider } from './providers/openai-embedding.provider';

@Injectable()
export class EmbeddingService {
  constructor(private readonly configService: ConfigService) {}

  getEnabledProviders(): EmbeddingProviderInfo[] {
    const providers: EmbeddingProviderInfo[] = [];
    const defaultProvider = this.configService.get<string>('embedding.defaultProvider');

    // Check OpenAI (reuses LLM OpenAI API key)
    const openaiKey = this.configService.get<string>('llm.openai.apiKey');
    if (openaiKey) {
      providers.push({
        name: 'openai',
        enabled: true,
        dimensions: 1536,
        isDefault: defaultProvider === 'openai',
      });
    }

    return providers;
  }

  getProvider(provider?: string): EmbeddingProvider {
    const targetProvider = provider || this.configService.get<string>('embedding.defaultProvider') || 'openai';

    switch (targetProvider) {
      case 'openai': {
        const apiKey = this.configService.get<string>('llm.openai.apiKey');
        if (!apiKey) throw new BadRequestException('OpenAI API key not configured');
        return new OpenAIEmbeddingProvider(apiKey);
      }

      default:
        throw new BadRequestException(`Unsupported embedding provider: ${targetProvider}`);
    }
  }

  getDefaultProvider(): string {
    return this.configService.get<string>('embedding.defaultProvider') || 'openai';
  }
}
