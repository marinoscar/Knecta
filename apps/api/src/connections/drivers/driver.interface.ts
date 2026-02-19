export interface ConnectionParams {
  host: string;
  port: number;
  databaseName?: string;
  username?: string;
  password?: string;
  useSsl: boolean;
  options?: Record<string, unknown>;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  latencyMs: number;
}

export interface DatabaseDriver {
  testConnection(params: ConnectionParams): Promise<ConnectionTestResult>;
}

// ==========================================
// Schema Discovery Types
// ==========================================

export interface DatabaseInfo {
  name: string;
  catalog?: string;
}

export interface SchemaInfo {
  name: string;
  database: string;
}

export interface TableInfo {
  name: string;
  schema: string;
  database: string;
  type: 'TABLE' | 'VIEW';
  rowCountEstimate?: number;
}

export interface ColumnInfo {
  name: string;
  dataType: string;
  nativeType: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
  defaultValue?: string;
  maxLength?: number;
  numericPrecision?: number;
  numericScale?: number;
  comment?: string;
}

export interface ForeignKeyInfo {
  constraintName: string;
  fromSchema: string;
  fromTable: string;
  fromColumns: string[];
  toSchema: string;
  toTable: string;
  toColumns: string[];
}

export interface SampleDataResult {
  columns: string[];
  rows: unknown[][];
}

export interface ColumnStatsResult {
  distinctCount: number;
  nullCount: number;
  totalCount: number;
  sampleValues: unknown[];
  min?: unknown;
  max?: unknown;
}

export interface ColumnValueOverlapResult {
  childDistinctCount: number;
  childNullCount: number;
  childSampleSize: number;
  parentDistinctCount: number;
  overlapCount: number;
  overlapRatio: number;     // overlapCount / max(childDistinctCount, 1) — (0-1)
  nullRatio: number;        // childNullCount / max(childSampleSize, 1) — (0-1)
}

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
}

export interface DiscoveryDriver extends DatabaseDriver {
  listDatabases(params: ConnectionParams): Promise<DatabaseInfo[]>;
  listSchemas(params: ConnectionParams, database: string): Promise<SchemaInfo[]>;
  listTables(params: ConnectionParams, database: string, schema: string): Promise<TableInfo[]>;
  listColumns(params: ConnectionParams, database: string, schema: string, table: string): Promise<ColumnInfo[]>;
  listForeignKeys(params: ConnectionParams, database: string, schema: string): Promise<ForeignKeyInfo[]>;
  getSampleData(params: ConnectionParams, database: string, schema: string, table: string, limit?: number): Promise<SampleDataResult>;
  getColumnStats(params: ConnectionParams, database: string, schema: string, table: string, column: string): Promise<ColumnStatsResult>;
  getColumnValueOverlap(
    params: ConnectionParams,
    database: string,
    childSchema: string,
    childTable: string,
    childColumn: string,
    parentSchema: string,
    parentTable: string,
    parentColumn: string,
    sampleSize?: number,
  ): Promise<ColumnValueOverlapResult>;
  executeReadOnlyQuery(params: ConnectionParams, sql: string, maxRows?: number): Promise<QueryResult>;
}
