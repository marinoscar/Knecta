import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { NeoOntologyService } from '../../../ontologies/neo-ontology.service';

export function createGetDatasetDetailsTool(
  neoOntologyService: NeoOntologyService,
  ontologyId: string,
): DynamicStructuredTool {
  const schema = z.object({
    datasetNames: z
      .array(z.string())
      .describe('Array of dataset/table names to retrieve definitions for'),
  });

  // @ts-expect-error — DynamicStructuredTool has excessively deep Zod type inference
  return new DynamicStructuredTool({
    name: 'get_dataset_details',
    description:
      'Get detailed YAML schema definitions for specific datasets/tables. Use this to understand table structure, column types, and relationships before writing SQL queries.',
    schema,
    func: async ({ datasetNames }) => {
      try {
        const datasets =
          await neoOntologyService.getDatasetsByNames(ontologyId, datasetNames);

        const foundNames = new Set(datasets.map((ds) => ds.name));
        const results: string[] = [];

        for (const ds of datasets) {
          results.push(`--- ${ds.name} ---\n${ds.yaml}`);
        }

        // Report any names that weren't found
        for (const name of datasetNames) {
          if (!foundNames.has(name)) {
            results.push(`--- ${name} ---\nDataset not found in ontology.`);
          }
        }

        return results.join('\n\n');
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error retrieving dataset details: ${msg}`;
      }
    },
  }) as any;
}
