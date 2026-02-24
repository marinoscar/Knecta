import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const previewRequestSchema = z.object({
  sheetName: z.string().min(1).max(255),
  range: z
    .object({
      startRow: z.number().int().min(0),
      endRow: z.number().int().min(0).optional(),
      startCol: z.number().int().min(0),
      endCol: z.number().int().min(0).optional(),
    })
    .optional(),
  hasHeader: z.boolean().default(true),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export class PreviewRequestDto extends createZodDto(previewRequestSchema) {}
