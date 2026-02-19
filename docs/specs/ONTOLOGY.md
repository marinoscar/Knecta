# Ontology Feature Specification

## Table of Contents

1. [Feature Overview](#feature-overview)
2. [Architecture](#architecture)
3. [Neo4j Graph Schema](#neo4j-graph-schema)
4. [Database Schema](#database-schema)
5. [API Endpoints](#api-endpoints)
6. [Security](#security)
7. [RBAC Permissions](#rbac-permissions)
8. [Data Flow](#data-flow)
9. [Frontend Components](#frontend-components)
10. [Key Patterns for Reuse](#key-patterns-for-reuse)
11. [File Inventory](#file-inventory)
12. [Testing](#testing)
13. [Configuration](#configuration)

---

## Feature Overview

The Ontology feature transforms semantic models into interactive graph-based representations using Neo4j. Users can visualize dataset relationships, explore field-level details, and inspect individual nodes with their YAML definitions.

### Core Capabilities

- **Graph Transformation**: Convert "ready" semantic models into Neo4j graph ontologies
- **Interactive Visualization**: Explore datasets and relationships using graph-based UI
- **Node Inspection**: View individual dataset/field nodes with full YAML definitions
- **Namespace Isolation**: Multi-tenancy via `ontologyId` property on all nodes
- **Relationship Exploration**: Navigate foreign key and inferred relationships visually
- **YAML Integration**: Each node contains its OSI YAML representation

### Use Cases

1. **Data Analysts**: Visually explore data lineage and field relationships
2. **Data Engineers**: Understand complex database schemas through graph visualization
3. **Business Users**: Navigate data models without SQL knowledge
4. **Data Architects**: Validate semantic models and relationship accuracy

### Current Limitations

- **PostgreSQL Only**: Ontologies can only be created from semantic models built on PostgreSQL connections
- **Read-Only Visualization**: Currently no support for graph-based editing (edit via semantic model)
- **No Graph Algorithms**: Future enhancement for path finding, centrality analysis, etc.

---

## Architecture

The feature uses a dual-database architecture with PostgreSQL for metadata and Neo4j for graph storage:

```
┌─────────────────────────────────────────────────────────────┐
│                       Frontend Layer                        │
│  React + Material UI + react-force-graph-2d                 │
│                                                               │
│  OntologiesPage (list view)                                 │
│         ↓                                                    │
│  CreateOntologyDialog (select semantic model)               │
│         ↓                                                    │
│  OntologyDetailPage (graph visualization)                   │
│         ↓                                                    │
│  OntologyGraph (interactive graph viewer)                   │
│         ↓                                                    │
│  NodeInspector (YAML detail view)                           │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTPS (Nginx)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                       Backend Layer                         │
│  NestJS + Fastify + TypeScript                              │
│                                                               │
│  OntologiesController (REST API)                            │
│         ↓                                                    │
│  OntologiesService (Business Logic, PG CRUD)                │
│         ↓                                                    │
│  NeoOntologyService (Neo4j Graph Operations)                │
│         ↓                                                    │
│  Neo4j Driver (Cypher Queries)                              │
└────────────────────────────┬───────────────┬────────────────┘
                             │               │
                             ▼               ▼
┌──────────────────────────────┐  ┌──────────────────────────┐
│     PostgreSQL Database      │  │    Neo4j Graph Database  │
│  - ontologies table          │  │  - Dataset nodes         │
│  - Metadata, counts, status  │  │  - Field nodes           │
│  - Foreign keys to models    │  │  - HAS_FIELD edges       │
└──────────────────────────────┘  │  - RELATES_TO edges      │
                                  │  - ontologyId isolation  │
                                  └──────────────────────────┘
```

### System Components

#### Backend
- **OntologiesController**: REST API endpoints for CRUD operations
- **OntologiesService**: Business logic, PostgreSQL operations, validation
- **NeoOntologyService**: Neo4j graph creation, deletion, and queries
- **NeoGraphModule**: Global module providing Neo4j driver lifecycle management

#### Frontend
- **OntologiesPage**: List page with table view
- **CreateOntologyDialog**: Modal for selecting semantic model and creating ontology
- **OntologyDetailPage**: Main visualization page with graph and inspector
- **OntologyGraph**: Interactive graph component (react-force-graph-2d)
- **NodeInspector**: Side panel showing YAML details for selected node

#### Database Layer
- **PostgreSQL**: Stores ontology metadata (name, status, counts, ownership)
- **Neo4j**: Stores graph data (nodes, relationships) with namespace isolation

---

## Neo4j Graph Schema

### Node Labels

| Label | Properties | Description |
|-------|-----------|-------------|
| **Dataset** | `ontologyId`, `name`, `source`, `description`, `yaml` | Represents a table/view from the semantic model |
| **Field** | `ontologyId`, `datasetName`, `name`, `expression`, `label`, `description`, `yaml` | Represents a column/field within a dataset |

### Node Properties

#### Dataset Node
```typescript
{
  ontologyId: string;        // UUID namespace isolation
  name: string;              // Dataset name (e.g., "customers")
  source: string;            // Schema-qualified table name (e.g., "public.customers")
  description?: string;      // Business description
  yaml: string;              // Full OSI YAML for this dataset
}
```

#### Field Node
```typescript
{
  ontologyId: string;        // UUID namespace isolation
  datasetName: string;       // Parent dataset name
  name: string;              // Field name (e.g., "customer_id")
  expression?: string;       // SQL expression (for calculated fields)
  label?: string;            // Display label
  description?: string;      // Business description
  type: string;              // Data type (integer, varchar, etc.)
  primaryKey?: boolean;      // Is primary key
  nullable?: boolean;        // Is nullable
  yaml: string;              // Full OSI YAML for this field
}
```

### Relationship Types

| Type | Direction | Properties | Description |
|------|-----------|-----------|-------------|
| **HAS_FIELD** | Dataset → Field | (none) | Dataset contains this field |
| **RELATES_TO** | Dataset → Dataset | `name`, `from`, `to`, `fromColumns`, `toColumns`, `yaml` | Foreign key or inferred relationship |

### Relationship Properties

#### HAS_FIELD
```typescript
// No properties (simple containment relationship)
```

#### RELATES_TO
```typescript
{
  name: string;              // Relationship name (e.g., "fk_orders_customer_id")
  from: string;              // Source dataset name
  to: string;                // Target dataset name
  fromColumns: string;       // JSON-stringified source column names
  toColumns: string;         // JSON-stringified target column names
  yaml: string;              // Full OSI YAML for this relationship
}
```

### Example Cypher Queries

#### Create Dataset Node
```cypher
CREATE (d:Dataset {
  ontologyId: $ontologyId,
  name: $name,
  source: $source,
  description: $description,
  yaml: $yaml
})
RETURN d
```

#### Create Field Node with Relationship
```cypher
MATCH (d:Dataset {ontologyId: $ontologyId, name: $datasetName})
CREATE (f:Field {
  ontologyId: $ontologyId,
  datasetName: $datasetName,
  name: $name,
  type: $type,
  description: $description,
  primaryKey: $primaryKey,
  nullable: $nullable,
  yaml: $yaml
})
CREATE (d)-[:HAS_FIELD]->(f)
RETURN f
```

#### Create Relationship Between Datasets
```cypher
UNWIND $relationships AS r
MATCH (from:Dataset {ontologyId: $ontologyId, name: r.fromDataset})
MATCH (to:Dataset {ontologyId: $ontologyId, name: r.toDataset})
CREATE (from)-[:RELATES_TO {
  name: r.name,
  from: r.from,
  to: r.to,
  fromColumns: r.fromColumns,
  toColumns: r.toColumns,
  yaml: r.yaml
}]->(to)
```

#### Get Full Graph for Ontology
```cypher
MATCH (d:Dataset {ontologyId: $ontologyId})
OPTIONAL MATCH (d)-[:HAS_FIELD]->(f:Field)
OPTIONAL MATCH (d)-[r:RELATES_TO]->(d2:Dataset {ontologyId: $ontologyId})
RETURN d, f, r, d2
```

#### Delete Ontology Graph
```cypher
MATCH (n {ontologyId: $ontologyId})
DETACH DELETE n
```

---

## Database Schema

### Ontology Model (Prisma)

Located in `apps/api/prisma/schema.prisma`:

```prisma
enum OntologyStatus {
  creating
  ready
  failed
}

model Ontology {
  id                  String           @id @default(uuid()) @db.Uuid
  name                String
  description         String?
  semanticModelId     String           @map("semantic_model_id") @db.Uuid
  status              OntologyStatus   @default(creating)
  datasetCount        Int              @default(0) @map("dataset_count")
  fieldCount          Int              @default(0) @map("field_count")
  relationshipCount   Int              @default(0) @map("relationship_count")
  createdByUserId     String?          @map("created_by_user_id") @db.Uuid
  createdAt           DateTime         @default(now()) @map("created_at") @db.Timestamptz
  updatedAt           DateTime         @updatedAt @map("updated_at") @db.Timestamptz

  // Relations
  semanticModel SemanticModel @relation("OntologySemanticModel", fields: [semanticModelId], references: [id], onDelete: Cascade)
  createdByUser User?         @relation("UserOntologies", fields: [createdByUserId], references: [id], onDelete: SetNull)

  @@index([createdByUserId])
  @@index([semanticModelId])
  @@index([status])
  @@map("ontologies")
}
```

### Field Definitions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | Primary key, also used as `ontologyId` in Neo4j |
| `name` | String | Yes | User-defined ontology name |
| `description` | String | No | Optional description |
| `semanticModelId` | UUID | Yes | Foreign key to semantic_models.id |
| `status` | Enum | Yes | Creation status (creating, ready, failed) |
| `datasetCount` | Integer | Yes | Number of Dataset nodes in graph (default: 0) |
| `fieldCount` | Integer | Yes | Number of Field nodes in graph (default: 0) |
| `relationshipCount` | Integer | Yes | Number of RELATES_TO relationships (default: 0) |
| `createdByUserId` | UUID | No | Foreign key to users.id (for audit, nullable) |
| `createdAt` | Timestamp | Yes | Record creation time |
| `updatedAt` | Timestamp | Yes | Last update time |

### Indexes

- `createdByUserId` - Track creator for audit purposes
- `semanticModelId` - Find ontology for a semantic model
- `status` - Filter by creation status

---

## API Endpoints

All endpoints require authentication. Base path: `/api/ontologies`

### 1. List Ontologies

```http
GET /api/ontologies
```

**Query Parameters:**
- `page` (number, default: 1) - Page number
- `pageSize` (number, default: 20) - Items per page
- `search` (string, optional) - Search in name/description
- `status` (enum, optional) - Filter by status (creating, ready, failed)
- `semanticModelId` (UUID, optional) - Filter by semantic model
- `sortBy` (enum, default: 'createdAt') - Sort field (name, status, createdAt, datasetCount)
- `sortOrder` (enum, default: 'desc') - Sort direction (asc, desc)

**Permission:** `ontologies:read`

**Response (200):**
```json
{
  "data": {
    "items": [
      {
        "id": "uuid",
        "name": "Sales Analytics Ontology",
        "description": "Graph representation of sales data",
        "semanticModelId": "uuid",
        "status": "ready",
        "datasetCount": 8,
        "fieldCount": 45,
        "relationshipCount": 12,
        "createdByUserId": "uuid",
        "createdAt": "2024-01-01T00:00:00Z",
        "updatedAt": "2024-01-15T10:30:00Z"
      }
    ],
    "total": 15,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```

---

### 2. Get Ontology by ID

```http
GET /api/ontologies/:id
```

**Parameters:**
- `id` (UUID, path) - Ontology ID

**Permission:** `ontologies:read`

**Response (200):** Single ontology object with metadata

**Response (404):** Ontology not found

---

### 3. Create Ontology

```http
POST /api/ontologies
```

**Permission:** `ontologies:write`

**Request Body:**
```json
{
  "name": "Sales Analytics Ontology",
  "description": "Graph representation of sales data",
  "semanticModelId": "uuid"
}
```

**Validation Rules:**
- `name`: Required, 1-255 characters
- `description`: Optional, max 1000 characters
- `semanticModelId`: Required, must reference a "ready" semantic model

**Response (201):**
```json
{
  "data": {
    "id": "uuid",
    "name": "Sales Analytics Ontology",
    "status": "creating",
    "createdByUserId": "uuid",
    "createdAt": "2024-01-15T10:00:00Z"
  }
}
```

**Response (400):** Validation error or semantic model not ready

**Response (404):** Semantic model not found

**Side Effects:**
- Creates `Ontology` record with status "creating"
- Initiates synchronous Neo4j graph creation
- Updates status to "ready" or "failed" on completion

**Process:**
1. Validate semantic model is "ready"
2. Create ontology record in PostgreSQL (createdByUserId: userId)
3. Parse OSI model from semantic model
4. Create Dataset nodes in Neo4j
5. Create Field nodes with HAS_FIELD relationships
6. Create RELATES_TO relationships between datasets
7. Update ontology status and counts

---

### 4. Delete Ontology

```http
DELETE /api/ontologies/:id
```

**Permission:** `ontologies:delete`

**Response (204):** No content (success)

**Response (404):** Ontology not found

**Side Effects:**
- Deletes ontology record from PostgreSQL
- Deletes all Neo4j nodes/relationships with matching `ontologyId`
- Creates audit event

---

### 5. Get Ontology Graph

```http
GET /api/ontologies/:id/graph
```

**Permission:** `ontologies:read`

**Response (200):**
```json
{
  "data": {
    "nodes": [
      {
        "id": "customers",
        "label": "Dataset",
        "properties": {
          "name": "customers",
          "source": "public.customers",
          "description": "Customer master data",
          "fieldCount": 5
        }
      },
      {
        "id": "customers.customer_id",
        "label": "Field",
        "properties": {
          "name": "customer_id",
          "type": "integer",
          "primaryKey": true,
          "description": "Unique customer identifier"
        }
      }
    ],
    "edges": [
      {
        "id": "customers-HAS_FIELD-customer_id",
        "source": "customers",
        "target": "customers.customer_id",
        "label": "HAS_FIELD"
      },
      {
        "id": "orders-RELATES_TO-customers",
        "source": "orders",
        "target": "customers",
        "label": "RELATES_TO",
        "properties": {
          "name": "fk_orders_customer_id",
          "from": "orders",
          "to": "customers",
          "fromColumns": "[\"customer_id\"]",
          "toColumns": "[\"customer_id\"]",
          "yaml": "name: fk_orders_customer_id\nfrom:\n  dataset: orders\n  field: customer_id\nto:\n  dataset: customers\n  field: customer_id\n"
        }
      }
    ]
  }
}
```

**Response (404):** Ontology not found

**Note:** Returns graph data formatted for react-force-graph-2d visualization.

---

### 6. Export Ontology as RDF

```http
GET /api/ontologies/:id/rdf
```

**Permission:** `ontologies:read`

**Response (200):**
```json
{
  "data": {
    "rdf": "@prefix knecta: <http://knecta.io/ontology#> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n...",
    "name": "Sales Analytics Ontology"
  }
}
```

**Response (400):** Ontology not in ready status

**Response (404):** Ontology not found

**RDF Format:** Turtle (.ttl)

**Namespaces:**

| Prefix | URI |
|--------|-----|
| `knecta:` | `http://knecta.io/ontology#` |
| `rdf:` | `http://www.w3.org/1999/02/22-rdf-syntax-ns#` |
| `rdfs:` | `http://www.w3.org/2000/01/rdf-schema#` |
| `xsd:` | `http://www.w3.org/2001/XMLSchema#` |
| `dcterms:` | `http://purl.org/dc/terms/` |

**RDF Mapping:**

| Neo4j Element | RDF Type | URI Pattern | Key Properties |
|---|---|---|---|
| Ontology metadata | `knecta:Ontology` | `knecta:Ontology_<id>` | `dcterms:title`, `dcterms:description`, `dcterms:created`, `knecta:nodeCount`, `knecta:relationshipCount`, `knecta:hasDataset` |
| Dataset node | `knecta:Dataset` | `knecta:Dataset_<name>` | `rdfs:label`, `knecta:source`, `rdfs:comment`, `knecta:hasField` |
| Field node | `knecta:Field` | `knecta:Field_<dataset>_<field>` | `rdfs:label`, `knecta:expression`, `knecta:fieldLabel`, `rdfs:comment`, `knecta:belongsToDataset` |
| RELATES_TO edge | `knecta:Relationship` | `knecta:Rel_<name>` | `rdfs:label`, `knecta:fromDataset`, `knecta:toDataset`, `knecta:fromColumns`, `knecta:toColumns` |

**Library:** n3 (Node.js RDF serializer)

**Frontend Integration:**
- "Export to RDF" button on ontology detail page
- Visible when ontology status is `ready`
- Downloads `.ttl` file with ontology name

**Example Output (abbreviated):**
```turtle
@prefix knecta: <http://knecta.io/ontology#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix dcterms: <http://purl.org/dc/terms/> .

knecta:Ontology_abc123 a knecta:Ontology ;
    dcterms:title "Sales Ontology" ;
    knecta:hasDataset knecta:Dataset_customers, knecta:Dataset_orders .

knecta:Dataset_customers a knecta:Dataset ;
    rdfs:label "customers" ;
    knecta:source "public.customers" ;
    knecta:hasField knecta:Field_customers_customer_id .

knecta:Field_customers_customer_id a knecta:Field ;
    rdfs:label "customer_id" ;
    knecta:expression "customer_id" ;
    knecta:belongsToDataset knecta:Dataset_customers .

knecta:Rel_fk_orders_customer a knecta:Relationship ;
    knecta:fromDataset knecta:Dataset_orders ;
    knecta:toDataset knecta:Dataset_customers ;
    knecta:fromColumns "customer_id" ;
    knecta:toColumns "customer_id" .
```

---

## Security

### Encryption and Data Protection

Ontologies contain the same data as semantic models (metadata only, no credentials or row data):

- **No Credential Storage**: Ontologies reference semantic models which reference connections
- **Metadata Only**: Graph contains schema names, table structures, relationships (not row data)
- **RBAC-Based Access**: All authorized users can see all ontologies, controlled by RBAC permissions
- **Namespace Isolation**: All Neo4j nodes tagged with `ontologyId` for multi-tenancy

### Neo4j Security

Graph data is isolated per ontology:

1. **Namespace Tagging**: Every node has `ontologyId` property matching PostgreSQL UUID
2. **Query Filtering**: All Cypher queries filter by `ontologyId`
3. **Deletion Safety**: Delete operations scoped to specific `ontologyId`
4. **Connection Pooling**: Neo4j driver managed by global module with connection limits

### Deletion Safety

When deleting an ontology:

1. PostgreSQL record deleted first (atomic transaction)
2. Neo4j cleanup runs asynchronously
3. If Neo4j cleanup fails, ontology marked as "failed" and cleanup retried
4. No orphaned nodes possible (DELETE uses `ontologyId` filter)

---

## RBAC Permissions

Defined in `apps/api/src/common/constants/roles.constants.ts`:

```typescript
export const PERMISSIONS = {
  ONTOLOGIES_READ: 'ontologies:read',
  ONTOLOGIES_WRITE: 'ontologies:write',
  ONTOLOGIES_DELETE: 'ontologies:delete',
} as const;
```

### Permission Matrix

| Role | ontologies:read | ontologies:write | ontologies:delete |
|------|----------------|------------------|------------------|
| **Admin** | ✅ | ✅ | ✅ |
| **Contributor** | ✅ | ✅ | ✅ |
| **Viewer** | ✅ | ❌ | ❌ |

**Note:** Viewers can view ontologies but cannot create or delete them.

### Controller Usage

Permissions enforced via `@Auth` decorator:

```typescript
@Get()
@Auth({ permissions: [PERMISSIONS.ONTOLOGIES_READ] })
@ApiOperation({ summary: 'List ontologies' })
async list(
  @Query() query: OntologyQueryDto,
  @CurrentUser('id') userId: string, // For audit only, not filtering
) {
  return this.ontologiesService.list(query); // No userId filter
}
```

---

## Data Flow

### Creating an Ontology

```
1. User selects "ready" semantic model
   ↓
2. Frontend sends POST /api/ontologies with semanticModelId
   ↓
3. OntologiesService validates:
   - Semantic model exists
   - Status is "ready"
   - Model has valid OSI JSON
   ↓
4. Create ontology record in PostgreSQL (status: creating, createdByUserId: userId)
   ↓
5. Parse OSI model JSON
   ↓
6. For each dataset in model:
   a. Create Dataset node in Neo4j with ontologyId
   b. Generate YAML for dataset
   c. For each field in dataset:
      - Create Field node
      - Create HAS_FIELD relationship
      - Generate YAML for field
   ↓
7. For each relationship in model:
   - Create RELATES_TO relationship between Dataset nodes
   ↓
8. Count nodes and relationships
   ↓
9. Update ontology status to "ready" with counts
   ↓
10. Return ontology metadata to frontend
```

### Viewing an Ontology

```
1. User navigates to /ontologies/:id
   ↓
2. Frontend fetches GET /api/ontologies/:id (metadata)
   ↓
3. Frontend fetches GET /api/ontologies/:id/graph (graph data)
   ↓
4. NeoOntologyService queries Neo4j:
   MATCH (d:Dataset {ontologyId: $id})
   OPTIONAL MATCH (d)-[:HAS_FIELD]->(f:Field)
   OPTIONAL MATCH (d)-[r:RELATES_TO]->(d2:Dataset {ontologyId: $id})
   RETURN d, f, r, d2
   ↓
5. Transform Cypher results to graph format (nodes + edges)
   ↓
6. Frontend renders graph with react-force-graph-2d
   ↓
7. User clicks node → NodeInspector displays YAML from node.yaml property
```

### Deleting an Ontology

```
1. User clicks delete button
   ↓
2. Frontend shows confirmation dialog
   ↓
3. User confirms → DELETE /api/ontologies/:id
   ↓
4. OntologiesService starts transaction:
   a. Delete PostgreSQL record
   b. Queue Neo4j cleanup job
   ↓
5. Neo4j cleanup runs:
   MATCH (n {ontologyId: $id})
   DETACH DELETE n
   ↓
6. If cleanup fails:
   - Log error
   - Mark ontology as "failed" (resurrect record)
   - Retry cleanup later
   ↓
7. Return 204 No Content
```

---

## Frontend Components

### 1. OntologiesPage

File: `apps/web/src/pages/OntologiesPage.tsx`

**Purpose:** Main list page for ontologies

**Key Features:**
- Table with columns: Name, Semantic Model, Status, Datasets, Fields, Relationships, Actions
- Search by name/description
- Filter by status (All, Creating, Ready, Failed)
- Filter by semantic model
- Pagination
- Status chips:
  - Creating (blue, with spinner)
  - Ready (green)
  - Failed (red)
- Action buttons: View, Delete
- "Create Ontology" button (permission-aware)

**State Management:**
```typescript
const {
  ontologies,
  total,
  page,
  pageSize,
  isLoading,
  error,
  fetchOntologies,
  deleteOntology,
} = useOntologies();
```

---

### 2. CreateOntologyDialog

File: `apps/web/src/components/ontologies/CreateOntologyDialog.tsx`

**Purpose:** Modal dialog for creating new ontology

**Key Features:**
- Dropdown to select semantic model (only shows "ready" models)
- Name input (required)
- Description input (optional)
- Validation:
  - Name required, max 255 chars
  - Description max 1000 chars
  - Semantic model must be selected
- Submit button disabled until valid
- Error display

**Form State:**
```typescript
const [formData, setFormData] = useState({
  name: '',
  description: '',
  semanticModelId: '',
});
```

---

### 3. OntologyDetailPage

File: `apps/web/src/pages/OntologyDetailPage.tsx`

**Purpose:** Main visualization page with graph and node inspector

**Layout:**
```
┌────────────────────────────────────────────────────────┐
│  Header: Name, Description, Stats, Actions            │
├────────────────────────────┬───────────────────────────┤
│                            │                           │
│  OntologyGraph             │  NodeInspector            │
│  (react-force-graph-2d viz)│  (YAML detail panel)      │
│                            │                           │
│  - Datasets as big nodes   │  - Selected node name     │
│  - Fields as small nodes   │  - Node type (Dataset/Field)
│  - Relationships as edges  │  - YAML definition        │
│  - Interactive zoom/pan    │  - Syntax highlighting    │
│  - Click to select node    │                           │
│                            │                           │
└────────────────────────────┴───────────────────────────┘
```

**State:**
```typescript
const [ontology, setOntology] = useState<Ontology | null>(null);
const [graphData, setGraphData] = useState<GraphData | null>(null);
const [selectedNode, setSelectedNode] = useState<Node | null>(null);
```

---

### 4. OntologyGraph

File: `apps/web/src/components/ontologies/OntologyGraph.tsx`

**Purpose:** Interactive graph component using react-force-graph-2d

**Key Features:**
- Dataset nodes styled as blue circles
- Field nodes styled as smaller gray circles (toggleable visibility)
- HAS_FIELD relationships as lines
- RELATES_TO relationships as directed arrows with labels
- Interactive controls:
  - Zoom in/out with mouse wheel
  - Pan with drag
  - Click node to select
  - Toggle Field nodes visibility
- Force-directed layout
- Click node → emit `onNodeClick(node)` event
- Responsive sizing

**Node Rendering:**
```typescript
const datasetNode = {
  id: dataset.name,
  name: dataset.name,
  label: 'Dataset',
  color: '#2196f3', // Blue for datasets
  val: 10, // Size multiplier
  properties: {
    name: dataset.name,
    source: dataset.source,
    description: dataset.description,
    yaml: dataset.yaml,
  },
};

const fieldNode = {
  id: `${dataset.name}.${field.name}`,
  name: field.name,
  label: 'Field',
  color: '#9e9e9e', // Gray for fields
  val: 3, // Smaller size
  properties: {
    name: field.name,
    type: field.type,
    primaryKey: field.primaryKey,
    yaml: field.yaml,
  },
};
```

---

### 5. NodeInspector

File: `apps/web/src/components/ontologies/NodeInspector.tsx`

**Purpose:** Side panel showing YAML details for selected node

**Key Features:**
- Node name as header
- Node type badge (Dataset / Field)
- Syntax-highlighted YAML display (react-syntax-highlighter)
- Copy YAML button
- Download YAML button
- Close button
- Empty state when no node selected

**Example:**
```tsx
<SyntaxHighlighter
  language="yaml"
  style={docco}
  showLineNumbers
>
  {selectedNode.yaml}
</SyntaxHighlighter>
```

---

### 6. useOntologies Hook

File: `apps/web/src/hooks/useOntologies.ts`

**Purpose:** State management for ontologies

**State:**
```typescript
const [ontologies, setOntologies] = useState<Ontology[]>([]);
const [total, setTotal] = useState(0);
const [page, setPage] = useState(1);
const [pageSize, setPageSize] = useState(20);
const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
```

**Methods:**
```typescript
fetchOntologies({ page?, pageSize?, search?, status?, semanticModelId? })
getOntologyById(id: string)
createOntology(data: CreateOntologyPayload)
deleteOntology(id: string)
getOntologyGraph(id: string) → GraphData
```

**Auto-Refresh:**
- Poll ontology status every 2s while status is "creating"
- Stop polling when status becomes "ready" or "failed"

---

### 7. Routing and Navigation

**Route Definitions:**

File: `apps/web/src/App.tsx`

```tsx
<Route path="/ontologies" element={<OntologiesPage />} />
<Route path="/ontologies/:id" element={<OntologyDetailPage />} />
```

**Sidebar Entry:**

File: `apps/web/src/components/navigation/Sidebar.tsx`

```tsx
import BubbleChartIcon from '@mui/icons-material/BubbleChart';

<RequirePermission permission="ontologies:read">
  <ListItem button component={Link} to="/ontologies">
    <ListItemIcon>
      <BubbleChartIcon />
    </ListItemIcon>
    <ListItemText primary="Ontologies" />
  </ListItem>
</RequirePermission>
```

---

## Key Patterns for Reuse

### 1. Neo4j Service with Namespace Isolation

**Pattern:** All graph operations scoped to `ontologyId` for multi-tenancy

```typescript
@Injectable()
export class NeoOntologyService {
  constructor(
    @Inject('NEO4J_DRIVER') private readonly driver: Driver,
  ) {}

  async createOntologyGraph(
    ontologyId: string,
    osiModel: OSIModel,
  ): Promise<{ datasetCount: number; fieldCount: number; relationshipCount: number }> {
    const session = this.driver.session();
    try {
      // Create datasets
      for (const dataset of osiModel.datasets) {
        await session.run(
          `CREATE (d:Dataset {
            ontologyId: $ontologyId,
            name: $name,
            source: $source,
            description: $description,
            yaml: $yaml
          })`,
          {
            ontologyId,
            name: dataset.name,
            source: dataset.table,
            description: dataset.description,
            yaml: this.generateDatasetYaml(dataset),
          },
        );

        // Create fields
        for (const field of dataset.fields) {
          await session.run(
            `MATCH (d:Dataset {ontologyId: $ontologyId, name: $datasetName})
             CREATE (f:Field {
               ontologyId: $ontologyId,
               datasetName: $datasetName,
               name: $name,
               type: $type,
               primaryKey: $primaryKey,
               nullable: $nullable,
               description: $description,
               yaml: $yaml
             })
             CREATE (d)-[:HAS_FIELD]->(f)`,
            {
              ontologyId,
              datasetName: dataset.name,
              name: field.name,
              type: field.type,
              primaryKey: field.primary_key || false,
              nullable: field.nullable || false,
              description: field.description,
              yaml: this.generateFieldYaml(field),
            },
          );
        }
      }

      // Create relationships (batch operation)
      if (osiModel.relationships.length > 0) {
        const relationshipData = osiModel.relationships.map(rel => ({
          fromDataset: rel.from.dataset,
          toDataset: rel.to.dataset,
          name: rel.name,
          from: rel.from.dataset,
          to: rel.to.dataset,
          fromColumns: JSON.stringify([rel.from.field]),
          toColumns: JSON.stringify([rel.to.field]),
          yaml: this.generateRelationshipYaml(rel),
        }));

        await session.run(
          `UNWIND $relationships AS r
           MATCH (from:Dataset {ontologyId: $ontologyId, name: r.fromDataset})
           MATCH (to:Dataset {ontologyId: $ontologyId, name: r.toDataset})
           CREATE (from)-[:RELATES_TO {
             name: r.name,
             from: r.from,
             to: r.to,
             fromColumns: r.fromColumns,
             toColumns: r.toColumns,
             yaml: r.yaml
           }]->(to)`,
          {
            ontologyId,
            relationships: relationshipData,
          },
        );
      }

      // Count nodes and relationships
      const counts = await this.getOntologyCounts(ontologyId);
      return counts;
    } finally {
      await session.close();
    }
  }

  async deleteOntologyGraph(ontologyId: string): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(
        'MATCH (n {ontologyId: $ontologyId}) DETACH DELETE n',
        { ontologyId },
      );
    } finally {
      await session.close();
    }
  }

  async getOntologyGraph(ontologyId: string): Promise<GraphData> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (d:Dataset {ontologyId: $ontologyId})
         OPTIONAL MATCH (d)-[:HAS_FIELD]->(f:Field)
         OPTIONAL MATCH (d)-[r:RELATES_TO]->(d2:Dataset {ontologyId: $ontologyId})
         RETURN d, f, r, d2`,
        { ontologyId },
      );

      return this.transformToGraphData(result.records);
    } finally {
      await session.close();
    }
  }
}
```

---

### 2. YAML Generation from OSI Model

**Pattern:** Generate YAML snippets for individual nodes and relationships

```typescript
private generateDatasetYaml(dataset: Dataset): string {
  const yaml = {
    name: dataset.name,
    description: dataset.description,
    table: dataset.table,
    fields: dataset.fields.map(f => ({
      name: f.name,
      type: f.type,
      description: f.description,
      primary_key: f.primary_key,
      nullable: f.nullable,
    })),
  };
  return jsYaml.dump(yaml, { indent: 2 });
}

private generateFieldYaml(field: Field): string {
  const yaml = {
    name: field.name,
    type: field.type,
    description: field.description,
    primary_key: field.primary_key,
    nullable: field.nullable,
    default_value: field.default_value,
  };
  return jsYaml.dump(yaml, { indent: 2 });
}

private generateRelationshipYaml(relationship: Relationship): string {
  const yaml = {
    name: relationship.name,
    from: {
      dataset: relationship.from.dataset,
      field: relationship.from.field,
    },
    to: {
      dataset: relationship.to.dataset,
      field: relationship.to.field,
    },
  };
  return jsYaml.dump(yaml, { indent: 2 });
}
```

---

### 3. Neo4j Module Configuration

**Pattern:** Global module providing Neo4j driver singleton

```typescript
@Global()
@Module({
  providers: [
    {
      provide: 'NEO4J_DRIVER',
      useFactory: () => {
        const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
        const user = process.env.NEO4J_USER || 'neo4j';
        const password = process.env.NEO4J_PASSWORD || 'neo4j';
        return neo4j.driver(uri, neo4j.auth.basic(user, password));
      },
    },
  ],
  exports: ['NEO4J_DRIVER'],
})
export class NeoGraphModule implements OnModuleDestroy {
  constructor(@Inject('NEO4J_DRIVER') private readonly driver: Driver) {}

  async onModuleDestroy() {
    await this.driver.close();
  }
}
```

---

### 4. Force Graph Visualization

**Pattern:** Transform Neo4j graph to react-force-graph-2d format

```typescript
function transformToForceGraph(graphData: GraphData): ForceGraphData {
  const nodes = [];
  const links = [];

  // Create dataset nodes
  for (const dataset of graphData.datasets) {
    nodes.push({
      id: dataset.name,
      name: dataset.name,
      label: 'Dataset',
      color: '#2196f3',
      val: 10,
      properties: {
        name: dataset.name,
        source: dataset.source,
        description: dataset.description,
        yaml: dataset.yaml,
      },
    });
  }

  // Create field nodes
  for (const field of graphData.fields) {
    nodes.push({
      id: `${field.datasetName}.${field.name}`,
      name: field.name,
      label: 'Field',
      color: '#9e9e9e',
      val: 3,
      properties: {
        name: field.name,
        type: field.type,
        primaryKey: field.primaryKey,
        yaml: field.yaml,
      },
    });

    // HAS_FIELD link
    links.push({
      source: field.datasetName,
      target: `${field.datasetName}.${field.name}`,
      label: 'HAS_FIELD',
    });
  }

  // Create relationship links
  for (const rel of graphData.relationships) {
    links.push({
      source: rel.from,
      target: rel.to,
      label: 'RELATES_TO',
      name: rel.name,
      properties: {
        name: rel.name,
        from: rel.from,
        to: rel.to,
        fromColumns: rel.fromColumns,
        toColumns: rel.toColumns,
        yaml: rel.yaml,
      },
    });
  }

  return { nodes, links };
}
```

---

## File Inventory

### Backend Files (Created)

```
apps/api/
├── prisma/
│   ├── schema.prisma                           # Ontology model + status enum
│   └── migrations/
│       └── YYYYMMDDHHMMSS_add_ontologies/
│           └── migration.sql                   # SQL migration
├── src/
│   ├── common/
│   │   └── constants/
│   │       └── roles.constants.ts              # PERMISSIONS.ONTOLOGIES_* added
│   ├── ontologies/
│   │   ├── ontologies.module.ts                # NestJS module
│   │   ├── ontologies.controller.ts            # REST API endpoints
│   │   ├── ontologies.service.ts               # Business logic, PG operations
│   │   ├── neo-ontology.service.ts             # Neo4j graph operations
│   │   └── dto/
│   │       ├── create-ontology.dto.ts          # Create validation (Zod)
│   │       └── ontology-query.dto.ts           # List query validation (Zod)
│   └── neo-graph/
│       ├── neo-graph.module.ts                 # Global module for Neo4j driver
│       └── neo-graph.config.ts                 # Driver configuration
└── test/
    ├── ontologies.integration.spec.ts          # Integration tests
    └── fixtures/
        └── test-data.factory.ts                # createMockOntology helper
```

### Frontend Files (Created)

```
apps/web/
└── src/
    ├── components/
    │   └── ontologies/
    │       ├── CreateOntologyDialog.tsx        # Creation modal
    │       ├── OntologyGraph.tsx               # React Flow graph component
    │       └── NodeInspector.tsx               # YAML detail panel
    ├── hooks/
    │   └── useOntologies.ts                    # State + API integration
    ├── pages/
    │   ├── OntologiesPage.tsx                  # List page
    │   └── OntologyDetailPage.tsx              # Visualization page
    ├── services/
    │   └── api.ts                              # API functions (modified)
    ├── types/
    │   └── index.ts                            # TypeScript types (modified)
    └── __tests__/
        └── pages/
            └── OntologiesPage.test.tsx         # Frontend tests
```

### Configuration Files (Modified)

```
apps/api/
├── package.json                                # Added: neo4j-driver
└── src/
    └── app.module.ts                           # Imported OntologiesModule, NeoGraphModule

apps/web/
├── package.json                                # Added: react-flow-renderer, @xyflow/react
└── src/
    ├── App.tsx                                 # Added routes: /ontologies, /ontologies/:id
    └── components/
        └── navigation/
            └── Sidebar.tsx                     # Added sidebar entry with BubbleChartIcon
```

---

## Testing

### Backend Tests

#### Integration Tests: Ontologies API

File: `apps/api/test/ontologies.integration.spec.ts`

**Coverage:**

**GET /api/ontologies**
- ✅ 401 if not authenticated
- ✅ 403 without read permission
- ✅ Empty list when no ontologies
- ✅ Paginated results
- ✅ Returns all ontologies (system-level, no ownership filter)
- ✅ Search by name/description
- ✅ Filter by status
- ✅ Filter by semanticModelId
- ✅ Sort by name, status, createdAt, datasetCount

**GET /api/ontologies/:id**
- ✅ 401 if not authenticated
- ✅ 403 without read permission
- ✅ 200 with ontology metadata
- ✅ 404 for non-existent ontology

**POST /api/ontologies**
- ✅ 401 if not authenticated
- ✅ 403 without write permission
- ✅ 201 with created ontology (createdByUserId set for audit)
- ✅ Validation errors (400)
- ✅ 404 for non-existent semantic model
- ✅ 400 if semantic model not "ready"

**DELETE /api/ontologies/:id**
- ✅ 401 if not authenticated
- ✅ 403 without delete permission
- ✅ 204 on success
- ✅ 404 for non-existent ontology
- ✅ Deletes Neo4j graph

**GET /api/ontologies/:id/graph**
- ✅ 401 if not authenticated
- ✅ 403 without read permission
- ✅ 200 with graph data
- ✅ Correct node/edge format
- ✅ 404 for non-existent ontology

**Run:**
```bash
cd apps/api && npm test -- ontologies.integration
```

---

### Frontend Tests

File: `apps/web/src/__tests__/pages/OntologiesPage.test.tsx`

**Coverage:**

**Page Layout**
- ✅ Renders page title
- ✅ Shows loading state
- ✅ Renders table after loading

**Ontologies Table**
- ✅ Displays ontology data correctly
- ✅ Shows status chip with color
- ✅ Displays statistics

**Empty State**
- ✅ Shows empty state when no ontologies

**Permissions**
- ✅ Shows "Create Ontology" button with write permission
- ✅ Hides button without permission

**Search and Filters**
- ✅ Renders search input
- ✅ Renders status filter dropdown
- ✅ Calls fetchOntologies with filters

**Actions**
- ✅ Opens detail page on View click
- ✅ Shows confirmation dialog on Delete click
- ✅ Calls deleteOntology API on confirm

**Run:**
```bash
cd apps/web && npm test -- OntologiesPage
```

---

## Configuration

### Environment Variables

Required in `infra/compose/.env`:

```bash
# Neo4j Configuration
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-secure-password

# Health check timeout
NEO4J_HEALTH_TIMEOUT=5000  # milliseconds
```

**Validation:**
- Neo4j connection required for ontology features
- Application startup performs Neo4j health check
- Other features (semantic models, connections) work without Neo4j

---

### Docker Compose

Add Neo4j service to `infra/compose/base.compose.yml`:

```yaml
services:
  neo4j:
    image: neo4j:5.15
    container_name: knecta-neo4j
    environment:
      NEO4J_AUTH: ${NEO4J_USER}/${NEO4J_PASSWORD}
      NEO4J_dbms_security_procedures_unrestricted: apoc.*
      NEO4J_dbms_security_procedures_allowlist: apoc.*
    ports:
      - "7474:7474"  # HTTP (Browser UI)
      - "7687:7687"  # Bolt
    volumes:
      - neo4j-data:/data
      - neo4j-logs:/logs
    healthcheck:
      test: ["CMD", "cypher-shell", "-u", "${NEO4J_USER}", "-p", "${NEO4J_PASSWORD}", "RETURN 1"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  neo4j-data:
  neo4j-logs:
```

---

### NPM Packages

Added to `apps/api/package.json`:

```json
{
  "dependencies": {
    "neo4j-driver": "^5.15.0",
    "js-yaml": "^4.1.0"
  },
  "devDependencies": {
    "@types/js-yaml": "^4.0.9"
  }
}
```

Added to `apps/web/package.json`:

```json
{
  "dependencies": {
    "react-force-graph-2d": "^1.25.4",
    "react-syntax-highlighter": "^15.5.0"
  },
  "devDependencies": {
    "@types/react-syntax-highlighter": "^15.5.11"
  }
}
```

**Install:**
```bash
cd apps/api && npm install
cd apps/web && npm install
```

---

### Database Migration

Run migration to create `ontologies` table:

```bash
cd apps/api && npm run prisma:migrate:dev -- --name add_ontologies
```

Or in production:

```bash
cd apps/api && npm run prisma:migrate
```

---

### Seed Permissions

Permissions automatically seeded when running:

```bash
cd apps/api && npm run prisma:seed
```

This creates:
- `ontologies:read` → Admin, Contributor, Viewer
- `ontologies:write` → Admin, Contributor
- `ontologies:delete` → Admin, Contributor

---

## Summary

The Ontology feature provides a graph-based visualization layer on top of semantic models. It demonstrates:

- **Dual-database architecture** with PostgreSQL for metadata and Neo4j for graph storage
- **Namespace isolation** for multi-tenancy in graph database
- **Interactive graph visualization** using react-force-graph-2d
- **YAML integration** for node-level detail inspection
- **Consistent RBAC** enforcement across PostgreSQL and Neo4j
- **Synchronous graph creation** with status tracking
- **Safe deletion** with coordinated cleanup across databases
- **Type safety** with TypeScript and Zod validation
- **Comprehensive testing** with integration tests for both databases

This specification serves as documentation and a blueprint for building graph-based features with Neo4j integration.
