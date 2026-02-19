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
- **Data-Driven Relationship Discovery**: Three-tier discovery pipeline: (1) explicit FK constraints from database catalogs, (2) programmatic naming heuristic analysis with type compatibility checking, and (3) value overlap validation via sample-based SQL queries. Includes automatic many-to-many junction table detection. The LLM reviews pre-validated candidates rather than discovering relationships from scratch.
- **Real-Time Progress**: Direct SSE streaming provides log-style progress view with per-table status
- **Multi-Provider LLM Support**: Pluggable architecture supports OpenAI, Anthropic, and Azure OpenAI
- **OSI Compliance**: Generated models follow the Open Semantic Interface specification
- **YAML Export**: Models can be exported in standard YAML format
- **Run Tracking**: Complete audit trail of agent execution with status, progress, and results
- **System-Level Shared Resources**: All authorized users can view and manage semantic models based on RBAC permissions

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

The feature follows a sophisticated agent-based architecture with real-time SSE streaming:

```
┌─────────────────────────────────────────────────────────────┐
│                       Frontend Layer                        │
│  React + Material UI                                        │
│                                                               │
│  NewSemanticModelPage (4-step wizard)                       │
│         ↓                                                    │
│  AgentLog (log-style progress view)                         │
│         ↓                                                    │
│  SemanticModelDetailPage (5-tab viewer)                     │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTPS (Nginx)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                       Backend Layer                         │
│  NestJS + Fastify + TypeScript                              │
│                                                               │
│  AgentStreamController (SSE via Fastify hijack)             │
│         ↓                                                    │
│  LangGraph StateGraph (linear pipeline, 6 nodes)            │
│    ├─ Programmatic Discovery (DiscoveryService)            │
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

### Dynamic OSI Specification Fetching

The agent dynamically fetches the latest OSI specification from GitHub before each run to ensure compliance with the current standard:

**OsiSpecService** (`apps/api/src/semantic-models/agent/osi/osi-spec.service.ts`):
- Fetches OSI spec YAML and JSON schema from GitHub:
  - Spec YAML: `https://raw.githubusercontent.com/open-semantic-interchange/OSI/refs/heads/main/core-spec/spec.yaml`
  - JSON Schema: `https://raw.githubusercontent.com/open-semantic-interchange/OSI/refs/heads/main/core-spec/osi-schema.json`
- **In-memory caching**: 1-hour TTL to minimize GitHub API calls
- **Fetch timeout**: 10 seconds (AbortController) to prevent blocking
- **Graceful fallback**: Uses bundled static spec if fetch fails
- **Prompt injection**: Spec YAML is injected into all LLM prompts as "OSI Specification Reference"
- **Schema caching**: JSON schema is cached for future programmatic validation but not injected into prompts

**Benefits:**
- Always uses the latest OSI specification
- No need to manually update bundled spec files
- Minimal latency impact due to caching
- Resilient to network failures with fallback
- Provides LLM with authoritative reference for field naming, structure, and semantics

### Layer Responsibilities

#### Frontend
- **NewSemanticModelPage**: 4-step wizard (Select Connection → Select Database → Select Tables → Generate with AI)
- **AgentLog**: Log-style progress view with per-table status, markdown rendering, and elapsed timer
- **SemanticModelDetailPage**: 5-tab view (Overview, Datasets, Relationships, Metrics, YAML)
- **ModelViewer**: Visualize generated semantic model structure
- **YamlPreview**: Syntax-highlighted YAML export preview
- **Hooks**: `useSemanticModels`, `useDiscovery` for state management

#### Backend
- **AgentStreamController**: SSE streaming endpoint via Fastify hijack (POST /api/semantic-models/runs/:runId/stream)
- **SemanticModelsController**: CRUD operations for semantic models
- **DiscoveryController**: Schema introspection endpoints (databases, schemas, tables, columns)
- **LangGraph Agent**: Linear StateGraph with 5 nodes (no tool-calling loop)
- **LLM Service**: Multi-provider LLM abstraction (OpenAI, Anthropic, Azure)
- **Discovery Service**: Database schema metadata extraction

#### Agent Graph Flow

```
START → discoverAndGenerate → discoverRelationships → generateRelationships → assembleModel → validateModel → persistModel → END
```

1. **discoverAndGenerate**: Table-by-table processing - programmatic discovery + focused LLM call per table
2. **discoverRelationships**: Programmatic relationship candidate generation and value overlap validation
3. **generateRelationships**: LLM review of pre-validated candidates + model-level metadata
4. **assembleModel**: Pure programmatic JSON assembly
5. **validateModel**: Programmatic structural checks + optional LLM quality review
6. **persistModel**: Save model to database with statistics

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
  createdByUserId     String?              @map("created_by_user_id") @db.Uuid
  createdAt           DateTime             @default(now()) @map("created_at") @db.Timestamptz
  updatedAt           DateTime             @updatedAt @map("updated_at") @db.Timestamptz

  // Relations
  connection    DataConnection @relation("SemanticModelConnection", fields: [connectionId], references: [id], onDelete: Cascade)
  createdByUser User?          @relation("UserSemanticModels", fields: [createdByUserId], references: [id], onDelete: SetNull)
  runs          SemanticModelRun[] @relation("SemanticModelRuns")

  @@index([createdByUserId])
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
| `createdByUserId` | UUID | No | Foreign key to users.id (nullable, for audit tracking) |
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
  createdByUserId String?                   @map("created_by_user_id") @db.Uuid
  createdAt       DateTime                  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime                  @updatedAt @map("updated_at") @db.Timestamptz

  // Relations
  semanticModel SemanticModel? @relation("SemanticModelRuns", fields: [semanticModelId], references: [id], onDelete: SetNull)
  connection    DataConnection @relation("SemanticModelRunConnection", fields: [connectionId], references: [id], onDelete: Cascade)
  createdByUser User?          @relation("UserSemanticModelRuns", fields: [createdByUserId], references: [id], onDelete: SetNull)

  @@index([createdByUserId])
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
| `plan` | JSONB | No | Reserved for future use (unused in current implementation) |
| `progress` | JSONB | No | Per-table progress: `{ completedTables, totalTables, percentComplete, partialModel, tableStatus[], tokensUsed, elapsedMs }` |
| `errorMessage` | String | No | Error details if status is failed |
| `startedAt` | Timestamp | No | When agent execution began |
| `completedAt` | Timestamp | No | When agent execution finished |
| `createdByUserId` | UUID | No | Foreign key to users.id (nullable, for audit tracking) |
| `createdAt` | Timestamp | Yes | Record creation time |
| `updatedAt` | Timestamp | Yes | Last update time |

