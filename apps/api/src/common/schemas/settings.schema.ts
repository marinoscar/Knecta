import { z } from 'zod';

// =============================================================================
// User Settings Schema
// =============================================================================

export const userSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']),
  profile: z.object({
    displayName: z.string().max(100).optional(),
    useProviderImage: z.boolean(),
    customImageUrl: z.string().url().nullable().optional(),
  }),
  defaultProvider: z.string().max(50).optional(),
});

export type UserSettingsDto = z.infer<typeof userSettingsSchema>;

// Partial schema for PATCH operations
export const userSettingsPatchSchema = userSettingsSchema.deepPartial();

// =============================================================================
// System Settings Schema
// =============================================================================

const dataAgentProviderConfigSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  model: z.string().max(100).optional(),
  reasoningLevel: z.string().max(50).optional(),
});

export const systemSettingsSchema = z.object({
  ui: z.object({
    allowUserThemeOverride: z.boolean(),
  }),
  features: z.record(z.string(), z.boolean()),
  dataAgent: z
    .object({
      openai: dataAgentProviderConfigSchema.optional(),
      anthropic: dataAgentProviderConfigSchema.optional(),
      azure: dataAgentProviderConfigSchema.optional(),
    })
    .optional(),
});

export type SystemSettingsDto = z.infer<typeof systemSettingsSchema>;

// Partial schema for PATCH operations
export const systemSettingsPatchSchema = systemSettingsSchema.deepPartial();
