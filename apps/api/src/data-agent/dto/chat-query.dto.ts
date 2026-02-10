import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const chatQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  ontologyId: z.string().uuid().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'name']).default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export class ChatQueryDto extends createZodDto(chatQuerySchema) {}
