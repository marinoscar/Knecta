import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// Per-type config schemas
const openaiConfigSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  model: z.string().max(100).optional(),
});

const anthropicConfigSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  model: z.string().max(100).optional(),
});

const azureOpenaiConfigSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  endpoint: z.string().url('Endpoint must be a valid URL'),
  deployment: z.string().min(1, 'Deployment name is required'),
  apiVersion: z.string().max(20).optional(),
  model: z.string().max(100).optional(),
});

const snowflakeCortexConfigSchema = z.object({
  account: z.string().min(1, 'Account identifier is required'),
  pat: z.string().min(1, 'Personal Access Token is required'),
  model: z.string().max(100).optional(),
});

// Export individual config schemas for reuse
export {
  openaiConfigSchema,
  anthropicConfigSchema,
  azureOpenaiConfigSchema,
  snowflakeCortexConfigSchema,
};

// Map type to its config schema (for runtime validation)
export const CONFIG_SCHEMAS: Record<string, z.ZodType> = {
  openai: openaiConfigSchema,
  anthropic: anthropicConfigSchema,
  azure_openai: azureOpenaiConfigSchema,
  snowflake_cortex: snowflakeCortexConfigSchema,
};

export const createLlmProviderSchema = z.object({
  type: z.enum(['openai', 'anthropic', 'azure_openai', 'snowflake_cortex']),
  name: z.string().min(1).max(100),
  enabled: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  config: z.record(z.string(), z.any()),
});

export class CreateLlmProviderDto extends createZodDto(createLlmProviderSchema) {}
