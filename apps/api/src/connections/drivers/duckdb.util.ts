// duckdb is intentionally NOT imported at the top level.
// The native module may not be present in all environments (e.g. the Docker
// container when the feature is unused).  It is loaded lazily inside
// DuckDBSession.create() so that the rest of the API starts normally even
// when duckdb is not installed.

// ==========================================
// Credential interfaces
// ==========================================

export interface S3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  endpointUrl?: string;
}

export interface AzureBlobCredentials {
  accountName: string;
  accountKey?: string;
  sasToken?: string;
  accountUrl: string;
}

export interface DuckDBSessionOptions {
  storageType: 's3' | 'azure_blob';
  credentials: S3Credentials | AzureBlobCredentials;
}

// ==========================================
// Read-only SQL guard
// ==========================================

/**
 * Validates that the given SQL does not contain any write or DDL operations.
 * Throws if a disallowed keyword is detected.
 */
export function validateReadOnly(sql: string): void {
  const writeKeywordsRegex =
    /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|COPY|GRANT|REVOKE|MERGE|REPLACE|CALL|EXECUTE)\b/i;
  if (writeKeywordsRegex.test(sql)) {
    const match = sql.match(writeKeywordsRegex);
    throw new Error(
      `Write operations are not permitted in read-only queries: ${match?.[0]?.toUpperCase() ?? 'unknown'}`,
    );
  }
}

// ==========================================
// DuckDB type mapping
// ==========================================

/**
 * Maps a DuckDB native type string to a standardised ColumnInfo dataType value.
 *
 * DuckDB type strings are uppercase and may include parameters, e.g.
 * "DECIMAL(18,2)", "TIMESTAMP WITH TIME ZONE".
 */
export function mapDuckDBType(duckdbType: string): string {
  const upper = duckdbType.toUpperCase().trim();

  if (upper === 'BOOLEAN') return 'boolean';
  if (upper === 'TINYINT') return 'tinyint';
  if (upper === 'SMALLINT') return 'smallint';
  if (upper === 'INTEGER' || upper === 'INT') return 'integer';
  if (upper === 'BIGINT') return 'bigint';
  if (upper === 'HUGEINT') return 'hugeint';
  if (upper === 'FLOAT' || upper === 'REAL') return 'real';
  if (upper === 'DOUBLE' || upper === 'DOUBLE PRECISION') return 'double precision';
  if (upper === 'VARCHAR' || upper === 'TEXT' || upper === 'STRING') return 'text';
  if (upper === 'DATE') return 'date';
  if (upper === 'TIMESTAMP WITH TIME ZONE' || upper === 'TIMESTAMPTZ') return 'timestamptz';
  if (upper === 'TIMESTAMP') return 'timestamp';
  if (upper === 'BLOB' || upper === 'BYTES' || upper === 'BINARY') return 'bytea';
  if (upper === 'LIST' || upper === 'STRUCT' || upper === 'MAP') return 'json';

  // DECIMAL(p,s) / NUMERIC(p,s)
  if (upper.startsWith('DECIMAL') || upper.startsWith('NUMERIC')) return 'numeric';

  // Interval, UUID, etc. — pass through as lowercase
  return upper.toLowerCase();
}

// ==========================================
// DuckDB session
// ==========================================

/**
 * Lazily loads the duckdb native module.
 * Throws a descriptive error if the module is not installed.
 */
function loadDuckDB(): typeof import('duckdb') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('duckdb') as typeof import('duckdb');
  } catch (err) {
    throw new Error(
      'The duckdb native module is not available in this environment. ' +
        'Install the optional "duckdb" package to use DuckDB storage connections.',
      { cause: err },
    );
  }
}

/**
 * Manages a single ephemeral DuckDB in-memory session.
 *
 * Design: one session per query operation.  DuckDB starts in milliseconds so
 * there is no benefit to pooling.  Each session is created via the static
 * factory, used, then closed in a `finally` block.
 */
