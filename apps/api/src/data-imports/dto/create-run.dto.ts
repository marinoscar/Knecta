import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createRunSchema = z.object({
  importId: z.string().uuid(),
});

export class CreateRunDto extends createZodDto(createRunSchema) {}
