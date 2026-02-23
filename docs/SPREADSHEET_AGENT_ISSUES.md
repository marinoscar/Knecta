# Spreadsheet Agent — Comprehensive Analysis & Issues

**Date**: 2026-02-23 (updated)
**Project**: 6e8d73ae (FP&A)
**Runs investigated**: 3ede0f67 (completed, 36 tables), e7c49f01 (completed, 24 tables)

---

## Part 1: Goal vs. Reality

### What the Spreadsheet Agent SHOULD Do (End-to-End Goal)

```
1. UPLOAD    → User uploads Excel/CSV files to a project
2. INGEST    → Read the raw files, extract structural metadata per sheet
3. ANALYZE   → AI examines each sheet's structure (headers, data regions, types)
4. DESIGN    → AI designs clean output table schemas (column mapping, transformations)
5. REVIEW    → (Optional) User reviews and approves the extraction plan
6. EXTRACT   → Read actual cell data from source files, apply transformations,
                create Parquet files on disk
7. VALIDATE  → Verify extracted Parquet files (row counts, NULLs, schema conformance)
8. PERSIST   → Upload Parquet files to S3, save table metadata to DB, generate catalog
```

The end result: **real Parquet files in S3** that contain the cleaned, transformed spreadsheet data, queryable by tools like DuckDB, Athena, or the Data Agent.

### What the Agent ACTUALLY Does Today

```
1. UPLOAD    → ✅ Works — files written to /tmp/spreadsheet-agent/{projectId}/
2. INGEST    → ✅ Works — XLSX library parses files, extracts structure + sample rows
3. ANALYZE   → ✅ Works — LLM identifies logical tables per sheet
4. DESIGN    → ✅ Works — LLM designs extraction schemas (column mappings, types)
5. REVIEW    → ✅ Works (after bug fixes) — user can review/modify the plan
6. EXTRACT   → ❌ STUB — returns fake "success" results with estimated row counts
                No actual data is read. No Parquet files are created. No transformations run.
7. VALIDATE  → ⚠️  Runs but validates FAKE data — always passes because the stub
                returns perfect mock results (row counts match estimates, 0 NULLs, etc.)
8. PERSIST   → ⚠️  Partially works — writes metadata to DB, but:
                - No Parquet files exist to upload → totalSizeBytes = 0 for all tables
                - No S3 upload logic exists
                - No catalog.json upload exists
                - Table preview returns empty (no data source to read from)
                - Table download returns empty URL (no file to serve)
```

### The Critical Gap

**The entire data pipeline (Phase 6: Extract) is a placeholder.** The agent successfully uses AI to analyze spreadsheet structure and design clean schemas, but it never actually reads the data from the Excel files, transforms it, or produces any output files. The UI shows "24 tables, 3,114 rows" — but these are **estimated numbers from the LLM**, not real extracted data. There are zero Parquet files on disk or in S3.

### Evidence from Project 6e8d73ae

| Metric | What UI Shows | What's Real |
|--------|--------------|-------------|
| Tables | 24 (status: "ready") | 0 Parquet files exist anywhere |
| Total Rows | 3,114 | 0 rows actually extracted |
| Total Size | 0 B | Correct — nothing was created |
| Table Preview | Empty (no data) | Endpoint returns `{ columns: [], rows: [] }` |
| Table Download | Empty URL | Endpoint returns `{ downloadUrl: '' }` |
| Source files | 2 XLS files on disk | Only Sample2.xls produced tables; Sample1.xls was ignored |
| File status | Both "analyzing" | Never updated to "extracted" |

---

## Part 2: What Each Phase Currently Does (Detailed)

### Phase 1: Upload (`uploadFile` in spreadsheet-agent.service.ts)

**Status: Working**

- Accepts multipart file upload (max 50MB per file)
- Validates extension (.xlsx, .xls, .csv, .tsv, .ods) and MIME type
- Computes SHA-256 hash of file content
- Writes file to disk: `/tmp/spreadsheet-agent/{projectId}/{hash}{ext}`
- Creates `spreadsheet_files` record with `storagePath` pointing to the /tmp file
- NO S3 upload at this stage — files only exist in the API container's /tmp

**Problem**: Files in `/tmp` are ephemeral — they're lost if the container restarts. For production, source files should be uploaded to S3/object storage during this step.

### Phase 2: Ingest (`nodes/ingest.ts`)

**Status: Working**

