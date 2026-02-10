import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const updateChatSchema = z.object({
  name: z.string().min(1).max(255),
});

export class UpdateChatDto extends createZodDto(updateChatSchema) {}
