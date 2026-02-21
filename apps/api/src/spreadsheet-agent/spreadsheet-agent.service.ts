import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSpreadsheetRunDto } from './dto/create-run.dto';
import { RunQueryDto } from './dto/run-query.dto';

@Injectable()
export class SpreadsheetAgentService {
  private readonly logger = new Logger(SpreadsheetAgentService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new spreadsheet processing run
   */
  async createRun(dto: CreateSpreadsheetRunDto, userId: string) {
    // Validate that all storage objects exist and are ready
    const objects = await this.prisma.storageObject.findMany({
      where: { id: { in: dto.storageObjectIds } },
      select: { id: true, status: true, name: true },
    });

    if (objects.length !== dto.storageObjectIds.length) {
      throw new NotFoundException('One or more storage objects not found');
    }

    const notReady = objects.filter(o => o.status !== 'ready');
    if (notReady.length > 0) {
      throw new BadRequestException(
        `Storage objects not ready: ${notReady.map(o => o.name).join(', ')}`,
      );
    }

    const run = await this.prisma.spreadsheetRun.create({
      data: {
        name: dto.name,
        storageObjectIds: dto.storageObjectIds,
        instructions: dto.instructions,
        status: 'pending',
        createdByUserId: userId,
      },
    });

    await this.createAuditEvent(
      userId,
      'spreadsheet_agent:run:create',
      'spreadsheet_run',
      run.id,
      { name: dto.name, fileCount: dto.storageObjectIds.length },
    );

    this.logger.log(`Spreadsheet run ${run.id} created by user ${userId}`);
    return this.mapRun(run);
  }

  /**
   * List runs with pagination and filtering
   */
  async listRuns(query: RunQueryDto, userId?: string) {
    const { page, pageSize, status, search, sortBy, sortOrder } = query;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (status) where.status = status;
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const [items, total] = await Promise.all([
      this.prisma.spreadsheetRun.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { [sortBy]: sortOrder },
        include: { tables: { select: { id: true, tableName: true, status: true } } },
      }),
      this.prisma.spreadsheetRun.count({ where }),
    ]);

