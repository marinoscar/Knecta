import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  reviewMode: z.enum(['auto', 'review']).optional(),
});

export class UpdateProjectDto extends createZodDto(updateProjectSchema) {}
