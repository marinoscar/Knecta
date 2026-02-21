import { Logger } from '@nestjs/common';
import { Database } from 'duckdb-async';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Readable } from 'stream';

import { ObjectsService } from '../../../storage/objects/objects.service';
import { SpreadsheetAgentStateType, SheetInfo } from '../state';

const logger = new Logger('ParseSheets');

/**
 * Maximum number of data rows read per sheet.
 * Acts as a safety cap to prevent runaway memory consumption on very large files.
 */
const MAX_ROWS_PER_SHEET = 500_000;

/**
 * Number of leading data rows captured as a human-readable sample.
 * Used downstream by the schema-inference LLM prompt.
 */
const SAMPLE_ROW_COUNT = 5;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Drain a Readable stream into a single contiguous Buffer.
 */
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// ---------------------------------------------------------------------------
// Per-file parser using DuckDB spatial extension
// ---------------------------------------------------------------------------

/**
 * Parse an Excel file on disk using DuckDB's spatial extension and extract
 * all non-empty sheets.
 *
 * DuckDB reads the file directly from the filesystem path, avoiding the need
 * to buffer the entire workbook in memory as a parsed object model.  Only
 * metadata, a row count, and a small sample are fetched per sheet.
 *
 * @param filePath  - Absolute path to the Excel file on disk.
 * @param fileName  - Human-readable file name used in logging and SheetInfo.
 * @returns Parsed sheets and any non-fatal error messages encountered.
 */
async function parseExcelFile(
  filePath: string,
  fileName: string,
): Promise<{ sheets: SheetInfo[]; errors: string[] }> {
  const sheets: SheetInfo[] = [];
  const errors: string[] = [];

  const db = await Database.create(':memory:');

  try {
    // Install and load the spatial extension which provides st_read / st_layers
    await db.run('INSTALL spatial;');
    await db.run('LOAD spatial;');

    // --- Enumerate sheets (layers) in the workbook ---
    let layerRows: Array<Record<string, unknown>>;
    try {
      layerRows = await db.all('SELECT * FROM st_layers(?)', filePath);
    } catch (layerError: unknown) {
      const message = layerError instanceof Error ? layerError.message : String(layerError);
      errors.push(`Error listing sheets in ${fileName}: ${message}`);
      logger.error(`Failed to list sheets in ${fileName}: ${message}`);
      return { sheets, errors };
    }

    for (const layerRow of layerRows) {
      const sheetName = String(layerRow['name']);

      try {
        // --- Determine headers ---
        // Fetch up to SAMPLE_ROW_COUNT rows first; if the sheet is non-empty
        // the keys of the first result object give us the column names.
        const sampleQueryRows = await db.all(
          `SELECT * FROM st_read(?, layer=?) LIMIT ${SAMPLE_ROW_COUNT}`,
          filePath,
          sheetName,
        );

        let headers: string[];

        if (sampleQueryRows.length > 0) {
          headers = Object.keys(sampleQueryRows[0]);
        } else {
          // Sheet exists but has no data rows – try DESCRIBE to get column names
          const describeRows = await db.all(
            'DESCRIBE SELECT * FROM st_read(?, layer=?)',
            filePath,
            sheetName,
          );
          headers = describeRows.map((r) => String(r['column_name']));
        }

        if (headers.length === 0) {
          logger.warn(`Skipping sheet "${sheetName}" in ${fileName} - no columns found`);
          continue;
        }

        // --- Get exact row count ---
        const countResult = await db.all(
          'SELECT COUNT(*) as cnt FROM st_read(?, layer=?)',
          filePath,
          sheetName,
        );
        const rowCount = Number(countResult[0]?.['cnt'] ?? 0);

        if (rowCount === 0) {
          logger.warn(`Skipping empty sheet "${sheetName}" in ${fileName}`);
          continue;
        }

        if (rowCount > MAX_ROWS_PER_SHEET) {
          logger.warn(
            `Sheet "${sheetName}" in ${fileName} has ${rowCount} rows which exceeds ` +
              `MAX_ROWS_PER_SHEET (${MAX_ROWS_PER_SHEET}). Only metadata will be recorded.`,
          );
        }

        // --- Convert sample object rows to ordered arrays ---
        const sampleRows: unknown[][] = sampleQueryRows.map((row) =>
          headers.map((h) => row[h] ?? null),
        );

        sheets.push({
          fileName,
          sheetName,
          headers,
          sampleRows,
          rowCount: Math.min(rowCount, MAX_ROWS_PER_SHEET),
          tempFilePath: filePath,
        });

        logger.log(
          `Parsed sheet "${sheetName}" from ${fileName}: ` +
            `${headers.length} columns, ${rowCount} rows`,
        );
      } catch (sheetError: unknown) {
        const message = sheetError instanceof Error ? sheetError.message : String(sheetError);
        errors.push(`Error parsing sheet "${sheetName}" in ${fileName}: ${message}`);
        logger.warn(`Failed to parse sheet "${sheetName}" in ${fileName}: ${message}`);
      }
    }
  } finally {
    await db.close();
  }

  return { sheets, errors };
}

