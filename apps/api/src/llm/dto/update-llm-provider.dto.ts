import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const updateLlmProviderSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  enabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  config: z.record(z.string(), z.any()).optional(),
});

export class UpdateLlmProviderDto extends createZodDto(updateLlmProviderSchema) {}
