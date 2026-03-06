import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const agentProviderConfigResponseSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  model: z.string().max(100).optional(),
  reasoningLevel: z.string().max(50).optional(),
});

const agentConfigResponseSchema = z.record(
  z.string(),
  agentProviderConfigResponseSchema.optional(),
);

export const systemSettingsResponseSchema = z.object({
  ui: z.object({
    allowUserThemeOverride: z.boolean(),
  }),
  security: z.object({
    jwtAccessTtlMinutes: z.number(),
    refreshTtlDays: z.number(),
  }),
  features: z.record(z.string(), z.boolean()),
  agentConfigs: z
    .object({
      dataAgent: agentConfigResponseSchema.optional(),
      semanticModel: agentConfigResponseSchema.optional(),
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
