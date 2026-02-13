import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { NeoOntologyService } from '../../../ontologies/neo-ontology.service';
import { DiscoveryService } from '../../../discovery/discovery.service';

export function createGetSampleDataTool(
  discoveryService: DiscoveryService,
  neoOntologyService: NeoOntologyService,
  connectionId: string,
  userId: string,
  ontologyId: string,
): DynamicStructuredTool {
  const schema = z.object({
    datasetName: z.string().describe('The dataset/table name to preview'),
    limit: z
      .number()
      .optional()
      .default(5)
      .describe('Number of sample rows to return (default: 5, max: 20)'),
  });

  // @ts-expect-error — DynamicStructuredTool has excessively deep Zod type inference
  return new DynamicStructuredTool({
    name: 'get_sample_data',
    description:
      'Preview sample rows from a dataset/table. Use this to understand data format and content before writing complex queries.',
    schema,
    func: async ({ datasetName, limit }) => {
      try {
        const datasets = await neoOntologyService.getDatasetsByNames(ontologyId, [datasetName]);

        if (datasets.length === 0) {
          return `Dataset "${datasetName}" not found in ontology.`;
        }

        const source = datasets[0].source || datasetName;
        const actualLimit = Math.min(limit || 5, 20);

        const sql = `SELECT * FROM ${source} LIMIT ${actualLimit}`;
        const result = await discoveryService.executeQuery(
          connectionId,
          sql,
          userId,
          actualLimit,
        );

        const { data } = result;
        if (!data.columns || data.columns.length === 0) {
          return 'Table is empty or has no columns.';
        }

        const header = data.columns.join(' | ');
        const separator = data.columns.map(() => '---').join(' | ');
        const rows = data.rows
          .map((row: any[]) =>
            row.map((v) => (v === null ? 'NULL' : String(v))).join(' | '),
          )
          .join('\n');

        return `Sample data from ${source} (${actualLimit} rows):\n\n${header}\n${separator}\n${rows}`;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error getting sample data: ${msg}`;
      }
    },
  }) as any;
}
