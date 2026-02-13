import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { NeoOntologyService } from '../../../ontologies/neo-ontology.service';

export function createListDatasetsTool(
  neoOntologyService: NeoOntologyService,
  ontologyId: string,
): DynamicStructuredTool {
  const schema = z.object({});

  // @ts-expect-error — DynamicStructuredTool has excessively deep Zod type inference
  return new DynamicStructuredTool({
    name: 'list_datasets',
    description:
      'List ALL available datasets/tables in the ontology. Returns names, descriptions, and source table references. Use this to discover what data is available.',
    schema,
    func: async () => {
      try {
        const datasets = await neoOntologyService.listDatasets(ontologyId);

        if (datasets.length === 0) {
          return 'No datasets found in the ontology.';
        }

        const lines = datasets.map(
          (ds) => `- **${ds.name}**: ${ds.description || 'No description'} (source: ${ds.source || 'unknown'})`,
        );

        return `${datasets.length} datasets available:\n\n${lines.join('\n')}`;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error listing datasets: ${msg}`;
      }
    },
  }) as any;
}
