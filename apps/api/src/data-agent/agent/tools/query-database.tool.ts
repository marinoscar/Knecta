import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { DiscoveryService } from '../../../discovery/discovery.service';

export function createQueryDatabaseTool(
  discoveryService: DiscoveryService,
  connectionId: string,
  userId: string,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'query_database',
    description:
      'Execute a read-only SQL query against the database. Returns column names and rows. Only SELECT queries are allowed. Use this to retrieve data, aggregate results, join tables, etc.',
    schema: z.object({
      sql: z
        .string()
        .describe(
          'The SQL SELECT query to execute. Must be read-only (no INSERT, UPDATE, DELETE, DROP, etc.)',
        ),
    }),
    func: async ({ sql }) => {
      try {
        const result = await discoveryService.executeQuery(
          connectionId,
          sql,
          userId,
          500,
        );

        // Format as a readable table string for the LLM
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
      } catch (error) {
        return `SQL Error: ${error.message}`;
      }
    },
  });
}
