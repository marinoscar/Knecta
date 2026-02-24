import { Injectable, Logger } from '@nestjs/common';
import * as XLSX from 'xlsx';
import {
  RangeConfig,
  ColumnDefinition,
  CsvParseResult,
  ExcelParseResult,
  ExcelSheetInfo,
} from './data-imports.types';
import { WriterColumn } from '../spreadsheet-agent/agent/utils/duckdb-writer';

// ─── Helpers ───────────────────────────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;
const COMMON_DATE_RE = /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/;
const INTEGER_RE = /^-?\d+$/;
const FLOAT_RE = /^-?\d+\.\d+$/;
const BOOL_VALUES = new Set(['true', 'false', '1', '0', 'yes', 'no']);

/**
 * Convert a numeric range config to an XLSX A1-style range string.
 * e.g. { startRow: 0, endRow: 9, startCol: 0, endCol: 4 } → 'A1:E10'
 */
function toA1Range(range: RangeConfig, maxRow?: number, maxCol?: number): string {
  const r1 = range.startRow;
  const c1 = range.startCol;
  const r2 = range.endRow ?? maxRow ?? 1048575;
  const c2 = range.endCol ?? maxCol ?? 16383;

  // XLSX uses 0-based row/col in the range object for utils.decode_range
  const xlsxRange: XLSX.Range = {
    s: { r: r1, c: c1 },
    e: { r: r2, c: c2 },
  };
  return XLSX.utils.encode_range(xlsxRange);
}

/**
 * Try to detect the encoding heuristically.
 * Only UTF-8 (with or without BOM) and Latin-1 are checked; others default to UTF-8.
 */
function detectEncoding(buffer: Buffer): string {
  // Check for UTF-8 BOM
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return 'UTF-8-BOM';
  }
  // Check for UTF-16 BOM
  if ((buffer[0] === 0xff && buffer[1] === 0xfe) || (buffer[0] === 0xfe && buffer[1] === 0xff)) {
    return 'UTF-16';
  }
  return 'UTF-8';
}

@Injectable()
export class DataImportsParser {
  private readonly logger = new Logger(DataImportsParser.name);

  // ─── CSV ────────────────────────────────────────────────────────────────

  /**
   * Auto-detect delimiter (comma, semicolon, tab, pipe) by trying each
   * and picking the one that gives the most consistent column count across rows.
   * Returns a full parse result with column names and sample rows.
   */
  parseCsv(
    buffer: Buffer,
    config?: { delimiter?: string; hasHeader?: boolean; encoding?: string; skipRows?: number },
  ): CsvParseResult {
    const detectedEncoding = detectEncoding(buffer);
    const text = buffer.toString('utf8').replace(/^\ufeff/, ''); // strip BOM

    // Auto-detect or use provided delimiter
    const detectedDelimiter = config?.delimiter ?? this.detectDelimiter(text);
    const hasHeader = config?.hasHeader ?? true;
    const skipRows = config?.skipRows ?? 0;

    // Parse using XLSX (handles quoting, escaping correctly)
    const wb = XLSX.read(text, { type: 'string', FS: detectedDelimiter });
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];

    // sheet_to_json with header:1 gives raw 2D array
    const allRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

    // Apply skipRows
    const dataRows = allRows.slice(skipRows);

    // Extract header
    let headerRow: string[] = [];
    let sampleStart = 0;

    if (hasHeader && dataRows.length > 0) {
      headerRow = (dataRows[0] as unknown[]).map((cell, idx) =>
        cell != null ? String(cell).trim() : `col_${idx}`,
      );
      sampleStart = 1;
    } else {
      // Auto-generate column names
      const colCount = dataRows.length > 0 ? (dataRows[0] as unknown[]).length : 0;
      headerRow = Array.from({ length: colCount }, (_, i) => `col_${i}`);
    }

    const sampleRows = dataRows.slice(sampleStart, sampleStart + 100) as unknown[][];
    const rowCountEstimate = Math.max(0, dataRows.length - sampleStart);

    // Detect types for each column
    const detectedTypes = this.detectColumnTypes(headerRow, sampleRows);

    const columns = headerRow.map((name, idx) => ({
      name,
      detectedType: detectedTypes[idx]?.type ?? 'VARCHAR',
    }));

