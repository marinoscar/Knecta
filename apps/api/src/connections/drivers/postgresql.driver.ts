import { Client } from 'pg';
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

export class PostgreSQLDriver implements DiscoveryDriver {
  async testConnection(params: ConnectionParams): Promise<ConnectionTestResult> {
    const start = Date.now();
    const client = new Client({
      host: params.host,
      port: params.port,
      database: params.databaseName || undefined,
      user: params.username || undefined,
      password: params.password || undefined,
      ssl: params.useSsl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 10000,
      query_timeout: 10000,
    });

    try {
      await client.connect();
      await client.query('SELECT 1');
      const latencyMs = Date.now() - start;
      return { success: true, message: 'Connection successful', latencyMs };
    } catch (error) {
      const latencyMs = Date.now() - start;
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message, latencyMs };
    } finally {
      try {
        await client.end();
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  private async createClient(params: ConnectionParams, database?: string): Promise<Client> {
    const client = new Client({
      host: params.host,
      port: params.port,
      database: database || params.databaseName || undefined,
      user: params.username || undefined,
      password: params.password || undefined,
      ssl: params.useSsl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 10000,
      query_timeout: 30000,
    });
    await client.connect();
    return client;
  }

  private sanitizeIdentifier(identifier: string): string {
    // Remove any double quotes and keep only alphanumeric and underscore
    return identifier.replace(/[^a-zA-Z0-9_]/g, '');
  }

  async listDatabases(params: ConnectionParams): Promise<DatabaseInfo[]> {
    const client = await this.createClient(params);
    try {
      const result = await client.query(
        `SELECT datname AS name FROM pg_database
         WHERE datistemplate = false AND datallowconn = true
         ORDER BY datname`
      );
      return result.rows;
    } finally {
      try {
        await client.end();
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  async listSchemas(params: ConnectionParams, database: string): Promise<SchemaInfo[]> {
    const client = await this.createClient(params, database);
    try {
      const result = await client.query(
        `SELECT schema_name AS name
         FROM information_schema.schemata
         WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
         ORDER BY schema_name`
      );
      return result.rows.map(row => ({ name: row.name, database }));
    } finally {
      try {
        await client.end();
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  async listTables(params: ConnectionParams, database: string, schema: string): Promise<TableInfo[]> {
    const client = await this.createClient(params, database);
    try {
      const result = await client.query(
        `SELECT table_name AS name, table_schema AS "schema",
                CASE WHEN table_type = 'BASE TABLE' THEN 'TABLE' ELSE 'VIEW' END AS type
         FROM information_schema.tables
         WHERE table_schema = $1 AND table_type IN ('BASE TABLE', 'VIEW')
         ORDER BY table_name`,
        [schema]
      );

      const tables: TableInfo[] = [];
      for (const row of result.rows) {
        let rowCountEstimate: number | undefined;

        // Get row count estimate for tables (not views)
        if (row.type === 'TABLE') {
          try {
            const countResult = await client.query(
              `SELECT reltuples::bigint AS estimate
               FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = $1 AND c.relname = $2`,
              [schema, row.name]
            );
            if (countResult.rows.length > 0) {
              rowCountEstimate = parseInt(countResult.rows[0].estimate, 10);
            }
          } catch {
            // Ignore errors getting row count estimate
          }
        }

        tables.push({
          name: row.name,
          schema: row.schema,
          database,
          type: row.type,
          rowCountEstimate,
        });
      }

      return tables;
    } finally {
      try {
        await client.end();
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  async listColumns(params: ConnectionParams, database: string, schema: string, table: string): Promise<ColumnInfo[]> {
    const client = await this.createClient(params, database);
    try {
      const result = await client.query(
        `SELECT c.column_name AS name,
                c.data_type AS "dataType",
                c.udt_name AS "nativeType",
                c.is_nullable = 'YES' AS "isNullable",
                c.column_default AS "defaultValue",
                c.character_maximum_length AS "maxLength",
                c.numeric_precision AS "numericPrecision",
                c.numeric_scale AS "numericScale",
                col_description(pgc.oid, c.ordinal_position) AS comment,
                CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS "isPrimaryKey"
         FROM information_schema.columns c
         LEFT JOIN pg_class pgc ON pgc.relname = c.table_name
           LEFT JOIN pg_namespace pgn ON pgn.oid = pgc.relnamespace AND pgn.nspname = c.table_schema
         LEFT JOIN (
           SELECT kcu.column_name, kcu.table_schema, kcu.table_name
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
           WHERE tc.constraint_type = 'PRIMARY KEY'
         ) pk ON pk.table_schema = c.table_schema AND pk.table_name = c.table_name AND pk.column_name = c.column_name
         WHERE c.table_schema = $1 AND c.table_name = $2
         ORDER BY c.ordinal_position`,
        [schema, table]
      );
      return result.rows;
    } finally {
      try {
        await client.end();
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  async listForeignKeys(params: ConnectionParams, database: string, schema: string): Promise<ForeignKeyInfo[]> {
    const client = await this.createClient(params, database);
    try {
      const result = await client.query(
        `SELECT tc.constraint_name AS "constraintName",
                kcu.table_schema AS "fromSchema",
                kcu.table_name AS "fromTable",
                array_agg(kcu.column_name ORDER BY kcu.ordinal_position) AS "fromColumns",
                ccu.table_schema AS "toSchema",
                ccu.table_name AS "toTable",
                array_agg(ccu.column_name ORDER BY kcu.ordinal_position) AS "toColumns"
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name AND tc.constraint_schema = kcu.constraint_schema
         JOIN information_schema.constraint_column_usage ccu
           ON tc.constraint_name = ccu.constraint_name AND tc.constraint_schema = ccu.constraint_schema
         WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = $1
         GROUP BY tc.constraint_name, kcu.table_schema, kcu.table_name, ccu.table_schema, ccu.table_name`,
        [schema]
      );
      return result.rows;
    } finally {
      try {
        await client.end();
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  async getSampleData(params: ConnectionParams, database: string, schema: string, table: string, limit = 5): Promise<SampleDataResult> {
    const client = await this.createClient(params, database);
    try {
      const sanitizedSchema = this.sanitizeIdentifier(schema);
      const sanitizedTable = this.sanitizeIdentifier(table);

      const result = await client.query(
        `SELECT * FROM "${sanitizedSchema}"."${sanitizedTable}" LIMIT ${limit}`
      );

      const columns = result.fields.map(field => field.name);
      const rows = result.rows.map(row => columns.map(col => row[col]));

      return { columns, rows };
    } finally {
      try {
        await client.end();
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  async getColumnStats(params: ConnectionParams, database: string, schema: string, table: string, column: string): Promise<ColumnStatsResult> {
    const client = await this.createClient(params, database);
    try {
      const sanitizedSchema = this.sanitizeIdentifier(schema);
      const sanitizedTable = this.sanitizeIdentifier(table);
      const sanitizedColumn = this.sanitizeIdentifier(column);

      // Get statistics
      const statsResult = await client.query(
        `SELECT
           COUNT(DISTINCT "${sanitizedColumn}") AS "distinctCount",
           COUNT(*) FILTER (WHERE "${sanitizedColumn}" IS NULL) AS "nullCount",
           COUNT(*) AS "totalCount",
           MIN("${sanitizedColumn}"::text) AS "min",
           MAX("${sanitizedColumn}"::text) AS "max"
         FROM "${sanitizedSchema}"."${sanitizedTable}"`
      );

      // Get sample distinct values
      const samplesResult = await client.query(
        `SELECT DISTINCT "${sanitizedColumn}"::text AS value
         FROM "${sanitizedSchema}"."${sanitizedTable}"
         WHERE "${sanitizedColumn}" IS NOT NULL
         LIMIT 10`
      );

      const stats = statsResult.rows[0];
      const sampleValues = samplesResult.rows.map(row => row.value);

      return {
        distinctCount: parseInt(stats.distinctCount, 10),
        nullCount: parseInt(stats.nullCount, 10),
        totalCount: parseInt(stats.totalCount, 10),
        sampleValues,
        min: stats.min,
        max: stats.max,
      };
    } finally {
      try {
        await client.end();
      } catch {
        // Ignore cleanup errors
      }
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
    const client = await this.createClient(params, database);
    try {
      const sanitizedChildSchema = this.sanitizeIdentifier(childSchema);
      const sanitizedChildTable = this.sanitizeIdentifier(childTable);
      const sanitizedChildColumn = this.sanitizeIdentifier(childColumn);
      const sanitizedParentSchema = this.sanitizeIdentifier(parentSchema);
      const sanitizedParentTable = this.sanitizeIdentifier(parentTable);
      const sanitizedParentColumn = this.sanitizeIdentifier(parentColumn);

      const result = await client.query(
        `WITH child_sample AS (
           SELECT "${sanitizedChildColumn}" AS val
           FROM "${sanitizedChildSchema}"."${sanitizedChildTable}"
           LIMIT ${sampleSize}
         ),
         child_stats AS (
           SELECT
             COUNT(DISTINCT val) AS distinct_count,
             COUNT(*) FILTER (WHERE val IS NULL) AS null_count,
             COUNT(*) AS total_count
           FROM child_sample
         ),
         child_vals AS (
           SELECT DISTINCT val::text AS val
           FROM child_sample
           WHERE val IS NOT NULL
         ),
         parent_vals AS (
           SELECT DISTINCT "${sanitizedParentColumn}"::text AS val
           FROM "${sanitizedParentSchema}"."${sanitizedParentTable}"
           WHERE "${sanitizedParentColumn}" IS NOT NULL
           LIMIT ${sampleSize}
         )
         SELECT
           cs.distinct_count AS "childDistinctCount",
           cs.null_count AS "childNullCount",
           cs.total_count AS "childSampleSize",
           (SELECT COUNT(*) FROM parent_vals) AS "parentDistinctCount",
           (SELECT COUNT(*) FROM child_vals c INNER JOIN parent_vals p ON c.val = p.val) AS "overlapCount"
         FROM child_stats cs`
      );

      const row = result.rows[0];
      const childDistinctCount = parseInt(row.childDistinctCount, 10);
      const childNullCount = parseInt(row.childNullCount, 10);
      const childSampleSize = parseInt(row.childSampleSize, 10);
      const parentDistinctCount = parseInt(row.parentDistinctCount, 10);
      const overlapCount = parseInt(row.overlapCount, 10);

      // Compute ratios
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
      try {
        await client.end();
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  async executeReadOnlyQuery(params: ConnectionParams, sql: string, maxRows = 100): Promise<QueryResult> {
    // Security check: reject any write operations
    const writeOperationsRegex = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE)\b/i;
    if (writeOperationsRegex.test(sql)) {
      throw new Error('Write operations are not allowed in read-only queries');
    }

    const client = await this.createClient(params);
    try {
      // Set statement timeout and read-only transaction
      await client.query('SET statement_timeout = 30000');
      await client.query('BEGIN TRANSACTION READ ONLY');

      const result = await client.query(sql);
      await client.query('COMMIT');

      const columns = result.fields.map(field => field.name);
      const limitedRows = result.rows.slice(0, maxRows);
      const rows = limitedRows.map(row => columns.map(col => row[col]));

      return {
        columns,
        rows,
        rowCount: result.rowCount || 0,
      };
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback errors
      }
      throw error;
    } finally {
      try {
        await client.end();
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
