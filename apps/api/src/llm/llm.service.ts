import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { LlmProviderService } from './llm-provider.service';
import { TYPE_ALIASES, DEFAULT_MODELS, ProviderType } from './types/provider-config.types';

export interface LLMProviderInfo {
  id?: string;
  name: string;
  type?: string;
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
  constructor(
    private readonly configService: ConfigService,
    private readonly llmProviderService: LlmProviderService,
  ) {}

  async getEnabledProviders(): Promise<LLMProviderInfo[]> {
    // Try DB first
    const dbProviders = await this.llmProviderService.getEnabledProviders();
    if (dbProviders.length > 0) {
      return dbProviders;
    }
    // Fall back to env vars
    return this.getEnabledProvidersFromEnv();
  }

  async getChatModel(
    provider?: string,
    config?: LlmModelConfig,
  ): Promise<BaseChatModel> {
    // Resolve type alias (e.g., 'azure' → 'azure_openai')
    const resolvedType = TYPE_ALIASES[provider ?? ''] || provider;
    const targetProvider =
      resolvedType || (await this.getDefaultProvider()) || 'openai';
    const maxRetries = this.configService.get<number>('llm.maxRetries') ?? 3;

    // Try DB provider first
    const dbConfig =
      await this.llmProviderService.getDecryptedConfig(targetProvider);
    if (dbConfig) {
      return this.createModelFromDbConfig(targetProvider, dbConfig, config, maxRetries);
    }

    // Fall back to env vars — map 'azure_openai' back to 'azure' for the legacy env path
    const envProvider =
      targetProvider === 'azure_openai' ? 'azure' : targetProvider;
    return this.createModelFromEnv(envProvider, config, maxRetries);
  }

  /**
   * Create a model from a raw (already decrypted) config object.
   * Used by the test endpoint which already holds the decrypted config.
   */
  getChatModelFromConfig(type: string, config: any): BaseChatModel {
    const maxRetries = this.configService.get<number>('llm.maxRetries') ?? 3;
    return this.createModelFromDbConfig(type, config, undefined, maxRetries);
  }

