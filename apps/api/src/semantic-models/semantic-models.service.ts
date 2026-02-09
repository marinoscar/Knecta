import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ModelQueryDto } from './dto/model-query.dto';
import { UpdateModelDto } from './dto/update-model.dto';
import { CreateRunDto } from './dto/create-run.dto';
import * as yaml from 'js-yaml';

@Injectable()
export class SemanticModelsService {
  private readonly logger = new Logger(SemanticModelsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * List semantic models with pagination and filtering
   */
  async list(query: ModelQueryDto, userId: string) {
    const { page, pageSize, search, status, connectionId, sortBy, sortOrder } = query;
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

    if (status) {
      where.status = status;
    }

    if (connectionId) {
      where.connectionId = connectionId;
    }

    // Execute query
    const [items, total] = await Promise.all([
      this.prisma.semanticModel.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { [sortBy]: sortOrder },
        include: {
          connection: {
            select: {
              name: true,
              dbType: true,
            },
          },
        },
      }),
      this.prisma.semanticModel.count({ where }),
    ]);

    return {
      items: items.map((model) => this.mapModel(model)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Get semantic model by ID
   */
  async getById(id: string, userId: string) {
    const model = await this.prisma.semanticModel.findFirst({
      where: {
        id,
        ownerId: userId,
      },
      include: {
        connection: {
          select: {
            name: true,
            dbType: true,
          },
        },
      },
    });

    if (!model) {
      throw new NotFoundException(`Semantic model with ID ${id} not found`);
    }

    return this.mapModel(model);
  }

  /**
   * Update a semantic model
   */
  async update(id: string, dto: UpdateModelDto, userId: string) {
    // Verify ownership
    const existing = await this.prisma.semanticModel.findFirst({
      where: {
        id,
        ownerId: userId,
      },
    });

    if (!existing) {
      throw new NotFoundException(`Semantic model with ID ${id} not found`);
    }

    // Update model
    const model = await this.prisma.semanticModel.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
      },
      include: {
        connection: {
          select: {
            name: true,
            dbType: true,
          },
        },
      },
    });

    // Create audit event
    await this.createAuditEvent(
      userId,
      'semantic_models:update',
      'semantic_model',
      model.id,
      { name: model.name },
    );

    this.logger.log(`Semantic model ${model.name} updated by user ${userId}`);

