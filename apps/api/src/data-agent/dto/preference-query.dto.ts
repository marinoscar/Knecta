import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const preferenceQuerySchema = z.object({
  ontologyId: z.string().uuid().optional(),
  scope: z.enum(['global', 'ontology', 'all']).default('all'),
});

export class PreferenceQueryDto extends createZodDto(preferenceQuerySchema) {}
