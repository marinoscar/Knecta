import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const runQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
});

export class RunQueryDto extends createZodDto(runQuerySchema) {}
