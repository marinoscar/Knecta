import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { NeoGraphService } from '../neo-graph/neo-graph.service';
import { NeoVectorService } from '../neo-graph/neo-vector.service';
import { EmbeddingService } from '../embedding/embedding.service';
import * as yaml from 'js-yaml';
import type {
  OSISemanticModel,
  OSIDataset,
  OSIField,
  OSIRelationship,
} from '../semantic-models/agent/osi/types';

export interface GraphNode {
  id: string;
  label: 'Dataset' | 'Field';
  name: string;
  properties: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  properties: Record<string, unknown>;
}

@Injectable()
export class NeoOntologyService {
  private readonly logger = new Logger(NeoOntologyService.name);

  constructor(
    private readonly neoGraphService: NeoGraphService,
    private readonly embeddingService: EmbeddingService,
    private readonly neoVectorService: NeoVectorService,
  ) {}

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
      yaml: string;
      from: string;
      to: string;
    }> = [];

    for (const rel of relationships) {
      // Serialize relationship to YAML
      const relYaml = yaml.dump(rel, {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
        sortKeys: false,
        quotingType: '"',
        forceQuotes: false,
      });

      relationshipEdges.push({
        name: rel.name || '',
        fromDataset: rel.from || '',
        toDataset: rel.to || '',
        fromColumns: JSON.stringify(rel.from_columns || []),
        toColumns: JSON.stringify(rel.to_columns || []),
        yaml: relYaml,
        from: rel.from || '',
        to: rel.to || '',
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
            from: r.from,
            to: r.to,
            fromColumns: r.fromColumns,
            toColumns: r.toColumns,
            yaml: r.yaml
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

    // Step 4: Generate and store embeddings for Dataset nodes
    await this.generateAndStoreEmbeddings(ontologyId, datasetNodes);

    return { nodeCount, relationshipCount };
  }

  /**
   * Generate embeddings for Dataset nodes and store them in Neo4j.
   * Creates a vector index if it doesn't exist.
   */
  private async generateAndStoreEmbeddings(
    ontologyId: string,
    datasetNodes: Array<{ name: string; yaml: string }>,
  ): Promise<void> {
    try {
      const provider = this.embeddingService.getProvider();

      // Use the full YAML definition as embedding text for each dataset.
      // YAML contains rich schema info: column names, types, descriptions,
      // relationships — producing much better semantic search matches.
      const embeddingTexts = datasetNodes.map((ds) => ds.yaml);

      // Batch generate embeddings
      this.logger.log(`Generating embeddings for ${embeddingTexts.length} datasets`);
      const embeddings = await provider.generateEmbeddings(embeddingTexts);

      // Build update payload
      const embeddingUpdates = datasetNodes.map((ds, i) => ({
        name: ds.name,
        embedding: embeddings[i],
      }));

      // Store embeddings on Dataset nodes
      await this.neoVectorService.updateNodeEmbeddings(ontologyId, 'Dataset', embeddingUpdates);

      // Ensure vector index exists
      await this.neoVectorService.ensureVectorIndex(
        'dataset_embedding',
        'Dataset',
        'embedding',
        provider.getDimensions(),
        'cosine',
      );

      this.logger.log(`Embeddings stored for ${embeddingTexts.length} datasets`);
    } catch (error) {
      // Log but don't fail graph creation if embedding generation fails
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Failed to generate embeddings for ontology ${ontologyId}: ${errorMessage}`,
      );
    }
  }

  /**
   * Backfill embeddings for an existing ontology.
   * Reads dataset/field info from Neo4j and generates embeddings.
   */
  async backfillEmbeddings(ontologyId: string): Promise<void> {
    // Read existing datasets and fields from Neo4j
    const graph = await this.getGraph(ontologyId);

    const datasetNodes = graph.nodes
      .filter((n) => n.label === 'Dataset')
      .map((n) => ({
        name: n.properties.name as string,
        yaml: (n.properties.yaml as string) || '',
      }));

    await this.generateAndStoreEmbeddings(ontologyId, datasetNodes);
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
   * List all datasets in the ontology (lightweight, no fields or relationships)
   */
  async listDatasets(
    ontologyId: string,
  ): Promise<Array<{ name: string; description: string; source: string }>> {
    return this.neoGraphService.readTransaction(async (tx) => {
      const result = await tx.run(
        `
        MATCH (d:Dataset {ontologyId: $ontologyId})
        RETURN d.name AS name, d.description AS description, d.source AS source
        ORDER BY d.name
        `,
        { ontologyId },
      );

      return result.records.map((record) => ({
        name: record.get('name') as string,
        description: (record.get('description') as string) || '',
        source: (record.get('source') as string) || '',
      }));
    });
  }

  /**
   * Get specific datasets by name with YAML (for schema inspection)
   */
  async getDatasetsByNames(
    ontologyId: string,
    names: string[],
  ): Promise<Array<{ name: string; description: string; source: string; yaml: string }>> {
    return this.neoGraphService.readTransaction(async (tx) => {
      const result = await tx.run(
        `
        MATCH (d:Dataset {ontologyId: $ontologyId})
        WHERE d.name IN $names
        RETURN d.name AS name, d.description AS description, d.source AS source, d.yaml AS yaml
        `,
        { ontologyId, names },
      );

      return result.records.map((record) => ({
        name: record.get('name') as string,
        description: (record.get('description') as string) || '',
        source: (record.get('source') as string) || '',
        yaml: (record.get('yaml') as string) || '',
      }));
    });
  }

  /**
   * Get relationships involving specific datasets (for join hints)
   */
  async getDatasetRelationships(
    ontologyId: string,
    datasetNames: string[],
  ): Promise<Array<{ fromDataset: string; toDataset: string; name: string; fromColumns: string; toColumns: string }>> {
    return this.neoGraphService.readTransaction(async (tx) => {
      const result = await tx.run(
        `
        MATCH (from:Dataset {ontologyId: $ontologyId})-[r:RELATES_TO]->(to:Dataset {ontologyId: $ontologyId})
        WHERE from.name IN $datasetNames OR to.name IN $datasetNames
        RETURN from.name AS fromDataset, to.name AS toDataset,
               r.name AS name, r.fromColumns AS fromColumns, r.toColumns AS toColumns
        `,
        { ontologyId, datasetNames },
      );

      return result.records.map((record) => ({
        fromDataset: record.get('fromDataset') as string,
        toDataset: record.get('toDataset') as string,
        name: (record.get('name') as string) || '',
        fromColumns: (record.get('fromColumns') as string) || '[]',
        toColumns: (record.get('toColumns') as string) || '[]',
      }));
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
