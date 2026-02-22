import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const updateConnectionSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less').optional(),
  description: z.string().max(500, 'Description must be 500 characters or less').optional(),
  dbType: z.enum(['postgresql', 'mysql', 'sqlserver', 'databricks', 'snowflake', 's3', 'azure_blob'], {
    errorMap: () => ({ message: 'Invalid database type' }),
  }).optional(),
  host: z.string().min(1, 'Host is required').max(255, 'Host must be 255 characters or less').optional(),
  port: z.coerce.number().int('Port must be an integer').min(1, 'Port must be at least 1').max(65535, 'Port must be at most 65535').optional(),
  databaseName: z.string().max(255, 'Database name must be 255 characters or less').optional(),
  username: z.string().max(255, 'Username must be 255 characters or less').optional(),
  password: z.string().max(1000, 'Password must be 1000 characters or less').optional(),
  useSsl: z.boolean().optional(),
  options: z.record(z.unknown()).optional(),
});

export class UpdateConnectionDto extends createZodDto(updateConnectionSchema) {}