export class DuckDBSession {
  // Typed as `any` because duckdb is not imported at the top level.
  // These are private implementation details; callers never see these types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly conn: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private constructor(db: any, conn: any) {
    this.db = db;
    this.conn = conn;
  }

  // ----------------------------------------
  // Factory
  // ----------------------------------------

  /**
   * Creates an in-memory DuckDB instance, installs the appropriate cloud
   * extension, and configures credentials.
   */
  static async create(options: DuckDBSessionOptions): Promise<DuckDBSession> {
    const duckdb = loadDuckDB();
    const db = new duckdb.Database(':memory:');
    const conn = db.connect();
    const session = new DuckDBSession(db, conn);
    await session.configureCredentials(options);
    return session;
  }

  // ----------------------------------------
  // Credential configuration
  // ----------------------------------------

  private async configureCredentials(options: DuckDBSessionOptions): Promise<void> {
    if (options.storageType === 's3') {
      const creds = options.credentials as S3Credentials;

      await this.exec('INSTALL httpfs;');
      await this.exec('LOAD httpfs;');
      await this.exec(`SET s3_region='${creds.region}';`);
      await this.exec(`SET s3_access_key_id='${creds.accessKeyId}';`);
      await this.exec(`SET s3_secret_access_key='${creds.secretAccessKey}';`);

      if (creds.endpointUrl) {
        // Strip protocol — DuckDB expects only the hostname (+ optional port)
        const host = new URL(creds.endpointUrl).host;
        await this.exec(`SET s3_endpoint='${host}';`);
        await this.exec(`SET s3_url_style='path';`);
        await this.exec(`SET s3_use_ssl=true;`);
      }
    } else {
      // azure_blob
      const creds = options.credentials as AzureBlobCredentials;

      await this.exec('INSTALL azure;');
      await this.exec('LOAD azure;');

      if (creds.sasToken) {
        // SAS token authentication
        await this.exec(
          `CREATE SECRET azure_secret (` +
            `TYPE AZURE, ` +
            `PROVIDER SERVICE_PRINCIPAL, ` +
            `ACCOUNT_NAME '${creds.accountName}', ` +
            `SAS_TOKEN '${creds.sasToken}'` +
            `);`,
        );
      } else {
        // Account Key authentication via connection string
        const connStr =
          `DefaultEndpointsProtocol=https;` +
          `AccountName=${creds.accountName};` +
          `AccountKey=${creds.accountKey ?? ''};` +
          `EndpointSuffix=core.windows.net`;
        await this.exec(`CREATE SECRET azure_secret (TYPE AZURE, CONNECTION_STRING '${connStr}');`);
      }
    }
  }

  // ----------------------------------------
  // View registration
  // ----------------------------------------

  /**
   * Registers a single Parquet file as a named temporary view.
   *
   * @param viewName  - Name of the view (used in subsequent SQL queries)
   * @param parquetUri - Full URI of the Parquet file (e.g. s3://bucket/path/file.parquet)
   */
  async registerView(viewName: string, parquetUri: string): Promise<void> {
    const readExpr = `read_parquet('${parquetUri}')`;
    await this.exec(`CREATE OR REPLACE TEMP VIEW "${viewName}" AS SELECT * FROM ${readExpr};`);
  }

  /**
   * Registers a partitioned Parquet folder (glob pattern) as a named temporary
   * view with Hive-partitioning support.
   *
   * @param viewName - Name of the view (used in subsequent SQL queries)
   * @param globUri  - Glob URI pointing to all Parquet files under the folder
   *                   (e.g. s3://bucket/path/folder/**\/*.parquet)
   */
  async registerPartitionedView(viewName: string, globUri: string): Promise<void> {
    const readExpr = `read_parquet('${globUri}', hive_partitioning=true)`;
    await this.exec(`CREATE OR REPLACE TEMP VIEW "${viewName}" AS SELECT * FROM ${readExpr};`);
  }

  // ----------------------------------------
  // Query execution
  // ----------------------------------------

  /**
   * Executes a SQL statement that returns rows and returns columns + rows.
   */
  async query(sql: string): Promise<{ columns: string[]; rows: unknown[][] }> {
    const rawRows = await this.runAll(sql);

    if (rawRows.length === 0) {
      return { columns: [], rows: [] };
    }

    const columns = Object.keys(rawRows[0] as Record<string, unknown>);
    const rows = rawRows.map((row) =>
      columns.map((col) => (row as Record<string, unknown>)[col]),
    );

    return { columns, rows };
  }

  // ----------------------------------------
  // Internal helpers
  // ----------------------------------------

  /**
   * Executes a SQL statement that does not return rows (DDL, SET, etc.).
   */
  async exec(sql: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.conn.exec(sql, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Wraps duckdb.Connection.all() in a Promise.
   */
  // duckdb.TableData is Record<string, unknown>[] — use that shape directly
  // so we avoid a top-level import of the native module.
  private runAll(sql: string): Promise<Record<string, unknown>[]> {
    return new Promise<Record<string, unknown>[]>((resolve, reject) => {
      this.conn.all(sql, (err: Error | null, result: Record<string, unknown>[]) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }

  // ----------------------------------------
  // Lifecycle
  // ----------------------------------------

  /**
   * Closes the DuckDB instance.  Safe to call multiple times.
   */
  async close(): Promise<void> {
    try {
      this.db.close();
    } catch {
      // Ignore cleanup errors — the process is exiting this session anyway
    }
  }
}
