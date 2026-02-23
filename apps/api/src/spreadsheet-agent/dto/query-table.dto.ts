import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const queryTableSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  fileId: z.string().uuid().optional(),
  status: z.enum(['pending', 'extracting', 'ready', 'failed']).optional(),
});

export class QueryTableDto extends createZodDto(queryTableSchema) {}
