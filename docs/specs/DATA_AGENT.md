# Data Agent Feature Specification

## Table of Contents

1. [Feature Overview](#feature-overview)
2. [Architecture](#architecture)
3. [Multi-Phase Agent Architecture](#multi-phase-agent-architecture)
4. [Phase Descriptions](#phase-descriptions)
5. [Sub-Task Decomposition](#sub-task-decomposition)
6. [Conditional Routing](#conditional-routing)
7. [Clarifying Questions](#clarifying-questions)
8. [User Preferences / Memory](#user-preferences--memory)
9. [State Schema](#state-schema)
10. [Tool Definitions](#tool-definitions)
11. [SSE Streaming](#sse-streaming)
12. [Message Metadata](#message-metadata)
13. [Database Schema](#database-schema)
14. [API Endpoints](#api-endpoints)
15. [Security](#security)
16. [RBAC Permissions](#rbac-permissions)
17. [Embedding Service](#embedding-service)
18. [Neo4j Vector Search](#neo4j-vector-search)
19. [Docker Python Sandbox](#docker-python-sandbox)
20. [Frontend Components](#frontend-components)
21. [Model Selection](#model-selection)
22. [Configuration](#configuration)
23. [Token Usage Tracking](#token-usage-tracking)
24. [LLM Interaction Tracing](#llm-interaction-tracing)
25. [File Inventory](#file-inventory)
26. [Testing](#testing)
27. [Packages](#packages)

---

## Feature Overview

The Data Agent feature enables natural language querying and analysis of data through ontology graphs. Users interact with a ChatGPT-style interface where a multi-phase AI agent decomposes complex questions, discovers datasets, builds validated SQL, executes queries, verifies results with mandatory Python checks, and synthesizes narrative answers with data lineage.

### Core Capabilities

- **Multi-Phase Analytical Pipeline**: 6 specialized phases (Planner, Navigator, SQL Builder, Executor, Verifier, Explainer) with structured artifacts
- **Sub-Task Decomposition**: Complex questions automatically broken into ordered execution steps with dependencies
- **Clarifying Questions**: Planner detects critical ambiguities and requests user clarification before running the expensive pipeline, saving compute and improving accuracy
- **User Preferences / Memory**: Persistent per-user preferences (global and ontology-scoped) injected into prompts, reducing repeated clarifications and tailoring responses over time
- **Intelligent Dataset Discovery**: Vector similarity search + graph relationship navigation for join path discovery
- **Semantic Model as Source of Truth**: Full YAML schemas from the semantic model are injected into every phase, ensuring column names, types, and expressions match the authoritative model
- **Mandatory Verification Gate**: Python-based validation of SQL results with automatic revision loops
- **Progressive SQL Execution**: Pilot queries (10 rows) followed by full queries to catch errors early
- **Python Analysis Sandbox**: Isolated Docker environment for data analysis and chart generation
- **Conversational History**: Persistent chat threads with full context retrieval and metadata
- **Real-Time Phase Progress**: SSE streaming of phase transitions, sub-task execution, and tool calls
- **ChatGPT-Style UI**: Modern chat interface with phase indicators, verification badges, and data lineage

### Use Cases

1. **Complex Analytical Questions**: "Why is Houston underperforming?" → Multi-step decomposition with variance analysis
2. **Cross-Dataset Joins**: Automatic discovery of join paths through ontology graph relationships
3. **Data Quality Validation**: Verifier catches grain issues, duplicate joins, and incorrect aggregations
4. **Exploratory Analysis**: Progressive execution with Python-based statistical analysis and charts
5. **Auditable Results**: Full data lineage tracking datasets, joins, filters, time windows, and grain

### Current Limitations

- **PostgreSQL Only**: Agent currently supports PostgreSQL databases (discovery limitations)
- **Read-Only Access**: No data modification capabilities (safety constraint)
- **Single Ontology per Chat**: Each conversation scoped to one ontology
- **30s Query Timeout**: Long-running queries will timeout
- **512MB Sandbox Memory**: Large dataset processing may hit memory limits
- **3 Revision Cycles**: Verifier allows maximum 3 revision attempts before returning with caveats
- **No External Network**: Python sandbox cannot access external APIs or packages beyond pre-installed

---

## Architecture

The Data Agent uses a multi-service architecture combining NestJS backend, Neo4j vector search + graph navigation, LangGraph StateGraph with 6 phases, and Docker-isolated Python execution:

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Frontend Layer                              │
│  React + Material UI + SSE Streaming                                 │
│                                                                       │
│  ChatSidebar (conversation list)                                     │
│  ChatView (message display + PhaseIndicator)                         │
│  ChatInput (textarea with Enter to send)                             │
│  ChatMessage (verification badge + data lineage)                     │
│  ToolCallAccordion (grouped by phase + step)                         │
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
│  DataAgentAgentService (StateGraph orchestration)                    │
│           ↓                                                           │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ Multi-Phase StateGraph (LangGraph)                            │  │
│  │                                                                │  │
│  │  START → [Planner] ──────────→ [Navigator] ──→ [SQL Builder] │  │
│  │              │                       │              │         │  │
│  │              │ (simple)              │              │         │  │
│  │              ↓                       │              │         │  │
│  │          [Executor] ←────────────────┴──────────────┘         │  │
│  │              │                                                 │  │
│  │              ↓                                                 │  │
│  │          [Verifier] ─────→ [Explainer] → END                  │  │
│  │              │                                                 │  │
│  │              │ (fail, revisions < 3)                          │  │
│  │              ↓                                                 │  │
│  │          [Navigator/SQL Builder] (revision loop)              │  │
│  │                                                                │  │
│  │  Tools per Phase:                                             │  │
│  │  - Planner: none (structured output)                          │  │
│  │  - Navigator: list_datasets, get_dataset_details,            │  │
│  │               get_relationships (mini-ReAct)                  │  │
│  │  - SQL Builder: get_dataset_details, get_sample_data         │  │
│  │  - Executor: query_database, run_python                      │  │
│  │  - Verifier: run_python (validation checks)                  │  │
│  │  - Explainer: run_python (charts)                            │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  EmbeddingService (OpenAI text-embedding-3-small)                    │
│           ↓                                                           │
│  NeoVectorService (vector similarity search in Neo4j)                │
│  NeoOntologyService (relationship navigation + join paths)           │
└─────────────┬────────────────┬────────────────┬────────────────────┘
              │                │                │
              ▼                ▼                ▼
┌──────────────────┐  ┌─────────────────┐  ┌──────────────────────┐
│   PostgreSQL     │  │   Neo4j Graph   │  │  Python Sandbox      │
│                  │  │                 │  │  (Docker Container)  │
│ - data_chats     │  │ - Dataset nodes │  │                      │
│ - data_chat_     │  │   with vector   │  │ - Flask server       │
│   messages       │  │   embeddings    │  │ - pandas, numpy      │
│                  │  │ - YAML schemas  │  │ - matplotlib         │
│ - Conversation   │  │   (field-level) │  │ - 512MB memory       │
│   history        │  │ - RELATES_TO    │  │ - Read-only FS       │
│ - Metadata with  │  │   edges (joins) │  │ - No network         │
│   phase artifacts│  │ - Vector index  │  │                      │
│                  │  │ - Join path     │  │                      │
│                  │  │   discovery     │  │                      │
└──────────────────┘  └─────────────────┘  └──────────────────────┘
```

### System Components

#### Backend Modules
- **DataAgentModule**: Main feature module
- **DataAgentService**: CRUD operations for chats and messages
- **DataAgentAgentService**: StateGraph creation and execution (replaces ReAct agent)
- **AgentStreamController**: SSE streaming endpoint
- **PreferencesService**: CRUD and effective preference resolution for user preferences
- **EmbeddingService**: Multi-provider embedding generation (OpenAI)
- **NeoVectorService**: Vector index management and similarity search
- **NeoOntologyService**: Relationship navigation and join path discovery (NEW methods)
- **SandboxService**: Python code execution client
- **DiscoveryService**: Database schema discovery and query execution

#### Frontend Components
- **DataAgentPage**: Full-page layout with sidebar + chat area
- **ChatSidebar**: Conversation list with search, grouping, rename/delete
- **ChatView**: Message display with PhaseIndicator showing 6-phase progress; Tune icon for PreferencesDialog
- **ChatMessage**: Individual message bubble with verification badge, data lineage, and inline ClarificationCard
- **PhaseIndicator**: MUI Stepper showing current phase (NEW)
- **ToolCallAccordion**: Collapsible tool execution display grouped by phase + step (UPDATED)
- **ChatInput**: Auto-resize textarea with Enter to send, ModelSelector for provider selection
- **ModelSelector**: Compact MUI Select showing enabled providers
- **ClarificationCard**: Inline card for clarifying questions with Answer / Proceed options (NEW)
- **PreferencesDialog**: Two-tab dialog for managing global and ontology-scoped preferences (NEW)
- **PreferenceSuggestionBanner**: Per-suggestion save/dismiss banner for ask-mode auto-capture (NEW)
- **WelcomeScreen**: Empty state with suggestion cards
- **NewChatDialog**: Ontology selection for new chats

#### External Services
- **Neo4j**: Vector index on Dataset nodes + RELATES_TO edges for join paths
- **PostgreSQL**: Chat and message persistence
- **Docker Sandbox**: Isolated Python execution environment
- **OpenAI API**: Embedding generation (text-embedding-3-small)
- **LLM Provider**: Chat completion (OpenAI, Anthropic, or Azure)

---

## Multi-Phase Agent Architecture

The Data Agent uses a custom LangGraph StateGraph with 6 specialized phase nodes. Each phase produces a structured artifact consumed by the next phase. A mandatory verification gate blocks incorrect answers with automatic revision loops (up to 3 cycles).

### Phase Pipeline Diagram

```
START
  |
  v
[Planner] ─────────────────────────────────────────────────────┐
  |                                       |                     |
  | (data: simple                        | (clarify)           | (conversational)
  |  or analytical)                      v                     v
  |                                    [END]               [Explainer] ──> END
  |                               clarification_needed     (direct answer)
  v
[Navigator] ────────────────────────────────────────┐
  |                                                  |
  | (cannotAnswer=null)                            | (cannotAnswer set)
  v                                                  v
[SQL Builder] ───> [Executor]                   [Explainer] ──> END
                       |                        (helpful refusal)
                       v
                  [Verifier]
                       |
      ┌────────────────┼────────────────────┐
      |                |                    |
  (pass)        (fail,             (fail,
      |         revisions<3)       revisions>=3)
      v                |                    |
 [Explainer] ──> END   |                    |
                       v                    v
          [Navigator/SQL Builder]     [Explainer]
             (revision loop)       (with caveats)
```

### Key Architectural Decisions

1. **Structured Artifacts**: Each phase emits a typed artifact (PlanArtifact, JoinPlanArtifact, QuerySpec[], etc.) stored in state
2. **Sub-Task Decomposition**: Planner ALWAYS decomposes questions into ordered steps with strategies (sql, python, sql_then_python)
3. **Navigator is the Sole Ontology Gatekeeper**: ALL data-touching queries go through Navigator, which queries Neo4j to validate dataset availability. Only Navigator can determine that the ontology cannot answer a query (via `cannotAnswer` state). The Planner NEVER makes this determination.
4. **Clarification Early Exit**: When the Planner detects critical unresolvable ambiguity, it returns `__end__` before running any expensive phases; conversation resumes with context on the next invocation
5. **User Preferences Injection**: Global and ontology-scoped preferences are loaded before graph execution and injected into Planner and Explainer prompts; ontology-scoped overrides global for the same key
6. **Mandatory Verification**: All analytical queries require Python validation; failures trigger Navigator or SQL Builder revision
7. **Progressive Execution**: SQL steps run pilot query (10 rows) before full query to catch errors early
8. **Join Path Discovery**: Navigator uses Neo4j `shortestPath` algorithm to find RELATES_TO paths between datasets
9. **No ReAct Loop in Main Graph**: Only Navigator uses mini-ReAct (max 8 iterations); other phases are single LLM calls with structured output
10. **Semantic Model YAML as First-Class Data**: The YAML from the semantic model (stored on Neo4j Dataset nodes) is the authoritative schema. It flows through the entire pipeline: pre-fetched for Planner, carried in JoinPlanArtifact for Navigator/SQL Builder, and passed to Executor repair and Python generation prompts. No phase guesses column names.
11. **Conversational Short-Circuit**: Purely conversational questions (no data needed) route directly from Planner to Explainer, bypassing all data phases. These include schema questions, explanations, and conceptual questions.

---

## Phase Descriptions

### Phase 1: Planner

**Purpose**: Decompose user question into ordered sub-tasks with execution strategies.

**Inputs**:
- `userQuestion`: Raw user query
- `conversationContext`: Summarized history from last 10 messages
- `relevantDatasets`: Top 10 datasets from vector search
- `relevantDatasetDetails`: Pre-fetched YAML schemas for vector-matched datasets (from `NeoOntologyService.getDatasetsByNames`)

**Output**: `PlanArtifact`
```typescript
{
  complexity: 'simple' | 'analytical' | 'conversational',
  intent: string,
  metrics: string[],
  dimensions: string[],
  timeWindow: string | null,
  filters: string[],
  grain: string,
  ambiguities: Array<{ question: string; assumption: string }>,
  acceptanceChecks: string[],
  steps: Array<{
    id: number,
    description: string,
    strategy: 'sql' | 'python' | 'sql_then_python',
    dependsOn: number[],
    datasets: string[],
    expectedOutput: string,
  }>,
}
```

**Tools**: None (pure structured output)

**Key Behavior**:
- ALWAYS produces sub-task list (even for simple questions, may be single step)
- `complexity: 'simple'` triggers short-circuit to Executor (skip Navigator/SQL Builder/Verifier)
- `complexity: 'analytical'` triggers full pipeline
- Each step specifies:
  - `strategy: 'sql'` → query database only
  - `strategy: 'python'` → analysis/visualization only (uses prior step results)
  - `strategy: 'sql_then_python'` → query then analyze
- `dependsOn` creates execution order (e.g., step 3 needs results from steps 1 and 2)
- When `relevantDatasetDetails` is available, the Planner prompt includes full YAML schema blocks for each dataset, enabling informed step decomposition with knowledge of available columns and types

**Example**:
Question: "Why is Houston underperforming?"
```typescript
{
  complexity: 'analytical',
  intent: 'Identify revenue drivers for Houston vs peer stores',
  metrics: ['revenue', 'order_count', 'avg_order_value'],
  dimensions: ['store_city', 'time_period'],
  timeWindow: 'last 6 months',
  filters: [],
  grain: 'store-month',
  steps: [
    { id: 1, description: "Get monthly revenue per store", strategy: "sql", dependsOn: [], datasets: ["orders", "stores"] },
    { id: 2, description: "Compare Houston vs peer stores", strategy: "sql", dependsOn: [1], datasets: ["orders", "stores"] },
    { id: 3, description: "Decompose variance into volume/price/mix", strategy: "sql_then_python", dependsOn: [1, 2], datasets: ["order_items", "products"] },
    { id: 4, description: "Visualize the comparison chart", strategy: "python", dependsOn: [2, 3], datasets: [] },
  ],
}
```

---

### Phase 2: Navigator

**Purpose**: Find ontology subgraph and join paths for ALL SQL-involving sub-tasks.

**Inputs**:
- `plan.steps`: All sub-tasks from planner
- `plan.metrics`, `plan.dimensions`: Required data elements
- `ontologyId`: Graph to search

**Output**: `JoinPlanArtifact`
```typescript
{
  relevantDatasets: Array<{ name: string; description: string; source: string; yaml: string }>,
  joinPaths: Array<{
    datasets: string[],
    edges: Array<{
      fromDataset: string,
      toDataset: string,
      fromColumns: string[],
      toColumns: string[],
      relationshipName: string,
    }>,
  }>,
  notes: string,
}
```

**Tools**:
- `list_datasets`: Discover available datasets in ontology
- `get_dataset_details`: Get schema (fields, descriptions) for specific datasets
- `get_relationships`: Get ALL RELATES_TO edges in ontology (NEW tool)

**Key Behavior**:
- Mini-ReAct loop (max 8 iterations) with ontology tools
- Calls `get_relationships` to get all available join edges
- Uses `findJoinPaths` Neo4j service method (shortestPath algorithm) to discover FK paths between datasets
- Validates join paths cover all required datasets from plan.steps
- Emits `tool_start`, `tool_end`, `text` events during mini-ReAct loop
- Includes full YAML schema for each dataset in `JoinPlanArtifact.relevantDatasets.yaml` — this is the authoritative field-level schema from the semantic model, passed downstream to SQL Builder and Executor
- Navigator prompt emphasizes YAML from `get_dataset_details` as the authoritative schema — "defines exactly which columns exist and what types they are"

**Neo4j Integration**:
```typescript
// NEW NeoOntologyService methods
getAllRelationships(ontologyId: string): Promise<RelationshipEdge[]>
findJoinPaths(ontologyId: string, fromDataset: string, toDataset: string): Promise<JoinPath[]>
```

Cypher queries:
```cypher
-- getAllRelationships
MATCH (from:Dataset {ontologyId: $ontologyId})-[r:RELATES_TO]->(to:Dataset {ontologyId: $ontologyId})
RETURN from.name, to.name, r.name, r.fromColumns, r.toColumns

-- findJoinPaths (uses shortestPath)
MATCH (start:Dataset {ontologyId: $ontologyId, name: $fromDataset}),
      (end:Dataset {ontologyId: $ontologyId, name: $toDataset}),
      path = shortestPath((start)-[:RELATES_TO*..5]-(end))
RETURN [n IN nodes(path) | n.name] AS pathNames,
       [r IN relationships(path) | {...}] AS rels
LIMIT 3
```

---

### Phase 3: SQL Builder

**Purpose**: Generate pilot + full SQL for each SQL-involving sub-task.

**Inputs**:
- `plan.steps`: Sub-task list (filters for `strategy: 'sql'` or `'sql_then_python'`)
- `joinPlan`: Dataset schemas and join paths
- `databaseType`: PostgreSQL

**Output**: `QuerySpec[]`
```typescript
[
  {
    stepId: number,
    description: string,
    pilotSql: string,  // LIMIT 10
    fullSql: string,   // Full query
    expectedColumns: string[],
    notes: string,
  },
]
```

**Tools**:
- `get_dataset_details`: Confirm schema and field names
- `get_sample_data`: Inspect data types and value formats

**Key Behavior**:
- Generates SQL per sub-task in `plan.steps` order
- Uses `joinPlan.joinPaths` to build correct JOIN clauses
- Pilot SQL always includes `LIMIT 10` for fast validation
- Full SQL has no LIMIT (executor will add row limit dynamically)
- Validates expected columns match plan requirements
- Receives full YAML schema via `joinPlan.relevantDatasets[].yaml` — prompts instruct the LLM to use ONLY column names from the semantic model YAML
- On revision (from Verifier failure), re-fetches dataset details with YAML preserved

**Example Output**:
```typescript
[
  {
    stepId: 1,
    description: "Get monthly revenue per store",
    pilotSql: "SELECT s.store_id, s.city, DATE_TRUNC('month', o.order_date) AS month, SUM(o.total_amount) AS revenue FROM stores s JOIN orders o ON s.store_id = o.store_id WHERE o.order_date >= CURRENT_DATE - INTERVAL '6 months' GROUP BY s.store_id, s.city, month LIMIT 10",
    fullSql: "SELECT s.store_id, s.city, DATE_TRUNC('month', o.order_date) AS month, SUM(o.total_amount) AS revenue FROM stores s JOIN orders o ON s.store_id = o.store_id WHERE o.order_date >= CURRENT_DATE - INTERVAL '6 months' GROUP BY s.store_id, s.city, month",
    expectedColumns: ["store_id", "city", "month", "revenue"],
    notes: "Join stores → orders via store_id FK",
  },
]
```

---

### Phase 4: Executor

**Purpose**: Iterate through sub-tasks in dependency order, executing SQL and/or Python.

**Inputs**:
- `plan.steps`: Ordered sub-task list
- `querySpecs`: SQL for each SQL-involving step
- `joinPlan`: YAML schemas used to provide schema context to repair and Python prompts

**Output**: `StepResult[]`
```typescript
[
  {
    stepId: number,
    description: string,
    strategy: 'sql' | 'python' | 'sql_then_python',
    sqlResult?: {
      rowCount: number,
      columns: string[],
      data: string,  // Truncated to first 100 rows for metadata storage
    },
    pythonResult?: {
      stdout: string,
      charts: string[],  // base64-encoded PNG images
    },
    error?: string,
  },
]
```

**Tools**:
- `query_database`: Execute SQL queries (pilot → full)
- `run_python`: Execute Python analysis code with prior step results as data
- `get_sample_data`: Inspect schemas if SQL errors occur
- `get_dataset_details`: Schema lookup for error recovery

**Key Behavior**:
- Iterates `plan.steps` in dependency order (respects `dependsOn`)
- For `strategy: 'sql'`:
  1. Run `pilotSql` via `query_database` (fast validation)
  2. If pilot succeeds, run `fullSql`
  3. If pilot fails, attempt ONE repair with executor repair prompt + LLM
  4. Store result in `stepResults[stepId]`
- For `strategy: 'python'`:
  1. Build Python script that references prior step results (e.g., `step_1_data`, `step_2_data`)
  2. Run via `run_python` sandbox
  3. Store stdout + charts
- For `strategy: 'sql_then_python'`:
  1. Run SQL first (pilot → full)
  2. Pass SQL result to Python as `current_data`
  3. Run Python analysis
- Each step result is available to subsequent steps with `dependsOn` dependency
- SQL repair prompt receives dataset YAML schemas so the LLM can fix column name/type errors using authoritative schema
- Python generation prompt receives dataset YAML schemas for reference when generating analysis code

**Progressive SQL Execution**:
```
Pilot Query (LIMIT 10) → Success → Full Query
                      ↓ Failure
                LLM Repair (1 attempt) → Retry Pilot → Full Query
```

**Emits SSE Events**:
- `step_start`: `{ stepId, description, strategy }`
- `step_complete`: `{ stepId }`
- `tool_start`: `{ phase: 'executor', stepId, name, args }`
- `tool_end`: `{ phase: 'executor', stepId, name, result }`

---

### Phase 5: Verifier

**Purpose**: Validate combined results with Python checks. Block on failure with revision routing.

**Inputs**:
- `plan`: Original plan with acceptance checks
- `stepResults`: All execution results
- `joinPlan`: Join paths used
- `revisionCount`: Current revision cycle count

**Output**: `VerificationReport`
```typescript
{
  passed: boolean,
  checks: Array<{
    name: string,
    passed: boolean,
    message: string,
  }>,
  diagnosis: string,
  recommendedTarget: 'navigator' | 'sql_builder' | null,
}
```

**Tools**:
- `run_python`: Execute validation checks

**Key Behavior**:
- Generates Python verification script based on `plan.acceptanceChecks`
- Common checks:
  - Grain validation (no duplicates at expected grain)
  - Row count sanity (not empty, not suspiciously large)
  - NULL value inspection (critical fields should not be NULL)
  - Join cardinality (detect many-to-many explosions)
  - Expected columns present
- Runs checks via `run_python` sandbox
- Parses JSON output: `{ checks: [...] }`
- If `passed: false` and `revisionCount < 3`:
  - `recommendedTarget: 'navigator'` if join paths seem wrong
  - `recommendedTarget: 'sql_builder'` if SQL syntax/logic error
  - Graph routes to recommended target (revision loop)
  - Increments `revisionCount` and sets `revisionDiagnosis`
- If `passed: false` and `revisionCount >= 3`:
  - Graph routes to Explainer with caveats mode (stop trying)
- If Python check execution fails (sandbox error):
  - Treat as PASS with warning caveat (don't block on verification failure)

**Revision Routing Logic** (in `graph.ts`):
```typescript
function routeAfterVerification(state: DataAgentStateType): 'explainer' | 'navigator' | 'sql_builder' {
  const report = state.verificationReport;

  if (!report || report.passed) return 'explainer';
  if (state.revisionCount >= 3) return 'explainer';  // Max retries, give up with caveats

  if (report.recommendedTarget === 'navigator') return 'navigator';
  return 'sql_builder';
}
```

---

### Phase 6: Explainer

**Purpose**: Synthesize all sub-task results into narrative answer with data lineage.

**Inputs**:
- `userQuestion`: Original question
- `plan`: Question decomposition
- `stepResults`: All execution results
- `verificationReport`: Validation status
- `revisionCount`: Number of revision cycles

**Output**: `ExplainerOutput`
```typescript
{
  narrative: string,  // Markdown-formatted answer
  dataLineage: {
    datasets: string[],
    joins: Array<{ from: string; to: string; on: string }>,
    timeWindow: string | null,
    filters: string[],
    grain: string,
    rowCount: number | null,
  },
  caveats: string[],
  charts: string[],  // base64 PNG images
}
```

**Tools**:
- `run_python`: Optional chart generation (if not already in stepResults)

**Key Behavior**:
- Synthesizes narrative that:
  - Answers the original question
  - References specific data points from stepResults
  - Explains any ambiguities and assumptions made (from plan.ambiguities)
  - Notes verification status (passed / failed with caveats)
- Builds data lineage summary:
  - All datasets accessed
  - All joins performed
  - Time window applied
  - Filters applied
  - Final grain level
  - Total row count
- If `verificationReport.passed === false`:
  - Adds caveats to narrative (e.g., "Note: grain validation failed, results may contain duplicates")
  - If `revisionCount >= 3`, adds "Maximum revision attempts reached"
- If stepResults contain charts, includes them in output
- Optionally generates additional summary charts via `run_python`

**Stored in Message Content**:
The `narrative` field becomes the message `content` (markdown). The full `ExplainerOutput` is stored in `metadata.explainerOutput`.

---

## Token Usage Tracking

All 6 agent phase nodes capture LLM token usage and emit it via SSE for real-time monitoring and historical analysis.

### Backend Token Tracking

**Token Tracker Utility**: `apps/api/src/data-agent/agent/utils/token-tracker.ts`

Two utility functions for token tracking:

1. **`extractTokenUsage(response: AIMessage): TokenUsage`**
   - Extracts token counts from LangChain AIMessage
   - Supports OpenAI format: `response_metadata.usage.{prompt_tokens, completion_tokens}`
   - Supports Anthropic format: `usage_metadata.{input_tokens, output_tokens}`
   - Returns: `{ prompt: number, completion: number, total: number }`

2. **`mergeTokenUsage(a: TokenUsage, b: TokenUsage): TokenUsage`**
   - Sums two token usage objects
   - Used for accumulating tokens across multiple LLM calls (e.g., Navigator mini-ReAct loop)

**State Reducer**: The `tokensUsed` field in state uses an **accumulating reducer** instead of a replace reducer:

```typescript
tokensUsed: Annotation<{ prompt: number; completion: number; total: number }>({
  reducer: (prev, next) => ({
    prompt: prev.prompt + next.prompt,
    completion: prev.completion + next.completion,
    total: prev.total + next.total,
  }),
  default: () => ({ prompt: 0, completion: 0, total: 0 }),
}),
```

This ensures each node's token contribution is automatically summed without manual accumulation logic.

### Node-Level Token Tracking

Each phase node captures tokens from every `llm.invoke()` call:

1. **Planner**:
   - Uses `includeRaw: true` on `withStructuredOutput` to get raw AIMessage
   - Extracts tokens from structured output response
   - Emits `token_update` SSE event with phase='planner'

2. **Navigator**:
   - Accumulates tokens across all mini-ReAct iterations
   - Uses `mergeTokenUsage` to sum tokens from multiple LLM calls
   - Emits single `token_update` with total after completion

3. **SQL Builder**:
   - Uses `includeRaw: true` on `withStructuredOutput`
   - Extracts tokens from structured SQL generation response
   - Emits `token_update` with phase='sql_builder'

4. **Executor**:
   - Accumulates tokens from:
     - SQL repair LLM calls (when pilot query fails)
     - Python code generation calls (for python/sql_then_python strategies)
   - Emits `token_update` with phase='executor'

5. **Verifier**:
   - Extracts tokens from single LLM verification code generation call
   - Emits `token_update` with phase='verifier'

6. **Explainer**:
   - Extracts tokens from single LLM narrative generation call
   - Emits `token_update` with phase='explainer'

**SSE Event Format**:
```typescript
{
  type: 'token_update',
  phase: 'planner' | 'navigator' | 'sql_builder' | 'executor' | 'verifier' | 'explainer',
  tokensUsed: {
    prompt: number,
    completion: number,
    total: number,
  },
}
```

### Frontend Live Token Display

The `AgentInsightsPanel` component displays token usage in both live and history modes:

**Live Mode** (during streaming):
- `extractLiveTokens(streamEvents)` sums all `token_update` events
- Updates in real-time as each phase completes
- Shows cumulative totals across all phases

**History Mode** (after completion):
- Reads `metadata.tokensUsed` from completed message
- Displays final token counts

**Duration Tracking**:
- Live mode: Reads `startedAt` from `message_start` stream event
- History mode: Reads `metadata.startedAt` and `metadata.durationMs`
- `useElapsedTimer` hook provides live-ticking timer during streaming

---

## LLM Interaction Tracing

All LLM interactions across the 6-phase pipeline are traced and persisted to the database for debugging, cost analysis, and performance optimization. Each `llm.invoke()` call is wrapped by the `DataAgentTracer` utility, which captures full prompt messages, response content, tool calls, token usage, timing, and errors.

### Database Schema

**Table**: `llm_traces`

```sql
CREATE TABLE llm_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES data_chat_messages(id) ON DELETE CASCADE,
  phase VARCHAR(50) NOT NULL,  -- 'planner', 'navigator', 'sql_builder', 'executor', 'verifier', 'explainer'
  call_index INTEGER NOT NULL,  -- Sequential index within message (0, 1, 2, ...)
  step_id INTEGER,              -- Executor step ID (null for other phases)
  purpose VARCHAR(100) NOT NULL, -- e.g., 'plan_generation', 'tool_exploration_1', 'query_generation'
  provider VARCHAR(50) NOT NULL, -- 'openai', 'anthropic', 'azure'
  model VARCHAR(100) NOT NULL,   -- e.g., 'gpt-4o', 'claude-3-7-sonnet-20250219'
  temperature DECIMAL(3, 2),     -- null when reasoning mode is enabled
  structured_output BOOLEAN NOT NULL DEFAULT false,
  prompt_messages JSONB NOT NULL, -- Array of LangChain message objects
  response_content TEXT,         -- Full AI response text
  tool_calls JSONB,              -- Array of tool call objects (if any)
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP NOT NULL,
  duration_ms INTEGER NOT NULL,
  error TEXT,                    -- Error message if call failed
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_llm_traces_message_id ON llm_traces(message_id);
CREATE INDEX idx_llm_traces_message_phase ON llm_traces(message_id, phase);
```

**Key Fields**:
- **message_id**: Foreign key to `data_chat_messages` with cascade delete
- **phase**: Which agent phase made the call
- **call_index**: Unique sequential index per message (0, 1, 2, ...) for ordering
- **step_id**: Only populated for Executor phase calls (matches sub-task ID)
- **purpose**: Human-readable label describing why the LLM was called
- **structured_output**: True if `withStructuredOutput()` was used
- **prompt_messages**: Full array of LangChain message objects (system, human, ai, tool)
- **response_content**: Complete AI response text (or structured output JSON)
- **tool_calls**: Array of tool calls if the LLM requested them (Navigator mini-ReAct)

### DataAgentTracer Utility

**Location**: `apps/api/src/data-agent/agent/utils/data-agent-tracer.ts`

The `DataAgentTracer` class wraps every LLM invocation to capture trace data in-memory during graph execution. Traces are batched and persisted to PostgreSQL after the agent completes.

**Usage Pattern**:
```typescript
// In any phase node
const tracer = new DataAgentTracer(state.messageId);

const response = await tracer.trace({
  phase: 'planner',
  stepId: undefined,
  purpose: 'plan_generation',
  invoke: async () => {
    return await llm.withStructuredOutput(PlanSchema, { name: 'generate_plan' }).invoke([
      new SystemMessage(PLANNER_PROMPT),
      new HumanMessage(state.userQuestion),
    ]);
  },
  streamManager,
});

// Later, after graph completes
await tracer.persistTraces(prisma);
```

**Core Methods**:

1. **`trace(options: TraceOptions): Promise<T>`**
   - Wraps an LLM invocation with timing, error handling, and metadata capture
   - Emits `llm_call_start` and `llm_call_end` SSE events
   - Stores trace in-memory array
   - Returns the LLM response

2. **`persistTraces(prisma: PrismaService): Promise<void>`**
   - Batch inserts all collected traces to database
   - Called once after agent graph completes successfully
   - Traces are NOT persisted if the agent fails (no message created)

**TraceOptions**:
```typescript
interface TraceOptions<T> {
  phase: string;
  stepId?: number;
  purpose: string;
  invoke: () => Promise<T>;
  streamManager: StreamManager;
}
```

### Purpose Labels by Phase

Each phase uses descriptive purpose labels to identify why the LLM was called:

| Phase | Purpose Labels | Description |
|-------|---------------|-------------|
| **Planner** | `plan_generation` | Structured sub-task decomposition |
| **Navigator** | `tool_exploration_1`, `tool_exploration_2`, ... | ReAct loop iterations (up to 8) |
| **SQL Builder** | `query_generation` | Structured SQL generation for all steps |
| **Executor** | `sql_repair_step_{id}`, `python_gen_step_{id}` | SQL repair or Python code generation per step |
| **Verifier** | `verification_code` | Python validation code generation |
| **Explainer** | `narrative` | Final narrative synthesis |

### SSE Events for Live Tracing

The tracer emits two SSE events for real-time monitoring in the frontend:

**`llm_call_start`**:
```typescript
{
  type: 'llm_call_start',
  phase: 'planner',
  callIndex: 0,
  stepId?: number,
  purpose: 'plan_generation',
  provider: 'openai',
  model: 'gpt-4o',
  structuredOutput: true,
  promptSummary: {
    messageCount: 2,
    totalChars: 1523,
  },
}
```

**`llm_call_end`**:
```typescript
{
  type: 'llm_call_end',
  phase: 'planner',
  callIndex: 0,
  stepId?: number,
  purpose: 'plan_generation',
  durationMs: 2341,
  promptTokens: 1205,
  completionTokens: 312,
  totalTokens: 1517,
  responsePreview: 'This question requires analyzing store performance...', // First 200 chars
  toolCallCount: 0,
}
```

**Event Usage**:
- `llm_call_start`: Displayed immediately when LLM call begins (shows "Generating..." state)
- `llm_call_end`: Updates with final timing, tokens, and response preview
- Events appear in `LlmTracesSection` component in real-time during streaming

### REST API Endpoint

**Endpoint**: `GET /api/data-agent/chats/:chatId/messages/:messageId/traces`

**Permission**: `data_agent:read`

**Query Parameters**: None

**Response**:
```typescript
{
  data: LlmTrace[],
  meta: { timestamp: string }
}

interface LlmTrace {
  id: string;
  messageId: string;
  phase: string;
  callIndex: number;
  stepId?: number;
  purpose: string;
  provider: string;
  model: string;
  temperature?: number;
  structuredOutput: boolean;
  promptMessages: any[];  // LangChain message objects
  responseContent: string;
  toolCalls?: any[];
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  error?: string;
  createdAt: string;
}
```

**Authorization**:
- Verifies user owns the chat (via chatId → ownerId check)
- Returns 404 if chat or message doesn't exist
- Returns 403 if user doesn't own the chat

**Ordering**: Traces ordered by `call_index ASC` (chronological order)

### Frontend Components

#### LlmTracesSection (NEW)

**Location**: `apps/web/src/components/data-agent/LlmTracesSection.tsx`

Displays LLM interaction traces in the `AgentInsightsPanel`, positioned between "Phase Details" and "Join Graph" sections.

**Features**:
- **Dual-mode rendering**: Live mode (reads from SSE events), History mode (reads from REST API)
- **Compact trace cards**: Shows phase, purpose, provider/model, tokens, duration
- **Click to expand**: Opens `LlmTraceDialog` with full trace details
- **Live updates**: New traces appear as `llm_call_end` events arrive
- **Color-coded phases**: Different background colors per phase (planner=blue, navigator=purple, etc.)

**Props**:
```typescript
interface LlmTracesSectionProps {
  chatId: string;
  messageId: string;
  streamEvents: DataAgentStreamEvent[];
  isStreaming: boolean;
}
```

**Live Mode** (during streaming):
- Filters `streamEvents` for `llm_call_start` and `llm_call_end` events
- Displays compact cards with live status indicator
- Shows "In progress..." for calls that started but haven't completed

**History Mode** (after completion):
- Fetches traces from `GET /api/data-agent/chats/:chatId/messages/:messageId/traces`
- Displays all traces with full metadata
- No loading state (data already persisted)

#### LlmTraceDialog (NEW)

**Location**: `apps/web/src/components/data-agent/LlmTraceDialog.tsx`

Full-screen dialog showing complete trace details when a trace card is clicked.

**Features**:
- **Metadata section**: Phase, purpose, provider, model, temperature, structured output flag
- **Timing section**: Start time, end time, duration (ms)
- **Token usage**: Prompt tokens, completion tokens, total tokens
- **Prompt messages**: Syntax-highlighted JSON display of all LangChain messages
- **Response content**: Syntax-highlighted response (JSON for structured output, text otherwise)
- **Tool calls**: Displays tool call array if present (Navigator mini-ReAct)
- **Error display**: Shows error message with red background if call failed

**Props**:
```typescript
interface LlmTraceDialogProps {
  trace: LlmTrace;
  open: boolean;
  onClose: () => void;
}
```

**Syntax Highlighting**: Uses `react-syntax-highlighter` with `tomorrow` theme for JSON/text display.

### Use Cases

1. **Debugging prompt issues**: Inspect exact prompt messages sent to LLM for each phase
2. **Cost analysis**: Track token usage per phase, per provider, across conversations
3. **Performance optimization**: Identify slow LLM calls, optimize prompts to reduce tokens
4. **Quality assurance**: Review LLM responses to understand decision-making
5. **Audit trail**: Full trace of all LLM interactions for compliance/debugging
6. **Provider comparison**: Compare token efficiency across OpenAI, Anthropic, Azure

### Integration with AgentInsightsPanel

The `LlmTracesSection` is integrated into `AgentInsightsPanel` as a collapsible accordion section:

**Position**: After "Phase Details", before "Join Graph"

**Layout**:
```
AgentInsightsPanel
├─ Stats Row (duration, tokens)
├─ Execution Plan
├─ Phase Details
├─ LLM Traces ← NEW
├─ Join Graph
├─ Verification Summary
└─ Data Lineage
```

**Visibility**: Always visible (both live and history modes), but empty until first LLM call completes.

---

## Sub-Task Decomposition

The Planner phase ALWAYS decomposes questions into ordered sub-tasks. This enables:

1. **Complex Multi-Step Analysis**: Break "Why is Houston underperforming?" into revenue calculation → comparison → variance decomposition → visualization
2. **Dependency Management**: Later steps depend on results from earlier steps (e.g., step 3 needs output from steps 1 and 2)
3. **Mixed Strategies**: Combine SQL queries with Python analysis in a coherent pipeline
4. **Incremental Progress**: SSE events show completion of individual steps
5. **Targeted Revisions**: Verifier can identify which step failed and route to appropriate phase

### Strategy Types

| Strategy | Description | Tool Usage | Example |
|----------|-------------|------------|---------|
| `sql` | Query database only | `query_database` | "Get monthly revenue per store" |
| `python` | Analyze/visualize using prior step results | `run_python` | "Create comparison chart from steps 1 and 2" |
| `sql_then_python` | Query then analyze | `query_database` → `run_python` | "Get revenue breakdown, then calculate variance drivers" |

### Dependency Resolution

The Executor respects `dependsOn` to ensure correct execution order:

```typescript
// Example sub-task list
steps: [
  { id: 1, dependsOn: [] },        // Execute first
  { id: 2, dependsOn: [1] },       // Execute after step 1 completes
  { id: 3, dependsOn: [1, 2] },    // Execute after steps 1 and 2 complete
  { id: 4, dependsOn: [3] },       // Execute after step 3 completes
]
```

Executor builds a dependency graph and processes steps in topological order, injecting prior step results as variables:

```python
# Inside Python sandbox for step 3 (depends on steps 1 and 2)
import pandas as pd
import json

step_1_data = pd.read_json(json.loads('''<step 1 result JSON>'''))
step_2_data = pd.read_json(json.loads('''<step 2 result JSON>'''))

# Now step 3 analysis code can reference step_1_data and step_2_data
```

---

## Conditional Routing

The graph has three conditional routing points:

### 1. Planner Routing

After Planner phase, route based on question type:

```typescript
function routeAfterPlanner(state: DataAgentStateType): 'navigator' | 'explainer' | '__end__' {
  // Clarification needed — terminate graph early
  if (state.plan?.shouldClarify && state.plan.clarificationQuestions?.length > 0) {
    return '__end__';
  }
  // Conversational — no data needed, answer directly
  if (state.plan?.complexity === 'conversational') {
    return 'explainer';
  }
  // ALL data queries go through Navigator (both simple and analytical)
  return 'navigator';
}
```

**Conversational examples**:
- "What does grain mean?"
- "Explain your last answer"
- "How should I interpret this metric?"

### 2. Navigator Gatekeeper

After Navigator phase, validate ontology coverage:

```typescript
function routeAfterNavigator(state: DataAgentStateType): 'sql_builder' | 'explainer' {
  if (state.cannotAnswer) {
    return 'explainer';  // Ontology can't support this query
  }
  return 'sql_builder';
}
```

Navigator sets `cannotAnswer` when ALL referenced datasets are missing from the ontology. Partial matches proceed with warnings.

### 3. Verifier Revision Loop

After Verifier phase, route based on validation result:

```typescript
function routeAfterVerification(state: DataAgentStateType): 'explainer' | 'navigator' | 'sql_builder' {
  const report = state.verificationReport;

  // Pass → explainer
  if (!report || report.passed) {
    return 'explainer';
  }

  // Fail but max revisions reached → explainer with caveats
  if (state.revisionCount >= 3) {
    return 'explainer';
  }

  // Fail → route to recommended target
  if (report.recommendedTarget === 'navigator') {
    return 'navigator';  // Join path issue, re-discover
  }
  return 'sql_builder';  // SQL logic issue, regenerate SQL
}
```

**Revision scenarios**:

| Issue Detected | Recommended Target | Action |
|----------------|-------------------|--------|
| Grain validation failed (duplicates) | `sql_builder` | Regenerate SQL with corrected GROUP BY |
| Join cardinality explosion | `navigator` | Re-discover join paths, avoid many-to-many |
| NULL critical fields | `sql_builder` | Add COALESCE or adjust WHERE clause |
| Empty result set | `navigator` | Broaden dataset selection |
| Row count suspiciously high | `sql_builder` | Add DISTINCT or adjust aggregation |

**Revision state tracking**:
- `revisionCount`: Incremented each time Verifier routes to Navigator or SQL Builder
- `revisionDiagnosis`: Human-readable explanation of what failed
- `revisionTarget`: Which phase to retry ('navigator' or 'sql_builder')

These fields are passed to the retried phase via state, allowing it to adjust behavior based on diagnosis.

---

## Ontology Guardrails

The Data Agent enforces the ontology as the absolute source of truth for all data queries. Multiple layers of guardrails ensure the agent never fabricates datasets, columns, or join paths.

### Core Principle

The Navigator is the **sole ontology gatekeeper**. Only the Navigator queries Neo4j and can authoritatively determine whether the ontology supports a query. The Planner sees only pre-fetched vector search results which may be incomplete.

### Guardrail Chain

| Phase | Guardrail | Type | Blocks? |
|-------|-----------|------|---------|
| **Navigator** | Post-validation: zero datasets found → `cannotAnswer` | Programmatic | **YES** — routes to Explainer |
| **Navigator** | Post-validation: missing join paths | Programmatic | No — warning in notes |
| **Navigator** | Prompt: "FORBIDDEN from inventing columns/joins" | Prompt-level | No |
| **Planner** | Prompt: "only reference listed datasets" | Prompt-level | No |
| **SQL Builder** | Prompt: "use ONLY YAML column names, ONLY ontology joins" | Prompt-level | No |
| **SQL Builder** | Column validation: `expectedColumns` vs YAML | Programmatic | No — warning in notes |
| **Executor** | Repair prompt: "use ONLY schema columns" | Prompt-level | No |

### CannotAnswer State

```typescript
interface CannotAnswerArtifact {
  reason: string;
  missingDatasets?: string[];
  missingJoins?: string[];
  availableDatasets?: string[];
}
```

When Navigator sets `cannotAnswer`, the graph routes to Explainer which generates a helpful refusal:
- Explains why the question can't be answered
- Lists available datasets in the ontology
- Suggests adding more tables to the semantic model

### Prompt Guardrails

Every phase prompt includes a mandatory "Ontology as Source of Truth" section:
- Navigator: FORBIDDEN from guessing column names, fabricating joins, using general SQL knowledge
- SQL Builder: Must use ONLY YAML column names and ontology join paths
- Executor: SQL repair must use ONLY columns from the schemas

---

## Clarifying Questions

### Overview

Before running the expensive multi-phase pipeline (Navigator, SQL Builder, Executor, Verifier), the Planner can decide to ask the user for clarification. This avoids wasting compute on queries where the intent is genuinely ambiguous, and produces better answers by gathering critical information upfront.

Clarification is only requested for true ambiguities that would significantly change the result. When reasonable defaults, prior conversation context, or stored user preferences can resolve uncertainty, the Planner proceeds without asking.

### How It Works

1. The Planner's structured output includes two new fields: `shouldClarify: boolean` and `clarificationQuestions: Array<{ question: string; assumption: string }>` (maximum 3 questions)
2. When `shouldClarify === true` and at least one question is present, the `routeAfterPlanner` function returns `__end__`, terminating the graph early without executing any further phases
3. The agent service emits a `clarification_requested` SSE event containing the questions array, then finalizes the assistant message with `status: 'clarification_needed'`
4. The frontend renders a `ClarificationCard` inline in the chat, displaying each question alongside its default assumption
5. The user responds via one of two actions:
   - **Answer**: Sends a new message composed of the original question plus the user's answers to each clarifying question
   - **Proceed with assumptions**: Sends a new message composed of the original question plus the list of default assumptions
6. On the next invocation, the Planner receives the clarification as part of its conversation context and proceeds through the full pipeline normally

### Planner Prompt Policy

The Planner system prompt instructs the LLM to ask for clarification ONLY when:
- There is a critical ambiguity that would materially change which datasets are queried, which metrics are computed, or how results are interpreted
- The ambiguity cannot be resolved from conversation history, dataset schemas, or stored user preferences
- The question is genuinely open-ended (not resolvable by a reasonable default assumption)

Examples of ambiguities that warrant clarification:
- "Analyze sales" — unclear time window when no prior context exists and multiple plausible windows exist
- "Compare regions" — unclear which regions are relevant when the dataset contains dozens

Examples that do NOT warrant clarification:
- "Show me top customers" — reasonable to default to revenue, last 12 months
- "Why is Houston underperforming?" — reasonable to default to revenue vs. peer stores comparison

### Updated PlanArtifact Fields

The `PlanArtifact` produced by the Planner gains two new optional fields:

```typescript
{
  complexity: 'simple' | 'analytical' | 'conversational',
  intent: string,
  metrics: string[],
  dimensions: string[],
  timeWindow: string | null,
  filters: string[],
  grain: string,
  ambiguities: Array<{ question: string; assumption: string }>,
  acceptanceChecks: string[],
  steps: Array<{
    id: number,
    description: string,
    strategy: 'sql' | 'python' | 'sql_then_python',
    dependsOn: number[],
    datasets: string[],
    expectedOutput: string,
  }>,
  // NEW FIELDS:
  shouldClarify: boolean,                           // true = terminate early and ask user
  clarificationQuestions: Array<{                   // max 3 questions
    question: string,                               // The question to ask the user
    assumption: string,                             // The default assumption if user proceeds without answering
  }>,
}
```

### Updated routeAfterPlanner Logic

```typescript
function routeAfterPlanner(state: DataAgentStateType): 'navigator' | 'executor' | '__end__' {
  const plan = state.plan;

  // Early termination: ask for clarification before running expensive pipeline
  if (plan?.shouldClarify && plan.clarificationQuestions?.length > 0) {
    return '__end__';
  }

  if (plan?.complexity === 'simple') {
    return 'executor';  // Skip Navigator, SQL Builder, Verifier
  }
  return 'navigator';   // Full analytical pipeline
}
```

### New Message Status

| Status | Description |
|--------|-------------|
| `clarification_needed` | The agent has paused and is waiting for user clarification before proceeding |

The assistant message is stored in the database with `status: 'clarification_needed'` and `content` set to a formatted representation of the questions. This allows the conversation history to reflect the clarification exchange.

### New SSE Event

```typescript
// Emitted when the Planner decides clarification is needed
event: clarification_requested
data: {
  type: 'clarification_requested',
  questions: Array<{
    question: string,   // The question for the user
    assumption: string, // Default assumption if user proceeds without answering
  }>
}
```

### Frontend: ClarificationCard

**Location**: `apps/web/src/components/data-agent/ClarificationCard.tsx`

Rendered inline within the chat message area when a `clarification_needed` message is received.

**Features**:
- Displays each question with its default assumption below
- "Answer" button: Opens a response textarea pre-populated with the original question, allowing the user to type answers before sending
- "Proceed with assumptions" button: Immediately sends a new message that includes the original question plus all default assumptions listed
- Visually distinct from regular assistant messages (uses an info-style card with a question mark icon)

**Props**:
```typescript
interface ClarificationCardProps {
  questions: Array<{ question: string; assumption: string }>;
  originalQuestion: string;
  onAnswer: (combinedMessage: string) => void;
  onProceed: (combinedMessage: string) => void;
  disabled?: boolean;  // True while a new response is generating
}
```

---

## User Preferences / Memory

### Overview

Users can store persistent preferences that are injected into the Planner and Explainer prompts on every invocation. Preferences accumulate over time, improving response quality and reducing the frequency of clarifying questions. Two scopes are supported:

- **Global preferences** (`ontology_id = NULL`): Apply across all conversations regardless of ontology
- **Ontology-scoped preferences** (`ontology_id = <uuid>`): Apply only to conversations using that specific ontology

When both a global and an ontology-scoped preference share the same key, the ontology-scoped value takes precedence.

### Database Table

**Table**: `data_agent_preferences`

```sql
CREATE TABLE data_agent_preferences (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ontology_id  UUID          REFERENCES ontologies(id) ON DELETE CASCADE,  -- NULL = global
  key          VARCHAR(255)  NOT NULL,
  value        TEXT          NOT NULL,
  source       VARCHAR(20)   NOT NULL DEFAULT 'manual',  -- 'manual' or 'auto_captured'
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, ontology_id, key)
);

CREATE INDEX idx_data_agent_preferences_user_id ON data_agent_preferences(user_id);
CREATE INDEX idx_data_agent_preferences_ontology_id ON data_agent_preferences(ontology_id);
```

**Columns**:

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK to `users`, CASCADE delete |
| `ontology_id` | UUID (nullable) | FK to `ontologies`, CASCADE delete. NULL = global scope |
| `key` | VARCHAR(255) | Preference name (e.g., `default_time_window`, `preferred_output_format`) |
| `value` | TEXT | Preference value (e.g., `last 12 months`, `bullet points`) |
| `source` | VARCHAR(20) | `manual` (user-created) or `auto_captured` (saved from clarification answer) |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

**Unique constraint**: `(user_id, ontology_id, key)` — one value per key per user per scope. NULL ontology_id is treated as a distinct value by PostgreSQL, so a user can have both a global and an ontology-scoped preference with the same key.

### Effective Preference Resolution

When the agent executes, it loads all preferences for the current user and combines them:

```typescript
// 1. Load global preferences (ontologyId = null)
const globalPrefs = await prisma.dataAgentPreference.findMany({
  where: { userId, ontologyId: null },
});

// 2. Load ontology-scoped preferences
const ontologyPrefs = await prisma.dataAgentPreference.findMany({
  where: { userId, ontologyId },
});

// 3. Merge: ontology-scoped overrides global for same key
const effectivePrefs = new Map(globalPrefs.map(p => [p.key, p.value]));
for (const pref of ontologyPrefs) {
  effectivePrefs.set(pref.key, pref.value);
}
```

The resulting merged map is passed to both `buildPlannerPrompt()` and `buildExplainerPrompt()`.

### Prompt Injection

Preferences are injected as a "User Preferences" section in the system prompts for two phases:

**Planner prompt injection**:
```
## User Preferences

The following preferences have been stored by the user. Use them to:
- Avoid unnecessary clarifying questions (treat these as resolved ambiguities)
- Inform which datasets, time windows, or metrics to prioritize
- Apply any formatting or output preferences to your plan

Preferences:
- default_time_window: last 12 months
- preferred_grain: monthly
- currency_format: USD millions
```

**Explainer prompt injection**:
```
## User Preferences

Apply the following user preferences when formatting your narrative response:
- preferred_output_format: bullet points with a summary table
- chart_preference: bar charts for comparisons, line charts for trends
```

### API Endpoints

All endpoints are under `/api/data-agent/preferences` and require `data_agent:read` or `data_agent:write` permission.

#### GET /api/data-agent/preferences

List preferences for the current user.

**Query Parameters**:
- `ontologyId` (UUID, optional): Filter by ontology. Omit to include all scopes.
- `scope` (enum: `global` | `ontology` | `all`, default: `all`): Filter by scope. `global` returns only null-ontologyId preferences; `ontology` requires `ontologyId` parameter.

**Response (200)**:
```json
{
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "ontologyId": null,
      "key": "default_time_window",
      "value": "last 12 months",
      "source": "manual",
      "createdAt": "2026-02-01T10:00:00Z",
      "updatedAt": "2026-02-01T10:00:00Z"
    },
    {
      "id": "uuid",
      "userId": "uuid",
      "ontologyId": "uuid",
      "key": "preferred_grain",
      "value": "monthly",
      "source": "auto_captured",
      "createdAt": "2026-02-05T14:30:00Z",
      "updatedAt": "2026-02-05T14:30:00Z"
    }
  ]
}
```

#### POST /api/data-agent/preferences

Create or upsert a preference. If a preference with the same `(userId, ontologyId, key)` already exists, its value is updated (upsert behavior).

**Permission**: `data_agent:write`

**Request Body**:
```json
{
  "ontologyId": "uuid",       // Optional: null or omit for global scope
  "key": "default_time_window",
  "value": "last 12 months",
  "source": "manual"          // Optional: defaults to 'manual'
}
```

**Response (201)**:
```json
{
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "ontologyId": "uuid",
    "key": "default_time_window",
    "value": "last 12 months",
    "source": "manual",
    "createdAt": "2026-02-01T10:00:00Z",
    "updatedAt": "2026-02-01T10:00:00Z"
  }
}
```

#### PATCH /api/data-agent/preferences/:id

Update the value of a specific preference.

**Permission**: `data_agent:write` (owner only)

**Request Body**:
```json
{
  "value": "last 6 months"
}
```

**Response (200)**: Updated preference object.

#### DELETE /api/data-agent/preferences/:id

Delete a single preference by ID.

**Permission**: `data_agent:write` (owner only)

**Response (204)**: No content.

#### DELETE /api/data-agent/preferences

Clear preferences in bulk.

**Permission**: `data_agent:write`

**Query Parameters**:
- `ontologyId` (UUID, optional): Clear only preferences scoped to this ontology. Omit to clear ALL preferences for the current user (global + all ontology-scoped).

**Response (204)**: No content.

### Auto-Capture from Clarifications

When the user answers a clarifying question, the agent can automatically save that answer as an ontology-scoped preference to avoid asking the same question in future conversations. This behavior is controlled by the `auto_capture_mode` global preference (stored with key `auto_capture_mode`):

| Value | Behavior |
|-------|----------|
| `off` | Never auto-capture. Clarification answers are used only for the current query. |
| `auto` (default) | Automatically save clarification answers as ontology-scoped preferences with `source: 'auto_captured'`. Emits `preference_auto_saved` SSE event so the user sees a snackbar notification. |
| `ask` | Emit `preference_suggested` SSE event for each potential preference. The frontend shows a `PreferenceSuggestionBanner` with per-suggestion Save/Dismiss actions. |

**Auto-capture key naming**: The agent derives a preference key from the clarifying question using a simple slug (e.g., "What time window should I use for analysis?" → `default_time_window`). The Planner prompt provides the mapping from clarification question to preference key.

### Cascade Delete Behavior

- When an **ontology is deleted**, all preferences scoped to that ontology (`ontology_id = <ontology_uuid>`) are automatically removed via the database `ON DELETE CASCADE` constraint.
- When a **user is deleted**, all preferences belonging to that user are automatically removed.
- **Global preferences are never affected** by ontology deletion.

### New SSE Events

Three new SSE events are added to support the preferences feature:

```typescript
// Emitted in 'ask' mode when clarification answers could be saved as preferences
event: preference_suggested
data: {
  type: 'preference_suggested',
  suggestions: Array<{
    key: string,       // Preference key (e.g., 'default_time_window')
    value: string,     // Suggested preference value (user's answer)
    question: string,  // The original clarifying question this answers
  }>
}

// Emitted in 'auto' mode when preferences have been automatically saved
event: preference_auto_saved
data: {
  type: 'preference_auto_saved',
  preferences: Array<{
    key: string,    // Saved preference key
    value: string,  // Saved preference value
  }>
}
```

### Frontend UI

#### PreferencesDialog

**Location**: `apps/web/src/components/data-agent/PreferencesDialog.tsx`

Accessible via a Tune icon button in the chat header area (next to the ModelSelector or chat name).

**Features**:
- **Two tabs**: Global and Ontology (the ontology tab is only shown when a chat with an associated ontology is active)
- **Auto-capture mode toggle**: Switch between `off`, `auto`, and `ask` modes. Displayed as a labeled toggle group at the top of the dialog.
- **Preference list**: Each preference shown as a row with key, value, source badge (`manual` or `auto`), and Delete action
- **Add preference form**: Inline form with key and value text fields + Save button
- **Edit preference**: Click on a preference value to edit it inline

**Props**:
```typescript
interface PreferencesDialogProps {
  open: boolean;
  onClose: () => void;
  ontologyId: string | null;  // null when no active ontology
}
```

#### PreferenceSuggestionBanner

**Location**: `apps/web/src/components/data-agent/PreferenceSuggestionBanner.tsx`

Shown below a completed assistant message when a `preference_suggested` SSE event is received (only in `ask` mode).

**Features**:
- Displays a compact banner with each suggested preference key and value
- Per-suggestion **Save** and **Dismiss** buttons
- Dismissed suggestions are removed from the banner; saved suggestions trigger a `POST /api/data-agent/preferences` call
- The banner disappears when all suggestions are either saved or dismissed

**Props**:
```typescript
interface PreferenceSuggestionBannerProps {
  suggestions: Array<{ key: string; value: string; question: string }>;
  ontologyId: string;
  onSave: (key: string, value: string) => Promise<void>;
  onDismiss: (key: string) => void;
}
```

#### Snackbar Notification (preference_auto_saved)

When `preference_auto_saved` is received in `auto` mode, the `useDataChat` hook triggers a snackbar notification (via MUI `Snackbar` + `Alert`) listing the keys that were saved. The snackbar auto-dismisses after 5 seconds.

**Example notification text**: "2 preferences saved: default_time_window, preferred_grain"

---

## State Schema

The agent uses LangGraph `Annotation.Root` state following the pattern from `apps/api/src/semantic-models/agent/state.ts`:

```typescript
import { Annotation } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';

export const DataAgentState = Annotation.Root({
  // ─── Inputs (set once at invocation) ───
  userQuestion: Annotation<string>,
  chatId: Annotation<string>,
  messageId: Annotation<string>,
  userId: Annotation<string>,
  ontologyId: Annotation<string>,
  connectionId: Annotation<string>,
  databaseType: Annotation<string>,
  conversationContext: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),
  relevantDatasets: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // ─── Pre-fetched Dataset Details (with YAML) ───
  relevantDatasetDetails: Annotation<Array<{ name: string; description: string; source: string; yaml: string }>>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // ─── Phase Artifacts ───
  plan: Annotation<PlanArtifact | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  joinPlan: Annotation<JoinPlanArtifact | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  querySpecs: Annotation<QuerySpec[] | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  stepResults: Annotation<StepResult[] | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  verificationReport: Annotation<VerificationReport | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  explainerOutput: Annotation<ExplainerOutput | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // ─── Control Flow ───
  currentPhase: Annotation<DataAgentPhase | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  revisionCount: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),
  revisionDiagnosis: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  revisionTarget: Annotation<'navigator' | 'sql_builder' | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // ─── Tracking ───
  toolCalls: Annotation<TrackedToolCall[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  tokensUsed: Annotation<{ prompt: number; completion: number; total: number }>({
    reducer: (prev, next) => ({
      prompt: prev.prompt + next.prompt,
      completion: prev.completion + next.completion,
      total: prev.total + next.total,
    }),
    default: () => ({ prompt: 0, completion: 0, total: 0 }),
  }),
  error: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // ─── Navigator Messages (for mini-ReAct loop) ───
  messages: Annotation<BaseMessage[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
});

export type DataAgentStateType = typeof DataAgentState.State;
```

### Key State Fields

| Field | Type | Purpose |
|-------|------|---------|
| `plan` | `PlanArtifact` | Planner output: sub-task decomposition |
| `relevantDatasetDetails` | `Array<{name, description, source, yaml}>` | Pre-fetched YAML schemas for vector-matched datasets |
| `joinPlan` | `JoinPlanArtifact` | Navigator output: datasets + join paths |
| `querySpecs` | `QuerySpec[]` | SQL Builder output: SQL per sub-task |
| `stepResults` | `StepResult[]` | Executor output: results per sub-task |
| `verificationReport` | `VerificationReport` | Verifier output: pass/fail + diagnosis |
| `explainerOutput` | `ExplainerOutput` | Explainer output: narrative + lineage |
| `revisionCount` | `number` | Tracks revision loop iterations |
| `revisionDiagnosis` | `string` | Why verification failed |
| `revisionTarget` | `'navigator' \| 'sql_builder'` | Which phase to retry |
| `toolCalls` | `TrackedToolCall[]` | Accumulator: all tool calls with phase + stepId |
| `messages` | `BaseMessage[]` | Accumulator: Navigator mini-ReAct messages |

---

## Tool Definitions

All tools rebuilt from scratch for multi-phase architecture. Each tool is allocated to specific phases.

### Tool 1: `list_datasets`

**Phase**: Navigator

**Purpose**: Discover available datasets in the ontology.

**Arguments**:
```typescript
{
  ontologyId: string,
}
```

**Returns**: List of dataset names.

**Implementation**:
```typescript
// Calls NeoOntologyService.listDatasets(ontologyId)
// Cypher: MATCH (d:Dataset {ontologyId: $ontologyId}) RETURN d.name
```

---

### Tool 2: `get_dataset_details`

**Phases**: Navigator, SQL Builder

**Purpose**: Get full schema (fields, descriptions, sample values) for a dataset.

**Arguments**:
```typescript
{
  datasetName: string,
  ontologyId: string,
}
```

**Returns**: YAML-formatted schema with field names, descriptions, types, sample values.

**Implementation**:
```typescript
// Calls NeoOntologyService.getDatasetAsYaml(ontologyId, datasetName)
// Returns OSI-format dataset definition
```

---

### Tool 3: `get_relationships`

**Phase**: Navigator

**Purpose**: Get ALL RELATES_TO edges in the ontology (for join path discovery).

**Arguments**:
```typescript
{
  ontologyId: string,
}
```

**Returns**: List of relationship edges with from/to dataset names and column mappings.

**Implementation**:
```typescript
// NEW tool, calls NeoOntologyService.getAllRelationships(ontologyId)
// Cypher:
// MATCH (from:Dataset {ontologyId: $ontologyId})-[r:RELATES_TO]->(to:Dataset {ontologyId: $ontologyId})
// RETURN from.name, to.name, r.name, r.fromColumns, r.toColumns
```

---

### Tool 4: `get_sample_data`

**Phases**: SQL Builder, Executor

**Purpose**: Fetch sample rows (LIMIT 10) from a table.

**Arguments**:
```typescript
{
  tableName: string,
  connectionId: string,
  limit?: number,  // default: 10
}
```

**Returns**: JSON array of sample rows.

**Implementation**:
```typescript
// Calls DiscoveryService.executeSampleQuery(connectionId, tableName, limit)
// Executes: SELECT * FROM <schema>.<table> LIMIT 10
```

---

### Tool 5: `query_database`

**Phase**: Executor

**Purpose**: Execute SQL query (pilot or full) with 30s timeout and SELECT-only enforcement.

**Arguments**:
```typescript
{
  sql: string,
  connectionId: string,
  maxRows?: number,  // default: 1000
}
```

**Returns**: `{ rows: any[], rowCount: number, columns: string[] }`

**Implementation**:
```typescript
// Calls DiscoveryService.executeQuery(connectionId, sql, maxRows, timeout: 30000)
// Validates SQL is SELECT-only (no INSERT/UPDATE/DELETE/DROP)
// Enforces 30s timeout
// Truncates result to maxRows
```

**Safety**:
- Read-only enforcement via SQL regex validation
- Connection pool isolation (cannot access other users' connections)
- Query timeout (30s hard limit)
- Result size limit (maxRows parameter)

---

### Tool 6: `run_python`

**Phases**: Executor, Verifier, Explainer

**Purpose**: Execute Python code in isolated Docker sandbox with data injection.

**Arguments**:
```typescript
{
  code: string,
  data?: Record<string, any>,  // Injected as variables
  timeout?: number,  // default: 30s
}
```

**Returns**: `{ stdout: string, stderr: string, charts: string[], error?: string }`

**Implementation**:
```typescript
// Calls SandboxService.executeCode(code, data, timeout)
// POSTs to Docker sandbox Flask API: http://sandbox:5000/execute
// Sandbox runs code in isolated process with 512MB memory limit
// Pre-installed packages: pandas, numpy, matplotlib, seaborn, scipy, scikit-learn
// Charts saved to /tmp/*.png and returned as base64-encoded strings
```

**Safety**:
- No network access (--network none in Docker)
- Read-only filesystem except /tmp
- 512MB memory limit
- 30s execution timeout
- No file system access beyond /tmp
- Cannot access environment variables or secrets

---

## SSE Streaming

The agent streams execution progress via Server-Sent Events (SSE) using the same `AgentStreamController` pattern as semantic models.

### SSE Event Types

| Event Type | Payload | Emitted By | Description |
|------------|---------|------------|-------------|
| `message_start` | `{ messageId, chatId }` | Stream controller | Message generation started |
| `message_chunk` | `{ chunk: string }` | Explainer | Streaming narrative chunks (if streaming enabled) |
| `message_complete` | `{ messageId, metadata }` | Stream controller | Message generation complete |
| `message_error` | `{ error: string, code: string }` | Stream controller | Fatal error occurred |
| `phase_start` | `{ phase: string, description: string }` | All phase nodes | Phase execution started |
| `phase_complete` | `{ phase: string }` | All phase nodes | Phase execution complete |
| `phase_artifact` | `{ phase: string, artifact: object }` | All phase nodes | Structured phase output |
| `step_start` | `{ stepId: number, description: string, strategy: string }` | Executor | Sub-task execution started |
| `step_complete` | `{ stepId: number }` | Executor | Sub-task execution complete |
| `tool_start` | `{ phase: string, stepId?: number, name: string, args: object }` | All phases | Tool call started |
| `tool_end` | `{ phase: string, stepId?: number, name: string, result: string }` | All phases | Tool call complete |
| `tool_error` | `{ phase: string, stepId?: number, name: string, error: string }` | All phases | Tool call failed |
| `token_update` | `{ phase: string, tokensUsed: { prompt: number, completion: number, total: number } }` | All phase nodes | Per-phase token usage report |
| `llm_call_start` | `{ phase, callIndex, stepId?, purpose, provider, model, structuredOutput, promptSummary }` | All phase nodes | LLM call started |
| `llm_call_end` | `{ phase, callIndex, stepId?, purpose, durationMs, promptTokens, completionTokens, totalTokens, responsePreview, toolCallCount }` | All phase nodes | LLM call completed |
| `clarification_requested` | `{ questions: Array<{ question: string, assumption: string }> }` | Planner (via agent service) | Agent needs user clarification before proceeding |
| `preference_suggested` | `{ suggestions: Array<{ key: string, value: string, question: string }> }` | Agent service (ask mode) | Preferences suggested for user to save |
| `preference_auto_saved` | `{ preferences: Array<{ key: string, value: string }> }` | Agent service (auto mode) | Preferences automatically saved from clarification |

### SSE Event Examples

```typescript
// Phase start
event: phase_start
data: {"phase":"planner","description":"Decomposing question into sub-tasks"}

// Phase artifact (structured output)
event: phase_artifact
data: {"phase":"planner","artifact":{"complexity":"analytical","intent":"...","steps":[...]}}

// Phase complete
event: phase_complete
data: {"phase":"planner"}

// Step start (from executor)
event: step_start
data: {"stepId":1,"description":"Get monthly revenue per store","strategy":"sql"}

// Tool call (with phase and stepId)
event: tool_start
data: {"phase":"executor","stepId":1,"name":"query_database","args":{"sql":"SELECT ...","connectionId":"..."}}

event: tool_end
data: {"phase":"executor","stepId":1,"name":"query_database","result":"100 rows returned"}

// Step complete
event: step_complete
data: {"stepId":1}

// Verification event
event: phase_artifact
data: {"phase":"verifier","artifact":{"passed":true,"checks":[{"name":"Grain validation","passed":true,"message":"No duplicates at store-month level"}]}}

// Final message complete
event: message_complete
data: {"messageId":"uuid","metadata":{"toolCalls":[...],"tokensUsed":{...},"plan":{...},"verificationReport":{...},"dataLineage":{...}}}
```

### Frontend SSE Parsing

The `useDataChat.ts` hook parses SSE events using `fetch()` + `ReadableStream`:

```typescript
const response = await fetch(`/api/data-agent/stream/${messageId}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ chatId, question }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = JSON.parse(line.slice(6));
      handleEvent(data);  // Dispatch to state reducers
    }
  }
}
```

### Phase Progress Tracking

The frontend maintains phase progress state:

```typescript
const [phaseProgress, setPhaseProgress] = useState({
  current: null,
  completed: [],
  phases: ['planner', 'navigator', 'sql_builder', 'executor', 'verifier', 'explainer'],
});

function handleEvent(event: DataAgentStreamEvent) {
  if (event.type === 'phase_start') {
    setPhaseProgress(prev => ({ ...prev, current: event.phase }));
  }
  if (event.type === 'phase_complete') {
    setPhaseProgress(prev => ({
      ...prev,
      current: null,
      completed: [...prev.completed, event.phase],
    }));
  }
}
```

---

## Message Metadata

All phase artifacts and tracking data are stored in `data_chat_messages.metadata` JSONB column:

```typescript
interface DataAgentMessageMetadata {
  // Tool execution tracking (extended with phase + stepId)
  toolCalls: Array<{
    phase: string,              // 'planner' | 'navigator' | 'sql_builder' | 'executor' | 'verifier' | 'explainer'
    stepId?: number,            // Only for executor tools
    name: string,
    args: Record<string, any>,
    result?: string,            // Truncated to 2000 chars
  }>;

  // Token usage
  tokensUsed: {
    prompt: number;
    completion: number;
    total: number;
  };

  // Timing
  startedAt?: number;   // Timestamp (ms) when generation started
  durationMs?: number;  // Total elapsed time in milliseconds

  // Dataset references
  datasetsUsed: string[];

  // Phase artifacts (NEW)
  plan?: PlanArtifact;                      // Sub-task decomposition
  joinPlan?: JoinPlanArtifact;              // Discovered join paths
  stepResults?: StepResult[];               // Execution results per sub-task
  verificationReport?: {                    // Validation status
    passed: boolean;
    checks: Array<{ name: string; passed: boolean; message: string }>;
  };
  dataLineage?: {                           // Final data lineage
    datasets: string[];
    joins: Array<{ from: string; to: string; on: string }>;
    timeWindow: string | null;
    filters: string[];
    grain: string;
    rowCount: number | null;
  };

  // Revision tracking (NEW)
  revisionsUsed: number;

  // Error tracking
  error?: {
    message: string;
    code: string;
    timestamp: string;
  };

  // Execution state
  claimed?: boolean;

  // Clarification state (when status = 'clarification_needed')
  clarificationQuestions?: Array<{
    question: string;
    assumption: string;
  }>;
}
```

### Metadata Usage

1. **Conversation Context**: Last 10 messages' metadata used to build context for Planner
2. **Data Lineage Display**: Frontend shows `dataLineage` in message footer
3. **Verification Badge**: Frontend shows checkmark or warning icon based on `verificationReport.passed`
4. **Tool Call Inspection**: ToolCallAccordion groups tools by `phase` and `stepId`
5. **Debugging**: Full execution trace available in metadata for troubleshooting

---

## Database Schema

### Prisma Models

Located in `apps/api/prisma/schema.prisma`:

```prisma
model DataChat {
  id          String            @id @default(uuid()) @db.Uuid
  name        String            @db.VarChar(255)
  ontologyId  String            @map("ontology_id") @db.Uuid
  ownerId     String            @map("owner_id") @db.Uuid
  llmProvider String?           @map("llm_provider") @db.VarChar(50)  // Selected LLM provider (openai, anthropic, azure). Null = system default.
  createdAt   DateTime          @default(now()) @map("created_at") @db.Timestamptz
  updatedAt   DateTime          @updatedAt @map("updated_at") @db.Timestamptz

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
  metadata  Json?    // Extended with phase artifacts and clarification questions
  status    String   @default("complete") @db.VarChar(20)  // 'generating', 'complete', 'failed', 'clarification_needed'
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz

  // Relations
  chat DataChat @relation("ChatMessages", fields: [chatId], references: [id], onDelete: Cascade)

  @@index([chatId])
  @@index([createdAt])
  @@map("data_chat_messages")
}

model DataAgentPreference {
  id         String    @id @default(uuid()) @db.Uuid
  userId     String    @map("user_id") @db.Uuid
  ontologyId String?   @map("ontology_id") @db.Uuid  // null = global scope
  key        String    @db.VarChar(255)
  value      String    @db.Text
  source     String    @default("manual") @db.VarChar(20)  // 'manual' or 'auto_captured'
  createdAt  DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt  DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  // Relations
  user     User      @relation("UserDataAgentPreferences", fields: [userId], references: [id], onDelete: Cascade)
  ontology Ontology? @relation("OntologyDataAgentPreferences", fields: [ontologyId], references: [id], onDelete: Cascade)

  @@unique([userId, ontologyId, key])
  @@index([userId])
  @@index([ontologyId])
  @@map("data_agent_preferences")
}
```

The `DataAgentPreference` model requires a new migration. The `DataChatMessage.status` column gains the `clarification_needed` value (no migration required — the column is a plain VARCHAR with no database-level enum constraint).

---

## API Endpoints

All endpoints require authentication. Base path: `/api/data-agent`

### 1. List Data Chats

```http
GET /api/data-agent/chats
```

**Query Parameters:**
- `page` (number, default: 1)
- `pageSize` (number, default: 20)
- `search` (string, optional)
- `ontologyId` (UUID, optional)
- `sortBy` (enum, default: 'updatedAt')
- `sortOrder` (enum, default: 'desc')

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
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "totalItems": 45,
      "totalPages": 3
    }
  }
}
```

---

### 2. Create Data Chat

```http
POST /api/data-agent/chats
```

**Permission:** `data_agent:write`

**Request Body:**
```json
{
  "name": "Sales Analysis Q4 2025",
  "ontologyId": "uuid",
  "llmProvider": "openai"  // Optional: openai | anthropic | azure. Null = system default.
}
```

**Response (201):**
```json
{
  "data": {
    "id": "uuid",
    "name": "Sales Analysis Q4 2025",
    "ontologyId": "uuid",
    "ownerId": "uuid",
    "llmProvider": "openai",
    "createdAt": "2025-01-15T10:00:00Z",
    "updatedAt": "2025-01-15T10:00:00Z"
  }
}
```

---

### 3. Get Data Chat

```http
GET /api/data-agent/chats/:chatId
```

**Permission:** `data_agent:read` (owner only)

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
    "messageCount": 12
  }
}
```

---

### 4. Update Data Chat

```http
PATCH /api/data-agent/chats/:chatId
```

**Permission:** `data_agent:write` (owner only)

**Request Body:**
```json
{
  "name": "Updated Chat Name",
  "llmProvider": "anthropic"  // Optional: change provider mid-conversation. Null = clear and use system default.
}
```

**Response (200):**
```json
{
  "data": {
    "id": "uuid",
    "name": "Updated Chat Name",
    "ontologyId": "uuid",
    "ownerId": "uuid",
    "llmProvider": "anthropic",
    "createdAt": "2025-01-15T10:00:00Z",
    "updatedAt": "2025-01-15T15:00:00Z"
  }
}
```

---

### 5. Delete Data Chat

```http
DELETE /api/data-agent/chats/:chatId
```

**Permission:** `data_agent:delete` (owner only)

**Response (204):** No content

---

### 6. List Messages

```http
GET /api/data-agent/chats/:chatId/messages
```

**Query Parameters:**
- `page` (number, default: 1)
- `pageSize` (number, default: 50)

**Permission:** `data_agent:read` (owner only)

**Response (200):**
```json
{
  "data": {
    "items": [
      {
        "id": "uuid",
        "chatId": "uuid",
        "role": "user",
        "content": "What were the top selling products last month?",
        "metadata": null,
        "status": "complete",
        "createdAt": "2025-01-15T10:00:00Z"
      },
      {
        "id": "uuid",
        "chatId": "uuid",
        "role": "assistant",
        "content": "Based on the analysis...",
        "metadata": {
          "toolCalls": [...],
          "tokensUsed": {...},
          "datasetsUsed": ["orders", "products"],
          "plan": {...},
          "verificationReport": { "passed": true, "checks": [...] },
          "dataLineage": {...},
          "revisionsUsed": 0
        },
        "status": "complete",
        "createdAt": "2025-01-15T10:01:30Z"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 50,
      "totalItems": 12,
      "totalPages": 1
    }
  }
}
```

---

### 7. Send Message (SSE Streaming)

```http
POST /api/data-agent/stream/:messageId
```

**Permission:** `data_agent:write` (owner only)

**Request Body:**
```json
{
  "chatId": "uuid",
  "question": "What were the top selling products last month?"
}
```

**Response (200):** SSE stream (see SSE Streaming section for event types)

**Flow:**
1. Frontend creates message with status='generating'
2. POST to `/api/data-agent/stream/:messageId`
3. Backend executes StateGraph and streams phase/step/tool events
4. Frontend updates UI in real-time
5. On completion, message status set to 'complete' with full metadata. If clarification is needed, status is set to 'clarification_needed' and the stream ends after emitting `clarification_requested`

---

### 8. List Preferences

```http
GET /api/data-agent/preferences
```

**Permission:** `data_agent:read`

**Query Parameters:**
- `ontologyId` (UUID, optional): Filter to a specific ontology scope
- `scope` (enum: `global` | `ontology` | `all`, default: `all`): Scope filter. `ontology` requires `ontologyId`.

**Response (200):**
```json
{
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "ontologyId": null,
      "key": "default_time_window",
      "value": "last 12 months",
      "source": "manual",
      "createdAt": "2026-02-01T10:00:00Z",
      "updatedAt": "2026-02-01T10:00:00Z"
    }
  ]
}
```

---

### 9. Create or Upsert Preference

```http
POST /api/data-agent/preferences
```

**Permission:** `data_agent:write`

**Request Body:**
```json
{
  "ontologyId": "uuid",
  "key": "default_time_window",
  "value": "last 12 months",
  "source": "manual"
}
```

**Response (201):** Created or updated preference object.

---

### 10. Update Preference

```http
PATCH /api/data-agent/preferences/:id
```

**Permission:** `data_agent:write` (owner only)

**Request Body:**
```json
{
  "value": "last 6 months"
}
```

**Response (200):** Updated preference object.

---

### 11. Delete Preference

```http
DELETE /api/data-agent/preferences/:id
```

**Permission:** `data_agent:write` (owner only)

**Response (204):** No content.

---

### 12. Clear Preferences (Bulk)

```http
DELETE /api/data-agent/preferences
```

**Permission:** `data_agent:write`

**Query Parameters:**
- `ontologyId` (UUID, optional): Clear only preferences for this ontology. Omit to clear ALL preferences (global + all ontology-scoped) for the current user.

**Response (204):** No content.

---

## Security

### Authentication & Authorization

- All endpoints require JWT authentication
- Chat ownership enforced (users can only access their own chats)
- RBAC permissions: `data_agent:read`, `data_agent:write`, `data_agent:delete`
- Ontology access validated (user must have `ontologies:read` permission for ontologyId)

### SQL Injection Prevention

- All SQL queries executed via parameterized queries (Prisma, pg driver)
- User-provided SQL is NOT parameterized (agent generates raw SQL)
- SQL validation enforces SELECT-only (regex check for INSERT/UPDATE/DELETE/DROP)
- Connection pool isolation (agent can only access connectionId owned by userId)

### Python Sandbox Security

- Isolated Docker container with no network access (`--network none`)
- Read-only filesystem except `/tmp`
- 512MB memory limit
- 30s execution timeout
- No environment variables or secrets passed to sandbox
- Pre-installed packages only (no pip install)

### Neo4j Security

- All Cypher queries scoped to `ontologyId` (namespace isolation)
- No WRITE operations (read-only graph access)
- Graph access validated (user must own ontology)

### Rate Limiting

- SSE streaming endpoint limited to 1 concurrent request per user
- Atomic claim check prevents duplicate agent execution for same messageId
- Tool execution timeouts prevent infinite loops

---

## RBAC Permissions

### Data Agent Permissions

| Permission | Roles | Description |
|------------|-------|-------------|
| `data_agent:read` | Viewer, Contributor, Admin | View own chats, messages, and preferences |
| `data_agent:write` | Contributor, Admin | Create chats, send messages, manage preferences |
| `data_agent:delete` | Contributor, Admin | Delete own chats |

### Dependency Permissions

Data Agent requires access to related resources:

| Permission | Required For |
|------------|--------------|
| `ontologies:read` | Load ontology for chat creation |
| `connections:read` | Access database connection for query execution |
| `semantic_models:read` | Optional: view source semantic model |

---

## Embedding Service

The `EmbeddingService` generates vector embeddings for dataset descriptions to enable semantic search.

### Provider Support

Currently supports **OpenAI** only:
- Model: `text-embedding-3-small` (1536 dimensions)
- Configuration: `OPENAI_API_KEY` environment variable

### Usage

```typescript
const embedding = await embeddingService.generateEmbedding(text);
// Returns: number[] (1536 dimensions)
```

### Integration

1. **Ontology Creation**: When semantic model is converted to ontology, dataset descriptions are embedded
2. **Vector Index**: Embeddings stored in Neo4j Dataset nodes with vector index
3. **Query Time**: User question is embedded and vector similarity search finds top 10 relevant datasets
4. **Context Injection**: Relevant dataset names passed to Planner as `relevantDatasets`; full YAML schemas pre-fetched via `NeoOntologyService.getDatasetsByNames()` and passed as `relevantDatasetDetails`

---

## Neo4j Vector Search

The `NeoVectorService` manages vector indexes and performs similarity search on ontology graphs.

### Vector Index Creation

When an ontology is created, a vector index is created on Dataset nodes:

```cypher
CREATE VECTOR INDEX dataset_embedding_idx IF NOT EXISTS
FOR (d:Dataset)
ON d.embedding
OPTIONS {
  indexConfig: {
    `vector.dimensions`: 1536,
    `vector.similarity_function`: 'cosine'
  }
}
```

### Similarity Search

At query time, the user question is embedded and top-K similar datasets are retrieved:

```cypher
CALL db.index.vector.queryNodes(
  'dataset_embedding_idx',
  $topK,
  $queryEmbedding
)
YIELD node, score
WHERE node.ontologyId = $ontologyId
RETURN node.name, node.description, node.source, score
ORDER BY score DESC
```

### Relationship Navigation (NEW)

Multi-phase architecture adds graph navigation for join path discovery:

```cypher
-- Get all RELATES_TO edges (for Navigator)
MATCH (from:Dataset {ontologyId: $ontologyId})-[r:RELATES_TO]->(to:Dataset {ontologyId: $ontologyId})
RETURN from.name, to.name, r.name, r.fromColumns, r.toColumns

-- Find shortest join path between two datasets (for Navigator)
MATCH (start:Dataset {ontologyId: $ontologyId, name: $fromDataset}),
      (end:Dataset {ontologyId: $ontologyId, name: $toDataset}),
      path = shortestPath((start)-[:RELATES_TO*..5]-(end))
RETURN [n IN nodes(path) | n.name] AS pathNames,
       [r IN relationships(path) | {
         from: startNode(r).name,
         to: endNode(r).name,
         fromColumns: r.fromColumns,
         toColumns: r.toColumns,
         name: r.name
       }] AS rels
LIMIT 3
```

---

## Docker Python Sandbox

The `SandboxService` executes Python code in an isolated Docker container for data analysis and visualization.

### Sandbox Architecture

- **Image**: `knecta-data-agent-sandbox` (Flask-based)
- **Runtime**: Docker container with 512MB memory limit
- **Network**: No network access (`--network none`)
- **Filesystem**: Read-only except `/tmp`
- **Process Isolation**: Each execution runs in a separate subprocess

### Pre-installed Packages

- `pandas`, `numpy` - Data manipulation
- `matplotlib`, `seaborn` - Visualization
- `scipy`, `scikit-learn` - Statistical analysis
- `json`, `base64` - Serialization

### API Endpoint

```http
POST http://sandbox:5000/execute
Content-Type: application/json

{
  "code": "import pandas as pd\nprint(df.head())",
  "data": {
    "df": [{"col1": 1, "col2": 2}]
  },
  "timeout": 30
}
```

**Response:**
```json
{
  "stdout": "   col1  col2\n0     1     2",
  "stderr": "",
  "charts": [],  // base64-encoded PNG strings
  "error": null
}
```

### Chart Generation

Code can generate charts by saving to `/tmp/*.png`:

```python
import matplotlib.pyplot as plt
import pandas as pd

df = pd.DataFrame(data)
df.plot(kind='bar')
plt.savefig('/tmp/chart.png')
```

The sandbox Flask app scans `/tmp/` after execution and returns all `.png` files as base64-encoded strings.

### Security

- No access to host filesystem
- No environment variables
- No network access (cannot download packages or call APIs)
- Memory limit enforced by Docker (`--memory=512m`)
- Execution timeout (default 30s, configurable)

---

## Frontend Components

### PhaseIndicator (NEW)

MUI Stepper component showing 6-phase progress.

**Location**: `apps/web/src/components/data-agent/PhaseIndicator.tsx`

**Props**:
```typescript
{
  currentPhase: string | null,
  completedPhases: string[],
  phases: string[],  // ['planner', 'navigator', 'sql_builder', 'executor', 'verifier', 'explainer']
}
```

**Rendering**:
- Active step: `currentPhase`
- Completed steps: checkmark icon
- Pending steps: gray
- Updates in real-time as SSE events arrive

---

### AgentInsightsPanel (NEW)

Right-side panel showing real-time and historical agent execution details.

**Location**: `apps/web/src/components/data-agent/AgentInsightsPanel.tsx`

**Props**:
```typescript
interface AgentInsightsPanelProps {
  messages: DataChatMessage[];
  streamEvents: DataAgentStreamEvent[];
  isStreaming: boolean;
  onClose: () => void;
}
```

**Features**:
- **Dual-mode rendering**: Live mode (during streaming, reads from `streamEvents[]`) and History mode (after completion, reads from message `metadata`)
- **Stats Row**: Duration (live-ticking timer), Input tokens, Output tokens, Total tokens — displayed as 2x2 grid cards
- **Execution Plan**: Shows planner's sub-task list with real-time status icons (pending: gray circle, running: spinning loop, complete: green check, failed: red error)
- **Phase Details**: Collapsible accordion per phase (Planner, Navigator, SQL Builder, Executor, Verifier, Explainer) with status dot (pulsing blue for active, green for complete), tool calls listed inside
- **Verification Summary**: Shows pass/fail badge and individual check results (only in history mode from metadata)
- **Data Lineage**: Datasets as chips, grain, row count (only in history mode from metadata)

**Layout Integration** (in `DataAgentPage.tsx`):
- Desktop (lg+): Fixed 360px right pane, opens automatically when streaming starts
- Tablet (md-lg): Drawer from right, 360px
- Mobile: Full-screen drawer
- Toggle via Analytics icon button in ChatView header

**Utility Functions** (`insightsUtils.ts`):

**Location**: `apps/web/src/components/data-agent/insightsUtils.ts`

Helper functions for the insights panel:
- `extractPlan()`: Gets plan from stream events (live) or metadata (history)
- `extractStepStatuses()`: Gets per-step status (pending/running/complete/failed) with result summaries
- `extractPhaseDetails()`: Gets per-phase status + tool call lists from events or metadata
- `extractLiveTokens()`: Sums `token_update` stream events to get cumulative token counts during streaming
- `formatDuration()`: Formats ms as `m:ss`
- `formatTokenCount()`: Formats number with locale commas

**Custom Hook** (`useElapsedTimer.ts`):

**Location**: `apps/web/src/hooks/useElapsedTimer.ts`

Custom hook that provides a live elapsed timer string. Takes `startedAt` (timestamp ms) and `isActive` (boolean). Updates every 1 second via `setInterval` when active. Returns formatted duration string.

---

### LlmTracesSection (NEW)

Displays LLM interaction traces within the `AgentInsightsPanel`.

**Location**: `apps/web/src/components/data-agent/LlmTracesSection.tsx`

**Props**:
```typescript
interface LlmTracesSectionProps {
  chatId: string;
  messageId: string;
  streamEvents: DataAgentStreamEvent[];
  isStreaming: boolean;
}
```

**Features**:
- **Dual-mode rendering**: Live mode (reads from SSE events), History mode (fetches from REST API)
- **Compact trace cards**: Phase, purpose, provider/model, tokens, duration
- **Click to expand**: Opens `LlmTraceDialog` with full trace details
- **Live updates**: New traces appear as `llm_call_end` events arrive during streaming
- **Color-coded phases**: Different background colors per phase for visual grouping

**Live Mode** (during streaming):
- Filters `streamEvents` for `llm_call_start` and `llm_call_end` events
- Shows "In progress..." status for calls that started but haven't completed
- Updates in real-time as events arrive

**History Mode** (after completion):
- Fetches traces from `GET /api/data-agent/chats/:chatId/messages/:messageId/traces`
- Displays all persisted traces with full metadata
- No loading spinner (data already available)

**Integration**: Rendered within `AgentInsightsPanel` as a collapsible accordion section, positioned after "Phase Details" and before "Join Graph".

---

### LlmTraceDialog (NEW)

Full-screen dialog showing complete trace details when a trace card is clicked.

**Location**: `apps/web/src/components/data-agent/LlmTraceDialog.tsx`

**Props**:
```typescript
interface LlmTraceDialogProps {
  trace: LlmTrace;
  open: boolean;
  onClose: () => void;
}
```

**Sections**:
1. **Metadata**: Phase, purpose, provider, model, temperature (if applicable), structured output flag
2. **Timing**: Start time, end time, duration (milliseconds)
3. **Token Usage**: Prompt tokens, completion tokens, total tokens with formatted numbers
4. **Prompt Messages**: Syntax-highlighted JSON display of LangChain message array (system, human, ai, tool messages)
5. **Response Content**: Syntax-highlighted response (JSON for structured output, plain text otherwise)
6. **Tool Calls**: Displays tool call array if present (Navigator mini-ReAct iterations)
7. **Error Display**: Shows error message with red background if LLM call failed

**Syntax Highlighting**: Uses `react-syntax-highlighter` with `tomorrow` theme for code/JSON display.

---

### ClarificationCard (NEW)

Inline card component rendered in the chat when a `clarification_needed` message is received.

**Location**: `apps/web/src/components/data-agent/ClarificationCard.tsx`

**Features**:
- Displays each clarifying question with its default assumption below in a styled list
- "Answer" button: Opens a response area pre-populated with the original question; user types answers then sends
- "Proceed with assumptions" button: Immediately sends a combined message with the original question and all default assumptions appended
- Visually distinct from regular assistant messages (info-style card, question mark icon)
- Disabled while a response is being generated

**Props**:
```typescript
interface ClarificationCardProps {
  questions: Array<{ question: string; assumption: string }>;
  originalQuestion: string;
  onAnswer: (combinedMessage: string) => void;
  onProceed: (combinedMessage: string) => void;
  disabled?: boolean;
}
```

---

### PreferencesDialog (NEW)

Dialog for managing user preferences, accessible via a Tune icon button in the chat header.

**Location**: `apps/web/src/components/data-agent/PreferencesDialog.tsx`

**Features**:
- Two tabs: "Global" and "Ontology" (ontology tab visible only when a chat with an ontology is active)
- Auto-capture mode toggle group (`off` / `auto` / `ask`) at the top of the dialog
- List of existing preferences with key, value, source badge, and Delete action
- Inline add form with key and value fields
- Inline edit by clicking a preference value
- Calls `POST /api/data-agent/preferences` for add/upsert, `PATCH` for edit, `DELETE` for removal

**Props**:
```typescript
interface PreferencesDialogProps {
  open: boolean;
  onClose: () => void;
  ontologyId: string | null;
}
```

---

### PreferenceSuggestionBanner (NEW)

Banner shown below a completed assistant message when `preference_suggested` is received in `ask` mode.

**Location**: `apps/web/src/components/data-agent/PreferenceSuggestionBanner.tsx`

**Features**:
- Compact banner with each suggested preference key and value
- Per-suggestion Save (calls `POST /api/data-agent/preferences`) and Dismiss actions
- Disappears when all suggestions are saved or dismissed

**Props**:
```typescript
interface PreferenceSuggestionBannerProps {
  suggestions: Array<{ key: string; value: string; question: string }>;
  ontologyId: string;
  onSave: (key: string, value: string) => Promise<void>;
  onDismiss: (key: string) => void;
}
```

---

### ChatMessage (UPDATED)

Message bubble component with verification badge and data lineage.

**Location**: `apps/web/src/components/data-agent/ChatMessage.tsx`

**New Features**:
- Verification badge: checkmark (passed) or warning icon (failed with caveats)
- Data lineage footer: datasets, joins, grain, row count
- Expandable metadata inspector (toolCalls, plan, stepResults)

**Verification Badge**:
```tsx
{metadata?.verificationReport && (
  <Chip
    size="small"
    icon={metadata.verificationReport.passed ? <CheckCircleIcon /> : <WarningIcon />}
    label={metadata.verificationReport.passed ? 'Verified' : 'Unverified (see caveats)'}
    color={metadata.verificationReport.passed ? 'success' : 'warning'}
  />
)}
```

**Data Lineage**:
```tsx
{metadata?.dataLineage && (
  <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
    <Typography variant="caption" color="text.secondary">
      Data: {metadata.dataLineage.datasets.join(', ')} |
      Grain: {metadata.dataLineage.grain} |
      Rows: {metadata.dataLineage.rowCount?.toLocaleString()} |
      {metadata.dataLineage.joins.length} joins
    </Typography>
  </Box>
)}
```

---

### ToolCallAccordion (UPDATED)

Collapsible tool execution display grouped by phase and step.

**Location**: `apps/web/src/components/data-agent/ToolCallAccordion.tsx`

**New Features**:
- Group tool calls by `phase`
- Within Executor phase, group by `stepId`
- Show phase name and step description
- Syntax highlighting for SQL and Python code

**Structure**:
```
📋 Navigator
  └─ list_datasets → [...]
  └─ get_relationships → [...]
  └─ get_dataset_details → [...]

🔧 Executor
  └─ Step 1: Get monthly revenue per store
      └─ query_database → 100 rows
  └─ Step 2: Compare Houston vs peers
      └─ query_database → 50 rows
  └─ Step 3: Decompose variance
      └─ query_database → 200 rows
      └─ run_python → [chart]

✅ Verifier
  └─ run_python → Verification checks passed
```

---

### ChatView (UPDATED)

Main chat display with PhaseIndicator integration.

**Location**: `apps/web/src/components/data-agent/ChatView.tsx`

**Changes**:
- Render `<PhaseIndicator />` above message list during generation
- Show elapsed time during generation
- Auto-scroll to bottom on new phase/step events

---

### WelcomeScreen

Empty state when no chat is selected.

**Location**: `apps/web/src/components/data-agent/WelcomeScreen.tsx`

**Features**:
- Suggestion cards: "Analyze sales trends", "Compare regional performance", "Find top customers"
- Click card → populate ChatInput with question

---

### ChatInput

Auto-resize textarea with Enter to send and model provider selection.

**Location**: `apps/web/src/components/data-agent/ChatInput.tsx`

**Features**:
- Enter to send (Shift+Enter for new line)
- Auto-resize up to 5 rows
- Disabled during message generation
- Integrated ModelSelector for changing provider mid-conversation

---

### NewChatDialog

Ontology selection dialog for creating new chats.

**Location**: `apps/web/src/components/data-agent/NewChatDialog.tsx`

**Features**:
- List available ontologies (requires `ontologies:read` permission)
- Filter by semantic model or connection
- Automatically generate chat name based on first message
- Pre-select user's default provider preference

---

### ModelSelector

Compact MUI Select component for choosing LLM provider.

**Location**: `apps/web/src/components/data-agent/ModelSelector.tsx`

**Features**:
- Shows enabled LLM providers (OpenAI, Anthropic, Azure OpenAI)
- Pre-selects user's default provider preference from User Settings
- Displays provider-specific model name (from admin config)
- Updates chat's `llm_provider` when changed

**Props**:
```typescript
interface ModelSelectorProps {
  value: string | null;  // Current provider (openai | anthropic | azure | null)
  onChange: (provider: string | null) => void;
  disabled?: boolean;
}
```

**Usage in ChatInput**:
```tsx
<ModelSelector
  value={chat.llmProvider}
  onChange={handleProviderChange}
  disabled={isStreaming}
/>
```

**Usage in NewChatDialog**:
```tsx
<ModelSelector
  value={selectedProvider}
  onChange={setSelectedProvider}
/>
```

---

### Frontend Hooks

#### useLlmProviders

Custom hook for fetching enabled LLM providers and resolving user's default provider.

**Location**: `apps/web/src/hooks/useLlmProviders.ts`

**Returns**:
```typescript
{
  providers: Array<{ id: string; name: string; model: string }>;  // Enabled providers with admin-configured models
  defaultProvider: string | null;  // User's preferred default from User Settings
  isLoading: boolean;
  error: Error | null;
}
```

**Usage**:
```tsx
const { providers, defaultProvider, isLoading } = useLlmProviders();
```

---

## Model Selection

The Data Agent supports per-chat LLM provider selection with admin-configured model settings including reasoning capabilities.

### Per-Chat Provider Selection

Users can select an LLM provider when creating a chat or change it mid-conversation:

- **OpenAI**: Standard GPT-4o or reasoning models (o1, o3) with configurable reasoning effort
- **Anthropic**: Claude models with adaptive thinking mode or custom thinking token budgets
- **Azure OpenAI**: Azure-hosted OpenAI models with same capabilities

Provider selection is stored in the `data_chats.llm_provider` column and persists for the entire conversation. Users can switch providers at any time to compare results or use specialized model capabilities.

### Admin Configuration

Admins configure per-provider settings in System Settings → "Data Agent" tab:

**Configuration Fields**:
- **Model Name**: Specific model to use (e.g., `gpt-4o`, `o1-preview`, `claude-3-5-sonnet-20241022`)
- **Temperature**: Sampling temperature (0-2, default: 0.7)
- **Reasoning Level**: Provider-specific reasoning configuration

**Reasoning Level by Provider**:

| Provider | Parameter | Values | Description |
|----------|-----------|--------|-------------|
| OpenAI / Azure | `reasoning_effort` | `low`, `medium`, `high` | For o1/o3 reasoning models. Controls depth of internal reasoning. Not applicable to standard GPT models. |
| Anthropic | `thinking` | `adaptive` or `1024-128000` | Adaptive mode (default) or custom thinking token budget. Enables extended thinking for complex queries. |

**Example Configuration**:
```json
{
  "dataAgent": {
    "openai": {
      "model": "o1-preview",
      "temperature": 0.7,
      "reasoningLevel": "high"
    },
    "anthropic": {
      "model": "claude-3-5-sonnet-20241022",
      "temperature": 0.7,
      "reasoningLevel": "adaptive"
    },
    "azure": {
      "model": "gpt-4o",
      "temperature": 0.7,
      "reasoningLevel": "medium"
    }
  }
}
```

### Resolution Flow

When a message is sent, the agent resolves which LLM to use:

1. **Read Chat Provider**: Check `data_chats.llm_provider` for the chat's selected provider
2. **Fall Back to System Default**: If not set, use `LLM_DEFAULT_PROVIDER` environment variable
3. **Fetch Admin Config**: Load provider-specific settings from system settings `dataAgent[provider]`
4. **Instantiate Model**: Pass provider name + config to `LlmService.getChatModel(provider, config)`

**Example Flow**:
```typescript
// 1. Read chat's selected provider
const chat = await prisma.dataChat.findUnique({ where: { id: chatId } });
const provider = chat.llm_provider || process.env.LLM_DEFAULT_PROVIDER;

// 2. Fetch admin config
const systemSettings = await settingsService.getSystemSettings();
const config = systemSettings.dataAgent[provider];

// 3. Get configured model
const llm = llmService.getChatModel(provider, config);
```

### Default Provider (User Preference)

Users can set a preferred default provider in User Settings, which:
- Pre-selects the provider in the "New Chat" dialog
- Pre-selects the provider in the ChatInput model selector
- Does NOT affect existing chats (stored in `data_chats.llm_provider`)
- Falls back to system default if user preference is not set

---

## Configuration

### Required Environment Variables

**LLM Providers** (one required):
```bash
# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o  # default: gpt-4o (can be overridden by admin config)

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022  # default (can be overridden by admin config)

# Azure OpenAI
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=https://....openai.azure.com
AZURE_OPENAI_DEPLOYMENT=gpt-4o
AZURE_OPENAI_API_VERSION=2024-02-15-preview
```

**Default Provider**:
```bash
LLM_DEFAULT_PROVIDER=openai  # openai | anthropic | azure
```

**Admin Model Configuration**:

Admins configure per-provider model settings in System Settings → "Data Agent" tab. This configuration overrides environment variable defaults.

Example system settings structure:
```json
{
  "dataAgent": {
    "openai": {
      "model": "o1-preview",
      "temperature": 0.7,
      "reasoningLevel": "high"
    },
    "anthropic": {
      "model": "claude-3-5-sonnet-20241022",
      "temperature": 0.7,
      "reasoningLevel": "adaptive"
    },
    "azure": {
      "model": "gpt-4o",
      "temperature": 0.7,
      "reasoningLevel": "medium"
    }
  }
}
```

**Embedding Provider** (OpenAI only):
```bash
OPENAI_API_KEY=sk-...  # Same key used for embeddings
```

**Neo4j**:
```bash
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
```

**Python Sandbox**:
```bash
SANDBOX_URL=http://sandbox:5000  # Docker service name
```

### Optional Configuration

```bash
# Query execution limits
SQL_QUERY_TIMEOUT_MS=30000  # 30s
SQL_MAX_ROWS=1000

# Python sandbox limits
PYTHON_TIMEOUT_MS=30000  # 30s
PYTHON_MEMORY_LIMIT_MB=512

# Vector search
VECTOR_SEARCH_TOP_K=10  # Number of relevant datasets

# Conversation context
CONVERSATION_HISTORY_LIMIT=10  # Last N messages for context
```

---

## File Inventory

### New Backend Files

| File | Purpose |
|------|---------|
| `apps/api/src/data-agent/agent/types.ts` | TypeScript interfaces for all phase artifacts |
| `apps/api/src/data-agent/agent/state.ts` | LangGraph state definition with Annotation |
| `apps/api/src/data-agent/agent/graph.ts` | StateGraph builder with 6 nodes + conditional routing |
| `apps/api/src/data-agent/agent/nodes/planner.node.ts` | Planner phase: sub-task decomposition |
| `apps/api/src/data-agent/agent/nodes/navigator.node.ts` | Navigator phase: dataset + join path discovery |
| `apps/api/src/data-agent/agent/nodes/sql-builder.node.ts` | SQL Builder phase: per-step SQL generation |
| `apps/api/src/data-agent/agent/nodes/executor.node.ts` | Executor phase: progressive SQL + Python execution |
| `apps/api/src/data-agent/agent/nodes/verifier.node.ts` | Verifier phase: Python validation + revision routing |
| `apps/api/src/data-agent/agent/nodes/explainer.node.ts` | Explainer phase: narrative + lineage synthesis |
| `apps/api/src/data-agent/agent/nodes/index.ts` | Barrel export for nodes |
| `apps/api/src/data-agent/agent/prompts/planner.prompt.ts` | Planner system prompt |
| `apps/api/src/data-agent/agent/prompts/navigator.prompt.ts` | Navigator system prompt |
| `apps/api/src/data-agent/agent/prompts/sql-builder.prompt.ts` | SQL Builder system prompt |
| `apps/api/src/data-agent/agent/prompts/executor.prompt.ts` | Executor repair prompt |
| `apps/api/src/data-agent/agent/prompts/verifier.prompt.ts` | Verifier system prompt |
| `apps/api/src/data-agent/agent/prompts/explainer.prompt.ts` | Explainer system prompt |
| `apps/api/src/data-agent/agent/prompts/index.ts` | Barrel export for prompts |
| `apps/api/src/data-agent/agent/tools/query-database.tool.ts` | Rebuilt: SQL execution |
| `apps/api/src/data-agent/agent/tools/get-dataset-details.tool.ts` | Rebuilt: YAML schema lookup |
| `apps/api/src/data-agent/agent/tools/get-sample-data.tool.ts` | Rebuilt: Sample rows |
| `apps/api/src/data-agent/agent/tools/run-python.tool.ts` | Rebuilt: Python sandbox execution |
| `apps/api/src/data-agent/agent/tools/list-datasets.tool.ts` | Rebuilt: Dataset discovery |
| `apps/api/src/data-agent/agent/tools/get-relationships.tool.ts` | NEW: wraps `getAllRelationships()` |
| `apps/api/src/data-agent/agent/tools/index.ts` | Rebuilt: barrel export for 6 tools |
| `apps/api/src/data-agent/agent/utils/token-tracker.ts` | Token usage extraction from LangChain responses |
| `apps/api/src/data-agent/agent/utils/data-agent-tracer.ts` | DataAgentTracer class for LLM interaction tracing |
| `apps/api/src/data-agent/preferences/preferences.controller.ts` | REST controller for user preferences CRUD |
| `apps/api/src/data-agent/preferences/preferences.service.ts` | Business logic for preference management and effective resolution |
| `apps/api/src/data-agent/preferences/preferences.dto.ts` | Zod-based DTOs for preferences API |
| `apps/api/src/data-agent/preferences/preferences.service.spec.ts` | Unit tests for preferences service |

### Modified Backend Files

| File | Change |
|------|--------|
| `apps/api/src/ontologies/neo-ontology.service.ts` | Add `getAllRelationships()` and `findJoinPaths()` methods |
| `apps/api/src/ontologies/neo-ontology.service.spec.ts` | Add tests for new methods |
| `apps/api/src/data-agent/agent/agent.service.ts` | Rewrite: replace `createReactAgent` with `buildDataAgentGraph()` |
| `apps/api/src/data-agent/agent/agent.service.spec.ts` | Rewrite tests for StateGraph-based agent |

### New Frontend Files

| File | Purpose |
|------|---------|
| `apps/web/src/components/data-agent/PhaseIndicator.tsx` | MUI Stepper showing phase progress |
| `apps/web/src/components/data-agent/AgentInsightsPanel.tsx` | Agent insights right-side panel |
| `apps/web/src/components/data-agent/insightsUtils.ts` | Utility functions for insights data extraction |
| `apps/web/src/components/data-agent/ModelSelector.tsx` | LLM provider selection component |
| `apps/web/src/components/data-agent/LlmTracesSection.tsx` | LLM traces section in insights panel |
| `apps/web/src/components/data-agent/LlmTraceDialog.tsx` | Full trace detail dialog |
| `apps/web/src/components/admin/DataAgentSettings.tsx` | Admin UI for per-provider model configuration |
| `apps/web/src/components/settings/DefaultProviderSettings.tsx` | User UI for default provider preference |
| `apps/web/src/hooks/useElapsedTimer.ts` | Live elapsed timer hook |
| `apps/web/src/hooks/useLlmProviders.ts` | Hook for fetching enabled providers and user default |
| `apps/web/src/components/data-agent/ClarificationCard.tsx` | Inline card for asking clarifying questions |
| `apps/web/src/components/data-agent/PreferencesDialog.tsx` | Dialog for managing user preferences (global + ontology scoped) |
| `apps/web/src/components/data-agent/PreferenceSuggestionBanner.tsx` | Banner for saving suggested preferences in ask mode |
| `apps/web/src/hooks/useDataAgentPreferences.ts` | Hook for preferences CRUD and effective resolution |

### Modified Frontend Files

| File | Change |
|------|--------|
| `apps/web/src/types/index.ts` | Extend `DataAgentStreamEvent` with phase/step events; extend metadata types |
| `apps/web/src/hooks/useDataChat.ts` | Handle new SSE event types in parser |
| `apps/web/src/pages/DataAgentPage.tsx` | Integrate AgentInsightsPanel with responsive layout |
| `apps/web/src/components/data-agent/ChatView.tsx` | Integrate PhaseIndicator above message list, add insights panel toggle button (Analytics icon) |
| `apps/web/src/components/data-agent/ChatInput.tsx` | Integrate ModelSelector for provider selection |
| `apps/web/src/components/data-agent/NewChatDialog.tsx` | Integrate ModelSelector with user default pre-selection |
| `apps/web/src/components/data-agent/ToolCallAccordion.tsx` | Group tool calls by phase + stepId |
| `apps/web/src/components/data-agent/ChatMessage.tsx` | Show verification badge, data lineage footer, and inline ClarificationCard for clarification_needed messages |
| `apps/api/src/llm/llm.service.ts` | Updated with `LlmModelConfig` for per-provider config with reasoning levels |
| `apps/web/src/hooks/useDataChat.ts` | Handle clarification_requested, preference_suggested, preference_auto_saved SSE events |
| `apps/web/src/components/data-agent/ChatView.tsx` | Add Tune icon button for PreferencesDialog; show PreferenceSuggestionBanner after preference_suggested event |
| `apps/web/src/types/index.ts` | Extend DataAgentStreamEvent with clarification and preference event types; add clarification_needed status |

### Deleted Files

All existing agent implementation files deleted and rebuilt from scratch:

| File | Action |
|------|--------|
| `apps/api/src/data-agent/agent/agent.service.ts` | DELETE (replaced by new StateGraph version) |
| `apps/api/src/data-agent/agent/agent.service.spec.ts` | DELETE (replaced by new tests) |
| `apps/api/src/data-agent/agent/prompts.ts` | DELETE (replaced by per-phase prompts/) |
| `apps/api/src/data-agent/agent/prompts.spec.ts` | DELETE (replaced by per-phase prompt tests) |
| All existing tool files | DELETE (rebuilt fresh) |

---

## Testing

### Backend Tests

#### Unit Tests

Each phase node tested in isolation:

```typescript
// planner.node.spec.ts
describe('PlannerNode', () => {
  it('should decompose complex question into sub-tasks', async () => {
    const state = { userQuestion: 'Why is Houston underperforming?', ... };
    const result = await plannerNode(state);
    expect(result.plan.steps.length).toBeGreaterThan(1);
    expect(result.plan.complexity).toBe('analytical');
  });
});

// navigator.node.spec.ts
describe('NavigatorNode', () => {
  it('should find join paths between datasets', async () => {
    const state = { plan: {...}, ontologyId: '...' };
    const result = await navigatorNode(state);
    expect(result.joinPlan.joinPaths.length).toBeGreaterThan(0);
  });
});
```

#### Token Tracker Tests

14 tests for `token-tracker.ts` covering:
- `extractTokenUsage()`: Extracts token counts from LangChain AIMessage (OpenAI and Anthropic formats)
- `mergeTokenUsage()`: Sums two token usage objects
- Handles missing/undefined usage metadata gracefully

```typescript
// token-tracker.spec.ts
describe('TokenTracker', () => {
  it('should extract OpenAI token usage', () => {
    const message = { response_metadata: { usage: { prompt_tokens: 100, completion_tokens: 50 } } };
    const tokens = extractTokenUsage(message);
    expect(tokens).toEqual({ prompt: 100, completion: 50, total: 150 });
  });

  it('should extract Anthropic token usage', () => {
    const message = { usage_metadata: { input_tokens: 100, output_tokens: 50 } };
    const tokens = extractTokenUsage(message);
    expect(tokens).toEqual({ prompt: 100, completion: 50, total: 150 });
  });

  it('should merge token usage objects', () => {
    const a = { prompt: 100, completion: 50, total: 150 };
    const b = { prompt: 200, completion: 75, total: 275 };
    const merged = mergeTokenUsage(a, b);
    expect(merged).toEqual({ prompt: 300, completion: 125, total: 425 });
  });
});
```

#### Integration Tests

Full graph execution with mocked LLM + services:

```typescript
// agent.service.spec.ts
describe('DataAgentAgentService (StateGraph)', () => {
  it('should execute full pipeline for analytical question', async () => {
    const result = await agentService.executeAgent({
      userQuestion: 'What are the top products?',
      chatId: '...',
      messageId: '...',
      ontologyId: '...',
    });

    expect(result.plan).toBeDefined();
    expect(result.joinPlan).toBeDefined();
    expect(result.querySpecs).toBeDefined();
    expect(result.stepResults).toBeDefined();
    expect(result.verificationReport?.passed).toBe(true);
    expect(result.explainerOutput).toBeDefined();
  });
});
```

#### Neo4j Tests

Test new relationship navigation methods:

```typescript
// neo-ontology.service.spec.ts
describe('NeoOntologyService', () => {
  it('should return all RELATES_TO edges', async () => {
    const edges = await service.getAllRelationships(ontologyId);
    expect(edges.length).toBeGreaterThan(0);
    expect(edges[0]).toHaveProperty('fromDataset');
    expect(edges[0]).toHaveProperty('toDataset');
  });

  it('should find shortest join path', async () => {
    const paths = await service.findJoinPaths(ontologyId, 'orders', 'customers');
    expect(paths.length).toBeGreaterThan(0);
    expect(paths[0].datasets).toContain('orders');
    expect(paths[0].datasets).toContain('customers');
  });
});
```

### Frontend Tests

#### Component Tests

Test PhaseIndicator rendering:

```typescript
// PhaseIndicator.spec.tsx
describe('PhaseIndicator', () => {
  it('should show active phase', () => {
    render(<PhaseIndicator currentPhase="navigator" completedPhases={['planner']} />);
    expect(screen.getByText('Navigator')).toBeInTheDocument();
  });

  it('should mark completed phases', () => {
    render(<PhaseIndicator currentPhase="executor" completedPhases={['planner', 'navigator']} />);
    const plannerStep = screen.getByText('Planner').closest('.MuiStepLabel-root');
    expect(plannerStep).toHaveClass('Mui-completed');
  });
});
```

Test AgentInsightsPanel (9 tests):

```typescript
// AgentInsightsPanel.spec.tsx
describe('AgentInsightsPanel', () => {
  it('should display live duration timer during streaming', () => {
    const events = [{ type: 'message_start', startedAt: Date.now() - 5000 }];
    render(<AgentInsightsPanel streamEvents={events} isStreaming={true} />);
    expect(screen.getByText(/0:0[5-6]/)).toBeInTheDocument(); // 5-6 seconds
  });

  it('should display token counts from stream events', () => {
    const events = [
      { type: 'token_update', phase: 'planner', tokensUsed: { prompt: 100, completion: 50, total: 150 } },
      { type: 'token_update', phase: 'executor', tokensUsed: { prompt: 200, completion: 75, total: 275 } },
    ];
    render(<AgentInsightsPanel streamEvents={events} isStreaming={true} />);
    expect(screen.getByText('300')).toBeInTheDocument(); // prompt tokens
    expect(screen.getByText('125')).toBeInTheDocument(); // completion tokens
  });

  it('should fall back to metadata in history mode', () => {
    const messages = [{
      role: 'assistant',
      metadata: {
        startedAt: Date.now() - 30000,
        durationMs: 28500,
        tokensUsed: { prompt: 500, completion: 200, total: 700 },
      },
    }];
    render(<AgentInsightsPanel messages={messages} isStreaming={false} />);
    expect(screen.getByText('0:28')).toBeInTheDocument(); // duration
    expect(screen.getByText('500')).toBeInTheDocument(); // prompt tokens
  });
});
```

Test insightsUtils:

```typescript
// insightsUtils.spec.ts
describe('insightsUtils', () => {
  it('should extract live tokens from stream events', () => {
    const events = [
      { type: 'token_update', tokensUsed: { prompt: 100, completion: 50, total: 150 } },
      { type: 'token_update', tokensUsed: { prompt: 200, completion: 75, total: 275 } },
    ];
    const tokens = extractLiveTokens(events);
    expect(tokens).toEqual({ prompt: 300, completion: 125, total: 425 });
  });

  it('should extract plan from stream events', () => {
    const events = [
      { type: 'phase_artifact', phase: 'planner', artifact: { steps: [...] } },
    ];
    const plan = extractPlan(events, []);
    expect(plan?.steps).toBeDefined();
  });
});
```

Test ChatMessage with verification badge:

```typescript
// ChatMessage.spec.tsx
describe('ChatMessage', () => {
  it('should show verification badge when passed', () => {
    const metadata = {
      verificationReport: { passed: true, checks: [...] },
    };
    render(<ChatMessage role="assistant" content="..." metadata={metadata} />);
    expect(screen.getByText('Verified')).toBeInTheDocument();
  });

  it('should show data lineage', () => {
    const metadata = {
      dataLineage: {
        datasets: ['orders', 'products'],
        grain: 'order-line',
        rowCount: 1000,
      },
    };
    render(<ChatMessage role="assistant" content="..." metadata={metadata} />);
    expect(screen.getByText(/orders, products/)).toBeInTheDocument();
    expect(screen.getByText(/1,000/)).toBeInTheDocument();
  });
});
```

#### Hook Tests

Test SSE event handling:

```typescript
// useDataChat.spec.ts
describe('useDataChat', () => {
  it('should update phase progress on phase_start event', () => {
    const { result } = renderHook(() => useDataChat());
    act(() => {
      result.current.handleEvent({ type: 'phase_start', phase: 'navigator' });
    });
    expect(result.current.phaseProgress.current).toBe('navigator');
  });
});
```

Test useElapsedTimer hook:

```typescript
// useElapsedTimer.spec.ts
describe('useElapsedTimer', () => {
  it('should update timer every second when active', () => {
    const startedAt = Date.now() - 5000;
    const { result } = renderHook(() => useElapsedTimer(startedAt, true));
    expect(result.current).toMatch(/0:0[5-6]/);
  });

  it('should stop updating when inactive', () => {
    const startedAt = Date.now() - 5000;
    const { result } = renderHook(() => useElapsedTimer(startedAt, false));
    expect(result.current).toBe('0:05');
  });
});
```

### Manual E2E Testing

1. Create ontology with PostgreSQL + Neo4j
2. Start new chat, ask complex question: "Why is Houston underperforming?"
3. Verify:
   - PhaseIndicator shows all 6 phases
   - ToolCallAccordion groups tools by phase + step
   - Verification badge shows checkmark
   - Data lineage appears in message footer
   - Follow-up question uses metadata context

---

## Packages

### Backend Dependencies

```json
{
  "@langchain/langgraph": "^0.2.31",
  "@langchain/core": "^0.3.28",
  "@langchain/openai": "^0.3.24",
  "@langchain/anthropic": "^0.3.24"
}
```

### Frontend Dependencies

No new dependencies (PhaseIndicator uses existing MUI components).

---

## Appendix: Architecture Evolution

### Previous Architecture (ReAct Agent)

- Single flat `createReactAgent` with 5 tools
- No structured decomposition
- No join path validation
- No result verification
- Limited observability (tool calls only)

### New Architecture (Multi-Phase StateGraph)

- 6 specialized phase nodes with structured artifacts
- Sub-task decomposition with dependency management
- Graph-based join path discovery
- Mandatory Python verification with revision loops
- Rich observability (phase/step/tool events + metadata)
- Progressive SQL execution (pilot → full)
- Data lineage tracking

### Migration Impact

- **No API changes**: Endpoints, permissions, and database schema unchanged
- **Backward compatible SSE events**: New events are additive
- **Enhanced metadata**: Existing metadata fields extended but not breaking
- **Improved accuracy**: Verification gate catches grain issues, bad joins, and incorrect aggregations
- **Better debugging**: Full execution trace available in metadata

---

**End of Specification**
