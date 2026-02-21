import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const runQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['pending', 'executing', 'completed', 'failed', 'cancelled']).optional(),
  search: z.string().optional(),
  sortBy: z.enum(['name', 'status', 'createdAt', 'updatedAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export class RunQueryDto extends createZodDto(runQuerySchema) {}