    return this.mapModel(model);
  }

  /**
   * Delete a semantic model
   */
  async delete(id: string, userId: string) {
    // Verify ownership
    const model = await this.prisma.semanticModel.findFirst({
      where: {
        id,
        ownerId: userId,
      },
    });

    if (!model) {
      throw new NotFoundException(`Semantic model with ID ${id} not found`);
    }

    // Delete model (cascade will delete runs)
    await this.prisma.semanticModel.delete({
      where: { id },
    });

    // Create audit event
    await this.createAuditEvent(
      userId,
      'semantic_models:delete',
      'semantic_model',
      id,
      { name: model.name },
    );

    this.logger.log(`Semantic model ${model.name} deleted by user ${userId}`);
  }

  /**
   * Export semantic model as YAML
   */
  async exportYaml(id: string, userId: string) {
    // Get model
    const model = await this.getById(id, userId);

    if (!model.model) {
      throw new BadRequestException('Semantic model has no data to export');
    }

    // Convert JSON to YAML
    const yamlString = yaml.dump(model.model);

    return {
      yaml: yamlString,
      name: model.name,
    };
  }

  /**
   * List runs for a semantic model
   */
  async listRuns(modelId: string, userId: string) {
    // Verify model ownership
    const model = await this.prisma.semanticModel.findFirst({
      where: {
        id: modelId,
        ownerId: userId,
      },
    });

    if (!model) {
      throw new NotFoundException(`Semantic model with ID ${modelId} not found`);
    }

    // Get runs
    const runs = await this.prisma.semanticModelRun.findMany({
      where: {
        semanticModelId: modelId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return runs.map((run) => this.mapRun(run));
  }

  /**
   * Create a new semantic model run
   */
  async createRun(dto: CreateRunDto, userId: string) {
    // Verify connection exists and is owned by user
    const connection = await this.prisma.dataConnection.findFirst({
      where: {
        id: dto.connectionId,
        ownerId: userId,
      },
    });

    if (!connection) {
      throw new NotFoundException(`Connection with ID ${dto.connectionId} not found`);
    }

    // Create run
    const run = await this.prisma.semanticModelRun.create({
      data: {
        connectionId: dto.connectionId,
        databaseName: dto.databaseName,
        selectedSchemas: dto.selectedSchemas,
        selectedTables: dto.selectedTables,
        name: dto.name,
        instructions: dto.instructions,
        status: 'pending',
        ownerId: userId,
      },
    });

    // Create audit event
    await this.createAuditEvent(
      userId,
      'semantic_models:run:create',
      'semantic_model_run',
      run.id,
      { connectionId: dto.connectionId, databaseName: dto.databaseName },
    );

    this.logger.log(`Semantic model run ${run.id} created by user ${userId}`);

    return this.mapRun(run);
  }

  /**
   * Get a semantic model run by ID
   */
  async getRun(runId: string, userId: string) {
    const run = await this.prisma.semanticModelRun.findFirst({
      where: {
        id: runId,
        ownerId: userId,
      },
    });

    if (!run) {
      throw new NotFoundException(`Semantic model run with ID ${runId} not found`);
    }

    return this.mapRun(run);
  }

  /**
   * Update a semantic model run status
   */
  async updateRunStatus(
    runId: string,
    userId: string,
    status: string,
    errorMessage?: string,
  ) {
    const run = await this.prisma.semanticModelRun.findFirst({
      where: { id: runId, ownerId: userId },
    });

    if (!run) {
      throw new NotFoundException(`Semantic model run with ID ${runId} not found`);
    }

    const data: Record<string, any> = { status };
    if (status === 'executing') {
      data.startedAt = new Date();
    }
    if (status === 'failed') {
      data.completedAt = new Date();
      if (errorMessage) {
        data.errorMessage = errorMessage;
      }
    }

    const updatedRun = await this.prisma.semanticModelRun.update({
      where: { id: runId },
      data,
    });

    return this.mapRun(updatedRun);
  }

  /**
   * Atomically claim a run for execution (pending → executing).
   * Returns true if this request claimed it, false if another request already did.
   */
  async claimRun(runId: string, userId: string): Promise<boolean> {
    const result = await this.prisma.semanticModelRun.updateMany({
      where: { id: runId, ownerId: userId, status: 'pending' },
      data: { status: 'executing', startedAt: new Date(), updatedAt: new Date() },
    });
    return result.count > 0;
  }

  /**
   * Update run progress (current step, step history, token usage).
   * Called during agent execution to track progress in the database.
   */
  async updateRunProgress(runId: string, progress: Record<string, unknown>) {
    await this.prisma.semanticModelRun.update({
      where: { id: runId },
      data: { progress: progress as any },
    });
  }

  /**
   * Cancel a semantic model run
   */
  async cancelRun(runId: string, userId: string) {
    // Verify ownership
    const run = await this.prisma.semanticModelRun.findFirst({
      where: {
        id: runId,
        ownerId: userId,
      },
    });

    if (!run) {
      throw new NotFoundException(`Semantic model run with ID ${runId} not found`);
    }

    // Check if cancellable
    const cancellableStatuses = ['pending', 'planning', 'executing'];
    if (!cancellableStatuses.includes(run.status)) {
      throw new BadRequestException(
        `Cannot cancel run with status '${run.status}'. Only pending, planning, and executing runs can be cancelled.`,
      );
    }

    // Update status
    const updatedRun = await this.prisma.semanticModelRun.update({
      where: { id: runId },
      data: {
        status: 'cancelled',
      },
    });

    // Create audit event
    await this.createAuditEvent(
      userId,
      'semantic_models:run:cancel',
      'semantic_model_run',
      runId,
      { status: run.status },
    );

    this.logger.log(`Semantic model run ${runId} cancelled by user ${userId}`);

    return this.mapRun(updatedRun);
  }

  /**
   * List all runs for a user (paginated)
   */
  async listAllRuns(
    userId: string,
    opts: { page?: number; pageSize?: number; status?: string },
  ) {
    const { page = 1, pageSize = 20, status } = opts;
    const skip = (page - 1) * pageSize;
    const where: any = { ownerId: userId };
    if (status) where.status = status;

    const [runs, total] = await Promise.all([
      this.prisma.semanticModelRun.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          semanticModel: { select: { id: true, name: true } },
        },
      }),
      this.prisma.semanticModelRun.count({ where }),
    ]);

    return {
      runs: runs.map((run) => ({
        ...this.mapRun(run),
        semanticModel: run.semanticModel,
      })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Delete a semantic model run (only failed or cancelled)
   */
  async deleteRun(runId: string, userId: string) {
    const run = await this.prisma.semanticModelRun.findFirst({
      where: { id: runId, ownerId: userId },
    });
    if (!run) {
      throw new NotFoundException('Run not found');
    }
    if (!['failed', 'cancelled'].includes(run.status)) {
      throw new BadRequestException('Only failed or cancelled runs can be deleted');
    }
    await this.prisma.semanticModelRun.delete({ where: { id: runId } });

    // Create audit event
    await this.createAuditEvent(
      userId,
      'semantic_models:run:delete',
      'semantic_model_run',
      runId,
      { status: run.status },
    );

    this.logger.log(`Semantic model run ${runId} deleted by user ${userId}`);
  }

  /**
   * Map Prisma semantic model to API response
   */
  private mapModel(model: any) {
    return {
      id: model.id,
      name: model.name,
      description: model.description,
      connectionId: model.connectionId,
      connection: model.connection
        ? { name: model.connection.name, dbType: model.connection.dbType }
        : null,
      databaseName: model.databaseName,
      status: model.status,
      model: model.model,
      modelVersion: model.modelVersion,
      tableCount: model.tableCount,
      fieldCount: model.fieldCount,
      relationshipCount: model.relationshipCount,
      metricCount: model.metricCount,
      ownerId: model.ownerId,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
    };
  }

  /**
   * Map Prisma semantic model run to API response
   */
  private mapRun(run: any) {
    return {
      id: run.id,
      semanticModelId: run.semanticModelId,
      connectionId: run.connectionId,
      databaseName: run.databaseName,
      selectedSchemas: run.selectedSchemas,
      selectedTables: run.selectedTables,
      name: run.name,
      instructions: run.instructions,
      status: run.status,
      plan: run.plan,
      progress: run.progress,
      errorMessage: run.errorMessage,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      ownerId: run.ownerId,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
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
