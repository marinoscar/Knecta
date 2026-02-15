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

export interface LlmModelConfig {
  temperature?: number;
  model?: string;
  reasoningLevel?: string;
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

  getChatModel(provider?: string, config?: LlmModelConfig): BaseChatModel {
    const targetProvider = provider || this.configService.get<string>('llm.defaultProvider') || 'openai';

    switch (targetProvider) {
      case 'openai': {
        const apiKey = this.configService.get<string>('llm.openai.apiKey');
        if (!apiKey) throw new BadRequestException('OpenAI API key not configured');
        const model = config?.model || this.configService.get<string>('llm.openai.model') || 'gpt-4o';
        const temperature = config?.temperature ?? 0;
        const reasoningEnabled = !!config?.reasoningLevel;

        const modelKwargs: Record<string, unknown> = {};
        if (config?.reasoningLevel) {
          modelKwargs.reasoning_effort = config.reasoningLevel;
        }

        return new ChatOpenAI({
          openAIApiKey: apiKey,
          modelName: model,
          // Reasoning models (o1/o3) do not support custom temperature
          ...(reasoningEnabled ? {} : { temperature }),
          ...(Object.keys(modelKwargs).length > 0 ? { modelKwargs } : {}),
        });
      }

      case 'anthropic': {
        const apiKey = this.configService.get<string>('llm.anthropic.apiKey');
        if (!apiKey) throw new BadRequestException('Anthropic API key not configured');
        const model = config?.model || this.configService.get<string>('llm.anthropic.model') || 'claude-sonnet-4-5-20250929';
        const temperature = config?.temperature ?? 0;

        // Determine if thinking will be enabled
        let thinkingEnabled = false;
        if (config?.reasoningLevel) {
          if (config.reasoningLevel === 'adaptive') {
            thinkingEnabled = true;
          } else {
            const budget = parseInt(config.reasoningLevel, 10);
            if (!isNaN(budget) && budget >= 1024) {
              thinkingEnabled = true;
            }
          }
        }

        const opts: any = {
          anthropicApiKey: apiKey,
          modelName: model,
        };

        // Only set temperature if thinking is NOT enabled
        if (!thinkingEnabled) {
          opts.temperature = temperature;
        }

        // Set thinking options if enabled
        if (thinkingEnabled) {
          if (config.reasoningLevel === 'adaptive') {
            opts.thinking = { type: 'adaptive' };
          } else {
            const budget = parseInt(config.reasoningLevel, 10);
            opts.thinking = { type: 'enabled', budget_tokens: budget };
          }
        }

        return new ChatAnthropic(opts);
      }

      case 'azure': {
        const apiKey = this.configService.get<string>('llm.azure.apiKey');
        const endpoint = this.configService.get<string>('llm.azure.endpoint');
        const deployment = config?.model || this.configService.get<string>('llm.azure.deployment');
        const apiVersion = this.configService.get<string>('llm.azure.apiVersion') || '2024-02-01';
        const temperature = config?.temperature ?? 0;
        const reasoningEnabled = !!config?.reasoningLevel;

        if (!apiKey || !endpoint || !deployment) {
          throw new BadRequestException('Azure OpenAI not fully configured');
        }

        const modelKwargs: Record<string, unknown> = {};
        if (config?.reasoningLevel) {
          modelKwargs.reasoning_effort = config.reasoningLevel;
        }

        return new ChatOpenAI({
          openAIApiKey: apiKey,
          configuration: {
            baseURL: `${endpoint}/openai/deployments/${deployment}`,
            defaultQuery: { 'api-version': apiVersion },
            defaultHeaders: { 'api-key': apiKey },
          },
          // Reasoning models (o1/o3) do not support custom temperature
          ...(reasoningEnabled ? {} : { temperature }),
          ...(Object.keys(modelKwargs).length > 0 ? { modelKwargs } : {}),
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
