# Semantic Models Feature Specification

## Table of Contents

1. [Feature Overview](#feature-overview)
2. [Architecture](#architecture)
3. [Database Schema](#database-schema)
4. [API Endpoints](#api-endpoints)
5. [Security](#security)
6. [RBAC Permissions](#rbac-permissions)
7. [LLM Provider Configuration](#llm-provider-configuration)
8. [Agent Architecture](#agent-architecture)
9. [Frontend Components](#frontend-components)
10. [Key Patterns for Reuse](#key-patterns-for-reuse)
11. [File Inventory](#file-inventory)
12. [Testing](#testing)
13. [Configuration](#configuration)

---

## Feature Overview

The Semantic Models feature enables users to automatically generate semantic models from their database connections using an AI-powered agent. The generated models follow the **OSI (Open Semantic Interface)** specification, providing a standardized way to describe data structures, relationships, and metrics.

### Core Capabilities

- **AI-Powered Discovery**: LangGraph-based agent explores database schemas, tables, columns, and relationships
- **Intelligent Relationship Inference**: Discovers both explicit foreign keys and implicit relationships using column name matching, value overlap analysis, and validation queries
- **Human-in-the-Loop**: CopilotKit provides interactive UI with chat interface
- **Multi-Provider LLM Support**: Pluggable architecture supports OpenAI, Anthropic, and Azure OpenAI
- **OSI Compliance**: Generated models follow the Open Semantic Interface specification
- **YAML Export**: Models can be exported in standard YAML format
- **Run Tracking**: Complete audit trail of agent execution with status, progress, and results
- **Per-User Ownership**: Users only see and manage their own semantic models

### Use Cases

1. **Data Analysts**: Auto-generate semantic layers for BI tools from existing databases
2. **Data Engineers**: Document database schemas with inferred relationships and business context
3. **Business Users**: Create self-service analytics models without deep SQL knowledge
4. **Data Architects**: Standardize data definitions across organization using OSI spec

### Current Limitations

- **PostgreSQL Only**: Discovery driver currently only implemented for PostgreSQL
- Other database types (MySQL, SQL Server, Databricks, Snowflake) are deferred for future releases

---

## Architecture

The feature follows a sophisticated agent-based architecture with human-in-the-loop interaction:

```
┌─────────────────────────────────────────────────────────────┐
│                       Frontend Layer                        │
│  React + Material UI + CopilotKit                           │
│                                                               │
│  NewSemanticModelPage (4-step wizard)                       │
│         ↓                                                    │
│  AgentSidebar (CopilotKit chat + progress)                 │
│         ↓                                                    │
│  SemanticModelDetailPage (5-tab viewer)                     │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTPS (Nginx)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                       Backend Layer                         │
│  NestJS + Fastify + TypeScript                              │
│                                                               │
│  CopilotKit Runtime (SSE streaming)                         │
│         ↓                                                    │
│  LangGraph Agent (ReAct pattern)                            │
│    ├─ 7 Agent Tools (list_schemas, run_query, etc.)        │
│    └─ OSI Model Generation                                  │
│         ↓                                                    │
│  Discovery Service (schema introspection)                   │
│         ↓                                                    │
│  Database Drivers (PostgreSQL only)                         │
└────────────────────────────┬────────────────────────────────┘
                             │ Prisma ORM
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                      Database Layer                         │
│  PostgreSQL                                                  │
│                                                               │
│  semantic_models table (JSON OSI models)                    │
│  semantic_model_runs table (agent execution tracking)       │
└─────────────────────────────────────────────────────────────┘
```

### Layer Responsibilities

#### Frontend
- **NewSemanticModelPage**: 4-step wizard (Select Connection → Select Database → Select Tables → Generate with AI)
- **AgentSidebar**: CopilotKit-powered chat interface with real-time progress updates
- **SemanticModelDetailPage**: 5-tab view (Overview, Datasets, Relationships, Metrics, YAML)
- **ModelViewer**: Visualize generated semantic model structure
- **YamlPreview**: Syntax-highlighted YAML export preview
- **Hooks**: `useSemanticModels`, `useDiscovery` for state management

#### Backend
- **CopilotKitController**: SSE streaming endpoint implementing AG-UI protocol
- **SemanticModelsController**: CRUD operations for semantic models
- **DiscoveryController**: Schema introspection endpoints (databases, schemas, tables, columns)
- **LangGraph Agent**: ReAct-based agent with tool-calling loop
- **LLM Service**: Multi-provider LLM abstraction (OpenAI, Anthropic, Azure)
- **Discovery Service**: Database schema metadata extraction

#### Agent Graph Flow

```
START → planDiscovery → agentLoop ↔ toolExecution → generateModel → persistModel → END
```

1. **planDiscovery**: Agent analyzes selected tables and creates discovery plan
2. **agentLoop**: ReAct loop with reasoning and tool calling
3. **toolExecution**: Execute selected tool (list_schemas, run_query, etc.)
4. **generateModel**: Convert gathered metadata into OSI-compliant JSON
5. **persistModel**: Save model to database with statistics

---

## Database Schema

### SemanticModel Model (Prisma)

Located in `apps/api/prisma/schema.prisma`:

```prisma
enum SemanticModelStatus {
  draft
  generating
  ready
  failed
}

model SemanticModel {
  id                  String               @id @default(uuid()) @db.Uuid
  name                String
  description         String?
  connectionId        String               @map("connection_id") @db.Uuid
  databaseName        String               @map("database_name")
  status              SemanticModelStatus  @default(draft)
  model               Json?                // OSI-compliant JSON model
  modelVersion        String?              @map("model_version")
  tableCount          Int                  @default(0) @map("table_count")
  fieldCount          Int                  @default(0) @map("field_count")
  relationshipCount   Int                  @default(0) @map("relationship_count")
  metricCount         Int                  @default(0) @map("metric_count")
  ownerId             String               @map("owner_id") @db.Uuid
  createdAt           DateTime             @default(now()) @map("created_at") @db.Timestamptz
  updatedAt           DateTime             @updatedAt @map("updated_at") @db.Timestamptz

  // Relations
  connection DataConnection @relation("SemanticModelConnection", fields: [connectionId], references: [id], onDelete: Cascade)
  owner      User           @relation("UserSemanticModels", fields: [ownerId], references: [id], onDelete: Cascade)
  runs       SemanticModelRun[] @relation("SemanticModelRuns")

  @@index([ownerId])
  @@index([connectionId])
  @@index([status])
  @@map("semantic_models")
}
```

### Field Definitions (SemanticModel)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | Primary key |
| `name` | String | Yes | User-defined model name |
| `description` | String | No | Optional model description |
| `connectionId` | UUID | Yes | Foreign key to data_connections.id |
| `databaseName` | String | Yes | Database name used for generation |
| `status` | Enum | Yes | Generation status (draft, generating, ready, failed) |
| `model` | JSONB | No | OSI-compliant semantic model JSON |
| `modelVersion` | String | No | OSI specification version (e.g., "1.0") |
| `tableCount` | Integer | Yes | Number of datasets in model (default: 0) |
| `fieldCount` | Integer | Yes | Number of fields across all datasets (default: 0) |
| `relationshipCount` | Integer | Yes | Number of relationships discovered (default: 0) |
| `metricCount` | Integer | Yes | Number of metrics defined (default: 0) |
| `ownerId` | UUID | Yes | Foreign key to users.id |
| `createdAt` | Timestamp | Yes | Record creation time |
| `updatedAt` | Timestamp | Yes | Last update time |

---

### SemanticModelRun Model (Prisma)

```prisma
enum SemanticModelRunStatus {
  pending
  planning
  executing
  completed
  failed
  cancelled
}

model SemanticModelRun {
  id              String                    @id @default(uuid()) @db.Uuid
  semanticModelId String?                   @map("semantic_model_id") @db.Uuid
  connectionId    String                    @map("connection_id") @db.Uuid
  databaseName    String                    @map("database_name")
  selectedSchemas String[]                  @map("selected_schemas")
  selectedTables  String[]                  @map("selected_tables")
  status          SemanticModelRunStatus    @default(pending)
  plan            Json?                     // Agent's discovery plan
  progress        Json?                     // Real-time progress updates
  errorMessage    String?                   @map("error_message")
  startedAt       DateTime?                 @map("started_at") @db.Timestamptz
  completedAt     DateTime?                 @map("completed_at") @db.Timestamptz
  ownerId         String                    @map("owner_id") @db.Uuid
  createdAt       DateTime                  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime                  @updatedAt @map("updated_at") @db.Timestamptz

  // Relations
  semanticModel SemanticModel? @relation("SemanticModelRuns", fields: [semanticModelId], references: [id], onDelete: SetNull)
  connection    DataConnection @relation("SemanticModelRunConnection", fields: [connectionId], references: [id], onDelete: Cascade)
  owner         User           @relation("UserSemanticModelRuns", fields: [ownerId], references: [id], onDelete: Cascade)

  @@index([ownerId])
  @@index([semanticModelId])
  @@index([status])
  @@map("semantic_model_runs")
}
```

### Field Definitions (SemanticModelRun)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | Primary key |
| `semanticModelId` | UUID | No | Foreign key to semantic_models.id (nullable, set after completion) |
| `connectionId` | UUID | Yes | Foreign key to data_connections.id |
| `databaseName` | String | Yes | Target database name |
| `selectedSchemas` | String[] | Yes | User-selected schemas for discovery |
| `selectedTables` | String[] | Yes | User-selected tables for model generation |
| `status` | Enum | Yes | Run status (pending, planning, executing, completed, failed, cancelled) |
| `plan` | JSONB | No | Agent's discovery plan |
| `progress` | JSONB | No | Real-time progress updates (steps, current step, percentage) |
| `errorMessage` | String | No | Error details if status is failed |
| `startedAt` | Timestamp | No | When agent execution began |
| `completedAt` | Timestamp | No | When agent execution finished |
| `ownerId` | UUID | Yes | Foreign key to users.id |
| `createdAt` | Timestamp | Yes | Record creation time |
| `updatedAt` | Timestamp | Yes | Last update time |

### Indexes

- `ownerId` - Fast lookup for user's models and runs
- `connectionId` - Filter models by connection
- `semanticModelId` - Find runs for a model
- `status` - Filter by generation/run status

---

## API Endpoints

All endpoints require authentication. Base path: `/api/semantic-models`

### Semantic Model CRUD

#### 1. List Semantic Models

```http
GET /api/semantic-models
```

**Query Parameters:**
- `page` (number, default: 1) - Page number
- `pageSize` (number, default: 20) - Items per page
- `search` (string, optional) - Search in name/description
- `status` (enum, optional) - Filter by status (draft, generating, ready, failed)
- `connectionId` (UUID, optional) - Filter by connection
- `sortBy` (enum, default: 'createdAt') - Sort field (name, status, createdAt, tableCount)
- `sortOrder` (enum, default: 'desc') - Sort direction (asc, desc)

**Permission:** `semantic_models:read`

**Response (200):**
```json
{
  "data": {
    "items": [
      {
        "id": "uuid",
        "name": "Sales Analytics Model",
        "description": "Semantic model for sales data",
        "connectionId": "uuid",
        "databaseName": "sales_db",
        "status": "ready",
        "modelVersion": "1.0",
        "tableCount": 8,
        "fieldCount": 45,
        "relationshipCount": 12,
        "metricCount": 5,
        "createdAt": "2024-01-01T00:00:00Z",
        "updatedAt": "2024-01-15T10:30:00Z"
      }
    ],
    "total": 25,
    "page": 1,
    "pageSize": 20,
    "totalPages": 2
  }
}
```

---

#### 2. Get Semantic Model by ID

```http
GET /api/semantic-models/:id
```

**Parameters:**
- `id` (UUID, path) - Semantic model ID

**Permission:** `semantic_models:read`

**Response (200):** Single semantic model object including full OSI model JSON

**Response (404):** Model not found or not owned by user

---

#### 3. Update Semantic Model

```http
PATCH /api/semantic-models/:id
```

**Permission:** `semantic_models:write`

**Request Body:** Partial update (name and description only)
```json
{
  "name": "Updated Model Name",
  "description": "Updated description"
}
```

**Response (200):** Updated semantic model object

**Response (404):** Model not found or not owned by user

**Note:** Only name and description can be updated. Model JSON is immutable after generation.

---

#### 4. Delete Semantic Model

```http
DELETE /api/semantic-models/:id
```

**Permission:** `semantic_models:delete`

**Response (204):** No content (success)

**Response (404):** Model not found or not owned by user

**Side Effects:**
- Deletes associated semantic_model_runs (onDelete: SetNull sets semanticModelId to null)
- Creates audit event

---

#### 5. Export Semantic Model as YAML

```http
GET /api/semantic-models/:id/yaml
```

**Permission:** `semantic_models:read`

**Response (200):**
```yaml
version: "1.0"
datasets:
  - name: customers
    description: Customer information
    table: public.customers
    fields:
      - name: customer_id
        type: integer
        description: Unique customer identifier
        primary_key: true
# ... full OSI YAML structure
```

**Content-Type:** `application/x-yaml`

**Response (404):** Model not found or model has no generated content

---

#### 6. List Runs for Semantic Model

```http
GET /api/semantic-models/:id/runs
```

**Permission:** `semantic_models:read`

**Response (200):**
```json
{
  "data": {
    "items": [
      {
        "id": "uuid",
        "status": "completed",
        "startedAt": "2024-01-15T10:00:00Z",
        "completedAt": "2024-01-15T10:05:32Z",
        "plan": { "steps": [...] },
        "progress": { "currentStep": 5, "totalSteps": 5, "percentage": 100 }
      }
    ],
    "total": 3,
    "page": 1,
    "pageSize": 20
  }
}
```

**Response (404):** Model not found or not owned by user

---

### Agent Runs

#### 7. Create Agent Run

```http
POST /api/semantic-models/runs
```

**Permission:** `semantic_models:generate`

**Request Body:**
```json
{
  "connectionId": "uuid",
  "databaseName": "sales_db",
  "selectedSchemas": ["public"],
  "selectedTables": ["public.customers", "public.orders", "public.products"]
}
```

**Validation Rules:**
- `connectionId`: Required, must be owned by user
- `databaseName`: Required, must exist in connection
- `selectedSchemas`: Optional array of schema names
- `selectedTables`: Required array of qualified table names (schema.table)

**Response (201):**
```json
{
  "data": {
    "id": "uuid",
    "status": "pending",
    "createdAt": "2024-01-15T10:00:00Z"
  }
}
```

**Response (404):** Connection not found or not owned by user

**Side Effects:**
- Creates `SemanticModelRun` record with status "pending"
- Agent execution happens asynchronously via CopilotKit runtime

---

#### 8. Get Run Status

```http
GET /api/semantic-models/runs/:runId
```

**Permission:** `semantic_models:read`

**Response (200):**
```json
{
  "data": {
    "id": "uuid",
    "status": "executing",
    "plan": {
      "steps": [
        "Discover table schemas",
        "Analyze foreign key relationships",
        "Infer implicit relationships",
        "Generate semantic model"
      ]
    },
    "progress": {
      "currentStep": 2,
      "totalSteps": 4,
      "percentage": 50,
      "message": "Analyzing foreign key relationships..."
    },
    "startedAt": "2024-01-15T10:00:00Z"
  }
}
```

**Response (404):** Run not found or not owned by user

---

#### 9. Cancel Run

```http
POST /api/semantic-models/runs/:runId/cancel
```

**Permission:** `semantic_models:generate`

**Response (200):**
```json
{
  "data": {
    "id": "uuid",
    "status": "cancelled"
  }
}
```

**Response (404):** Run not found or not owned by user

**Response (400):** Run already completed or failed

---

### Discovery Endpoints

Discovery endpoints are nested under `/api/connections` to reflect their relationship with database connections.

#### 10. List Databases

```http
GET /api/connections/:id/databases
```

**Permission:** `connections:read`

**Response (200):**
```json
{
  "data": {
    "databases": [
      { "name": "sales_db" },
      { "name": "inventory_db" },
      { "name": "analytics_db" }
    ]
  }
}
```

**Response (404):** Connection not found or not owned by user

---

#### 11. List Schemas

```http
GET /api/connections/:id/databases/:db/schemas
```

**Parameters:**
- `id` (UUID, path) - Connection ID
- `db` (string, path) - Database name

**Permission:** `connections:read`

**Response (200):**
```json
{
  "data": {
    "schemas": [
      { "name": "public" },
      { "name": "sales" },
      { "name": "analytics" }
    ]
  }
}
```

---

#### 12. List Tables

```http
GET /api/connections/:id/databases/:db/schemas/:schema/tables
```

**Parameters:**
- `id` (UUID, path) - Connection ID
- `db` (string, path) - Database name
- `schema` (string, path) - Schema name

**Permission:** `connections:read`

**Response (200):**
```json
{
  "data": {
    "tables": [
      {
        "name": "customers",
        "type": "table",
        "rowCount": 15234
      },
      {
        "name": "orders",
        "type": "table",
        "rowCount": 45678
      },
      {
        "name": "customer_summary",
        "type": "view",
        "rowCount": null
      }
    ]
  }
}
```

---

#### 13. List Columns

```http
GET /api/connections/:id/databases/:db/schemas/:schema/tables/:table/columns
```

**Parameters:**
- `id` (UUID, path) - Connection ID
- `db` (string, path) - Database name
- `schema` (string, path) - Schema name
- `table` (string, path) - Table name

**Permission:** `connections:read`

**Response (200):**
```json
{
  "data": {
    "columns": [
      {
        "name": "customer_id",
        "type": "integer",
        "nullable": false,
        "primaryKey": true,
        "defaultValue": null
      },
      {
        "name": "email",
        "type": "varchar(255)",
        "nullable": false,
        "primaryKey": false,
        "defaultValue": null
      },
      {
        "name": "created_at",
        "type": "timestamp",
        "nullable": false,
        "primaryKey": false,
        "defaultValue": "now()"
      }
    ]
  }
}
```

---

### LLM Provider Endpoint

#### 14. List Enabled LLM Providers

```http
GET /api/llm/providers
```

**Permission:** `semantic_models:read`

**Response (200):**
```json
{
  "data": {
    "providers": [
      {
        "name": "openai",
        "label": "OpenAI",
        "enabled": true,
        "isDefault": true,
        "models": ["gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"]
      },
      {
        "name": "anthropic",
        "label": "Anthropic",
        "enabled": true,
        "isDefault": false,
        "models": ["claude-sonnet-4-5-20250929", "claude-opus-4-6"]
      },
      {
        "name": "azure",
        "label": "Azure OpenAI",
        "enabled": false,
        "isDefault": false,
        "models": []
      }
    ]
  }
}
```

**Note:** A provider is enabled if its required environment variables are configured.

---

### CopilotKit Runtime

#### 15. CopilotKit Runtime Endpoint

```http
POST /api/copilotkit
```

**Permission:** `semantic_models:generate`

**Request Body:** AG-UI protocol messages (binary/JSON)

**Response:** Server-Sent Events (SSE) stream with agent updates

**Content-Type:** `text/event-stream`

**Event Types:**
- `agent_state_update` - Agent progress updates
- `tool_call` - Tool execution notifications
- `model_generated` - Semantic model generation complete
- `error` - Agent error occurred

**Note:** This endpoint implements the CopilotKit AG-UI protocol for bidirectional communication between the agent and frontend.

---

## Security

### Encryption and Data Protection

Semantic models contain database metadata (table/column names, relationships) but **NOT** actual data or credentials:

- **No Credential Storage**: Models reference connections via `connectionId` but don't duplicate credentials
- **Metadata Only**: Models contain schema names, table structures, relationships (not row data)
- **Per-User Isolation**: Models are filtered by `ownerId` (same pattern as connections)

### Agent Safety

The agent has read-only access to databases with multiple safety layers:

1. **Read-Only Queries**: `run_query` tool blocks write keywords (INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE)
2. **Query Timeout**: 30-second timeout prevents long-running queries
3. **Row Limit**: 100 row limit on sample data queries
4. **Connection Validation**: Agent can only access user's own connections
5. **Error Handling**: All tool errors are caught and logged without exposing sensitive info

### LLM API Key Security

LLM provider API keys are stored as environment variables:

- **OpenAI**: `OPENAI_API_KEY`
- **Anthropic**: `ANTHROPIC_API_KEY`
- **Azure**: `AZURE_OPENAI_API_KEY`

Keys are **never** exposed to frontend or logged.

### Human-in-the-Loop Protection

The agent executes with read-only access and safety guardrails:

1. Agent generates discovery plan
2. Execution proceeds automatically with read-only queries
3. All queries subject to timeouts, row limits, and keyword blocking

This prevents unexpected database modifications while allowing autonomous discovery.

---

## RBAC Permissions

Defined in `apps/api/src/common/constants/roles.constants.ts`:

```typescript
export const PERMISSIONS = {
  SEMANTIC_MODELS_READ: 'semantic_models:read',
  SEMANTIC_MODELS_WRITE: 'semantic_models:write',
  SEMANTIC_MODELS_DELETE: 'semantic_models:delete',
  SEMANTIC_MODELS_GENERATE: 'semantic_models:generate',
} as const;
```

### Permission Matrix

| Role | semantic_models:read | semantic_models:write | semantic_models:delete | semantic_models:generate |
|------|---------------------|----------------------|------------------------|-------------------------|
| **Admin** | ✅ | ✅ | ✅ | ✅ |
| **Contributor** | ✅ | ✅ | ✅ | ✅ |
| **Viewer** | ✅ | ❌ | ❌ | ❌ |

**Note:** Viewers can view semantic models but cannot create, edit, delete, or generate new models.

### Controller Usage

Permissions are enforced via `@Auth` decorator:

```typescript
@Get()
@Auth({ permissions: [PERMISSIONS.SEMANTIC_MODELS_READ] })
@ApiOperation({ summary: 'List semantic models' })
async list(
  @Query() query: SemanticModelQueryDto,
  @CurrentUser('id') userId: string,
) {
  return this.semanticModelsService.list(query, userId);
}
```

---

## LLM Provider Configuration

The feature uses a pluggable multi-provider architecture for LLM access.

### Supported Providers

#### 1. OpenAI

**Environment Variables:**
```bash
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o  # Optional, defaults to gpt-4o
```

**Supported Models:**
- `gpt-4o` (default, recommended)
- `gpt-4-turbo`
- `gpt-3.5-turbo`

---

#### 2. Anthropic

**Environment Variables:**
```bash
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929  # Optional
```

**Supported Models:**
- `claude-sonnet-4-5-20250929` (default)
- `claude-opus-4-6`

---

#### 3. Azure OpenAI

**Environment Variables:**
```bash
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_DEPLOYMENT=gpt-4o
AZURE_OPENAI_API_VERSION=2024-02-01
```

**Note:** Azure requires deployment name instead of model name.

---

### Default Provider Selection

The `LLM_DEFAULT_PROVIDER` environment variable sets the default:

```bash
LLM_DEFAULT_PROVIDER=openai  # Options: openai, anthropic, azure
```

**Provider Selection Logic:**
1. Use `LLM_DEFAULT_PROVIDER` if set and enabled
2. Fall back to first enabled provider (OpenAI → Anthropic → Azure)
3. Error if no provider is configured

**Validation:**
- At least one provider must have valid API key configured
- Application startup fails if no LLM provider is available
- Provider availability is checked at runtime (not startup)

---

## Agent Architecture

The semantic model generation uses **LangGraph.js** for agent orchestration and **CopilotKit** for human-in-the-loop interaction.

### Agent Pattern: ReAct (Reasoning + Acting)

The agent follows the ReAct pattern:

1. **Reason**: LLM analyzes current state and decides next action
2. **Act**: Execute selected tool with parameters
3. **Observe**: Process tool output and update state
4. **Repeat**: Continue until goal achieved

### LangGraph State Graph

```typescript
const graph = new StateGraph<AgentState>()
  .addNode('planDiscovery', planDiscoveryNode)
  .addNode('agentLoop', agentLoopNode)
  .addNode('toolExecution', toolExecutionNode)
  .addNode('generateModel', generateModelNode)
  .addNode('persistModel', persistModelNode)
  .addEdge(START, 'planDiscovery')
  .addEdge('planDiscovery', 'agentLoop')
  .addEdge('agentLoop', 'toolExecution')
  .addConditionalEdges('toolExecution', executionRouter)
  .addEdge('generateModel', 'persistModel')
  .addEdge('persistModel', END);
```

### Graph Flow Explanation

#### 1. planDiscovery Node

**Purpose:** Generate discovery plan based on selected tables

**Actions:**
- Analyze selected tables
- Create step-by-step plan (discover schemas → analyze FKs → infer relationships → generate model)
- Store plan in run record

**Output:** Plan JSON

---

#### 2. agentLoop Node

**Purpose:** ReAct reasoning loop

**Actions:**
- LLM analyzes current state
- Decides next tool to call or if goal is achieved
- Updates agent state with reasoning

**Routing:**
- If tool selected: Go to `toolExecution`
- If goal achieved: Go to `generateModel`
- If max iterations reached: Error

---

#### 3. toolExecution Node

**Purpose:** Execute selected tool and observe results

**Actions:**
- Call tool function with LLM-provided arguments
- Capture tool output (success/error)
- Update agent state with observations

**Routing:**
- Always return to `agentLoop` for next reasoning step

---

#### 4. generateModel Node

**Purpose:** Convert gathered metadata into OSI JSON

**Actions:**
- Process all discovered metadata (tables, columns, relationships)
- Generate OSI-compliant JSON structure
- Calculate statistics (table count, field count, relationship count, metric count)

**Output:** Complete semantic model JSON

---

#### 5. persistModel Node

**Purpose:** Save model to database

**Actions:**
- Create `SemanticModel` record
- Set status to "ready"
- Link to `SemanticModelRun`
- Update run status to "completed"

**Output:** Persisted model ID

---

### Agent Tools

The agent has access to 7 tools for database discovery:

#### 1. list_schemas

**Purpose:** List all schemas in database

**Parameters:** None

**Returns:**
```typescript
{
  schemas: [
    { name: 'public' },
    { name: 'sales' },
    { name: 'analytics' }
  ]
}
```

**Use Case:** Initial exploration to understand database structure

---

#### 2. list_tables

**Purpose:** List tables in a schema

**Parameters:**
- `schema` (string, required) - Schema name

**Returns:**
```typescript
{
  tables: [
    { name: 'customers', type: 'table', rowCount: 15234 },
    { name: 'orders', type: 'table', rowCount: 45678 },
    { name: 'customer_summary', type: 'view', rowCount: null }
  ]
}
```

**Use Case:** Discover available tables, filter out views

---

#### 3. list_columns

**Purpose:** Get column metadata for a table

**Parameters:**
- `schema` (string, required) - Schema name
- `table` (string, required) - Table name

**Returns:**
```typescript
{
  columns: [
    {
      name: 'customer_id',
      type: 'integer',
      nullable: false,
      primaryKey: true,
      defaultValue: null
    },
    {
      name: 'email',
      type: 'varchar(255)',
      nullable: false,
      primaryKey: false,
      defaultValue: null
    }
  ]
}
```

**Use Case:** Understand table structure, identify primary keys

---

#### 4. get_foreign_keys

**Purpose:** Get explicit foreign key constraints

**Parameters:**
- `schema` (string, required) - Schema name
- `table` (string, required) - Table name

**Returns:**
```typescript
{
  foreignKeys: [
    {
      constraintName: 'fk_order_customer',
      column: 'customer_id',
      referencedSchema: 'public',
      referencedTable: 'customers',
      referencedColumn: 'customer_id'
    }
  ]
}
```

**Use Case:** Discover explicit relationships defined in schema

---

#### 5. get_sample_data

**Purpose:** Get 3-5 sample rows from table

**Parameters:**
- `schema` (string, required) - Schema name
- `table` (string, required) - Table name
- `limit` (number, optional, default: 5) - Number of rows (max 100)

**Returns:**
```typescript
{
  rows: [
    { customer_id: 1, email: 'alice@example.com', created_at: '2024-01-01' },
    { customer_id: 2, email: 'bob@example.com', created_at: '2024-01-02' }
  ]
}
```

**Use Case:** Understand data patterns, infer business context

---

#### 6. get_column_stats

**Purpose:** Get column statistics

**Parameters:**
- `schema` (string, required) - Schema name
- `table` (string, required) - Table name
- `column` (string, required) - Column name

**Returns:**
```typescript
{
  distinctCount: 15234,
  nullCount: 0,
  minValue: '2020-01-01',
  maxValue: '2024-01-15'
}
```

**Use Case:** Identify candidate keys, assess data quality

---

#### 7. run_query

**Purpose:** Execute custom read-only SQL query

**Parameters:**
- `sql` (string, required) - SQL query

**Safety Features:**
- Blocks write keywords (INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE)
- 30-second timeout
- 100 row limit

**Returns:**
```typescript
{
  rows: [ /* query results */ ],
  rowCount: 42
}
```

**Use Case:** Advanced relationship inference, value overlap analysis

**Example Queries:**

```sql
-- Check for implicit relationship via value overlap
SELECT COUNT(DISTINCT o.customer_id) as overlap_count
FROM orders o
WHERE o.customer_id IN (SELECT customer_id FROM customers)
LIMIT 100;

-- Analyze column name patterns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND column_name LIKE '%_id'
LIMIT 100;
```

---


### OSI Specification Structure

Generated models follow the Open Semantic Interface (OSI) specification:

```typescript
interface OSIModel {
  version: string;           // OSI spec version (e.g., "1.0")
  datasets: Dataset[];       // Tables/views
  relationships: Relationship[];
  metrics: Metric[];
}

interface Dataset {
  name: string;              // Dataset identifier
  description?: string;
  table: string;             // Schema-qualified table name (e.g., "public.customers")
  fields: Field[];
}

interface Field {
  name: string;
  type: string;              // Data type (integer, varchar, timestamp, etc.)
  description?: string;
  primary_key?: boolean;
  nullable?: boolean;
  default_value?: string;
}

interface Relationship {
  name: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
  from: {
    dataset: string;         // Dataset name
    field: string;           // Field name
  };
  to: {
    dataset: string;
    field: string;
  };
  implicit?: boolean;        // True if inferred (not explicit FK)
}

interface Metric {
  name: string;
  description?: string;
  aggregation: 'sum' | 'count' | 'avg' | 'min' | 'max';
  field: string;             // Field to aggregate
  dataset: string;           // Source dataset
}
```

**Example OSI JSON:**

```json
{
  "version": "1.0",
  "datasets": [
    {
      "name": "customers",
      "description": "Customer master data",
      "table": "public.customers",
      "fields": [
        {
          "name": "customer_id",
          "type": "integer",
          "primary_key": true,
          "nullable": false
        },
        {
          "name": "email",
          "type": "varchar",
          "nullable": false
        }
      ]
    },
    {
      "name": "orders",
      "description": "Customer orders",
      "table": "public.orders",
      "fields": [
        {
          "name": "order_id",
          "type": "integer",
          "primary_key": true,
          "nullable": false
        },
        {
          "name": "customer_id",
          "type": "integer",
          "nullable": false
        },
        {
          "name": "total_amount",
          "type": "decimal",
          "nullable": false
        }
      ]
    }
  ],
  "relationships": [
    {
      "name": "order_customer",
      "type": "many-to-one",
      "from": {
        "dataset": "orders",
        "field": "customer_id"
      },
      "to": {
        "dataset": "customers",
        "field": "customer_id"
      },
      "implicit": false
    }
  ],
  "metrics": [
    {
      "name": "total_revenue",
      "description": "Sum of all order amounts",
      "aggregation": "sum",
      "field": "total_amount",
      "dataset": "orders"
    }
  ]
}
```

---

## Frontend Components

### 1. SemanticModelsPage

File: `apps/web/src/pages/SemanticModelsPage.tsx`

**Purpose:** Main list page for semantic models

**Key Features:**
- Table with columns: Name, Database, Status, Tables, Fields, Relationships, Metrics, Actions
- Search by name/description
- Filter by status (All, Draft, Generating, Ready, Failed)
- Filter by connection
- Pagination
- Status chips with color coding:
  - Draft (gray)
  - Generating (blue, with spinner)
  - Ready (green)
  - Failed (red)
- Action buttons: View, Export YAML, Delete
- "New Semantic Model" button (permission-aware)

**State Management:**
```typescript
const {
  models,
  total,
  page,
  pageSize,
  isLoading,
  error,
  fetchModels,
  deleteModel,
  exportYaml,
} = useSemanticModels();
```

---

### 2. NewSemanticModelPage

File: `apps/web/src/pages/NewSemanticModelPage.tsx`

**Purpose:** 4-step wizard for creating semantic models

**Steps:**

#### Step 1: Select Connection
- Dropdown list of user's database connections
- Shows connection name, database type, host
- Filters to only show connections with discovery support (PostgreSQL only currently)

#### Step 2: Select Database
- Dropdown list of databases from selected connection
- Fetched via `/api/connections/:id/databases`

#### Step 3: Select Tables
- Tree view of schemas and tables
- Checkboxes for multi-selection
- Shows table row counts
- Search/filter tables by name

#### Step 4: Generate Model
- Summary of selections
- "Start Generation" button
- Opens CopilotKit sidebar with agent

**CopilotKit Integration:**

```tsx
<CopilotKit runtimeUrl="/api/copilotkit">
  <AgentSidebar
    connectionId={connectionId}
    databaseName={databaseName}
    selectedTables={selectedTables}
    onComplete={(modelId) => navigate(`/semantic-models/${modelId}`)}
  />
</CopilotKit>
```

---

### 3. AgentSidebar

File: `apps/web/src/components/semantic-models/AgentSidebar.tsx`

**Purpose:** CopilotKit-powered interactive agent UI

**Key Features:**
- Chat interface for human-agent communication
- Real-time progress updates (step X of Y)
- Progress bar during execution
- Success/error notifications
- Auto-redirect to model detail page on completion

**CopilotKit Hooks:**

```typescript
// Chat interface
useCopilotChat({
  instructions: 'You are helping generate a semantic model...',
});

// Progress updates
useCopilotReadable({
  description: 'Agent progress',
  value: progressState,
});
```

---

### 4. SemanticModelDetailPage

File: `apps/web/src/pages/SemanticModelDetailPage.tsx`

**Purpose:** View and explore generated semantic model

**5-Tab Layout:**

#### Tab 1: Overview
- Model name and description (editable)
- Connection info
- Database name
- Generation statistics (tables, fields, relationships, metrics)
- Status badge
- Created/updated timestamps
- Action buttons: Edit Name/Description, Export YAML, Delete

#### Tab 2: Datasets
- Expandable cards for each dataset
- Shows: table name, field count, description
- Click to expand: field list with types, nullability, primary key indicators

#### Tab 3: Relationships
- Visual relationship diagram (optional)
- Table view of relationships:
  - Name
  - Type (one-to-one, one-to-many, many-to-many)
  - From (dataset.field)
  - To (dataset.field)
  - Implicit flag (badge for inferred relationships)

#### Tab 4: Metrics
- Table view of metrics:
  - Name
  - Description
  - Aggregation type
  - Source dataset
  - Field

#### Tab 5: YAML
- Syntax-highlighted YAML preview
- Copy button
- Download button
- Full OSI-compliant YAML structure

---

### 5. ModelViewer

File: `apps/web/src/components/semantic-models/ModelViewer.tsx`

**Purpose:** Visualize model structure

**Features:**
- Dataset cards with field lists
- Relationship arrows (optional, for smaller models)
- Interactive expand/collapse
- Search/filter datasets
- Export to image (optional)

---

### 6. YamlPreview

File: `apps/web/src/components/semantic-models/YamlPreview.tsx`

**Purpose:** Syntax-highlighted YAML display

**Features:**
- React Syntax Highlighter with YAML grammar
- Copy to clipboard button
- Download as file button
- Line numbers
- Collapsible sections

**Example:**

```tsx
<SyntaxHighlighter
  language="yaml"
  style={docco}
  showLineNumbers
>
  {yamlContent}
</SyntaxHighlighter>
```

---

### 7. useSemanticModels Hook

File: `apps/web/src/hooks/useSemanticModels.ts`

**Purpose:** State management for semantic models

**State:**
```typescript
const [models, setModels] = useState<SemanticModel[]>([]);
const [total, setTotal] = useState(0);
const [page, setPage] = useState(1);
const [pageSize, setPageSize] = useState(20);
const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
```

**Methods:**
```typescript
fetchModels({ page?, pageSize?, search?, status?, connectionId? })
getModelById(id: string)
updateModel(id: string, data: { name?, description? })
deleteModel(id: string)
exportYaml(id: string) → string
getModelRuns(id: string)
createRun(data: CreateRunPayload)
getRun(runId: string)
cancelRun(runId: string)
```

**Auto-Refresh:**
- CRUD operations refresh list automatically
- Polling for run status updates (every 2s while status is "generating" or "executing")

---

### 8. useDiscovery Hook

File: `apps/web/src/hooks/useDiscovery.ts`

**Purpose:** Database schema discovery

**Methods:**
```typescript
getDatabases(connectionId: string)
getSchemas(connectionId: string, databaseName: string)
getTables(connectionId: string, databaseName: string, schemaName: string)
getColumns(connectionId: string, databaseName: string, schemaName: string, tableName: string)
```

**State:**
```typescript
const [databases, setDatabases] = useState<string[]>([]);
const [schemas, setSchemas] = useState<Schema[]>([]);
const [tables, setTables] = useState<Table[]>([]);
const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
```

---

### 9. Routing and Navigation

**Route Definitions:**

File: `apps/web/src/App.tsx`

```tsx
<Route path="/semantic-models" element={<SemanticModelsPage />} />
<Route path="/semantic-models/new" element={<NewSemanticModelPage />} />
<Route path="/semantic-models/:id" element={<SemanticModelDetailPage />} />
```

**Sidebar Entry:**

File: `apps/web/src/components/navigation/Sidebar.tsx`

```tsx
import AccountTreeIcon from '@mui/icons-material/AccountTree';

<RequirePermission permission="semantic_models:read">
  <ListItem button component={Link} to="/semantic-models">
    <ListItemIcon>
      <AccountTreeIcon />
    </ListItemIcon>
    <ListItemText primary="Semantic Models" />
  </ListItem>
</RequirePermission>
```

---

## Key Patterns for Reuse

### 1. Implementing an AI Agent with LangGraph

**Pattern:** State-based graph with nodes, edges, and conditional routing

**Steps:**

1. **Define agent state:**

```typescript
interface AgentState {
  runId: string;
  connectionId: string;
  selectedTables: string[];
  plan?: Plan;
  approved?: boolean;
  discoveries: Discovery[];
  model?: OSIModel;
  error?: string;
}
```

2. **Create graph nodes:**

```typescript
const planNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  const plan = await llm.invoke('Create discovery plan for: ' + state.selectedTables);
  return { plan };
};

const executeNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  const discoveries = await executeTools(state.plan);
  return { discoveries };
};
```

3. **Build graph:**

```typescript
const graph = new StateGraph<AgentState>()
  .addNode('plan', planNode)
  .addNode('execute', executeNode)
  .addEdge(START, 'plan')
  .addConditionalEdges('plan', (state) => state.approved ? 'execute' : END)
  .addEdge('execute', END);

const app = graph.compile();
```

4. **Execute with streaming:**

```typescript
const stream = await app.stream(initialState);
for await (const update of stream) {
  console.log('State update:', update);
  // Emit SSE event to frontend
}
```

---

### 2. Integrating CopilotKit for Human-in-the-Loop

**Pattern:** Server-side runtime + client-side hooks

**Backend Setup:**

```typescript
import { CopilotRuntime } from '@copilotkit/runtime';

@Post('copilotkit')
@Auth({ permissions: [PERMISSIONS.SEMANTIC_MODELS_GENERATE] })
async copilotkit(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
  const runtime = new CopilotRuntime({
    agent: myLangGraphAgent,
  });

  return runtime.handleRequest(req.raw, res.raw);
}
```

**Frontend Setup:**

```tsx
import { CopilotKit, useCopilotAction, useCopilotChat } from '@copilotkit/react-core';
import { CopilotSidebar } from '@copilotkit/react-ui';

function MyComponent() {
  useCopilotAction({
    name: 'approvePlan',
    handler: async ({ approved }) => {
      // Handle user action
    },
  });

  return (
    <CopilotKit runtimeUrl="/api/copilotkit">
      <CopilotSidebar>
        {/* Your UI */}
      </CopilotSidebar>
    </CopilotKit>
  );
}
```

---

### 3. Multi-Provider LLM Abstraction

**Pattern:** Factory with provider-specific implementations

**Interface:**

```typescript
interface LLMProvider {
  invoke(prompt: string): Promise<string>;
  stream(prompt: string): AsyncGenerator<string>;
}
```

**Factory:**

```typescript
class LLMService {
  private providers: Map<string, LLMProvider> = new Map();

  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.providers.set('openai', new OpenAIProvider());
    }
    if (process.env.ANTHROPIC_API_KEY) {
      this.providers.set('anthropic', new AnthropicProvider());
    }
  }

  getProvider(name?: string): LLMProvider {
    const providerName = name || process.env.LLM_DEFAULT_PROVIDER || 'openai';
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`LLM provider ${providerName} not configured`);
    }
    return provider;
  }
}
```

**Usage:**

```typescript
const llm = llmService.getProvider('openai');
const response = await llm.invoke('Generate semantic model for...');
```

---

### 4. Discovery Driver Pattern (Multi-Database Support)

**Pattern:** Interface + factory for database-specific implementations

**Discovery Interface:**

```typescript
interface DiscoveryDriver {
  listDatabases(): Promise<string[]>;
  listSchemas(database: string): Promise<Schema[]>;
  listTables(database: string, schema: string): Promise<Table[]>;
  listColumns(database: string, schema: string, table: string): Promise<Column[]>;
  getForeignKeys(database: string, schema: string, table: string): Promise<ForeignKey[]>;
  getSampleData(database: string, schema: string, table: string, limit: number): Promise<any[]>;
  getColumnStats(database: string, schema: string, table: string, column: string): Promise<ColumnStats>;
  runQuery(sql: string): Promise<QueryResult>;
}
```

**Factory Extension:**

```typescript
export function getDiscoveryDriver(dbType: string, connection: DataConnection): DiscoveryDriver {
  const driver = getDriver(dbType); // Get connection driver

  switch (dbType) {
    case 'postgresql':
      return new PostgreSQLDiscoveryDriver(driver, connection);
    case 'mysql':
      return new MySQLDiscoveryDriver(driver, connection);
    // Add more as implemented
    default:
      throw new BadRequestException(`Discovery not supported for ${dbType}`);
  }
}
```

**Implementation Example (PostgreSQL):**

```typescript
class PostgreSQLDiscoveryDriver implements DiscoveryDriver {
  async listSchemas(database: string): Promise<Schema[]> {
    const result = await this.runQuery(`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE catalog_name = $1
      AND schema_name NOT IN ('pg_catalog', 'information_schema')
    `, [database]);

    return result.rows.map(r => ({ name: r.schema_name }));
  }

  async getForeignKeys(database: string, schema: string, table: string): Promise<ForeignKey[]> {
    const result = await this.runQuery(`
      SELECT
        tc.constraint_name,
        kcu.column_name,
        ccu.table_schema AS foreign_schema,
        ccu.table_name AS foreign_table,
        ccu.column_name AS foreign_column
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = $1
        AND tc.table_name = $2
    `, [schema, table]);

    return result.rows.map(r => ({
      constraintName: r.constraint_name,
      column: r.column_name,
      referencedSchema: r.foreign_schema,
      referencedTable: r.foreign_table,
      referencedColumn: r.foreign_column,
    }));
  }
}
```

---

### 5. OSI Model Generation

**Pattern:** Builder pattern to construct OSI-compliant JSON

**Builder:**

```typescript
class OSIModelBuilder {
  private datasets: Dataset[] = [];
  private relationships: Relationship[] = [];
  private metrics: Metric[] = [];

  addDataset(table: Table, columns: Column[]): this {
    this.datasets.push({
      name: this.normalizeTableName(table.name),
      description: table.description,
      table: `${table.schema}.${table.name}`,
      fields: columns.map(col => ({
        name: col.name,
        type: this.mapDataType(col.type),
        description: col.description,
        primary_key: col.primaryKey,
        nullable: col.nullable,
        default_value: col.defaultValue,
      })),
    });
    return this;
  }

  addRelationship(fk: ForeignKey, implicit: boolean = false): this {
    this.relationships.push({
      name: fk.constraintName || `${fk.fromTable}_${fk.toTable}`,
      type: 'many-to-one',
      from: {
        dataset: this.normalizeTableName(fk.fromTable),
        field: fk.column,
      },
      to: {
        dataset: this.normalizeTableName(fk.toTable),
        field: fk.referencedColumn,
      },
      implicit,
    });
    return this;
  }

  addMetric(name: string, dataset: string, field: string, aggregation: string): this {
    this.metrics.push({ name, dataset, field, aggregation });
    return this;
  }

  build(): OSIModel {
    return {
      version: '1.0',
      datasets: this.datasets,
      relationships: this.relationships,
      metrics: this.metrics,
    };
  }

  private normalizeTableName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  }

  private mapDataType(dbType: string): string {
    // Map database types to OSI types
    const typeMap: Record<string, string> = {
      'integer': 'integer',
      'bigint': 'integer',
      'varchar': 'string',
      'text': 'string',
      'timestamp': 'datetime',
      'boolean': 'boolean',
      'decimal': 'number',
      'numeric': 'number',
    };
    return typeMap[dbType.toLowerCase()] || 'string';
  }
}
```

**Usage:**

```typescript
const builder = new OSIModelBuilder();

for (const table of tables) {
  const columns = await discoveryDriver.listColumns(db, schema, table.name);
  builder.addDataset(table, columns);

  const fks = await discoveryDriver.getForeignKeys(db, schema, table.name);
  for (const fk of fks) {
    builder.addRelationship(fk, false);
  }
}

// Infer implicit relationships
const implicitRels = await inferRelationships(tables);
for (const rel of implicitRels) {
  builder.addRelationship(rel, true);
}

const osiModel = builder.build();
```

---

### 6. YAML Export

**Pattern:** JSON to YAML conversion with js-yaml

```typescript
import * as yaml from 'js-yaml';

async function exportModelAsYaml(modelId: string, userId: string): Promise<string> {
  const model = await prisma.semanticModel.findFirst({
    where: { id: modelId, ownerId: userId },
  });

  if (!model || !model.model) {
    throw new NotFoundException('Model not found or has no content');
  }

  const yamlString = yaml.dump(model.model, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
  });

  return yamlString;
}
```

**Controller:**

```typescript
@Get(':id/yaml')
@Auth({ permissions: [PERMISSIONS.SEMANTIC_MODELS_READ] })
@Header('Content-Type', 'application/x-yaml')
@Header('Content-Disposition', 'attachment; filename="semantic-model.yaml"')
async exportYaml(
  @Param('id') id: string,
  @CurrentUser('id') userId: string,
): Promise<string> {
  return this.semanticModelsService.exportYaml(id, userId);
}
```

---

## File Inventory

### Backend Files (Created)

```
apps/api/
├── prisma/
│   ├── schema.prisma                           # SemanticModel + SemanticModelRun models
│   └── migrations/
│       └── YYYYMMDDHHMMSS_add_semantic_models/
│           └── migration.sql                   # SQL migration
├── src/
│   ├── common/
│   │   └── constants/
│   │       └── roles.constants.ts              # PERMISSIONS.SEMANTIC_MODELS_* added
│   ├── semantic-models/
│   │   ├── semantic-models.module.ts           # NestJS module
│   │   ├── semantic-models.controller.ts       # CRUD endpoints
│   │   ├── semantic-models.service.ts          # Business logic
│   │   ├── copilotkit.controller.ts            # CopilotKit runtime endpoint
│   │   ├── dto/
│   │   │   ├── create-run.dto.ts               # Create run validation (Zod)
│   │   │   ├── update-semantic-model.dto.ts    # Update validation (Zod)
│   │   │   └── semantic-model-query.dto.ts     # List query validation (Zod)
│   │   └── agent/
│   │       ├── graph.ts                        # LangGraph state graph
│   │       ├── state.ts                        # Agent state interface
│   │       ├── nodes/                          # Graph nodes
│   │       │   ├── plan-discovery.node.ts
│   │       │   ├── agent-loop.node.ts
│   │       │   ├── tool-execution.node.ts
│   │       │   ├── generate-model.node.ts
│   │       │   └── persist-model.node.ts
│   │       ├── tools/                          # Agent tools
│   │       │   ├── list-schemas.tool.ts
│   │       │   ├── list-tables.tool.ts
│   │       │   ├── list-columns.tool.ts
│   │       │   ├── get-foreign-keys.tool.ts
│   │       │   ├── get-sample-data.tool.ts
│   │       │   ├── get-column-stats.tool.ts
│   │       │   └── run-query.tool.ts
│   │       ├── prompts/
│   │       │   └── system-prompt.ts            # Agent system prompt
│   │       └── types/
│   │           └── osi.types.ts                # OSI model TypeScript types
│   ├── discovery/
│   │   ├── discovery.module.ts                 # NestJS module
│   │   ├── discovery.controller.ts             # Schema introspection endpoints
│   │   ├── discovery.service.ts                # Discovery business logic
│   │   └── dto/
│   │       └── discovery-params.dto.ts         # Validation DTOs
│   ├── llm/
│   │   ├── llm.module.ts                       # NestJS module
│   │   ├── llm.service.ts                      # Multi-provider LLM service
│   │   ├── llm.controller.ts                   # Provider listing endpoint
│   │   └── providers/
│   │       ├── openai.provider.ts              # OpenAI implementation
│   │       ├── anthropic.provider.ts           # Anthropic implementation
│   │       └── azure.provider.ts               # Azure OpenAI implementation
│   └── connections/
│       └── drivers/
│           ├── driver.interface.ts             # DiscoveryDriver interface added
│           ├── postgresql.driver.ts            # PostgreSQL discovery implementation
│           └── index.ts                        # getDiscoveryDriver factory added
└── test/
    ├── semantic-models.integration.spec.ts     # 33 integration tests
    ├── discovery.integration.spec.ts           # 19 integration tests
    └── fixtures/
        └── test-data.factory.ts                # createMockSemanticModel helper
```

### Frontend Files (Created)

```
apps/web/
└── src/
    ├── components/
    │   └── semantic-models/
    │       ├── AgentSidebar.tsx                # CopilotKit agent UI
    │       ├── ModelViewer.tsx                 # Model visualization
    │       └── YamlPreview.tsx                 # YAML syntax highlighting
    ├── hooks/
    │   ├── useSemanticModels.ts                # State + API integration
    │   └── useDiscovery.ts                     # Schema discovery hook
    ├── pages/
    │   ├── SemanticModelsPage.tsx              # List page
    │   ├── NewSemanticModelPage.tsx            # 4-step wizard
    │   └── SemanticModelDetailPage.tsx         # 5-tab detail view
    ├── services/
    │   └── api.ts                              # API functions (modified)
    ├── types/
    │   └── index.ts                            # TypeScript types (modified)
    └── __tests__/
        └── pages/
            └── SemanticModelsPage.test.tsx     # 28 frontend tests
```

### Configuration Files (Modified)

```
apps/api/
├── package.json                                # Added: @copilotkit/runtime, @langchain/langgraph, @langchain/openai, @langchain/anthropic, js-yaml
└── src/
    └── app.module.ts                           # Imported SemanticModelsModule, DiscoveryModule, LLMModule

apps/web/
├── package.json                                # Added: @copilotkit/react-core, @copilotkit/react-ui
└── src/
    ├── App.tsx                                 # Added routes: /semantic-models, /semantic-models/new, /semantic-models/:id
    └── components/
        └── navigation/
            └── Sidebar.tsx                     # Added sidebar entry with AccountTreeIcon
```

---

## Testing

### Backend Tests

#### Integration Tests: Semantic Models API

File: `apps/api/test/semantic-models.integration.spec.ts`

**Coverage (33 tests):**

**GET /api/semantic-models**
- ✅ 401 if not authenticated
- ✅ 403 for viewer (no permission)
- ✅ Empty list when no models
- ✅ Paginated results
- ✅ Filter by ownerId (isolation)
- ✅ Search by name/description
- ✅ Filter by status
- ✅ Filter by connectionId
- ✅ Sort by name, status, createdAt, tableCount

**GET /api/semantic-models/:id**
- ✅ 401 if not authenticated
- ✅ 403 for viewer
- ✅ 200 with full model JSON
- ✅ 404 for non-existent
- ✅ 404 for other user's model

**PATCH /api/semantic-models/:id**
- ✅ 401 if not authenticated
- ✅ 403 for viewer
- ✅ 200 with updated model
- ✅ Only name/description updatable
- ✅ 404 for non-existent

**DELETE /api/semantic-models/:id**
- ✅ 401 if not authenticated
- ✅ 403 for viewer
- ✅ 204 on success
- ✅ 404 for non-existent
- ✅ Cascades to runs (sets semanticModelId to null)

**GET /api/semantic-models/:id/yaml**
- ✅ 401 if not authenticated
- ✅ 200 with YAML content
- ✅ Correct Content-Type header
- ✅ 404 for model with no content

**GET /api/semantic-models/:id/runs**
- ✅ 401 if not authenticated
- ✅ 200 with runs list
- ✅ Paginated results

**POST /api/semantic-models/runs**
- ✅ 401 if not authenticated
- ✅ 403 for viewer
- ✅ 201 with created run
- ✅ Validation errors (400)

**GET /api/semantic-models/runs/:runId**
- ✅ 401 if not authenticated
- ✅ 200 with run status
- ✅ 404 for non-existent

**POST /api/semantic-models/runs/:runId/cancel**
- ✅ 401 if not authenticated
- ✅ 200 with cancelled status
- ✅ 400 if already completed

**Run:**
```bash
cd apps/api && npm test -- semantic-models.integration
```

---

#### Integration Tests: Discovery API

File: `apps/api/test/discovery.integration.spec.ts`

**Coverage (19 tests):**

**GET /api/connections/:id/databases**
- ✅ 401 if not authenticated
- ✅ 403 for viewer
- ✅ 200 with database list
- ✅ 404 for non-existent connection
- ✅ 404 for other user's connection

**GET /api/connections/:id/databases/:db/schemas**
- ✅ 401 if not authenticated
- ✅ 200 with schema list
- ✅ Filters out system schemas (pg_catalog, information_schema)

**GET /api/connections/:id/databases/:db/schemas/:schema/tables**
- ✅ 401 if not authenticated
- ✅ 200 with table list
- ✅ Includes row counts
- ✅ Distinguishes tables from views

**GET /api/connections/:id/databases/:db/schemas/:schema/tables/:table/columns**
- ✅ 401 if not authenticated
- ✅ 200 with column list
- ✅ Includes data types, nullability, primary keys
- ✅ Includes default values

**Discovery Driver Tests**
- ✅ PostgreSQL driver returns accurate metadata
- ✅ Foreign keys discovered correctly
- ✅ Unsupported database types return 400

**Run:**
```bash
cd apps/api && npm test -- discovery.integration
```

---

### Frontend Tests

File: `apps/web/src/__tests__/pages/SemanticModelsPage.test.tsx`

**Coverage (28 tests):**

**Page Layout**
- ✅ Renders page title
- ✅ Renders page description
- ✅ Shows loading state

**Semantic Models Table**
- ✅ Renders table after loading
- ✅ Displays model data correctly
- ✅ Shows status chip with color (draft/generating/ready/failed)
- ✅ Displays statistics (tables, fields, relationships, metrics)

**Empty State**
- ✅ Shows empty state when no models
- ✅ Shows filtered empty state message

**Permissions**
- ✅ Shows "New Semantic Model" button with write permission
- ✅ Hides button without permission

**Search and Filters**
- ✅ Renders search input
- ✅ Renders status filter dropdown
- ✅ Renders connection filter dropdown
- ✅ Allows typing in search box
- ✅ Calls fetchModels with search param

**Actions**
- ✅ Shows View, Export YAML, Delete buttons
- ✅ Opens detail page on View click
- ✅ Downloads YAML on Export click
- ✅ Shows confirmation dialog on Delete click
- ✅ Calls deleteModel API on confirm

**Error Handling**
- ✅ Displays error message when fetch fails
- ✅ Shows error alert

**Pagination**
- ✅ Renders pagination controls
- ✅ Shows correct rows per page options
- ✅ Calls fetchModels with page change
- ✅ Calls fetchModels with pageSize change

**Status Chips**
- ✅ Draft status shows gray chip
- ✅ Generating status shows blue chip with spinner
- ✅ Ready status shows green chip
- ✅ Failed status shows red chip

**Uses MSW (Mock Service Worker)** to mock API responses.

**Run:**
```bash
cd apps/web && npm test -- SemanticModelsPage
```

---

## Configuration

### Environment Variables

Required in `infra/compose/.env`:

```bash
# LLM Provider Configuration (at least one required)

# Default provider (openai | anthropic | azure)
LLM_DEFAULT_PROVIDER=openai

# OpenAI
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o  # Optional, defaults to gpt-4o

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929  # Optional

# Azure OpenAI
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_DEPLOYMENT=gpt-4o
AZURE_OPENAI_API_VERSION=2024-02-01
```

**Validation:**
- At least one LLM provider must be configured
- Missing LLM configuration will cause semantic model generation to fail
- Other features (connections, storage, etc.) work without LLM config

---

### NPM Packages

Added to `apps/api/package.json`:

```json
{
  "dependencies": {
    "@copilotkit/runtime": "^1.0.0",
    "@langchain/langgraph": "^0.0.20",
    "@langchain/core": "^0.1.30",
    "@langchain/openai": "^0.0.20",
    "@langchain/anthropic": "^0.1.10",
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
    "@copilotkit/react-core": "^1.0.0",
    "@copilotkit/react-ui": "^1.0.0"
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

Run migration to create `semantic_models` and `semantic_model_runs` tables:

```bash
cd apps/api && npm run prisma:migrate:dev
```

Or in production:

```bash
cd apps/api && npm run prisma:migrate
```

---

### Seed Permissions

The permissions are automatically seeded when running:

```bash
cd apps/api && npm run prisma:seed
```

This creates:
- `semantic_models:read` → Admin, Contributor, Viewer
- `semantic_models:write` → Admin, Contributor
- `semantic_models:delete` → Admin, Contributor
- `semantic_models:generate` → Admin, Contributor

---

## Summary

The Semantic Models feature provides an AI-powered, interactive way to generate semantic models from database connections. It demonstrates:

- **Advanced agent architecture** using LangGraph with ReAct pattern
- **Human-in-the-loop** interaction via CopilotKit
- **Multi-provider LLM support** with pluggable architecture
- **OSI specification compliance** for standardized semantic models
- **Intelligent relationship inference** beyond explicit foreign keys
- **Comprehensive discovery** for PostgreSQL databases (extensible to other DBs)
- **Security and safety** with read-only queries, timeouts, and row limits
- **RBAC enforcement** at API and UI levels
- **Type safety** with TypeScript and Zod validation
- **Testability** with comprehensive unit and integration tests

This specification serves as both documentation and a blueprint for building AI-powered features with agent-based workflows.
