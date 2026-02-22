import {
  DiscoveryDriver,
  ConnectionParams,
  ConnectionTestResult,
  DatabaseInfo,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  ForeignKeyInfo,
  SampleDataResult,
  ColumnStatsResult,
  ColumnValueOverlapResult,
  QueryResult,
} from './driver.interface';
import { DuckDBSession, DuckDBSessionOptions, validateReadOnly, mapDuckDBType } from './duckdb.util';

// ==========================================
// Table manifest entry (stored in params.options.tableManifest)
// ==========================================

export interface TableManifestEntry {
  /** Full Parquet URI (single-file or glob pattern for partitioned). */
  uri: string;
  /** Whether the URI is a glob pattern over a partitioned folder. */
  partitioned: boolean;
}

// ==========================================
// Abstract base class
// ==========================================

/**
 * Shared implementation for S3 and Azure Blob Storage drivers.
 *
 * All schema introspection and SQL execution is delegated to an ephemeral
 * DuckDB in-process session.  Subclasses implement the storage-specific listing
 * operations (testConnection, listDatabases, listSchemas, listTables) and the
 * URI / session-options builders used by the shared DuckDB methods.
 */
export abstract class DataLakeBaseDriver implements DiscoveryDriver {
  // ----------------------------------------
  // Abstract — storage-specific listing
  // ----------------------------------------

  abstract testConnection(params: ConnectionParams): Promise<ConnectionTestResult>;

  abstract listDatabases(params: ConnectionParams): Promise<DatabaseInfo[]>;

  abstract listSchemas(params: ConnectionParams, database: string): Promise<SchemaInfo[]>;

  abstract listTables(
    params: ConnectionParams,
    database: string,
    schema: string,
  ): Promise<TableInfo[]>;

  // ----------------------------------------
  // Abstract — URI / session builders
  // ----------------------------------------

  /**
   * Returns the storage type handled by this driver.  Used when building
   * DuckDBSessionOptions.
   */
  abstract getStorageType(): 's3' | 'azure_blob';

  /**
   * Returns the URI for a single-file Parquet table.
   * e.g. s3://bucket/schema/table.parquet
   */
  protected abstract buildParquetUri(
    params: ConnectionParams,
    database: string,
    schema: string,
    table: string,
  ): string;

  /**
   * Returns the glob URI for a partitioned Parquet folder.
   * e.g. s3://bucket/schema/table/**\/*.parquet
   */
  protected abstract buildPartitionedUri(
    params: ConnectionParams,
    database: string,
    schema: string,
    table: string,
  ): string;

  /**
   * Builds the DuckDBSessionOptions for the given connection parameters.
   * Implemented by each subclass because credential shapes differ between
   * S3 and Azure Blob.
   */
  protected abstract buildSessionOptions(params: ConnectionParams): DuckDBSessionOptions;

  /**
   * Determines whether the given table reference is a partitioned dataset
   * (folder of Parquet files) rather than a single Parquet file.
   *
   * Subclasses implement this using cloud-SDK listing calls.
   */
  protected abstract isPartitionedDataset(
    params: ConnectionParams,
    database: string,
    schema: string,
    table: string,
  ): Promise<boolean>;

  // ----------------------------------------
  // Concrete: listForeignKeys — always empty
  // ----------------------------------------

  /**
   * Parquet files have no relational constraints.  Always returns an empty
   * array so the Semantic Model agent falls back to heuristic and
   * value-overlap relationship discovery.
   */
  async listForeignKeys(
    _params: ConnectionParams,
    _database: string,
    _schema: string,
  ): Promise<ForeignKeyInfo[]> {
    return [];
  }

  // ----------------------------------------
  // Concrete: listColumns via DuckDB DESCRIBE
  // ----------------------------------------

