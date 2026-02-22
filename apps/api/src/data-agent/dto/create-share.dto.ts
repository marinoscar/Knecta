import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createShareSchema = z.object({
  expiresInDays: z.number().int().positive().max(365).optional(),
});

export class CreateShareDto extends createZodDto(createShareSchema) {}
