import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { NeoGraphService } from '../neo-graph/neo-graph.service';
import * as yaml from 'js-yaml';
import type {
  OSISemanticModel,
  OSIDataset,
  OSIField,
  OSIRelationship,
} from '../semantic-models/agent/osi/types';

interface GraphNode {
  id: string;
  label: 'Dataset' | 'Field';
  name: string;
  properties: Record<string, unknown>;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  properties: Record<string, unknown>;
}

@Injectable()
export class NeoOntologyService {
  private readonly logger = new Logger(NeoOntologyService.name);

  constructor(private readonly neoGraphService: NeoGraphService) {}

  /**
   * Create graph representation in Neo4j from semantic model
   */
  async createGraph(
    ontologyId: string,
    model: any,
  ): Promise<{ nodeCount: number; relationshipCount: number }> {
    // Parse and validate the model
    const osiModel = model as OSISemanticModel;
    if (!osiModel.semantic_model || !Array.isArray(osiModel.semantic_model)) {
      throw new BadRequestException('Invalid OSI model structure');
    }

    const definition = osiModel.semantic_model[0];
    if (!definition || !Array.isArray(definition.datasets)) {
      throw new BadRequestException('Semantic model has no datasets');
    }

    const datasets = definition.datasets;
    if (datasets.length === 0) {
      throw new BadRequestException('Semantic model has no datasets');
    }

    // Build arrays for batch Cypher
    const datasetNodes: Array<{
      name: string;
      source: string;
      description: string;
      yaml: string;
    }> = [];

    const fieldNodes: Array<{
      datasetName: string;
      name: string;
      expression: string;
      label: string;
      description: string;
      yaml: string;
    }> = [];

    // Extract datasets and fields
    for (const dataset of datasets) {
      // Serialize dataset to YAML
      const datasetYaml = yaml.dump(dataset, {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
        sortKeys: false,
        quotingType: '"',
        forceQuotes: false,
      });

      datasetNodes.push({
        name: dataset.name || '',
        source: dataset.source || '',
        description: dataset.description || '',
        yaml: datasetYaml,
      });

      // Extract fields
      if (dataset.fields && Array.isArray(dataset.fields)) {
        for (const field of dataset.fields) {
          // Get first dialect expression
          const expression =
            field.expression?.dialects?.[0]?.expression || '';

          // Serialize field to YAML
          const fieldYaml = yaml.dump(field, {
            indent: 2,
            lineWidth: 120,
            noRefs: true,
            sortKeys: false,
            quotingType: '"',
            forceQuotes: false,
          });

          fieldNodes.push({
            datasetName: dataset.name,
            name: field.name || '',
            expression,
            label: field.label || '',
            description: field.description || '',
            yaml: fieldYaml,
          });
        }
      }
    }

    // Extract relationships
    const relationships = definition.relationships || [];
    const relationshipEdges: Array<{
      name: string;
      fromDataset: string;
      toDataset: string;
      fromColumns: string;
      toColumns: string;
    }> = [];

    for (const rel of relationships) {
      relationshipEdges.push({
        name: rel.name || '',
        fromDataset: rel.from || '',
        toDataset: rel.to || '',
        fromColumns: JSON.stringify(rel.from_columns || []),
        toColumns: JSON.stringify(rel.to_columns || []),
      });
    }

    // Execute in a write transaction with batched Cypher
    await this.neoGraphService.writeTransaction(async (tx) => {
      // Step 1: Create Dataset nodes
      if (datasetNodes.length > 0) {
        await tx.run(
          `
          UNWIND $datasets AS d
          CREATE (ds:Dataset {
            ontologyId: $ontologyId,
            name: d.name,
            source: d.source,
            description: d.description,
            yaml: d.yaml
          })
          `,
          { datasets: datasetNodes, ontologyId },
        );
      }

      // Step 2: Create Field nodes + HAS_FIELD relationships
      if (fieldNodes.length > 0) {
        await tx.run(
          `
          UNWIND $fields AS f
          MATCH (ds:Dataset {ontologyId: $ontologyId, name: f.datasetName})
          CREATE (fld:Field {
            ontologyId: $ontologyId,
            datasetName: f.datasetName,
            name: f.name,
            expression: f.expression,
            label: f.label,
            description: f.description,
            yaml: f.yaml
          })
          CREATE (ds)-[:HAS_FIELD]->(fld)
          `,
          { fields: fieldNodes, ontologyId },
        );
      }

      // Step 3: Create RELATES_TO relationships between datasets
      if (relationshipEdges.length > 0) {
        await tx.run(
          `
          UNWIND $relationships AS r
          MATCH (fromDs:Dataset {ontologyId: $ontologyId, name: r.fromDataset})
          MATCH (toDs:Dataset {ontologyId: $ontologyId, name: r.toDataset})
          CREATE (fromDs)-[:RELATES_TO {
            name: r.name,
            fromColumns: r.fromColumns,
            toColumns: r.toColumns
          }]->(toDs)
          `,
          { relationships: relationshipEdges, ontologyId },
        );
      }
    });

    const nodeCount = datasetNodes.length + fieldNodes.length;
    const relationshipCount = fieldNodes.length + relationshipEdges.length;

    this.logger.log(
      `Created graph for ontology ${ontologyId}: ${nodeCount} nodes, ${relationshipCount} relationships`,
    );

    return { nodeCount, relationshipCount };
  }

  /**
   * Retrieve graph data for visualization
   */
  async getGraph(
    ontologyId: string,
  ): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    return this.neoGraphService.readTransaction(async (tx) => {
      // Fetch nodes
      const nodesResult = await tx.run(
        `
        MATCH (n {ontologyId: $ontologyId})
        RETURN elementId(n) AS id, labels(n) AS labels, properties(n) AS props
        `,
        { ontologyId },
      );

      const nodes: GraphNode[] = nodesResult.records.map((record) => {
        const id = record.get('id');
        const labels = record.get('labels') as string[];
        const props = record.get('props');

        // Determine label (Dataset or Field)
        const label = (labels.includes('Dataset')
          ? 'Dataset'
          : 'Field') as 'Dataset' | 'Field';

        // Convert Neo4j properties to plain object
        const properties: Record<string, unknown> = {};
        for (const key in props) {
          properties[key] = props[key];
        }

        return {
          id,
          label,
          name: properties.name as string,
          properties,
        };
      });

      // Fetch relationships
      const edgesResult = await tx.run(
        `
        MATCH (a {ontologyId: $ontologyId})-[r]->(b {ontologyId: $ontologyId})
        RETURN elementId(a) AS sourceId, elementId(b) AS targetId, type(r) AS type, properties(r) AS props, elementId(r) AS id
        `,
        { ontologyId },
      );

      const edges: GraphEdge[] = edgesResult.records.map((record) => {
        const sourceId = record.get('sourceId');
        const targetId = record.get('targetId');
        const type = record.get('type');
        const props = record.get('props');
        const id = record.get('id');

        // Convert Neo4j properties to plain object
        const properties: Record<string, unknown> = {};
        for (const key in props) {
          properties[key] = props[key];
        }

        return {
          id,
          source: sourceId,
          target: targetId,
          type,
          properties,
        };
      });

      return { nodes, edges };
    });
  }

  /**
   * Delete graph from Neo4j
   */
  async deleteGraph(ontologyId: string): Promise<void> {
    await this.neoGraphService.writeTransaction(async (tx) => {
      await tx.run(
        `
        MATCH (n {ontologyId: $ontologyId})
        DETACH DELETE n
        `,
        { ontologyId },
      );
    });

    this.logger.log(`Deleted graph for ontology ${ontologyId}`);
  }
}
