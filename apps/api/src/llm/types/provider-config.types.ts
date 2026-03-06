// =============================================================================
// LLM Provider Configuration Types
// =============================================================================

/**
 * OpenAI provider config — stored encrypted in llm_providers.encrypted_config
 */
export interface OpenAIProviderConfig {
  apiKey: string;
  model?: string;
}

/**
 * Anthropic provider config — stored encrypted
 */
export interface AnthropicProviderConfig {
  apiKey: string;
  model?: string;
}

/**
 * Azure OpenAI provider config — stored encrypted
 */
export interface AzureOpenAIProviderConfig {
  apiKey: string;
  endpoint: string;
  deployment: string;
  apiVersion?: string;
  model?: string;
}

/**
 * Snowflake Cortex provider config — stored encrypted.
 * Uses OpenAI-compatible REST API, so ChatOpenAI works with custom baseURL.
 */
export interface SnowflakeCortexProviderConfig {
  account: string; // Snowflake account identifier (e.g., 'xy12345.us-east-1')
  pat: string; // Personal Access Token
  model?: string;
}

export type ProviderConfig =
  | OpenAIProviderConfig
  | AnthropicProviderConfig
  | AzureOpenAIProviderConfig
  | SnowflakeCortexProviderConfig;

/** Supported provider type identifiers */
export const PROVIDER_TYPES = [
  'openai',
  'anthropic',
  'azure_openai',
  'snowflake_cortex',
] as const;

export type ProviderType = (typeof PROVIDER_TYPES)[number];

/** Fields that contain sensitive data and must be masked in API responses */
export const SENSITIVE_FIELDS: Record<ProviderType, string[]> = {
  openai: ['apiKey'],
  anthropic: ['apiKey'],
  azure_openai: ['apiKey'],
  snowflake_cortex: ['pat'],
};

/** Default model per provider type (used when no model is configured) */
export const DEFAULT_MODELS: Record<ProviderType, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-5-20250929',
  azure_openai: '', // Uses deployment name
  snowflake_cortex: 'claude-3-7-sonnet',
};

/** Display names for provider types */
export const PROVIDER_DISPLAY_NAMES: Record<ProviderType, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  azure_openai: 'Azure OpenAI',
  snowflake_cortex: 'Snowflake Cortex',
};

/**
 * Backward-compatible type aliases.
 * Existing data (e.g., data_chats.llm_provider = 'azure') maps to new types.
 */
export const TYPE_ALIASES: Record<string, ProviderType> = {
  azure: 'azure_openai',
};
