import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateProjectDto,
  UpdateProjectDto,
  QueryProjectDto,
  QueryTableDto,
  CreateRunDto,
  ApprovePlanDto,
} from './dto';

@Injectable()
export class SpreadsheetAgentService {
  private readonly logger = new Logger(SpreadsheetAgentService.name);

  private readonly ACTIVE_RUN_STATUSES = [
    'pending',
    'ingesting',
    'analyzing',
    'designing',
    'extracting',
    'validating',
    'persisting',
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // Projects
  // ---------------------------------------------------------------------------

  /**
   * List projects with pagination, search, and filtering.
   */
  async listProjects(query: QueryProjectDto) {
    const { page, pageSize, search, status, sortBy, sortOrder } = query;
    const skip = (page - 1) * pageSize;

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status) {
      where.status = status;
    }

    const [items, total] = await Promise.all([
      this.prisma.spreadsheetProject.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.spreadsheetProject.count({ where }),
    ]);

    return {
      items: items.map((p) => this.mapProject(p)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Get a single project by ID.
   */
  async getProject(id: string) {
    const project = await this.prisma.spreadsheetProject.findUnique({
      where: { id },
    });

    if (!project) {
      throw new NotFoundException(`Spreadsheet project with ID ${id} not found`);
    }

    return this.mapProject(project);
  }

  /**
   * Create a new spreadsheet project.
   */
  async createProject(dto: CreateProjectDto, userId: string) {
    const bucket =
      this.configService.get<string>('storage.s3.bucket') ?? '';

    // Create the project record first to obtain the generated ID
    const project = await this.prisma.spreadsheetProject.create({
      data: {
        name: dto.name,
        description: dto.description,
        storageProvider: dto.storageProvider,
        reviewMode: dto.reviewMode ?? 'review',
        outputBucket: bucket,
        outputPrefix: '', // will be patched below once we have the ID
        createdByUserId: userId,
      },
    });

    // Patch the prefix now that we have the ID
    const outputPrefix = `spreadsheet-agent/${project.id}`;
    const updated = await this.prisma.spreadsheetProject.update({
      where: { id: project.id },
      data: { outputPrefix },
    });

    await this.createAuditEvent(
      userId,
      'spreadsheet_projects:create',
      'spreadsheet_project',
      project.id,
      { name: project.name },
    );

    this.logger.log(
      `Spreadsheet project ${project.name} (${project.id}) created by user ${userId}`,
    );

    return this.mapProject(updated);
  }

  /**
   * Update allowed mutable fields on a project.
   */
  async updateProject(id: string, dto: UpdateProjectDto, userId: string) {
    const existing = await this.prisma.spreadsheetProject.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Spreadsheet project with ID ${id} not found`);
    }

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.reviewMode !== undefined) data.reviewMode = dto.reviewMode;

    const updated = await this.prisma.spreadsheetProject.update({
      where: { id },
      data,
    });

    await this.createAuditEvent(
      userId,
      'spreadsheet_projects:update',
      'spreadsheet_project',
      id,
      { name: updated.name },
    );

    this.logger.log(`Spreadsheet project ${id} updated by user ${userId}`);

    return this.mapProject(updated);
  }

  /**
   * Delete a project. CASCADE removes files, tables, and runs.
   */
  async deleteProject(id: string, userId: string) {
    const existing = await this.prisma.spreadsheetProject.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Spreadsheet project with ID ${id} not found`);
    }

    await this.prisma.spreadsheetProject.delete({ where: { id } });

    await this.createAuditEvent(
      userId,
      'spreadsheet_projects:delete',
      'spreadsheet_project',
      id,
      { name: existing.name },
    );

    this.logger.log(`Spreadsheet project ${id} deleted by user ${userId}`);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Assert a project exists, throwing NotFoundException if absent.
   */
  private async requireProject(projectId: string) {
    const project = await this.prisma.spreadsheetProject.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException(
        `Spreadsheet project with ID ${projectId} not found`,
      );
    }
  }

  private mapProject(project: any) {
    return {
      ...project,
      totalRows: Number(project.totalRows),
      totalSizeBytes: Number(project.totalSizeBytes),
    };
  }

  private mapFile(file: any) {
    return {
      ...file,
      fileSizeBytes: Number(file.fileSizeBytes),
    };
  }

  private mapTable(table: any) {
    return {
      ...table,
      rowCount: Number(table.rowCount),
      outputSizeBytes: Number(table.outputSizeBytes),
    };
  }

  private mapRun(run: any) {
    return { ...run };
  }

  private async createAuditEvent(
    userId: string,
    action: string,
    targetType: string,
    targetId: string,
    meta?: any,
  ) {
    await this.prisma.auditEvent.create({
      data: {
        actorUserId: userId,
        action,
        targetType,
        targetId,
        meta: meta ?? {},
      },
    });
  }
}