- Reads each file from disk using `fs.readFileSync()` + `XLSX.read()`
- Per sheet: extracts row/col counts, merged cell ranges, formula detection, data density
- Extracts sample data: first 30 rows + last 5 rows as string grids
- Processes files in parallel (concurrency limit from config, default 5)
- Emits progress events (0-20%)

**Output**: `FileInventory[]` — structural metadata per file, per sheet

### Phase 3: Analyze (`nodes/analyze.ts`)

**Status: Working**

- One LLM call per sheet with structured output (`withStructuredOutput`)
- Prompt includes: sheet name, dimensions, sample rows (first 30 + last 5)
- LLM identifies: logical table regions, header rows, data start/end rows, column types
- Returns `SheetAnalysis[]` with `logicalTables` per sheet
- Processes sheets in parallel (concurrency limit)
- Emits progress events (20-40%), token_update events

### Phase 4: Design (`nodes/design.ts`)

**Status: Working**

- One LLM call for entire project with structured output
- Prompt includes: all sheet analyses serialized as context
- LLM produces:
  - Table definitions: names, column schemas (source→output mappings, types, transformations)
  - Relationships between tables (FK detection)
  - Catalog metadata: project description, domain notes, data quality notes
- Post-processes LLM output to fix `sourceFileId` (maps against real DB UUIDs)
- Emits progress events (40-50%)
- If `reviewMode='review'`: emits `review_ready` and graph pauses for user approval

### Phase 5: Review Gate (conditional)

**Status: Working (after bug fixes)**

- If review mode: graph ends after design, run status → `review_pending`
- User reviews extraction plan in `ExtractionPlanReview` component
- User can include/skip tables, rename output tables, modify columns
- On approval: run transitions back to `pending`, graph resumes at extract node

### Phase 6: Extract (`nodes/extract.ts`)

**Status: STUB / PLACEHOLDER**

Current implementation:
```typescript
// TODO: Real implementation will:
// 1. Build DuckDB SQL from the table's column definitions + transformations
// 2. Execute in Python sandbox (read source → transform → COPY TO Parquet at /tmp)
// 3. Retrieve Parquet file from sandbox response
// 4. Upload to cloud storage via StorageProvider
// 5. Return row count, size, column null counts

// Placeholder extraction result
const result: ExtractionResult = {
  tableId: table.tableName,
  tableName: table.tableName,
  outputPath: table.outputPath,        // ← Path where Parquet WOULD go
  rowCount: table.estimatedRows,       // ← LLM estimate, NOT real count
  sizeBytes: 0,                        // ← No file created
  columns: table.columns.map(c => ({
    name: c.outputName,
    type: c.outputType,
    nullCount: 0,                      // ← Fake: no actual null checking
  })),
  status: 'success',                   // ← Always succeeds (it's a no-op)
};
```

**What it does**: Returns fake "success" results using the LLM's estimated row counts. No data is read from Excel files. No transformations are applied. No Parquet files are created. No S3 uploads happen.

**What it SHOULD do**:
1. For each table in the extraction plan:
   a. Read the source Excel sheet's data region (headerRow, dataStartRow, dataEndRow)
   b. Apply column mappings (sourceName → outputName)
   c. Apply type conversions (the `transformation` field, e.g., `CAST(value AS DATE)`)
   d. Handle special cases: merged cells, transposition, skip rows
   e. Write the result to a Parquet file
   f. Upload the Parquet file to S3 at the `outputPath`
   g. Return actual row count, file size, null counts per column

### Phase 7: Validate (`nodes/validate.ts`)

**Status: Running but ineffective**

Validation checks:
1. **extraction_status**: Was extraction successful? (Always yes for stub)
2. **row_count**: Is actual row count within 10%-200% of estimated? (Always exactly matches because stub returns estimate)
3. **null_check**: Are non-nullable columns mostly non-null? (Always passes — stub reports 0 nulls)
4. **column_count**: Does extracted column count match plan? (Always matches — stub copies plan columns)

**Result**: Validation always passes because it's checking stub data against itself. This will become useful once the extract node produces real data.

### Phase 8: Persist (`nodes/persist.ts`)

**Status: Partially working**