  async listColumns(
    params: ConnectionParams,
    database: string,
    schema: string,
    table: string,
  ): Promise<ColumnInfo[]> {
    const isPartitioned = await this.isPartitionedDataset(params, database, schema, table);
    const uri = isPartitioned
      ? this.buildPartitionedUri(params, database, schema, table)
      : this.buildParquetUri(params, database, schema, table);

    const session = await DuckDBSession.create(this.buildSessionOptions(params));
    try {
      // Register under a predictable internal view name to avoid collisions
      const viewName = '__list_columns_target';
      if (isPartitioned) {
        await session.registerPartitionedView(viewName, uri);
      } else {
        await session.registerView(viewName, uri);
      }

      // DESCRIBE returns: column_name, column_type, null, key, default, extra
      const { columns, rows } = await session.query(`DESCRIBE "${viewName}"`);

      return rows.map((row) => this.mapDescribeRow(row, columns));
    } finally {
      await session.close();
    }
  }

  // ----------------------------------------
  // Concrete: getSampleData
  // ----------------------------------------

  async getSampleData(
    params: ConnectionParams,
    database: string,
    schema: string,
    table: string,
    limit = 5,
  ): Promise<SampleDataResult> {
    const isPartitioned = await this.isPartitionedDataset(params, database, schema, table);
    const uri = isPartitioned
      ? this.buildPartitionedUri(params, database, schema, table)
      : this.buildParquetUri(params, database, schema, table);

    const session = await DuckDBSession.create(this.buildSessionOptions(params));
    try {
      if (isPartitioned) {
        await session.registerPartitionedView(table, uri);
      } else {
        await session.registerView(table, uri);
      }

      const { columns, rows } = await session.query(
        `SELECT * FROM "${table}" LIMIT ${limit}`,
      );

      return { columns, rows };
    } finally {
      await session.close();
    }
  }

  // ----------------------------------------
  // Concrete: getColumnStats
  // ----------------------------------------

  async getColumnStats(
    params: ConnectionParams,
    database: string,
    schema: string,
    table: string,
    column: string,
  ): Promise<ColumnStatsResult> {
    const isPartitioned = await this.isPartitionedDataset(params, database, schema, table);
    const uri = isPartitioned
      ? this.buildPartitionedUri(params, database, schema, table)
      : this.buildParquetUri(params, database, schema, table);

    const session = await DuckDBSession.create(this.buildSessionOptions(params));
    try {
      if (isPartitioned) {
        await session.registerPartitionedView(table, uri);
      } else {
        await session.registerView(table, uri);
      }

      const aggregateSql = `
        SELECT
          COUNT(DISTINCT "${column}")            AS distinct_count,
          COUNT(*) FILTER (WHERE "${column}" IS NULL) AS null_count,
          COUNT(*)                               AS total_count,
          MIN("${column}")                       AS min_val,
          MAX("${column}")                       AS max_val
        FROM "${table}"
      `;

      const { rows: statsRows } = await session.query(aggregateSql);
      const statsRow = statsRows[0] ?? [];

      const sampleSql = `
        SELECT DISTINCT "${column}" AS val
        FROM "${table}"
        WHERE "${column}" IS NOT NULL
        LIMIT 10
      `;
      const { rows: sampleRows } = await session.query(sampleSql);

      return {
        distinctCount: Number(statsRow[0] ?? 0),
        nullCount: Number(statsRow[1] ?? 0),
        totalCount: Number(statsRow[2] ?? 0),
        min: statsRow[3],
        max: statsRow[4],
        sampleValues: sampleRows.map((r) => r[0]),
      };
    } finally {
      await session.close();
    }
  }

  // ----------------------------------------
  // Concrete: getColumnValueOverlap
  // ----------------------------------------