// ---------------------------------------------------------------------------
// Node factory
// ---------------------------------------------------------------------------

/**
 * Create the `parse_sheets` LangGraph node.
 *
 * The node iterates over every storage object ID in the agent state,
 * downloads the corresponding Excel file from S3 to a shared temp directory,
 * parses each worksheet via DuckDB, and accumulates the results into the
 * state's `sheets`, `parseErrors`, and `tempDir` fields.
 *
 * Files are kept on disk after parsing because the convert-and-upload node
 * reads them again via DuckDB.  The caller is responsible for removing
 * `tempDir` once the entire graph run completes.
 *
 * If all files fail to parse the node returns an `error` field so the graph
 * can surface the failure rather than silently continuing with empty data.
 *
 * @param objectsService - NestJS service that owns storage-object DB records
 *   and wraps the underlying {@link StorageProvider} download capability.
 * @param runId          - Agent run identifier used to name the temp directory.
 * @param emitProgress   - Callback that pushes SSE-style progress events to the
 *   caller while the node executes.
 */
export function createParseSheetsNode(
  objectsService: ObjectsService,
  runId: string,
  emitProgress: (event: object) => void,
) {
  return async (
    state: SpreadsheetAgentStateType,
  ): Promise<Partial<SpreadsheetAgentStateType>> => {
    const allSheets: SheetInfo[] = [];
    const allErrors: string[] = [];

    emitProgress({
      type: 'step_start',
      step: 'parse_sheets',
      label: 'Parsing Spreadsheets',
    });

    // Create a dedicated temp directory for this run so that all downloaded
    // files are isolated and easy to clean up in a single rmdir call later.
    const tempDir = `/tmp/spreadsheet-agent-${runId}`;
    await fs.mkdir(tempDir, { recursive: true });

    logger.log(`Created temp directory: ${tempDir}`);

    for (let i = 0; i < state.storageObjectIds.length; i++) {
      const objectId = state.storageObjectIds[i];

      emitProgress({
        type: 'progress',
        phase: 'parse',
        currentFile: i + 1,
        totalFiles: state.storageObjectIds.length,
        objectId,
      });

      try {
        // Resolve the DB record to get the human-readable file name.
        const storageObject = await objectsService.getByIdInternal(objectId);
        const fileName: string = storageObject.name;

        // Write the file to disk so DuckDB can read it directly from the path.
        const tempFilePath = path.join(tempDir, `${objectId}_${fileName}`);

        logger.log(
          `Downloading file ${i + 1}/${state.storageObjectIds.length}: ${fileName}`,
        );

        const stream = await objectsService.downloadStream(objectId);
        const buffer = await streamToBuffer(stream);
        await fs.writeFile(tempFilePath, buffer);

        logger.log(
          `Saved ${fileName} to ${tempFilePath} (${buffer.length} bytes), parsing...`,
        );

        const { sheets, errors } = await parseExcelFile(tempFilePath, fileName);

        allSheets.push(...sheets);
        allErrors.push(...errors);

        emitProgress({
          type: 'file_parsed',
          fileName,
          sheetsFound: sheets.length,
          errors: errors.length,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        allErrors.push(`Failed to process storage object ${objectId}: ${message}`);
        logger.error(`Failed to process storage object ${objectId}: ${message}`);
      }
    }

    logger.log(
      `Parsed ${allSheets.length} sheets from ${state.storageObjectIds.length} files`,
    );

    // If every file failed and there is nothing to work with, surface a fatal error.
    if (allSheets.length === 0 && allErrors.length > 0) {
      return {
        sheets: [],
        parseErrors: allErrors,
        tempDir,
        error: `No valid sheets found. Errors: ${allErrors.join('; ')}`,
      };
    }

    return {
      sheets: allSheets,
      parseErrors: allErrors,
      tempDir,
    };
  };
}
