import { Parser } from 'n3';
import { exportGraphToTurtle } from '../../../src/ontologies/utils/rdf-exporter.util';
import type { GraphNode, GraphEdge } from '../../../src/ontologies/neo-ontology.service';

// ==========================================
// Helper Functions for Test Data
// ==========================================

function createTestOntology(overrides?: Partial<{
  id: string;
  name: string;
  description: string | null;
  nodeCount: number;
  relationshipCount: number;
  createdAt: Date;
}>) {
  return {
    id: 'test-uuid-1234',
    name: 'Test Ontology',
    description: 'A test ontology',
    nodeCount: 5,
    relationshipCount: 2,
    createdAt: new Date('2026-02-19T12:00:00Z'),
    ...overrides,
  };
}

function createDatasetNode(name: string, properties?: Partial<GraphNode['properties']>): GraphNode {
  return {
    id: `neo4j-dataset-${name}`,
    label: 'Dataset' as const,
    name,
    properties: {
      ontologyId: 'test-uuid-1234',
      name,
      source: `public.${name}`,
      description: `${name} description`,
      yaml: `name: ${name}\nsource: public.${name}`,
      ...properties,
    },
  };
}

function createFieldNode(
  datasetName: string,
  fieldName: string,
  properties?: Partial<GraphNode['properties']>,
): GraphNode {
  return {
    id: `neo4j-field-${datasetName}-${fieldName}`,
    label: 'Field' as const,
    name: fieldName,
    properties: {
      ontologyId: 'test-uuid-1234',
      datasetName,
      name: fieldName,
      expression: fieldName,
      label: fieldName,
      description: `${fieldName} description`,
      yaml: `name: ${fieldName}\nexpression: ${fieldName}`,
      ...properties,
    },
  };
}

function createRelatesToEdge(
  source: string,
  target: string,
  relationshipName: string,
  properties?: Partial<GraphEdge['properties']>,
): GraphEdge {
  return {
    id: `edge-${relationshipName}`,
    source,
    target,
    type: 'RELATES_TO',
    properties: {
      name: relationshipName,
      from: 'orders',
      to: 'customers',
      fromColumns: '["customer_id"]',
      toColumns: '["id"]',
      yaml: `name: ${relationshipName}`,
      ...properties,
    },
  };
}

function createHasFieldEdge(datasetNodeId: string, fieldNodeId: string): GraphEdge {
  return {
    id: `edge-hasfield-${datasetNodeId}-${fieldNodeId}`,
    source: datasetNodeId,
    target: fieldNodeId,
    type: 'HAS_FIELD',
    properties: {},
  };
}

// ==========================================
// Prefix and Structure Tests
// ==========================================

describe('exportGraphToTurtle - Prefixes and Structure', () => {
  it('should return valid Turtle with all required prefixes', () => {
    const ontology = createTestOntology();
    const graph = { nodes: [], edges: [] };

    const turtle = exportGraphToTurtle(ontology, graph);

    expect(turtle).toContain('@prefix knecta:');
    expect(turtle).toContain('@prefix rdf:');
    expect(turtle).toContain('@prefix rdfs:');
    expect(turtle).toContain('@prefix xsd:');
    expect(turtle).toContain('@prefix dcterms:');
    expect(turtle).toContain('http://knecta.io/ontology#');
    expect(turtle).toContain('http://www.w3.org/1999/02/22-rdf-syntax-ns#');
    expect(turtle).toContain('http://www.w3.org/2000/01/rdf-schema#');
    expect(turtle).toContain('http://www.w3.org/2001/XMLSchema#');
    expect(turtle).toContain('http://purl.org/dc/terms/');
  });

  it('should create ontology metadata triples', () => {
    const ontology = createTestOntology();
    const graph = { nodes: [], edges: [] };

    const turtle = exportGraphToTurtle(ontology, graph);

    expect(turtle).toContain('knecta:Ontology_test-uuid-1234');
    expect(turtle).toContain('a knecta:Ontology');
    expect(turtle).toContain('dcterms:title "Test Ontology"');
    expect(turtle).toContain('dcterms:created "2026-02-19T12:00:00.000Z"^^xsd:dateTime');
    // N3 Writer doesn't quote integer literals in output
    expect(turtle).toContain('knecta:nodeCount 5');
    expect(turtle).toContain('knecta:relationshipCount 2');
  });

  it('should include ontology description when present', () => {
    const ontology = createTestOntology({ description: 'A test ontology' });
    const graph = { nodes: [], edges: [] };

    const turtle = exportGraphToTurtle(ontology, graph);

    expect(turtle).toContain('dcterms:description "A test ontology"');
  });

  it('should omit description triple when description is null', () => {
    const ontology = createTestOntology({ description: null });
    const graph = { nodes: [], edges: [] };

    const turtle = exportGraphToTurtle(ontology, graph);

    expect(turtle).not.toContain('dcterms:description');
  });

  it('should handle empty graph without throwing', () => {
    const ontology = createTestOntology();
    const graph = { nodes: [], edges: [] };

    expect(() => exportGraphToTurtle(ontology, graph)).not.toThrow();

    const turtle = exportGraphToTurtle(ontology, graph);
    expect(turtle).toContain('knecta:Ontology_test-uuid-1234');
    expect(turtle).toContain('a knecta:Ontology');
  });
});

