import { Logger } from '@nestjs/common';
import { Readable } from 'stream';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { Database } from 'duckdb-async';

import { SpreadsheetAgentStateType, InferredTable, UploadedTable } from '../state';
import { SpreadsheetAgentService } from '../../spreadsheet-agent.service';
import { StorageProvider } from '../../../storage/providers/storage-provider.interface';

const logger = new Logger('ConvertAndUpload');

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

/**
 * Map our logical data types to DuckDB SQL type names used in CAST expressions.
 */
function mapToDuckDbType(dataType: string): string {
  switch (dataType) {
    case 'int64':
      return 'BIGINT';
    case 'float64':
      return 'DOUBLE';
    case 'boolean':
      return 'BOOLEAN';
    case 'date':
      return 'DATE';
    case 'timestamp':
      return 'TIMESTAMP';
    case 'string':
    default:
      return 'VARCHAR';
  }
}

// ---------------------------------------------------------------------------
// SQL safety helpers
// ---------------------------------------------------------------------------

/**
 * Escape single quotes in a string for use inside a SQL string literal by
 * doubling them.  This is required because DuckDB's st_read() does not
 * support parameter binding for file paths.
 */
function escapeSqlString(s: string): string {
  return s.replace(/'/g, "''");
}

/**
 * Escape double quotes inside a SQL identifier by doubling them, then wrap
 * the whole identifier in double quotes.
 *
 * Example: `my "col"` → `"my ""col"""`
 */
function escapeSqlIdentifier(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

// ---------------------------------------------------------------------------
// SQL builder
// ---------------------------------------------------------------------------

/**
 * Build the DuckDB COPY statement that reads an Excel sheet via the spatial
 * extension and writes a Parquet file to disk.
 *
 * Each column is selected with TRY_CAST so that type-conversion failures
 * produce NULLs rather than aborting the whole export.
 */
function buildCopySql(
  table: InferredTable,
  tempFilePath: string,
  outputPath: string,
): string {
  const safeInputPath = escapeSqlString(tempFilePath);
  const safeOutputPath = escapeSqlString(outputPath);
  const safeLayer = escapeSqlString(table.sourceSheet);

  const selectCols = table.columns
    .map((col) => {
      const originalIdent = escapeSqlIdentifier(col.originalName);
      const cleanIdent = escapeSqlIdentifier(col.name);
      const duckType = mapToDuckDbType(col.dataType);
      return `    TRY_CAST(${originalIdent} AS ${duckType}) AS ${cleanIdent}`;
    })
    .join(',\n');

  return [
    'COPY (',
    '  SELECT',
    selectCols,
    `  FROM st_read('${safeInputPath}', layer='${safeLayer}')`,
    `) TO '${safeOutputPath}' (FORMAT PARQUET);`,
  ].join('\n');
}

/**
 * Build the DuckDB COPY statement that writes a CSV file instead of Parquet.
 * Used as a secondary fallback when Parquet export fails.
 */
function buildCsvCopySql(
  table: InferredTable,
  tempFilePath: string,
  outputPath: string,
): string {
  const safeInputPath = escapeSqlString(tempFilePath);
  const safeOutputPath = escapeSqlString(outputPath);
  const safeLayer = escapeSqlString(table.sourceSheet);

  const selectCols = table.columns
    .map((col) => {
      const originalIdent = escapeSqlIdentifier(col.originalName);
      const cleanIdent = escapeSqlIdentifier(col.name);
      // Cast everything to VARCHAR for CSV so values are readable.
      return `    TRY_CAST(${originalIdent} AS VARCHAR) AS ${cleanIdent}`;
    })
    .join(',\n');

  return [
    'COPY (',
    '  SELECT',
    selectCols,
    `  FROM st_read('${safeInputPath}', layer='${safeLayer}')`,
    `) TO '${safeOutputPath}' (FORMAT CSV, HEADER);`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// DuckDB conversion helpers
// ---------------------------------------------------------------------------

/**
 * Attempt to convert a single {@link InferredTable} to a Parquet buffer using
 * DuckDB's spatial extension.
 *
 * DuckDB reads the source Excel file directly with st_read() and writes a
 * Parquet file to a temp path.  The temp file is then read back into a Buffer
 * and deleted.
 *
 * Returns `null` on any failure so the caller can attempt CSV export instead.
 */
async function convertToParquet(table: InferredTable): Promise<Buffer | null> {
  const outputPath = path.join(
    os.tmpdir(),
    `parquet_${Date.now()}_${Math.random().toString(36).slice(2)}.parquet`,
  );

  let db: Database | null = null;

  try {
    db = await Database.create(':memory:');

    await db.run("INSTALL spatial;");
    await db.run("LOAD spatial;");

    const sql = buildCopySql(table, table.tempFilePath, outputPath);

    logger.debug(`Executing Parquet COPY for table "${table.tableName}":\n${sql}`);

    await db.run(sql);

    const buffer = await fs.readFile(outputPath);
    return buffer;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(
      `Parquet conversion failed for table "${table.tableName}", will try CSV fallback: ${message}`,
    );
    return null;
  } finally {
    if (db) {
      await db.close().catch(() => {
        // Best-effort cleanup.
      });
    }
    await fs.unlink(outputPath).catch(() => {
      // File may not exist if the COPY statement never ran.
    });
  }
}

/**
 * Attempt to convert a single {@link InferredTable} to a CSV buffer using
 * DuckDB's spatial extension.
 *
 * This is the secondary fallback when Parquet export fails.  DuckDB still
 * reads the Excel file directly, so no JS-level data loading occurs.
 *
 * Returns `null` on any failure so the caller can mark the table as failed.
 */
async function convertToCsv(table: InferredTable): Promise<Buffer | null> {
  const outputPath = path.join(
    os.tmpdir(),
    `csv_${Date.now()}_${Math.random().toString(36).slice(2)}.csv`,
  );

  let db: Database | null = null;

  try {
    db = await Database.create(':memory:');

    await db.run("INSTALL spatial;");
    await db.run("LOAD spatial;");

    const sql = buildCsvCopySql(table, table.tempFilePath, outputPath);

    logger.debug(`Executing CSV COPY for table "${table.tableName}":\n${sql}`);

    await db.run(sql);

    const buffer = await fs.readFile(outputPath);
    return buffer;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(
      `CSV conversion also failed for table "${table.tableName}": ${message}`,
    );
    return null;
  } finally {
    if (db) {
      await db.close().catch(() => {
        // Best-effort cleanup.
      });
    }
    await fs.unlink(outputPath).catch(() => {
      // File may not exist if the COPY statement never ran.
    });
  }
}

// ---------------------------------------------------------------------------
// Node factory
// ---------------------------------------------------------------------------

/**
 * Create the `convert_and_upload` LangGraph node.
 *
 * For each {@link InferredTable} in the agent state the node:
 *   1. Attempts to serialise the data to Parquet using DuckDB's spatial
 *      extension (reads Excel → writes Parquet without loading data into JS).
 *   2. Falls back to a DuckDB-based CSV export if Parquet conversion fails.
 *   3. Marks the table as failed if both formats fail.
 *   4. Uploads the resulting buffer to S3 under a run-scoped prefix.
 *   5. Records per-table outcomes (ready | failed) in the returned state slice.
 *
 * Each run gets its own S3 folder (`spreadsheets/<runId>/`) so files from
 * concurrent or repeated runs never collide.
 *
 * @param storageProvider - Abstracted storage back-end used for uploads.
 * @param spreadsheetService - Service used to persist run progress updates.
 * @param runId - Unique identifier for this agent run.
 * @param emitProgress - Callback that pushes SSE-style progress events to the
 *   caller while the node executes.
 */
export function createConvertAndUploadNode(
  storageProvider: StorageProvider,
  spreadsheetService: SpreadsheetAgentService,
  runId: string,
  emitProgress: (event: object) => void,
) {
  return async (
    state: SpreadsheetAgentStateType,
  ): Promise<Partial<SpreadsheetAgentStateType>> => {
    if (state.tables.length === 0) {
      return {
        uploadedTables: [],
        error: state.error ?? 'No tables to convert',
      };
    }

    emitProgress({
      type: 'step_start',
      step: 'convert_and_upload',
      label: 'Converting & Uploading to S3',
    });

    const s3OutputPrefix = `spreadsheets/${runId}/`;
    const uploadedTables: UploadedTable[] = [];

    for (let i = 0; i < state.tables.length; i++) {
      const table = state.tables[i];

      emitProgress({
        type: 'progress',
        phase: 'convert_upload',
        currentTable: i + 1,
        totalTables: state.tables.length,
        tableName: table.tableName,
      });

      try {
        // --- Attempt 1: DuckDB → Parquet ---
        let fileBuffer: Buffer | null = await convertToParquet(table);
        let fileExtension: string;
        let mimeType: string;
        let format: string;

        if (fileBuffer) {
          fileExtension = '.parquet';
          mimeType = 'application/octet-stream';
          format = 'parquet';
        } else {
          // --- Attempt 2: DuckDB → CSV ---
          logger.log(
            `Parquet failed for table "${table.tableName}", attempting CSV export via DuckDB`,
          );
          fileBuffer = await convertToCsv(table);

          if (!fileBuffer) {
            // Both formats failed — mark the table as failed and continue.
            throw new Error(
              'Both Parquet and CSV exports failed via DuckDB; see earlier warnings for details.',
            );
          }

          fileExtension = '.csv';
          mimeType = 'text/csv';
          format = 'csv';
        }

        const storageKey = `${s3OutputPrefix}${table.tableName}${fileExtension}`;

        await storageProvider.upload(
          storageKey,
          Readable.from(fileBuffer),
          {
            mimeType,
            contentLength: fileBuffer.length,
            metadata: {
              'run-id': runId,
              'source-file': table.sourceFile,
              'source-sheet': table.sourceSheet,
              'table-name': table.tableName,
              'row-count': String(table.rowCount),
              format,
            },
          },
        );

        logger.log(
          `Uploaded ${storageKey} (${fileBuffer.length} bytes, ${table.rowCount} rows, ${format})`,
        );

        uploadedTables.push({
          sourceFile: table.sourceFile,
          sourceSheet: table.sourceSheet,
          tableName: table.tableName,
          columns: table.columns,
          rowCount: table.rowCount,
          sizeBytes: fileBuffer.length,
          storageKey,
          status: 'ready',
        });

        emitProgress({
          type: 'table_uploaded',
          tableName: table.tableName,
          storageKey,
          sizeBytes: fileBuffer.length,
          rowCount: table.rowCount,
          format,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(
          `Failed to convert/upload table "${table.tableName}": ${message}`,
        );

        uploadedTables.push({
          sourceFile: table.sourceFile,
          sourceSheet: table.sourceSheet,
          tableName: table.tableName,
          columns: table.columns,
          rowCount: table.rowCount,
          sizeBytes: 0,
          storageKey: '',
          status: 'failed',
          errorMessage: message,
        });

        emitProgress({
          type: 'table_error',
          tableName: table.tableName,
          error: message,
        });
      }
    }

    // Persist progress so the DB reflects where the run is at this point.
    const readyCount = uploadedTables.filter((t) => t.status === 'ready').length;

    await spreadsheetService
      .updateRunProgress(runId, {
        currentStep: 'convert_and_upload',
        currentStepLabel: 'Converting & Uploading to S3',
        percentComplete: 80,
        tablesUploaded: readyCount,
        totalTables: state.tables.length,
      })
      .catch(() => {
        // Non-fatal — do not abort the graph if the progress update fails.
      });

    return {
      uploadedTables,
      s3OutputPrefix,
    };
  };
}
