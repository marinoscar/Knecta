# Spreadsheet Agent Feature Specification

## Table of Contents

1. [Feature Overview](#feature-overview)
2. [Architecture](#architecture)
3. [Supported File Formats](#supported-file-formats)
4. [Multi-Phase Agent Architecture](#multi-phase-agent-architecture)
5. [Phase Descriptions](#phase-descriptions)
6. [Storage Provider Abstraction](#storage-provider-abstraction)
7. [Parallel Processing](#parallel-processing)
8. [State Schema](#state-schema)
9. [Graph Definition](#graph-definition)
10. [SSE Streaming](#sse-streaming)
11. [Database Schema](#database-schema)
12. [API Endpoints](#api-endpoints)
13. [Security](#security)
14. [RBAC Permissions](#rbac-permissions)
15. [Incremental Re-processing](#incremental-re-processing)
16. [Downstream Integration](#downstream-integration)
17. [Frontend Components](#frontend-components)
18. [Configuration](#configuration)
19. [File Inventory](#file-inventory)
20. [Testing](#testing)
21. [Packages](#packages)

---

## Feature Overview

The Spreadsheet Agent enables users to upload multiple spreadsheet files (Excel, CSV, JSON, and other DuckDB-supported formats), have an AI agent analyze their structure, extract clean data tables, and export them as Parquet files to cloud storage (S3, Azure Blob, or MinIO). The agent handles real-world spreadsheet complexity — inconsistent headers, multiple logical tables per sheet, mixed data types, metadata and summary rows, merged cells, and pivot layouts — and produces clean, well-typed, properly named data tables ready for downstream analytics.

### Core Capabilities

- **Multi-Format Ingestion**: All DuckDB-supported formats — Excel (.xlsx/.xls), CSV/TSV, JSON/NDJSON, Parquet, ORC, Arrow/IPC
- **Intelligent Structure Detection**: LLM analyzes each sheet to find header rows, data boundaries, logical tables, rows to skip (totals, metadata), and transposition needs
- **Schema Design**: Holistic LLM pass designs a clean target schema with proper table names, column names, data types, and cross-file relationships
- **Review Gate**: Optional pause for user to review and modify the extraction plan before processing (configurable: `auto` or `review` mode)
- **DuckDB-Powered Extraction**: In-process analytical engine for SQL transformations, type casting, cleaning, and deduplication
- **Cloud Storage Output**: Parquet files written directly to S3, Azure Blob, or MinIO via DuckDB extensions
- **Parallel Processing**: File-level, sheet-level, and table-level parallelism with configurable concurrency
- **Incremental Re-processing**: SHA-256 file hashing enables change detection; only modified files are re-analyzed
- **Run Tracking**: Complete audit trail with retry capability for failed runs
- **Multi-Provider LLM Support**: OpenAI, Anthropic, Azure OpenAI (same infrastructure as Semantic Models and Data Agent)

### Use Cases

1. **Data Migration**: Convert legacy Excel-based reporting into structured Parquet for data warehouses
2. **Multi-Source Consolidation**: Merge 20+ spreadsheets from different departments into normalized tables
3. **Analytics Pipeline Input**: Transform raw business spreadsheets into clean datasets for BI tools
4. **Data Lake Ingestion**: Automated spreadsheet-to-Parquet pipeline feeding S3-based data lakes

### Current Limitations

- **Python Sandbox Memory**: 512MB limit constrains single-file processing size
- **3 Revision Cycles**: The Validator allows a maximum of 3 revision attempts before persisting with caveats
- **50 Files Per Project**: Configurable maximum to prevent resource exhaustion
- **500MB Per File**: Configurable maximum single file size
- **No Formula Evaluation**: Formulas are read as their cached values, not re-evaluated

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Frontend Layer                              │
│  React + Material UI + SSE Streaming                                 │
│                                                                       │
│  SpreadsheetAgentPage (project list)                                │
│  NewSpreadsheetProjectPage (wizard: name → upload → process)        │
│  SpreadsheetProjectDetailPage (tabs: Overview, Files, Tables, Runs) │
│  ExtractionPlanReview (review gate component)                       │
│  AgentProgressView (SSE-driven progress)                            │
│  FileUploadZone (drag & drop multi-file)                            │
└────────────────────────────┬─────────────────────────────────────────┘
                             │ HTTPS (Nginx)
                             │ REST API + SSE
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                          Backend Layer                               │
│  NestJS + Fastify + TypeScript                                       │
│                                                                       │
│  SpreadsheetAgentController (CRUD: projects, files, tables)         │
│           ↓                                                           │
│  SpreadsheetAgentService (Business Logic, PostgreSQL CRUD)          │
│           ↓                                                           │
│  SpreadsheetAgentStreamController (SSE streaming endpoint)          │
│           ↓                                                           │
│  SpreadsheetAgentAgentService (StateGraph orchestration)            │
│           ↓                                                           │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ Multi-Phase StateGraph (LangGraph)                            │  │
│  │                                                                │  │
│  │  START → [Ingest] → [Analyzer] → [Designer] ─┐              │  │
│  │                                                 │              │  │
│  │              ┌──── (review mode) ──────────── __end__         │  │
│  │              │                                                  │  │
│  │              └──── (auto mode) ───→ [Extractor] → [Validator] │  │
│  │                                          │            │        │  │
│  │                                          │       (pass)│        │  │
│  │                                          │            ▼        │  │
│  │                                          │      [Persist] → END│  │
│  │                                          │                      │  │
│  │                                     (fail, <3 revisions)       │  │
│  │                                          ↓                      │  │
│  │                                   [Designer/Extractor]         │  │
│  │                                     (revision loop)            │  │
│  │                                                                │  │
│  │  Parallel Processing:                                          │  │
│  │  - Ingest: file-level parallel (openpyxl + DuckDB)           │  │
│  │  - Analyzer: sheet-level parallel (LLM per sheet)            │  │
│  │  - Extractor: table-level parallel (DuckDB per table)        │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  StorageProviderService (S3 / Azure Blob / MinIO abstraction)       │
│  SandboxService (Python code execution — DuckDB + openpyxl)         │
│  LlmModelConfig (multi-provider LLM — OpenAI, Anthropic, Azure)    │
└─────────────┬────────────────┬────────────────┬────────────────────┘
              │                │                │
              ▼                ▼                ▼
┌──────────────────┐  ┌─────────────────┐  ┌──────────────────────┐
│   PostgreSQL     │  │  Cloud Storage  │  │  Python Sandbox      │
│                  │  │                 │  │  (Docker Container)  │
│ - spreadsheet_   │  │ - S3 / Azure   │  │                      │
│   projects       │  │   Blob / MinIO │  │ - DuckDB engine      │
│ - spreadsheet_   │  │                 │  │ - openpyxl / xlrd    │
│   files          │  │ - Source files  │  │ - pyarrow            │
│ - spreadsheet_   │  │   (uploaded)    │  │ - boto3              │
│   tables         │  │ - Parquet       │  │ - 512MB memory       │
│ - spreadsheet_   │  │   output files  │  │ - Read-only FS       │
│   runs           │  │ - Catalog       │  │ - No network (except │
│                  │  │   manifest      │  │   cloud storage)     │
│ - Run tracking   │  │                 │  │                      │
│ - File metadata  │  │                 │  │                      │
│ - Table metadata │  │                 │  │                      │
└──────────────────┘  └─────────────────┘  └──────────────────────┘
```

### System Components

#### Backend Modules

- **SpreadsheetAgentModule**: Main feature module registering all services and controllers
- **SpreadsheetAgentService**: CRUD operations for projects, files, and tables
- **SpreadsheetAgentAgentService**: StateGraph creation and execution, run lifecycle management
- **SpreadsheetAgentStreamController**: SSE streaming endpoint using Fastify `res.hijack()`
- **StorageProviderService**: Cloud storage abstraction layer (S3, Azure Blob, MinIO)
- **SandboxService**: Python code execution client (existing, shared with Data Agent)

#### Frontend Components

- **SpreadsheetAgentPage**: Project list with search, status filter, and pagination
- **NewSpreadsheetProjectPage**: Multi-step wizard (name → upload → process → progress)
- **SpreadsheetProjectDetailPage**: Tabbed detail view (Overview, Files, Tables, Runs, Catalog)
- **ExtractionPlanReview**: Review gate — editable table cards with per-table approve/modify actions
- **AgentProgressView**: SSE-driven progress with per-file and per-table status
- **FileUploadZone**: Drag-and-drop multi-file upload area with file type validation
- **TablePreview**: Preview extracted Parquet data (first N rows)

#### External Services

- **Cloud Storage**: S3, Azure Blob, or MinIO for source files and Parquet output
- **Docker Sandbox**: Isolated Python + DuckDB execution environment (shared with Data Agent)
- **LLM Provider**: Chat completion (OpenAI, Anthropic, or Azure OpenAI)

---

## Supported File Formats

DuckDB provides native or extension-based support for all of the following formats:

| Format | Extensions | DuckDB Support | Notes |
|--------|-----------|----------------|-------|
| Excel | .xlsx, .xls | `excel` extension + openpyxl in sandbox | Multi-sheet support, merged cells detected |
| CSV | .csv | Native | Auto-detect delimiter, encoding, headers |
| TSV | .tsv | Native | Tab-delimited variant |
| JSON | .json | Native | Array-of-objects or nested structures |
| NDJSON | .ndjson, .jsonl | Native | Newline-delimited JSON |
| Parquet | .parquet | Native | Re-processing existing Parquet files |
| ORC | .orc | `orc` extension | Hadoop ecosystem format |
| Arrow/IPC | .arrow, .ipc | Native | Apache Arrow in-memory format |

### File Type Detection

The agent detects file types by extension and validates via content inspection in the Python sandbox:

```python
import magic

mime = magic.from_file(filepath, mime=True)
# Validate that extension matches content MIME type
# Raises ValueError if mismatch detected
```

---

## Multi-Phase Agent Architecture

The Spreadsheet Agent uses a custom LangGraph StateGraph with 7 phase nodes. Each phase produces a structured artifact consumed by the next phase. A mandatory validation gate blocks incorrect extractions and triggers automatic revision loops (up to 3 cycles).

### Phase Pipeline Diagram

```
START
  │
  ▼
[1. Ingest & Inventory]  ── programmatic (openpyxl + DuckDB)
  │    Download files from cloud storage to sandbox temp directory
  │    Enumerate sheets, extract raw cell grids
  │    Basic stats: row/col counts, merged cells, data density
  │    Output: FileInventory[]
  │
  ▼
[2. Sheet Analyzer]  ── LLM per sheet (PARALLEL)
  │    Send sample rows + structure hints to LLM
  │    LLM identifies: header row, data boundaries, logical tables,
  │    column types, semantic meaning, rows to skip
  │    Output: SheetAnalysis[] per sheet
  │
  ▼
[3. Schema Designer]  ── LLM (single holistic call)
  │    Design target schema from ALL SheetAnalyses:
  │    - Clean table names, column names, data types
  │    - Cross-file relationships
  │    - Normalization decisions
  │    Output: ExtractionPlan
  │
  ▼
[4. Review Gate]  ── conditional (reviewMode config)
  │    'review': pause, emit review_ready SSE, wait for approval
  │    'auto': skip directly to Extractor
  │
  ▼
[5. Extractor]  ── DuckDB + Python sandbox (per table, PARALLEL)
  │    Read source data → DuckDB staging → transform → COPY TO Parquet
  │    Output: ExtractionResult[] per table
  │
  ▼
[6. Validator]  ── programmatic + LLM
  │    Row count, null check, type validation, sample review
  │    Revision loop: back to Extractor or Schema Designer (max 3)
  │
  ▼
[7. Persist & Catalog]  ── programmatic
  │    Update DB records, generate catalog manifest on cloud storage
  │
  ▼
END
```

### Key Architectural Decisions

1. **Parallel at Every Level**: Ingest parallelizes by file, Analyzer parallelizes by sheet, Extractor parallelizes by output table. All use `Promise.allSettled` for error isolation.
2. **LLM Calls Minimized**: Phases 1, 4, 5, and 7 have zero LLM calls. Only Phases 2, 3, and optionally 6 use the LLM, keeping costs predictable.
3. **Review Gate as Graph Pause**: The graph returns `__end__` when review mode is enabled, persisting the plan in the database. A new graph invocation resumes from the Extractor with the (possibly modified) plan.
4. **DuckDB as the Extraction Engine**: DuckDB reads source files, applies transformations, and writes Parquet directly to cloud storage in a single SQL expression. No intermediate local files are created.
5. **Structured Output for All LLM Calls**: All LLM calls use `withStructuredOutput` (Zod schemas) to guarantee parseable JSON responses without retry loops.

---

## Phase Descriptions

### Phase 1: Ingest & Inventory

**Purpose**: Download source files from cloud storage and extract raw structural metadata without LLM involvement.

**Inputs**:
- `files`: List of project files with storage paths
- Cloud storage credentials from environment configuration

**Output**: `FileInventory[]`

```typescript
interface FileInventory {
  fileId: string;
  fileName: string;
  fileType: string;             // 'xlsx' | 'csv' | 'tsv' | 'json' | 'ndjson' | 'parquet' | 'orc' | 'arrow'
  fileSizeBytes: number;
  fileHash: string;             // SHA-256 for change detection
  sheets: Array<{
    name: string;
    rowCount: number;
    colCount: number;
    hasMergedCells: boolean;
    hasFormulas: boolean;
    dataDensity: number;        // 0–1 ratio of non-empty cells
    sampleGrid: string[][];     // First 30 rows × all columns as raw strings
    lastRows: string[][];       // Last 5 rows for footer/total detection
    mergedCellRanges: string[]; // e.g., ["A1:C3", "D5:E5"]
  }>;
}
```

**Key Behavior**:
- Downloads each file from cloud storage to sandbox temp directory (`/tmp/spreadsheet-agent/<runId>/`)
- Excel files: openpyxl enumerates sheets, extracts cell grids, detects merged cells and formula presence
- CSV/TSV: DuckDB `sniff_csv` for delimiter and encoding detection, produces a single implicit sheet entry
- JSON: DuckDB `read_json_auto` for structure detection, schema summarized as single sheet
- File-level processing with `Promise.allSettled` — one file's failure does not block others
- Emits `file_start`, `file_complete`, and `file_error` SSE events

**LLM Calls**: 0

---

### Phase 2: Sheet Analyzer

**Purpose**: LLM analyzes each sheet independently to identify logical tables, headers, data boundaries, and column types.

**Inputs**:
- `fileInventory`: Raw structural metadata from Phase 1
- Per-sheet `sampleGrid`: First 30 rows of raw cell values
- Per-sheet `lastRows`: Last 5 rows for total/footer row detection

**Output**: `SheetAnalysis[]`

```typescript
interface SheetAnalysis {
  fileId: string;
  fileName: string;
  sheetName: string;
  logicalTables: Array<{
    suggestedName: string;
    description: string;
    headerRow: number;              // 0-indexed row number
    dataStartRow: number;
    dataEndRow: number | null;      // null means data continues to end of sheet
    columns: Array<{
      index: number;
      sourceName: string;           // Original header text from the cell
      cleanName: string;            // LLM-suggested snake_case column name
      inferredType: 'integer' | 'decimal' | 'text' | 'date' | 'datetime' | 'boolean' | 'json';
      nullable: boolean;
      notes: string;                // e.g., "Contains currency symbols", "Mixed date formats"
    }>;
    skipRows: number[];             // 0-indexed rows to exclude (totals, blanks, metadata)
    needsTranspose: boolean;        // True for pivot-style layouts
    estimatedRowCount: number;
    notes: string;                  // General observations about the table
  }>;
  crossFileHints: string[];         // e.g., "Column X appears to reference data in File Y"
}
```

**Key Behavior**:
- One LLM call per sheet, executed in parallel using the `createConcurrencyLimiter` utility (same pattern as Semantic Models)
- LLM receives: sheet name, sample grid (first 30 rows formatted as a table), last 5 rows, merged cell locations, formula presence flag
- LLM identifies multiple logical tables within a single sheet — common in departmental spreadsheets with stacked tables or side-by-side tables
- Detects pivot-style layouts that need transposition before extraction
- Identifies summary and total rows to exclude from the data
- Uses `withStructuredOutput` for guaranteed structured LLM response with Zod schema validation
- Emits `sheet_analysis` SSE event per sheet with `{ fileId, sheetName, tablesFound, status }`

**LLM Calls**: 1 per sheet (parallel)

**Prompt Strategy**:

```
You are analyzing a spreadsheet sheet to identify data tables.

Sheet: {sheetName} from file: {fileName}
Merged cells: {mergedCellLocations}
Has formulas: {hasFormulas}

## Raw Cell Grid (first 30 rows)
{sampleGrid as formatted markdown table}

## Last 5 Rows
{lastRows as formatted markdown table}

## Your Task
Identify ALL logical data tables in this sheet. A sheet may contain:
- One table starting at row 1 with clean headers
- Multiple tables stacked vertically (separated by empty rows)
- Multiple tables placed side by side
- A table with metadata/title rows above the headers
- A table with summary/total rows below the data
- A pivot-style layout that needs transposing to produce a normalized table

For each logical table found, identify:
1. The exact header row number (0-indexed)
2. Where data rows start and end
3. Which rows to skip (totals, metadata, empty separators)
4. Column names and inferred data types
5. Whether the layout needs transposing

Output a JSON array of logical tables following the schema provided.
```

---

### Phase 3: Schema Designer

**Purpose**: Design the target extraction schema holistically across all files and sheets using a single LLM call.

**Inputs**:
- `sheetAnalyses`: All `SheetAnalysis[]` from Phase 2
- `crossFileHints`: Relationship hints between files from each sheet analysis

**Output**: `ExtractionPlan`

```typescript
interface ExtractionPlan {
  tables: Array<{
    tableName: string;              // Clean, globally unique table name (snake_case)
    description: string;
    sourceFileId: string;
    sourceFileName: string;
    sourceSheetName: string;
    headerRow: number;
    dataStartRow: number;
    dataEndRow: number | null;
    columns: Array<{
      sourceName: string;           // Original column name in sheet
      outputName: string;           // Clean output column name (snake_case)
      outputType: string;           // DuckDB type: INTEGER, VARCHAR, DATE, DOUBLE, BOOLEAN, TIMESTAMP, JSON
      nullable: boolean;
      transformation: string | null; // SQL expression e.g., "CAST AS DATE", "TRIM", "REPLACE(',', '')"
      description: string;
    }>;
    skipRows: number[];
    needsTranspose: boolean;
    estimatedRows: number;
    outputPath: string;             // Planned cloud storage path for the Parquet file
    notes: string;
  }>;
  relationships: Array<{
    fromTable: string;
    fromColumn: string;
    toTable: string;
    toColumn: string;
    confidence: 'high' | 'medium' | 'low';
    notes: string;
  }>;
  catalogMetadata: {
    projectDescription: string;
    domainNotes: string;
    dataQualityNotes: string[];
  };
}
```

**Key Behavior**:
- Single holistic LLM call with all sheet analyses as context
- Resolves naming conflicts — two sheets with a table named "data" become "sales_data" and "inventory_data"
- Identifies cross-file relationships (e.g., customer IDs appearing in multiple files)
- Normalizes repeated reference data into separate tables when appropriate
- Detects overlapping or duplicate data across files
- Assigns DuckDB-compatible output types and plans transformation expressions for type casting and string cleaning
- Uses `withStructuredOutput` for guaranteed structured response
- Emits `extraction_plan` SSE event with full plan summary (table names, column counts, estimated rows)

**LLM Calls**: 1

---

### Phase 4: Review Gate

**Purpose**: Optional pause for user to review and modify the extraction plan before extraction begins.

**Behavior by `reviewMode` configuration**:

**`review` mode (default)**:
- Run status transitions to `review_pending`
- Extraction plan stored in `spreadsheet_runs.extractionPlan`
- SSE event `review_ready` emitted with the full `ExtractionPlan`
- Graph returns `__end__` — execution pauses
- User reviews in the `ExtractionPlanReview` component
- User approves via `POST /api/spreadsheet-agent/runs/:runId/approve` with optional plan modifications in the request body
- A new graph invocation resumes from the Extractor phase with the (possibly modified) plan stored in `planModifications`

**`auto` mode**:
- Phase skipped entirely
- Graph transitions directly from Designer to Extractor
- No user interaction required

**LLM Calls**: 0

---

### Phase 5: Extractor

**Purpose**: Execute data extraction for each planned output table using DuckDB in the Python sandbox.

**Inputs**:
- `extractionPlan`: Table definitions with columns, types, and transformations
- `planModifications`: Optional user modifications from the Review Gate (replaces corresponding tables in `extractionPlan`)
- Source files already present in sandbox temp directory from Phase 1

**Output**: `ExtractionResult[]`

```typescript
interface ExtractionResult {
  tableId: string;
  tableName: string;
  outputPath: string;        // Cloud storage path where Parquet was written
  rowCount: number;
  sizeBytes: number;
  columns: Array<{
    name: string;
    type: string;            // DuckDB type string
    nullCount: number;
  }>;
  status: 'success' | 'failed';
  error?: string;
  durationMs: number;
}
```

**Key Behavior**:
- Per-table parallel extraction using DuckDB in the Python sandbox
- For each output table:
  1. Read source file into DuckDB staging table (`read_xlsx`, `read_csv_auto`, or `read_json_auto`)
  2. Apply row filtering (skip rows, data start and end boundaries)
  3. Apply column transformations (type casting, trimming, cleaning)
  4. Handle transposition if `needsTranspose: true`
  5. `COPY TO` Parquet on cloud storage (via DuckDB `httpfs` or `azure` extension)
- Large files: DuckDB handles chunked processing natively via lazy evaluation — no special streaming logic required
- Error isolation: `Promise.allSettled` per table — one failed table does not abort others
- Emits `table_start`, `table_complete`, and `table_error` SSE events

**DuckDB Extraction Example**:

```python
import duckdb

con = duckdb.connect()
con.install_extension('httpfs')
con.load_extension('httpfs')
con.execute("SET s3_region='us-east-1'")
con.execute("SET s3_access_key_id='...'")
con.execute("SET s3_secret_access_key='...'")

# Read Excel sheet, skip metadata rows, apply types
con.execute("""
    CREATE TABLE staging AS
    SELECT * FROM read_xlsx('/tmp/spreadsheet-agent/{runId}/Sales.xlsx',
        sheet='Sales Data',
        header=true,
        skip=3
    )
""")

# Transform and export to Parquet on S3
con.execute("""
    COPY (
        SELECT
            CAST(col_a AS INTEGER) AS order_id,
            TRIM(col_b) AS customer_name,
            CAST(REPLACE(col_c, ',', '') AS DOUBLE) AS amount,
            CAST(col_d AS DATE) AS order_date
        FROM staging
        WHERE col_a IS NOT NULL
    ) TO 's3://my-bucket/project-uuid/orders.parquet'
    (FORMAT PARQUET, COMPRESSION ZSTD)
""")
```

**LLM Calls**: 0 (may have 1 for SQL repair if extraction fails with a type error)

---

### Phase 6: Validator

**Purpose**: Validate extracted data quality with programmatic checks and optional LLM review.

**Inputs**:
- `extractionPlan`: Expected schema (column names, types, estimated row counts)
- `extractionResults`: Actual extraction results from Phase 5
- `revisionCount`: Current revision cycle count

**Output**: `ValidationReport`

```typescript
interface ValidationReport {
  passed: boolean;
  tables: Array<{
    tableName: string;
    passed: boolean;
    checks: Array<{
      name: string;
      passed: boolean;
      message: string;       // Human-readable description of check result
    }>;
  }>;
  diagnosis: string | null;  // LLM diagnosis if validation failed
  recommendedTarget: 'extractor' | 'schema_designer' | null;
}
```

**Key Behavior**:

Per-table validation checks:
- **Row count sanity**: Extracted count is not zero and not suspiciously different from the estimate (more than 2x or less than 10% of `estimatedRows`)
- **NULL ratio**: Critical columns (non-nullable in plan) do not have a majority NULL ratio (>80%)
- **Type validation**: Parquet file schema matches the planned output types
- **Sample data inspection**: Read first 10 rows from the written Parquet file and verify values are plausible

Optional LLM quality review: send sample rows to LLM for semantic validation when row count or NULL anomalies are detected.

**Revision Routing Logic**:

```typescript
function routeAfterValidation(
  state: SpreadsheetAgentStateType,
): 'persist' | 'extract' | 'design' {
  const report = state.validationReport;
  if (!report || report.passed) return 'persist';
  if (state.revisionCount >= 3) return 'persist'; // Max retries, persist with caveats
  if (report.recommendedTarget === 'schema_designer') return 'design';
  return 'extract';
}
```

- `recommendedTarget: 'schema_designer'` when the schema is fundamentally wrong (wrong column boundaries, wrong header row)
- `recommendedTarget: 'extractor'` when the SQL transformation was wrong (type errors, incorrect skip rows)
- Each revision increments `revisionCount` and updates `revisionDiagnosis` with the LLM's explanation
- After 3 failed revisions, `persist` is called with caveats noted in the catalog manifest

**LLM Calls**: 0–1 (optional quality review)

---

### Phase 7: Persist & Catalog

**Purpose**: Update all database records with final results and generate a data catalog manifest on cloud storage.

**Actions**:

1. Create or update `SpreadsheetTable` records for each successfully extracted table:
   - `outputPath`, `rowCount`, `outputSizeBytes`, `columns` (JSON schema), `status: 'ready'`
2. Update `SpreadsheetProject` aggregate stats:
   - `tableCount`, `totalRows`, `totalSizeBytes`, `status`
3. Update `SpreadsheetRun` with final stats and status (`completed` or `partial`)
4. Generate catalog manifest JSON and upload to cloud storage at `<prefix>/catalog.json`:

```json
{
  "projectId": "uuid",
  "projectName": "Q4 Financial Reports",
  "generatedAt": "2026-02-21T10:30:00Z",
  "storageProvider": "s3",
  "tables": [
    {
      "name": "orders",
      "description": "Customer orders extracted from Sales.xlsx, Orders sheet",
      "parquetPath": "s3://my-bucket/project-uuid/orders.parquet",
      "rowCount": 15234,
      "sizeBytes": 1048576,
      "columns": [
        {
          "name": "order_id",
          "type": "INTEGER",
          "nullable": false,
          "description": "Unique order identifier"
        },
        {
          "name": "customer_name",
          "type": "VARCHAR",
          "nullable": false,
          "description": "Name of the customer"
        },
        {
          "name": "amount",
          "type": "DOUBLE",
          "nullable": false,
          "description": "Order total amount"
        },
        {
          "name": "order_date",
          "type": "DATE",
          "nullable": false,
          "description": "Date the order was placed"
        }
      ],
      "sourceFile": "Sales.xlsx",
      "sourceSheet": "Orders",
      "extractionNotes": ""
    }
  ],
  "relationships": [
    {
      "fromTable": "orders",
      "fromColumn": "customer_id",
      "toTable": "customers",
      "toColumn": "id",
      "confidence": "high"
    }
  ],
  "dataQualityNotes": [
    "orders.amount: 3 rows contained currency symbols that were stripped during extraction"
  ],
  "revisionCycles": 0,
  "tokensUsed": { "prompt": 12450, "completion": 3210, "total": 15660 }
}
```

**LLM Calls**: 0

---

## Storage Provider Abstraction

### StorageProvider Interface

```typescript
interface StorageProvider {
  upload(key: string, data: Buffer | Readable, contentType?: string): Promise<void>;
  download(key: string): Promise<Buffer>;
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  list(prefix: string): Promise<string[]>;
}
```

### Implementations

**S3StorageProvider** (`@aws-sdk/client-s3`):
- Configured via `SPREADSHEET_S3_BUCKET`, `SPREADSHEET_S3_REGION`, `SPREADSHEET_S3_ACCESS_KEY`, `SPREADSHEET_S3_SECRET_KEY`
- Signed URLs via `@aws-sdk/s3-request-presigner` (default 1 hour expiry)
- Prefix deletion via `ListObjectsV2` + `DeleteObjects` (batched, max 1000 per request)

**AzureBlobStorageProvider** (`@azure/storage-blob`):
- Configured via `SPREADSHEET_AZURE_CONNECTION_STRING`, `SPREADSHEET_AZURE_CONTAINER`
- SAS token URLs for signed downloads (delegated key or account key method)
- Prefix deletion via `listBlobsFlat` + `deleteBlob`

**MinIO** (local development):
- Uses `S3StorageProvider` with custom endpoint configured via `SPREADSHEET_MINIO_ENDPOINT`
- S3-compatible API requires zero code changes
- Default bucket created automatically on startup if it does not exist

### DuckDB Cloud Storage Integration

DuckDB in the Python sandbox writes Parquet directly to cloud storage using provider-specific extensions:

**S3 / MinIO (via `httpfs` extension)**:

```python
con.execute("INSTALL httpfs; LOAD httpfs;")
con.execute(f"SET s3_region='{region}'")
con.execute(f"SET s3_access_key_id='{access_key}'")
con.execute(f"SET s3_secret_access_key='{secret_key}'")
# For MinIO only:
con.execute(f"SET s3_endpoint='{minio_endpoint}'")
con.execute(f"SET s3_use_ssl=false")
con.execute(f"COPY table TO 's3://{bucket}/{key}' (FORMAT PARQUET, COMPRESSION ZSTD)")
```

**Azure Blob Storage (via `azure` extension)**:

```python
con.execute("INSTALL azure; LOAD azure;")
con.execute(f"SET azure_storage_connection_string='{conn_string}'")
con.execute(f"COPY table TO 'az://{container}/{key}' (FORMAT PARQUET, COMPRESSION ZSTD)")
```

### Storage Key Naming Convention

```
<outputPrefix>/<projectId>/
  <tableName>.parquet         # Extracted table Parquet file
  catalog.json                # Data catalog manifest
  source/
    <fileId>-<fileName>       # Uploaded source file
```

Example: `spreadsheet-agent/proj-uuid-123/orders.parquet`

---

## Parallel Processing

Three levels of parallelism are applied, using the `createConcurrencyLimiter` utility identical to the one in the Semantic Models agent (`apps/api/src/semantic-models/agent/utils/concurrency.ts`).

### File-Level Parallelism (Phase 1: Ingest)

- Multiple files are downloaded from cloud storage and inventoried concurrently
- Each file's sheets are enumerated independently
- `Promise.allSettled` ensures one file's failure does not block others
- Progress is emitted per file via `file_start` and `file_complete` SSE events

### Sheet-Level Parallelism (Phase 2: Analyzer)

- Multiple sheets are analyzed by the LLM concurrently
- Each sheet receives an independent, self-contained LLM call with its own sample grid
- No cross-sheet dependencies exist during analysis — sheets are fully independent
- Progress emitted per sheet via `sheet_analysis` SSE event

### Table-Level Parallelism (Phase 5: Extractor)

- Multiple output tables are extracted concurrently via DuckDB in the Python sandbox
- Each table's DuckDB extraction is independent (separate `con.execute` calls or separate connections)
- Parquet files written in parallel to cloud storage
- `Promise.allSettled` ensures one table failure does not cancel others

### Configuration

```bash
SPREADSHEET_AGENT_CONCURRENCY=5  # Default: 5, Range: 1–20
```

The value is clamped to the 1–20 range at runtime. Values outside this range default to 5. Setting to 1 disables parallelism (sequential processing only).

### Performance Impact

| Concurrency | Files | Sheets | Estimated Time | Speedup |
|-------------|-------|--------|----------------|---------|
| 1 (sequential) | 10 | 30 | ~150s | 1x |
| 5 (default) | 10 | 30 | ~30s | 5x |
| 10 | 10 | 30 | ~15s | 10x |
| 20 | 10 | 30 | ~8s | ~18x (diminishing returns at LLM rate limits) |

**Key Observations**:
- Linear speedup up to the number of concurrent files/sheets/tables
- No quality degradation — each LLM call is self-contained
- Token usage unchanged (same number of LLM calls, only timing differs)
- LLM API rate limits are the primary constraint above concurrency=10

---

## State Schema

```typescript
import { Annotation } from '@langchain/langgraph';

export const SpreadsheetAgentState = Annotation.Root({
  // ─── Inputs (set once at invocation) ───
  runId: Annotation<string>,
  projectId: Annotation<string>,
  userId: Annotation<string>,
  files: Annotation<ProjectFile[]>,
  config: Annotation<RunConfig>,

  // ─── Phase Artifacts ───
  fileInventory: Annotation<FileInventory[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  sheetAnalyses: Annotation<SheetAnalysis[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  extractionPlan: Annotation<ExtractionPlan | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  planModifications: Annotation<PlanModification[] | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  extractionResults: Annotation<ExtractionResult[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  validationReport: Annotation<ValidationReport | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // ─── Control Flow ───
  currentPhase: Annotation<string | null>({
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

  // ─── Tracking ───
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
});

export type SpreadsheetAgentStateType = typeof SpreadsheetAgentState.State;
```

### Key State Fields

| Field | Type | Purpose |
|-------|------|---------|
| `files` | `ProjectFile[]` | Input: project files with storage paths and metadata |
| `config` | `RunConfig` | Input: `reviewMode`, concurrency, storage credentials |
| `fileInventory` | `FileInventory[]` | Phase 1 output: raw structural metadata per file |
| `sheetAnalyses` | `SheetAnalysis[]` | Phase 2 output: LLM analysis per sheet |
| `extractionPlan` | `ExtractionPlan` | Phase 3 output: full extraction plan with all output tables |
| `planModifications` | `PlanModification[]` | Phase 4 output: user-submitted edits to the plan |
| `extractionResults` | `ExtractionResult[]` | Phase 5 output: per-table extraction results |
| `validationReport` | `ValidationReport` | Phase 6 output: pass/fail with per-table checks |
| `revisionCount` | `number` | Tracks revision loop iterations (max 3) |
| `revisionDiagnosis` | `string` | LLM explanation of why validation failed |
| `tokensUsed` | `TokenUsage` | Accumulating reducer: total across all phases |

---

## Graph Definition

```typescript
import { StateGraph, START, END } from '@langchain/langgraph';

const graph = new StateGraph(SpreadsheetAgentState)
  .addNode('ingest', ingestNode)
  .addNode('analyze', analyzeNode)
  .addNode('design', designNode)
  .addNode('extract', extractNode)
  .addNode('validate', validateNode)
  .addNode('persist', persistNode)
  .addEdge(START, 'ingest')
  .addEdge('ingest', 'analyze')
  .addEdge('analyze', 'design')
  .addConditionalEdges('design', routeAfterDesign)
  .addEdge('extract', 'validate')
  .addConditionalEdges('validate', routeAfterValidation)
  .addEdge('persist', END);

function routeAfterDesign(
  state: SpreadsheetAgentStateType,
): 'extract' | '__end__' {
  if (state.config.reviewMode === 'review') {
    return '__end__'; // Pause for user review — graph resumes via a new invocation
  }
  return 'extract';
}

function routeAfterValidation(
  state: SpreadsheetAgentStateType,
): 'persist' | 'extract' | 'design' {
  const report = state.validationReport;
  if (!report || report.passed) return 'persist';
  if (state.revisionCount >= 3) return 'persist'; // Max retries reached, persist with caveats
  if (report.recommendedTarget === 'schema_designer') return 'design';
  return 'extract';
}
```

### Graph Resume After Review

When review mode is enabled and the graph pauses at `__end__` after the Designer, the following sequence occurs:

1. `SpreadsheetRun.status` is set to `review_pending`
2. `SpreadsheetRun.extractionPlan` stores the full `ExtractionPlan`
3. Frontend displays the `ExtractionPlanReview` component
4. User edits table names, column types, skips tables they don't want
5. User calls `POST /api/spreadsheet-agent/runs/:runId/approve` with optional `modifications` body
6. Backend creates a **new** graph invocation starting at the `extract` node with:
   - `extractionPlan` from the run record
   - `planModifications` from the approve request body
7. Graph executes Extractor → Validator → Persist normally

---

## SSE Streaming

### Endpoint

```http
POST /api/spreadsheet-agent/runs/:runId/stream
```

**Permission**: `spreadsheet_agent:write`

**Mechanism**: Identical to Semantic Models — Fastify `res.hijack()` prevents automatic response termination, keep-alive heartbeat every 30 seconds, `streamMode: 'updates'` for LangGraph state updates.

**Content-Type**: `text/event-stream`

### SSE Event Types

| Event | Payload | Description |
|-------|---------|-------------|
| `run_start` | `{}` | Agent execution started |
| `phase_start` | `{ phase, label }` | Phase started (ingest, analyze, design, extract, validate, persist) |
| `phase_complete` | `{ phase }` | Phase completed successfully |
| `file_start` | `{ fileId, fileName, fileType }` | File ingestion started |
| `file_complete` | `{ fileId, fileName, sheetCount }` | File inventory completed |
| `file_error` | `{ fileId, fileName, error }` | File processing failed |
| `sheet_analysis` | `{ fileId, sheetName, tablesFound, status }` | Sheet analysis result |
| `progress` | `{ completedFiles, totalFiles, completedSheets, totalSheets, completedTables, totalTables, percentComplete }` | Overall progress update |
| `extraction_plan` | `{ tables: Array<{ name, columns, sourceFile, sourceSheet, estimatedRows }> }` | Schema Designer output summary |
| `review_ready` | `{ extractionPlan }` | Review gate reached, execution paused, waiting for user approval |
| `table_start` | `{ tableId, tableName }` | Table extraction started |
| `table_complete` | `{ tableId, tableName, rowCount, sizeBytes }` | Table extraction completed |
| `table_error` | `{ tableId, tableName, error }` | Table extraction failed |
| `validation_result` | `{ tableId, passed, checks }` | Per-table validation result |
| `token_update` | `{ phase, tokensUsed: { prompt, completion, total } }` | Per-phase token usage update |
| `text` | `{ content }` | Status text or progress description (markdown) |
| `run_complete` | `{ projectId, tablesExtracted, totalRows, tokensUsed, durationMs }` | Agent completed successfully |
| `run_error` | `{ message }` | Agent failed with unrecoverable error |

### SSE Event Examples

```typescript
// Phase start
event: phase_start
data: {"phase":"analyze","label":"Analyzing sheet structure"}

// Sheet analysis result
event: sheet_analysis
data: {"fileId":"uuid","sheetName":"Orders","tablesFound":1,"status":"analyzed"}

// Extraction plan ready
event: extraction_plan
data: {"tables":[{"name":"orders","columns":4,"sourceFile":"Sales.xlsx","sourceSheet":"Orders","estimatedRows":15234}]}

// Review gate (review mode only)
event: review_ready
data: {"extractionPlan":{"tables":[...],"relationships":[...],"catalogMetadata":{...}}}

// Table extraction complete
event: table_complete
data: {"tableId":"uuid","tableName":"orders","rowCount":15234,"sizeBytes":1048576}

// Token update per phase
event: token_update
data: {"phase":"analyze","tokensUsed":{"prompt":4521,"completion":1203,"total":5724}}

// Run complete
event: run_complete
data: {"projectId":"uuid","tablesExtracted":5,"totalRows":67890,"tokensUsed":{"prompt":15000,"completion":4200,"total":19200},"durationMs":45320}
```

### Frontend SSE Parsing

```typescript
const response = await fetch(`/api/spreadsheet-agent/runs/${runId}/stream`, {
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

  const parts = buffer.split('\n\n');
  buffer = parts.pop() || '';

  for (const part of parts) {
    if (part.startsWith('data: ')) {
      const event = JSON.parse(part.slice(6));
      handleSpreadsheetEvent(event);
    }
  }
}
```

**Key Points**:
- Use `fetch()` + `ReadableStream`, not `EventSource` — required for POST method with auth headers
- Include a 100ms delay before fetch in `useEffect` to handle React StrictMode double-firing
- Keep-alive heartbeat (`: keep-alive\n\n`) prevents proxy and CDN timeouts

---

## Database Schema

### Prisma Models

Located in `apps/api/prisma/schema.prisma`:

```prisma
enum SpreadsheetProjectStatus {
  draft
  processing
  review_pending
  ready
  failed
  partial
}

enum SpreadsheetFileStatus {
  pending
  analyzing
  analyzed
  extracting
  ready
  failed
}

enum SpreadsheetTableStatus {
  pending
  extracting
  ready
  failed
}

enum SpreadsheetRunStatus {
  pending
  ingesting
  analyzing
  designing
  review_pending
  extracting
  validating
  persisting
  completed
  failed
  cancelled
}

model SpreadsheetProject {
  id              String                    @id @default(uuid()) @db.Uuid
  name            String                    @db.VarChar(255)
  description     String?                   @db.Text
  status          SpreadsheetProjectStatus  @default(draft)
  storageProvider String                    @map("storage_provider") @db.VarChar(20)  // 's3' | 'azure' | 'minio'
  outputBucket    String                    @map("output_bucket") @db.VarChar(255)
  outputPrefix    String                    @map("output_prefix") @db.VarChar(500)
  reviewMode      String                    @default("review") @map("review_mode") @db.VarChar(20)  // 'review' | 'auto'
  fileCount       Int                       @default(0) @map("file_count")
  tableCount      Int                       @default(0) @map("table_count")
  totalRows       BigInt                    @default(0) @map("total_rows")
  totalSizeBytes  BigInt                    @default(0) @map("total_size_bytes")
  createdByUserId String?                   @map("created_by_user_id") @db.Uuid
  createdAt       DateTime                  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime                  @updatedAt @map("updated_at") @db.Timestamptz

  // Relations
  createdByUser User?                @relation("UserSpreadsheetProjects", fields: [createdByUserId], references: [id], onDelete: SetNull)
  files         SpreadsheetFile[]    @relation("ProjectFiles")
  tables        SpreadsheetTable[]   @relation("ProjectTables")
  runs          SpreadsheetRun[]     @relation("ProjectRuns")

  @@index([createdByUserId])
  @@index([status])
  @@map("spreadsheet_projects")
}

model SpreadsheetFile {
  id              String               @id @default(uuid()) @db.Uuid
  projectId       String               @map("project_id") @db.Uuid
  storageObjectId String?              @map("storage_object_id") @db.Uuid  // FK to storage_objects if uploaded via storage API
  fileName        String               @map("file_name") @db.VarChar(255)
  fileType        String               @map("file_type") @db.VarChar(20)   // 'xlsx' | 'csv' | 'json' | etc.
  fileSizeBytes   BigInt               @map("file_size_bytes")
  fileHash        String               @map("file_hash") @db.VarChar(64)   // SHA-256 hex for change detection
  storagePath     String               @map("storage_path") @db.VarChar(1000)
  sheetCount      Int                  @default(0) @map("sheet_count")
  status          SpreadsheetFileStatus @default(pending)
  analysis        Json?                // Stored SheetAnalysis[] for this file
  errorMessage    String?              @map("error_message") @db.Text
  createdAt       DateTime             @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime             @updatedAt @map("updated_at") @db.Timestamptz

  // Relations
  project SpreadsheetProject  @relation("ProjectFiles", fields: [projectId], references: [id], onDelete: Cascade)
  tables  SpreadsheetTable[]  @relation("FileTables")

  @@index([projectId])
  @@index([status])
  @@map("spreadsheet_files")
}

model SpreadsheetTable {
  id               String                 @id @default(uuid()) @db.Uuid
  projectId        String                 @map("project_id") @db.Uuid
  fileId           String                 @map("file_id") @db.Uuid
  sheetName        String                 @map("sheet_name") @db.VarChar(255)
  tableName        String                 @map("table_name") @db.VarChar(255)
  description      String?                @db.Text
  columns          Json                   // Array of { name, type, nullable, nullCount, description }
  rowCount         BigInt                 @default(0) @map("row_count")
  outputPath       String?                @map("output_path") @db.VarChar(1000)  // Cloud storage path to Parquet
  outputSizeBytes  BigInt                 @default(0) @map("output_size_bytes")
  status           SpreadsheetTableStatus @default(pending)
  errorMessage     String?                @map("error_message") @db.Text
  extractionNotes  String?                @map("extraction_notes") @db.Text  // Caveats from revision cycles
  createdAt        DateTime               @default(now()) @map("created_at") @db.Timestamptz
  updatedAt        DateTime               @updatedAt @map("updated_at") @db.Timestamptz

  // Relations
  project SpreadsheetProject @relation("ProjectTables", fields: [projectId], references: [id], onDelete: Cascade)
  file    SpreadsheetFile    @relation("FileTables", fields: [fileId], references: [id], onDelete: Cascade)

  @@index([projectId])
  @@index([fileId])
  @@index([status])
  @@map("spreadsheet_tables")
}

model SpreadsheetRun {
  id                      String                @id @default(uuid()) @db.Uuid
  projectId               String                @map("project_id") @db.Uuid
  status                  SpreadsheetRunStatus  @default(pending)
  currentPhase            String?               @map("current_phase") @db.VarChar(50)
  progress                Json?                 // { completedFiles, totalFiles, completedSheets, totalSheets, completedTables, totalTables, percentComplete }
  extractionPlan          Json?                 @map("extraction_plan")          // Full ExtractionPlan stored during review_pending
  extractionPlanModified  Json?                 @map("extraction_plan_modified") // User-submitted plan modifications
  config                  Json?                 // RunConfig: { reviewMode, concurrency, ... }
  stats                   Json?                 // Final stats: { tablesExtracted, totalRows, totalSizeBytes, tokensUsed, revisionCycles }
  errorMessage            String?               @map("error_message") @db.Text
  startedAt               DateTime?             @map("started_at") @db.Timestamptz
  completedAt             DateTime?             @map("completed_at") @db.Timestamptz
  createdByUserId         String?               @map("created_by_user_id") @db.Uuid
  createdAt               DateTime              @default(now()) @map("created_at") @db.Timestamptz
  updatedAt               DateTime              @updatedAt @map("updated_at") @db.Timestamptz

  // Relations
  project       SpreadsheetProject @relation("ProjectRuns", fields: [projectId], references: [id], onDelete: Cascade)
  createdByUser User?              @relation("UserSpreadsheetRuns", fields: [createdByUserId], references: [id], onDelete: SetNull)

  @@index([projectId])
  @@index([status])
  @@index([createdByUserId])
  @@map("spreadsheet_runs")
}
```

### Field Definitions (SpreadsheetProject)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | Primary key |
| `name` | String | Yes | User-defined project name |
| `description` | String | No | Optional project description |
| `status` | Enum | Yes | Project status (draft, processing, review_pending, ready, failed, partial) |
| `storageProvider` | String | Yes | Cloud storage backend: `s3`, `azure`, or `minio` |
| `outputBucket` | String | Yes | Destination bucket or container name |
| `outputPrefix` | String | Yes | Prefix path within the bucket |
| `reviewMode` | String | Yes | `review` (default) or `auto` |
| `fileCount` | Int | Yes | Number of files in the project (default: 0) |
| `tableCount` | Int | Yes | Number of extracted tables (default: 0) |
| `totalRows` | BigInt | Yes | Total rows across all extracted tables |
| `totalSizeBytes` | BigInt | Yes | Total Parquet output size in bytes |
| `createdByUserId` | UUID | No | Foreign key to `users.id` (nullable, for audit tracking) |

### Field Definitions (SpreadsheetRun)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | Primary key |
| `projectId` | UUID | Yes | Foreign key to `spreadsheet_projects.id` (Cascade) |
| `status` | Enum | Yes | Run status across all 11 possible states |
| `currentPhase` | String | No | Active agent phase name for live status display |
| `progress` | JSONB | No | Real-time progress counters for SSE and polling |
| `extractionPlan` | JSONB | No | Full `ExtractionPlan` stored when `status = review_pending` |
| `extractionPlanModified` | JSONB | No | User-submitted modifications applied at resume |
| `config` | JSONB | No | Run configuration (reviewMode, concurrency, provider credentials references) |
| `stats` | JSONB | No | Final statistics populated on completion |
| `startedAt` | Timestamp | No | When agent execution began |
| `completedAt` | Timestamp | No | When agent execution finished |

### Indexes

- `spreadsheet_projects.createdByUserId` — Filter projects by creator
- `spreadsheet_projects.status` — Filter by project status
- `spreadsheet_files.projectId` — Find files for a project
- `spreadsheet_files.status` — Filter files by status
- `spreadsheet_tables.projectId` — Find tables for a project
- `spreadsheet_tables.fileId` — Find tables extracted from a specific file
- `spreadsheet_tables.status` — Filter tables by extraction status
- `spreadsheet_runs.projectId` — Find runs for a project
- `spreadsheet_runs.status` — Filter runs by status
- `spreadsheet_runs.createdByUserId` — Audit trail by user

---

## API Endpoints

All endpoints require authentication. Base path: `/api/spreadsheet-agent`

---

### Projects

#### 1. List Projects

```http
GET /api/spreadsheet-agent/projects
```

**Query Parameters:**
- `page` (number, default: 1) — Page number
- `pageSize` (number, default: 20) — Items per page (max: 100)
- `search` (string, optional) — Search in name and description
- `status` (enum, optional) — Filter by status (draft, processing, review_pending, ready, failed, partial)
- `sortBy` (enum, default: `createdAt`) — Sort field (name, status, createdAt, tableCount, totalRows)
- `sortOrder` (enum, default: `desc`) — Sort direction (asc, desc)

**Permission:** `spreadsheet_agent:read`

**Response (200):**
```json
{
  "data": {
    "items": [
      {
        "id": "uuid",
        "name": "Q4 Financial Reports",
        "description": "Quarterly financial spreadsheets from all departments",
        "status": "ready",
        "storageProvider": "s3",
        "reviewMode": "review",
        "fileCount": 12,
        "tableCount": 28,
        "totalRows": 456789,
        "totalSizeBytes": 12582912,
        "createdByUserId": "uuid",
        "createdAt": "2026-02-01T10:00:00Z",
        "updatedAt": "2026-02-01T14:30:00Z"
      }
    ],
    "total": 8,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```

---

#### 2. Get Project

```http
GET /api/spreadsheet-agent/projects/:id
```

**Parameters:**
- `id` (UUID, path) — Project ID

**Permission:** `spreadsheet_agent:read`

**Response (200):** Full project object including aggregate stats.

**Response (404):** Project not found.

---

#### 3. Create Project

```http
POST /api/spreadsheet-agent/projects
```

**Permission:** `spreadsheet_agent:write`

**Request Body:**
```json
{
  "name": "Q4 Financial Reports",
  "description": "Quarterly financial spreadsheets from all departments",
  "storageProvider": "s3",
  "reviewMode": "review"
}
```

**Validation Rules:**
- `name`: Required, 1–255 characters
- `storageProvider`: Required, must be `s3`, `azure`, or `minio`
- `reviewMode`: Optional, defaults to `review`, must be `review` or `auto`

**Response (201):**
```json
{
  "data": {
    "id": "uuid",
    "name": "Q4 Financial Reports",
    "description": "Quarterly financial spreadsheets from all departments",
    "status": "draft",
    "storageProvider": "s3",
    "reviewMode": "review",
    "fileCount": 0,
    "tableCount": 0,
    "totalRows": 0,
    "totalSizeBytes": 0,
    "createdByUserId": "uuid",
    "createdAt": "2026-02-21T10:00:00Z",
    "updatedAt": "2026-02-21T10:00:00Z"
  }
}
```

**Side Effects:**
- Resolves `outputBucket` and `outputPrefix` from environment configuration for the selected provider

---

#### 4. Update Project

```http
PATCH /api/spreadsheet-agent/projects/:id
```

**Permission:** `spreadsheet_agent:write`

**Request Body:**
```json
{
  "name": "Q4 2025 Financial Reports",
  "description": "Updated description",
  "reviewMode": "auto"
}
```

**Validation Rules:**
- Only `name`, `description`, and `reviewMode` are updatable
- Cannot change `storageProvider` after project creation

**Response (200):** Updated project object.

**Response (404):** Project not found.

---

#### 5. Delete Project

```http
DELETE /api/spreadsheet-agent/projects/:id
```

**Permission:** `spreadsheet_agent:delete`

**Response (204):** No content (success).

**Response (404):** Project not found.

**Side Effects:**
- Deletes all associated `SpreadsheetFile`, `SpreadsheetTable`, and `SpreadsheetRun` records (CASCADE)
- Deletes all Parquet output files from cloud storage using `StorageProvider.deletePrefix(outputPrefix)`
- Deletes all uploaded source files from cloud storage
- Creates audit event

---

### Files

#### 6. Upload Files to Project

```http
POST /api/spreadsheet-agent/projects/:id/files
```

**Permission:** `spreadsheet_agent:write`

**Content-Type:** `multipart/form-data`

**Form Fields:**
- `files` (File[], required) — One or more spreadsheet files

**Validation Rules:**
- File extension must be in the supported formats list (.xlsx, .xls, .csv, .tsv, .json, .ndjson, .parquet, .orc, .arrow, .ipc)
- File size must not exceed `SPREADSHEET_MAX_FILE_SIZE_MB` (default: 500MB)
- Project must not exceed `SPREADSHEET_MAX_FILES_PER_PROJECT` (default: 50)

**Response (201):**
```json
{
  "data": {
    "uploaded": [
      {
        "id": "uuid",
        "fileName": "Sales_Q4.xlsx",
        "fileType": "xlsx",
        "fileSizeBytes": 2457600,
        "status": "pending",
        "storagePath": "spreadsheet-agent/proj-uuid/source/file-uuid-Sales_Q4.xlsx"
      }
    ],
    "rejected": []
  }
}
```

**Side Effects:**
- Uploads each file to cloud storage under `<outputPrefix>/source/`
- Computes SHA-256 hash and stores in `SpreadsheetFile.fileHash`
- Creates `SpreadsheetFile` record with `status: pending`
- Updates `SpreadsheetProject.fileCount`

---

#### 7. List Files in Project

```http
GET /api/spreadsheet-agent/projects/:id/files
```

**Permission:** `spreadsheet_agent:read`

**Response (200):**
```json
{
  "data": {
    "items": [
      {
        "id": "uuid",
        "fileName": "Sales_Q4.xlsx",
        "fileType": "xlsx",
        "fileSizeBytes": 2457600,
        "fileHash": "sha256hex...",
        "sheetCount": 3,
        "status": "ready",
        "analysis": [...],
        "createdAt": "2026-02-21T10:00:00Z"
      }
    ],
    "total": 12
  }
}
```

---

#### 8. Get File Detail

```http
GET /api/spreadsheet-agent/projects/:id/files/:fileId
```

**Permission:** `spreadsheet_agent:read`

**Response (200):** Full file object including `analysis` (stored `SheetAnalysis[]`).

**Response (404):** File not found or does not belong to this project.

---

#### 9. Delete File

```http
DELETE /api/spreadsheet-agent/projects/:id/files/:fileId
```

**Permission:** `spreadsheet_agent:delete`

**Response (204):** No content (success).

**Response (404):** File not found.

**Response (409):** Cannot delete file while a run is in progress.

**Side Effects:**
- Deletes the source file from cloud storage
- Deletes associated `SpreadsheetTable` records (CASCADE)
- Deletes associated Parquet files from cloud storage for each deleted table
- Updates `SpreadsheetProject.fileCount` and aggregate stats

---

### Tables

#### 10. List Tables in Project

```http
GET /api/spreadsheet-agent/projects/:id/tables
```

**Query Parameters:**
- `page` (number, default: 1)
- `pageSize` (number, default: 20)
- `fileId` (UUID, optional) — Filter by source file
- `status` (enum, optional) — Filter by status (pending, extracting, ready, failed)

**Permission:** `spreadsheet_agent:read`

**Response (200):**
```json
{
  "data": {
    "items": [
      {
        "id": "uuid",
        "projectId": "uuid",
        "fileId": "uuid",
        "fileName": "Sales_Q4.xlsx",
        "sheetName": "Orders",
        "tableName": "orders",
        "description": "Customer orders from Q4 sales report",
        "rowCount": 15234,
        "outputPath": "s3://bucket/prefix/orders.parquet",
        "outputSizeBytes": 1048576,
        "status": "ready",
        "columns": [
          { "name": "order_id", "type": "INTEGER", "nullable": false, "nullCount": 0 }
        ],
        "createdAt": "2026-02-21T10:00:00Z"
      }
    ],
    "total": 28,
    "page": 1,
    "pageSize": 20,
    "totalPages": 2
  }
}
```

---

#### 11. Get Table Detail

```http
GET /api/spreadsheet-agent/projects/:id/tables/:tableId
```

**Permission:** `spreadsheet_agent:read`

**Response (200):** Full table object with complete `columns` schema.

**Response (404):** Table not found or does not belong to this project.

---

#### 12. Preview Table Data

```http
GET /api/spreadsheet-agent/projects/:id/tables/:tableId/preview
```

**Query Parameters:**
- `limit` (number, default: 50, max: 500) — Number of rows to return

**Permission:** `spreadsheet_agent:read`

**Response (200):**
```json
{
  "data": {
    "columns": ["order_id", "customer_name", "amount", "order_date"],
    "rows": [
      [1001, "Acme Corp", 4500.00, "2025-10-01"],
      [1002, "Beta LLC", 1200.50, "2025-10-02"]
    ],
    "rowCount": 50,
    "totalRows": 15234
  }
}
```

**Implementation**: Backend calls `StorageProvider.download(outputPath)` to get the Parquet bytes, then uses the DuckDB Node.js bindings (`duckdb` npm package) to execute `SELECT * FROM parquet_scan(...) LIMIT {limit}` in-process.

**Response (404):** Table not found.

**Response (409):** Table has not been successfully extracted yet (status is not `ready`).

---

#### 13. Get Table Download URL

```http
GET /api/spreadsheet-agent/projects/:id/tables/:tableId/download
```

**Permission:** `spreadsheet_agent:read`

**Response (200):**
```json
{
  "data": {
    "downloadUrl": "https://s3.amazonaws.com/bucket/prefix/orders.parquet?X-Amz-Signature=...",
    "expiresAt": "2026-02-21T11:30:00Z",
    "fileName": "orders.parquet",
    "sizeBytes": 1048576
  }
}
```

**Implementation**: Calls `StorageProvider.getSignedUrl(outputPath, 3600)` (1-hour expiry).

**Response (404):** Table not found.

---

#### 14. Delete Table

```http
DELETE /api/spreadsheet-agent/projects/:id/tables/:tableId
```

**Permission:** `spreadsheet_agent:delete`

**Response (204):** No content (success).

**Side Effects:**
- Deletes Parquet file from cloud storage
- Updates `SpreadsheetProject` aggregate stats (decrements `tableCount`, `totalRows`, `totalSizeBytes`)

---

### Runs

#### 15. Create Run

```http
POST /api/spreadsheet-agent/runs
```

**Permission:** `spreadsheet_agent:write`

**Request Body:**
```json
{
  "projectId": "uuid",
  "config": {
    "reviewMode": "review",
    "concurrency": 5
  }
}
```

**Validation Rules:**
- `projectId`: Required, must be a valid accessible project
- Project must have at least 1 file with `status: pending` or `status: analyzed`
- Project must not have another run with `status` in (`pending`, `ingesting`, `analyzing`, `designing`, `extracting`, `validating`, `persisting`)

**Response (201):**
```json
{
  "data": {
    "id": "uuid",
    "projectId": "uuid",
    "status": "pending",
    "config": { "reviewMode": "review", "concurrency": 5 },
    "createdAt": "2026-02-21T10:00:00Z"
  }
}
```

**Side Effects:**
- Creates `SpreadsheetRun` record with `status: pending`
- Agent execution starts asynchronously when the SSE streaming endpoint is called

---

#### 16. Get Run Status

```http
GET /api/spreadsheet-agent/runs/:runId
```

**Permission:** `spreadsheet_agent:read`

**Response (200):**
```json
{
  "data": {
    "id": "uuid",
    "projectId": "uuid",
    "status": "analyzing",
    "currentPhase": "analyze",
    "progress": {
      "completedFiles": 3,
      "totalFiles": 12,
      "completedSheets": 9,
      "totalSheets": 36,
      "completedTables": 0,
      "totalTables": 0,
      "percentComplete": 25
    },
    "startedAt": "2026-02-21T10:00:00Z"
  }
}
```

**Response (404):** Run not found.

---

#### 17. Stream Run Progress

```http
POST /api/spreadsheet-agent/runs/:runId/stream
```

**Permission:** `spreadsheet_agent:write`

**Response:** SSE stream (see [SSE Streaming](#sse-streaming) section for full event type reference).

**Error Responses:**
- **409 Conflict** — Run already executing (atomic claim check failed)
- **404 Not Found** — Run not found
- **400 Bad Request** — Run is in a terminal state (completed, failed, cancelled)

---

#### 18. Cancel Run

```http
POST /api/spreadsheet-agent/runs/:runId/cancel
```

**Permission:** `spreadsheet_agent:write`

**Response (200):**
```json
{
  "data": {
    "id": "uuid",
    "status": "cancelled"
  }
}
```

**Response (400):** Run is already completed or failed.

**Response (404):** Run not found.

**Side Effects:**
- Sets `SpreadsheetRun.status` to `cancelled`
- LangGraph execution is aborted via AbortController signal
- Partially extracted Parquet files are left on cloud storage (not deleted automatically)

---

#### 19. Approve Extraction Plan

```http
POST /api/spreadsheet-agent/runs/:runId/approve
```

**Permission:** `spreadsheet_agent:write`

**Request Body:**
```json
{
  "modifications": [
    {
      "tableName": "orders",
      "action": "include",
      "overrides": {
        "tableName": "customer_orders",
        "columns": [
          { "outputName": "order_id", "outputType": "INTEGER" },
          { "outputName": "amount", "outputType": "DOUBLE" }
        ]
      }
    },
    {
      "tableName": "summary_totals",
      "action": "skip"
    }
  ]
}
```

**Validation Rules:**
- Run must have `status: review_pending`
- `tableName` in modifications must match a table in the stored `extractionPlan`
- `action` must be `include` or `skip`

**Response (200):**
```json
{
  "data": {
    "id": "uuid",
    "status": "pending",
    "message": "Extraction plan approved. Connect to the stream endpoint to resume processing."
  }
}
```

**Response (400):** Run is not in `review_pending` status.

**Response (404):** Run not found.

**Side Effects:**
- Stores `modifications` in `SpreadsheetRun.extractionPlanModified`
- Resets `SpreadsheetRun.status` to `pending` to allow new SSE streaming invocation
- Client must reconnect to `POST /runs/:runId/stream` to resume extraction

---

## Security

### File Processing Safety

- Source files are processed read-only — the agent never modifies uploaded source files
- Extracted Parquet files are written to cloud storage only (never served directly from the API)
- Signed URLs for Parquet downloads are time-limited (default 1 hour expiry)

### Python Sandbox Isolation

The Python sandbox is identical to the Data Agent sandbox:
- Isolated Docker container (`--network none` — no external network access)
- Read-only filesystem except `/tmp`
- 512MB memory limit enforced by Docker
- 30-second execution timeout enforced by the sandbox Flask server
- No environment variables or secrets passed into the sandbox
- Pre-installed packages only — no runtime `pip install`
- Cloud storage credentials are passed per-execution and not persisted

### Cloud Storage Security

- Credentials stored as environment variables only (never in the database or exposed to frontend)
- Signed URLs generated server-side for Parquet downloads (frontend never receives raw credentials)
- Storage prefix isolation: each project uses a unique prefix (`<outputPrefix>/<projectId>/`)
- MinIO in development uses internal Docker network only — never exposed externally

### Input Validation

- File type validated by extension and MIME type content inspection
- File size enforced at upload time (configurable `SPREADSHEET_MAX_FILE_SIZE_MB`)
- Maximum files per project enforced at upload time (configurable `SPREADSHEET_MAX_FILES_PER_PROJECT`)
- No user-supplied SQL execution — all SQL is generated by the agent

### RBAC Enforcement

- All endpoints require JWT authentication
- Permission checks enforced via `@Auth` decorator on all controller methods
- Permission check: run ownership is validated before allowing `approve` or `cancel`

### LLM API Key Security

LLM provider API keys are stored as environment variables:
- **OpenAI**: `OPENAI_API_KEY`
- **Anthropic**: `ANTHROPIC_API_KEY`
- **Azure**: `AZURE_OPENAI_API_KEY`

Keys are never exposed to the frontend or logged.

---

## RBAC Permissions

Defined in `apps/api/src/common/constants/roles.constants.ts`:

```typescript
export const PERMISSIONS = {
  SPREADSHEET_AGENT_READ: 'spreadsheet_agent:read',
  SPREADSHEET_AGENT_WRITE: 'spreadsheet_agent:write',
  SPREADSHEET_AGENT_DELETE: 'spreadsheet_agent:delete',
} as const;
```

### Permission Matrix

| Role | spreadsheet_agent:read | spreadsheet_agent:write | spreadsheet_agent:delete |
|------|------------------------|-------------------------|--------------------------|
| **Admin** | Yes | Yes | Yes |
| **Contributor** | Yes | Yes | Yes |
| **Viewer** | Yes | No | No |

**Note:** Viewers can browse projects, view extracted tables, preview data, and download Parquet files via signed URLs. They cannot upload files, create projects, trigger runs, or delete anything.

### Controller Usage

```typescript
@Get('projects')
@Auth({ permissions: [PERMISSIONS.SPREADSHEET_AGENT_READ] })
@ApiOperation({ summary: 'List spreadsheet projects' })
async listProjects(
  @Query() query: QueryProjectDto,
  @CurrentUser('id') userId: string,
) {
  return this.spreadsheetAgentService.listProjects(query, userId);
}

@Post('projects')
@Auth({ permissions: [PERMISSIONS.SPREADSHEET_AGENT_WRITE] })
@ApiOperation({ summary: 'Create spreadsheet project' })
async createProject(
  @Body() dto: CreateProjectDto,
  @CurrentUser('id') userId: string,
) {
  return this.spreadsheetAgentService.createProject(dto, userId);
}
```

---

## Incremental Re-processing

When a file is re-uploaded to an existing project, the agent performs change detection before re-analyzing:

1. Compute SHA-256 hash of the newly uploaded file bytes
2. Compare with the stored `SpreadsheetFile.fileHash` for a file with the same name in the project
3. **Hash matches (file unchanged)**:
   - Skip re-upload and re-analysis
   - Return the existing `SpreadsheetFile` record in the upload response
   - File status remains `ready` — no re-processing triggered
4. **Hash differs (file changed)**:
   - Upload new file to cloud storage (new `storagePath`)
   - Update `SpreadsheetFile.fileHash` and `storagePath`
   - Delete old extracted tables for this file from the database
   - Delete old Parquet files for this file from cloud storage
   - Reset `SpreadsheetFile.status` to `pending`
   - On the next run, only this file is re-analyzed and re-extracted (other `ready` files are skipped)

### Selective Re-processing in the Ingest Phase

The Ingest phase skips files with `status: ready` and a matching `fileHash`:

```typescript
// In ingestNode
const filesToProcess = files.filter(
  (f) => f.status !== 'ready' || f.fileHash !== computedHash,
);
// Only filesToProcess are downloaded to sandbox and passed to the Analyzer
```

This ensures that a 50-file project where only 2 files changed does not re-analyze and re-extract all 50 files.

---

## Downstream Integration

The Spreadsheet Agent feeds into the broader analytics pipeline:

```
Spreadsheets → [Spreadsheet Agent] → Parquet on S3 / Azure / MinIO
                                              │
                              ┌───────────────┴────────────────────────┐
                              │                                        │
                              ▼                                        ▼
              [Register as Data Connection]            [Direct BI Tool Access]
              (future: DuckDB connection type)         (Parquet over S3 URL)
                              │
                              ▼
              [Semantic Models Agent] → OSI Model
                              │
                              ▼
              [Ontology] → Neo4j Graph
                              │
                              ▼
              [Data Agent] → Natural language queries
```

### Integration Points

- **Parquet Catalog Manifest**: The `catalog.json` file provides table schemas, column types, and row counts for downstream tooling to discover the project's output without querying the API
- **Future Data Connection Support**: A future DuckDB connection type in the Connections module will allow the Semantic Models agent to directly model Parquet files from Spreadsheet Agent projects
- **Signed URL Access**: BI tools can use signed download URLs for one-time Parquet file access

---

## Frontend Components

### 1. SpreadsheetAgentPage

**File:** `apps/web/src/pages/SpreadsheetAgentPage.tsx`

**Purpose:** Main project list page for the Spreadsheet Agent feature.

**Key Features:**
- Table with columns: Name, Status, Files, Tables, Total Rows, Size, Created, Actions
- Search by name and description
- Status filter (All, Draft, Processing, Review Pending, Ready, Failed, Partial)
- Pagination (server-side)
- Status chips with color coding:
  - Draft (gray)
  - Processing (blue with spinner)
  - Review Pending (amber with clock icon)
  - Ready (green)
  - Failed (red)
  - Partial (orange — some tables ready, some failed)
- Action buttons per row: View, Delete (permission-aware)
- "New Project" button — only visible to `spreadsheet_agent:write` users

**State Management:**
```typescript
const {
  projects,
  total,
  page,
  pageSize,
  isLoading,
  error,
  fetchProjects,
  deleteProject,
} = useSpreadsheetProjects();
```

---

### 2. NewSpreadsheetProjectPage

**File:** `apps/web/src/pages/NewSpreadsheetProjectPage.tsx`

**Purpose:** 4-step wizard for creating a new spreadsheet extraction project.

**Steps:**

#### Step 1: Project Setup
- Project name (required, text field)
- Description (optional, textarea)
- Storage provider selection (S3, Azure Blob, MinIO) — shows only providers configured in environment
- Review mode toggle: "Review plan before extraction" (default: on)

#### Step 2: Upload Files
- `FileUploadZone` component with drag-and-drop and click-to-browse
- Multi-file support (add multiple files in one interaction)
- File type badge per file (XLSX, CSV, JSON, etc.)
- File size display per file
- Remove individual files before upload
- Progress bar per file during upload
- Total file count and size summary

#### Step 3: Review Summary
- List of uploaded files with type, size, and upload status
- "Start Processing" button (triggers `POST /api/spreadsheet-agent/runs`)
- Option to add more files before starting
- Review mode indicator

#### Step 4: Processing Progress
- `AgentProgressView` component (SSE-driven)
- Auto-navigates to `SpreadsheetProjectDetailPage` on `run_complete` event

---

### 3. SpreadsheetProjectDetailPage

**File:** `apps/web/src/pages/SpreadsheetProjectDetailPage.tsx`

**Purpose:** Tabbed detail view for an existing project.

**5-Tab Layout:**

#### Tab 1: Overview
- Project name and description (inline editable for `write` permission)
- Storage provider and output path
- Review mode badge
- Aggregate stats: Files, Tables, Total Rows, Total Size
- Status badge
- Created and updated timestamps
- Action buttons: Delete Project (with confirmation dialog), Re-process (triggers new run)

#### Tab 2: Files
- Table: Name, Type, Size, Sheets, Status, Uploaded At, Actions
- Status per file: pending (gray), analyzing (blue), analyzed (blue), extracting (blue), ready (green), failed (red)
- File type icons (XLSX, CSV, JSON)
- Delete file action (with confirmation)
- Upload additional files button

#### Tab 3: Tables
- Table: Name, Source File, Source Sheet, Rows, Size, Status, Actions
- Actions: Preview (opens TablePreview dialog), Download (gets signed URL), Delete
- Status per table: pending, extracting, ready, failed
- Column count badge

#### Tab 4: Runs
- Run history table: Started At, Status, Phase, Duration, Tables Extracted, Token Usage, Actions
- Status per run: pending, ingesting, analyzing, designing, review_pending, extracting, validating, persisting, completed, failed, cancelled
- "Retry" action for failed runs (creates a new run for the same project)
- For `review_pending` runs: "Review Plan" button navigates to `ExtractionPlanReview`

#### Tab 5: Catalog
- JSON manifest preview (syntax-highlighted, formatted)
- Shows: tables, relationships, data quality notes, token usage
- Copy to clipboard button
- Download `catalog.json` button

---

### 4. ExtractionPlanReview

**File:** `apps/web/src/components/spreadsheet-agent/ExtractionPlanReview.tsx`

**Purpose:** Review gate component displayed when a run has `status: review_pending`.

**Key Features:**
- One card per proposed output table
- Each card shows:
  - Proposed table name (editable text field)
  - Source file and sheet name (read-only)
  - Estimated row count
  - Column list: source name → output name (editable), output type (dropdown: INTEGER, DOUBLE, VARCHAR, DATE, TIMESTAMP, BOOLEAN), nullable toggle
  - Per-table toggle: Include / Skip (skip removes from extraction plan)
- Summary header: total tables to extract, total estimated rows
- "Approve" button — calls `POST /runs/:runId/approve` with modifications
- "Cancel" button — returns to project detail

**Props:**
```typescript
interface ExtractionPlanReviewProps {
  runId: string;
  plan: ExtractionPlan;
  onApproved: () => void;
  onCancelled: () => void;
}
```

---

### 5. AgentProgressView

**File:** `apps/web/src/components/spreadsheet-agent/AgentProgressView.tsx`

**Purpose:** SSE-driven progress display during agent execution (reuses patterns from `AgentLog` in Semantic Models).

**Key Features:**
- Overall `LinearProgress` bar (0–100% derived from `progress` event payload)
- Elapsed timer (mm:ss format, same as AgentLog)
- Phase indicator: current phase name displayed (Ingesting, Analyzing, Designing, Extracting, Validating, Persisting)
- Per-file status list during ingestion:
  - File name, type icon, status (downloading → analyzing → analyzed → failed)
- Per-table status list during extraction:
  - Table name, source file, status (extracting → ready → failed), row count on completion
- Log entries with markdown rendering for `text` SSE events
- Token usage display (prompt, completion, total — updated per `token_update` event)
- Success state: "Completed — {N} tables extracted"
- Failure state: "Failed" with error message and retry option

**SSE Connection Pattern** (identical to AgentLog):
```typescript
useEffect(() => {
  const abortController = new AbortController();

  const connectToStream = async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (abortController.signal.aborted) return;

    const token = api.getAccessToken();
    const response = await fetch(
      `/api/spreadsheet-agent/runs/${runId}/stream`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        signal: abortController.signal,
      },
    );

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
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
  return () => abortController.abort();
}, [runId]);
```

---

### 6. FileUploadZone

**File:** `apps/web/src/components/spreadsheet-agent/FileUploadZone.tsx`

**Purpose:** Drag-and-drop multi-file upload area with validation and progress feedback.

**Key Features:**
- Drop zone with dashed border, file icon, and instructional text
- Click-to-browse file picker (accepts supported extensions only)
- Immediate client-side validation: file type and size
- File list below the drop zone with name, type badge, size, and remove button
- Per-file upload progress bar during upload
- Error display per file for validation failures

**Props:**
```typescript
interface FileUploadZoneProps {
  onFilesSelected: (files: File[]) => void;
  onFilesUploaded: (uploadedFiles: SpreadsheetFile[]) => void;
  maxFileSizeMb?: number;   // Default: 500
  maxFiles?: number;        // Default: 50
  disabled?: boolean;
}
```

---

### 7. TablePreview

**File:** `apps/web/src/components/spreadsheet-agent/TablePreview.tsx`

**Purpose:** Dialog component showing first N rows of an extracted Parquet table.

**Key Features:**
- MUI Dialog with scrollable data grid
- Column headers with type indicators (integer icon, text icon, date icon)
- Configurable row limit (default: 50, max: 500 via query param)
- Column count and row count summary in dialog header
- Loading skeleton while fetching preview data

**Props:**
```typescript
interface TablePreviewProps {
  projectId: string;
  tableId: string;
  tableName: string;
  open: boolean;
  onClose: () => void;
}
```

---

### 8. Hooks

#### useSpreadsheetProjects

**File:** `apps/web/src/hooks/useSpreadsheetProjects.ts`

**Purpose:** CRUD and pagination state management for projects (same pattern as `useSemanticModels`).

**State:**
```typescript
const [projects, setProjects] = useState<SpreadsheetProject[]>([]);
const [total, setTotal] = useState(0);
const [page, setPage] = useState(1);
const [pageSize, setPageSize] = useState(20);
const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
```

**Methods:**
```typescript
fetchProjects({ page?, pageSize?, search?, status?, sortBy?, sortOrder? })
getProjectById(id: string)
createProject(data: CreateProjectDto)
updateProject(id: string, data: UpdateProjectDto)
deleteProject(id: string)
uploadFiles(projectId: string, files: File[])
getFiles(projectId: string)
deleteFile(projectId: string, fileId: string)
getTables(projectId: string, query?: QueryTablesDto)
getTablePreview(projectId: string, tableId: string, limit?: number)
getTableDownloadUrl(projectId: string, tableId: string)
deleteTable(projectId: string, tableId: string)
getRuns(projectId: string)
```

---

#### useSpreadsheetRun

**File:** `apps/web/src/hooks/useSpreadsheetRun.ts`

**Purpose:** Run management and SSE streaming state (same pattern as the Data Agent's streaming hook).

**State:**
```typescript
const [run, setRun] = useState<SpreadsheetRun | null>(null);
const [streamEvents, setStreamEvents] = useState<SpreadsheetStreamEvent[]>([]);
const [isStreaming, setIsStreaming] = useState(false);
const [progress, setProgress] = useState<RunProgress | null>(null);
const [tokensUsed, setTokensUsed] = useState({ prompt: 0, completion: 0, total: 0 });
```

**Methods:**
```typescript
createRun(projectId: string, config?: RunConfig)
getRun(runId: string)
startStream(runId: string)
cancelRun(runId: string)
approvePlan(runId: string, modifications?: PlanModification[])
```

---

#### useSpreadsheetUpload

**File:** `apps/web/src/hooks/useSpreadsheetUpload.ts`

**Purpose:** File upload state management with per-file progress tracking.

**State:**
```typescript
const [uploads, setUploads] = useState<Map<string, UploadProgress>>();
// UploadProgress: { file: File, status: 'pending' | 'uploading' | 'done' | 'error', progress: number, error?: string }
```

**Methods:**
```typescript
uploadFiles(projectId: string, files: File[])
removeFile(fileId: string)
clearAll()
```

---

### 9. Routing

```tsx
// In apps/web/src/App.tsx
<Route path="/spreadsheet-agent" element={<SpreadsheetAgentPage />} />
<Route path="/spreadsheet-agent/new" element={<NewSpreadsheetProjectPage />} />
<Route path="/spreadsheet-agent/:id" element={<SpreadsheetProjectDetailPage />} />
```

**Sidebar Entry** (in `apps/web/src/components/navigation/Sidebar.tsx`):

```tsx
import TableViewIcon from '@mui/icons-material/TableView';

<RequirePermission permission="spreadsheet_agent:read">
  <ListItem button component={Link} to="/spreadsheet-agent">
    <ListItemIcon>
      <TableViewIcon />
    </ListItemIcon>
    <ListItemText primary="Spreadsheet Agent" />
  </ListItem>
</RequirePermission>
```

---

## Configuration

### New Environment Variables

```bash
# ── Spreadsheet Agent: Concurrency ─────────────────────────────────
# Number of files/sheets/tables processed in parallel
# Range: 1–20. Values outside this range are clamped to 5 (default).
SPREADSHEET_AGENT_CONCURRENCY=5

# ── Spreadsheet Agent: Limits ───────────────────────────────────────
# Maximum single file size accepted at upload (in megabytes)
SPREADSHEET_MAX_FILE_SIZE_MB=500

# Maximum number of files per project
SPREADSHEET_MAX_FILES_PER_PROJECT=50

# ── Spreadsheet Agent: Storage Provider ────────────────────────────
# Which cloud storage backend to use for source files and Parquet output
# Options: s3 | azure | minio
SPREADSHEET_STORAGE_PROVIDER=s3

# ── Spreadsheet Agent: S3 Configuration ────────────────────────────
# (Required when SPREADSHEET_STORAGE_PROVIDER=s3 or minio)
SPREADSHEET_S3_BUCKET=my-spreadsheet-bucket
SPREADSHEET_S3_REGION=us-east-1
SPREADSHEET_S3_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE
SPREADSHEET_S3_SECRET_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
# Optional: output prefix within the bucket (default: spreadsheet-agent)
SPREADSHEET_S3_OUTPUT_PREFIX=spreadsheet-agent

# ── Spreadsheet Agent: MinIO Configuration ─────────────────────────
# (Required when SPREADSHEET_STORAGE_PROVIDER=minio)
# Uses S3StorageProvider internally with a custom endpoint
SPREADSHEET_MINIO_ENDPOINT=http://minio:9000
# Uses SPREADSHEET_S3_BUCKET, SPREADSHEET_S3_ACCESS_KEY, SPREADSHEET_S3_SECRET_KEY

# ── Spreadsheet Agent: Azure Blob Configuration ─────────────────────
# (Required when SPREADSHEET_STORAGE_PROVIDER=azure)
SPREADSHEET_AZURE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...
SPREADSHEET_AZURE_CONTAINER=spreadsheet-agent
# Optional: output prefix within the container (default: spreadsheet-agent)
SPREADSHEET_AZURE_OUTPUT_PREFIX=spreadsheet-agent
```

### Existing LLM Provider Variables (No Changes)

The Spreadsheet Agent uses the same LLM provider environment variables as Semantic Models and Data Agent:

```bash
LLM_DEFAULT_PROVIDER=openai    # openai | anthropic | azure
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_DEPLOYMENT=gpt-4o
AZURE_OPENAI_API_VERSION=2024-02-01
```

### Docker Compose Integration

Add MinIO service for local development in `infra/compose/dev.compose.yml`:

```yaml
minio:
  image: minio/minio:latest
  command: server /data --console-address ":9001"
  environment:
    MINIO_ROOT_USER: minioadmin
    MINIO_ROOT_PASSWORD: minioadmin
  ports:
    - "9000:9000"   # S3 API
    - "9001:9001"   # Web console
  volumes:
    - minio_data:/data

volumes:
  minio_data:
```

Add environment variables to the `api` service in `base.compose.yml`:

```yaml
api:
  environment:
    SPREADSHEET_STORAGE_PROVIDER: ${SPREADSHEET_STORAGE_PROVIDER:-minio}
    SPREADSHEET_S3_BUCKET: ${SPREADSHEET_S3_BUCKET:-spreadsheets}
    SPREADSHEET_S3_REGION: ${SPREADSHEET_S3_REGION:-us-east-1}
    SPREADSHEET_S3_ACCESS_KEY: ${SPREADSHEET_S3_ACCESS_KEY:-minioadmin}
    SPREADSHEET_S3_SECRET_KEY: ${SPREADSHEET_S3_SECRET_KEY:-minioadmin}
    SPREADSHEET_MINIO_ENDPOINT: ${SPREADSHEET_MINIO_ENDPOINT:-http://minio:9000}
    SPREADSHEET_AGENT_CONCURRENCY: ${SPREADSHEET_AGENT_CONCURRENCY:-5}
    SPREADSHEET_MAX_FILE_SIZE_MB: ${SPREADSHEET_MAX_FILE_SIZE_MB:-500}
    SPREADSHEET_MAX_FILES_PER_PROJECT: ${SPREADSHEET_MAX_FILES_PER_PROJECT:-50}
```

---

## File Inventory

### Backend Files

```
apps/api/
├── prisma/
│   ├── schema.prisma                                  # SpreadsheetProject, SpreadsheetFile, SpreadsheetTable, SpreadsheetRun models
│   └── migrations/
│       └── YYYYMMDDHHMMSS_add_spreadsheet_agent/
│           └── migration.sql
├── src/
│   ├── common/
│   │   └── constants/
│   │       └── roles.constants.ts                     # PERMISSIONS.SPREADSHEET_AGENT_* added
│   ├── spreadsheet-agent/
│   │   ├── spreadsheet-agent.module.ts                # NestJS module (imports StorageModule, SandboxModule, LlmModule)
│   │   ├── spreadsheet-agent.controller.ts            # CRUD endpoints for projects, files, tables
│   │   ├── spreadsheet-agent.service.ts               # Business logic and PostgreSQL CRUD
│   │   ├── spreadsheet-agent-stream.controller.ts     # SSE streaming endpoint (Fastify hijack)
│   │   ├── spreadsheet-agent-agent.service.ts         # StateGraph creation and run lifecycle
│   │   ├── dto/
│   │   │   ├── create-project.dto.ts                  # CreateProjectDto (Zod)
│   │   │   ├── update-project.dto.ts                  # UpdateProjectDto (Zod)
│   │   │   ├── create-run.dto.ts                      # CreateRunDto (Zod)
│   │   │   ├── approve-plan.dto.ts                    # ApprovePlanDto with PlanModification[] (Zod)
│   │   │   └── query-project.dto.ts                   # QueryProjectDto with pagination (Zod)
│   │   ├── agent/
│   │   │   ├── types.ts                               # TypeScript interfaces: FileInventory, SheetAnalysis, ExtractionPlan, ExtractionResult, ValidationReport
│   │   │   ├── state.ts                               # LangGraph Annotation.Root state definition
│   │   │   ├── graph.ts                               # StateGraph definition with nodes, edges, and routing functions
│   │   │   ├── nodes/
│   │   │   │   ├── ingest.ts                          # Phase 1: Ingest & Inventory (programmatic)
│   │   │   │   ├── analyze.ts                         # Phase 2: Sheet Analyzer (LLM per sheet, parallel)
│   │   │   │   ├── design.ts                          # Phase 3: Schema Designer (single LLM call)
│   │   │   │   ├── extract.ts                         # Phase 5: Extractor (DuckDB, parallel)
│   │   │   │   ├── validate.ts                        # Phase 6: Validator (programmatic + optional LLM)
│   │   │   │   └── persist.ts                         # Phase 7: Persist & Catalog
│   │   │   ├── prompts/
│   │   │   │   ├── sheet-analyzer.prompt.ts           # Prompt template for Phase 2 LLM calls
│   │   │   │   ├── schema-designer.prompt.ts          # Prompt template for Phase 3 LLM call
│   │   │   │   └── validator.prompt.ts                # Prompt template for Phase 6 optional LLM review
│   │   │   └── utils/
│   │   │       ├── file-reader.ts                     # Python sandbox calls for openpyxl-based file reading
│   │   │       ├── duckdb-executor.ts                 # Python sandbox calls for DuckDB extraction
│   │   │       └── parquet-writer.ts                  # Parquet write verification utilities
│   │   └── storage/
│   │       ├── storage-provider.interface.ts          # StorageProvider interface
│   │       ├── s3-storage.provider.ts                 # AWS S3 and MinIO implementation
│   │       ├── azure-storage.provider.ts              # Azure Blob Storage implementation
│   │       └── storage.module.ts                      # NestJS module with factory for provider selection
└── test/
    ├── spreadsheet-agent.integration.spec.ts          # Integration tests for CRUD endpoints
    ├── spreadsheet-agent-run.integration.spec.ts      # Integration tests for run and approve endpoints
    └── fixtures/
        └── spreadsheet-test.factory.ts                # createMockProject, createMockFile, createMockRun helpers
```

### Frontend Files

```
apps/web/src/
├── pages/
│   ├── SpreadsheetAgentPage.tsx               # Project list page
│   ├── NewSpreadsheetProjectPage.tsx          # 4-step creation wizard
│   └── SpreadsheetProjectDetailPage.tsx       # 5-tab project detail view
├── components/spreadsheet-agent/
│   ├── ExtractionPlanReview.tsx               # Review gate: editable extraction plan cards
│   ├── AgentProgressView.tsx                  # SSE-driven progress (phases, files, tables, tokens)
│   ├── FileUploadZone.tsx                     # Drag-and-drop multi-file upload
│   ├── FileList.tsx                           # File table with status and actions
│   ├── TableList.tsx                          # Extracted table table with preview and download
│   ├── TablePreview.tsx                       # First-N-rows Parquet preview dialog
│   ├── RunHistory.tsx                         # Run history table with retry action
│   └── CatalogPreview.tsx                     # Syntax-highlighted catalog.json display
├── hooks/
│   ├── useSpreadsheetProjects.ts              # CRUD + pagination hook (follows useSemanticModels pattern)
│   ├── useSpreadsheetRun.ts                   # Run management + SSE streaming
│   └── useSpreadsheetUpload.ts               # File upload state with per-file progress
├── services/
│   └── api.ts                                 # API client functions (modified: add spreadsheetAgent namespace)
├── types/
│   └── index.ts                               # SpreadsheetProject, SpreadsheetFile, SpreadsheetTable, SpreadsheetRun TypeScript types
└── __tests__/
    ├── pages/
    │   ├── SpreadsheetAgentPage.test.tsx      # Component tests for list page
    │   ├── NewSpreadsheetProjectPage.test.tsx # Component tests for creation wizard
    │   └── SpreadsheetProjectDetailPage.test.tsx # Component tests for detail view
    └── components/spreadsheet-agent/
        ├── ExtractionPlanReview.test.tsx
        ├── AgentProgressView.test.tsx
        └── FileUploadZone.test.tsx
```

### Configuration Files Modified

```
apps/api/
├── package.json                               # Added: duckdb, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, @azure/storage-blob
└── src/
    └── app.module.ts                          # Imported SpreadsheetAgentModule

apps/web/
└── src/
    ├── App.tsx                                # Added routes: /spreadsheet-agent, /spreadsheet-agent/new, /spreadsheet-agent/:id
    └── components/navigation/
        └── Sidebar.tsx                        # Added sidebar entry with TableViewIcon

infra/compose/
├── base.compose.yml                           # Added SPREADSHEET_* environment variables to api service
├── dev.compose.yml                            # Added MinIO service for local development
└── .env.example                              # Added all SPREADSHEET_* environment variables with documentation
```

---

## Testing

### Backend Tests

#### Integration Tests: Spreadsheet Agent CRUD

**File:** `apps/api/test/spreadsheet-agent.integration.spec.ts`

**Coverage:**

**GET /api/spreadsheet-agent/projects**
- `401` if not authenticated
- `403` for Viewer trying to access (no — Viewers have read access)
- `200` empty list when no projects
- `200` paginated results with correct total
- `200` search by name
- `200` filter by status
- `200` sort by name, tableCount, createdAt

**POST /api/spreadsheet-agent/projects**
- `401` if not authenticated
- `403` for Viewer
- `201` with created project
- `400` validation errors (missing name, invalid storageProvider)

**PATCH /api/spreadsheet-agent/projects/:id**
- `401` if not authenticated
- `403` for Viewer
- `200` with updated name and description
- `404` for non-existent project

**DELETE /api/spreadsheet-agent/projects/:id**
- `401` if not authenticated
- `403` for Viewer
- `204` on success
- `404` for non-existent project
- Cascades: associated files, tables, runs deleted from database

**POST /api/spreadsheet-agent/projects/:id/files**
- `401` if not authenticated
- `403` for Viewer
- `201` with uploaded file records
- `400` for unsupported file type
- `400` for file exceeding size limit
- `409` for project exceeding max file count

**GET /api/spreadsheet-agent/projects/:id/tables**
- `401` if not authenticated
- `200` with table list (empty when no extractions)
- `200` with status filter applied

**GET /api/spreadsheet-agent/projects/:id/tables/:tableId/preview**
- `401` if not authenticated
- `200` with column headers and row data
- `409` when table status is not `ready`

**Run:**
```bash
cd apps/api && npm test -- spreadsheet-agent.integration
```

---

#### Integration Tests: Run Lifecycle

**File:** `apps/api/test/spreadsheet-agent-run.integration.spec.ts`

**Coverage:**

**POST /api/spreadsheet-agent/runs**
- `401` if not authenticated
- `403` for Viewer
- `201` with created run
- `400` project has no files
- `409` project already has an active run

**GET /api/spreadsheet-agent/runs/:runId**
- `401` if not authenticated
- `200` with run status
- `404` for non-existent run

**POST /api/spreadsheet-agent/runs/:runId/cancel**
- `401` if not authenticated
- `200` with cancelled status
- `400` if already completed

**POST /api/spreadsheet-agent/runs/:runId/approve**
- `401` if not authenticated
- `200` with updated run status
- `400` if run is not in `review_pending` status
- `400` if modification references non-existent table name
- `404` for non-existent run

**Run:**
```bash
cd apps/api && npm test -- spreadsheet-agent-run.integration
```

---

#### Unit Tests: Agent Nodes

**Coverage:**

**Ingest Node** (`apps/api/src/spreadsheet-agent/agent/nodes/ingest.ts`):
- Hash computation for change detection
- Skips files with matching hash (incremental re-processing)
- Emits correct SSE events per file
- Handles sandbox errors per file without aborting others

**Analyze Node** (`apps/api/src/spreadsheet-agent/agent/nodes/analyze.ts`):
- Parallel sheet processing with concurrency limit
- Structured output parsing (Zod schema)
- Revision count carries through correctly

**Design Node** (`apps/api/src/spreadsheet-agent/agent/nodes/design.ts`):
- Resolves naming conflicts in table names
- Produces valid `ExtractionPlan` from `SheetAnalysis[]`
- Handles empty `sheetAnalyses` gracefully

**Extractor Node** (`apps/api/src/spreadsheet-agent/agent/nodes/extract.ts`):
- Applies `planModifications` correctly (skip action, override action)
- DuckDB SQL generation from plan columns and transformations
- Error isolation: one table failure does not block others

**Validator Node** (`apps/api/src/spreadsheet-agent/agent/nodes/validate.ts`):
- Routes to `persist` when all tables pass
- Routes to `extract` when `recommendedTarget: 'extractor'`
- Routes to `design` when `recommendedTarget: 'schema_designer'`
- Routes to `persist` after 3 revision cycles (with caveats)

**Run:**
```bash
cd apps/api && npm test -- spreadsheet-agent
```

---

### Frontend Tests

**Files:** `apps/web/src/__tests__/`

**Coverage:**

**SpreadsheetAgentPage:**
- Renders project list table
- Search input filters results
- Status filter chip changes query
- "New Project" button hidden for Viewer role
- Delete confirmation dialog appears on delete action

**NewSpreadsheetProjectPage:**
- Step 1: form validation (name required)
- Step 2: file drop zone accepts valid types, rejects invalid types
- Step 3: shows summary of uploaded files, "Start Processing" triggers run creation
- Step 4: SSE events update progress display, `run_complete` triggers navigation

**ExtractionPlanReview:**
- Renders table cards from plan
- Table name editable (text field)
- Skip toggle marks table as excluded in submission
- Approve button sends modifications to API

**AgentProgressView:**
- `phase_start` event updates phase indicator
- `file_complete` event adds file to status list
- `table_complete` event adds table to status list with row count
- `run_complete` event shows success state
- `run_error` event shows failure state

**Run:**
```bash
cd apps/web && npm test
```

---

## Packages

### Backend (New)

```json
{
  "duckdb": "^0.10.0",
  "@aws-sdk/client-s3": "^3.0.0",
  "@aws-sdk/s3-request-presigner": "^3.0.0",
  "@azure/storage-blob": "^12.0.0"
}
```

**`duckdb`** — Node.js bindings for DuckDB used in the preview endpoint (`GET /tables/:id/preview`). The extraction itself runs in the Python sandbox, but preview queries run in-process on the NestJS API server for simplicity.

**`@aws-sdk/client-s3`** — S3 operations: upload source files, list objects, delete objects, delete by prefix.

**`@aws-sdk/s3-request-presigner`** — Generates time-limited signed URLs for Parquet file downloads.

**`@azure/storage-blob`** — Azure Blob Storage operations with equivalent functionality to the S3 SDK.

---

### Python Sandbox Additions

The following packages are added to the Docker sandbox image:

```
duckdb==0.10.0          # In-process analytical engine for SQL transformations and Parquet writing
openpyxl==3.1.0         # Excel .xlsx reading with structure analysis and merged cell detection
xlrd==2.0.1             # Legacy .xls reading (pre-2007 Excel format)
pyarrow==15.0.0         # Parquet schema inspection and validation
python-magic==0.4.27    # File MIME type detection by content
boto3==1.34.0           # S3 operations (fallback if DuckDB httpfs insufficient for complex scenarios)
```

These packages complement the existing sandbox packages (`pandas`, `numpy`, `matplotlib`, `seaborn`) already available from the Data Agent.

---

### Frontend (No New Packages)

The frontend reuses existing dependencies:
- **MUI** — All UI components (Table, Dialog, LinearProgress, Stepper, Chip, etc.)
- **react-markdown** — Markdown rendering in `AgentProgressView` log entries
- **react-syntax-highlighter** — JSON syntax highlighting in `CatalogPreview`

No new npm packages are required in the frontend.