    return {
      items: items.map(r => this.mapRun(r)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Get run by ID with tables
   */
  async getRun(runId: string) {
    const run = await this.prisma.spreadsheetRun.findUnique({
      where: { id: runId },
      include: { tables: true },
    });

    if (!run) {
      throw new NotFoundException(`Spreadsheet run with ID ${runId} not found`);
    }

    return this.mapRun(run);
  }

  /**
   * Atomically claim a run for execution (pending → executing)
   */
  async claimRun(runId: string): Promise<boolean> {
    const result = await this.prisma.spreadsheetRun.updateMany({
      where: { id: runId, status: 'pending' },
      data: { status: 'executing', startedAt: new Date(), updatedAt: new Date() },
    });
    return result.count > 0;
  }

  /**
   * Update run status
   */
  async updateRunStatus(runId: string, status: string, errorMessage?: string) {
    const data: Record<string, any> = { status };
    if (status === 'executing') data.startedAt = new Date();
    if (status === 'completed' || status === 'failed') {
      data.completedAt = new Date();
    }
    if (errorMessage) data.errorMessage = errorMessage;

    return this.prisma.spreadsheetRun.update({
      where: { id: runId },
      data,
    });
  }

  /**
   * Update run progress
   */
  async updateRunProgress(runId: string, progress: Record<string, unknown>) {
    await this.prisma.spreadsheetRun.update({
      where: { id: runId },
      data: { progress: progress as any },
    });
  }

  /**
   * Update run stats after completion
   */
  async updateRunStats(
    runId: string,
    stats: { tableCount: number; totalRows: bigint; totalSizeBytes: bigint; s3OutputPrefix: string },
  ) {
    await this.prisma.spreadsheetRun.update({
      where: { id: runId },
      data: {
        tableCount: stats.tableCount,
        totalRows: stats.totalRows,
        totalSizeBytes: stats.totalSizeBytes,
        s3OutputPrefix: stats.s3OutputPrefix,
      },
    });
  }

  /**
   * Create a spreadsheet table record
   */
  async createTable(data: {
    runId: string;
    sourceFile: string;
    sourceSheet: string;
    tableName: string;
    schema: any;
    rowCount: bigint;
    sizeBytes: bigint;
    storageKey: string;
    status: 'ready' | 'failed';
    errorMessage?: string;
    metadata?: any;
  }) {
    return this.prisma.spreadsheetTable.create({ data: data as any });
  }

  /**
   * Cancel a run
   */
  async cancelRun(runId: string, userId: string) {
    const run = await this.prisma.spreadsheetRun.findUnique({
      where: { id: runId },
    });

    if (!run) {
      throw new NotFoundException(`Spreadsheet run with ID ${runId} not found`);
    }

    const cancellableStatuses = ['pending', 'executing'];
    if (!cancellableStatuses.includes(run.status)) {
      throw new BadRequestException(
        `Cannot cancel run with status '${run.status}'.`,
      );
    }

    const updated = await this.prisma.spreadsheetRun.update({
      where: { id: runId },
      data: { status: 'cancelled' },
    });

    await this.createAuditEvent(
      userId,
      'spreadsheet_agent:run:cancel',
      'spreadsheet_run',
      runId,
      { status: run.status },
    );

    this.logger.log(`Spreadsheet run ${runId} cancelled by user ${userId}`);
    return this.mapRun(updated);
  }

  /**
   * Delete a run (only failed or cancelled)
   */
  async deleteRun(runId: string, userId: string) {
    const run = await this.prisma.spreadsheetRun.findUnique({
      where: { id: runId },
    });

    if (!run) {
      throw new NotFoundException(`Spreadsheet run with ID ${runId} not found`);
    }

    if (!['failed', 'cancelled'].includes(run.status)) {
      throw new BadRequestException('Only failed or cancelled runs can be deleted');
    }

    await this.prisma.spreadsheetRun.delete({ where: { id: runId } });

    await this.createAuditEvent(
      userId,
      'spreadsheet_agent:run:delete',
      'spreadsheet_run',
      runId,
      { status: run.status },
    );

    this.logger.log(`Spreadsheet run ${runId} deleted by user ${userId}`);
  }

  /**
   * Get tables for a run
   */
  async getRunTables(runId: string) {
    const run = await this.prisma.spreadsheetRun.findUnique({
      where: { id: runId },
    });

    if (!run) {
      throw new NotFoundException(`Spreadsheet run with ID ${runId} not found`);
    }

    return this.prisma.spreadsheetTable.findMany({
      where: { runId },
      orderBy: { createdAt: 'asc' },
    });
  }

  private mapRun(run: any) {
    return {
      id: run.id,
      name: run.name,
      status: run.status,
      storageObjectIds: run.storageObjectIds,
      s3OutputPrefix: run.s3OutputPrefix,
      plan: run.plan,
      progress: run.progress,
      errorMessage: run.errorMessage,
      tableCount: run.tableCount,
      totalRows: run.totalRows?.toString() ?? '0',
      totalSizeBytes: run.totalSizeBytes?.toString() ?? '0',
      instructions: run.instructions,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      createdByUserId: run.createdByUserId,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      tables: run.tables?.map((t: any) => ({
        id: t.id,
        runId: t.runId,
        sourceFile: t.sourceFile,
        sourceSheet: t.sourceSheet,
        tableName: t.tableName,
        schema: t.schema,
        rowCount: t.rowCount?.toString() ?? '0',
        sizeBytes: t.sizeBytes?.toString() ?? '0',
        storageKey: t.storageKey,
        status: t.status,
        errorMessage: t.errorMessage,
        metadata: t.metadata,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
    };
  }

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
