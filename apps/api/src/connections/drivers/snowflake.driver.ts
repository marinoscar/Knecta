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

type SnowflakeConnection = {
  connect(callback: (err: Error | null, conn: SnowflakeConnection) => void): void;
  execute(options: { sqlText: string; binds?: unknown[]; complete: (err: Error | null, stmt: SnowflakeStatement, rows: Record<string, unknown>[] | undefined) => void }): void;
  destroy(callback: (err: Error | null) => void): void;
};

type SnowflakeStatement = {
  getColumns(): Array<{ getName(): string }>;
};

export class SnowflakeDriver implements DiscoveryDriver {
  // ==========================================
  // Private helpers
  // ==========================================

  private async getSnowflake() {
    return import('snowflake-sdk');
  }

  private buildConnectionConfig(params: ConnectionParams, database?: string) {
    const account = params.options?.account as string;
    if (!account) {
      throw new Error('Account identifier is required for Snowflake connections');
    }
    return {
      account,
      username: params.username || '',
      password: params.password || '',
      database: database || params.databaseName || undefined,
      warehouse: (params.options?.warehouse as string) || undefined,
      role: (params.options?.role as string) || undefined,
      schema: (params.options?.schema as string) || undefined,
    };
  }

  private async createConnection(params: ConnectionParams, database?: string): Promise<SnowflakeConnection> {
    const snowflake = await this.getSnowflake();
    const config = this.buildConnectionConfig(params, database);
    const connection = snowflake.createConnection(config) as unknown as SnowflakeConnection;

    return new Promise<SnowflakeConnection>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.destroyConnection(connection);
        reject(new Error('Connection timed out'));
      }, 15000);

      connection.connect((err, conn) => {
        clearTimeout(timer);
        if (err) {
          reject(err);
        } else {
          resolve(conn);
        }
      });
    });
  }

  private async exec(
    connection: SnowflakeConnection,
    sqlText: string,
    binds?: unknown[],
  ): Promise<{ columns: string[]; rows: Record<string, unknown>[] }> {
    return new Promise((resolve, reject) => {
      connection.execute({
        sqlText,
        binds,
        complete: (err, stmt, rows) => {
          if (err) {
            reject(err);
            return;
          }
          const columns = stmt.getColumns().map((col) => col.getName());
          resolve({ columns, rows: rows || [] });
        },
      });
    });
  }

  private destroyConnection(connection: SnowflakeConnection): void {
    try {
      connection.destroy(() => {});
    } catch {
      // Ignore cleanup errors
    }
  }

  private sanitizeIdentifier(identifier: string): string {
    // Keep only alphanumeric, underscore, and dot — strip everything else
    return identifier.replace(/[^a-zA-Z0-9_.]/g, '');
  }

  // ==========================================
  // testConnection (existing — unchanged)
  // ==========================================

  async testConnection(params: ConnectionParams): Promise<ConnectionTestResult> {
    const start = Date.now();

    try {
      const snowflake = await this.getSnowflake();

      const account = params.options?.account as string;
      if (!account) {
        return {
          success: false,
          message: 'Account identifier is required for Snowflake connections',
          latencyMs: Date.now() - start,
        };
      }

      return await new Promise<ConnectionTestResult>((resolve) => {
        const connection = snowflake.createConnection({
          account,
          username: params.username || '',
          password: params.password || '',
          database: params.databaseName || undefined,
          warehouse: (params.options?.warehouse as string) || undefined,
          role: (params.options?.role as string) || undefined,
          schema: (params.options?.schema as string) || undefined,
          timeout: 10000,
        });

        connection.connect((err) => {
          if (err) {
            const latencyMs = Date.now() - start;
            resolve({ success: false, message: err.message, latencyMs });
            return;
          }

          connection.execute({
            sqlText: 'SELECT 1',
            complete: (execErr) => {
              const latencyMs = Date.now() - start;
              connection.destroy((_destroyErr) => {
                // Ignore destroy errors
              });

              if (execErr) {
                resolve({ success: false, message: execErr.message, latencyMs });
              } else {
                resolve({ success: true, message: 'Connection successful', latencyMs });
              }
            },
          });
        });

        // Timeout safety
        setTimeout(() => {
          const latencyMs = Date.now() - start;
          try {
            connection.destroy(() => {});
          } catch {
            // Ignore
          }
          resolve({ success: false, message: 'Connection timed out', latencyMs });
        }, 15000);
      });
    } catch (error) {
      const latencyMs = Date.now() - start;
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message, latencyMs };
    }
  }

  // ==========================================
  // Discovery methods
  // ==========================================

  async listDatabases(params: ConnectionParams): Promise<DatabaseInfo[]> {
    const connection = await this.createConnection(params);
    try {
      const { rows } = await this.exec(connection, 'SHOW DATABASES');
      // SHOW DATABASES returns rows with lowercase 'name' property
      return rows
        .filter((row) => row['name'] !== 'SNOWFLAKE')
        .map((row) => ({ name: row['name'] as string }));
    } finally {
      this.destroyConnection(connection);
    }
  }

  async listSchemas(params: ConnectionParams, database: string): Promise<SchemaInfo[]> {
    const sanitizedDb = this.sanitizeIdentifier(database);
    const connection = await this.createConnection(params, database);
    try {
      const { rows } = await this.exec(connection, `SHOW SCHEMAS IN DATABASE "${sanitizedDb}"`);
      // SHOW SCHEMAS returns rows with lowercase 'name' property
      return rows
        .filter((row) => row['name'] !== 'INFORMATION_SCHEMA')
        .map((row) => ({ name: row['name'] as string, database }));
    } finally {
      this.destroyConnection(connection);
    }
  }

  async listTables(params: ConnectionParams, database: string, schema: string): Promise<TableInfo[]> {
    const connection = await this.createConnection(params, database);
    try {
      const { rows } = await this.exec(
        connection,
        `SELECT TABLE_NAME, TABLE_SCHEMA, TABLE_TYPE, ROW_COUNT
         FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = ?
           AND TABLE_TYPE IN ('BASE TABLE', 'VIEW')
         ORDER BY TABLE_NAME`,
        [schema],
      );

      return rows.map((row) => ({
        name: row['TABLE_NAME'] as string,
        schema: row['TABLE_SCHEMA'] as string,
        database,
        type: row['TABLE_TYPE'] === 'BASE TABLE' ? 'TABLE' : 'VIEW',
        rowCountEstimate:
          row['ROW_COUNT'] != null ? Number(row['ROW_COUNT']) : undefined,
      }));
    } finally {
      this.destroyConnection(connection);
    }
  }

  async listColumns(
    params: ConnectionParams,
    database: string,
    schema: string,
    table: string,
  ): Promise<ColumnInfo[]> {
    const sanitizedDb = this.sanitizeIdentifier(database);
    const sanitizedSchema = this.sanitizeIdentifier(schema);
    const sanitizedTable = this.sanitizeIdentifier(table);

    const connection = await this.createConnection(params, database);
    try {
      // Fetch column metadata from INFORMATION_SCHEMA
      const { rows: colRows } = await this.exec(
        connection,
        `SELECT c.COLUMN_NAME, c.DATA_TYPE, c.DATA_TYPE AS NATIVE_TYPE,
                c.IS_NULLABLE, c.COLUMN_DEFAULT, c.CHARACTER_MAXIMUM_LENGTH,
                c.NUMERIC_PRECISION, c.NUMERIC_SCALE, c.COMMENT
         FROM INFORMATION_SCHEMA.COLUMNS c
         WHERE c.TABLE_SCHEMA = ? AND c.TABLE_NAME = ?
         ORDER BY c.ORDINAL_POSITION`,
        [schema, table],
      );

      // Fetch primary key columns via SHOW PRIMARY KEYS
      const { rows: pkRows } = await this.exec(
        connection,
        `SHOW PRIMARY KEYS IN TABLE "${sanitizedDb}"."${sanitizedSchema}"."${sanitizedTable}"`,
      );
      // SHOW PRIMARY KEYS returns rows with lowercase 'column_name' property
      const pkColumns = new Set<string>(
        pkRows.map((row) => (row['column_name'] as string).toUpperCase()),
      );

      return colRows.map((row) => {
        const columnName = row['COLUMN_NAME'] as string;
        return {
          name: columnName,
          dataType: row['DATA_TYPE'] as string,
          nativeType: row['NATIVE_TYPE'] as string,
          isNullable: row['IS_NULLABLE'] === 'YES',
          isPrimaryKey: pkColumns.has(columnName.toUpperCase()),
          defaultValue: row['COLUMN_DEFAULT'] as string | undefined,
          maxLength:
            row['CHARACTER_MAXIMUM_LENGTH'] != null
              ? Number(row['CHARACTER_MAXIMUM_LENGTH'])
              : undefined,
          numericPrecision:
            row['NUMERIC_PRECISION'] != null
              ? Number(row['NUMERIC_PRECISION'])
              : undefined,
          numericScale:
            row['NUMERIC_SCALE'] != null ? Number(row['NUMERIC_SCALE']) : undefined,
          comment: row['COMMENT'] as string | undefined,
        };
      });
    } finally {
      this.destroyConnection(connection);
    }
  }

  async listForeignKeys(
    params: ConnectionParams,
    database: string,
    schema: string,
  ): Promise<ForeignKeyInfo[]> {
    const sanitizedDb = this.sanitizeIdentifier(database);
    const sanitizedSchema = this.sanitizeIdentifier(schema);

    const connection = await this.createConnection(params, database);
    try {
      const { rows } = await this.exec(
        connection,
        `SHOW IMPORTED KEYS IN SCHEMA "${sanitizedDb}"."${sanitizedSchema}"`,
      );

      // Group by fk_name — SHOW IMPORTED KEYS returns one row per column pair
      const grouped = new Map<string, ForeignKeyInfo>();

      for (const row of rows) {
        const constraintName = row['fk_name'] as string;
        if (!grouped.has(constraintName)) {
          grouped.set(constraintName, {
            constraintName,
            fromSchema: row['fk_schema_name'] as string,
            fromTable: row['fk_table_name'] as string,
            fromColumns: [],
            toSchema: row['pk_schema_name'] as string,
            toTable: row['pk_table_name'] as string,
            toColumns: [],
          });
        }
        const entry = grouped.get(constraintName)!;
        entry.fromColumns.push(row['fk_column_name'] as string);
        entry.toColumns.push(row['pk_column_name'] as string);
      }

      return Array.from(grouped.values());
    } finally {
      this.destroyConnection(connection);
    }
  }

  async getSampleData(
    params: ConnectionParams,
    database: string,
    schema: string,
    table: string,
    limit = 5,
  ): Promise<SampleDataResult> {
    const sanitizedDb = this.sanitizeIdentifier(database);
    const sanitizedSchema = this.sanitizeIdentifier(schema);
    const sanitizedTable = this.sanitizeIdentifier(table);

    const connection = await this.createConnection(params, database);
    try {
      const { columns, rows } = await this.exec(
        connection,
        `SELECT * FROM "${sanitizedDb}"."${sanitizedSchema}"."${sanitizedTable}" LIMIT ${limit}`,
      );

      const rowArrays = rows.map((row) => columns.map((col) => row[col]));
      return { columns, rows: rowArrays };
    } finally {
      this.destroyConnection(connection);
    }
  }

  async getColumnStats(
    params: ConnectionParams,
    database: string,
    schema: string,
    table: string,
    column: string,
  ): Promise<ColumnStatsResult> {
    const sanitizedDb = this.sanitizeIdentifier(database);
    const sanitizedSchema = this.sanitizeIdentifier(schema);
    const sanitizedTable = this.sanitizeIdentifier(table);
    const sanitizedColumn = this.sanitizeIdentifier(column);

    const connection = await this.createConnection(params, database);
    try {
      const { rows: statsRows } = await this.exec(
        connection,
        `SELECT COUNT(DISTINCT "${sanitizedColumn}") AS "distinctCount",
                COUNT(*) - COUNT("${sanitizedColumn}") AS "nullCount",
                COUNT(*) AS "totalCount",
                MIN("${sanitizedColumn}")::VARCHAR AS "min",
                MAX("${sanitizedColumn}")::VARCHAR AS "max"
         FROM "${sanitizedDb}"."${sanitizedSchema}"."${sanitizedTable}"`,
      );

      const { rows: sampleRows } = await this.exec(
        connection,
        `SELECT DISTINCT "${sanitizedColumn}"::VARCHAR AS value
         FROM "${sanitizedDb}"."${sanitizedSchema}"."${sanitizedTable}"
         WHERE "${sanitizedColumn}" IS NOT NULL
         LIMIT 10`,
      );

      const stats = statsRows[0];
      const sampleValues = sampleRows.map((row) => row['value']);

      return {
        distinctCount: parseInt(stats['distinctCount'] as string, 10),
        nullCount: parseInt(stats['nullCount'] as string, 10),
        totalCount: parseInt(stats['totalCount'] as string, 10),
        sampleValues,
        min: stats['min'],
        max: stats['max'],
      };
    } finally {
      this.destroyConnection(connection);
    }
  }

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
    const sanitizedDb = this.sanitizeIdentifier(database);
    const sanitizedChildSchema = this.sanitizeIdentifier(childSchema);
    const sanitizedChildTable = this.sanitizeIdentifier(childTable);
    const sanitizedChildColumn = this.sanitizeIdentifier(childColumn);
    const sanitizedParentSchema = this.sanitizeIdentifier(parentSchema);
    const sanitizedParentTable = this.sanitizeIdentifier(parentTable);
    const sanitizedParentColumn = this.sanitizeIdentifier(parentColumn);

    const connection = await this.createConnection(params, database);
    try {
      const { rows } = await this.exec(
        connection,
        `WITH child_sample AS (
           SELECT "${sanitizedChildColumn}" AS val
           FROM "${sanitizedDb}"."${sanitizedChildSchema}"."${sanitizedChildTable}"
           LIMIT ${sampleSize}
         ),
         child_stats AS (
           SELECT
             COUNT(DISTINCT val) AS distinct_count,
             SUM(CASE WHEN val IS NULL THEN 1 ELSE 0 END) AS null_count,
             COUNT(*) AS total_count
           FROM child_sample
         ),
         child_vals AS (
           SELECT DISTINCT val::VARCHAR AS val
           FROM child_sample
           WHERE val IS NOT NULL
         ),
         parent_vals AS (
           SELECT DISTINCT "${sanitizedParentColumn}"::VARCHAR AS val
           FROM "${sanitizedDb}"."${sanitizedParentSchema}"."${sanitizedParentTable}"
           WHERE "${sanitizedParentColumn}" IS NOT NULL
           LIMIT ${sampleSize}
         )
         SELECT
           cs.distinct_count AS "childDistinctCount",
           cs.null_count AS "childNullCount",
           cs.total_count AS "childSampleSize",
           (SELECT COUNT(*) FROM parent_vals) AS "parentDistinctCount",
           (SELECT COUNT(*) FROM child_vals c INNER JOIN parent_vals p ON c.val = p.val) AS "overlapCount"
         FROM child_stats cs`,
      );

      const row = rows[0];
      const childDistinctCount = parseInt(row['childDistinctCount'] as string, 10);
      const childNullCount = parseInt(row['childNullCount'] as string, 10);
      const childSampleSize = parseInt(row['childSampleSize'] as string, 10);
      const parentDistinctCount = parseInt(row['parentDistinctCount'] as string, 10);
      const overlapCount = parseInt(row['overlapCount'] as string, 10);

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
      this.destroyConnection(connection);
    }
  }

  async executeReadOnlyQuery(
    params: ConnectionParams,
    sql: string,
    maxRows = 100,
  ): Promise<QueryResult> {
    // Security check: reject any write operations
    const writeOperationsRegex =
      /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE)\b/i;
    if (writeOperationsRegex.test(sql)) {
      throw new Error('Write operations are not allowed in read-only queries');
    }

    const connection = await this.createConnection(params);
    try {
      const { columns, rows } = await this.exec(connection, sql);

      const limitedRows = rows.slice(0, maxRows);
      const rowArrays = limitedRows.map((row) => columns.map((col) => row[col]));

      return {
        columns,
        rows: rowArrays,
        rowCount: rows.length,
      };
    } finally {
      this.destroyConnection(connection);
    }
  }
}
