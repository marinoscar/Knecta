import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createSpreadsheetRunSchema = z.object({
  name: z.string().min(1).max(255),
  storageObjectIds: z.array(z.string().uuid()).min(1).max(20),
  instructions: z.string().max(2000).optional(),
});

export class CreateSpreadsheetRunDto extends createZodDto(createSpreadsheetRunSchema) {}
