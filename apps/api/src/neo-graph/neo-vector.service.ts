import { Injectable, Logger } from '@nestjs/common';
import neo4j from 'neo4j-driver';
import { NeoGraphService } from './neo-graph.service';

/**
 * Service for managing vector indexes and performing similarity search in Neo4j.
 * Supports Neo4j 5.x vector index features.
 */
@Injectable()
export class NeoVectorService {
  private readonly logger = new Logger(NeoVectorService.name);

  constructor(private readonly neoGraphService: NeoGraphService) {}

  /**
   * Validates a Cypher identifier (index name, label, property) to prevent injection.
   * Allows alphanumeric characters, underscores, and must start with letter or underscore.
   */
  private validateIdentifier(value: string, name: string): void {
    const identifierRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    if (!identifierRegex.test(value)) {
      throw new Error(
        `Invalid ${name}: "${value}". Must contain only alphanumeric characters and underscores, and start with a letter or underscore.`,
      );
    }
  }

  /**
   * Create a vector index if it doesn't exist.
   * Neo4j 5.x syntax: CREATE VECTOR INDEX IF NOT EXISTS
   *
   * @param indexName Name of the vector index (must be valid identifier)
   * @param nodeLabel Label of nodes to index (must be valid identifier)
   * @param propertyName Property containing the vector embeddings (must be valid identifier)
   * @param dimensions Number of dimensions in the embedding vectors
   * @param similarityFunction Similarity function to use ('cosine' or 'euclidean')
   */
  async ensureVectorIndex(
    indexName: string,
    nodeLabel: string,
    propertyName: string,
    dimensions: number,
    similarityFunction: 'cosine' | 'euclidean' = 'cosine',
  ): Promise<void> {
    // Validate inputs to prevent Cypher injection
    this.validateIdentifier(indexName, 'index name');
    this.validateIdentifier(nodeLabel, 'node label');
    this.validateIdentifier(propertyName, 'property name');

    if (dimensions <= 0 || !Number.isInteger(dimensions)) {
      throw new Error(`Invalid dimensions: ${dimensions}. Must be a positive integer.`);
    }

    this.logger.log(
      `Creating vector index "${indexName}" on ${nodeLabel}.${propertyName} (${dimensions}D, ${similarityFunction})`,
    );

    // Note: CREATE VECTOR INDEX doesn't support parameterized names in Neo4j 5.x
    // We use string interpolation but validate inputs above to prevent injection
    const cypher = `
      CREATE VECTOR INDEX ${indexName} IF NOT EXISTS
      FOR (n:${nodeLabel})
      ON (n.${propertyName})
      OPTIONS {
        indexConfig: {
          \`vector.dimensions\`: ${dimensions},
          \`vector.similarity_function\`: '${similarityFunction}'
        }
      }
    `;

    await this.neoGraphService.writeTransaction(async (tx) => {
      await tx.run(cypher);
    });

    this.logger.log(`Vector index "${indexName}" created successfully`);
  }

  /**
   * Update node embeddings in batch using UNWIND.
   * Each item should have { name: string, embedding: number[] }
   *
   * @param ontologyId The ontology ID to scope the update
   * @param nodeLabel Label of nodes to update (must be valid identifier)
   * @param embeddings Array of objects with name and embedding vector
   */
  async updateNodeEmbeddings(
    ontologyId: string,
    nodeLabel: string,
    embeddings: Array<{ name: string; embedding: number[] }>,
  ): Promise<void> {
    if (embeddings.length === 0) {
      this.logger.warn('No embeddings to update');
      return;
    }

    // Validate node label to prevent injection
    this.validateIdentifier(nodeLabel, 'node label');

    this.logger.log(
      `Updating ${embeddings.length} embeddings for ${nodeLabel} nodes in ontology ${ontologyId}`,
    );

    // Use parameterized query for data, but node label must be interpolated
    const cypher = `
      UNWIND $embeddings AS e
      MATCH (n:${nodeLabel} {ontologyId: $ontologyId, name: e.name})
      SET n.embedding = e.embedding
    `;

    await this.neoGraphService.writeTransaction(async (tx) => {
      await tx.run(cypher, {
        ontologyId,
        embeddings,
      });
    });

    this.logger.log(`Updated ${embeddings.length} node embeddings successfully`);
  }

  /**
   * Search for similar nodes using vector index.
   * Post-filters by ontologyId since vector indexes don't support WHERE pre-filtering.
   * Uses a larger internal topK to account for post-filtering.
   *
   * @param indexName Name of the vector index (must be valid identifier)
   * @param ontologyId Ontology ID to filter results
   * @param queryEmbedding The query vector to search for
   * @param topK Number of results to return (default: 5)
   * @returns Array of similar nodes with name, description, yaml, and similarity score
   */
  async searchSimilar(
    indexName: string,
    ontologyId: string,
    queryEmbedding: number[],
    topK: number = 5,
  ): Promise<Array<{ name: string; description: string; yaml: string; score: number }>> {
    // Validate index name to prevent injection
    this.validateIdentifier(indexName, 'index name');

    if (topK <= 0 || !Number.isInteger(topK)) {
      throw new Error(`Invalid topK: ${topK}. Must be a positive integer.`);
    }

    // Use a larger K for the vector search to account for post-filtering
    // This ensures we get enough results after filtering by ontologyId
    const internalTopK = Math.min(topK * 4, 50);

    this.logger.debug(
      `Searching for top ${topK} similar nodes (internal K=${internalTopK}) in ontology ${ontologyId}`,
    );

    // Note: Index name must be interpolated, but we validated it above
    const cypher = `
      CALL db.index.vector.queryNodes($indexName, $internalTopK, $queryEmbedding)
      YIELD node, score
      WHERE node.ontologyId = $ontologyId
      RETURN
        node.name AS name,
        node.description AS description,
        node.yaml AS yaml,
        score
      ORDER BY score DESC
      LIMIT $topK
    `;

    const results = await this.neoGraphService.readTransaction(async (tx) => {
      const result = await tx.run(cypher, {
        indexName,
        internalTopK: neo4j.int(internalTopK),
        queryEmbedding,
        ontologyId,
        topK: neo4j.int(topK),
      });

      return result.records.map((record) => ({
        name: record.get('name') as string,
        description: record.get('description') as string,
        yaml: record.get('yaml') as string,
        score: record.get('score') as number,
      }));
    });

    this.logger.debug(`Found ${results.length} similar nodes`);

    return results;
  }
}
