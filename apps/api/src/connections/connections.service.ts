import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { UpdateConnectionDto } from './dto/update-connection.dto';
import { ConnectionQueryDto } from './dto/connection-query.dto';
import { TestConnectionDto } from './dto/test-connection.dto';
import { encrypt, decrypt, getEncryptionKey } from '../common/utils/encryption.util';
import { getDriver, ConnectionParams } from './drivers';

@Injectable()
export class ConnectionsService {
  private readonly logger = new Logger(ConnectionsService.name);
  private encryptionKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.encryptionKey = getEncryptionKey();
  }

  /**
   * List data connections with pagination and filtering
   */
  async list(query: ConnectionQueryDto, userId: string) {
    const { page, pageSize, search, dbType, sortBy, sortOrder } = query;
    const skip = (page - 1) * pageSize;

    // Build where clause
    const where: any = {
      ownerId: userId,
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (dbType) {
      where.dbType = dbType;
    }

    // Execute query
    const [items, total] = await Promise.all([
      this.prisma.dataConnection.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.dataConnection.count({ where }),
    ]);

    return {
      items: items.map((connection) => this.mapConnection(connection)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Get connection by ID
   */
  async getById(id: string, userId: string) {
    const connection = await this.prisma.dataConnection.findFirst({
      where: {
        id,
        ownerId: userId,
      },
    });

    if (!connection) {
      throw new NotFoundException(`Connection with ID ${id} not found`);
    }

    return this.mapConnection(connection);
  }

  /**
   * Create a new connection
   */
  async create(dto: CreateConnectionDto, userId: string) {
    // Encrypt password if provided
    let encryptedCredential: string | null = null;
    if (dto.password) {
      encryptedCredential = encrypt(dto.password, this.encryptionKey);
    }

    // Create connection
    const connection = await this.prisma.dataConnection.create({
      data: {
        name: dto.name,
        description: dto.description,
        dbType: dto.dbType,
        host: dto.host,
        port: dto.port,
        databaseName: dto.databaseName,
        username: dto.username,
        encryptedCredential,
        useSsl: dto.useSsl,
        options: dto.options as any,
        ownerId: userId,
      },
    });

    // Create audit event
    await this.createAuditEvent(
      userId,
      'connections:create',
      'data_connection',
      connection.id,
      { name: connection.name, dbType: connection.dbType },
    );

    this.logger.log(`Connection ${connection.name} created by user ${userId}`);

    return this.mapConnection(connection);
  }

  /**
   * Update a connection
   */
  async update(id: string, dto: UpdateConnectionDto, userId: string) {
    // Find existing connection
    const existing = await this.prisma.dataConnection.findFirst({
      where: {
        id,
        ownerId: userId,
      },
    });

    if (!existing) {
      throw new NotFoundException(`Connection with ID ${id} not found`);
    }

    // Handle password logic
    let encryptedCredential: string | null | undefined = undefined;
    if (dto.password !== undefined) {
      if (dto.password === '') {
        // Empty string: clear credential
        encryptedCredential = null;
      } else {
        // Non-empty string: encrypt and store
        encryptedCredential = encrypt(dto.password, this.encryptionKey);
      }
    }
    // If password is undefined, keep existing credential (don't set encryptedCredential)

    // Update connection
    const updateData: any = {
      name: dto.name,
      description: dto.description,
      dbType: dto.dbType,
      host: dto.host,
      port: dto.port,
      databaseName: dto.databaseName,
      username: dto.username,
      useSsl: dto.useSsl,
      options: dto.options as any,
    };

    // Only include encryptedCredential if it was explicitly set
    if (encryptedCredential !== undefined) {
      updateData.encryptedCredential = encryptedCredential;
    }

    const connection = await this.prisma.dataConnection.update({
      where: { id },
      data: updateData,
    });

    // Create audit event
    await this.createAuditEvent(
      userId,
      'connections:update',
      'data_connection',
      connection.id,
      { name: connection.name },
    );

    this.logger.log(`Connection ${connection.name} updated by user ${userId}`);

    return this.mapConnection(connection);
  }

  /**
   * Delete a connection
   */
  async delete(id: string, userId: string) {
    // Find connection
    const connection = await this.prisma.dataConnection.findFirst({
      where: {
        id,
        ownerId: userId,
      },
    });

    if (!connection) {
      throw new NotFoundException(`Connection with ID ${id} not found`);
    }

    // Delete connection
    await this.prisma.dataConnection.delete({
      where: { id },
    });

    // Create audit event
    await this.createAuditEvent(
      userId,
      'connections:delete',
      'data_connection',
      id,
      { name: connection.name },
    );

    this.logger.log(`Connection ${connection.name} deleted by user ${userId}`);
  }

  /**
   * Test an existing connection
   */
  async testExisting(id: string, userId: string) {
    // Find connection
    const connection = await this.prisma.dataConnection.findFirst({
      where: {
        id,
        ownerId: userId,
      },
    });

    if (!connection) {
      throw new NotFoundException(`Connection with ID ${id} not found`);
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

    // Test connection using appropriate driver
    const driver = getDriver(connection.dbType);
    const result = await driver.testConnection(params);

    // Update test results
    await this.prisma.dataConnection.update({
      where: { id },
      data: {
        lastTestedAt: new Date(),
        lastTestResult: result.success,
        lastTestMessage: result.message,
      },
    });

    // Create audit event
    await this.createAuditEvent(
      userId,
      'connections:test',
      'data_connection',
      connection.id,
      { name: connection.name, success: result.success },
    );

    this.logger.log(`Connection ${connection.name} tested by user ${userId}: ${result.success ? 'success' : 'failed'}`);

    return result;
  }

  /**
   * Test new connection parameters without saving
   */
  async testNew(dto: TestConnectionDto) {
    // Build connection parameters
    const params: ConnectionParams = {
      host: dto.host,
      port: dto.port,
      databaseName: dto.databaseName,
      username: dto.username,
      password: dto.password,
      useSsl: dto.useSsl,
      options: dto.options,
    };

    // Test connection using appropriate driver
    const driver = getDriver(dto.dbType);
    const result = await driver.testConnection(params);

    this.logger.log(`New connection test for ${dto.dbType}: ${result.success ? 'success' : 'failed'}`);

    return result;
  }

  /**
   * Map Prisma connection model to API response
   */
  private mapConnection(connection: any) {
    return {
      id: connection.id,
      name: connection.name,
      description: connection.description,
      dbType: connection.dbType,
      host: connection.host,
      port: connection.port,
      databaseName: connection.databaseName,
      username: connection.username,
      hasCredential: connection.encryptedCredential !== null,
      useSsl: connection.useSsl,
      options: connection.options,
      lastTestedAt: connection.lastTestedAt,
      lastTestResult: connection.lastTestResult,
      lastTestMessage: connection.lastTestMessage,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
      ownerId: connection.ownerId,
    };
  }

  /**
   * Create audit event
   */
  private async createAuditEvent(
    actorUserId: string,
    action: string,
    targetType: string,
    targetId: string,
    meta: Record<string, unknown>,
  ) {
    await this.prisma.auditEvent.create({
      data: {
        actorUserId,
        action,
        targetType,
        targetId,
        meta: meta as any,
      },
    });
  }
}