// ==========================================
// Dataset Node Tests
// ==========================================

describe('exportGraphToTurtle - Dataset Nodes', () => {
  it('should create Dataset triples with all properties', () => {
    const ontology = createTestOntology();
    const customersDataset = createDatasetNode('customers', {
      source: 'public.customers',
      description: 'Customer records',
    });
    const graph = { nodes: [customersDataset], edges: [] };

    const turtle = exportGraphToTurtle(ontology, graph);

    expect(turtle).toContain('knecta:Dataset_customers');
    expect(turtle).toContain('a knecta:Dataset');
    expect(turtle).toContain('rdfs:label "customers"');
    expect(turtle).toContain('knecta:source "public.customers"');
    expect(turtle).toContain('rdfs:comment "Customer records"');
  });

  it('should link ontology to datasets via knecta:hasDataset', () => {
    const ontology = createTestOntology();
    const customersDataset = createDatasetNode('customers');
    const ordersDataset = createDatasetNode('orders');
    const graph = { nodes: [customersDataset, ordersDataset], edges: [] };

    const turtle = exportGraphToTurtle(ontology, graph);

    expect(turtle).toContain('knecta:Ontology_test-uuid-1234');
    expect(turtle).toContain('knecta:hasDataset knecta:Dataset_customers');
    expect(turtle).toContain('knecta:hasDataset knecta:Dataset_orders');
  });

  it('should handle special characters in dataset names by sanitizing URIs', () => {
    const ontology = createTestOntology();
    const dataset = createDatasetNode('my table!', {
      source: 'public.my table!',
    });
    const graph = { nodes: [dataset], edges: [] };

    const turtle = exportGraphToTurtle(ontology, graph);

    // Special characters should be replaced with underscores in URIs
    expect(turtle).toContain('knecta:Dataset_my_table_');
    // Label should preserve original name
    expect(turtle).toContain('rdfs:label "my table!"');
  });

  it('should omit rdfs:comment when dataset has no description', () => {
    const ontology = createTestOntology();
    const dataset = createDatasetNode('customers', { description: undefined });
    const graph = { nodes: [dataset], edges: [] };

    const turtle = exportGraphToTurtle(ontology, graph);

    expect(turtle).toContain('knecta:Dataset_customers');
    expect(turtle).not.toContain('rdfs:comment');
  });

  it('should omit knecta:source when dataset has no source', () => {
    const ontology = createTestOntology();
    const dataset = createDatasetNode('customers', { source: undefined });
    const graph = { nodes: [dataset], edges: [] };

    const turtle = exportGraphToTurtle(ontology, graph);

    expect(turtle).toContain('knecta:Dataset_customers');
    expect(turtle).not.toContain('knecta:source');
  });
});

// ==========================================
// Field Node Tests
// ==========================================

