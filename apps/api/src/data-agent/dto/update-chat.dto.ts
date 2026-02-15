import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const updateChatSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  llmProvider: z.string().max(50).nullable().optional(),
});

export class UpdateChatDto extends createZodDto(updateChatSchema) {}
