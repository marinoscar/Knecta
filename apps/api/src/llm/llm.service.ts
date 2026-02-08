import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';

export interface LLMProviderInfo {
  name: string;
  enabled: boolean;
  model: string;
  isDefault: boolean;
}

@Injectable()
export class LlmService {
  constructor(private readonly configService: ConfigService) {}

  getEnabledProviders(): LLMProviderInfo[] {
    const providers: LLMProviderInfo[] = [];
    const defaultProvider = this.configService.get<string>('llm.defaultProvider');

    // Check OpenAI
    const openaiKey = this.configService.get<string>('llm.openai.apiKey');
    if (openaiKey) {
      providers.push({
        name: 'openai',
        enabled: true,
        model: this.configService.get<string>('llm.openai.model') || 'gpt-4o',
        isDefault: defaultProvider === 'openai',
      });
    }

    // Check Anthropic
    const anthropicKey = this.configService.get<string>('llm.anthropic.apiKey');
    if (anthropicKey) {
      providers.push({
        name: 'anthropic',
        enabled: true,
        model: this.configService.get<string>('llm.anthropic.model') || 'claude-sonnet-4-5-20250929',
        isDefault: defaultProvider === 'anthropic',
      });
    }

    // Check Azure OpenAI
    const azureKey = this.configService.get<string>('llm.azure.apiKey');
    const azureEndpoint = this.configService.get<string>('llm.azure.endpoint');
    const azureDeployment = this.configService.get<string>('llm.azure.deployment');
    if (azureKey && azureEndpoint && azureDeployment) {
      providers.push({
        name: 'azure',
        enabled: true,
        model: azureDeployment,
        isDefault: defaultProvider === 'azure',
      });
    }

    return providers;
  }

  getChatModel(provider?: string): BaseChatModel {
    const targetProvider = provider || this.configService.get<string>('llm.defaultProvider') || 'openai';

    switch (targetProvider) {
      case 'openai': {
        const apiKey = this.configService.get<string>('llm.openai.apiKey');
        if (!apiKey) throw new BadRequestException('OpenAI API key not configured');
        const model = this.configService.get<string>('llm.openai.model') || 'gpt-4o';
        return new ChatOpenAI({ openAIApiKey: apiKey, modelName: model, temperature: 0, streaming: true });
      }

      case 'anthropic': {
        const apiKey = this.configService.get<string>('llm.anthropic.apiKey');
        if (!apiKey) throw new BadRequestException('Anthropic API key not configured');
        const model = this.configService.get<string>('llm.anthropic.model') || 'claude-sonnet-4-5-20250929';
        return new ChatAnthropic({ anthropicApiKey: apiKey, modelName: model, temperature: 0, streaming: true });
      }

      case 'azure': {
        const apiKey = this.configService.get<string>('llm.azure.apiKey');
        const endpoint = this.configService.get<string>('llm.azure.endpoint');
        const deployment = this.configService.get<string>('llm.azure.deployment');
        const apiVersion = this.configService.get<string>('llm.azure.apiVersion') || '2024-02-01';
        if (!apiKey || !endpoint || !deployment) {
          throw new BadRequestException('Azure OpenAI not fully configured');
        }
        return new ChatOpenAI({
          openAIApiKey: apiKey,
          configuration: {
            baseURL: `${endpoint}/openai/deployments/${deployment}`,
            defaultQuery: { 'api-version': apiVersion },
            defaultHeaders: { 'api-key': apiKey },
          },
          temperature: 0,
          streaming: true,
        });
      }

      default:
        throw new BadRequestException(`Unsupported LLM provider: ${targetProvider}`);
    }
  }

  getDefaultProvider(): string {
    return this.configService.get<string>('llm.defaultProvider') || 'openai';
  }
}
