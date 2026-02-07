import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const updateModelSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
});

export class UpdateModelDto extends createZodDto(updateModelSchema) {}
