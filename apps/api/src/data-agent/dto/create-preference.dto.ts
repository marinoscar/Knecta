import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createPreferenceSchema = z.object({
  ontologyId: z.string().uuid().nullable().optional(),
  key: z.string().min(1).max(255),
  value: z.string().min(1).max(5000),
  source: z.enum(['manual', 'auto_captured']).default('manual'),
});

export class CreatePreferenceDto extends createZodDto(createPreferenceSchema) {}