describe('exportGraphToTurtle - Field Nodes', () => {
  it('should create Field triples with all properties', () => {
    const ontology = createTestOntology();
    const customersDataset = createDatasetNode('customers');
    const customerIdField = createFieldNode('customers', 'customer_id', {
      expression: 'customer_id',
      label: 'Customer ID',
      description: 'Unique identifier',
    });
    const graph = { nodes: [customersDataset, customerIdField], edges: [] };

    const turtle = exportGraphToTurtle(ontology, graph);

    expect(turtle).toContain('knecta:Field_customers_customer_id');
    expect(turtle).toContain('a knecta:Field');
    expect(turtle).toContain('rdfs:label "customer_id"');
    expect(turtle).toContain('knecta:expression "customer_id"');
    expect(turtle).toContain('knecta:fieldLabel "Customer ID"');
    expect(turtle).toContain('rdfs:comment "Unique identifier"');
    expect(turtle).toContain('knecta:belongsToDataset knecta:Dataset_customers');
  });

  it('should skip knecta:fieldLabel when label matches name', () => {
    const ontology = createTestOntology();
    const customersDataset = createDatasetNode('customers');
    const idField = createFieldNode('customers', 'id', {
      label: 'id', // Same as name
    });
    const graph = { nodes: [customersDataset, idField], edges: [] };

    const turtle = exportGraphToTurtle(ontology, graph);

    expect(turtle).toContain('knecta:Field_customers_id');
    expect(turtle).toContain('rdfs:label "id"');
    expect(turtle).not.toContain('knecta:fieldLabel');
  });

  it('should link datasets to fields via knecta:hasField', () => {
    const ontology = createTestOntology();
    const customersDataset = createDatasetNode('customers');
    const idField = createFieldNode('customers', 'id');
    const nameField = createFieldNode('customers', 'name');
    const graph = { nodes: [customersDataset, idField, nameField], edges: [] };

    const turtle = exportGraphToTurtle(ontology, graph);

    expect(turtle).toContain('knecta:Dataset_customers');
    // N3 Writer may combine multiple values with commas, so check for the field URIs
    expect(turtle).toContain('knecta:Field_customers_id');
    expect(turtle).toContain('knecta:Field_customers_name');
    expect(turtle).toMatch(/knecta:hasField.*knecta:Field_customers_id/);
  });

  it('should handle special characters in field names by sanitizing URIs', () => {
    const ontology = createTestOntology();
    const dataset = createDatasetNode('customers');
    const field = createFieldNode('customers', 'col name', {
      expression: 'col name',
    });
    const graph = { nodes: [dataset, field], edges: [] };

    const turtle = exportGraphToTurtle(ontology, graph);

    // Special characters should be replaced with underscores in URIs
    expect(turtle).toContain('knecta:Field_customers_col_name');
    // Label should preserve original name
    expect(turtle).toContain('rdfs:label "col name"');
  });

  it('should omit field rdfs:comment when field has no description', () => {
    const ontology = createTestOntology();
    // Also remove dataset description to avoid any rdfs:comment
    const dataset = createDatasetNode('customers', { description: undefined });
    const field = createFieldNode('customers', 'id', { description: undefined });
    const graph = { nodes: [dataset, field], edges: [] };

    const turtle = exportGraphToTurtle(ontology, graph);

    expect(turtle).toContain('knecta:Field_customers_id');
    expect(turtle).not.toContain('rdfs:comment');
  });

  it('should omit knecta:expression when field has no expression', () => {
    const ontology = createTestOntology();
    const dataset = createDatasetNode('customers');
    const field = createFieldNode('customers', 'id', { expression: undefined });
    const graph = { nodes: [dataset, field], edges: [] };

    const turtle = exportGraphToTurtle(ontology, graph);

    expect(turtle).toContain('knecta:Field_customers_id');
    expect(turtle).not.toContain('knecta:expression');
  });
});

// ==========================================
// Relationship Edge Tests
// ==========================================

