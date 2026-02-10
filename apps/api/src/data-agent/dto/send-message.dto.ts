import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(10000),
});

export class SendMessageDto extends createZodDto(sendMessageSchema) {}