  async getColumnValueOverlap(
    params: ConnectionParams,
    database: string,
    childSchema: string,
    childTable: string,
    childColumn: string,
    parentSchema: string,
    parentTable: string,
    parentColumn: string,
    sampleSize = 1000,
  ): Promise<ColumnValueOverlapResult> {
    const [childIsPartitioned, parentIsPartitioned] = await Promise.all([
      this.isPartitionedDataset(params, database, childSchema, childTable),
      this.isPartitionedDataset(params, database, parentSchema, parentTable),
    ]);

    const childUri = childIsPartitioned
      ? this.buildPartitionedUri(params, database, childSchema, childTable)
      : this.buildParquetUri(params, database, childSchema, childTable);

    const parentUri = parentIsPartitioned
      ? this.buildPartitionedUri(params, database, parentSchema, parentTable)
      : this.buildParquetUri(params, database, parentSchema, parentTable);

    const session = await DuckDBSession.create(this.buildSessionOptions(params));
    try {
      // Register both tables — use distinct view names to avoid aliasing issues
      const childView = '__overlap_child';
      const parentView = '__overlap_parent';

      if (childIsPartitioned) {
        await session.registerPartitionedView(childView, childUri);
      } else {
        await session.registerView(childView, childUri);
      }

      if (parentIsPartitioned) {
        await session.registerPartitionedView(parentView, parentUri);
      } else {
        await session.registerView(parentView, parentUri);
      }

      const sql = `
        WITH child_sample AS (
          SELECT "${childColumn}" AS val
          FROM "${childView}"
          LIMIT ${sampleSize}
        ),
        child_stats AS (
          SELECT
            COUNT(DISTINCT val)                        AS distinct_count,
            COUNT(*) FILTER (WHERE val IS NULL)        AS null_count,
            COUNT(*)                                   AS total_count
          FROM child_sample
        ),
        child_vals AS (
          SELECT DISTINCT CAST(val AS VARCHAR) AS val
          FROM child_sample
          WHERE val IS NOT NULL
        ),
        parent_vals AS (
          SELECT DISTINCT CAST("${parentColumn}" AS VARCHAR) AS val
          FROM "${parentView}"
          WHERE "${parentColumn}" IS NOT NULL
          LIMIT ${sampleSize}
        )
        SELECT
          cs.distinct_count     AS child_distinct_count,
          cs.null_count         AS child_null_count,
          cs.total_count        AS child_sample_size,
          (SELECT COUNT(*) FROM parent_vals)                                           AS parent_distinct_count,
          (SELECT COUNT(*) FROM child_vals cv INNER JOIN parent_vals pv ON cv.val = pv.val) AS overlap_count
        FROM child_stats cs
      `;

      const { rows } = await session.query(sql);
      const row = rows[0] ?? [];

      const childDistinctCount = Number(row[0] ?? 0);
      const childNullCount = Number(row[1] ?? 0);
      const childSampleSize = Number(row[2] ?? 0);
      const parentDistinctCount = Number(row[3] ?? 0);
      const overlapCount = Number(row[4] ?? 0);

      const overlapRatio = overlapCount / Math.max(childDistinctCount, 1);
      const nullRatio = childNullCount / Math.max(childSampleSize, 1);

      return {
        childDistinctCount,
        childNullCount,
        childSampleSize,
        parentDistinctCount,
        overlapCount,
        overlapRatio,
        nullRatio,
      };
    } finally {
      await session.close();
    }
  }

  // ----------------------------------------
  // Concrete: executeReadOnlyQuery
  // ----------------------------------------

  async executeReadOnlyQuery(
    params: ConnectionParams,
    sql: string,
    maxRows = 100,
  ): Promise<QueryResult> {
    // 1. Validate no write operations
    validateReadOnly(sql);

    // 2. Determine the default database (bucket / container) from params
    const defaultDatabase = (params.options as Record<string, unknown> | undefined)?.['bucket'] as
      | string
      | undefined ??
      (params.options as Record<string, unknown> | undefined)?.['containerName'] as
        | string
        | undefined ??
      params.databaseName ??
      '';

    // 3. Create session
    const session = await DuckDBSession.create(this.buildSessionOptions(params));
    try {
      // 4. Register views for all referenced tables
      //    Prefer an explicit tableManifest from params.options; fall back to
      //    parsing table names from the SQL and building URIs by convention.
      const manifest = this.resolveTableManifest(params, sql, defaultDatabase);

      for (const [tableName, entry] of Object.entries(manifest)) {
        if (entry.partitioned) {
          await session.registerPartitionedView(tableName, entry.uri);
        } else {
          await session.registerView(tableName, entry.uri);
        }
      }

      // 5. Wrap in a LIMIT guard to prevent unbounded Parquet scans
      const wrappedSql = `SELECT * FROM (${sql}) __result LIMIT ${maxRows}`;
      const { columns, rows } = await session.query(wrappedSql);

      return { columns, rows, rowCount: rows.length };
    } finally {
      await session.close();
    }
  }

  // ----------------------------------------
  // Private helpers
  // ----------------------------------------

