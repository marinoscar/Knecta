# Data Agent Feature Specification

## Table of Contents

1. [Feature Overview](#feature-overview)
2. [Architecture](#architecture)
3. [Database Schema](#database-schema)
4. [API Endpoints](#api-endpoints)
5. [Security](#security)
6. [RBAC Permissions](#rbac-permissions)
7. [Embedding Service](#embedding-service)
8. [Neo4j Vector Search](#neo4j-vector-search)
9. [Agent Architecture](#agent-architecture)
10. [SSE Streaming](#sse-streaming)
11. [Docker Python Sandbox](#docker-python-sandbox)
12. [Frontend Components](#frontend-components)
13. [Configuration](#configuration)
14. [File Inventory](#file-inventory)
15. [Testing](#testing)
16. [Packages](#packages)

---

## Feature Overview

The Data Agent feature enables natural language querying and analysis of data through ontology graphs. Users interact with a ChatGPT-style interface where an AI agent understands their questions, finds relevant datasets, executes SQL queries, and performs Python-based analysis with visualizations.

### Core Capabilities

- **Natural Language Querying**: Ask questions about data in plain English
- **Intelligent Dataset Discovery**: Vector similarity search finds relevant datasets from ontology graph
- **ReAct Agent Pattern**: Iterative tool-calling for complex multi-step analysis
- **Read-Only SQL Execution**: Safe query execution with 30s timeout and SELECT-only enforcement
- **Python Analysis Sandbox**: Isolated Docker environment for data analysis and chart generation
- **Conversational History**: Persistent chat threads with full context retrieval
- **Real-Time Streaming**: SSE-based streaming of agent reasoning and tool execution
- **ChatGPT-Style UI**: Modern chat interface with markdown rendering, syntax highlighting, and image display

### Use Cases

1. **Business Analysts**: Query sales trends, customer metrics, and KPIs without SQL knowledge
2. **Data Scientists**: Perform exploratory data analysis with automatic chart generation
3. **Product Managers**: Get quick insights and data visualizations for decision-making
4. **Developers**: Test semantic models by asking natural language questions
5. **Executives**: Access business intelligence through conversational interface

### Current Limitations

- **PostgreSQL Only**: Agent currently supports PostgreSQL databases (discovery limitations)
- **Read-Only Access**: No data modification capabilities (safety constraint)
- **Single Ontology per Chat**: Each conversation scoped to one ontology
- **30s Query Timeout**: Long-running queries will timeout
- **512MB Sandbox Memory**: Large dataset processing may hit memory limits
- **No External Network**: Python sandbox cannot access external APIs or packages beyond pre-installed

---

## Architecture

The Data Agent uses a multi-service architecture combining NestJS backend, Neo4j vector search, LangGraph ReAct agent, and Docker-isolated Python execution:

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Frontend Layer                              │
│  React + Material UI + SSE Streaming                                 │
│                                                                       │
│  ChatSidebar (conversation list)                                     │
│  ChatView (message display with markdown + charts)                   │
│  ChatInput (textarea with Enter to send)                             │
│  ToolCallAccordion (collapsible tool execution details)              │
│  WelcomeScreen (empty state with suggestions)                        │
│  NewChatDialog (ontology selection)                                  │
└────────────────────────────┬─────────────────────────────────────────┘
                             │ HTTPS (Nginx)
                             │ REST API + SSE
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                          Backend Layer                               │
│  NestJS + Fastify + TypeScript                                       │
│                                                                       │
│  DataAgentController (CRUD REST API)                                 │
│           ↓                                                           │
│  DataAgentService (Business Logic, PostgreSQL CRUD)                  │
│           ↓                                                           │
│  AgentStreamController (SSE streaming endpoint)                      │
│           ↓                                                           │
│  DataAgentAgentService (ReAct agent orchestration)                   │
│           ↓                                                           │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ ReAct Agent (LangGraph)                                       │  │
│  │                                                                │  │
│  │  Tools:                                                       │  │
│  │  1. query_database → DiscoveryService → Database             │  │
│  │  2. get_dataset_details → NeoOntologyService → Neo4j         │  │
│  │  3. get_sample_data → DiscoveryService → Database            │  │
│  │  4. run_python → SandboxService → Docker Container           │  │
│  │  5. list_datasets → NeoOntologyService → Neo4j               │  │
│  │                                                                │  │
│  │  System Prompt:                                               │  │
│  │  - Relevant datasets (top 10 from vector search)             │  │
│  │  - Relationship join hints (FK paths between tables)         │  │
│  │  - Conversation history (last 10 messages with tool context) │  │
│  │  - Database type and constraints                             │  │
│  │  - Error recovery strategies                                 │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  EmbeddingService (OpenAI text-embedding-3-small)                    │
│           ↓                                                           │
│  NeoVectorService (vector similarity search in Neo4j)                │
└─────────────┬────────────────┬────────────────┬────────────────────┘
              │                │                │
              ▼                ▼                ▼
┌──────────────────┐  ┌─────────────────┐  ┌──────────────────────┐
│   PostgreSQL     │  │   Neo4j Graph   │  │  Python Sandbox      │
│                  │  │                 │  │  (Docker Container)  │
│ - data_chats     │  │ - Dataset nodes │  │                      │
│ - data_chat_     │  │   with vector   │  │ - Flask server       │
│   messages       │  │   embeddings    │  │ - pandas, numpy      │
│                  │  │ - Vector index  │  │ - matplotlib         │
│ - Conversation   │  │ - Similarity    │  │ - 512MB memory       │
│   history        │  │   search        │  │ - Read-only FS       │
└──────────────────┘  └─────────────────┘  │ - No network         │
                                            └──────────────────────┘
```

### System Components

#### Backend Modules
- **DataAgentModule**: Main feature module
- **DataAgentService**: CRUD operations for chats and messages
- **DataAgentAgentService**: ReAct agent creation and execution
- **AgentStreamController**: SSE streaming endpoint
- **EmbeddingService**: Multi-provider embedding generation (OpenAI)
- **NeoVectorService**: Vector index management and similarity search
- **SandboxService**: Python code execution client
- **DiscoveryService**: Database schema discovery and query execution

#### Frontend Components
- **DataAgentPage**: Full-page layout with sidebar + chat area
- **ChatSidebar**: Conversation list with search, grouping, rename/delete
- **ChatView**: Message display with auto-scroll and markdown rendering
- **ChatMessage**: Individual message bubble with role-based styling
- **ToolCallAccordion**: Collapsible tool execution display
- **ChatInput**: Auto-resize textarea with Enter to send
- **WelcomeScreen**: Empty state with suggestion cards
- **NewChatDialog**: Ontology selection for new chats

#### External Services
- **Neo4j**: Vector index on Dataset nodes for semantic search
- **PostgreSQL**: Chat and message persistence
- **Docker Sandbox**: Isolated Python execution environment
- **OpenAI API**: Embedding generation (text-embedding-3-small)
- **LLM Provider**: Chat completion (OpenAI, Anthropic, or Azure)

---

## Database Schema

### Prisma Models

Located in `apps/api/prisma/schema.prisma`:

```prisma
model DataChat {
  id         String            @id @default(uuid()) @db.Uuid
  name       String            @db.VarChar(255)
  ontologyId String            @map("ontology_id") @db.Uuid
  ownerId    String            @map("owner_id") @db.Uuid
  createdAt  DateTime          @default(now()) @map("created_at") @db.Timestamptz
  updatedAt  DateTime          @updatedAt @map("updated_at") @db.Timestamptz

  // Relations
  ontology Ontology          @relation("DataChatOntology", fields: [ontologyId], references: [id], onDelete: Cascade)
  owner    User              @relation("UserDataChats", fields: [ownerId], references: [id], onDelete: Cascade)
  messages DataChatMessage[] @relation("ChatMessages")

  @@index([ownerId])
  @@index([ontologyId])
  @@index([updatedAt])
  @@map("data_chats")
}

model DataChatMessage {
  id        String   @id @default(uuid()) @db.Uuid
  chatId    String   @map("chat_id") @db.Uuid
  role      String   @db.VarChar(20)  // 'user' or 'assistant'
  content   String   @db.Text
  metadata  Json?    // { toolCalls, tokensUsed, datasetsUsed, error, claimed }
  status    String   @default("complete") @db.VarChar(20)  // 'generating', 'complete', 'failed'
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz

  // Relations
  chat DataChat @relation("ChatMessages", fields: [chatId], references: [id], onDelete: Cascade)

  @@index([chatId])
  @@index([createdAt])
  @@map("data_chat_messages")
}
```

### DataChat Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | Primary key |
| `name` | String | Yes | Chat title (max 255 chars) |
| `ontologyId` | UUID | Yes | Foreign key to ontologies.id |
| `ownerId` | UUID | Yes | Foreign key to users.id |
| `createdAt` | Timestamp | Yes | Chat creation time |
| `updatedAt` | Timestamp | Yes | Last message time (auto-updated) |

### DataChatMessage Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | Primary key |
| `chatId` | UUID | Yes | Foreign key to data_chats.id |
| `role` | Enum | Yes | Message role: 'user' or 'assistant' |
| `content` | Text | Yes | Message content (markdown for assistant) |
| `metadata` | JSONB | No | Tool calls, tokens, datasets used, errors |
| `status` | Enum | Yes | Status: 'generating', 'complete', 'failed' |
| `createdAt` | Timestamp | Yes | Message creation time |

### Metadata Structure

```typescript
interface MessageMetadata {
  // Tool execution tracking
  toolCalls?: Array<{
    name: string;
    args: Record<string, any>;
    result?: string;  // Tool execution result (truncated to 2000 chars), used for conversation context
  }>;

  // Token usage
  tokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };

  // Dataset references
  datasetsUsed?: string[];  // Array of dataset names accessed

  // Error tracking
  error?: {
    message: string;
    code: string;
    timestamp: string;
  };

  // Execution state
  claimed?: boolean;  // True if message generation started
}
```

### Indexes

- `data_chats.ownerId` - Fast lookup for user's chats
- `data_chats.ontologyId` - Find chats for an ontology
- `data_chats.updatedAt` - Sort by recent activity
- `data_chat_messages.chatId` - Fetch messages for chat
- `data_chat_messages.createdAt` - Chronological ordering

---

## API Endpoints

All endpoints require authentication. Base path: `/api/data-agent`

### 1. List Data Chats

```http
GET /api/data-agent/chats
```

**Query Parameters:**
- `page` (number, default: 1) - Page number
- `pageSize` (number, default: 20) - Items per page
- `search` (string, optional) - Search in chat name
- `ontologyId` (UUID, optional) - Filter by ontology
- `sortBy` (enum, default: 'updatedAt') - Sort field (updatedAt, createdAt, name)
- `sortOrder` (enum, default: 'desc') - Sort direction (asc, desc)

**Permission:** `data_agent:read`

**Response (200):**
```json
{
  "data": {
    "items": [
      {
        "id": "uuid",
        "name": "Sales Analysis Q4 2025",
        "ontologyId": "uuid",
        "ownerId": "uuid",
        "createdAt": "2025-01-15T10:00:00Z",
        "updatedAt": "2025-01-15T14:30:00Z",
        "messageCount": 12
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

### 2. Get Data Chat by ID

```http
GET /api/data-agent/chats/:id
```

**Parameters:**
- `id` (UUID, path) - Chat ID

**Permission:** `data_agent:read`

**Response (200):**
```json
{
  "data": {
    "id": "uuid",
    "name": "Sales Analysis Q4 2025",
    "ontologyId": "uuid",
    "ownerId": "uuid",
    "createdAt": "2025-01-15T10:00:00Z",
    "updatedAt": "2025-01-15T14:30:00Z",
    "messages": [
      {
        "id": "uuid",
        "role": "user",
        "content": "What were the top 5 customers by revenue?",
        "metadata": null,
        "status": "complete",
        "createdAt": "2025-01-15T10:01:00Z"
      },
      {
        "id": "uuid",
        "role": "assistant",
        "content": "Based on the sales data, here are the top 5 customers...",
        "metadata": {
          "toolCalls": [...],
          "tokensUsed": { "prompt": 1500, "completion": 800, "total": 2300 },
          "datasetsUsed": ["customers", "orders"]
        },
        "status": "complete",
        "createdAt": "2025-01-15T10:01:15Z"
      }
    ]
  }
}
```

**Response (404):** Chat not found or not owned by user

---

### 3. Create Data Chat

```http
POST /api/data-agent/chats
```

**Permission:** `data_agent:write`

**Request Body:**
```json
{
  "name": "Sales Analysis Q4 2025",
  "ontologyId": "uuid"
}
```

**Validation Rules:**
- `name`: Required, 1-255 characters
- `ontologyId`: Required, must reference a "ready" ontology owned by user

**Response (201):**
```json
{
  "data": {
    "id": "uuid",
    "name": "Sales Analysis Q4 2025",
    "ontologyId": "uuid",
    "ownerId": "uuid",
    "createdAt": "2025-01-15T10:00:00Z",
    "updatedAt": "2025-01-15T10:00:00Z",
    "messages": []
  }
}
```

**Response (400):** Validation error or ontology not ready

**Response (404):** Ontology not found or not owned by user

---

### 4. Update Data Chat

```http
PATCH /api/data-agent/chats/:id
```

**Permission:** `data_agent:write`

**Request Body:**
```json
{
  "name": "Updated Chat Name"
}
```

**Validation Rules:**
- `name`: Optional, 1-255 characters

**Response (200):** Updated chat object

**Response (404):** Chat not found or not owned by user

---

### 5. Delete Data Chat

```http
DELETE /api/data-agent/chats/:id
```

**Permission:** `data_agent:delete`

**Response (204):** No content (success)

**Response (404):** Chat not found or not owned by user

**Side Effects:**
- Deletes chat record from PostgreSQL
- Cascades deletion to all messages
- Creates audit event

---

### 6. Send Message

```http
POST /api/data-agent/chats/:id/messages
```

**Permission:** `data_agent:write`

**Request Body:**
```json
{
  "content": "What were the top 5 customers by revenue in Q4?"
}
```

**Validation Rules:**
- `content`: Required, 1-10000 characters

**Response (201):**
```json
{
  "data": {
    "userMessage": {
      "id": "uuid",
      "role": "user",
      "content": "What were the top 5 customers by revenue in Q4?",
      "status": "complete",
      "createdAt": "2025-01-15T10:01:00Z"
    },
    "assistantMessage": {
      "id": "uuid",
      "role": "assistant",
      "content": "",
      "status": "generating",
      "createdAt": "2025-01-15T10:01:00Z"
    }
  }
}
```

**Response (404):** Chat not found or not owned by user

**Side Effects:**
- Creates user message (status: 'complete')
- Creates assistant message placeholder (status: 'generating')
- Both messages created in single transaction
- Frontend opens SSE stream to `/stream` endpoint with assistant message ID

---

### 7. Stream Agent Response (SSE)

```http
POST /api/data-agent/chats/:chatId/messages/:messageId/stream
```

**Permission:** `data_agent:write`

**Headers:**
- `Accept: text/event-stream`

**Response:** Server-Sent Events stream

**SSE Event Types:**

| Event | Payload | Description |
|-------|---------|-------------|
| `message_start` | `{}` | Agent processing started |
| `tool_call` | `{ name: string, args: object }` | Tool invoked |
| `tool_result` | `{ name: string, result: string }` | Tool completed (result truncated to 2000 chars) |
| `text` | `{ content: string }` | AI response text |
| `token_update` | `{ tokensUsed: { prompt, completion, total } }` | Final token counts |
| `message_complete` | `{ content: string, metadata: object }` | Execution finished |
| `message_error` | `{ message: string }` | Execution failed |

**SSE Format:**
```
event: message_start
data: {}

event: tool_call
data: {"name":"query_database","args":{"sql":"SELECT * FROM customers LIMIT 5"}}

event: tool_result
data: {"name":"query_database","result":"| id | name | revenue |\n|---|---|---|\n| 1 | Acme | 50000 |"}

event: text
data: {"content":"Based on the query results, here are the top 5 customers..."}

event: token_update
data: {"tokensUsed":{"prompt":1500,"completion":800,"total":2300}}

event: message_complete
data: {"content":"Full response text...","metadata":{"toolCalls":[...],"tokensUsed":{...},"datasetsUsed":[...]}}
```

**Error Handling:**
- 30s keep-alive heartbeat (`:heartbeat\n\n`)
- Atomic message claiming prevents duplicate execution
- Failed executions update message status to 'failed'
- Errors emitted via `message_error` event before stream closes

**Response (404):** Chat or message not found or not owned by user

**Response (409):** Message already claimed (generation in progress)

---

## Security

### Read-Only SQL Enforcement

All database queries executed via `DiscoveryService.executeQuery()` with strict safety:

1. **SELECT-only validation**: Regex check blocks INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, GRANT, REVOKE
2. **Transaction isolation**: All queries run in `READ ONLY` transaction mode
3. **Timeout enforcement**: 30-second query timeout (prevents runaway queries)
4. **Connection pooling**: Queries use existing database connections (from connections table)
5. **Result size limits**: Maximum 500 rows returned per query
6. **Error sanitization**: Database errors sanitized to prevent credential leaks

**Validation Pattern:**
```typescript
const SQL_READ_ONLY_REGEX = /^\s*(SELECT|WITH)/i;
const SQL_DANGEROUS_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\b/i;

if (!SQL_READ_ONLY_REGEX.test(sql) || SQL_DANGEROUS_KEYWORDS.test(sql)) {
  throw new Error('Only SELECT queries are allowed');
}

// Execute with read-only transaction
await connection.query('BEGIN TRANSACTION READ ONLY');
const result = await connection.query(sql);
await connection.query('COMMIT');
```

---

### Python Sandbox Security

Docker container runs with aggressive isolation:

1. **Read-only filesystem**: Container FS mounted read-only except `/tmp`
2. **No capabilities**: All Linux capabilities dropped
3. **Resource limits**: 512MB memory, 1 CPU core
4. **No external network**: Container on isolated bridge network
5. **Execution timeout**: 30s default (configurable per request)
6. **No persistent state**: Each execution isolated, no shared memory
7. **Library whitelist**: Only pre-installed packages (pandas, numpy, matplotlib, etc.)
8. **Subprocess isolation**: Python code runs in subprocess with timeout

**Docker Security Configuration:**
```yaml
sandbox:
  image: knecta-sandbox:latest
  read_only: true
  tmpfs:
    - /tmp:rw,size=100M
  cap_drop:
    - ALL
  security_opt:
    - no-new-privileges:true
  deploy:
    resources:
      limits:
        memory: 512M
        cpus: '1.0'
  networks:
    - sandbox-isolated  # No external access
```

---

### Namespace Isolation

All Neo4j vector searches filtered by `ontologyId`:

1. **Vector index scoped**: Similarity search post-filters by `ontologyId` property
2. **Dataset details query**: `MATCH (d:Dataset {ontologyId: $ontologyId})` filter on all queries
3. **No cross-ontology access**: Users can only query datasets from their owned ontologies
4. **Ownership chain validation**: Chat → Ontology → Semantic Model → Connection (all owned by user)

---

### Ownership Enforcement

All operations verify ownership chain:

1. **Chat ownership**: `chat.ownerId === userId`
2. **Ontology ownership**: `ontology.ownerId === userId` (via chat → ontology relation)
3. **Message ownership**: Inherited from chat ownership
4. **Connection access**: Semantic model references connection owned by user

**Ownership Validation:**
```typescript
// Verify chat ownership
const chat = await prisma.dataChat.findUnique({
  where: { id: chatId },
  include: { ontology: { include: { semanticModel: true } } }
});

if (chat.ownerId !== userId) {
  throw new ForbiddenException('Not authorized to access this chat');
}

if (chat.ontology.ownerId !== userId) {
  throw new ForbiddenException('Not authorized to access this ontology');
}
```

---

### Atomic Message Claiming

Prevents duplicate agent execution:

```typescript
async claimMessage(messageId: string): Promise<boolean> {
  // Atomic update: only claim if not already claimed.
  // The message is created with metadata={}, so we check for that exact value.
  // After claiming, metadata becomes {claimed:true}, so a second attempt won't match.
  const result = await this.prisma.dataChatMessage.updateMany({
    where: {
      id: messageId,
      status: 'generating',
      metadata: {
        equals: {},  // Only match messages with empty metadata (initial state)
      },
    },
    data: {
      metadata: {
        claimed: true,
      },
    },
  });

  return result.count === 1;  // True if we claimed it, false if already claimed
}
```

**Implementation Note:**

The implementation uses `metadata: { equals: {} }` instead of JSON path filtering because of PostgreSQL's three-valued NULL logic. When metadata is `{}`, the JSON path expression `['claimed']` returns NULL, and `NOT (NULL = true)` evaluates to NULL (not TRUE), so the row never matches the WHERE clause.

The fix checks that metadata equals the empty object `{}` (initial state). After claiming, metadata becomes `{claimed: true}`, so duplicate attempts fail the WHERE condition.

**Flow:**
1. Frontend opens SSE stream
2. Backend attempts to claim message via `claimMessage()`
3. If claim succeeds → start agent execution
4. If claim fails → return 409 Conflict (already processing)
5. React StrictMode safe: 100ms delay in useEffect before fetch allows cleanup to abort

---

## RBAC Permissions

Defined in `apps/api/src/common/constants/roles.constants.ts`:

```typescript
export const PERMISSIONS = {
  DATA_AGENT_READ: 'data_agent:read',
  DATA_AGENT_WRITE: 'data_agent:write',
  DATA_AGENT_DELETE: 'data_agent:delete',
} as const;
```

### Permission Matrix

| Role | data_agent:read | data_agent:write | data_agent:delete |
|------|----------------|------------------|------------------|
| **Admin** | ✅ | ✅ | ✅ |
| **Contributor** | ✅ | ✅ | ✅ |
| **Viewer** | ✅ | ❌ | ❌ |

**Note:** Viewers can read chat history but cannot create chats, send messages, or delete chats.

### Controller Usage

```typescript
@Get()
@Auth({ permissions: [PERMISSIONS.DATA_AGENT_READ] })
@ApiOperation({ summary: 'List data chats' })
async list(
  @Query() query: ChatQueryDto,
  @CurrentUser('id') userId: string,
) {
  return this.dataAgentService.list(query, userId);
}

@Post(':id/messages')
@Auth({ permissions: [PERMISSIONS.DATA_AGENT_WRITE] })
@ApiOperation({ summary: 'Send message to chat' })
async sendMessage(
  @Param('id') chatId: string,
  @Body() dto: SendMessageDto,
  @CurrentUser('id') userId: string,
) {
  return this.dataAgentService.sendMessage(chatId, dto.content, userId);
}
```

---

## Embedding Service

The EmbeddingService provides multi-provider text embedding generation for semantic search.

### Architecture

```
EmbeddingService (facade)
    ↓
EmbeddingProvider (interface)
    ↓
OpenAIEmbeddingProvider (implementation)
```

### EmbeddingProvider Interface

```typescript
export interface EmbeddingProvider {
  /**
   * Generate embedding for a single text
   */
  generateEmbedding(text: string): Promise<number[]>;

  /**
   * Generate embeddings for multiple texts (batch)
   */
  generateEmbeddings(texts: string[]): Promise<number[][]>;

  /**
   * Get dimensionality of embeddings
   */
  getDimensions(): number;
}
```

### OpenAI Provider

**Model:** `text-embedding-3-small`
**Dimensions:** 1536
**Cost:** ~$0.02 / 1M tokens

**Implementation:**
```typescript
@Injectable()
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private readonly openai: OpenAI;

  constructor(config: ConfigService) {
    this.openai = new OpenAI({
      apiKey: config.get('llm.openai.apiKey'),
    });
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
      encoding_format: 'float',
    });

    return response.data[0].embedding;
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts,
      encoding_format: 'float',
    });

    return response.data.map(item => item.embedding);
  }

  getDimensions(): number {
    return 1536;
  }
}
```

### Service Usage

```typescript
@Injectable()
export class EmbeddingService {
  constructor(
    @Inject('EMBEDDING_PROVIDER') private readonly provider: EmbeddingProvider,
  ) {}

  async embedText(text: string): Promise<number[]> {
    return this.provider.generateEmbedding(text);
  }

  async embedTexts(texts: string[]): Promise<number[][]> {
    return this.provider.generateEmbeddings(texts);
  }

  getDimensions(): number {
    return this.provider.getDimensions();
  }
}
```

### Configuration

```typescript
// apps/api/src/config/configuration.ts
export default () => ({
  embedding: {
    defaultProvider: process.env.EMBEDDING_DEFAULT_PROVIDER || 'openai',
  },
  llm: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY,  // Reused for embeddings
    },
  },
});
```

**Environment Variables:**
- `EMBEDDING_DEFAULT_PROVIDER=openai` (default, currently only option)
- `OPENAI_API_KEY` (required for OpenAI embeddings)

### Future Providers

The interface supports adding providers:
- **Azure OpenAI Embeddings** (text-embedding-ada-002)
- **Anthropic Embeddings** (if/when available)
- **Local Models** (via Ollama or Hugging Face)

---

## Neo4j Vector Search

Vector similarity search on Dataset nodes enables intelligent dataset discovery.

### Vector Index

**Index Name:** `dataset_embedding`
**Node Label:** `Dataset`
**Property:** `embedding` (array of floats, 1536 dimensions)
**Similarity Function:** Cosine similarity

### Index Creation

Automatically created on application startup:

```typescript
@Injectable()
export class NeoVectorService {
  constructor(
    @Inject('NEO4J_DRIVER') private readonly driver: Driver,
  ) {}

  async ensureVectorIndex(): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(`
        CREATE VECTOR INDEX dataset_embedding IF NOT EXISTS
        FOR (d:Dataset)
        ON d.embedding
        OPTIONS {
          indexConfig: {
            \`vector.dimensions\`: 1536,
            \`vector.similarity_function\`: 'cosine'
          }
        }
      `);
    } finally {
      await session.close();
    }
  }
}
```

**Note:** Index creation is idempotent (`IF NOT EXISTS`).

---

### Similarity Search

**Method:** `searchSimilarDatasets(ontologyId, queryEmbedding, topK)`

**Flow:**
1. Query vector index with `db.index.vector.queryNodes()`
2. Request `topK * 4` candidates (account for post-filtering)
3. Post-filter results by `ontologyId` property
4. Return top `topK` after filtering

**Cypher Query:**
```cypher
CALL db.index.vector.queryNodes(
  'dataset_embedding',
  $topK,
  $queryEmbedding
) YIELD node, score
WHERE node.ontologyId = $ontologyId
RETURN node, score
ORDER BY score DESC
LIMIT $limit
```

**Implementation:**
```typescript
async searchSimilarDatasets(
  ontologyId: string,
  queryEmbedding: number[],
  topK: number = 5,
): Promise<Array<{ dataset: Dataset; score: number }>> {
  const session = this.driver.session();
  try {
    // Request more candidates to account for post-filtering
    const internalTopK = Math.min(topK * 4, 50);

    const result = await session.run(
      `
      CALL db.index.vector.queryNodes(
        'dataset_embedding',
        $internalTopK,
        $queryEmbedding
      ) YIELD node, score
      WHERE node.ontologyId = $ontologyId
      RETURN node, score
      ORDER BY score DESC
      LIMIT $topK
      `,
      { ontologyId, queryEmbedding, internalTopK, topK },
    );

    return result.records.map(record => ({
      dataset: this.transformDatasetNode(record.get('node')),
      score: record.get('score'),
    }));
  } finally {
    await session.close();
  }
}
```

**Input Validation:**
- `ontologyId`: UUID format validation
- `queryEmbedding`: Array of 1536 floats
- `topK`: Integer between 1 and 50

---

### Embedding Generation

Embeddings generated during ontology creation in `NeoOntologyService.createGraph()`:

**Dataset Embedding Source:**

The full YAML definition of each dataset is used as the embedding text. This provides rich semantic information including dataset name, description, all field names, types, descriptions, and relationships.

Example YAML used for embedding:
```yaml
name: customers
description: Customer master data with contact information
source: public.customers
fields:
  - name: customer_id
    expression: customer_id
    label: Customer ID
    description: Unique identifier for customer
    data_type: integer
    is_primary_key: true
  - name: name
    expression: name
    label: Customer Name
    description: Full name of the customer
    data_type: varchar
  - name: email
    expression: email
    label: Email Address
    description: Customer email address
    data_type: varchar
  - name: created_at
    expression: created_at
    label: Created At
    description: Timestamp when customer was created
    data_type: timestamp
```

**Process:**
```typescript
async createGraph(ontologyId: string, osiModel: OSISemanticModel): Promise<void> {
  const datasetNodes: Array<{
    name: string;
    source: string;
    description: string;
    yaml: string;
  }> = [];

  // 1. Serialize each dataset to YAML and store on node
  for (const dataset of osiModel.semantic_model[0].datasets) {
    const datasetYaml = yaml.dump(dataset, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
      sortKeys: false,
    });

    datasetNodes.push({
      name: dataset.name || '',
      source: dataset.source || '',
      description: dataset.description || '',
      yaml: datasetYaml,
    });
  }

  // 2. Create Dataset nodes with YAML property (batch operation)
  // ...

  // 3. Create Field nodes and relationships
  // ...

  // 4. Generate and store embeddings using full YAML definitions
  await this.generateAndStoreEmbeddings(ontologyId, datasetNodes);
}

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
    );
  } catch (error) {
    // Log error but don't fail graph creation
    this.logger.error('Failed to generate embeddings', error);
  }
}
```

**Benefits of YAML-based embeddings:**
- Captures complete schema structure (not just field names)
- Includes type information and descriptions
- Contains relationship metadata
- Produces more accurate semantic search results
- No information loss from simplification

**Note:** Embedding generation failure does not fail ontology creation. Ontology will work but without vector search capabilities.

---

### Backfill for Existing Ontologies

For ontologies created before vector search feature:

```typescript
async backfillEmbeddings(ontologyId: string): Promise<void> {
  // Fetch graph to get dataset YAML definitions
  const graph = await this.getGraph(ontologyId);

  const datasetNodes = graph.nodes
    .filter((n) => n.label === 'Dataset')
    .map((n) => ({
      name: n.properties.name as string,
      yaml: (n.properties.yaml as string) || '',
    }));

  await this.generateAndStoreEmbeddings(ontologyId, datasetNodes);
}
```

**Usage:**
```bash
# Via admin endpoint or script
POST /api/admin/ontologies/:id/backfill-embeddings
```

---

## Agent Architecture

The Data Agent uses the **ReAct pattern** (Reasoning + Acting) for iterative tool-calling and problem-solving.

### ReAct Pattern

**Not Plan-Then-Execute:** The agent does not create an upfront plan. Instead, it iteratively:

1. **Think** - Reason about the current state and next action
2. **Act** - Call a tool (query_database, get_dataset_details, etc.)
3. **Observe** - Process tool result
4. **Repeat** - Continue until answer is complete

**LangGraph Implementation:**
Uses `createReactAgent` from `@langchain/langgraph/prebuilt`

```typescript
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';

const agent = createReactAgent({
  llm: new ChatOpenAI({ modelName: 'gpt-4', streaming: false }),
  tools: [queryDatabaseTool, getDatasetDetailsTool, getSampleDataTool, runPythonTool, listDatasetsTool],
  messageModifier: systemPrompt,  // System prompt with context
});

// Execute with streaming updates and recursion guard
for await (const event of agent.stream(
  { messages: [...] },
  { streamMode: 'updates', recursionLimit: 30 },
)) {
  // Process step-by-step updates
}
```

**Key Configuration:**
- `streaming: false` on LLM (avoids tool_calls corruption, see Lessons Learned)
- `streamMode: 'updates'` (step-by-step execution events)
- No retry loops (agent may iterate naturally if needed)

**Recursion Guard:**
- `recursionLimit: 30` in stream config — limits graph node invocations
- Each tool call = 2 node invocations (agent node + tools node), so 30 ≈ 15 tool-call rounds
- Prevents runaway loops on difficult questions; errors caught and reported via `message_error` SSE event

---

### System Prompt Structure

The agent receives a rich system prompt with:

1. **Role Definition**
2. **Relevant Datasets** (from vector search)
3. **Relationships (Join Hints)** - FK paths between tables
4. **Database Type and Constraints**
5. **Enhanced Tool Usage Instructions** - Error recovery, NULL handling, SQL best practices
6. **Conversation History** (last 10 messages with tool call summaries)

**Function Signature:**
```typescript
export function buildDataAgentSystemPrompt(
  datasets: Array<{ name: string; description: string; yaml: string; score: number }>,
  databaseType: string,
  conversationContext: string,
  relationships: Array<{ fromDataset: string; toDataset: string; name: string; fromColumns: string; toColumns: string }>,
): string
```

**Prompt Structure:**

1. **Role**: Expert data analyst assistant
2. **Available Datasets**: YAML definitions from vector search (or discovery guidance when empty)
3. **Relationships (Join Hints)**: Conditional section with FK join paths when relationships exist
4. **Database**: Type + read-only constraint
5. **Enhanced Instructions** (6 steps):
   - Understand the question
   - Plan approach (use join hints, discovery tools if needed)
   - Write SQL (schema-qualified names, 500-row limit, NULL handling, DATE_TRUNC)
   - Recover from errors (0 rows → sample data, column not found → get_dataset_details, SQL error → retry, need tables → list_datasets)
   - Use Python when helpful (stats, charts, NOT for data retrieval)
   - Format response
6. **Previous Conversation**: Enriched with tool call summaries (name, args, results)

**Context Truncation:**
- Dataset YAML: Full definitions (no truncation)
- Conversation history: Last 10 messages with tool call summaries (200 chars each for args and results)
- Total token budget: ~6000 tokens for system prompt

---

### Tool Definitions

The agent has 5 tools available:

#### 1. query_database

**Purpose:** Execute read-only SQL queries

**Schema:**
```typescript
{
  name: 'query_database',
  description: 'Execute a read-only SQL query against the database. Returns column names and rows (max 500 rows, 30-second timeout). Only SELECT queries are allowed. For large result sets, use aggregations, GROUP BY, or LIMIT clauses.',
  schema: z.object({
    sql: z.string().describe('SQL SELECT query to execute'),
  }),
}
```

**Implementation:**
```typescript
async function executeQueryDatabase(args: { sql: string }): Promise<string> {
  // Validate read-only
  if (!SQL_READ_ONLY_REGEX.test(args.sql)) {
    return 'Error: Only SELECT queries are allowed';
  }

  // Execute via DiscoveryService
  const result = await discoveryService.executeQuery(connectionId, args.sql);

  // Format as markdown table
  return formatAsMarkdownTable(result.rows);
}
```

**Output Format:**
```markdown
| customer_id | name | revenue |
|---|---|---|
| 1 | Acme Corp | 50000 |
| 2 | TechStart | 35000 |
| 3 | DataCo | 42000 |

(3 rows, 45ms)
```

---

#### 2. get_dataset_details

**Purpose:** Retrieve full YAML definitions for specific datasets

**Schema:**
```typescript
{
  name: 'get_dataset_details',
  description: 'Get detailed YAML definitions for specific datasets by name',
  schema: z.object({
    datasetNames: z.array(z.string()).describe('Array of dataset names to fetch'),
  }),
}
```

**Implementation:**
```typescript
async function getDatasetDetails(args: { datasetNames: string[] }): Promise<string> {
  const datasets = await neoOntologyService.getDatasetsByNames(ontologyId, args.datasetNames);

  return datasets.map(d => d.yaml).join('\n\n---\n\n');
}
```

**Output:**
```yaml
name: customers
description: Customer master data
table: public.customers
fields:
  - name: customer_id
    type: integer
    primary_key: true
  - name: name
    type: varchar
  - name: email
    type: varchar

---

name: orders
description: Order transactions
table: public.orders
fields:
  - name: order_id
    type: integer
    primary_key: true
  - name: customer_id
    type: integer
  - name: total_amount
    type: numeric
```

---

#### 3. get_sample_data

**Purpose:** Retrieve sample rows from a dataset

**Schema:**
```typescript
{
  name: 'get_sample_data',
  description: 'Get sample rows from a dataset to understand data structure and values',
  schema: z.object({
    datasetName: z.string().describe('Name of the dataset'),
    limit: z.number().optional().default(10).describe('Number of rows to return (default 10)'),
  }),
}
```

**Implementation:**
```typescript
async function getSampleData(args: { datasetName: string; limit?: number }): Promise<string> {
  const dataset = await neoOntologyService.getDatasetByName(ontologyId, args.datasetName);

  const sql = `SELECT * FROM ${dataset.source} LIMIT ${args.limit || 10}`;
  const result = await discoveryService.executeQuery(connectionId, sql);

  return formatAsMarkdownTable(result.rows);
}
```

**Output:**
```markdown
| order_id | customer_id | total_amount | created_at |
|---|---|---|---|
| 1001 | 5 | 249.99 | 2025-01-10 14:30:00 |
| 1002 | 12 | 89.50 | 2025-01-10 15:45:00 |
| 1003 | 5 | 399.00 | 2025-01-11 09:15:00 |

(3 rows)
```

---

#### 4. run_python

**Purpose:** Execute Python code for analysis and visualization

**Schema:**
```typescript
{
  name: 'run_python',
  description: 'Execute Python code in a sandboxed environment. Use pandas for data manipulation and matplotlib/seaborn for charts. Returns stdout and base64-encoded chart images.',
  schema: z.object({
    code: z.string().describe('Python code to execute'),
  }),
}
```

**Implementation:**
```typescript
async function runPython(args: { code: string }): Promise<string> {
  const result = await sandboxService.executeCode(args.code, 30000);

  let output = '';

  if (result.stdout) {
    output += `**Output:**\n\`\`\`\n${result.stdout}\n\`\`\`\n\n`;
  }

  if (result.stderr) {
    output += `**Errors:**\n\`\`\`\n${result.stderr}\n\`\`\`\n\n`;
  }

  if (result.files && result.files.length > 0) {
    output += '**Charts:**\n';
    for (const file of result.files) {
      output += `![chart](data:image/png;base64,${file.data})\n`;
    }
  }

  output += `\n(Executed in ${result.executionTimeMs}ms)`;

  return output;
}
```

**Example Code:**
```python
import pandas as pd
import matplotlib.pyplot as plt

# Sample data
data = {'product': ['A', 'B', 'C'], 'sales': [100, 150, 120]}
df = pd.DataFrame(data)

# Create chart
plt.figure(figsize=(8, 6))
plt.bar(df['product'], df['sales'])
plt.title('Sales by Product')
plt.xlabel('Product')
plt.ylabel('Sales')
plt.savefig('/tmp/chart.png')

print(df.to_string())
```

**Output:**
```
**Output:**
  product  sales
0       A    100
1       B    150
2       C    120

**Charts:**
![chart](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...)

(Executed in 1250ms)
```

---

#### 5. list_datasets

**Purpose:** Discover all available datasets in the ontology

**Schema:**
```typescript
{
  name: 'list_datasets',
  description: 'List ALL available datasets/tables in the ontology. Returns names, descriptions, and source table references. Use this when you need to discover tables beyond those provided in the system prompt.',
  schema: z.object({}),  // No parameters required
}
```

**Implementation:**
```typescript
async function listDatasets(): Promise<string> {
  const datasets = await neoOntologyService.listDatasets(ontologyId);

  if (datasets.length === 0) {
    return 'No datasets found in the ontology.';
  }

  const lines = datasets.map(
    (ds) => `- **${ds.name}**: ${ds.description || 'No description'} (source: ${ds.source || 'unknown'})`,
  );

  return `${datasets.length} datasets available:\n\n${lines.join('\n')}`;
}
```

**Output:**
```
5 datasets available:

- **customers**: Customer master data with contact information (source: public.customers)
- **orders**: Order transactions and line items (source: public.orders)
- **products**: Product catalog with pricing (source: public.products)
- **order_items**: Individual items within orders (source: public.order_items)
- **categories**: Product categories (source: public.categories)
```

**Use Cases:**
- Vector search returned 0 results — agent discovers tables manually
- Question spans more tables than vector search returned
- Follow-up questions reference tables not in initial context

---

### Execution Flow

1. **Load Chat Context**
   - Fetch chat → ontology → semantic model → connection (FK chain)
   - Verify ownership at each step

2. **Embed User Question**
   ```typescript
   const questionEmbedding = await embeddingService.embedText(userMessage.content);
   ```

3. **Vector Search for Relevant Datasets**
   ```typescript
   const relevantDatasets = await neoVectorService.searchSimilar(
     'dataset_embedding',
     ontology.id,
     questionEmbedding,
     10,  // Top 10 datasets (doubled from 5 for better coverage)
   );
   ```

3a. **Fallback on Empty Vector Results**
    ```typescript
    if (relevantDatasets.length === 0) {
      const allDatasets = await neoOntologyService.listDatasets(ontology.id);
      if (allDatasets.length === 0) {
        // Truly empty ontology — fail gracefully
        return;
      }
      // Continue with empty relevantDatasets — agent has list_datasets tool
    }
    ```

4. **Load Conversation History**
   ```typescript
   const messages = await prisma.dataChatMessage.findMany({
     where: { chatId },
     orderBy: { createdAt: 'desc' },
     take: 10,
   });
   const conversationHistory = messages.reverse();  // Chronological order
   ```

4a. **Get Relationship Join Hints**
    ```typescript
    const datasetNames = relevantDatasets.map((ds) => ds.name);
    const relationships = datasetNames.length > 0
      ? await neoOntologyService.getDatasetRelationships(ontology.id, datasetNames)
      : [];
    ```

5. **Build System Prompt**
   ```typescript
   const systemPrompt = buildDataAgentSystemPrompt(
     relevantDatasets,
     databaseType,
     conversationContext,
     relationships,  // NEW: join hints for the prompt
   );
   ```

6. **Create Tools with Bound Dependencies**
   ```typescript
   const tools = [
     createQueryDatabaseTool(discoveryService, connectionId, userId),
     createGetDatasetDetailsTool(neoOntologyService, ontologyId),
     createGetSampleDataTool(discoveryService, neoOntologyService, connectionId, userId, ontologyId),
     createRunPythonTool(sandboxService),
     createListDatasetsTool(neoOntologyService, ontologyId),  // NEW: dataset discovery
   ];
   ```

7. **Create ReAct Agent**
   ```typescript
   const llm = new ChatOpenAI({
     modelName: config.get('llm.openai.model'),
     apiKey: config.get('llm.openai.apiKey'),
     streaming: false,  // Critical: prevents tool_calls corruption
   });

   const agent = createReactAgent({
     llm,
     tools,
     messageModifier: systemPrompt,
   });
   ```

8. **Execute Agent with Streaming**
   ```typescript
   const stream = agent.stream(
     { messages: [new HumanMessage(userMessage.content)] },
     { streamMode: 'updates', recursionLimit: 30 },
   );

   for await (const event of stream) {
     // Emit SSE events based on event type
     if (event.tools) {
       // Tool node executed
       emitToolResults(event.tools.messages);
     } else if (event.agent) {
       // AI response generated
       emitText(event.agent.messages);
     }
   }
   ```

9. **Track Token Usage**
   ```typescript
   // Via BaseCallbackHandler.handleChatModelStart
   handleChatModelStart(llm, messages) {
     const promptTokens = countTokens(messages);
     this.tokensUsed.prompt += promptTokens;
   }

   handleChatModelEnd(output) {
     const completionTokens = countTokens(output.generations);
     this.tokensUsed.completion += completionTokens;
   }
   ```

10. **Persist Final Response**
    ```typescript
    await prisma.dataChatMessage.update({
      where: { id: assistantMessageId },
      data: {
        content: finalContent,
        status: 'complete',
        metadata: {
          toolCalls: [...],
          tokensUsed: { prompt, completion, total },
          datasetsUsed: [...],
        },
      },
    });
    ```

---

## SSE Streaming

Server-Sent Events (SSE) provide real-time streaming of agent execution to the frontend.

### Why SSE Instead of WebSockets

- **Simpler protocol**: Text-based, HTTP-compatible
- **Auto-reconnection**: Browsers handle reconnection automatically
- **POST method support**: Via `fetch()` + `ReadableStream` (not `EventSource`)
- **Authentication**: Easy to include JWT in headers
- **Firewall-friendly**: Uses standard HTTP

---

### Fastify SSE Implementation

**Pattern:** `res.hijack()` → raw HTTP response

**Critical:** MUST call `hijack()` before SSE streaming or Fastify will call `res.end()` when controller returns.

```typescript
@Post(':chatId/messages/:messageId/stream')
@Auth({ permissions: [PERMISSIONS.DATA_AGENT_WRITE] })
async stream(
  @Param('chatId') chatId: string,
  @Param('messageId') messageId: string,
  @CurrentUser('id') userId: string,
  @Res() reply: FastifyReply,
) {
  // Set SSE headers
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // CRITICAL: Hijack response lifecycle
  reply.hijack();

  try {
    // Emit SSE helper
    const emit = (event: string, data: any) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Start streaming
    emit('message_start', {});

    // Execute agent with streaming
    await this.agentService.executeAgent(chatId, messageId, userId, emit);

    emit('message_complete', { ... });
  } catch (error) {
    reply.raw.write(`event: message_error\n`);
    reply.raw.write(`data: ${JSON.stringify({ message: error.message })}\n\n`);
  } finally {
    reply.raw.end();
  }
}
```

**Note:** `@Res()` decorator tells NestJS to skip response handling, but Fastify still calls `end()` unless `hijack()` is called.

---

### Event Types

| Event | Payload | When Emitted |
|-------|---------|--------------|
| `message_start` | `{}` | Agent processing begins |
| `tool_call` | `{ name: string, args: object }` | Tool invoked by agent |
| `tool_result` | `{ name: string, result: string }` | Tool execution completed |
| `text` | `{ content: string }` | AI generates response text |
| `token_update` | `{ tokensUsed: { prompt, completion, total } }` | Final token counts |
| `message_complete` | `{ content: string, metadata: object }` | Execution finished successfully |
| `message_error` | `{ message: string }` | Execution failed with error |

---

### Keep-Alive Heartbeat

Prevent connection timeouts during long-running operations:

```typescript
const heartbeatInterval = setInterval(() => {
  reply.raw.write(':heartbeat\n\n');
}, 30000);  // 30 seconds

try {
  // Execute agent
} finally {
  clearInterval(heartbeatInterval);
}
```

**Note:** Comments (`:` prefix) are ignored by SSE parsers but keep connection alive.

---

### Tool Event Emission

```typescript
// From LangGraph updates stream
for await (const event of agentStream) {
  if (event.tools) {
    const toolMessages = event.tools.messages;

    for (const msg of toolMessages) {
      // Match by tool_call_id for correct association (handles parallel tool calls)
      const matchedCall = msg.tool_call_id ? toolCallMap.get(msg.tool_call_id) : undefined;

      emit('tool_result', {
        name: matchedCall?.name || 'unknown',
        result: msg.content.slice(0, 2000),
      });

      // Store result on the matched call for conversation context
      if (matchedCall) {
        matchedCall.result = msg.content.slice(0, 2000);
      }
    }
  } else if (event.agent) {
    // AI response
    const aiMessages = event.agent.messages as AIMessage[];

    for (const msg of aiMessages) {
      if (msg.content) {
        emit('text', { content: msg.content });
      }
    }
  }
}
```

**Result Truncation:** Tool results truncated to 2000 chars for SSE (full results stored in database).

---

### Error Handling

```typescript
try {
  // Claim message (atomic)
  const claimed = await this.dataAgentService.claimMessage(messageId);
  if (!claimed) {
    reply.raw.write(`event: message_error\n`);
    reply.raw.write(`data: ${JSON.stringify({ message: 'Message already being processed' })}\n\n`);
    reply.raw.end();
    return;
  }

  // Execute agent
  await this.agentService.executeAgent(...);

} catch (error) {
  // Update message status to failed
  await this.dataAgentService.updateMessage(messageId, {
    status: 'failed',
    metadata: { error: { message: error.message, timestamp: new Date() } },
  });

  // Emit error event
  reply.raw.write(`event: message_error\n`);
  reply.raw.write(`data: ${JSON.stringify({ message: error.message })}\n\n`);
} finally {
  reply.raw.end();
}
```

---

### Frontend SSE Consumption

**Pattern:** `fetch()` + `ReadableStream` (not `EventSource` due to POST + auth headers)

```typescript
const response = await fetch(
  `/api/data-agent/chats/${chatId}/messages/${messageId}/stream`,
  {
    method: 'POST',
    headers: {
      'Accept': 'text/event-stream',
      'Authorization': `Bearer ${token}`,
    },
  }
);

const reader = response.body.getReader();
const decoder = new TextDecoder();

let buffer = '';
while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n\n');
  buffer = lines.pop() || '';  // Keep incomplete event in buffer

  for (const line of lines) {
    if (!line.trim()) continue;

    const [eventLine, dataLine] = line.split('\n');
    const event = eventLine.replace('event: ', '');
    const data = JSON.parse(dataLine.replace('data: ', ''));

    handleEvent(event, data);
  }
}
```

**React StrictMode Fix:** 100ms delay before fetch to allow cleanup abort:

```typescript
useEffect(() => {
  const abortController = new AbortController();
  let timeoutId: NodeJS.Timeout;

  const startStream = async () => {
    // Wait 100ms to allow StrictMode cleanup to abort
    await new Promise(resolve => {
      timeoutId = setTimeout(resolve, 100);
    });

    if (abortController.signal.aborted) return;

    // Start SSE stream
    const response = await fetch(..., { signal: abortController.signal });
    // ...
  };

  startStream();

  return () => {
    clearTimeout(timeoutId);
    abortController.abort();
  };
}, [messageId]);
```

---

## Docker Python Sandbox

Isolated Python execution environment for data analysis and chart generation.

### Container Architecture

**Base Image:** `python:3.11-slim`
**Server:** Flask + Gunicorn
**Port:** 8000 (internal only)
**Filesystem:** Read-only except `/tmp`
**Network:** Isolated bridge (no external access)
**Resources:** 512MB memory, 1 CPU core

---

### Dockerfile

Located at `infra/sandbox/Dockerfile`:

```dockerfile
FROM python:3.11-slim

# Install Python packages
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy executor server
COPY executor.py /app/
WORKDIR /app

# Create non-root user
RUN useradd -m -u 1000 sandbox && \
    chown -R sandbox:sandbox /app && \
    chmod 755 /app

USER sandbox

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD python -c "import requests; requests.get('http://localhost:8000/health')"

# Run with gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "2", "--timeout", "60", "executor:app"]
```

---

### Python Dependencies

Located at `infra/sandbox/requirements.txt`:

```
flask==3.0.0
gunicorn==21.2.0
pandas==2.1.4
numpy==1.26.2
matplotlib==3.8.2
seaborn==0.13.0
scipy==1.11.4
openpyxl==3.1.2
```

**Note:** No external packages allowed at runtime (no pip install in sandbox).

---

### Executor Server

Located at `infra/sandbox/executor.py`:

```python
from flask import Flask, request, jsonify
import subprocess
import base64
import os
import time
import glob

app = Flask(__name__)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})

@app.route('/execute', methods=['POST'])
def execute():
    data = request.json
    code = data.get('code', '')
    timeout = data.get('timeout', 30)  # Default 30s

    # Write code to temp file
    code_file = f'/tmp/code_{int(time.time() * 1000)}.py'
    with open(code_file, 'w') as f:
        f.write(code)

    start_time = time.time()

    try:
        # Execute code in subprocess
        result = subprocess.run(
            ['python', code_file],
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd='/tmp',
        )

        execution_time = int((time.time() - start_time) * 1000)

        # Collect matplotlib figures
        chart_files = glob.glob('/tmp/*.png') + glob.glob('/tmp/*.jpg')
        files = []
        for chart_path in chart_files:
            with open(chart_path, 'rb') as f:
                files.append({
                    'filename': os.path.basename(chart_path),
                    'data': base64.b64encode(f.read()).decode('utf-8'),
                })
            os.remove(chart_path)  # Cleanup

        # Cleanup code file
        os.remove(code_file)

        return jsonify({
            'stdout': result.stdout,
            'stderr': result.stderr,
            'returnCode': result.returncode,
            'files': files,
            'executionTimeMs': execution_time,
        })

    except subprocess.TimeoutExpired:
        os.remove(code_file)
        return jsonify({
            'stdout': '',
            'stderr': f'Execution timeout after {timeout}s',
            'returnCode': -1,
            'files': [],
            'executionTimeMs': timeout * 1000,
        }), 408

    except Exception as e:
        return jsonify({
            'stdout': '',
            'stderr': str(e),
            'returnCode': -1,
            'files': [],
            'executionTimeMs': 0,
        }), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000)
```

---

### Docker Compose Configuration

Located in `infra/compose/base.compose.yml`:

```yaml
services:
  sandbox:
    build:
      context: ../sandbox
      dockerfile: Dockerfile
    container_name: knecta-sandbox
    read_only: true
    tmpfs:
      - /tmp:rw,size=100M
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '1.0'
    networks:
      - sandbox-isolated
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"]
      interval: 10s
      timeout: 5s
      retries: 3

networks:
  sandbox-isolated:
    driver: bridge
    internal: true  # No external network access
```

---

### Node.js Client (SandboxService)

Located at `apps/api/src/sandbox/sandbox.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  returnCode: number;
  files: Array<{ filename: string; data: string }>;
  executionTimeMs: number;
}

@Injectable()
export class SandboxService {
  private readonly sandboxUrl: string;

  constructor(private readonly config: ConfigService) {
    this.sandboxUrl = this.config.get<string>('sandbox.url', 'http://sandbox:8000');
  }

  async executeCode(code: string, timeout: number = 30000): Promise<ExecutionResult> {
    const response = await fetch(`${this.sandboxUrl}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, timeout: timeout / 1000 }),
    });

    if (!response.ok) {
      throw new Error(`Sandbox execution failed: ${response.statusText}`);
    }

    return response.json();
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.sandboxUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
```

---

### Security Features

1. **Read-Only Filesystem**
   - Container FS mounted read-only
   - Only `/tmp` writable (100MB tmpfs)
   - Prevents persistence across executions

2. **No Capabilities**
   - All Linux capabilities dropped
   - Cannot modify system, access hardware, or escalate privileges

3. **Resource Limits**
   - 512MB memory hard limit
   - 1 CPU core
   - Prevents resource exhaustion attacks

4. **Network Isolation**
   - Internal bridge network only
   - No external network access
   - Cannot exfiltrate data or download packages

5. **Execution Timeout**
   - Default 30s timeout
   - Configurable per request
   - Subprocess timeout enforcement

6. **Process Isolation**
   - Each execution runs in fresh subprocess
   - No shared memory or state
   - Code cleanup after execution

---

## Frontend Components

ChatGPT-style interface at `/agent` and `/agent/:chatId`.

### Page Layout

```
┌────────────────────────────────────────────────────────────────┐
│                        App Header                              │
├──────────────┬─────────────────────────────────────────────────┤
│  Sidebar     │  Main Content Area                              │
│  (280px)     │                                                  │
│              │  ┌──────────────────────────────────────────┐   │
│  New Chat    │  │  Chat Header (name + ontology chip)     │   │
│  Button      │  ├──────────────────────────────────────────┤   │
│              │  │                                          │   │
│  Search      │  │  ChatView (messages with auto-scroll)   │   │
│              │  │                                          │   │
│  Today       │  │  - User message (right, primary)        │   │
│  - Chat 1    │  │  - Assistant message (left, markdown)   │   │
│  - Chat 2    │  │  - Tool calls (collapsible accordions)  │   │
│              │  │  - Charts (base64 images)               │   │
│  Yesterday   │  │                                          │   │
│  - Chat 3    │  │                                          │   │
│              │  │                                          │   │
│  Last 7 Days │  ├──────────────────────────────────────────┤   │
│  - Chat 4    │  │  ChatInput (textarea, Enter to send)    │   │
│              │  └──────────────────────────────────────────┘   │
│              │                                                  │
│              │  OR: WelcomeScreen (when no chat selected)      │
│              │  - Icon, title, suggestion cards                │
└──────────────┴─────────────────────────────────────────────────┘
```

---

### 1. DataAgentPage

File: `apps/web/src/pages/DataAgentPage.tsx`

**Purpose:** Full-page layout with sidebar + chat area

**Layout:**
```tsx
<Box sx={{ display: 'flex', height: '100vh' }}>
  <ChatSidebar
    chats={chats}
    currentChatId={chatId}
    onNewChat={handleNewChat}
    onSelectChat={handleSelectChat}
    onDeleteChat={handleDeleteChat}
  />

  <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
    {chatId ? (
      <ChatView chatId={chatId} />
    ) : (
      <WelcomeScreen onNewChat={handleNewChat} />
    )}
  </Box>
</Box>
```

**State:**
```typescript
const { chatId } = useParams();
const navigate = useNavigate();
const { chats, fetchChats, createChat, deleteChat } = useDataAgent();
```

**Routing:**
- `/agent` - No chat selected, shows WelcomeScreen
- `/agent/:chatId` - Specific chat, shows ChatView

---

### 2. ChatSidebar

File: `apps/web/src/components/data-agent/ChatSidebar.tsx`

**Purpose:** Left panel with conversation list

**Features:**
- New Chat button at top
- Search input (filters by name)
- Chats grouped by date:
  - Today
  - Yesterday
  - Last 7 Days
  - Last 30 Days
  - Older
- Each chat shows:
  - Name (truncated to 30 chars)
  - Hover actions: Rename, Delete
  - Active state highlight
- Empty state message

**Grouping Logic:**
```typescript
const groupChatsByDate = (chats: DataChat[]) => {
  const now = new Date();
  const today = startOfDay(now);
  const yesterday = subDays(today, 1);
  const last7Days = subDays(today, 7);
  const last30Days = subDays(today, 30);

  return {
    today: chats.filter(c => isAfter(c.updatedAt, today)),
    yesterday: chats.filter(c => isAfter(c.updatedAt, yesterday) && !isAfter(c.updatedAt, today)),
    last7Days: chats.filter(c => isAfter(c.updatedAt, last7Days) && !isAfter(c.updatedAt, yesterday)),
    last30Days: chats.filter(c => isAfter(c.updatedAt, last30Days) && !isAfter(c.updatedAt, last7Days)),
    older: chats.filter(c => !isAfter(c.updatedAt, last30Days)),
  };
};
```

---

### 3. ChatView

File: `apps/web/src/components/data-agent/ChatView.tsx`

**Purpose:** Main chat area with messages and input

**Layout:**
```tsx
<Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
  {/* Header */}
  <Box sx={{ borderBottom: 1, borderColor: 'divider', p: 2 }}>
    <Typography variant="h6">{chat.name}</Typography>
    <Chip label={ontology.name} size="small" />
  </Box>

  {/* Messages */}
  <Box ref={messagesEndRef} sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
    {messages.map(message => (
      <ChatMessage key={message.id} message={message} />
    ))}
  </Box>

  {/* Input */}
  <Box sx={{ borderTop: 1, borderColor: 'divider', p: 2 }}>
    <ChatInput
      onSend={handleSendMessage}
      disabled={isStreaming}
    />
  </Box>
</Box>
```

**Auto-Scroll:**
```typescript
const messagesEndRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
}, [messages]);
```

**State:**
```typescript
const { chat, messages, sendMessage, isStreaming } = useDataChat(chatId);
```

---

### 4. ChatMessage

File: `apps/web/src/components/data-agent/ChatMessage.tsx`

**Purpose:** Individual message bubble

**User Message:**
```tsx
<Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
  <Paper sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', p: 2, maxWidth: '70%' }}>
    <Typography>{message.content}</Typography>
  </Paper>
</Box>
```

**Assistant Message:**
```tsx
<Box sx={{ display: 'flex', justifyContent: 'flex-start', mb: 2 }}>
  <Paper sx={{ bgcolor: 'grey.100', p: 2, maxWidth: '80%' }}>
    {/* Tool calls (if any) */}
    {message.metadata?.toolCalls?.map(tool => (
      <ToolCallAccordion key={tool.timestamp} toolCall={tool} />
    ))}

    {/* Markdown content */}
    <ReactMarkdown
      components={{
        code: ({ inline, children, ...props }) =>
          inline ? (
            <code {...props}>{children}</code>
          ) : (
            <SyntaxHighlighter language="python" style={docco}>
              {children}
            </SyntaxHighlighter>
          ),
        table: ({ children }) => (
          <TableContainer component={Paper}>
            <Table size="small">{children}</Table>
          </TableContainer>
        ),
        img: ({ src, alt }) => (
          <img src={src} alt={alt} style={{ maxWidth: '100%' }} />
        ),
      }}
    >
      {message.content}
    </ReactMarkdown>

    {/* Status indicator */}
    {message.status === 'generating' && <CircularProgress size={20} />}
  </Paper>
</Box>
```

**Markdown Features:**
- Syntax highlighting (react-syntax-highlighter)
- MUI tables for markdown tables
- Base64 image display
- Code blocks with language detection
- Links, lists, bold, italic, etc.

---

### 5. ToolCallAccordion

File: `apps/web/src/components/data-agent/ToolCallAccordion.tsx`

**Purpose:** Collapsible display of tool execution

**Layout:**
```tsx
<Accordion>
  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <CodeIcon fontSize="small" />
      <Typography variant="body2">
        {getToolLabel(toolCall.name)}
      </Typography>
    </Box>
  </AccordionSummary>

  <AccordionDetails>
    {/* Arguments */}
    <Typography variant="caption" color="text.secondary">
      Arguments:
    </Typography>
    <SyntaxHighlighter language="json" style={docco}>
      {JSON.stringify(toolCall.args, null, 2)}
    </SyntaxHighlighter>

    {/* Result */}
    <Typography variant="caption" color="text.secondary" sx={{ mt: 2 }}>
      Result:
    </Typography>
    <Box sx={{ bgcolor: 'grey.50', p: 1, borderRadius: 1, fontFamily: 'monospace', fontSize: '0.875rem' }}>
      {toolCall.result}
    </Box>
  </AccordionDetails>
</Accordion>
```

**Tool Labels:**
```typescript
const getToolLabel = (toolName: string): string => {
  const labels = {
    query_database: 'Analyzed data',
    get_dataset_details: 'Checked dataset details',
    get_sample_data: 'Viewed sample data',
    run_python: 'Ran Python analysis',
  };
  return labels[toolName] || toolName;
};
```

**Visual:** Looks like ChatGPT's "Used code interpreter" or "Analyzed data" accordions.

---

### 6. ChatInput

File: `apps/web/src/components/data-agent/ChatInput.tsx`

**Purpose:** Bottom input textarea

**Features:**
- Auto-resize (1-10 lines)
- Enter to send, Shift+Enter for newline
- Send button
- Disabled during streaming
- Placeholder text

**Implementation:**
```tsx
<Box sx={{ display: 'flex', gap: 1 }}>
  <TextField
    multiline
    maxRows={10}
    fullWidth
    placeholder="Ask a question about your data..."
    value={input}
    onChange={(e) => setInput(e.target.value)}
    onKeyDown={(e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    }}
    disabled={disabled}
  />

  <IconButton
    color="primary"
    onClick={handleSend}
    disabled={disabled || !input.trim()}
  >
    <SendIcon />
  </IconButton>
</Box>
```

---

### 7. WelcomeScreen

File: `apps/web/src/components/data-agent/WelcomeScreen.tsx`

**Purpose:** Empty state when no chat selected

**Layout:**
```tsx
<Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 4 }}>
  <SmartToyIcon sx={{ fontSize: 80, color: 'primary.main' }} />

  <Typography variant="h4">Data Agent</Typography>

  <Typography variant="body1" color="text.secondary" textAlign="center">
    Ask questions about your data in natural language.<br />
    Select a conversation from the sidebar or start a new one.
  </Typography>

  <Button
    variant="contained"
    startIcon={<AddIcon />}
    onClick={onNewChat}
  >
    New Chat
  </Button>

  {/* Suggestion Cards */}
  <Grid container spacing={2} maxWidth="md">
    {suggestions.map(suggestion => (
      <Grid item xs={6} key={suggestion.title}>
        <Card sx={{ cursor: 'pointer' }} onClick={() => onSuggestion(suggestion.prompt)}>
          <CardContent>
            <Typography variant="body2" fontWeight="bold">
              {suggestion.title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {suggestion.description}
            </Typography>
          </CardContent>
        </Card>
      </Grid>
    ))}
  </Grid>
</Box>
```

**Suggestions:**
```typescript
const suggestions = [
  { title: 'Top Customers', description: 'Who are our top 10 customers by revenue?', prompt: 'Show me the top 10 customers by revenue' },
  { title: 'Sales Trends', description: 'What are the sales trends over the last 6 months?', prompt: 'Show sales trends over the last 6 months' },
  { title: 'Product Analysis', description: 'Which products have the highest profit margin?', prompt: 'Which products have the highest profit margin?' },
  { title: 'Customer Segmentation', description: 'Can you segment customers by purchase frequency?', prompt: 'Segment customers by purchase frequency' },
];
```

---

### 8. NewChatDialog

File: `apps/web/src/components/data-agent/NewChatDialog.tsx`

**Purpose:** Modal for creating new chat

**Form:**
```tsx
<Dialog open={open} onClose={onClose}>
  <DialogTitle>New Chat</DialogTitle>

  <DialogContent>
    <FormControl fullWidth margin="normal">
      <InputLabel>Ontology</InputLabel>
      <Select
        value={ontologyId}
        onChange={(e) => setOntologyId(e.target.value)}
      >
        {ontologies
          .filter(o => o.status === 'ready')
          .map(o => (
            <MenuItem key={o.id} value={o.id}>
              {o.name}
            </MenuItem>
          ))}
      </Select>
      <FormHelperText>
        Select the ontology (data model) for this conversation
      </FormHelperText>
    </FormControl>

    <TextField
      fullWidth
      margin="normal"
      label="Chat Name (Optional)"
      value={name}
      onChange={(e) => setName(e.target.value)}
      helperText="Auto-generated from first question if left empty"
    />
  </DialogContent>

  <DialogActions>
    <Button onClick={onClose}>Cancel</Button>
    <Button
      variant="contained"
      onClick={handleCreate}
      disabled={!ontologyId}
    >
      Create
    </Button>
  </DialogActions>
</Dialog>
```

**Auto-Generated Name:**
- If name empty, use first question as chat name
- Truncate to 50 chars
- Example: "What were the top customers..." → "Top customers by revenue"

---

### 9. useDataAgent Hook

File: `apps/web/src/hooks/useDataAgent.ts`

**Purpose:** State management for chat list

**State:**
```typescript
const [chats, setChats] = useState<DataChat[]>([]);
const [total, setTotal] = useState(0);
const [page, setPage] = useState(1);
const [pageSize, setPageSize] = useState(20);
const [search, setSearch] = useState('');
const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
```

**Methods:**
```typescript
const fetchChats = async () => {
  setIsLoading(true);
  try {
    const response = await api.listDataChats({ page, pageSize, search });
    setChats(response.data.items);
    setTotal(response.data.total);
  } catch (err) {
    setError(err.message);
  } finally {
    setIsLoading(false);
  }
};

const createChat = async (ontologyId: string, name?: string) => {
  const response = await api.createDataChat({ ontologyId, name });
  setChats([response.data, ...chats]);
  return response.data;
};

const updateChat = async (id: string, name: string) => {
  const response = await api.updateDataChat(id, { name });
  setChats(chats.map(c => c.id === id ? response.data : c));
};

const deleteChat = async (id: string) => {
  await api.deleteDataChat(id);
  setChats(chats.filter(c => c.id !== id));
};
```

---

### 10. useDataChat Hook

File: `apps/web/src/hooks/useDataChat.ts`

**Purpose:** State management for single chat + SSE streaming

**State:**
```typescript
const [chat, setChat] = useState<DataChat | null>(null);
const [messages, setMessages] = useState<DataChatMessage[]>([]);
const [isStreaming, setIsStreaming] = useState(false);
const [error, setError] = useState<string | null>(null);
```

**Send Message:**
```typescript
const sendMessage = async (content: string) => {
  setIsStreaming(true);

  try {
    // Create message pair (user + assistant placeholder)
    const response = await api.sendDataChatMessage(chatId, { content });
    const { userMessage, assistantMessage } = response.data;

    setMessages([...messages, userMessage, assistantMessage]);

    // Open SSE stream
    await streamAssistantResponse(assistantMessage.id);

  } catch (err) {
    setError(err.message);
  } finally {
    setIsStreaming(false);
  }
};
```

**SSE Streaming:**
```typescript
const streamAssistantResponse = async (messageId: string) => {
  const abortController = new AbortController();
  let timeoutId: NodeJS.Timeout;

  try {
    // Wait 100ms for StrictMode cleanup
    await new Promise(resolve => {
      timeoutId = setTimeout(resolve, 100);
    });

    if (abortController.signal.aborted) return;

    const response = await fetch(
      `/api/data-agent/chats/${chatId}/messages/${messageId}/stream`,
      {
        method: 'POST',
        headers: {
          'Accept': 'text/event-stream',
          'Authorization': `Bearer ${token}`,
        },
        signal: abortController.signal,
      }
    );

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = '';
    let accumulatedContent = '';
    let toolCalls: ToolCall[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim() || line.startsWith(':')) continue;

        const [eventLine, dataLine] = line.split('\n');
        const event = eventLine.replace('event: ', '');
        const data = JSON.parse(dataLine.replace('data: ', ''));

        switch (event) {
          case 'tool_call':
            toolCalls.push({ name: data.name, args: data.args, result: '', timestamp: new Date() });
            break;

          case 'tool_result':
            const lastTool = toolCalls[toolCalls.length - 1];
            if (lastTool) lastTool.result = data.result;
            break;

          case 'text':
            accumulatedContent += data.content;
            updateMessage(messageId, { content: accumulatedContent });
            break;

          case 'message_complete':
            updateMessage(messageId, {
              content: data.content,
              status: 'complete',
              metadata: data.metadata,
            });
            break;

          case 'message_error':
            updateMessage(messageId, {
              status: 'failed',
              metadata: { error: { message: data.message } },
            });
            break;
        }
      }
    }
  } finally {
    clearTimeout(timeoutId);
    abortController.abort();
  }
};
```

**Update Message Helper:**
```typescript
const updateMessage = (id: string, updates: Partial<DataChatMessage>) => {
  setMessages(messages.map(m =>
    m.id === id ? { ...m, ...updates } : m
  ));
};
```

---

### Navigation

**Sidebar Entry:**

File: `apps/web/src/components/navigation/Sidebar.tsx`

```tsx
import SmartToyIcon from '@mui/icons-material/SmartToy';

<RequirePermission permission="data_agent:read">
  <ListItem button component={Link} to="/agent">
    <ListItemIcon>
      <SmartToyIcon />
    </ListItemIcon>
    <ListItemText primary="Data Agent" />
  </ListItem>
</RequirePermission>
```

**Route Definitions:**

File: `apps/web/src/App.tsx`

```tsx
<Route path="/agent" element={<DataAgentPage />} />
<Route path="/agent/:chatId" element={<DataAgentPage />} />
```

---

## Configuration

### Environment Variables

Required in `infra/compose/.env`:

```bash
# Embedding Service
EMBEDDING_DEFAULT_PROVIDER=openai  # Currently only option

# Python Sandbox
SANDBOX_URL=http://sandbox:8000  # Internal Docker network

# LLM Configuration (reused for embeddings)
OPENAI_API_KEY=sk-...  # Required for embeddings + chat
OPENAI_MODEL=gpt-4  # Or gpt-4-turbo, gpt-3.5-turbo

# Optional: Alternative providers
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=https://...
AZURE_OPENAI_DEPLOYMENT=gpt-4
AZURE_OPENAI_API_VERSION=2024-02-15-preview
```

**Validation:**
- `OPENAI_API_KEY` required for embeddings (even if using Anthropic for chat)
- `SANDBOX_URL` must be accessible from API container
- Default provider `openai` used if `EMBEDDING_DEFAULT_PROVIDER` not set

---

### Configuration Service

File: `apps/api/src/config/configuration.ts`

```typescript
export default () => ({
  embedding: {
    defaultProvider: process.env.EMBEDDING_DEFAULT_PROVIDER || 'openai',
  },
  sandbox: {
    url: process.env.SANDBOX_URL || 'http://sandbox:8000',
  },
  llm: {
    defaultProvider: process.env.LLM_DEFAULT_PROVIDER || 'openai',
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4',
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
    },
    azure: {
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      deployment: process.env.AZURE_OPENAI_DEPLOYMENT,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-02-15-preview',
    },
  },
});
```

---

## File Inventory

### Backend Files (New)

```
apps/api/
├── prisma/
│   ├── schema.prisma                                     # DataChat + DataChatMessage models
│   └── migrations/
│       └── YYYYMMDDHHMMSS_add_data_agent/
│           └── migration.sql                             # SQL migration
├── src/
│   ├── common/
│   │   └── constants/
│   │       └── roles.constants.ts                        # DATA_AGENT permissions added
│   ├── embedding/
│   │   ├── embedding.module.ts                           # Global module
│   │   ├── embedding.service.ts                          # Facade service
│   │   └── providers/
│   │       ├── embedding-provider.interface.ts           # Interface
│   │       ├── openai-embedding.provider.ts              # OpenAI implementation
│   │       └── index.ts                                  # Exports
│   ├── neo-graph/
│   │   ├── neo-graph.module.ts                           # Export NeoVectorService (modified)
│   │   └── neo-vector.service.ts                         # Vector search service
│   ├── sandbox/
│   │   ├── sandbox.module.ts                             # Global module
│   │   └── sandbox.service.ts                            # Python execution client
│   ├── data-agent/
│   │   ├── data-agent.module.ts                          # Main module
│   │   ├── data-agent.service.ts                         # CRUD operations
│   │   ├── data-agent.service.spec.ts                    # CRUD unit tests
│   │   ├── data-agent.controller.ts                      # REST API
│   │   ├── agent-stream.controller.ts                    # SSE streaming
│   │   ├── agent/
│   │   │   ├── agent.service.ts                          # ReAct agent creation + execution
│   │   │   ├── agent.service.spec.ts                     # Agent orchestration unit tests
│   │   │   ├── prompts.ts                                # System prompt builder
│   │   │   ├── prompts.spec.ts                           # Prompt builder unit tests
│   │   │   └── tools/
│   │   │       ├── query-database.tool.ts                # SQL execution tool
│   │   │       ├── get-dataset-details.tool.ts           # Dataset YAML tool
│   │   │       ├── get-sample-data.tool.ts               # Sample rows tool
│   │   │       ├── run-python.tool.ts                    # Python sandbox tool
│   │   │       ├── list-datasets.tool.ts                 # Dataset discovery tool
│   │   │       ├── list-datasets.tool.spec.ts            # Discovery tool unit tests
│   │   │       └── index.ts                              # Tool factory exports
│   │   └── dto/
│   │       ├── create-chat.dto.ts                        # Create validation (Zod)
│   │       ├── update-chat.dto.ts                        # Update validation (Zod)
│   │       ├── chat-query.dto.ts                         # List query validation (Zod)
│   │       └── send-message.dto.ts                       # Message validation (Zod)
│   └── ontologies/
│       ├── neo-ontology.service.ts                       # Embedding generation + lightweight queries
│       └── neo-ontology.service.spec.ts                  # Lightweight query unit tests
└── test/
    └── data-agent.integration.spec.ts                    # Integration tests
```

---

### Backend Files (Modified)

```
apps/api/
├── src/
│   ├── config/
│   │   └── configuration.ts                              # Embedding + sandbox config
│   ├── app.module.ts                                     # Register modules
│   ├── common/
│   │   └── constants/
│   │       └── roles.constants.ts                        # DATA_AGENT permissions
│   ├── neo-graph/
│   │   └── neo-graph.module.ts                           # Export NeoVectorService
│   └── ontologies/
│       └── neo-ontology.service.ts                       # Embedding generation
├── prisma/
│   ├── schema.prisma                                     # New models
│   └── seed.ts                                           # Seed permissions
└── package.json                                          # No new packages (reuse existing)
```

---

### Frontend Files (New)

```
apps/web/
└── src/
    ├── components/
    │   └── data-agent/
    │       ├── ChatSidebar.tsx                           # Left sidebar with chat list
    │       ├── ChatView.tsx                              # Main chat area
    │       ├── ChatMessage.tsx                           # Message bubble
    │       ├── ToolCallAccordion.tsx                     # Tool execution display
    │       ├── ChatInput.tsx                             # Bottom input
    │       ├── WelcomeScreen.tsx                         # Empty state
    │       └── NewChatDialog.tsx                         # Chat creation modal
    ├── hooks/
    │   ├── useDataAgent.ts                               # Chat list state
    │   └── useDataChat.ts                                # Single chat + SSE streaming
    ├── pages/
    │   └── DataAgentPage.tsx                             # Full-page layout
    ├── services/
    │   └── api.ts                                        # API functions (modified)
    ├── types/
    │   └── index.ts                                      # TypeScript types (modified)
    └── __tests__/
        └── components/
            └── data-agent/
                ├── ChatSidebar.test.tsx                  # Component tests
                └── ChatMessage.test.tsx                  # Component tests
```

---

### Frontend Files (Modified)

```
apps/web/
└── src/
    ├── App.tsx                                           # Routes /agent and /agent/:chatId
    ├── components/
    │   └── navigation/
    │       └── Sidebar.tsx                               # Data Agent menu item
    ├── services/
    │   └── api.ts                                        # Data agent API functions
    └── types/
        └── index.ts                                      # DataChat, DataChatMessage types
```

---

### Infrastructure Files (New)

```
infra/
├── sandbox/
│   ├── Dockerfile                                        # Python sandbox container
│   ├── requirements.txt                                  # Python dependencies
│   └── executor.py                                       # Flask execution server
└── compose/
    ├── base.compose.yml                                  # Sandbox service (modified)
    └── .env.example                                      # New env vars (modified)
```

---

## Testing

### Backend Tests

#### Integration Tests: Data Agent API

File: `apps/api/test/data-agent.integration.spec.ts`

**Coverage:**

**GET /api/data-agent/chats**
- ✅ 401 if not authenticated
- ✅ 403 for viewer (no permission)
- ✅ Empty list when no chats
- ✅ Paginated results
- ✅ Filter by ownerId (isolation)
- ✅ Search by name
- ✅ Filter by ontologyId
- ✅ Sort by updatedAt, createdAt, name

**GET /api/data-agent/chats/:id**
- ✅ 401 if not authenticated
- ✅ 200 with chat + messages
- ✅ 404 for non-existent
- ✅ 404 for other user's chat

**POST /api/data-agent/chats**
- ✅ 401 if not authenticated
- ✅ 403 for viewer
- ✅ 201 with created chat
- ✅ Validation errors (400)
- ✅ 404 for non-existent ontology
- ✅ 400 if ontology not "ready"

**PATCH /api/data-agent/chats/:id**
- ✅ 401 if not authenticated
- ✅ 200 with updated chat
- ✅ 404 for non-existent
- ✅ Validation errors (400)

**DELETE /api/data-agent/chats/:id**
- ✅ 401 if not authenticated
- ✅ 403 for viewer
- ✅ 204 on success
- ✅ 404 for non-existent
- ✅ Cascades message deletion

**POST /api/data-agent/chats/:id/messages**
- ✅ 401 if not authenticated
- ✅ 403 for viewer
- ✅ 201 with message pair (user + assistant placeholder)
- ✅ Validation errors (400)
- ✅ 404 for non-existent chat

**POST /api/data-agent/chats/:chatId/messages/:messageId/stream**
- ✅ 401 if not authenticated
- ✅ SSE stream starts
- ✅ Emits message_start event
- ✅ Emits message_complete event
- ✅ 404 for non-existent chat/message
- ✅ 409 if message already claimed

**Run:**
```bash
cd apps/api && npm test -- data-agent.integration
```

---

#### Unit Tests: Embedding Service

File: `apps/api/test/embedding.service.spec.ts`

**Coverage:**
- ✅ Generate single embedding
- ✅ Generate batch embeddings
- ✅ Returns correct dimensions (1536)
- ✅ Handles API errors

**Run:**
```bash
cd apps/api && npm test -- embedding.service
```

---

#### Unit Tests: Sandbox Service

File: `apps/api/test/sandbox.service.spec.ts`

**Coverage:**
- ✅ Execute Python code successfully
- ✅ Return stdout and stderr
- ✅ Return base64 charts
- ✅ Handle execution timeout
- ✅ Handle code errors
- ✅ Health check passes
- ✅ Health check fails when sandbox down

**Run:**
```bash
cd apps/api && npm test -- sandbox.service
```

---

#### Unit Tests: Agent Service

File: `apps/api/src/data-agent/agent/agent.service.spec.ts`

**Coverage:**
- ✅ Vector search uses top-K of 10
- ✅ Falls back to listDatasets when vector search returns empty
- ✅ Fails gracefully when ontology has no datasets at all
- ✅ Sets recursionLimit to 30 on agent stream
- ✅ Creates 5 tools including list_datasets
- ✅ Fetches relationships for relevant datasets
- ✅ Matches tool results by tool_call_id (handles parallel calls)
- ✅ Persists tool call results in metadata
- ✅ Includes conversation history with tool context
- ✅ Emits message_start, tool_call, tool_result, text, token_update, message_complete events
- ✅ Handles agent errors gracefully (message_error event)
- ✅ Throws NotFoundException for missing chat/ontology/semantic model
- ✅ Skips relationships when no relevant datasets found
- ✅ Truncates tool results to 2000 characters
- ✅ Handles multiple parallel tool calls correctly
- ✅ Provides default response when agent produces no content

**Run:**
```bash
cd apps/api && npm test -- agent.service
```

---

#### Unit Tests: Prompt Builder

File: `apps/api/src/data-agent/agent/prompts.spec.ts`

**Coverage:**
- ✅ Includes dataset YAML in prompt
- ✅ Includes relationship join hints when relationships provided
- ✅ Omits relationships section when empty
- ✅ Shows discovery guidance when no datasets match
- ✅ Includes enhanced instructions (error recovery, COALESCE, DATE_TRUNC)
- ✅ Includes conversation context
- ✅ Shows default when no conversation history

**Run:**
```bash
cd apps/api && npm test -- prompts.spec
```

---

#### Unit Tests: list_datasets Tool

File: `apps/api/src/data-agent/agent/tools/list-datasets.tool.spec.ts`

**Coverage:**
- ✅ Returns formatted list of datasets
- ✅ Returns message when no datasets found
- ✅ Handles errors gracefully (returns string, doesn't throw)

**Run:**
```bash
cd apps/api && npm test -- list-datasets.tool
```

---

#### Unit Tests: NeoOntologyService Lightweight Queries

File: `apps/api/src/ontologies/neo-ontology.service.spec.ts`

**Coverage:**

**listDatasets:**
- ✅ Returns correct structure (name, description, source)
- ✅ Returns empty array when no datasets found
- ✅ Handles null description/source with defaults
- ✅ Calls readTransaction with correct parameters

**getDatasetsByNames:**
- ✅ Returns matching datasets with all fields including YAML
- ✅ Returns empty array when no names match
- ✅ Handles subset of names matching
- ✅ Handles null/undefined fields with defaults

**getDatasetRelationships:**
- ✅ Returns relationships with parsed columns
- ✅ Returns empty array when no relationships exist
- ✅ Returns relationships where either from or to matches
- ✅ Handles empty fromColumns/toColumns with default '[]'

**Run:**
```bash
cd apps/api && npm test -- neo-ontology.service
```

---

### Frontend Tests

File: `apps/web/src/__tests__/components/data-agent/ChatSidebar.test.tsx`

**Coverage:**

**ChatSidebar**
- ✅ Renders New Chat button
- ✅ Renders search input
- ✅ Renders chat list grouped by date
- ✅ Highlights active chat
- ✅ Calls onSelectChat on click
- ✅ Shows rename/delete actions on hover
- ✅ Shows empty state when no chats

**ChatMessage**
- ✅ Renders user message (right-aligned, primary color)
- ✅ Renders assistant message (left-aligned, markdown)
- ✅ Renders tool calls in accordions
- ✅ Renders syntax-highlighted code
- ✅ Renders tables
- ✅ Renders base64 images
- ✅ Shows loading indicator for generating status

**Run:**
```bash
cd apps/web && npm test -- data-agent
```

---

## Packages

### No New NPM Packages

All required packages already installed from previous features:

**Backend:**
- `@langchain/langgraph` - ReAct agent framework
- `@langchain/core` - LangChain core utilities
- `@langchain/openai` - OpenAI chat + embeddings
- `@langchain/anthropic` - Anthropic chat models
- `neo4j-driver` - Neo4j client
- `js-yaml` - YAML parsing
- `nestjs-zod` - Zod DTO validation
- `openai` - OpenAI SDK (for embeddings)

**Frontend:**
- `react-markdown` - Markdown rendering
- `react-syntax-highlighter` - Code syntax highlighting
- `@mui/material` - Material UI components
- `@mui/icons-material` - Material icons

**Python Sandbox:**
- `flask` - Web server
- `gunicorn` - WSGI server
- `pandas` - Data manipulation
- `numpy` - Numerical computing
- `matplotlib` - Chart generation
- `seaborn` - Statistical visualization
- `scipy` - Scientific computing
- `openpyxl` - Excel file support

**Note:** All packages reused from Semantic Models and Ontology features.

---

## Summary

The Data Agent feature demonstrates:

- **ReAct Pattern Implementation**: Iterative tool-calling with 5 specialized tools and recursion guard
- **Intelligent Dataset Discovery**: Vector similarity search (top-10) with fallback to full dataset listing
- **Relationship-Aware Querying**: Automatic join hint injection from ontology graph relationships
- **Rich Conversation Context**: Tool call summaries preserved across turns for multi-step analysis
- **Error Recovery Strategies**: Guided self-correction for empty results, missing columns, and syntax errors
- **Multi-Provider LLM Architecture**: Pluggable chat + embedding providers
- **Read-Only Security**: Safe SQL execution with strict validation
- **Sandboxed Python Execution**: Docker-isolated code execution with resource limits
- **SSE Streaming**: Real-time agent reasoning display via Server-Sent Events
- **ChatGPT-Style UI**: Modern chat interface with markdown, code, and charts
- **Conversation Persistence**: Full chat history with metadata tracking
- **RBAC Enforcement**: Permission-based access control
- **Namespace Isolation**: Multi-tenancy across PostgreSQL and Neo4j
- **Atomic State Management**: Message claiming prevents duplicate execution
- **Type Safety**: End-to-end TypeScript + Zod validation

This specification serves as comprehensive documentation for the Data Agent feature and demonstrates integration of LLMs, graph databases, and containerized execution environments.
