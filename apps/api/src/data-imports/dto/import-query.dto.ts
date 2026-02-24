import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const importQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z
    .enum(['draft', 'pending', 'importing', 'ready', 'partial', 'failed'])
    .optional(),
  sortBy: z
    .enum(['name', 'createdAt', 'status', 'sourceFileType'])
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export class ImportQueryDto extends createZodDto(importQuerySchema) {}
