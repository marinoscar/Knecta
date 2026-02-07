import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createRunSchema = z.object({
  connectionId: z.string().uuid(),
  databaseName: z.string().min(1).max(255),
  selectedSchemas: z.array(z.string().min(1)).min(1),
  selectedTables: z.array(z.string().min(1)).min(1), // format: "schema.table"
});

export class CreateRunDto extends createZodDto(createRunSchema) {}
