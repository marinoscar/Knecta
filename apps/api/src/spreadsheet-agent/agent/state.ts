import { Annotation } from '@langchain/langgraph';

/**
 * Represents a single sheet discovered within an Excel file
 */
export interface SheetInfo {
  fileName: string;
  sheetName: string;
  headers: string[];
  sampleRows: any[][];       // First 5 rows of data
  rowCount: number;
  rawData: any[][];           // All row data (arrays of cell values)
}

/**
 * Column definition inferred by the LLM
 */
export interface ColumnDefinition {
  originalName: string;       // Original header from spreadsheet
  name: string;               // Clean, SQL-friendly column name
  dataType: string;           // Parquet/SQL data type: string, int64, float64, boolean, date, timestamp
  nullable: boolean;
  description: string;        // LLM-generated description
}

/**
 * Table schema inferred by the LLM from a sheet
 */
export interface InferredTable {
  sourceFile: string;
  sourceSheet: string;
  tableName: string;          // Clean, SQL-friendly table name
  columns: ColumnDefinition[];
  rowCount: number;
  rawData: any[][];           // Data rows (header excluded)
}

/**
 * Result of converting a table to Parquet and uploading to S3
 */
export interface UploadedTable {
  sourceFile: string;
  sourceSheet: string;
  tableName: string;
  columns: ColumnDefinition[];
  rowCount: number;
  sizeBytes: number;
  storageKey: string;         // S3 key of the parquet file
  status: 'ready' | 'failed';
  errorMessage?: string;
}

export const SpreadsheetAgentState = Annotation.Root({
  // Input context
  runId: Annotation<string>,
  userId: Annotation<string>,
  storageObjectIds: Annotation<string[]>,
  instructions: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // Phase 1: Parse sheets output
  sheets: Annotation<SheetInfo[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  parseErrors: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // Phase 2: Infer schema output
  tables: Annotation<InferredTable[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // Phase 3+4: Convert & upload output
  uploadedTables: Annotation<UploadedTable[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // S3 output prefix
  s3OutputPrefix: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  // Token tracking
  tokensUsed: Annotation<{ prompt: number; completion: number; total: number }>({
    reducer: (_, next) => next,
    default: () => ({ prompt: 0, completion: 0, total: 0 }),
  }),

  // Error
  error: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
});

export type SpreadsheetAgentStateType = typeof SpreadsheetAgentState.State;
