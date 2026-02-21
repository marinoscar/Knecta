import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { decrypt, getEncryptionKey } from '../common/utils/encryption.util';
import { getDiscoveryDriver, ConnectionParams } from '../connections/drivers';

@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);
  private encryptionKey: Buffer;

  constructor(private readonly prisma: PrismaService) {
    this.encryptionKey = getEncryptionKey();
  }

  /**
   * List databases on a connection
   */
  async listDatabases(connectionId: string) {
    const { params, dbType } = await this.getConnectionParams(connectionId);
    const driver = getDiscoveryDriver(dbType);
    const databases = await driver.listDatabases(params);

    this.logger.log(`Listed ${databases.length} databases for connection ${connectionId}`);

    return { data: databases };
  }

  /**
   * List schemas in a database
   */
  async listSchemas(connectionId: string, database: string) {
    const { params, dbType } = await this.getConnectionParams(connectionId);
    const driver = getDiscoveryDriver(dbType);
    const schemas = await driver.listSchemas(params, database);

    this.logger.log(`Listed ${schemas.length} schemas in database ${database} for connection ${connectionId}`);

    return { data: schemas };
  }

  /**
   * List tables in a schema
   */
  async listTables(connectionId: string, database: string, schema: string) {
    const { params, dbType } = await this.getConnectionParams(connectionId);
    const driver = getDiscoveryDriver(dbType);
    const tables = await driver.listTables(params, database, schema);

    this.logger.log(`Listed ${tables.length} tables in schema ${schema} for connection ${connectionId}`);

    return { data: tables };
  }

  /**
   * List columns for a table
   */
  async listColumns(
    connectionId: string,
    database: string,
    schema: string,
    table: string,
  ) {
    const { params, dbType } = await this.getConnectionParams(connectionId);
    const driver = getDiscoveryDriver(dbType);
    const columns = await driver.listColumns(params, database, schema, table);

    this.logger.log(`Listed ${columns.length} columns for table ${table} in connection ${connectionId}`);

    return { data: columns };
  }

  /**
   * Get foreign keys for a schema
   */
  async getForeignKeys(connectionId: string, database: string, schema: string) {
    const { params, dbType } = await this.getConnectionParams(connectionId);
    const driver = getDiscoveryDriver(dbType);
    const foreignKeys = await driver.listForeignKeys(params, database, schema);

    this.logger.log(`Listed ${foreignKeys.length} foreign keys in schema ${schema} for connection ${connectionId}`);

    return { data: foreignKeys };
  }

  /**
   * Get sample data from a table
   */
  async getSampleData(
    connectionId: string,
    database: string,
    schema: string,
    table: string,
    limit: number,
  ) {
    const { params, dbType } = await this.getConnectionParams(connectionId);
    const driver = getDiscoveryDriver(dbType);
    const sampleData = await driver.getSampleData(params, database, schema, table, limit);

    this.logger.log(`Retrieved ${sampleData.rows.length} sample rows from table ${table} in connection ${connectionId}`);

    return { data: sampleData };
  }

  /**
   * Get column statistics
   */
  async getColumnStats(
    connectionId: string,
    database: string,
    schema: string,
    table: string,
    column: string,
  ) {
    const { params, dbType } = await this.getConnectionParams(connectionId);
    const driver = getDiscoveryDriver(dbType);
    const stats = await driver.getColumnStats(params, database, schema, table, column);

    this.logger.log(`Retrieved stats for column ${column} in table ${table} for connection ${connectionId}`);

    return { data: stats };
  }

  /**
   * Check value overlap between child and parent columns
   */
  async getColumnValueOverlap(
    connectionId: string,
    database: string,
    childSchema: string,
    childTable: string,
    childColumn: string,
    parentSchema: string,
    parentTable: string,
    parentColumn: string,
    sampleSize?: number,
  ) {
    const { params, dbType } = await this.getConnectionParams(connectionId);
    const driver = getDiscoveryDriver(dbType);
    const overlap = await driver.getColumnValueOverlap(
      params,
      database,
      childSchema,
      childTable,
      childColumn,
      parentSchema,
      parentTable,
      parentColumn,
      sampleSize,
    );

    this.logger.log(
      `Retrieved value overlap for ${childTable}.${childColumn} -> ${parentTable}.${parentColumn} (${overlap.overlapRatio.toFixed(2)} overlap ratio) for connection ${connectionId}`,
    );

    return { data: overlap };
  }

  /**
   * Execute a read-only SQL query
   */
  async executeQuery(connectionId: string, sql: string, maxRows: number = 100) {
    const { params, dbType } = await this.getConnectionParams(connectionId);
    const driver = getDiscoveryDriver(dbType);
    const result = await driver.executeReadOnlyQuery(params, sql, maxRows);

    this.logger.log(`Executed query returning ${result.rowCount} rows for connection ${connectionId}`);

    return { data: result };
  }

  /**
   * Get distinct text values for a single column, optionally preferring values
   * from recent rows by ordering an auxiliary timestamp/sequence column DESC
   * before de-duplicating.
   */
  async getDistinctColumnValues(
    connectionId: string,
    database: string,
    schema: string,
    table: string,
    column: string,
    orderByColumn?: string,
    limit: number = 5,
  ): Promise<string[]> {
    const { params, dbType } = await this.getConnectionParams(connectionId);
    const driver = getDiscoveryDriver(dbType);

    // ------------------------------------------------------------------
    // Identifier quoting helpers
    // ------------------------------------------------------------------
    const sanitize = (id: string): string => id.replace(/[^a-zA-Z0-9_]/g, '');

    const quote = (id: string): string => {
      const s = sanitize(id);
      switch (dbType) {
        case 'mysql':
        case 'databricks':
          return `\`${s}\``;
        case 'mssql':
          return `[${s}]`;
        default:
          // postgresql, snowflake
          return `"${s}"`;
      }
    };

    // Build a fully-qualified table reference (2-part or 3-part)
    const tableRef = (dbType === 'snowflake' || dbType === 'databricks')
      ? `${quote(database)}.${quote(schema)}.${quote(table)}`
      : `${quote(schema)}.${quote(table)}`;

    // Per-dialect column cast to text
    const castCol = (col: string): string => {
      const q = quote(col);
      switch (dbType) {
        case 'postgresql':
          return `${q}::text`;
        case 'snowflake':
          return `${q}::VARCHAR`;
        case 'mysql':
          return `CAST(${q} AS CHAR(250))`;
        case 'mssql':
          return `CAST(${q} AS NVARCHAR(250))`;
        case 'databricks':
          return `CAST(${q} AS STRING)`;
        default:
          return `${q}::text`;
      }
    };

    // ------------------------------------------------------------------
    // Build SQL
    // ------------------------------------------------------------------
    const quotedCol = quote(column);
    const castedCol = castCol(column);
    let sql: string;

    if (dbType === 'mssql') {
      if (orderByColumn) {
        const quotedOrderBy = quote(orderByColumn);
        sql = `SELECT DISTINCT TOP ${limit} ${castCol(column)} AS value
FROM (
  SELECT TOP 100 ${quotedCol}, ${quotedOrderBy}
  FROM ${tableRef}
  WHERE ${quotedCol} IS NOT NULL
  ORDER BY ${quotedOrderBy} DESC
) sub`;
      } else {
        sql = `SELECT DISTINCT TOP ${limit} ${castCol(column)} AS value
FROM (
  SELECT TOP 100 ${quotedCol}
  FROM ${tableRef}
  WHERE ${quotedCol} IS NOT NULL
) sub`;
      }
    } else {
      if (orderByColumn) {
        const quotedOrderBy = quote(orderByColumn);
        sql = `SELECT DISTINCT ${castedCol} AS value
FROM (
  SELECT ${quotedCol}, ${quotedOrderBy}
  FROM ${tableRef}
  WHERE ${quotedCol} IS NOT NULL
  ORDER BY ${quotedOrderBy} DESC
  LIMIT 100
) sub
LIMIT ${limit}`;
      } else {
        sql = `SELECT DISTINCT ${castedCol} AS value
FROM (
  SELECT ${quotedCol}
  FROM ${tableRef}
  WHERE ${quotedCol} IS NOT NULL
  LIMIT 100
) sub
LIMIT ${limit}`;
      }
    }

    // ------------------------------------------------------------------
    // Execute and extract
    // ------------------------------------------------------------------
    const queryParams = { ...params, databaseName: database };
    const result = await driver.executeReadOnlyQuery(queryParams, sql, limit);
    const values = result.rows.map(row => String(row[0]));

    this.logger.log(
      `Retrieved ${values.length} distinct values for column ${column} in table ${table} for connection ${connectionId}`,
    );

    return values;
  }

  /**
   * Get connection params for a connection
   */
  private async getConnectionParams(
    connectionId: string,
  ): Promise<{ params: ConnectionParams; dbType: string }> {
    // Find connection
    const connection = await this.prisma.dataConnection.findUnique({
      where: {
        id: connectionId,
      },
    });

    if (!connection) {
      throw new NotFoundException(`Connection with ID ${connectionId} not found`);
    }

    // Decrypt password if stored
    let password: string | undefined = undefined;
    if (connection.encryptedCredential) {
      password = decrypt(connection.encryptedCredential, this.encryptionKey);
    }

    // Build connection parameters
    const params: ConnectionParams = {
      host: connection.host,
      port: connection.port,
      databaseName: connection.databaseName || undefined,
      username: connection.username || undefined,
      password,
      useSsl: connection.useSsl,
      options: connection.options as Record<string, unknown> || undefined,
    };

    return { params, dbType: connection.dbType };
  }
}
