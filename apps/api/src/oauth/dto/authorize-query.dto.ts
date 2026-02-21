import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const authorizeQuerySchema = z.object({
  response_type: z.literal('code'),
  client_id: z.string().min(1).max(2048),
  redirect_uri: z.string().url().max(2048),
  code_challenge: z.string().min(43).max(128),
  code_challenge_method: z.literal('S256'),
  scope: z.string().max(512).optional(),
  state: z.string().max(512).optional(),
  resource: z.string().url().max(2048).optional(),
});

export class AuthorizeQueryDto extends createZodDto(authorizeQuerySchema) {}
