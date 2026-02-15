import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const dataAgentProviderConfigSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  model: z.string().max(100).optional(),
  reasoningLevel: z.string().max(50).optional(),
});

// Full replacement (PUT)
export const updateSystemSettingsSchema = z.object({
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

export class UpdateSystemSettingsDto extends createZodDto(
  updateSystemSettingsSchema,
) {}

// Partial update (PATCH)
export const patchSystemSettingsSchema = z.object({
  ui: z
    .object({
      allowUserThemeOverride: z.boolean().optional(),
    })
    .optional(),
  features: z.record(z.string(), z.boolean()).optional(),
  dataAgent: z
    .object({
      openai: dataAgentProviderConfigSchema.optional(),
      anthropic: dataAgentProviderConfigSchema.optional(),
      azure: dataAgentProviderConfigSchema.optional(),
    })
    .optional(),
});

export class PatchSystemSettingsDto extends createZodDto(
  patchSystemSettingsSchema,
) {}
