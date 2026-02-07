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
  async listDatabases(connectionId: string, userId: string) {
    const { params, dbType } = await this.getConnectionParams(connectionId, userId);
    const driver = getDiscoveryDriver(dbType);
    const databases = await driver.listDatabases(params);

    this.logger.log(`Listed ${databases.length} databases for connection ${connectionId}`);

    return { data: databases };
  }

  /**
   * List schemas in a database
   */
  async listSchemas(connectionId: string, database: string, userId: string) {
    const { params, dbType } = await this.getConnectionParams(connectionId, userId);
    const driver = getDiscoveryDriver(dbType);
    const schemas = await driver.listSchemas(params, database);

    this.logger.log(`Listed ${schemas.length} schemas in database ${database} for connection ${connectionId}`);

    return { data: schemas };
  }

  /**
   * List tables in a schema
   */
  async listTables(connectionId: string, database: string, schema: string, userId: string) {
    const { params, dbType } = await this.getConnectionParams(connectionId, userId);
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
    userId: string,
  ) {
    const { params, dbType } = await this.getConnectionParams(connectionId, userId);
    const driver = getDiscoveryDriver(dbType);
    const columns = await driver.listColumns(params, database, schema, table);

    this.logger.log(`Listed ${columns.length} columns for table ${table} in connection ${connectionId}`);

    return { data: columns };
  }

  /**
   * Get connection params for a connection, with ownership check
   */
  private async getConnectionParams(
    connectionId: string,
    userId: string,
  ): Promise<{ params: ConnectionParams; dbType: string }> {
    // Find connection with ownership check
    const connection = await this.prisma.dataConnection.findFirst({
      where: {
        id: connectionId,
        ownerId: userId,
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
