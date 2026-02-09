import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createOntologySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  semanticModelId: z.string().uuid(),
});

export class CreateOntologyDto extends createZodDto(createOntologySchema) {}