describe('exportGraphToTurtle - RELATES_TO Relationships', () => {
  it('should create Relationship triples from RELATES_TO edges', () => {
    const ontology = createTestOntology();
    const customersDataset = createDatasetNode('customers');
    const ordersDataset = createDatasetNode('orders');
    const relatesToEdge = createRelatesToEdge(
      ordersDataset.id,
      customersDataset.id,
      'fk_orders_customer',
      {
        from: 'orders',
        to: 'customers',
        fromColumns: '["customer_id"]',
        toColumns: '["id"]',
      },
    );
    const graph = { nodes: [customersDataset, ordersDataset], edges: [relatesToEdge] };

    const turtle = exportGraphToTurtle(ontology, graph);

    expect(turtle).toContain('knecta:Rel_fk_orders_customer');
    expect(turtle).toContain('a knecta:Relationship');
    expect(turtle).toContain('rdfs:label "fk_orders_customer"');
    expect(turtle).toContain('knecta:fromDataset knecta:Dataset_orders');
    expect(turtle).toContain('knecta:toDataset knecta:Dataset_customers');
    expect(turtle).toContain('knecta:fromColumns "customer_id"');
    expect(turtle).toContain('knecta:toColumns "id"');
  });

  it('should handle multiple columns in fromColumns and toColumns', () => {
    const ontology = createTestOntology();
    const dataset1 = createDatasetNode('table1');
    const dataset2 = createDatasetNode('table2');
    const relatesToEdge = createRelatesToEdge(dataset1.id, dataset2.id, 'fk_composite', {
      fromColumns: '["col1", "col2"]',
      toColumns: '["id1", "id2"]',
    });
    const graph = { nodes: [dataset1, dataset2], edges: [relatesToEdge] };

    const turtle = exportGraphToTurtle(ontology, graph);

    expect(turtle).toContain('knecta:fromColumns "col1, col2"');
    expect(turtle).toContain('knecta:toColumns "id1, id2"');
  });

  it('should generate default relationship name when name is missing', () => {
    const ontology = createTestOntology();
    const customersDataset = createDatasetNode('customers');
    const ordersDataset = createDatasetNode('orders');
    const relatesToEdge = createRelatesToEdge(ordersDataset.id, customersDataset.id, '', {
      name: undefined,
    });
    const graph = { nodes: [customersDataset, ordersDataset], edges: [relatesToEdge] };

    const turtle = exportGraphToTurtle(ontology, graph);

    // Should use default format: orders_to_customers
    expect(turtle).toContain('knecta:Rel_orders_to_customers');
    expect(turtle).toContain('rdfs:label "orders_to_customers"');
  });

  it('should skip RELATES_TO edge if source node not found', () => {
    const ontology = createTestOntology();
    const customersDataset = createDatasetNode('customers');
    const relatesToEdge = createRelatesToEdge('invalid-source-id', customersDataset.id, 'fk_test');
    const graph = { nodes: [customersDataset], edges: [relatesToEdge] };

    const turtle = exportGraphToTurtle(ontology, graph);

    expect(turtle).not.toContain('knecta:Rel_fk_test');
  });

  it('should skip RELATES_TO edge if target node not found', () => {
    const ontology = createTestOntology();
    const ordersDataset = createDatasetNode('orders');
    const relatesToEdge = createRelatesToEdge(ordersDataset.id, 'invalid-target-id', 'fk_test');
    const graph = { nodes: [ordersDataset], edges: [relatesToEdge] };

    const turtle = exportGraphToTurtle(ontology, graph);

    expect(turtle).not.toContain('knecta:Rel_fk_test');
  });

  it('should handle invalid JSON in fromColumns/toColumns gracefully', () => {
    const ontology = createTestOntology();
    const dataset1 = createDatasetNode('table1');
    const dataset2 = createDatasetNode('table2');
    const relatesToEdge = createRelatesToEdge(dataset1.id, dataset2.id, 'fk_bad_json', {
      fromColumns: 'not-valid-json',
      toColumns: '{also-not-valid}',
    });
    const graph = { nodes: [dataset1, dataset2], edges: [relatesToEdge] };

    expect(() => exportGraphToTurtle(ontology, graph)).not.toThrow();

    const turtle = exportGraphToTurtle(ontology, graph);

    // Relationship should still be created, just without column info
    expect(turtle).toContain('knecta:Rel_fk_bad_json');
    expect(turtle).not.toContain('knecta:fromColumns');
    expect(turtle).not.toContain('knecta:toColumns');
  });

  it('should omit column properties when arrays are empty', () => {
    const ontology = createTestOntology();
    const dataset1 = createDatasetNode('table1');
    const dataset2 = createDatasetNode('table2');
    const relatesToEdge = createRelatesToEdge(dataset1.id, dataset2.id, 'fk_no_columns', {
      fromColumns: '[]',
      toColumns: '[]',
    });
    const graph = { nodes: [dataset1, dataset2], edges: [relatesToEdge] };

    const turtle = exportGraphToTurtle(ontology, graph);

    expect(turtle).toContain('knecta:Rel_fk_no_columns');
    expect(turtle).not.toContain('knecta:fromColumns');
    expect(turtle).not.toContain('knecta:toColumns');
  });

  it('should sanitize special characters in relationship names', () => {
    const ontology = createTestOntology();
    const dataset1 = createDatasetNode('table1');
    const dataset2 = createDatasetNode('table2');
    const relatesToEdge = createRelatesToEdge(dataset1.id, dataset2.id, 'fk-with-dashes!', {
      name: 'fk-with-dashes!',
    });
    const graph = { nodes: [dataset1, dataset2], edges: [relatesToEdge] };

    const turtle = exportGraphToTurtle(ontology, graph);

    expect(turtle).toContain('knecta:Rel_fk_with_dashes_');
    expect(turtle).toContain('rdfs:label "fk-with-dashes!"');
  });
});

