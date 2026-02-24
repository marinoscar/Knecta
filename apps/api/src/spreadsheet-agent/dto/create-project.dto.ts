import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  storageProvider: z.enum(['s3', 'azure']).default('s3'),
  reviewMode: z.enum(['auto', 'review']).default('review'),
});

export class CreateProjectDto extends createZodDto(createProjectSchema) {}
