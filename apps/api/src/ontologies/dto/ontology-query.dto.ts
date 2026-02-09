import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ontologyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(['creating', 'ready', 'failed']).optional(),
  sortBy: z.enum(['name', 'status', 'createdAt', 'updatedAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export class OntologyQueryDto extends createZodDto(ontologyQuerySchema) {}
