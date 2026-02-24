# Data Import Feature Specification

## Table of Contents

1. [Feature Overview](#feature-overview)
2. [Architecture](#architecture)
3. [Supported File Formats](#supported-file-formats)
4. [Processing Pipeline](#processing-pipeline)
5. [CSV Processing](#csv-processing)
6. [Excel Processing](#excel-processing)
7. [SSE Streaming](#sse-streaming)
8. [Database Schema](#database-schema)
9. [API Endpoints](#api-endpoints)
10. [RBAC Permissions](#rbac-permissions)
11. [Status Lifecycle](#status-lifecycle)
12. [Frontend Components](#frontend-components)
13. [Security](#security)
14. [Configuration](#configuration)
15. [File Inventory](#file-inventory)

---

## Feature Overview

The Data Import feature provides a user-driven, deterministic pipeline for importing CSV and Excel files into the platform as queryable Parquet datasets. It uses **no LLM** — the user directly configures parsing options (delimiter, header row, sheet selection, cell ranges) and sees a live preview before executing the run. The pipeline reads the configured source file, converts it to Parquet via DuckDB, uploads the Parquet file to S3, and automatically creates a Data Connection so the resulting table is immediately available in the Data Agent.

### Core Capabilities

- **User-Configured Parsing**: No AI guessing — the user selects delimiter, header row, sheet, and range
- **Live Preview**: Debounced API calls show a live table preview as the user adjusts configuration
- **Multi-Sheet Excel Support**: Per-sheet checkboxes and range controls; each selected sheet produces a separate Parquet file and connection
- **Auto-Detection Defaults**: Delimiter, encoding, and header row are auto-detected on upload so the user only adjusts exceptions
- **DuckDB-Powered Conversion**: In-process type detection and Parquet writing with no intermediate temporary files
- **S3 Output**: Parquet files stored in configurable S3 bucket; path includes import ID for namespace isolation
- **Auto Connection Creation**: A Data Connection (type: S3 Parquet) is automatically created for each output table so it is immediately available in the Data Agent
- **Run Tracking**: Each execution produces a run record with phase-by-phase progress and SSE streaming

### Use Cases

1. **Routine Data Loading**: Upload a monthly export CSV from an ERP system and query it immediately in the Data Agent
2. **Multi-Sheet Excel Workbooks**: Import a workbook with separate sheets for each region, each becoming its own queryable table
3. **Predictable Pipelines**: Scheduled or repeated imports where the schema is known and consistent
4. **Self-Service Analyst Ingestion**: Business users upload their own data without needing AI interpretation

### Current Limitations

- **Formats**: CSV (`.csv`) and Excel (`.xlsx`, `.xls`) only; JSON, Parquet, ORC not supported in this feature
- **500MB Per File**: Maximum single file size
- **No Formula Evaluation**: Excel formulas are read as their cached values, not re-evaluated
- **S3 Only**: Azure Blob Storage not supported in the initial version
- **No Incremental Updates**: Re-running an import overwrites the previous Parquet output

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Frontend Layer                              │
│  React + Material UI + SSE Streaming                                 │
│                                                                       │
│  DataImportListPage (/data-imports)                                  │
│    ├─ Tab: Imports (paginated list with status chips)                │
│    └─ Tab: Runs (all runs across imports)                            │
│                                                                       │
│  NewDataImportPage (/data-imports/new) — 4-step wizard               │
│    Step 1: Upload file                                               │
│    Step 2: Configure parsing (CSV options or Excel sheet selector)   │
│    Step 3: Preview parsed data                                       │
│    Step 4: Run and stream progress                                   │
│                                                                       │
│  DataImportDetailPage (/data-imports/:id)                            │
│    ├─ Header: name, status, source file info                         │
│    ├─ Tab: Preview (current parse result)                            │
│    ├─ Tab: Tables (output Parquet tables + connection links)         │
│    └─ Tab: Runs (run history)                                        │
└────────────────────────────┬─────────────────────────────────────────┘
                             │ HTTPS (Nginx)
                             │ REST API + SSE
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                          Backend Layer                               │
│  NestJS + Fastify + TypeScript                                       │
│                                                                       │
│  DataImportController (CRUD: imports, runs)                         │
│           ↓                                                           │
│  DataImportService (Business Logic, PostgreSQL CRUD)                │
│           ↓                                                           │
│  DataImportStreamController (SSE streaming endpoint)                │
│           ↓                                                           │
│  DataImportPipelineService (orchestrates 4 phases)                  │
│           ↓                                                           │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ 4-Phase Deterministic Pipeline                               │   │
│  │                                                               │   │
│  │  Phase 1: Parsing  →  Phase 2: Converting                   │   │
│  │         ↓                      ↓                             │   │
│  │  Phase 3: Uploading  →  Phase 4: Connecting                 │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  DataImportParser (CSV + Excel parsing, type inference)             │
│  StorageService (S3 upload via AWS SDK)                             │
│  ConnectionsService (creates data connections)                      │
└─────────────┬────────────────┬────────────────────────────────────-─┘
              │                │
              ▼                ▼
┌──────────────────┐  ┌─────────────────┐
│   PostgreSQL     │  │   S3 Storage    │
│                  │  │                 │
│ - data_imports   │  │ - Source files  │
│ - data_import_   │  │   (original     │
│   runs           │  │   upload)       │
│                  │  │ - Parquet       │
│                  │  │   output files  │
└──────────────────┘  └─────────────────┘
```

### System Components

#### Backend Modules

- **DataImportModule**: Main feature module registering all services and controllers
- **DataImportController**: CRUD endpoints for imports and runs; file upload endpoint
- **DataImportStreamController**: SSE streaming endpoint using Fastify `res.hijack()`
- **DataImportService**: Database CRUD, import and run lifecycle management
- **DataImportPipelineService**: Orchestrates the 4-phase pipeline, emits SSE events
- **DataImportParser**: CSV and Excel file parsing with type inference

#### Frontend Components

- **DataImportListPage**: Imports list with search, status filter, pagination; dual-tab (Imports / Runs)
- **NewDataImportPage**: 4-step wizard (Upload → Configure → Preview → Run)
- **DataImportDetailPage**: Detail view with Preview, Tables, and Runs tabs
- **FileUploadZone**: Drag-and-drop single-file upload with extension validation
- **CsvConfigPanel**: Delimiter, encoding, header row, and skip rows controls
- **ExcelSheetSelector**: Multi-sheet checkbox list with per-sheet range configuration
- **ImportPreview**: Tabular preview of parsed data (first N rows)
- **ImportProgressView**: SSE-driven progress with per-phase status indicators
- **StatusChip**: Colored chip component for import and run status values
- **RunHistory**: Paginated list of runs for a given import

---

## Supported File Formats

| Format | Extensions | Parser | Notes |
|--------|-----------|--------|-------|
| CSV | .csv | Node.js stream + DuckDB | Auto-detects delimiter, encoding, headers |
| Excel | .xlsx | ExcelJS / DuckDB excel extension | Multi-sheet, merged cell detection |
| Excel (legacy) | .xls | ExcelJS | Read-only legacy format; no merged cell ranges |

### File Type Detection

Detection is performed on upload using both the file extension and MIME type:

```typescript
const ALLOWED_EXTENSIONS = ['.csv', '.xlsx', '.xls'];
const ALLOWED_MIME_TYPES = [
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];
```

Files that fail either check are rejected with HTTP 422 before any processing begins.

---

## Processing Pipeline

The import pipeline is a linear, deterministic 4-phase sequence. Each phase emits SSE events for real-time progress. If any phase fails, the run transitions to `failed` and the remaining phases are skipped.

### Phase Diagram

```
START
  │
  ▼
[Phase 1: Parsing]  ── no LLM, user config applied
  │    Read source file from S3 (or temp storage)
  │    Apply user config: delimiter, header row, sheet selection, ranges
  │    Validate row counts, column counts
  │    Output: ParsedSheets[] (column names + typed rows)
  │
  ▼
[Phase 2: Converting]  ── DuckDB in-memory
  │    Load ParsedSheets into DuckDB in-memory tables
  │    Apply auto type detection (integer, float, date, boolean, text)
  │    Write Parquet files to local temp directory
  │    Output: ParquetFile[] (local paths + column schemas)
  │
  ▼
[Phase 3: Uploading]  ── AWS S3
  │    Stream each Parquet file to S3 bucket
  │    S3 key: data-imports/{importId}/{tableName}.parquet
  │    Update outputTables in DB with S3 paths and row counts
  │    Output: S3Location[] (bucket, key, size)
  │
  ▼
[Phase 4: Connecting]  ── ConnectionsService
  │    For each uploaded Parquet file, create a DataConnection
  │    Connection type: s3_parquet
  │    Credentials encrypted with AES-256-GCM
  │    Connection name derived from import name + sheet name
  │    Output: Connection[] (IDs recorded in outputTables)
  │
  ▼
END  →  import status: ready (all tables) | partial (some tables failed)
```

### Phase Error Handling

- **Phase 1 (Parsing)**: Hard failure. Invalid files or config that produces zero rows sets run status to `failed`. User must update config and retry.
- **Phase 2 (Converting)**: Hard failure. DuckDB errors (type conflicts, memory) set run status to `failed`.
- **Phase 3 (Uploading)**: Per-table error isolation. A failed upload for one sheet emits `table_error` but continues other sheets. If all sheets fail, run is `failed`. Partial success sets import status to `partial`.
- **Phase 4 (Connecting)**: Per-table error isolation. Same behavior as Phase 3. A connection failure does not delete the already-uploaded Parquet file.

---

## CSV Processing

### Auto-Detection on Upload

When a CSV file is uploaded, the backend reads the first 8 KB to auto-detect:

| Property | Detection Method | Override |
|----------|-----------------|---------|
| Delimiter | Frequency count: `,` `;` `\t` `\|` | User sets `delimiter` in config |
| Encoding | BOM detection (UTF-8 BOM, UTF-16 LE/BE); default UTF-8 | User sets `encoding` in config |
| Header row | If row 0 values are non-numeric strings → assumed header | User sets `hasHeader` in config |
| Skip rows | Not auto-detected | User sets `skipRows` in config |

Auto-detected values are stored in `config` as the initial defaults. The user sees these pre-populated in the `CsvConfigPanel` and adjusts as needed.

### CSV Config Schema

```typescript
interface CsvConfig {
  delimiter: ',' | ';' | '\t' | '|';   // default: auto-detected
  encoding: 'utf-8' | 'latin-1' | 'utf-16le' | 'utf-16be';  // default: 'utf-8'
  hasHeader: boolean;                   // default: true
  skipRows: number;                     // rows to skip before header; default: 0
  maxPreviewRows: number;               // rows returned in preview; default: 100
}
```

### CSV Type Inference

DuckDB's `read_csv_auto` performs column type inference when loading into an in-memory table. The following types are detected:

- `INTEGER` — whole numbers within 64-bit range
- `DOUBLE` — decimal numbers
- `BOOLEAN` — `true`/`false`, `yes`/`no`, `1`/`0`
- `DATE` — ISO 8601 dates (`YYYY-MM-DD`)
- `TIMESTAMP` — ISO 8601 datetimes
- `VARCHAR` — fallback for all other values

The inferred schema is included in the `parseResult` stored in the database and shown in the Preview tab.

---

## Excel Processing

### Sheet Inventory on Upload

When an Excel file is uploaded, the backend reads its sheet names and row/column counts using ExcelJS. This inventory is stored in `parseResult.sheets` and drives the `ExcelSheetSelector` UI.

```typescript
interface ExcelSheetInventory {
  name: string;
  index: number;
  rowCount: number;         // total rows including headers and blanks
  colCount: number;
  hasMergedCells: boolean;
}
```

### Per-Sheet Configuration

The user selects which sheets to import using checkboxes. For each selected sheet, a range can be optionally configured:

```typescript
interface ExcelSheetConfig {
  sheetName: string;
  selected: boolean;
  startRow: number;   // 1-based; default: 1
  endRow: number | null;    // null = read to last row
  startCol: number;   // 1-based; default: 1
  endCol: number | null;    // null = read to last column
  hasHeader: boolean; // default: true
  outputTableName: string;  // default: slugified sheet name
}
```

### Live Preview

The `ExcelSheetSelector` component calls `POST /api/data-imports/:id/preview` with the updated `ExcelSheetConfig` for the active sheet tab. Calls are debounced (400 ms) to avoid overwhelming the API during rapid range adjustments. The preview returns up to 100 rows from the configured range.

### Excel Output

Each selected sheet produces:
1. One Parquet file: `data-imports/{importId}/{outputTableName}.parquet`
2. One Data Connection named `{importName} – {outputTableName}`

---

## SSE Streaming

The `POST /api/data-imports/runs/:runId/stream` endpoint uses Fastify's `reply.hijack()` pattern to take control of the raw TCP socket and write Server-Sent Events directly. The frontend uses `fetch()` with a `ReadableStream` reader (not `EventSource`) because the request requires JWT authorization headers.

### Event Types

| Event | Payload Fields | Description |
|-------|---------------|-------------|
| `run_start` | `runId`, `importId`, `totalPhases` | Pipeline begins |
| `phase_start` | `phase`, `phaseName`, `tableCount?` | A phase begins |
| `phase_complete` | `phase`, `phaseName`, `durationMs` | A phase completes successfully |
| `table_start` | `phase`, `tableName`, `sheetName?` | Per-table processing starts |
| `table_complete` | `phase`, `tableName`, `rowCount?`, `s3Key?`, `connectionId?` | Per-table processing succeeds |
| `table_error` | `phase`, `tableName`, `error` | Per-table error (non-fatal if others succeed) |
| `progress` | `phase`, `percent`, `message` | General progress within a phase |
| `run_complete` | `runId`, `status`, `outputTables`, `durationMs` | Pipeline finishes |
| `run_error` | `runId`, `error`, `phase` | Pipeline fails |

### Event Format

All events use the standard SSE `data:` format with JSON payloads:

```
data: {"event":"run_start","runId":"a1b2c3","importId":"d4e5f6","totalPhases":4}

data: {"event":"phase_start","phase":1,"phaseName":"Parsing"}

data: {"event":"table_start","phase":3,"tableName":"sales_q1","sheetName":"Q1 Sales"}

data: {"event":"table_complete","phase":3,"tableName":"sales_q1","rowCount":4821,"s3Key":"data-imports/d4e5f6/sales_q1.parquet"}

data: {"event":"run_complete","runId":"a1b2c3","status":"completed","outputTables":[{"tableName":"sales_q1","rowCount":4821,"connectionId":"x7y8z9"}],"durationMs":8340}
```

### Heartbeat

A comment line (`: heartbeat`) is sent every 15 seconds to keep the connection alive through proxies and load balancers.

---

## Database Schema

### `data_imports` Table

Stores the import definition: source file metadata, user configuration, and the most recent parse result.

```sql
CREATE TABLE data_imports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Source file
  source_file_name  TEXT NOT NULL,           -- original filename
  source_file_type  TEXT NOT NULL,           -- 'csv' | 'xlsx' | 'xls'
  source_file_size  BIGINT,                  -- bytes
  source_s3_key     TEXT,                    -- S3 key of the uploaded source file

  -- Status
  status            TEXT NOT NULL DEFAULT 'draft',
  -- 'draft' | 'pending' | 'importing' | 'ready' | 'partial' | 'failed'

  -- User configuration (JSONB)
  config            JSONB NOT NULL DEFAULT '{}',
  -- CsvConfig or { sheets: ExcelSheetConfig[] }

  -- Parse result (JSONB) — populated after first preview
  parse_result      JSONB,
  -- { columns: ColumnSchema[], rowCount: number, sheets?: ExcelSheetInventory[] }

  -- Output tables (JSONB) — populated after successful run
  output_tables     JSONB,
  -- Array<{ tableName, s3Key, rowCount, connectionId, columnCount }>

  -- Run stats
  last_run_at       TIMESTAMPTZ,
  last_run_id       UUID,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_data_imports_user_id ON data_imports (user_id);
CREATE INDEX idx_data_imports_status ON data_imports (status);
```

### `data_import_runs` Table

Tracks each execution of the import pipeline. One import can have many runs (retries after failure).

```sql
CREATE TABLE data_import_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id         UUID NOT NULL REFERENCES data_imports(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Status
  status            TEXT NOT NULL DEFAULT 'pending',
  -- 'pending' | 'parsing' | 'converting' | 'uploading' | 'connecting'
  -- | 'completed' | 'failed' | 'cancelled'

  current_phase     INTEGER,         -- 1–4, null when not running
  error_message     TEXT,            -- populated on failure

  -- Progress (JSONB) — per-phase progress details
  progress          JSONB NOT NULL DEFAULT '{}',
  -- { phase1: { status, tablesProcessed, tablesTotal },
  --   phase2: { ... }, phase3: { ... }, phase4: { ... } }

  -- Config snapshot — copy of config at time of run (for audit)
  config_snapshot   JSONB NOT NULL DEFAULT '{}',

  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_data_import_runs_import_id ON data_import_runs (import_id);
CREATE INDEX idx_data_import_runs_status ON data_import_runs (status);
CREATE INDEX idx_data_import_runs_user_id ON data_import_runs (user_id);
```

### Prisma Schema

```prisma
model DataImport {
  id             String   @id @default(uuid())
  name           String
  userId         String   @map("user_id")
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  sourceFileName String   @map("source_file_name")
  sourceFileType String   @map("source_file_type")
  sourceFileSize BigInt?  @map("source_file_size")
  sourceS3Key    String?  @map("source_s3_key")

  status         String   @default("draft")
  config         Json     @default("{}")
  parseResult    Json?    @map("parse_result")
  outputTables   Json?    @map("output_tables")

  lastRunAt      DateTime? @map("last_run_at")
  lastRunId      String?   @map("last_run_id")

  runs           DataImportRun[]

  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  @@index([userId])
  @@index([status])
  @@map("data_imports")
}

model DataImportRun {
  id             String   @id @default(uuid())
  importId       String   @map("import_id")
  import         DataImport @relation(fields: [importId], references: [id], onDelete: Cascade)
  userId         String   @map("user_id")
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  status         String   @default("pending")
  currentPhase   Int?     @map("current_phase")
  errorMessage   String?  @map("error_message")
  progress       Json     @default("{}")
  configSnapshot Json     @map("config_snapshot") @default("{}")

  startedAt      DateTime? @map("started_at")
  completedAt    DateTime? @map("completed_at")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  @@index([importId])
  @@index([status])
  @@index([userId])
  @@map("data_import_runs")
}
```

### Enums

```typescript
// Import-level status
export enum DataImportStatus {
  Draft     = 'draft',      // Uploaded, not yet configured
  Pending   = 'pending',    // Configured, not yet run
  Importing = 'importing',  // Run in progress
  Ready     = 'ready',      // All tables successfully imported
  Partial   = 'partial',    // Some tables failed, others succeeded
  Failed    = 'failed',     // Run failed before producing any output
}

// Run-level status
export enum DataImportRunStatus {
  Pending    = 'pending',    // Created, not yet started
  Parsing    = 'parsing',    // Phase 1 active
  Converting = 'converting', // Phase 2 active
  Uploading  = 'uploading',  // Phase 3 active
  Connecting = 'connecting', // Phase 4 active
  Completed  = 'completed',  // All phases succeeded
  Failed     = 'failed',     // Pipeline error
  Cancelled  = 'cancelled',  // User-cancelled
}
```

---

## API Endpoints

All endpoints require a valid JWT Bearer token. RBAC is enforced per endpoint.

### Base URL

```
/api/data-imports
```

---

### POST /api/data-imports/upload

Upload a CSV or Excel file to create a new import record. The file is stored in S3 and the backend auto-detects CSV properties or enumerates Excel sheets to populate the initial `config` and `parseResult`.

**Permission required**: `data_imports:write`

**Request**: `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | Yes | CSV or Excel file (max 500 MB) |
| `name` | string | No | Import name; defaults to filename without extension |

**Response**: `201 Created`

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "Sales Q1 2026",
  "userId": "u1u1u1u1-u1u1-u1u1-u1u1-u1u1u1u1u1u1",
  "sourceFileName": "sales_q1_2026.xlsx",
  "sourceFileType": "xlsx",
  "sourceFileSizeBytes": 1048576,
  "status": "draft",
  "config": {
    "sheets": [
      {
        "sheetName": "Q1 Sales",
        "selected": true,
        "startRow": 1,
        "endRow": null,
        "startCol": 1,
        "endCol": null,
        "hasHeader": true,
        "outputTableName": "q1_sales"
      },
      {
        "sheetName": "Summary",
        "selected": false,
        "startRow": 1,
        "endRow": null,
        "startCol": 1,
        "endCol": null,
        "hasHeader": true,
        "outputTableName": "summary"
      }
    ]
  },
  "parseResult": {
    "sheets": [
      { "name": "Q1 Sales", "index": 0, "rowCount": 4823, "colCount": 12, "hasMergedCells": false },
      { "name": "Summary",  "index": 1, "rowCount": 15,   "colCount": 4,  "hasMergedCells": true  }
    ]
  },
  "outputTables": null,
  "createdAt": "2026-02-23T10:00:00.000Z",
  "updatedAt": "2026-02-23T10:00:00.000Z"
}
```

---

### GET /api/data-imports

List all imports for the current user. Admins can see all users' imports.

**Permission required**: `data_imports:read`

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `pageSize` | number | 20 | Items per page (max 100) |
| `status` | string | — | Filter by status |
| `search` | string | — | Full-text search on name and filename |

**Response**: `200 OK`

```json
{
  "data": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "name": "Sales Q1 2026",
      "sourceFileName": "sales_q1_2026.xlsx",
      "sourceFileType": "xlsx",
      "status": "ready",
      "lastRunAt": "2026-02-23T10:05:00.000Z",
      "outputTables": [
        { "tableName": "q1_sales", "rowCount": 4821, "connectionId": "c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1" }
      ],
      "createdAt": "2026-02-23T10:00:00.000Z",
      "updatedAt": "2026-02-23T10:05:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

---

### GET /api/data-imports/:id

Get a single import by ID including full config, parseResult, and outputTables.

**Permission required**: `data_imports:read`

**Response**: `200 OK` — same shape as the upload response, fully populated.

---

### GET /api/data-imports/:id/preview

Get the current parse result as a paginated table preview. Uses the config stored on the import record.

**Permission required**: `data_imports:read`

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sheet` | string | first selected sheet | Sheet name (Excel only) |
| `page` | number | 1 | Page number for row preview |
| `pageSize` | number | 100 | Rows per page (max 500) |

**Response**: `200 OK`

```json
{
  "tableName": "q1_sales",
  "columns": [
    { "name": "order_id",   "type": "INTEGER" },
    { "name": "order_date", "type": "DATE" },
    { "name": "amount",     "type": "DOUBLE" },
    { "name": "region",     "type": "VARCHAR" }
  ],
  "rows": [
    [1001, "2026-01-03", 1540.50, "North"],
    [1002, "2026-01-04", 875.00,  "South"]
  ],
  "totalRows": 4821,
  "page": 1,
  "pageSize": 100
}
```

---

### POST /api/data-imports/:id/preview

Re-parse with a specific sheet config and return a preview. Used by the `ExcelSheetSelector` for live range previews without persisting the config change.

**Permission required**: `data_imports:read`

**Request Body**:

```json
{
  "sheetConfig": {
    "sheetName": "Q1 Sales",
    "startRow": 3,
    "endRow": null,
    "startCol": 1,
    "endCol": 8,
    "hasHeader": true
  },
  "maxRows": 100
}
```

**Response**: `200 OK` — same shape as `GET /preview` response.

---

### PATCH /api/data-imports/:id

Update the import name or parsing configuration. Setting a valid config transitions the import status from `draft` to `pending`.

**Permission required**: `data_imports:write`

**Request Body**:

```json
{
  "name": "Sales Q1 2026 - Updated",
  "config": {
    "sheets": [
      {
        "sheetName": "Q1 Sales",
        "selected": true,
        "startRow": 1,
        "endRow": null,
        "startCol": 1,
        "endCol": null,
        "hasHeader": true,
        "outputTableName": "q1_sales"
      }
    ]
  }
}
```

**Response**: `200 OK` — updated import record.

---

### DELETE /api/data-imports/:id

Delete an import and its run history. Does not delete S3 files or Data Connections already created.

**Permission required**: `data_imports:delete`

**Response**: `204 No Content`

---

### POST /api/data-imports/runs

Create and immediately start a new run for an import. The import must be in `pending`, `ready`, `partial`, or `failed` status. A new run cannot be created if another run for the same import is in progress.

**Permission required**: `data_imports:write`

**Request Body**:

```json
{
  "importId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

**Response**: `201 Created`

```json
{
  "id": "r1r1r1r1-r1r1-r1r1-r1r1-r1r1r1r1r1r1",
  "importId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "userId": "u1u1u1u1-u1u1-u1u1-u1u1-u1u1u1u1u1u1",
  "status": "pending",
  "currentPhase": null,
  "progress": {},
  "configSnapshot": { "sheets": [ { "sheetName": "Q1 Sales", "selected": true } ] },
  "createdAt": "2026-02-23T10:02:00.000Z",
  "updatedAt": "2026-02-23T10:02:00.000Z"
}
```

---

### GET /api/data-imports/:id/runs

List all runs for a specific import, ordered by creation date descending.

**Permission required**: `data_imports:read`

**Query Parameters**: `page`, `pageSize` (same defaults as list endpoint)

**Response**: `200 OK` — paginated list of run records.

---

### GET /api/data-imports/runs/:runId

Get a single run by ID including full progress detail.

**Permission required**: `data_imports:read`

**Response**: `200 OK`

```json
{
  "id": "r1r1r1r1-r1r1-r1r1-r1r1-r1r1r1r1r1r1",
  "importId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "completed",
  "currentPhase": null,
  "progress": {
    "phase1": { "status": "completed", "tablesProcessed": 1, "tablesTotal": 1 },
    "phase2": { "status": "completed", "tablesProcessed": 1, "tablesTotal": 1 },
    "phase3": { "status": "completed", "tablesProcessed": 1, "tablesTotal": 1, "bytesUploaded": 524288 },
    "phase4": { "status": "completed", "tablesProcessed": 1, "tablesTotal": 1 }
  },
  "startedAt": "2026-02-23T10:02:05.000Z",
  "completedAt": "2026-02-23T10:02:13.000Z"
}
```

---

### POST /api/data-imports/runs/:runId/cancel

Cancel a run that is currently in progress. Has no effect if the run has already completed or failed.

**Permission required**: `data_imports:write`

**Response**: `200 OK`

```json
{
  "id": "r1r1r1r1-r1r1-r1r1-r1r1-r1r1r1r1r1r1",
  "status": "cancelled"
}
```

---

### DELETE /api/data-imports/runs/:runId

Delete a run record. Only runs with status `failed` or `cancelled` can be deleted.

**Permission required**: `data_imports:delete`

**Response**: `204 No Content`

**Error Response** (if run is not in a deletable state): `409 Conflict`

```json
{
  "code": "RUN_NOT_DELETABLE",
  "message": "Only failed or cancelled runs can be deleted."
}
```

---

### POST /api/data-imports/runs/:runId/stream

Open an SSE stream to receive real-time progress events for a run. Uses Fastify `reply.hijack()`. The frontend connects using `fetch()` with a `ReadableStream` reader.

**Permission required**: `data_imports:read`

**Response**: `text/event-stream`

See the [SSE Streaming](#sse-streaming) section for the full list of events.

---

## RBAC Permissions

### Permission Definitions

| Permission | Description |
|-----------|-------------|
| `data_imports:read` | View import records, run history, and preview data |
| `data_imports:write` | Upload files, update config, create and cancel runs |
| `data_imports:delete` | Delete import records and run records |

### Role Assignments

| Permission | Admin | Contributor | Viewer |
|-----------|-------|-------------|--------|
| `data_imports:read` | Yes | Yes | Yes |
| `data_imports:write` | Yes | Yes | No |
| `data_imports:delete` | Yes | Yes | No |

### Ownership Scoping

Contributors can only read, write, and delete their **own** imports and runs. Admins can access imports belonging to any user.

---

## Status Lifecycle

### Import Status

```
draft
  │
  │  (user saves valid config via PATCH)
  ▼
pending
  │
  │  (run created via POST /runs)
  ▼
importing
  │
  ├──→ ready     (all tables successfully produced)
  ├──→ partial   (some tables failed, others succeeded)
  └──→ failed    (pipeline error before producing any output)
       │
       │  (user creates new run after fixing config)
       └──→ importing  (retry cycle)
```

### Run Status

```
pending
  │
  │  (stream endpoint called; pipeline starts)
  ▼
parsing      (Phase 1)
  ▼
converting   (Phase 2)
  ▼
uploading    (Phase 3)
  ▼
connecting   (Phase 4)
  │
  ├──→ completed   (all phases succeeded)
  └──→ failed      (any phase hard-failed)

(from any active phase)
  └──→ cancelled   (user cancels via POST /cancel)
```

---

## Frontend Components

### Pages

| Page | Route | Description |
|------|-------|-------------|
| `DataImportListPage` | `/data-imports` | Paginated list of imports with status filter; secondary tab shows all runs |
| `NewDataImportPage` | `/data-imports/new` | 4-step wizard: Upload → Configure → Preview → Run |
| `DataImportDetailPage` | `/data-imports/:id` | Header overview + 3 tabs: Preview, Tables, Runs |

### Component Reference

| Component | Location | Description |
|-----------|----------|-------------|
| `FileUploadZone` | `components/data-import/FileUploadZone.tsx` | Drag-and-drop; validates extension and MIME type; shows file size |
| `CsvConfigPanel` | `components/data-import/CsvConfigPanel.tsx` | Delimiter selector, encoding selector, header row toggle, skip rows number input |
| `ExcelSheetSelector` | `components/data-import/ExcelSheetSelector.tsx` | Sheet list with checkboxes; expandable range controls per sheet; live preview trigger |
| `ImportPreview` | `components/data-import/ImportPreview.tsx` | MUI DataGrid showing parsed rows; column type chips in headers |
| `ImportProgressView` | `components/data-import/ImportProgressView.tsx` | Phase stepper + per-table status rows; SSE-driven |
| `StatusChip` | `components/data-import/StatusChip.tsx` | Color-coded MUI Chip for `DataImportStatus` and `DataImportRunStatus` |
| `RunHistory` | `components/data-import/RunHistory.tsx` | Paginated MUI Table of runs with status, duration, and action buttons |

### Hooks

| Hook | Description |
|------|-------------|
| `useDataImports` | CRUD operations for imports: list (paginated), get, upload, update, delete |
| `useDataImportRun` | Run lifecycle: create run, poll status, SSE streaming via `fetch()` + `ReadableStream` |

### Wizard Step Detail

**Step 1 — Upload**
- `FileUploadZone` accepts one file (CSV or Excel)
- On drop/select, calls `POST /api/data-imports/upload`
- Displays file metadata and auto-detected properties on success

**Step 2 — Configure**
- CSV: shows `CsvConfigPanel`; changes call `PATCH /api/data-imports/:id` and re-fetch preview
- Excel: shows `ExcelSheetSelector`; range changes call `POST /api/data-imports/:id/preview` (debounced, no persist)

**Step 3 — Preview**
- Shows `ImportPreview` for the first selected sheet (CSV) or the active sheet tab (Excel)
- "Back" returns to Configure; "Start Import" creates a run and advances to Step 4

**Step 4 — Progress**
- Calls `POST /api/data-imports/runs/:runId/stream` and renders `ImportProgressView`
- On `run_complete`: shows success summary with links to Data Agent connections
- On `run_error`: shows error detail and a "Retry" button

---

## Security

### File Upload Validation

Validation is enforced in the following order before any S3 upload occurs:

1. **Extension check**: Allowed extensions are `.csv`, `.xlsx`, `.xls`
2. **MIME type check**: File content-type header must match allowed MIME types
3. **Size check**: Maximum 500 MB; requests exceeding this limit receive `413 Payload Too Large`
4. **Filename sanitization**: Original filename is stored as metadata only; the S3 key uses `{importId}/{uuid}` to prevent path traversal

### S3 Credential Security

Data Connections created in Phase 4 store S3 credentials encrypted with AES-256-GCM using the same `ENCRYPTION_KEY` environment variable as the Database Connections feature. Credentials are decrypted only at query time within the API process — they are never returned in API responses.

### Authentication and Authorization

- All 13 endpoints require a valid JWT Bearer token (`Authorization: Bearer <token>`)
- RBAC is enforced at the NestJS guard layer using the `@Auth({ permissions: [...] })` decorator
- Ownership scoping (Contributor sees own records only) is enforced in the service layer via `userId` filter on all database queries

### Rate Limiting

| Endpoint Group | Limit |
|---------------|-------|
| `POST /upload` | 10 requests per minute per user |
| `POST /runs` | 20 requests per minute per user |
| `POST /:id/preview` | 60 requests per minute per user |
| All other endpoints | 100 requests per minute per user |

---

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATA_IMPORT_S3_BUCKET` | Yes | — | S3 bucket name for source files and Parquet output |
| `DATA_IMPORT_S3_REGION` | Yes | — | AWS region (e.g., `us-east-1`) |
| `DATA_IMPORT_S3_ACCESS_KEY_ID` | Yes | — | AWS access key ID |
| `DATA_IMPORT_S3_SECRET_ACCESS_KEY` | Yes | — | AWS secret access key (stored encrypted in connections) |
| `DATA_IMPORT_S3_PREFIX` | No | `data-imports/` | S3 key prefix for all import files |
| `DATA_IMPORT_MAX_FILE_SIZE_MB` | No | `500` | Maximum upload file size in MB |
| `DATA_IMPORT_PREVIEW_MAX_ROWS` | No | `100` | Default row count for preview responses |

---

## File Inventory

### Backend

```
apps/api/src/data-import/
  data-import.module.ts           # Module registration
  data-import.controller.ts       # CRUD endpoints (upload, list, get, preview, update, delete, runs)
  data-import-stream.controller.ts# SSE stream endpoint
  data-import.service.ts          # Business logic, DB CRUD, run lifecycle
  data-import-pipeline.service.ts # 4-phase pipeline orchestration
  data-import.parser.ts           # CSV and Excel parsing + type inference
  dto/
    create-data-import.dto.ts     # Upload request DTO
    update-data-import.dto.ts     # PATCH request DTO (config + name)
    create-run.dto.ts             # POST /runs request DTO
    preview-sheet.dto.ts          # POST /:id/preview request DTO
  types/
    data-import.types.ts          # DataImportStatus, DataImportRunStatus enums; config interfaces
```

### Frontend

```
apps/web/src/
  pages/
    DataImportListPage.tsx        # List page with dual-tab layout
    NewDataImportPage.tsx         # 4-step wizard
    DataImportDetailPage.tsx      # Detail page with tabs
  components/data-import/
    FileUploadZone.tsx            # File drag-and-drop with validation
    CsvConfigPanel.tsx            # CSV parsing controls
    ExcelSheetSelector.tsx        # Sheet checkboxes and range controls
    ImportPreview.tsx             # Parsed data table
    ImportProgressView.tsx        # SSE progress stepper
    StatusChip.tsx                # Status display chip
    RunHistory.tsx                # Run list table
  hooks/
    useDataImports.ts             # Import CRUD + pagination
    useDataImportRun.ts           # Run creation + SSE streaming
  api/
    data-import.api.ts            # Typed API client functions
```

### Migrations

```
apps/api/prisma/migrations/
  YYYYMMDDHHMMSS_add_data_imports/
    migration.sql                 # Creates data_imports and data_import_runs tables
```