  /**
   * Maps a single row from DuckDB's DESCRIBE output to a ColumnInfo object.
   *
   * DESCRIBE columns (DuckDB): column_name, column_type, null, key, default, extra
   */
  private mapDescribeRow(row: unknown[], describeColumns: string[]): ColumnInfo {
    const get = (colName: string): unknown => {
      const idx = describeColumns.indexOf(colName);
      return idx >= 0 ? row[idx] : undefined;
    };

    const nativeType = String(get('column_type') ?? '');

    return {
      name: String(get('column_name') ?? ''),
      dataType: mapDuckDBType(nativeType),
      nativeType,
      // Parquet columns are always considered nullable from the schema
      // perspective — there is no NOT NULL enforcement in Parquet files.
      isNullable: true,
      // Parquet has no primary key concept.
      isPrimaryKey: false,
    };
  }

  /**
   * Resolves the map of table name → TableManifestEntry that must be
   * registered as DuckDB views before executing the SQL.
   *
   * Strategy:
   * 1. If `params.options.tableManifest` is provided, use it directly.
   * 2. Otherwise, extract table names from the SQL and derive URIs using the
   *    convention: `buildParquetUri` for single-file, `buildPartitionedUri`
   *    for partitioned datasets.
   *
   * Note: isPartitionedDataset requires a cloud SDK call which is async.  To
   * keep this helper synchronous we assume single-file layout by convention
   * when no manifest is supplied; callers that need partitioned support should
   * supply a manifest.
   */
  private resolveTableManifest(
    params: ConnectionParams,
    sql: string,
    defaultDatabase: string,
  ): Record<string, { uri: string; partitioned: boolean }> {
    const options = params.options as Record<string, unknown> | undefined;

    // Use explicit manifest if available
    if (options?.['tableManifest']) {
      return options['tableManifest'] as Record<string, { uri: string; partitioned: boolean }>;
    }

    // Fall back to parsing table names from SQL and building URIs by convention
    const tableNames = extractTableNamesFromSql(sql);
    const defaultSchema = (options?.['defaultSchema'] as string | undefined) ?? 'default';

    const manifest: Record<string, { uri: string; partitioned: boolean }> = {};
    for (const tableName of tableNames) {
      manifest[tableName] = {
        uri: this.buildParquetUri(params, defaultDatabase, defaultSchema, tableName),
        partitioned: false,
      };
    }

    return manifest;
  }
}

// ==========================================
// SQL table name extractor
// ==========================================

/**
 * Extracts simple table names referenced in a SQL query.
 *
 * Handles the most common patterns:
 *   FROM tableName
 *   JOIN tableName
 *   FROM schema.tableName  (takes the table part only)
 *   FROM "tableName"       (quoted identifiers)
 *
 * This is a best-effort parser for the happy-path Data Agent SQL output.
 * It does not handle CTEs as table sources or subquery aliases.
 */
export function extractTableNamesFromSql(sql: string): string[] {
  // Strip single-line comments
  const stripped = sql.replace(/--[^\n]*/g, ' ');

  // Match FROM and JOIN clauses: (FROM|JOIN) [schema.]table_name
  const tablePattern =
    /(?:FROM|JOIN)\s+(?:"([^"]+)"|`([^`]+)`|([a-zA-Z_][a-zA-Z0-9_.]*))(?:\s+(?:AS\s+)?[a-zA-Z_][a-zA-Z0-9_]*)?/gi;

  const names = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = tablePattern.exec(stripped)) !== null) {
    // Prefer the quoted form, then the bare identifier
    const raw = match[1] ?? match[2] ?? match[3] ?? '';
    if (!raw) continue;

    // If the identifier contains a dot, take only the last segment (table name)
    const segments = raw.split('.');
    const tableName = segments[segments.length - 1];

    // Skip SQL keywords that can follow FROM/JOIN
    const keywords = new Set([
      'select',
      'where',
      'group',
      'order',
      'having',
      'limit',
      'offset',
      'union',
      'intersect',
      'except',
      'lateral',
      'unnest',
    ]);

    if (tableName && !keywords.has(tableName.toLowerCase())) {
      names.add(tableName);
    }
  }

  return Array.from(names);
}
