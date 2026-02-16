import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { DiscoveryService } from '../../../discovery/discovery.service';

export function createQueryDatabaseTool(
  discoveryService: DiscoveryService,
  connectionId: string,
  userId: string,
): DynamicStructuredTool {
  const schema = z.object({
    sql: z
      .string()
      .describe(
        'The SQL SELECT query to execute. Must be read-only (no INSERT, UPDATE, DELETE, DROP, etc.)',
      ),
  });

  // @ts-expect-error — DynamicStructuredTool has excessively deep Zod type inference
  return new DynamicStructuredTool({
    name: 'query_database',
    description:
      'Execute a read-only SQL query against the database. Returns column names and rows (max 500 rows, 30-second timeout). Only SELECT queries are allowed.',
    schema,
    func: async ({ sql }) => {
      try {
        const result = await discoveryService.executeQuery(
          connectionId,
          sql,
          500,
        );

        const { data } = result;
        if (!data.columns || data.columns.length === 0) {
          return 'Query returned no columns.';
        }

        const header = data.columns.join(' | ');
        const separator = data.columns.map(() => '---').join(' | ');
        const rows = data.rows
          .map((row: any[]) =>
            row.map((v) => (v === null ? 'NULL' : String(v))).join(' | '),
          )
          .join('\n');

        return `${data.rowCount} rows returned:\n\n${header}\n${separator}\n${rows}`;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `SQL Error: ${msg}`;
      }
    },
  }) as any;
}