// ==========================================
// HAS_FIELD Edge Tests
// ==========================================

describe('exportGraphToTurtle - HAS_FIELD Edges', () => {
  it('should not create separate triples for HAS_FIELD edges', () => {
    const ontology = createTestOntology();
    const dataset = createDatasetNode('customers');
    const field = createFieldNode('customers', 'id');
    const hasFieldEdge = createHasFieldEdge(dataset.id, field.id);
    const graph = { nodes: [dataset, field], edges: [hasFieldEdge] };

    const turtle = exportGraphToTurtle(ontology, graph);

    // HAS_FIELD relationships are modeled as properties (knecta:hasField)
    // not separate relationship entities
    expect(turtle).toContain('knecta:hasField knecta:Field_customers_id');

    // Should not create a separate HAS_FIELD relationship entity
    expect(turtle).not.toContain('a knecta:HAS_FIELD');
  });
});

// ==========================================
// Complex Graph Tests
// ==========================================

describe('exportGraphToTurtle - Complex Graphs', () => {
  it('should handle complete graph with datasets, fields, and relationships', () => {
    const ontology = createTestOntology();

    const customersDataset = createDatasetNode('customers');
    const customersIdField = createFieldNode('customers', 'id', { label: 'Customer ID' });
    const customersNameField = createFieldNode('customers', 'name', { label: 'Name' });

    const ordersDataset = createDatasetNode('orders');
    const ordersIdField = createFieldNode('orders', 'id', { label: 'Order ID' });
    const ordersCustomerIdField = createFieldNode('orders', 'customer_id', {
      label: 'Customer ID',
    });

    const relatesToEdge = createRelatesToEdge(ordersDataset.id, customersDataset.id, 'fk_orders_customer');

    const graph = {
      nodes: [
        customersDataset,
        customersIdField,
        customersNameField,
        ordersDataset,
        ordersIdField,
        ordersCustomerIdField,
      ],
      edges: [relatesToEdge],
    };

    const turtle = exportGraphToTurtle(ontology, graph);

    // Verify ontology metadata
    expect(turtle).toContain('knecta:Ontology_test-uuid-1234');

    // Verify datasets
    expect(turtle).toContain('knecta:Dataset_customers');
    expect(turtle).toContain('knecta:Dataset_orders');

    // Verify fields
    expect(turtle).toContain('knecta:Field_customers_id');
    expect(turtle).toContain('knecta:Field_customers_name');
    expect(turtle).toContain('knecta:Field_orders_id');
    expect(turtle).toContain('knecta:Field_orders_customer_id');

    // Verify relationships
    expect(turtle).toContain('knecta:Rel_fk_orders_customer');

    // Verify links (N3 Writer may use compact format with commas)
    expect(turtle).toContain('knecta:hasDataset');
    expect(turtle).toContain('knecta:Dataset_customers');
    expect(turtle).toContain('knecta:Dataset_orders');
    expect(turtle).toMatch(/knecta:hasField.*knecta:Field_customers_id/);
    expect(turtle).toMatch(/knecta:hasField.*knecta:Field_orders_/);
    expect(turtle).toContain('knecta:belongsToDataset knecta:Dataset_customers');
    expect(turtle).toContain('knecta:belongsToDataset knecta:Dataset_orders');
  });

  it('should handle multiple relationships between datasets', () => {
    const ontology = createTestOntology();

    const users = createDatasetNode('users');
    const posts = createDatasetNode('posts');

    const authorRelationship = createRelatesToEdge(posts.id, users.id, 'fk_posts_author', {
      name: 'fk_posts_author',
      fromColumns: '["author_id"]',
      toColumns: '["id"]',
    });

    const editorRelationship = createRelatesToEdge(posts.id, users.id, 'fk_posts_editor', {
      name: 'fk_posts_editor',
      fromColumns: '["editor_id"]',
      toColumns: '["id"]',
    });

    const graph = {
      nodes: [users, posts],
      edges: [authorRelationship, editorRelationship],
    };

    const turtle = exportGraphToTurtle(ontology, graph);

    expect(turtle).toContain('knecta:Rel_fk_posts_author');
    expect(turtle).toContain('knecta:fromColumns "author_id"');
    expect(turtle).toContain('knecta:Rel_fk_posts_editor');
    expect(turtle).toContain('knecta:fromColumns "editor_id"');
  });
});

