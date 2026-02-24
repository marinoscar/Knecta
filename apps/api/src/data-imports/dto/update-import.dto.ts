import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const csvColumnSchema = z.object({
  sourceName: z.string(),
  outputName: z.string().min(1).max(255),
  outputType: z.enum(['VARCHAR', 'INTEGER', 'BIGINT', 'DOUBLE', 'BOOLEAN', 'DATE', 'TIMESTAMP']),
  include: z.boolean().default(true),
});

const rangeSchema = z.object({
  startRow: z.number().int().min(0),
  endRow: z.number().int().min(0).optional(),
  startCol: z.number().int().min(0),
  endCol: z.number().int().min(0).optional(),
});

const sheetConfigSchema = z.object({
  sheetName: z.string().min(1).max(255),
  tableName: z.string().min(1).max(63).regex(/^[a-z][a-z0-9_]*$/).optional(),
  range: rangeSchema.optional(),
  hasHeader: z.boolean().default(true),
  columns: z.array(csvColumnSchema).optional(),
});

export const updateImportSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  config: z
    .object({
      // CSV options
      delimiter: z.string().max(5).optional(),
      hasHeader: z.boolean().optional(),
      encoding: z.string().max(20).optional(),
      skipRows: z.number().int().min(0).optional(),
      columns: z.array(csvColumnSchema).optional(),
      // Excel options (multiple sheets)
      sheets: z.array(sheetConfigSchema).optional(),
    })
    .optional(),
});

export class UpdateImportDto extends createZodDto(updateImportSchema) {}
