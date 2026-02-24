import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createImportSchema = z.object({
  name: z.string().min(1).max(255).optional(),
});

export class CreateImportDto extends createZodDto(createImportSchema) {}
