import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const dataAgentProviderConfigResponseSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  model: z.string().max(100).optional(),
  reasoningLevel: z.string().max(50).optional(),
});

export const systemSettingsResponseSchema = z.object({
  ui: z.object({
    allowUserThemeOverride: z.boolean(),
  }),
  security: z.object({
    jwtAccessTtlMinutes: z.number(),
    refreshTtlDays: z.number(),
  }),
  features: z.record(z.string(), z.boolean()),
  dataAgent: z
    .object({
      openai: dataAgentProviderConfigResponseSchema.optional(),
      anthropic: dataAgentProviderConfigResponseSchema.optional(),
      azure: dataAgentProviderConfigResponseSchema.optional(),
    })
    .optional(),
  updatedAt: z.date(),
  updatedBy: z
    .object({
      id: z.string().uuid(),
      email: z.string().email(),
    })
    .nullable(),
  version: z.number(),
});

export class SystemSettingsResponseDto extends createZodDto(
  systemSettingsResponseSchema,
) {}
