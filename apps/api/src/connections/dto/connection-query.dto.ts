import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const connectionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  dbType: z.enum(['postgresql', 'mysql', 'sqlserver', 'databricks', 'snowflake', 's3', 'azure_blob']).optional(),
  sortBy: z.enum(['name', 'dbType', 'createdAt', 'lastTestedAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export class ConnectionQueryDto extends createZodDto(connectionQuerySchema) {}
