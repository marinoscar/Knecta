import { Logger } from '@nestjs/common';
import { Readable } from 'stream';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { SpreadsheetAgentStateType, InferredTable, UploadedTable } from '../state';
import { SpreadsheetAgentService } from '../../spreadsheet-agent.service';
import { StorageProvider } from '../../../storage/providers/storage-provider.interface';

const logger = new Logger('ConvertAndUpload');

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

/**
 * Map our logical data types to the parquetjs-lite field type strings.
 */
function mapToParquetType(dataType: string): string {
  switch (dataType) {
    case 'int64':
      return 'INT64';
    case 'float64':
      return 'DOUBLE';
    case 'boolean':
      return 'BOOLEAN';
    case 'date':
    case 'timestamp':
      // Stored as ISO-8601 strings so downstream SQL engines can cast them.
      return 'UTF8';
    case 'string':
    default:
      return 'UTF8';
  }
}

// ---------------------------------------------------------------------------
// Value coercion
// ---------------------------------------------------------------------------

/**
 * Coerce a raw cell value to the target logical data type.
 *
 * Returns `null` when the value is empty or cannot be converted, which lets
 * the Parquet writer omit the field for optional columns.
 */
function coerceValue(value: unknown, dataType: string): unknown {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  switch (dataType) {
    case 'int64': {
      const num = Number(value);
      return isNaN(num) ? null : Math.round(num);
    }
    case 'float64': {
      const num = Number(value);
      return isNaN(num) ? null : num;
    }
    case 'boolean': {
      if (typeof value === 'boolean') return value;
      const str = String(value).toLowerCase().trim();
      if (['true', 'yes', '1', 'y'].includes(str)) return true;
      if (['false', 'no', '0', 'n'].includes(str)) return false;
      return null;
    }
    case 'date':
    case 'timestamp': {
      if (value instanceof Date) return value.toISOString();
      const str = String(value);
      const d = new Date(str);
      return isNaN(d.getTime()) ? str : d.toISOString();
    }
    case 'string':
    default:
      return String(value);
  }
}

// ---------------------------------------------------------------------------
// CSV conversion (reliable fallback)
// ---------------------------------------------------------------------------

/**
 * Serialise an {@link InferredTable} to a UTF-8 CSV buffer.
 *
 * Used as a fallback when Parquet conversion fails so that data is never
 * silently lost.
 */
function convertToCsv(table: InferredTable): Buffer {
  const lines: string[] = [];

  // Header row — quote every field to handle embedded commas or quotes.
  lines.push(
    table.columns
      .map((c) => `"${c.name.replace(/"/g, '""')}"`)
      .join(','),
  );

  // Data rows
  for (const row of table.rawData) {
    const cells = table.columns.map((col, i) => {
      const value = coerceValue(row[i], col.dataType);
      if (value === null) return '';
      if (typeof value === 'string') return `"${value.replace(/"/g, '""')}"`;
      return String(value);
    });
    lines.push(cells.join(','));
  }

  return Buffer.from(lines.join('\n'), 'utf-8');
}

// ---------------------------------------------------------------------------
// Parquet conversion
// ---------------------------------------------------------------------------

/**
 * Attempt to convert an {@link InferredTable} to a Parquet buffer.
 *
 * Writes to a temp file on the local filesystem (parquetjs-lite requires a
 * file path) and then reads it back into memory before cleaning up.
 *
 * Returns `null` on any failure so callers can fall back to CSV.
 */
async function convertToParquet(table: InferredTable): Promise<Buffer | null> {
  let tmpPath: string | null = null;

  try {
    // Dynamic import so that a missing or broken native module does not crash
    // the process at startup — it degrades gracefully to CSV instead.
    const parquet = await import('parquetjs-lite');

    // Build the schema.  All columns are declared optional so that sparse rows
    // (which are common in real-world spreadsheets) do not cause write errors.
    const schemaFields: Record<string, { type: string; optional: boolean }> = {};
    for (const col of table.columns) {
      schemaFields[col.name] = {
        type: mapToParquetType(col.dataType),
        optional: true,
      };
    }

    const schema = new parquet.ParquetSchema(schemaFields);

    tmpPath = path.join(
      os.tmpdir(),
      `parquet_${Date.now()}_${Math.random().toString(36).slice(2)}.parquet`,
    );

    const writer = await parquet.ParquetWriter.openFile(schema, tmpPath);

    for (const row of table.rawData) {
      const record: Record<string, unknown> = {};

      for (let i = 0; i < table.columns.length; i++) {
        const col = table.columns[i];
        const value = coerceValue(row[i], col.dataType);
        // Omit null values entirely — parquetjs-lite handles optional fields
        // correctly when the key is absent from the record object.
        if (value !== null) {
          record[col.name] = value;
        }
      }

      // Skip entirely empty rows to avoid writing zero-field records.
      if (Object.keys(record).length > 0) {
        await writer.appendRow(record);
      }
    }

    await writer.close();

    const buffer = await fs.readFile(tmpPath);
    return buffer;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`Parquet conversion failed, will use CSV fallback: ${message}`);
    return null;
  } finally {
    if (tmpPath) {
      await fs.unlink(tmpPath).catch(() => {
        // Best-effort cleanup — ignore errors if the file was never created.
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Node factory
// ---------------------------------------------------------------------------

/**
 * Create the `convert_and_upload` LangGraph node.
 *
 * For each {@link InferredTable} in the agent state the node:
 *   1. Attempts to serialise the data to Parquet using `parquetjs-lite`.
 *   2. Falls back to CSV if Parquet conversion fails.
 *   3. Uploads the resulting buffer to S3 under a run-scoped prefix.
 *   4. Records per-table outcomes (ready | failed) in the returned state slice.
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
        // Attempt Parquet first; fall back to CSV on any failure.
        let fileBuffer = await convertToParquet(table);
        let fileExtension: string;
        let mimeType: string;
        let format: string;

        if (fileBuffer) {
          fileExtension = '.parquet';
          mimeType = 'application/octet-stream';
          format = 'parquet';
        } else {
          logger.log(`Using CSV format for table "${table.tableName}"`);
          fileBuffer = convertToCsv(table);
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
        logger.error(`Failed to convert/upload table "${table.tableName}": ${message}`);

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
