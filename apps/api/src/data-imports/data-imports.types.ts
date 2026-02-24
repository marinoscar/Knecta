/**
 * SSE event types emitted during import execution.
 */
export type DataImportEventType =
  | 'run_start'
  | 'phase_start'
  | 'phase_complete'
  | 'table_start'
  | 'table_complete'
  | 'table_error'
  | 'progress'
  | 'run_complete'
  | 'run_error';

export interface DataImportStreamEvent {
  type: DataImportEventType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
  message?: string;
  timestamp: string;
}

/**
 * Range configuration for selecting a sub-region of a spreadsheet sheet.
 */
export interface RangeConfig {
  startRow: number;
  endRow?: number;
  startCol: number;
  endCol?: number;
}

/**
 * Column definition as detected or configured by the user.
 */
export interface ColumnDefinition {
  sourceName: string;
  outputName: string;
  outputType: 'VARCHAR' | 'INTEGER' | 'BIGINT' | 'DOUBLE' | 'BOOLEAN' | 'DATE' | 'TIMESTAMP';
  include: boolean;
}

/**
 * Sheet-level configuration for Excel imports.
 */
export interface SheetConfig {
  sheetName: string;
  range?: RangeConfig;
  hasHeader: boolean;
  columns?: ColumnDefinition[];
}

/**
 * Import configuration stored in the DataImport.config JSONB field.
 */
export interface ImportConfig {
  // CSV options
  delimiter?: string;
  hasHeader?: boolean;
  encoding?: string;
  skipRows?: number;
  columns?: ColumnDefinition[];
  // Excel options (multiple sheets)
  sheets?: SheetConfig[];
}

/**
 * Per-sheet info returned during Excel structure discovery.
 */
export interface ExcelSheetInfo {
  name: string;
  rowCount: number;
  colCount: number;
  hasMergedCells: boolean;
}

/**
 * Result of parsing a CSV file.
 */
export interface CsvParseResult {
  type: 'csv';
  detectedDelimiter: string;
  detectedEncoding: string;
  hasHeader: boolean;
  columns: Array<{ name: string; detectedType: string }>;
  sampleRows: unknown[][];
  rowCountEstimate: number;
}

/**
 * Result of parsing an Excel file (structure only — no data rows).
 */
export interface ExcelParseResult {
  type: 'excel';
  sheets: ExcelSheetInfo[];
}

/**
 * Structured output table metadata persisted after a successful import.
 */
export interface OutputTable {
  tableName: string;
  sheetName?: string;
  s3Key: string;
  rowCount: number;
  sizeBytes: number;
  connectionId?: string;
  columns: Array<{ name: string; type: string }>;
}
