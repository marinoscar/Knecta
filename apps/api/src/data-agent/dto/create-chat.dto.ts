import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createChatSchema = z.object({
  name: z.string().min(1).max(255),
  ontologyId: z.string().uuid(),
  llmProvider: z.string().max(50).optional(),
});

export class CreateChatDto extends createZodDto(createChatSchema) {}
