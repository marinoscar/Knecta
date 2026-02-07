import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const discoveryQuerySchema = z.object({
  // Currently no query parameters needed - path params suffice
});

export class DiscoveryQueryDto extends createZodDto(discoveryQuerySchema) {}
