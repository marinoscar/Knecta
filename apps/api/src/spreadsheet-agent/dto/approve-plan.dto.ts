import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const columnOverrideSchema = z.object({
  outputName: z.string().min(1),
  outputType: z.string().min(1),
});

const planModificationSchema = z.object({
  tableName: z.string().min(1),
  action: z.enum(['include', 'skip']),
  overrides: z.object({
    tableName: z.string().min(1).optional(),
    columns: z.array(columnOverrideSchema).optional(),
  }).optional(),
});

export const approvePlanSchema = z.object({
  modifications: z.array(planModificationSchema).optional(),
});

export class ApprovePlanDto extends createZodDto(approvePlanSchema) {}
