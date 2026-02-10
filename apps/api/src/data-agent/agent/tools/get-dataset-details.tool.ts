import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { NeoOntologyService } from '../../../ontologies/neo-ontology.service';

export function createGetDatasetDetailsTool(
  neoOntologyService: NeoOntologyService,
  ontologyId: string,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'get_dataset_details',
    description:
      'Get detailed YAML schema definitions for specific datasets/tables. Use this to understand table structure, column types, and relationships before writing SQL queries.',
    schema: z.object({
      datasetNames: z
        .array(z.string())
        .describe('Array of dataset/table names to retrieve definitions for'),
    }),
    func: async ({ datasetNames }) => {
      try {
        const graph = await neoOntologyService.getGraph(ontologyId);

        const results: string[] = [];
        for (const name of datasetNames) {
          const dataset = graph.nodes.find(
            (n) => n.label === 'Dataset' && n.properties.name === name,
          );

          if (dataset && dataset.properties.yaml) {
            results.push(`--- ${name} ---\n${dataset.properties.yaml}`);
          } else {
            results.push(`--- ${name} ---\nDataset not found in ontology.`);
          }
        }

        return results.join('\n\n');
      } catch (error) {
        return `Error retrieving dataset details: ${error.message}`;
      }
    },
  });
}