  async getDefaultProvider(): Promise<string> {
    // Try DB first
    const dbDefault =
      await this.llmProviderService.getDefaultProviderType();
    if (dbDefault) return dbDefault;
    // Fall back to env var
    return (
      this.configService.get<string>('llm.defaultProvider') || 'openai'
    );
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private createModelFromDbConfig(
    type: string,
    dbConfig: any,
    runtimeConfig: LlmModelConfig | undefined,
    maxRetries: number,
  ): BaseChatModel {
    const resolvedType = (TYPE_ALIASES[type] || type) as ProviderType;

    switch (resolvedType) {
      case 'openai': {
        const { apiKey, model: defaultModel } = dbConfig;
        if (!apiKey)
          throw new BadRequestException('OpenAI API key not configured');
        const model =
          runtimeConfig?.model || defaultModel || DEFAULT_MODELS.openai;
        const temperature = runtimeConfig?.temperature ?? 0;
        const reasoningEnabled = !!runtimeConfig?.reasoningLevel;

        return new ChatOpenAI({
          openAIApiKey: apiKey,
          modelName: model,
          maxRetries,
          // Reasoning models (o1/o3) do not support custom temperature
          ...(reasoningEnabled ? {} : { temperature }),
          // Use native reasoning param — @langchain/openai handles API format differences
          ...(runtimeConfig?.reasoningLevel
            ? {
                reasoning: {
                  effort: runtimeConfig.reasoningLevel as
                    | 'low'
                    | 'medium'
                    | 'high',
                },
              }
            : {}),
        });
      }

      case 'anthropic': {
        const { apiKey, model: defaultModel } = dbConfig;
        if (!apiKey)
          throw new BadRequestException('Anthropic API key not configured');
        const model =
          runtimeConfig?.model ||
          defaultModel ||
          DEFAULT_MODELS.anthropic;
        const temperature = runtimeConfig?.temperature ?? 0;

        let thinkingEnabled = false;
        if (runtimeConfig?.reasoningLevel) {
          if (runtimeConfig.reasoningLevel === 'adaptive') {
            thinkingEnabled = true;
          } else {
            const budget = parseInt(runtimeConfig.reasoningLevel, 10);
            if (!isNaN(budget) && budget >= 1024) thinkingEnabled = true;
          }
        }

        const opts: any = {
          anthropicApiKey: apiKey,
          modelName: model,
          maxRetries,
        };
        // Only set temperature if thinking is NOT enabled
        if (!thinkingEnabled) opts.temperature = temperature;
        if (thinkingEnabled) {
          if (runtimeConfig?.reasoningLevel === 'adaptive') {
            opts.thinking = { type: 'adaptive' };
          } else {
            opts.thinking = {
              type: 'enabled',
              budget_tokens: parseInt(
                runtimeConfig?.reasoningLevel ?? '',
                10,
              ),
            };
          }
        }
        return new ChatAnthropic(opts);
      }

      case 'azure_openai': {
        const {
          apiKey,
          endpoint,
          deployment,
          apiVersion,
          model: defaultModel,
        } = dbConfig;
        if (!apiKey || !endpoint || !deployment) {
          throw new BadRequestException(
            'Azure OpenAI not fully configured',
          );
        }
        const model = runtimeConfig?.model || defaultModel || deployment;
        const temperature = runtimeConfig?.temperature ?? 0;
        const reasoningEnabled = !!runtimeConfig?.reasoningLevel;
        const version = apiVersion || '2024-02-01';

        return new ChatOpenAI({
          openAIApiKey: apiKey,
          maxRetries,
          configuration: {
            baseURL: `${endpoint}/openai/deployments/${deployment}`,
            defaultQuery: { 'api-version': version },
            defaultHeaders: { 'api-key': apiKey },
          },
          ...(reasoningEnabled ? {} : { temperature }),
          ...(runtimeConfig?.reasoningLevel
            ? {
                reasoning: {
                  effort: runtimeConfig.reasoningLevel as
                    | 'low'
                    | 'medium'
                    | 'high',
                },
              }
            : {}),
        });
      }

      case 'snowflake_cortex': {
        const { account, pat, model: defaultModel } = dbConfig;
        if (!account || !pat) {
          throw new BadRequestException(
            'Snowflake Cortex not fully configured',
          );
        }
        const model =
          runtimeConfig?.model ||
          defaultModel ||
          DEFAULT_MODELS.snowflake_cortex;
        const temperature = runtimeConfig?.temperature ?? 0;

        return new ChatOpenAI({
          openAIApiKey: pat,
          modelName: model,
          maxRetries,
          temperature,
          configuration: {
            baseURL: `https://${account}.snowflakecomputing.com/api/v2/cortex/v1`,
          },
        });
      }

      default:
        throw new BadRequestException(
          `Unsupported LLM provider: ${resolvedType}`,
        );
    }
  }

  /**
   * Legacy path: create a model from environment variables.
   */
  private createModelFromEnv(
    provider: string,
    config: LlmModelConfig | undefined,
    maxRetries: number,
  ): BaseChatModel {
    switch (provider) {
      case 'openai': {
        const apiKey = this.configService.get<string>('llm.openai.apiKey');
        if (!apiKey)
          throw new BadRequestException('OpenAI API key not configured');
        const model =
          config?.model ||
          this.configService.get<string>('llm.openai.model') ||
          'gpt-4o';
        const temperature = config?.temperature ?? 0;
        const reasoningEnabled = !!config?.reasoningLevel;

        return new ChatOpenAI({
          openAIApiKey: apiKey,
          modelName: model,
          maxRetries,
          ...(reasoningEnabled ? {} : { temperature }),
          ...(config?.reasoningLevel
            ? {
                reasoning: {
                  effort: config.reasoningLevel as 'low' | 'medium' | 'high',
                },
              }
            : {}),
        });
      }

      case 'anthropic': {
        const apiKey = this.configService.get<string>(
          'llm.anthropic.apiKey',
        );
        if (!apiKey)
          throw new BadRequestException('Anthropic API key not configured');
        const model =
          config?.model ||
          this.configService.get<string>('llm.anthropic.model') ||
          'claude-sonnet-4-5-20250929';
        const temperature = config?.temperature ?? 0;

        let thinkingEnabled = false;
        if (config?.reasoningLevel) {
          if (config.reasoningLevel === 'adaptive') {
            thinkingEnabled = true;
          } else {
            const budget = parseInt(config.reasoningLevel, 10);
            if (!isNaN(budget) && budget >= 1024) thinkingEnabled = true;
          }
        }

        const opts: any = {
          anthropicApiKey: apiKey,
          modelName: model,
          maxRetries,
        };
        if (!thinkingEnabled) opts.temperature = temperature;
        if (thinkingEnabled) {
          if (config?.reasoningLevel === 'adaptive') {
            opts.thinking = { type: 'adaptive' };
          } else {
            opts.thinking = {
              type: 'enabled',
              budget_tokens: parseInt(config?.reasoningLevel ?? '', 10),
            };
          }
        }
        return new ChatAnthropic(opts);
      }

      case 'azure': {
        const apiKey = this.configService.get<string>('llm.azure.apiKey');
        const endpoint = this.configService.get<string>(
          'llm.azure.endpoint',
        );
        const deployment =
          config?.model ||
          this.configService.get<string>('llm.azure.deployment');
        const apiVersion =
          this.configService.get<string>('llm.azure.apiVersion') ||
          '2024-02-01';

        if (!apiKey || !endpoint || !deployment) {
          throw new BadRequestException('Azure OpenAI not fully configured');
        }

        const temperature = config?.temperature ?? 0;
        const reasoningEnabled = !!config?.reasoningLevel;

        return new ChatOpenAI({
          openAIApiKey: apiKey,
          maxRetries,
          configuration: {
            baseURL: `${endpoint}/openai/deployments/${deployment}`,
            defaultQuery: { 'api-version': apiVersion },
            defaultHeaders: { 'api-key': apiKey },
          },
          ...(reasoningEnabled ? {} : { temperature }),
          ...(config?.reasoningLevel
            ? {
                reasoning: {
                  effort: config.reasoningLevel as 'low' | 'medium' | 'high',
                },
              }
            : {}),
        });
      }

      default:
        throw new BadRequestException(
          `Unsupported LLM provider: ${provider}`,
        );
    }
  }

  /**
   * Legacy path: scan environment variables for enabled providers.
   */
  private getEnabledProvidersFromEnv(): LLMProviderInfo[] {
    const providers: LLMProviderInfo[] = [];
    const defaultProvider = this.configService.get<string>(
      'llm.defaultProvider',
    );

    const openaiKey = this.configService.get<string>('llm.openai.apiKey');
    if (openaiKey) {
      providers.push({
        name: 'openai',
        enabled: true,
        model:
          this.configService.get<string>('llm.openai.model') || 'gpt-4o',
        isDefault: defaultProvider === 'openai',
      });
    }

    const anthropicKey = this.configService.get<string>(
      'llm.anthropic.apiKey',
    );
    if (anthropicKey) {
      providers.push({
        name: 'anthropic',
        enabled: true,
        model:
          this.configService.get<string>('llm.anthropic.model') ||
          'claude-sonnet-4-5-20250929',
        isDefault: defaultProvider === 'anthropic',
      });
    }

    const azureKey = this.configService.get<string>('llm.azure.apiKey');
    const azureEndpoint = this.configService.get<string>(
      'llm.azure.endpoint',
    );
    const azureDeployment = this.configService.get<string>(
      'llm.azure.deployment',
    );
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
}
