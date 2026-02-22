import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createRunSchema = z.object({
  projectId: z.string().uuid(),
  config: z.object({
    reviewMode: z.enum(['auto', 'review']).optional(),
    concurrency: z.number().int().min(1).max(20).optional(),
  }).optional(),
});

export class CreateRunDto extends createZodDto(createRunSchema) {}
