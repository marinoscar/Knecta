import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const tokenRequestSchema = z.object({
  grant_type: z.enum(['authorization_code', 'refresh_token']),
  code: z.string().max(128).optional(),
  code_verifier: z.string().min(43).max(128).optional(),
  redirect_uri: z.string().url().max(2048).optional(),
  client_id: z.string().min(1).max(2048).optional(),
  refresh_token: z.string().max(512).optional(),
});

export class TokenRequestDto extends createZodDto(tokenRequestSchema) {}
