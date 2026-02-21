import { Logger } from '@nestjs/common';
import ExcelJS from 'exceljs';
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

/**
 * Coerce an ExcelJS cell value to a plain JavaScript primitive.
 *
 * ExcelJS may return rich-text objects, formula result wrappers, or Date
 * instances, none of which survive JSON serialisation cleanly.  This function
 * normalises every variant to a string | number | boolean | null that the
 * rest of the pipeline can handle without further coercion.
 */
function extractCellValue(cellValue: ExcelJS.CellValue): string | number | boolean | null {
  if (cellValue === null || cellValue === undefined) {
    return null;
  }

  if (cellValue instanceof Date) {
    return cellValue.toISOString();
  }

  if (typeof cellValue === 'object') {
    // Formula result wrapper: { formula, result, ... }
    if ('result' in cellValue) {
      const result = (cellValue as ExcelJS.CellFormulaValue).result;
      return extractCellValue(result as ExcelJS.CellValue);
    }

    // Shared-formula value: { sharedFormula, result, ... }
    if ('sharedFormula' in cellValue) {
      const result = (cellValue as ExcelJS.CellSharedFormulaValue).result;
      return extractCellValue(result as ExcelJS.CellValue);
    }

    // Rich-text object: { richText: [{ text, font, ... }, ...] }
    if ('richText' in cellValue) {
      return (cellValue as ExcelJS.CellRichTextValue).richText
        .map((rt) => rt.text)
        .join('');
    }

    // Hyperlink object: { text, hyperlink }
    if ('text' in cellValue) {
      return String((cellValue as ExcelJS.CellHyperlinkValue).text);
    }

    // Error value: { error: '#REF!' }
    if ('error' in cellValue) {
      return null;
    }

    return String(cellValue);
  }

  // Primitives: string | number | boolean
  return cellValue as string | number | boolean;
}

// ---------------------------------------------------------------------------
// Per-file parser
// ---------------------------------------------------------------------------

/**
 * Load an Excel workbook from a buffer and extract all non-empty sheets.
 *
 * Each sheet yields a {@link SheetInfo} containing the full row data plus a
 * small leading sample that is forwarded to the LLM schema-inference step.
 */
async function parseExcelFile(
  buffer: Buffer,
  fileName: string,
): Promise<{ sheets: SheetInfo[]; errors: string[] }> {
  const sheets: SheetInfo[] = [];
  const errors: string[] = [];

  let workbook: ExcelJS.Workbook;
  try {
    workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
  } catch (fileError: unknown) {
    const message = fileError instanceof Error ? fileError.message : String(fileError);
    errors.push(`Error parsing file ${fileName}: ${message}`);
    logger.error(`Failed to parse Excel file ${fileName}: ${message}`);
    return { sheets, errors };
  }

  for (const worksheet of workbook.worksheets) {
    const sheetName = worksheet.name;

    try {
      if (worksheet.rowCount <= 1) {
        logger.warn(`Skipping empty sheet "${sheetName}" in ${fileName}`);
        continue;
      }

      // --- Extract headers from row 1 ---
      const headerRow = worksheet.getRow(1);
      const headers: string[] = [];

      headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const raw = extractCellValue(cell.value);
        headers.push(raw !== null ? String(raw).trim() : `Column_${colNumber}`);
      });

      if (headers.length === 0) {
        logger.warn(`Skipping sheet "${sheetName}" in ${fileName} - no headers found`);
        continue;
      }

      // --- Extract data rows ---
      const rawData: (string | number | boolean | null)[][] = [];
      const sampleRows: (string | number | boolean | null)[][] = [];
      const dataRowLimit = Math.min(worksheet.rowCount - 1, MAX_ROWS_PER_SHEET);

      for (let rowIdx = 2; rowIdx <= dataRowLimit + 1; rowIdx++) {
        const row = worksheet.getRow(rowIdx);
        const rowData: (string | number | boolean | null)[] = [];
        let hasValue = false;

        for (let colIdx = 1; colIdx <= headers.length; colIdx++) {
          const value = extractCellValue(row.getCell(colIdx).value);
          rowData.push(value);
          if (value !== null) {
            hasValue = true;
          }
        }

        // Skip rows where every cell is empty
        if (!hasValue) {
          continue;
        }

        rawData.push(rowData);

        if (sampleRows.length < SAMPLE_ROW_COUNT) {
          sampleRows.push(rowData);
        }
      }

      if (rawData.length === 0) {
        logger.warn(`Skipping sheet "${sheetName}" in ${fileName} - no data rows after header`);
        continue;
      }

      sheets.push({
        fileName,
        sheetName,
        headers,
        sampleRows,
        rowCount: rawData.length,
        rawData,
      });

      logger.log(
        `Parsed sheet "${sheetName}" from ${fileName}: ` +
          `${headers.length} columns, ${rawData.length} rows`,
      );
    } catch (sheetError: unknown) {
      const message = sheetError instanceof Error ? sheetError.message : String(sheetError);
      errors.push(`Error parsing sheet "${sheetName}" in ${fileName}: ${message}`);
      logger.warn(`Failed to parse sheet "${sheetName}" in ${fileName}: ${message}`);
    }
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
 * downloads the corresponding Excel file from S3 via {@link ObjectsService},
 * parses each worksheet, and accumulates the results into the state's
 * `sheets` and `parseErrors` fields.
 *
 * If all files fail to parse the node returns an `error` field so the graph
 * can surface the failure rather than silently continuing with empty data.
 *
 * @param objectsService - NestJS service that owns storage-object DB records
 *   and wraps the underlying {@link StorageProvider} download capability.
 * @param _runId - Agent run identifier, reserved for future trace correlation.
 * @param emitProgress - Callback that pushes SSE-style progress events to the
 *   caller while the node executes.
 */
export function createParseSheetsNode(
  objectsService: ObjectsService,
  _runId: string,
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

        logger.log(
          `Downloading file ${i + 1}/${state.storageObjectIds.length}: ${fileName}`,
        );

        // Stream the file from S3 and buffer it in memory for ExcelJS.
        const stream = await objectsService.downloadStream(objectId);
        const buffer = await streamToBuffer(stream);

        logger.log(`Downloaded ${fileName} (${buffer.length} bytes), parsing...`);

        const { sheets, errors } = await parseExcelFile(buffer, fileName);

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
        error: `No valid sheets found. Errors: ${allErrors.join('; ')}`,
      };
    }

    return {
      sheets: allSheets,
      parseErrors: allErrors,
    };
  };
}
