import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const testConnectionSchema = z.object({
  dbType: z.enum(['postgresql', 'mysql', 'sqlserver', 'databricks', 'snowflake'], {
    errorMap: () => ({ message: 'Invalid database type' }),
  }),
  host: z.string().min(1, 'Host is required').max(255, 'Host must be 255 characters or less'),
  port: z.coerce.number().int('Port must be an integer').min(1, 'Port must be at least 1').max(65535, 'Port must be at most 65535'),
  databaseName: z.string().max(255, 'Database name must be 255 characters or less').optional(),
  username: z.string().max(255, 'Username must be 255 characters or less').optional(),
  password: z.string().max(1000, 'Password must be 1000 characters or less').optional(),
  useSsl: z.boolean().default(false),
  options: z.record(z.unknown()).optional(),
});

export class TestConnectionDto extends createZodDto(testConnectionSchema) {}