### Indexes

- `createdByUserId` - Track models and runs by creator for audit purposes
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
        "createdByUserId": "uuid",
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

**Response (404):** Model not found

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

**Response (404):** Model not found

**Note:** Only name and description can be updated. Model JSON is immutable after generation.

---

#### 4. Delete Semantic Model

```http
DELETE /api/semantic-models/:id
```

**Permission:** `semantic_models:delete`

**Response (204):** No content (success)

**Response (404):** Model not found

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

**Response (404):** Model not found

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
- `connectionId`: Required, must be a valid accessible connection
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

**Response (404):** Connection not found or not accessible

**Side Effects:**
- Creates `SemanticModelRun` record with status "pending"
- Agent execution happens asynchronously via SSE streaming endpoint

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

**Response (404):** Run not found

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

**Response (404):** Run not found

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

**Response (404):** Connection not found or not accessible

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

### Agent SSE Streaming

#### 15. Agent SSE Streaming Endpoint

```http
POST /api/semantic-models/runs/:runId/stream
```

**Permission:** `semantic_models:generate`

**Parameters:**
- `runId` (UUID, path) - Run ID from POST /api/semantic-models/runs

**Mechanism:**
- SSE streaming via Fastify `res.hijack()` (prevents automatic res.end())
- Atomic `claimRun()` prevents duplicate concurrent execution of same run
- Keep-alive heartbeat every 30 seconds
- Uses `BaseCallbackHandler` for step tracking via LLM invocations
- Uses `streamMode: 'updates'` for graph state updates
- LLM `streaming: false` (full text emitted via `text` events after node completion)

**Response:** Server-Sent Events (SSE) stream

**Content-Type:** `text/event-stream`

**SSE Event Types:**

| Event | Payload | Description |
|-------|---------|-------------|
| `run_start` | `{}` | Agent execution started |
| `step_start` | `{ step, label }` | Node execution started |
| `step_end` | `{ step }` | Node execution completed |
| `progress` | `{ currentTable, totalTables, tableName, phase, percentComplete }` | Per-table progress update |
| `table_complete` | `{ tableName, tableIndex, totalTables, datasetName }` | Table processing completed |
| `table_error` | `{ tableName, error }` | Table processing failed |
| `text` | `{ content }` | Step description or LLM-generated text |
| `token_update` | `{ tokensUsed: { prompt, completion, total } }` | Cumulative token usage update |
| `run_complete` | `{ semanticModelId, tokensUsed, failedTables, duration }` | Agent execution completed successfully |
| `run_error` | `{ message }` | Agent execution failed |

**Error Responses:**
- **409 Conflict** - Run already executing (claimRun failed)
- **404 Not Found** - Run not found
- **500 Internal Server Error** - Stream setup failed

**Note:** No `tool_start` or `tool_result` events — discovery is programmatic via DiscoveryService methods, not LLM-driven tool calls.

---

## Security

### Encryption and Data Protection

Semantic models contain database metadata (table/column names, relationships) but **NOT** actual data or credentials:

- **No Credential Storage**: Models reference connections via `connectionId` but don't duplicate credentials
- **Metadata Only**: Models contain schema names, table structures, relationships (not row data)
- **RBAC-Based Access**: Models are accessible to all authorized users based on RBAC permissions

### Agent Safety

The agent has read-only access to databases with multiple safety layers:

1. **Read-Only Queries**: DiscoveryService methods only execute SELECT queries; write keywords are blocked
2. **Query Timeout**: 30-second timeout prevents long-running queries
3. **Row Limit**: 100 row limit on sample data queries
4. **Connection Validation**: Agent validates connection exists and is accessible
5. **Error Handling**: All discovery errors are caught and logged without exposing sensitive info
6. **Atomic Run Claiming**: `claimRun()` prevents duplicate concurrent execution of the same run

### LLM API Key Security

LLM provider API keys are stored as environment variables:

- **OpenAI**: `OPENAI_API_KEY`
- **Anthropic**: `ANTHROPIC_API_KEY`
- **Azure**: `AZURE_OPENAI_API_KEY`

Keys are **never** exposed to frontend or logged.

### Autonomous Execution with Safety Guardrails

The agent executes autonomously with read-only access and safety guardrails:

1. User selects connection, database, and tables via 4-step wizard
2. Agent executes table-by-table discovery and generation automatically
3. All queries are read-only with timeouts, row limits, and keyword blocking
4. Real-time progress is streamed via SSE to the AgentLog component

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
  return this.semanticModelsService.list(query);
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

The semantic model generation uses **LangGraph.js** for agent orchestration with a table-by-table pipeline architecture.

### Agent Pattern: Table-by-Table Pipeline with Parallel Processing

The agent follows a linear pipeline with programmatic discovery and focused LLM generation, with parallel table processing for performance:

1. **Discover**: Programmatic database introspection (no LLM) — **parallel execution**
2. **Generate**: One focused LLM call per table for dataset metadata — **parallel execution**
3. **Relate**: One LLM call for relationships across all tables — explicit FKs + naming pattern inference
4. **Assemble**: Pure programmatic JSON construction
5. **Validate**: Structural checks + optional LLM quality review
6. **Persist**: Save to database