    return {
      type: 'csv',
      detectedDelimiter,
      detectedEncoding: config?.encoding ?? detectedEncoding,
      hasHeader,
      columns,
      sampleRows,
      rowCountEstimate,
    };
  }

  /**
   * Try each candidate delimiter and choose the one yielding the most
   * consistent (lowest std-dev) column count across lines.
   */
  private detectDelimiter(text: string): string {
    const candidates = [',', ';', '\t', '|'];
    const lines = text.split('\n').slice(0, 20).filter((l) => l.trim().length > 0);

    if (lines.length === 0) return ',';

    let bestDelimiter = ',';
    let bestScore = Infinity;

    for (const delim of candidates) {
      const counts = lines.map((line) => line.split(delim).length);
      const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
      const variance = counts.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / counts.length;
      // Prefer higher column counts with lower variance
      const score = variance / Math.max(1, mean);

      if (score < bestScore && mean > 1) {
        bestScore = score;
        bestDelimiter = delim;
      }
    }

    return bestDelimiter;
  }

  // ─── Excel ──────────────────────────────────────────────────────────────

  /**
   * Parse an Excel workbook and return sheet metadata without loading all data.
   */
  parseExcelSheets(buffer: Buffer): ExcelParseResult {
    const wb = XLSX.read(buffer, { type: 'buffer', sheetStubs: true });

    const sheets: ExcelSheetInfo[] = wb.SheetNames.map((name) => {
      const sheet = wb.Sheets[name];
      const ref = sheet['!ref'];
      let rowCount = 0;
      let colCount = 0;

      if (ref) {
        const range = XLSX.utils.decode_range(ref);
        rowCount = range.e.r - range.s.r + 1;
        colCount = range.e.c - range.s.c + 1;
      }

      const hasMergedCells = Array.isArray(sheet['!merges']) && sheet['!merges'].length > 0;

      return { name, rowCount, colCount, hasMergedCells };
    });

    return { type: 'excel', sheets };
  }

  /**
   * Parse a specific sheet and optional range from an Excel buffer.
   * Returns column names, sample rows and detected types.
   */
  parseExcelRange(
    buffer: Buffer,
    sheetName: string,
    range?: RangeConfig,
    hasHeader = true,
    limit = 50,
  ): {
    columns: Array<{ name: string; detectedType: string }>;
    rows: unknown[][];
    totalRows: number;
    detectedTypes: Array<{ name: string; type: string }>;
  } {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[sheetName];

    if (!sheet) {
      throw new Error(`Sheet '${sheetName}' not found in workbook`);
    }

    // Determine sheet dimensions
    const sheetRef = sheet['!ref'];
    let maxRow: number | undefined;
    let maxCol: number | undefined;
    if (sheetRef) {
      const sheetRange = XLSX.utils.decode_range(sheetRef);
      maxRow = sheetRange.e.r;
      maxCol = sheetRange.e.c;
    }

    const rangeStr = range ? toA1Range(range, maxRow, maxCol) : undefined;

    const allRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
      range: rangeStr,
    });

    let headerRow: string[] = [];
    let dataRows: unknown[][];

    if (hasHeader && allRows.length > 0) {
      headerRow = (allRows[0] as unknown[]).map((cell, idx) =>
        cell != null ? String(cell).trim() : `col_${idx}`,
      );
      dataRows = allRows.slice(1);
    } else {
      const colCount = allRows.length > 0 ? (allRows[0] as unknown[]).length : 0;
      headerRow = Array.from({ length: colCount }, (_, i) => `col_${i}`);
      dataRows = allRows;
    }

    const totalRows = dataRows.length;
    const sampleRows = dataRows.slice(0, limit);
    const detectedTypes = this.detectColumnTypes(headerRow, sampleRows);

    const columns = headerRow.map((name, idx) => ({
      name,
      detectedType: detectedTypes[idx]?.type ?? 'VARCHAR',
    }));

    return { columns, rows: sampleRows, totalRows, detectedTypes };
  }

  // ─── Type detection ──────────────────────────────────────────────────────

  /**
   * Heuristic column type detection based on sampling row values.
   */
  detectColumnTypes(
    columnNames: string[],
    rows: unknown[][],
  ): Array<{ name: string; type: string }> {
    return columnNames.map((name, colIdx) => {
      const values = rows
        .map((row) => (Array.isArray(row) ? row[colIdx] : undefined))
        .filter((v) => v != null && String(v).trim() !== '');

      if (values.length === 0) {
        return { name, type: 'VARCHAR' };
      }

      const type = this.inferType(values);
      return { name, type };
    });
  }

  private inferType(values: unknown[]): string {
    const strs = values.map((v) => String(v).trim().toLowerCase());

    // Check boolean first (small set)
    if (strs.every((s) => BOOL_VALUES.has(s))) {
      return 'BOOLEAN';
    }

    // Check integer
    if (strs.every((s) => INTEGER_RE.test(s))) {
      return 'BIGINT';
    }

    // Check float
    if (strs.every((s) => INTEGER_RE.test(s) || FLOAT_RE.test(s))) {
      return 'DOUBLE';
    }

    // Check ISO date / datetime
    const strsFull = values.map((v) => String(v).trim());
    if (strsFull.every((s) => ISO_DATETIME_RE.test(s))) {
      return 'TIMESTAMP';
    }
    if (strsFull.every((s) => ISO_DATE_RE.test(s) || COMMON_DATE_RE.test(s))) {
      return 'DATE';
    }

    return 'VARCHAR';
  }

  // ─── Parquet preparation ─────────────────────────────────────────────────

  /**
   * Convert parsed data to the format expected by writeParquet().
   * Applies column renames and type overrides from config.
   */
  prepareForParquet(
    headerRow: string[],
    rows: unknown[][],
    columnOverrides?: ColumnDefinition[],
  ): { columns: WriterColumn[]; rows: Record<string, unknown>[] } {
    // Build a lookup from sourceName → override config
    const overrideMap = new Map<string, ColumnDefinition>();
    if (columnOverrides) {
      for (const col of columnOverrides) {
        overrideMap.set(col.sourceName, col);
      }
    }

    // Determine active columns
    const activeColumns: Array<{ sourceIdx: number; outputName: string; outputType: string }> = [];

    for (let idx = 0; idx < headerRow.length; idx++) {
      const sourceName = headerRow[idx];
      const override = overrideMap.get(sourceName);

      if (override && !override.include) {
        continue; // Column excluded by user
      }

      activeColumns.push({
        sourceIdx: idx,
        outputName: override?.outputName ?? sourceName,
        outputType: override?.outputType ?? 'VARCHAR',
      });
    }

    const writerColumns: WriterColumn[] = activeColumns.map((c) => ({
      outputName: c.outputName,
      outputType: c.outputType,
    }));

    const outputRows: Record<string, unknown>[] = rows.map((row) => {
      const obj: Record<string, unknown> = {};
      for (const col of activeColumns) {
        obj[col.outputName] = Array.isArray(row) ? (row[col.sourceIdx] ?? null) : null;
      }
      return obj;
    });

    return { columns: writerColumns, rows: outputRows };
  }
}