What it does:
- ✅ Creates `spreadsheet_tables` records in PostgreSQL with metadata
- ✅ Updates project aggregate stats (tableCount, totalRows, totalSizeBytes)
- ✅ Generates a catalog JSON structure in memory
- ❌ Does NOT upload Parquet files to S3 (they don't exist)
- ❌ Does NOT upload catalog.json to S3 (`// TODO: Upload catalog.json`)
- ❌ `totalSizeBytes` is always 0 (no real files)
- ❌ `outputPath` points to a non-existent S3 key

### Endpoints That Don't Work

**Table Preview** (`getTablePreview`):
```typescript
// TODO: Implement DuckDB-based Parquet preview in Phase 4
return {
  columns: [] as string[],
  rows: [] as Record<string, unknown>[],
  totalRows: Number(table.rowCount),
};
```
Returns empty data. Would need to read the Parquet file (which doesn't exist) via DuckDB.

**Table Download** (`getTableDownloadUrl`):
```typescript
// TODO: Implement signed URL generation via StorageProvider
return {
  downloadUrl: '',
  expiresAt: '',
};
```
Returns empty URL. Would need to generate an S3 presigned URL for the Parquet file.

---

## Part 3: Issues Fixed in PR #58 (2026-02-23)

The following 9 issues were identified and fixed in branch `fix/spreadsheet-agent-issues`:

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | Progress bar not shown during streaming | High | ✅ Fixed — hook reads flat event fields |
| 2 | Token count 0 on resume after review | Medium | ✅ Fixed — tokens injected from previous run stats |
| 3 | LLM hallucinating file IDs → persist fails silently | Critical | ✅ Fixed — sourceFileId resolved programmatically + persist throws + finalState.error check |
| 4 | "Start Run" visible during review_pending | High | ✅ Fixed — button hidden + plan auto-loaded |
| 5 | DuckDB/Parquet details shown in UI | Low | ✅ Fixed — prompt cleaned + cleanDescription utility |
| 6 | Phase chips show "pending" on resume | Low | ✅ Fixed — synthetic phase events emitted |
| 7 | Project status stuck at "processing" | High | ✅ Fixed — symptom of Issue 3 |
| 8 | claimRun overwrites startedAt on resume | Medium | ✅ Fixed — startedAt preserved if already set |
| 9 | Timer resets to 0:00 on resume | Low | ✅ Fixed — uses run startedAt from DB |

---

## Part 4: Outstanding Issues (New)

### Issue 10: Extract Node Is a Placeholder — No Real Data Extraction

**Severity**: **BLOCKER** (Core Feature Missing)

The extract node (`apps/api/src/spreadsheet-agent/agent/nodes/extract.ts`) is a complete stub. It does not read any data from the source Excel files, does not apply any transformations, and does not produce any output files.

**Impact**:
- All `spreadsheet_tables` records have `outputSizeBytes = 0`
- All `rowCount` values are LLM estimates, not real
- No Parquet files exist on disk or in S3
- Table preview returns empty data
- Table download returns empty URL
- The agent reports "success" but delivers zero usable output

**What needs to be built**:

The extract node must implement a real data extraction pipeline for each table in the extraction plan:

1. **Read source data**: Use the XLSX library to read the specific data region of the source sheet (headerRow, dataStartRow, dataEndRow from the plan). The source file is already on disk at the path stored in `spreadsheet_files.storagePath`.

2. **Apply column mappings**: Map `sourceName` → `outputName` for each column per the extraction plan.

3. **Apply transformations**: The design node generates SQL-like transformations (e.g., `TRIM(value)`, `CAST(value AS DATE)`). These need to be evaluated — either via a DuckDB/SQL engine or via JavaScript transformation functions.

4. **Handle edge cases from the analysis**:
   - `skipRows`: Skip specified row indices
   - `needsTranspose`: Transpose the sheet before extraction
   - Merged cells: Resolve to fill values
   - Multi-table sheets: Extract only the specified data region

5. **Write Parquet output**: Serialize the transformed data to Parquet format. Options:
   - Use `parquetjs` or `parquet-wasm` for Node.js native Parquet writing
   - Use DuckDB's `COPY TO` via a Python sandbox
   - Use Apache Arrow JS + Parquet writer

6. **Return real metrics**: Actual row count, file size in bytes, null count per column.

**Approach options**:

| Approach | Pros | Cons |
|----------|------|------|
| **A: Node.js native (XLSX + parquetjs)** | No external dependencies, runs in same process | Parquet writing libs are less mature in JS, complex transformations are harder |
| **B: DuckDB in-process** | Excellent Parquet support, SQL transformations native, fast | DuckDB Node.js bindings can be tricky in Docker, adds ~50MB to image |
| **C: Python sandbox** | DuckDB + pandas native, most flexible transformations | Requires separate Python container/process, IPC complexity |
| **D: DuckDB WASM** | Runs in Node.js via WASM, no native bindings | Slower than native DuckDB, memory limits |

**Recommended**: Approach B (DuckDB in-process via `@duckdb/node-api` or `duckdb` npm package) or Approach A (pure Node.js) for simplicity.

### Issue 11: No S3 Upload Pipeline

**Severity**: **BLOCKER** (Core Feature Missing)

There is no code anywhere in the spreadsheet agent that uploads files to S3 or any cloud storage. The project has `storageProvider: 's3'` and `outputBucket: 'knecta'` configured, but these values are never used.

**What needs to be built**:

1. **Storage abstraction**: A `StorageProvider` interface with implementations for S3 (and optionally local filesystem for dev).

2. **Source file upload** (during file upload step):
   - Currently files are written only to `/tmp` which is ephemeral
   - Should also upload to S3 at a stable path (e.g., `s3://knecta/spreadsheet-agent/{projectId}/source/{fileHash}{ext}`)
   - Update `spreadsheet_files.storagePath` to point to S3 key

3. **Parquet file upload** (during extract phase):
   - After creating each Parquet file locally, upload to S3 at the `outputPath` (e.g., `s3://knecta/spreadsheet-agent/{projectId}/{tableName}.parquet`)

4. **Catalog upload** (during persist phase):
   - Upload `catalog.json` to `s3://knecta/spreadsheet-agent/{projectId}/catalog.json`

5. **Signed URL generation** (for table download):
   - `getTableDownloadUrl()` should generate an S3 presigned URL for the Parquet file

**Dependencies**: AWS SDK v3 (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`), S3 bucket + IAM credentials in env vars.

### Issue 12: Table Preview Not Implemented

**Severity**: High (UX — Feature Missing)

The `getTablePreview()` endpoint returns empty arrays. Once Parquet files exist (Issue 10), this endpoint needs to read the first N rows from the Parquet file and return them as JSON.

**Options**:
- **DuckDB**: `SELECT * FROM read_parquet('path.parquet') LIMIT N` — most natural if DuckDB is already used for extraction
- **parquetjs**: Read Parquet file directly in Node.js
- **Arrow**: Use Apache Arrow to read Parquet and convert to JSON

### Issue 13: Table Download Not Implemented

**Severity**: High (UX — Feature Missing)

The `getTableDownloadUrl()` endpoint returns an empty URL. Once Parquet files are in S3 (Issue 11), this needs to generate a presigned URL with expiry.

### Issue 14: File Status Never Updated to "extracted"

**Severity**: Medium (Data Integrity)

Both project files show `status: 'analyzing'` even after runs complete. The file status should transition through:
- `pending` → `uploaded` → `analyzing` (during analyze) → `extracted` (after extraction)

The `file_complete` event handler in the agent service sets status to `'analyzing'`, but nothing ever sets it to `'extracted'` after the extract phase completes.

**Files to change**:
- `apps/api/src/spreadsheet-agent/agent/spreadsheet-agent-agent.service.ts` — add status update after extract phase

### Issue 15: Sample1.xls Produced Zero Tables

**Severity**: Medium (Data Quality)

In project 6e8d73ae, Sample1.xls (182KB, 1 sheet) produced 0 tables across both runs. All 60 tables (across 2 runs) came from Sample2.xls.

**Possible causes**:
- The LLM did not identify any logical tables in Sample1.xls's single sheet
- The sheet may have a structure the LLM couldn't parse (e.g., dashboard, chart-only, or very sparse data)
- The file may have parsing issues with the old .xls format

**Investigation needed**: Check the sheet analysis for Sample1.xls — did the analyze node return any logical tables?

### Issue 16: Duplicate Tables Across Runs

**Severity**: Medium (Data Integrity)

The project has 60 table records but only 24 unique tables are shown (from the latest run). Run 1 created 36 tables, run 2 created 24 tables. Both sets remain in the DB. The persist node creates new records each time without cleaning up old ones from previous runs.

**Fix needed**: Before persisting new tables, delete any existing tables from the same project's previous runs. Or link tables to specific runs and show only the latest successful run's tables.

### Issue 17: Validation Is Meaningless on Stub Data

**Severity**: Low (Tech Debt — becomes important when extract is real)

The validation node validates the extract node's output. Since the extract node returns stub data that perfectly matches the plan (exact estimated row counts, 0 nulls, matching column counts), validation always passes. This means the revision loop (max 3 retries) has never been tested with real data.

**No fix needed now** — this will naturally start working once the extract node produces real data. But the validation checks should be reviewed when that happens:
- Row count ratio bounds (0.1x to 2.0x of estimated) may be too tight or too loose
- NULL ratio threshold (0.8) may need adjustment
- Additional checks may be needed (e.g., type conformance, data range validation)

### Issue 18: Source Files Only in /tmp (Lost on Container Restart)

**Severity**: High (Production Readiness)

Source files are written to `/tmp/spreadsheet-agent/{projectId}/{hash}{ext}` inside the API container. This path is:
- Ephemeral — lost when the container restarts
- Local — not accessible from other container instances
- Not backed up

The `spreadsheet_files.storagePath` field stores this /tmp path. If the container restarts between upload and run, the ingest node will fail because the files are gone.

**Fix**: Upload source files to S3 during the upload step (Issue 11). The storagePath should point to the S3 key. The ingest node should download from S3 to a local temp file before parsing.

---

## Part 5: Implementation Roadmap

### Phase A: Core Extract Pipeline (Issues 10, 14, 17)

**Goal**: Make the extract node actually read data from Excel files and produce real output.

**Approach**: Use the XLSX library (already a dependency) to read cell data based on the extraction plan's coordinates. Transform data in JavaScript. Write output as JSON initially (Parquet can be added later or via DuckDB).

1. Read source file from disk (already available via `files[].storagePath`)
2. Open the specific sheet (`sourceSheetName`)
3. Read the data region (`headerRow`, `dataStartRow`, `dataEndRow`)
4. Apply column mappings and transformations
5. Produce an in-memory table (array of row objects)
6. Write to Parquet format (or CSV as interim)
7. Return real row count, file size, null counts

### Phase B: Storage Pipeline (Issues 11, 13, 18)

**Goal**: Upload source files and output files to S3.

1. Add `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`
2. Create `StorageProvider` abstraction (S3 impl + local filesystem for dev)
3. Upload source files to S3 during upload step
4. Upload Parquet files to S3 during extract step
5. Upload catalog.json during persist step
6. Implement signed URL generation for download endpoint
7. Add env vars: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET`

### Phase C: Table Preview (Issue 12)

**Goal**: Let users preview extracted data before downloading.

1. Read first N rows from the Parquet file (from S3 or local cache)
2. Return as `{ columns: string[], rows: Record<string, any>[], totalRows: number }`
3. Consider caching the first 500 rows in the `spreadsheet_tables` record for fast preview

### Phase D: Data Quality & Polish (Issues 15, 16)

**Goal**: Handle edge cases and clean up data management.

1. Investigate Sample1.xls non-extraction (Issue 15)
2. Add run-scoped table management — clean up old tables on new run (Issue 16)
3. Update file status to "extracted" after extraction (Issue 14)
4. Review validation thresholds once real data flows through (Issue 17)

---

## Part 6: Summary Table

| # | Issue | Severity | Category | Status |
|---|-------|----------|----------|--------|
| 1 | Progress bar not shown during streaming | High | UX | ✅ Fixed (PR #58) |
| 2 | Token count 0 on resume | Medium | UX | ✅ Fixed (PR #58) |
| 3 | LLM hallucinating file IDs | Critical | Data Loss | ✅ Fixed (PR #58) |
| 4 | Start Run visible during review_pending | High | UX | ✅ Fixed (PR #58) |
| 5 | DuckDB/Parquet details in UI | Low | UX | ✅ Fixed (PR #58) |
| 6 | Phase chips pending on resume | Low | UX | ✅ Fixed (PR #58) |
| 7 | Project status stuck at processing | High | Data | ✅ Fixed (PR #58) |
| 8 | claimRun overwrites startedAt | Medium | Logic | ✅ Fixed (PR #58) |
| 9 | Timer resets on resume | Low | UX | ✅ Fixed (PR #58) |
| **10** | **Extract node is a stub** | **BLOCKER** | **Core Feature** | ❌ Not built |
| **11** | **No S3 upload pipeline** | **BLOCKER** | **Core Feature** | ❌ Not built |
| **12** | **Table preview not implemented** | **High** | **Feature** | ❌ Not built |
| **13** | **Table download not implemented** | **High** | **Feature** | ❌ Not built |
| **14** | File status never set to "extracted" | Medium | Data | ❌ Open |
| **15** | Sample1.xls produced 0 tables | Medium | Quality | ❌ Needs investigation |
| **16** | Duplicate tables across runs | Medium | Data | ❌ Open |
| **17** | Validation meaningless on stub data | Low | Tech Debt | ⏳ Deferred until extract is real |
| **18** | Source files lost on container restart | High | Production | ❌ Open (part of Issue 11) |
