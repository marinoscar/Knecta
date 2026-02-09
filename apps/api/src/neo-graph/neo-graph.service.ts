import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import neo4j, {
  Driver,
  Session,
  ManagedTransaction,
  auth,
} from 'neo4j-driver';

@Injectable()
export class NeoGraphService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NeoGraphService.name);
  private driver: Driver;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const host = this.configService.get<string>('neo4j.host');
    const port = this.configService.get<number>('neo4j.port');
    const user = this.configService.get<string>('neo4j.user');
    const password = this.configService.get<string>('neo4j.password');

    const uri = `bolt://${host}:${port}`;

    this.logger.log(`Connecting to Neo4j at ${uri}`);

    this.driver = neo4j.driver(uri, auth.basic(user, password));

    // Verify connectivity on startup
    try {
      await this.verifyConnectivity();
      this.logger.log('Neo4j connection verified successfully');
    } catch (error) {
      this.logger.error('Failed to connect to Neo4j', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.driver) {
      this.logger.log('Closing Neo4j driver');
      await this.driver.close();
    }
  }

  /**
   * Get a new session for executing queries
   * @param database Optional database name (defaults to default database)
   */
  getSession(database?: string): Session {
    return this.driver.session({ database });
  }

  /**
   * Execute work in a read transaction
   */
  async readTransaction<T>(
    work: (tx: ManagedTransaction) => Promise<T>,
    database?: string,
  ): Promise<T> {
    const session = this.getSession(database);
    try {
      return await session.executeRead(work);
    } finally {
      await session.close();
    }
  }

  /**
   * Execute work in a write transaction
   */
  async writeTransaction<T>(
    work: (tx: ManagedTransaction) => Promise<T>,
    database?: string,
  ): Promise<T> {
    const session = this.getSession(database);
    try {
      return await session.executeWrite(work);
    } finally {
      await session.close();
    }
  }

  /**
   * Verify connectivity to Neo4j by executing a simple query
   */
  async verifyConnectivity(): Promise<void> {
    const session = this.getSession();
    try {
      const result = await session.run('RETURN 1 AS num');
      const record = result.records[0];
      const value = record.get('num');

      if (value.toNumber() !== 1) {
        throw new Error('Unexpected result from Neo4j health check');
      }
    } finally {
      await session.close();
    }
  }

  /**
   * Get the underlying driver instance for advanced usage
   */
  getDriver(): Driver {
    return this.driver;
  }
}
