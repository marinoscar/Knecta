import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const updatePreferenceSchema = z.object({
  value: z.string().min(1).max(5000),
});

export class UpdatePreferenceDto extends createZodDto(updatePreferenceSchema) {}
