import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { NeoOntologyService } from '../../../ontologies/neo-ontology.service';

export function createGetRelationshipsTool(
  neoOntologyService: NeoOntologyService,
  ontologyId: string,
): DynamicStructuredTool {
  const schema = z.object({});

  // @ts-expect-error — DynamicStructuredTool has excessively deep Zod type inference
  return new DynamicStructuredTool({
    name: 'get_relationships',
    description:
      'Get ALL relationships (join paths) between datasets in the ontology. Returns from/to dataset pairs with their join columns. Use this to understand how tables connect before building SQL with JOINs.',
    schema,
    func: async () => {
      try {
        const relationships = await neoOntologyService.getAllRelationships(ontologyId);

        if (relationships.length === 0) {
          return 'No relationships found in the ontology.';
        }

        const lines = relationships.map(
          (rel) =>
            `- **${rel.fromDataset}** → **${rel.toDataset}** (${rel.name})\n  JOIN ON: ${rel.fromColumns.join(', ')} = ${rel.toColumns.join(', ')}`,
        );

        return `${relationships.length} relationships found:\n\n${lines.join('\n')}`;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error getting relationships: ${msg}`;
      }
    },
  }) as any;
}