**Key Benefits:**
- ~80% token reduction vs ReAct pattern
- Better quality (focused prompts per table)
- Real-time progress tracking (per-table status)
- Partial recovery (failed tables don't block others)
- **5-10x speedup** with parallel table processing (configurable concurrency)

### Parallel Table Processing

The `discover_and_generate` node processes tables in parallel for performance, with configurable concurrency control.

#### Architecture

**Sequential Processing (Prior Implementation):**
```typescript
for (const table of selectedTables) {
  // Discovery + LLM generation
  const dataset = await processTable(table);
  datasets.push(dataset);
}
```
- Processing time: `N tables × avg_time_per_table`
- Example: 10 tables × 5 seconds = 50 seconds total

**Parallel Processing (Current Implementation):**
```typescript
// Pre-fetch foreign keys for all unique schemas
const fksBySchema = await prefetchForeignKeys(selectedTables);

// Process tables in parallel with concurrency limit
const results = await processTablesInParallel(selectedTables, {
  concurrency: SEMANTIC_MODEL_CONCURRENCY,
  onTableComplete: (tableName, dataset) => {
    // Emit SSE progress event
  }
});
```
- Processing time: `(N tables / concurrency) × avg_time_per_table`
- Example: 10 tables / 5 concurrency × 5 seconds = 10 seconds total (~5x speedup)

#### Implementation Details

**Concurrency Limiter:**
- Custom lightweight utility (`createConcurrencyLimiter` in `apps/api/src/semantic-models/agent/utils/concurrency.ts`)
- Manages a queue of pending tasks and controls active execution count
- No external dependencies (similar pattern to `p-limit`)

**Pre-fetch Phase:**
- Foreign keys are fetched once per unique schema before parallel processing begins
- Stored in a Map keyed by schema name for O(1) lookup during table processing
- Prevents duplicate FK queries when multiple tables share the same schema

**Error Isolation:**
- `Promise.allSettled()` ensures one table's failure doesn't cancel other tables in the batch
- Failed tables are tracked separately in `failedTables` array
- Partial models are still persisted with successful tables

**Progress Tracking:**
- Completion-count based (not sequential index)
- SSE events may be interleaved as tables complete out of order
- `progress.completedTables` increments atomically after each table completes
- `progress.tableStatus` map tracks per-table phase (discovering → generating → complete/failed)

**Thread Safety:**
- Node.js single-threaded event loop makes synchronous operations safe between awaits
- Array pushes and counter increments are atomic within the event loop
- No locks or mutexes needed for state updates

#### Configuration

**Environment Variable:**
```bash
SEMANTIC_MODEL_CONCURRENCY=5  # Default: 5, Range: 1-20
```

**Validation:**
- Value is clamped to 1-20 range at runtime
- Invalid values default to 5
- Setting to 1 effectively disables parallelism (sequential processing)

**Added to:** `infra/compose/.env.example`

#### Performance Impact

**Speedup Measurements:**
| Concurrency | Tables | Time (seconds) | Speedup |
|-------------|--------|----------------|---------|
| 1 (sequential) | 10 | 50 | 1x (baseline) |
| 5 (default) | 10 | 10 | 5x |
| 10 | 10 | 5 | 10x |
| 20 | 10 | 5 | 10x (no benefit beyond table count) |

**Key Observations:**
- Linear speedup up to number of tables
- No quality degradation (each table's LLM prompt is self-contained)
- Token usage unchanged (same number of LLM calls)
- Network/DB latency is the primary bottleneck for small tables

**Recommended Settings:**
- **Small models (1-10 tables):** 5 (default)
- **Medium models (10-50 tables):** 10
- **Large models (50+ tables):** 10-15 (balance throughput and LLM API rate limits)

#### Independence of Table Processing

Each table's processing is completely independent:
- No cross-table dependencies during discovery or LLM generation
- Foreign key data is collected per-table (relationships generated later in `generate_relationships` node)
- Sample data and statistics are table-specific
- LLM prompts contain only single-table context

This independence allows safe parallel execution without race conditions or ordering dependencies.

---

### Field Data Type Injection

To ensure 100% accuracy of database field metadata, the agent uses a hybrid approach combining LLM-generated descriptions with programmatic data type injection:

**Approach:**
1. **LLM Phase**: Generate semantic field names and business descriptions
2. **Programmatic Enrichment**: Inject precise technical metadata from database discovery

**Two-Stage Injection Process:**

#### Stage 1: Field-Level Data Types
`injectFieldDataTypes()` utility (`apps/api/src/semantic-models/agent/utils/inject-field-data-types.ts`):
- Runs after each table's LLM generation in `discover-and-generate` node
- Matches each field to discovered `ColumnInfo` (case-insensitive)
- Injects into field's `ai_context` object:
  - `data_type` — Generic type (e.g., "integer", "varchar", "timestamp")
  - `is_primary_key` — Boolean from schema
  - `sample_data` — Array of distinct representative values (eligible columns only, see rules below)
- Handles string → object conversion, null creation, preserves existing properties
- Skips calculated/expression fields that don't match columns

##### Sample Data Injection

`sample_data` is injected for short text columns only. The `isEligibleForSampleData()` function determines eligibility:

**Eligible column types:**
- `text`, `varchar`, `char` types where the column schema `maxLength` is defined AND `maxLength < 50`

**Ineligible column types (never injected):**
- Numbers, boolean, bit, JSON, UUID/GUID, blob, dates, and unlimited text (`text` with no `maxLength`)

**Collection rules:**
- Requires at least 5 distinct non-null values; injects empty `[]` if fewer are available
- Each value is truncated to 25 characters
- Cap: max 30 eligible columns per table to limit database queries

**Ordering — `detectRecencyColumn()` helper:**
- Checks column names for a recency signal: `updated_at`, `modified_at`, `last_modified`, `updated_date`, `created_at`, `created_date`, `createdat`, `updatedat`
- The candidate column must be a date, time, or timestamp type
- Fallback: integer `version` column
- If a recency column is found, values are fetched with `ORDER BY <recency_col> DESC` to prefer values from recent rows
- If no recency column exists, values are fetched in any order

**Implementation:**
- `getDistinctColumnValues()` method on `DiscoveryService` handles cross-database SQL to collect distinct values
- Called per eligible column during the `discover-and-generate` node, after LLM generation

#### Stage 2: Relationship Column Types
`injectRelationshipDataTypes()` utility (same file):
- Runs in `assemble-model` node after model assembly
- Enriches each relationship's `ai_context` with join column types
- Uses already-enriched field metadata as source
- Creates `column_types` structure:
  ```yaml
  ai_context:
    column_types:
      from_columns:
        customer_id: { data_type: "integer" }
      to_columns:
        id: { data_type: "integer" }
  ```

**Benefits:**
- **Zero LLM hallucination** on data types
- **Zero additional tokens** (programmatic)
- **100% accuracy** from database system catalogs
- **Preserves LLM-generated** semantic context
- **Downstream SQL correctness** (Data Agent sees accurate types)
- **Improved column understanding** (Data Agent sees real sample values for short text columns, improving filter and WHERE clause generation)

### LangGraph State Graph

```typescript
const graph = new StateGraph<AgentState>()
  .addNode('discoverAndGenerate', discoverAndGenerateNode)
  .addNode('discoverRelationships', discoverRelationshipsNode)
  .addNode('generateRelationships', generateRelationshipsNode)
  .addNode('assembleModel', assembleModelNode)
  .addNode('validateModel', validateModelNode)
  .addNode('persistModel', persistModelNode)
  .addEdge(START, 'discoverAndGenerate')
  .addEdge('discoverAndGenerate', 'discoverRelationships')
  .addEdge('discoverRelationships', 'generateRelationships')
  .addEdge('generateRelationships', 'assembleModel')
  .addEdge('assembleModel', 'validateModel')
  .addEdge('validateModel', 'persistModel')
  .addEdge('persistModel', END);
```

### Graph Flow Explanation

#### 1. discoverAndGenerate Node

**Purpose:** Parallel table processing with programmatic discovery + focused LLM generation

**Actions:**
- **Pre-fetch phase:** Fetch foreign keys for all unique schemas upfront (prevents duplicate fetches)
- **Parallel processing:** Process tables in batches with configurable concurrency
  - For each table (in parallel):
    1. Call DiscoveryService to get columns, FKs (from cache), sample data, stats (programmatic)
    2. Make ONE focused LLM call to generate dataset metadata (name, description, field descriptions)
       - Prompt includes dynamically-fetched OSI spec text
    3. Parse LLM response into OSIDataset JSON
    4. **Inject field data types** via `injectFieldDataTypes()` — adds `data_type`, `native_type`, `is_nullable`, `is_primary_key` to each field's `ai_context`
    5. Persist progress to `semantic_model_runs.progress` after each table
    6. Emit SSE progress events (table_complete, table_error)
- **Concurrency control:** `SEMANTIC_MODEL_CONCURRENCY` env var (default: 5, range: 1-20)
- **Error isolation:** `Promise.allSettled()` ensures one table's failure doesn't cancel other tables

**LLM Calls:** 1 per table (total: N tables, executed in parallel batches)

**Output:** Array of datasets with rich metadata, FK data, metrics, and accurate field data types

**Performance:** ~5x speedup with default concurrency=5, ~10x with concurrency=10 (no quality impact)

---

#### 2. discoverRelationships Node

**Purpose:** Programmatic relationship candidate generation and validation (0 LLM calls)

**Four-Phase Algorithm:**

**Phase 1 — Candidate Generation:**
- Converts explicit FK constraints to `RelationshipCandidate` objects
- Generates naming-based candidates via `generateFKCandidates()`:
  - Recognizes FK suffixes: `_id`, `_code`, `_key`, `_ref`, `_num`, `_no`, `_fk`, `id` (no separator)
  - Matches column prefixes to table names via exact, plural, and abbreviation matching
  - Common abbreviation support: `cust`→customers, `usr`→users, `prod`→products, etc.
  - Type compatibility filtering (int↔int, uuid↔uuid, varchar↔varchar, numeric↔numeric)
  - Naming score: 0.9 (exact+_id), 0.85 (plural+_id), 0.7 (other suffix), 0.5 (abbreviation), 0.3 (type-only)
- Deduplicates: explicit FK candidates take priority over naming candidates

**Phase 2 — Value Overlap Validation (parallel):**
- Runs `getColumnValueOverlap()` SQL query for ALL candidates (including explicit FKs)
- Uses existing concurrency limiter (`SEMANTIC_MODEL_CONCURRENCY` env var)
- Single query per candidate pair — samples up to 1000 rows from each table
- Computes overlap ratio, null ratio, and cardinality for each candidate
- Confidence assignment:
  - Explicit FK: always `high` (validated, constraint is authoritative)
  - Inferred + overlap > 80%: `high`
  - Inferred + overlap 50-80%: `medium`
  - Inferred + overlap 20-50%: `low`
  - Inferred + overlap < 20%: `rejected` (filtered out)

**Phase 3 — Junction Table Detection (M:N):**
- Identifies tables with ≥2 validated FK relationships and ≤3 "own" columns (non-FK, non-audit)
- Creates many-to-many relationship candidates between the referenced tables
- Junction table name stored in candidate metadata

**Phase 4 — Summary & Progress:**
- Emits SSE progress events with validation results
- Persists progress to run record
- Returns `relationshipCandidates[]` to graph state

**LLM Calls:** 0

**Output:** Array of `RelationshipCandidate` objects with confidence scores, overlap evidence, and cardinality

**Performance:** ~2-5 seconds for 20-50 candidates at concurrency=5

---

#### 3. generateRelationships Node

**Purpose:** LLM review of pre-validated relationship candidates + model-level metadata generation

**Input:** Receives `relationshipCandidates[]` from discoverRelationships node, grouped by confidence level

**Actions:**
- Presents candidates to LLM grouped by confidence (high/medium/low/M:N) with overlap evidence
- LLM accepts or rejects each candidate based on semantic understanding
- LLM adds relationship names, descriptions, and ai_context for accepted candidates
- LLM may suggest additional relationships missed by programmatic analysis
- Generates model-level metrics and ai_context (same as before)

**Key Design Change:** The LLM moved from "relationship discoverer" to "relationship reviewer" — same pattern shift used when moving from ReAct to table-by-table pipeline for dataset generation.

**LLM Calls:** 1 total

**Output:** Relationships array, model-level metrics, model-level AI context

---

#### 4. assembleModel Node

**Purpose:** Pure programmatic JSON assembly

**Actions:**
- Combine datasets + relationships + metrics into OSI JSON structure
- **Inject relationship column types** via `injectRelationshipDataTypes()` — enriches relationship `ai_context` with join column data types
- Calculate statistics (table count, field count, relationship count, metric count)
- No LLM calls

**LLM Calls:** 0

**Output:** Complete OSI-compliant JSON model with enriched field and relationship metadata

---

#### 5. validateModel Node

**Purpose:** Programmatic structural checks + optional LLM quality review

**Actions:**
- Validate JSON structure against OSI schema (programmatic)
- Check for required fields, valid types, referential integrity
- **Relationship validation** (catches LLM hallucinations):
  - Each relationship must have: name, from, to, from_columns, to_columns
  - Warns if `from` or `to` reference non-existent datasets (e.g., LLM invented a dataset name)
  - Fails if `from_columns` and `to_columns` have different lengths (malformed relationship)
  - This prevents relationships to datasets not included in the model
- **Warning for missing data_type**: Emits non-fatal warning if field's `ai_context` lacks `data_type` (catches calculated/expression fields not mapped to columns)
- Optional: LLM quality review for business logic errors

**LLM Calls:** 0-1 (optional quality review)

**Output:** Validated model or error list (with warnings)

---

#### 6. persistModel Node

**Purpose:** Save model to database

**Actions:**
- Create `SemanticModel` record
- Set status to "ready" or "failed"
- Link to `SemanticModelRun`
- Update run status to "completed"
- Clear progress state

**LLM Calls:** 0

**Output:** Persisted model ID

---

### Complete Data Flow (OSI Spec + Field Data Types)

This diagram shows the full pipeline from agent run start to downstream consumption:

```
1. Agent Run Start
   ├─ OsiSpecService.getSpecText()
   │  ├─ Fetch YAML from GitHub (cache 1hr)
   │  ├─ Fetch JSON schema from GitHub (cache 1hr)
   │  └─ Fallback to bundled static spec if fetch fails
   │
   ├─ Set initial AgentState:
   │  └─ osiSpecText: string (for LLM prompts)
   │
   └─ Build and compile LangGraph

2. discover_and_generate Node
   ├─ Pre-fetch Phase:
   │  └─ Fetch ForeignKeys for all unique schemas → Map<schema, ForeignKeyInfo[]>
   │
   ├─ Parallel Table Processing (concurrency: SEMANTIC_MODEL_CONCURRENCY, default 5):
   │  └─ For each table (in parallel batches):
   │     ├─ Programmatic Discovery:
   │     │  ├─ DiscoveryService.listColumns() → ColumnInfo[]
   │     │  ├─ Get ForeignKeys from pre-fetched cache
   │     │  ├─ DiscoveryService.getSampleData() → rows[]
   │     │  └─ DiscoveryService.getColumnStats() → stats
   │     │
   │     ├─ LLM Generation (1 call per table):
   │     │  ├─ Prompt includes: osiSpecText + columns + sample data
   │     │  └─ LLM outputs: { name, description, fields[{name, description}] }
   │     │
   │     ├─ Parse JSON → OSIDataset
   │     │
   │     ├─ injectFieldDataTypes(dataset, columns):
   │     │  └─ For each field matching a column:
   │     │     └─ field.ai_context = {
   │     │        data_type: "integer",
   │     │        native_type: "int4",
   │     │        is_nullable: false,
   │     │        is_primary_key: true
   │     │     }
   │     │
   │     └─ Emit SSE progress + persist partial model

2.5. discover_relationships Node (NEW)
   ├─ Phase 1: Candidate Generation (in-memory)
   │  ├─ Convert explicit FKs to RelationshipCandidate[]
   │  ├─ generateFKCandidates(): naming heuristics + type matching
   │  └─ Deduplicate (explicit FKs take priority)
   │
   ├─ Phase 2: Value Overlap Validation (parallel)
   │  ├─ For each candidate (in parallel):
   │  │  └─ DiscoveryService.getColumnValueOverlap()
   │  │     └─ Single SQL query: sample 1000 rows, compute overlap ratio
   │  └─ Assign confidence: high (>80%), medium (50-80%), low (20-50%), rejected (<20%)
   │
   ├─ Phase 3: Junction Table Detection (M:N)
   │  └─ Tables with ≥2 FKs and ≤3 own columns → M:N candidates
   │
   └─ Output: RelationshipCandidate[] with overlap evidence

3. generate_relationships Node (once)
   ├─ LLM Review (1 call):
   │  ├─ Prompt includes: osiSpecText + all datasets + pre-validated candidates grouped by confidence
   │  └─ LLM outputs: accepted relationships[] + model description
   │
   └─ Return relationships array

4. assemble_model Node
   ├─ Combine datasets + relationships + metrics → OSI JSON
   │
   ├─ injectRelationshipDataTypes(relationships, datasets):
   │  └─ For each relationship:
   │     └─ relationship.ai_context.column_types = {
   │        from_columns: { customer_id: { data_type, native_type } },
   │        to_columns: { id: { data_type, native_type } }
   │     }
   │
   └─ Calculate stats (table count, field count, etc.)

5. validate_model Node
   ├─ Structural validation (programmatic)
   ├─ Warn if field.ai_context.data_type missing
   └─ Optional: LLM quality review

6. persist_model Node
   ├─ Save SemanticModel to PostgreSQL
   │  └─ model column (JSONB) contains enriched OSI JSON
   │
   └─ Update SemanticModelRun status to "completed"

7. Ontology Creation (downstream)
   ├─ yaml.dump(model) → YAML with ai_context
   ├─ Create Neo4j Dataset nodes:
   │  └─ dataset.yaml contains field data_type + native_type
   │
   └─ Create Neo4j Field nodes:
      └─ field.yaml contains ai_context with types

8. Data Agent Consumption (downstream)
   ├─ get_dataset_details tool
   │  └─ Fetches Dataset.yaml from Neo4j
   │
   ├─ SQL Builder receives YAML with accurate field types:
   │  └─ Knows customer_id is int4, created_at is timestamptz
   │
   └─ Generates correct SQL:
      └─ No type casting errors, proper date/time functions
```

**Key Points:**
- **OSI spec flows through entire LLM generation** (discover_and_generate, generate_relationships)
- **Data types injected programmatically** (zero LLM hallucination)
- **Enriched metadata persists** to PostgreSQL, then Neo4j, then Data Agent
- **No duplication** — types injected once per table, reused downstream
- **Graceful degradation** — missing types emit warnings (not errors)

---

### Discovery Service Methods

The agent uses DiscoveryService for programmatic database introspection (no LLM calls):

#### listColumns(database, schema, table)

**Returns:** Column metadata (name, type, nullable, primaryKey, defaultValue)

**Use Case:** Get table structure

---

#### getForeignKeys(database, schema, table)

**Returns:** Explicit FK constraints with referenced table/column

**Use Case:** Discover relationships defined in schema

---

#### getSampleData(database, schema, table, limit)

**Returns:** Sample rows (default 5, max 100)

**Use Case:** Provide context for LLM to infer field meanings

---

#### getColumnStats(database, schema, table, column)

**Returns:** distinctCount, nullCount, minValue, maxValue

**Use Case:** Assess data quality, identify candidate keys

---

### Per-Table Prompts

The agent uses focused prompts for each table to generate rich metadata:

**Dataset Generation Prompt (per table):**
```
Given this table structure and sample data, generate:
1. A clear dataset name (semantic, not technical)
2. A business-oriented description
3. For each field:
   - Semantic name (if technical)
   - Clear description of what it represents
   - Any business rules or constraints

Table: {schema}.{table}
Columns: {columns with types}
Sample Data: {5 rows}
Statistics: {row count, null counts}

Output JSON with: name, description, fields[{name, description}]
```

**Relationships Generation Prompt (once):**
```
You are finalizing an OSI semantic model by generating relationships and model-level metadata.

## Model: {modelName}
Database: {databaseName}

## Datasets in the model
[JSON array of dataset summaries: name, source, primaryKey, columns]

## Foreign Key Constraints (between selected tables only)
[JSON array of FK constraints: fromTable, fromColumns, toTable, toColumns]
[If none found: "None found between the selected tables"]

## Your Task

Generate a JSON object with:

### 1. relationships (Array)
- Create a relationship for EVERY explicit foreign key constraint listed above
- Also infer additional relationships from naming patterns:
  - Column names ending in "_id" that match another dataset's name (e.g., customer_id → customers)
  - Column names matching "<table_name>_id" pattern
- Each relationship needs:
  - **name**: Descriptive name (e.g., "order_customer" or "fk_orders_customer_id")
  - **from**: The dataset name containing the foreign key column (many side)
  - **to**: The dataset name being referenced (one side)
  - **from_columns**: Array of FK column names
  - **to_columns**: Array of referenced column names
  - **ai_context**: For inferred relationships, include { "notes": "Inferred from naming pattern", "confidence": "high" or "medium" or "low" }

### 2. model_metrics (Array)
- Generate cross-table aggregate metrics that make business sense
- Only create metrics that span multiple datasets
- Examples: total count of records, average values, ratios
- Each metric needs: name, expression (ANSI_SQL dialect), description, ai_context with synonyms
- **CRITICAL**: Metric expressions MUST use fully qualified column names: `schema.table.column`
- If no cross-table metrics make sense, return an empty array

### 3. model_ai_context (Object)
- **instructions**: Brief description of what this semantic model represents and how to use it
- **synonyms**: At least 5 domain-related terms for this database/model

Output ONLY a valid JSON object:
{
  "relationships": [...],
  "model_metrics": [...],
  "model_ai_context": { "instructions": "...", "synonyms": [...] }
}
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
- Opens agent UI with real-time progress

**Agent UI:**
- Linear progress bar showing percentage completion
- Elapsed timer (mm:ss format)
- Per-table status list (discovering → generating → complete/failed)
- Failed tables warning on completion
- Auto-redirect to detail page on success

---

### 3. AgentLog Component

File: `apps/web/src/components/semantic-models/AgentLog.tsx`

**Purpose:** Log-style progress view for agent execution

**Key Features:**
- Linear progress bar (0-100% based on completed tables)
- Elapsed time display (mm:ss format)
- Per-table status list with phases:
  - Discovering (blue)
  - Generating (blue)
  - Complete (green)
  - Failed (red)
- Log entries with markdown rendering (react-markdown)
- Syntax-highlighted code blocks (react-syntax-highlighter)
- Auto-scroll to latest entry
- Success/error final state
- Failed tables summary

**SSE Connection:**
```typescript
// Use fetch() + ReadableStream for SSE with POST + auth
const response = await fetch(`/api/semantic-models/runs/${runId}/stream`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
});

const reader = response.body.getReader();
// Parse data: <json>\n\n format manually
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

### 2. SSE Streaming with Fastify Hijack

**Pattern:** Direct SSE streaming via Fastify hijack + fetch() + ReadableStream

**Backend Setup:**

```typescript
import { FastifyRequest, FastifyReply } from 'fastify';

@Post('runs/:runId/stream')
@Auth({ permissions: [PERMISSIONS.SEMANTIC_MODELS_GENERATE] })
async streamAgentRun(
  @Param('runId') runId: string,
  @CurrentUser('id') userId: string,
  @Res() res: FastifyReply,
) {
  // CRITICAL: hijack() prevents Fastify from calling res.end()
  res.hijack();
  const raw = res.raw;

  // Write SSE headers
  raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Emit helper
  const emit = (event: object) => {
    if (!raw.writableEnded) {
      raw.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  };

  // Keep-alive heartbeat every 30s
  const keepAlive = setInterval(() => {
    if (!raw.writableEnded) {
      raw.write(': keep-alive\n\n');
    }
  }, 30_000);

  // Stream graph execution
  const stream = await graph.stream(initialState, {
    streamMode: 'updates',
    callbacks: [sseHandler],
  });

  for await (const data of stream) {
    // Process updates and emit events
  }

  clearInterval(keepAlive);
  raw.end();
}
```

**Frontend Setup:**

```typescript
import { useEffect, useState } from 'react';
import { api } from '../../services/api';

function AgentLog({ runId }: { runId: string }) {
  useEffect(() => {
    const abortController = new AbortController();

    const connectToStream = async () => {
      // 100ms delay for React StrictMode — cleanup aborts before fetch starts
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (abortController.signal.aborted) return;

      const token = api.getAccessToken();
      const response = await fetch(`/api/semantic-models/runs/${runId}/stream`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        signal: abortController.signal,
      });

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse data: <json>\n\n format manually
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          if (part.startsWith('data: ')) {
            const event = JSON.parse(part.slice(6));
            handleEvent(event);
          }
        }
      }
    };

    connectToStream();

    return () => {
      abortController.abort();
    };
  }, [runId]);

  // Render log entries
}
```

**Key Points:**
- `res.hijack()` is **mandatory** for Fastify — prevents automatic `res.end()` when controller returns
- 100ms delay before fetch handles React StrictMode double-firing (cleanup aborts before request starts)
- Keep-alive heartbeat every 30s prevents proxy/CDN timeouts
- Use `fetch()` + `ReadableStream` (not EventSource) for POST method + auth headers

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

async function exportModelAsYaml(modelId: string): Promise<string> {
  const model = await prisma.semanticModel.findUnique({
    where: { id: modelId },
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
): Promise<string> {
  return this.semanticModelsService.exportYaml(id);
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
│   │   ├── agent-stream.controller.ts          # SSE streaming endpoint (Fastify hijack)
│   │   ├── dto/
│   │   │   ├── create-run.dto.ts               # Create run validation (Zod)
│   │   │   ├── update-semantic-model.dto.ts    # Update validation (Zod)
│   │   │   └── semantic-model-query.dto.ts     # List query validation (Zod)
│   │   └── agent/
│   │       ├── agent.service.ts                # Agent orchestration and graph configuration
│   │       ├── graph.ts                        # LangGraph StateGraph (6 linear nodes)
│   │       ├── state.ts                        # Agent state (LangGraph Annotation.Root)
│   │       ├── utils.ts                        # JSON extraction, token tracking utilities
│   │       ├── nodes/                          # Graph nodes (linear pipeline)
│   │       │   ├── discover-and-generate.ts    # Table-by-table discovery + LLM generation
│   │       │   ├── discover-relationships.ts   # Programmatic relationship discovery and validation node
│   │       │   ├── generate-relationships.ts   # LLM review of pre-validated candidates (1 LLM call)
│   │       │   ├── assemble-model.ts           # Pure programmatic JSON assembly
│   │       │   ├── validate-model.ts           # Structural checks + optional LLM review
│   │       │   └── persist-model.ts            # Save model + stats to database
│   │       ├── validation/
│   │       │   └── structural-validator.ts     # Programmatic OSI model validation
│   │       ├── prompts/
│   │       │   ├── generate-dataset-prompt.ts  # Per-table dataset generation (includes OSI spec)
│   │       │   └── generate-relationships-prompt.ts  # Relationships generation (includes OSI spec)
│   │       ├── osi/
│   │       │   ├── osi-spec.service.ts         # Dynamic OSI spec fetcher
│   │       │   ├── spec.ts                     # Static fallback spec
│   │       │   └── __tests__/
│   │       │       └── osi-spec.service.spec.ts  # 10 tests for spec service
│   │       ├── utils/
│   │       │   ├── inject-field-data-types.ts  # Programmatic data type injection
│   │       │   ├── concurrency.ts              # Lightweight concurrency limiter for parallel processing
│   │       │   ├── naming-heuristics.ts        # FK candidate generation from naming patterns
│   │       │   └── __tests__/
│   │       │       └── inject-field-data-types.spec.ts  # 16 tests for injection utils
│   │       └── types/
│   │           ├── osi.types.ts                # OSI model TypeScript types
│   │           └── relationship-candidate.ts   # Types for relationship candidates
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
    │       ├── AgentLog.tsx                    # Log-style SSE progress viewer
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
├── package.json                                # Added: @langchain/langgraph, @langchain/openai, @langchain/anthropic, js-yaml
└── src/
    └── app.module.ts                           # Imported SemanticModelsModule, DiscoveryModule, LLMModule

apps/web/
├── package.json                                # Added: react-markdown, react-syntax-highlighter
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
- ✅ Returns all models (system-level access)
- ✅ Search by name/description
- ✅ Filter by status
- ✅ Filter by connectionId
- ✅ Sort by name, status, createdAt, tableCount

**GET /api/semantic-models/:id**
- ✅ 401 if not authenticated
- ✅ 403 for viewer
- ✅ 200 with full model JSON
- ✅ 404 for non-existent

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

#### Unit Tests: OSI Spec Service

File: `apps/api/src/semantic-models/agent/osi/__tests__/osi-spec.service.spec.ts`

**Coverage (10 tests):**

**Spec Fetching**
- ✅ Fetches spec YAML from GitHub on first call
- ✅ Fetches JSON schema from GitHub on first call
- ✅ Uses cached spec YAML on subsequent calls (within 1hr TTL)
- ✅ Uses cached JSON schema on subsequent calls
- ✅ Respects cache expiration after 1 hour

**Error Handling**
- ✅ Falls back to static spec YAML if GitHub fetch fails
- ✅ Falls back to static JSON schema if GitHub fetch fails
- ✅ Handles fetch timeout (10 seconds)

**Cache Management**
- ✅ clearCache() invalidates cached spec and schema
- ✅ getSchemaJson() returns parsed JSON schema

**Run:**
```bash
cd apps/api && npm test -- osi-spec.service
```

---

#### Unit Tests: Field Data Type Injection

File: `apps/api/src/semantic-models/agent/utils/__tests__/inject-field-data-types.spec.ts`

**Coverage (16 tests):**

**injectFieldDataTypes() (9 tests)**
- ✅ Injects data_type, native_type, is_nullable, is_primary_key into field ai_context
- ✅ Converts string ai_context to object before injection
- ✅ Creates ai_context object if null or undefined
- ✅ Preserves existing ai_context properties
- ✅ Matches fields case-insensitively
- ✅ Skips fields that don't match any column (calculated fields)
- ✅ Handles fields with no ai_context initially
- ✅ Does not mutate original dataset
- ✅ Works with multiple fields per dataset

**injectRelationshipDataTypes() (7 tests)**
- ✅ Injects column_types into relationship ai_context
- ✅ Creates ai_context object if it doesn't exist
- ✅ Creates column_types with from_columns and to_columns
- ✅ Uses data_type and native_type from enriched fields
- ✅ Preserves existing ai_context properties
- ✅ Skips relationships where field not found in dataset
- ✅ Handles multi-column join keys

**Run:**
```bash
cd apps/api && npm test -- inject-field-data-types
```

---

#### Integration Tests: Table-by-Table Agent

File: `apps/api/src/semantic-models/agent/__tests__/table-by-table-agent.spec.ts`

**New Coverage (6 additional tests):**

**OSI Spec Integration**
- ✅ osiSpecText is set in initial agent state
- ✅ osiSpecText is passed to discover-and-generate node
- ✅ OSI spec YAML is included in dataset generation prompt
- ✅ OSI spec YAML is included in relationships generation prompt

**Field Data Type Validation**
- ✅ Validator emits warning if field ai_context lacks data_type
- ✅ osiSpecText is available in assemble model state

**Existing tests (coverage for full agent pipeline):**
- ✅ Complete agent run generates valid semantic model
- ✅ Per-table progress tracking works correctly
- ✅ Failed tables don't block overall completion
- ✅ Partial models saved on error

**Run:**
```bash
cd apps/api && npm test -- table-by-table-agent
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

# Semantic Model Generation
SEMANTIC_MODEL_CONCURRENCY=5  # Default: 5, Range: 1-20 (parallel table processing)
```

**Validation:**
- At least one LLM provider must be configured
- Missing LLM configuration will cause semantic model generation to fail
- Other features (connections, storage, etc.) work without LLM config
- `SEMANTIC_MODEL_CONCURRENCY` is optional (defaults to 5 if not set, clamped to 1-20 range)

---

### NPM Packages

Added to `apps/api/package.json`:

```json
{
  "dependencies": {
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
    "react-markdown": "^9.0.0",
    "react-syntax-highlighter": "^15.5.0"
  },
  "devDependencies": {
    "@types/react-syntax-highlighter": "^15.5.0"
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

The Semantic Models feature provides an AI-powered, autonomous way to generate semantic models from database connections. It demonstrates:

- **Advanced agent architecture** using LangGraph with table-by-table pipeline
- **Real-time progress streaming** via direct SSE with Fastify hijack
- **Multi-provider LLM support** with pluggable architecture
- **Dynamic OSI specification fetching** for always-current compliance
- **Hybrid metadata enrichment** combining LLM descriptions with programmatic data type injection
- **Zero hallucination on technical metadata** through programmatic field data type injection
- **Intelligent relationship inference** beyond explicit foreign keys
- **Comprehensive discovery** for PostgreSQL databases (extensible to other DBs)
- **Security and safety** with read-only queries, timeouts, and row limits
- **RBAC enforcement** at API and UI levels
- **Type safety** with TypeScript and Zod validation
- **Testability** with comprehensive unit and integration tests (80+ tests)
- **Downstream correctness** enabling accurate SQL generation in Data Agent

**Key Innovations:**

1. **Dynamic Spec Fetching**: Always uses latest OSI spec from GitHub with graceful fallback
2. **Programmatic Type Injection**: Zero LLM hallucination on data types by injecting from database system catalogs
3. **Table-by-Table Pipeline**: ~80% token reduction vs ReAct while improving quality
4. **Parallel Table Processing**: 5-10x speedup with configurable concurrency (no quality degradation)
5. **Enriched ai_context**: Field and relationship metadata flows to Neo4j ontology and Data Agent for correct SQL generation

This specification serves as both documentation and a blueprint for building AI-powered features with agent-based workflows that balance LLM creativity with programmatic precision.
