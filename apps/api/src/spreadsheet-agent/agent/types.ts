// ─── Input Types ───

export interface ProjectFile {
  fileId: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  storagePath: string;
  fileHash: string;
}

export interface RunConfig {
  reviewMode: 'auto' | 'review';
  concurrency: number;
}

// ─── Phase 1 Output: Ingest ───

export interface FileInventory {
  fileId: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  fileHash: string;
  sheets: Array<{
    name: string;
    rowCount: number;
    colCount: number;
    hasMergedCells: boolean;
    hasFormulas: boolean;
    dataDensity: number;
    sampleGrid: string[][];
    lastRows: string[][];
    mergedCellRanges: string[];
  }>;
}

// ─── Phase 2 Output: Analyzer ───

export interface SheetAnalysis {
  fileId: string;
  fileName: string;
  sheetName: string;
  logicalTables: Array<{
    suggestedName: string;
    description: string;
    headerRow: number;
    dataStartRow: number;
    dataEndRow: number | null;
    columns: Array<{
      index: number;
      sourceName: string;
      cleanName: string;
      inferredType: 'integer' | 'decimal' | 'text' | 'date' | 'datetime' | 'boolean' | 'json';
      nullable: boolean;
      notes: string;
    }>;
    skipRows: number[];
    needsTranspose: boolean;
    estimatedRowCount: number;
    notes: string;
  }>;
  crossFileHints: string[];
}

// ─── Phase 3 Output: Designer ───

export interface ExtractionPlan {
  tables: Array<{
    tableName: string;
    description: string;
    sourceFileId: string;
    sourceFileName: string;
    sourceSheetName: string;
    headerRow: number;
    dataStartRow: number;
    dataEndRow: number | null;
    columns: Array<{
      sourceName: string;
      outputName: string;
      outputType: string;
      nullable: boolean;
      transformation: string | null;
      description: string;
    }>;
    skipRows: number[];
    needsTranspose: boolean;
    estimatedRows: number;
    outputPath: string;
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

// ─── Phase 4 Output: Review Gate ───

export interface PlanModification {
  tableName: string;
  action: 'include' | 'skip';
  overrides?: {
    tableName?: string;
    columns?: Array<{
      outputName: string;
      outputType: string;
    }>;
  };
}

// ─── Phase 5 Output: Extractor ───

export interface ExtractionResult {
  tableId: string;
  tableName: string;
  outputPath: string;
  rowCount: number;
  sizeBytes: number;
  columns: Array<{
    name: string;
    type: string;
    nullCount: number;
  }>;
  status: 'success' | 'failed';
  error?: string;
  durationMs: number;
}

// ─── Phase 6 Output: Validator ───

export interface ValidationReport {
  passed: boolean;
  tables: Array<{
    tableName: string;
    passed: boolean;
    checks: Array<{
      name: string;
      passed: boolean;
      message: string;
    }>;
  }>;
  diagnosis: string | null;
  recommendedTarget: 'extractor' | 'schema_designer' | null;
}

// ─── SSE Event Types ───

export type SpreadsheetAgentEventType =
  | 'run_start'
  | 'phase_start'
  | 'phase_complete'
  | 'file_start'
  | 'file_complete'
  | 'file_error'
  | 'sheet_analysis'
  | 'progress'
  | 'extraction_plan'
  | 'review_ready'
  | 'table_start'
  | 'table_complete'
  | 'table_error'
  | 'validation_result'
  | 'token_update'
  | 'text'
  | 'run_complete'
  | 'run_error';

export interface SpreadsheetAgentEvent {
  type: SpreadsheetAgentEventType;
  [key: string]: unknown;
}

// ─── Token Usage ───

export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}
