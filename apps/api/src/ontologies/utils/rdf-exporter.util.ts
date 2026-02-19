import { Writer, DataFactory } from 'n3';
import type { GraphNode, GraphEdge } from '../neo-ontology.service';

const { namedNode, literal, quad } = DataFactory;

/**
 * Sanitize a name to make it URI-safe
 * Replaces non-alphanumeric characters with underscores
 */
function sanitizeUri(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * Export ontology graph to RDF Turtle format
 */
export function exportGraphToTurtle(
  ontology: {
    id: string;
    name: string;
    description: string | null;
    nodeCount: number;
    relationshipCount: number;
    createdAt: Date;
  },
  graph: { nodes: GraphNode[]; edges: GraphEdge[] },
): string {
  const writer = new Writer({
    prefixes: {
      '': 'http://knecta.io/ontology#',
      knecta: 'http://knecta.io/ontology#',
      rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
      rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
      xsd: 'http://www.w3.org/2001/XMLSchema#',
      dcterms: 'http://purl.org/dc/terms/',
    },
  });

  // Separate nodes by type
  const datasetNodes = graph.nodes.filter((n) => n.label === 'Dataset');
  const fieldNodes = graph.nodes.filter((n) => n.label === 'Field');

  // Build node ID map for resolving edge endpoints
  const nodeMap = new Map<string, GraphNode>();
  for (const node of graph.nodes) {
    nodeMap.set(node.id, node);
  }

  // Build field-to-dataset mapping
  const datasetFieldsMap = new Map<string, GraphNode[]>();
  for (const field of fieldNodes) {
    const datasetName = field.properties.datasetName as string;
    if (!datasetFieldsMap.has(datasetName)) {
      datasetFieldsMap.set(datasetName, []);
    }
    datasetFieldsMap.get(datasetName)!.push(field);
  }

  // 1. Ontology metadata
  const ontologyUri = namedNode(`http://knecta.io/ontology#Ontology_${ontology.id}`);

  writer.addQuad(
    ontologyUri,
    namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    namedNode('http://knecta.io/ontology#Ontology'),
  );

  writer.addQuad(
    ontologyUri,
    namedNode('http://purl.org/dc/terms/title'),
    literal(ontology.name),
  );

  if (ontology.description) {
    writer.addQuad(
      ontologyUri,
      namedNode('http://purl.org/dc/terms/description'),
      literal(ontology.description),
    );
  }

  writer.addQuad(
    ontologyUri,
    namedNode('http://purl.org/dc/terms/created'),
    literal(ontology.createdAt.toISOString(), namedNode('http://www.w3.org/2001/XMLSchema#dateTime')),
  );

  writer.addQuad(
    ontologyUri,
    namedNode('http://knecta.io/ontology#nodeCount'),
    literal(String(ontology.nodeCount), namedNode('http://www.w3.org/2001/XMLSchema#integer')),
  );

  writer.addQuad(
    ontologyUri,
    namedNode('http://knecta.io/ontology#relationshipCount'),
    literal(String(ontology.relationshipCount), namedNode('http://www.w3.org/2001/XMLSchema#integer')),
  );

  // 2. Dataset nodes
  for (const dataset of datasetNodes) {
    const datasetUri = namedNode(`http://knecta.io/ontology#Dataset_${sanitizeUri(dataset.name)}`);

    // Link from ontology to dataset
    writer.addQuad(
      ontologyUri,
      namedNode('http://knecta.io/ontology#hasDataset'),
      datasetUri,
    );

    // Dataset type
    writer.addQuad(
      datasetUri,
      namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      namedNode('http://knecta.io/ontology#Dataset'),
    );

    // Dataset properties
    writer.addQuad(
      datasetUri,
      namedNode('http://www.w3.org/2000/01/rdf-schema#label'),
      literal(dataset.name),
    );

    if (dataset.properties.source) {
      writer.addQuad(
        datasetUri,
        namedNode('http://knecta.io/ontology#source'),
        literal(String(dataset.properties.source)),
      );
    }

    if (dataset.properties.description) {
      writer.addQuad(
        datasetUri,
        namedNode('http://www.w3.org/2000/01/rdf-schema#comment'),
        literal(String(dataset.properties.description)),
      );
    }

    // Link to fields
    const fields = datasetFieldsMap.get(dataset.name) || [];
    for (const field of fields) {
      const fieldUri = namedNode(
        `http://knecta.io/ontology#Field_${sanitizeUri(dataset.name)}_${sanitizeUri(field.name)}`,
      );
      writer.addQuad(
        datasetUri,
        namedNode('http://knecta.io/ontology#hasField'),
        fieldUri,
      );
    }
  }

  // 3. Field nodes
  for (const field of fieldNodes) {
    const datasetName = field.properties.datasetName as string;
    const fieldUri = namedNode(
      `http://knecta.io/ontology#Field_${sanitizeUri(datasetName)}_${sanitizeUri(field.name)}`,
    );

    // Field type
    writer.addQuad(
      fieldUri,
      namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      namedNode('http://knecta.io/ontology#Field'),
    );

    // Field properties
    writer.addQuad(
      fieldUri,
      namedNode('http://www.w3.org/2000/01/rdf-schema#label'),
      literal(field.name),
    );

    if (field.properties.expression) {
      writer.addQuad(
        fieldUri,
        namedNode('http://knecta.io/ontology#expression'),
        literal(String(field.properties.expression)),
      );
    }

    if (field.properties.label && field.properties.label !== field.name) {
      writer.addQuad(
        fieldUri,
        namedNode('http://knecta.io/ontology#fieldLabel'),
        literal(String(field.properties.label)),
      );
    }

    if (field.properties.description) {
      writer.addQuad(
        fieldUri,
        namedNode('http://www.w3.org/2000/01/rdf-schema#comment'),
        literal(String(field.properties.description)),
      );
    }

    // Link back to dataset
    const datasetUri = namedNode(`http://knecta.io/ontology#Dataset_${sanitizeUri(datasetName)}`);
    writer.addQuad(
      fieldUri,
      namedNode('http://knecta.io/ontology#belongsToDataset'),
      datasetUri,
    );
  }

  // 4. RELATES_TO relationships
  const relatesTo = graph.edges.filter((e) => e.type === 'RELATES_TO');
  for (const edge of relatesTo) {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);

    if (!sourceNode || !targetNode) {
      continue; // Skip if nodes not found
    }

    const relName = (edge.properties.name as string) || `${sourceNode.name}_to_${targetNode.name}`;
    const relUri = namedNode(`http://knecta.io/ontology#Rel_${sanitizeUri(relName)}`);

    // Relationship type
    writer.addQuad(
      relUri,
      namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      namedNode('http://knecta.io/ontology#Relationship'),
    );

    // Relationship properties
    writer.addQuad(
      relUri,
      namedNode('http://www.w3.org/2000/01/rdf-schema#label'),
      literal(relName),
    );

    const fromDatasetUri = namedNode(`http://knecta.io/ontology#Dataset_${sanitizeUri(sourceNode.name)}`);
    const toDatasetUri = namedNode(`http://knecta.io/ontology#Dataset_${sanitizeUri(targetNode.name)}`);

    writer.addQuad(
      relUri,
      namedNode('http://knecta.io/ontology#fromDataset'),
      fromDatasetUri,
    );

    writer.addQuad(
      relUri,
      namedNode('http://knecta.io/ontology#toDataset'),
      toDatasetUri,
    );

    // Parse column arrays from JSON strings
    try {
      const fromColumns = JSON.parse((edge.properties.fromColumns as string) || '[]') as string[];
      const toColumns = JSON.parse((edge.properties.toColumns as string) || '[]') as string[];

      if (fromColumns.length > 0) {
        writer.addQuad(
          relUri,
          namedNode('http://knecta.io/ontology#fromColumns'),
          literal(fromColumns.join(', ')),
        );
      }

      if (toColumns.length > 0) {
        writer.addQuad(
          relUri,
          namedNode('http://knecta.io/ontology#toColumns'),
          literal(toColumns.join(', ')),
        );
      }
    } catch (error) {
      // Skip column parsing if JSON is invalid
    }
  }

  // Return Turtle string
  let result = '';
  writer.end((error, turtle) => {
    if (error) {
      throw error;
    }
    result = turtle;
  });

  return result;
}