// ==========================================
// Round-Trip Validation Tests
// ==========================================

describe('exportGraphToTurtle - Round-Trip Validation', () => {
  it('should produce parseable Turtle that can be validated', () => {
    const ontology = createTestOntology();
    const customersDataset = createDatasetNode('customers');
    const idField = createFieldNode('customers', 'id');
    const graph = { nodes: [customersDataset, idField], edges: [] };

    const turtle = exportGraphToTurtle(ontology, graph);

    const parser = new Parser();
    const quads = parser.parse(turtle);

    expect(quads.length).toBeGreaterThan(0);
  });

  it('should produce correct number of quads for complex graph', () => {
    const ontology = createTestOntology();

    const dataset1 = createDatasetNode('customers');
    const dataset2 = createDatasetNode('orders');
    const field1 = createFieldNode('customers', 'id');
    const field2 = createFieldNode('orders', 'id');

    const relatesToEdge = createRelatesToEdge(dataset2.id, dataset1.id, 'fk_test', {
      fromColumns: '["customer_id"]',
      toColumns: '["id"]',
    });

    const graph = {
      nodes: [dataset1, dataset2, field1, field2],
      edges: [relatesToEdge],
    };

    const turtle = exportGraphToTurtle(ontology, graph);

    const parser = new Parser();
    const quads = parser.parse(turtle);

    // Expected quads:
    // Ontology: 6 (type, title, description, created, nodeCount, relationshipCount)
    // Ontology → Datasets: 2 (hasDataset for each dataset)
    // Dataset1: 4 (type, label, source, comment)
    // Dataset2: 4 (type, label, source, comment)
    // Dataset → Fields: 2 (hasField for each field)
    // Field1: 6 (type, label, expression, fieldLabel omitted, comment, belongsToDataset)
    // Field2: 6 (type, label, expression, fieldLabel omitted, comment, belongsToDataset)
    // Relationship: 6 (type, label, fromDataset, toDataset, fromColumns, toColumns)
    // Total: ~36 quads (some may be omitted based on data)
    expect(quads.length).toBeGreaterThan(30);
  });

  it('should produce valid RDF for empty graph', () => {
    const ontology = createTestOntology();
    const graph = { nodes: [], edges: [] };

    const turtle = exportGraphToTurtle(ontology, graph);

    const parser = new Parser();
    const quads = parser.parse(turtle);

    // Should have at least ontology metadata quads
    // (type, title, description, created, nodeCount, relationshipCount)
    expect(quads.length).toBeGreaterThanOrEqual(6);
  });

  it('should handle graph with only datasets (no fields)', () => {
    const ontology = createTestOntology();
    const dataset1 = createDatasetNode('customers');
    const dataset2 = createDatasetNode('orders');
    const graph = { nodes: [dataset1, dataset2], edges: [] };

    const turtle = exportGraphToTurtle(ontology, graph);

    const parser = new Parser();
    const quads = parser.parse(turtle);

    expect(quads.length).toBeGreaterThan(0);
    expect(turtle).toContain('knecta:Dataset_customers');
    expect(turtle).toContain('knecta:Dataset_orders');
  });

  it('should handle graph with only fields (orphaned fields)', () => {
    const ontology = createTestOntology();
    const field1 = createFieldNode('customers', 'id');
    const field2 = createFieldNode('customers', 'name');
    const graph = { nodes: [field1, field2], edges: [] };

    const turtle = exportGraphToTurtle(ontology, graph);

    const parser = new Parser();
    const quads = parser.parse(turtle);

    expect(quads.length).toBeGreaterThan(0);
    expect(turtle).toContain('knecta:Field_customers_id');
    expect(turtle).toContain('knecta:Field_customers_name');
  });
});
