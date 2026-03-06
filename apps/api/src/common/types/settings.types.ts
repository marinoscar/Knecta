// =============================================================================
// Settings Type Definitions
// =============================================================================

/**
 * User settings schema - stored in user_settings.value JSONB
 */
export interface UserSettingsValue {
  theme: 'light' | 'dark' | 'system';
  profile: {
    displayName?: string;
    useProviderImage: boolean;
    customImageUrl?: string | null;
  };
  defaultProvider?: string;
  notifications?: {
    browser?: boolean;
    email?: boolean;
    sms?: boolean;
  };
}

/**
 * Per-provider LLM tuning configuration for an agent
 */
export interface AgentProviderConfig {
  temperature?: number;
  model?: string;
  reasoningLevel?: string;
}

/**
 * Agent-level configs: maps provider key → tuning config
 * Supports any agent type (dataAgent, semanticModel, etc.)
 */
export interface AgentConfigs {
  dataAgent?: Record<string, AgentProviderConfig | undefined>;
  semanticModel?: Record<string, AgentProviderConfig | undefined>;
}

/**
 * System settings schema - stored in system_settings.value JSONB
 */
export interface SystemSettingsValue {
  ui: {
    allowUserThemeOverride: boolean;
  };
  features: {
    [key: string]: boolean;
  };
  agentConfigs?: AgentConfigs;
  notifications?: {
    email?: { enabled: boolean };
    sms?: { enabled: boolean };
  };
}

/**
 * Default user settings
 */
export const DEFAULT_USER_SETTINGS: UserSettingsValue = {
  theme: 'system',
  profile: {
    useProviderImage: true,
  },
};

/**
 * Default system settings
 */
export const DEFAULT_SYSTEM_SETTINGS: SystemSettingsValue = {
  ui: {
    allowUserThemeOverride: true,
  },
  features: {},
};
