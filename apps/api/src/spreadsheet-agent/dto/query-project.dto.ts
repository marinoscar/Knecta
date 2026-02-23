import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const queryProjectSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(['draft', 'processing', 'review_pending', 'ready', 'failed', 'partial']).optional(),
  sortBy: z.enum(['name', 'status', 'createdAt', 'tableCount', 'totalRows']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export class QueryProjectDto extends createZodDto(queryProjectSchema) {}
