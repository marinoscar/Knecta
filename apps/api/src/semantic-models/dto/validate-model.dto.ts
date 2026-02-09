import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const validateModelSchema = z.object({
  model: z.record(z.unknown()),
});

export class ValidateModelDto extends createZodDto(validateModelSchema) {}
