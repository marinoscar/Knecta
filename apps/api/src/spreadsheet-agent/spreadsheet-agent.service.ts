import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SpreadsheetRunStatus } from '@prisma/client';
import { createHash } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { extname, join } from 'path';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateProjectDto,
  UpdateProjectDto,
  QueryProjectDto,
  QueryTableDto,
  CreateRunDto,
  ApprovePlanDto,
} from './dto';

/** Allowed spreadsheet MIME types and extensions. */
const ALLOWED_EXTENSIONS = new Set(['.xlsx', '.xls', '.csv', '.tsv', '.ods']);
const ALLOWED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'text/tab-separated-values',
  'application/vnd.oasis.opendocument.spreadsheet',
  // Browsers sometimes send these generic types
  'application/octet-stream',
  'application/csv',
]);

/** Maximum allowed file size: 50 MB. */
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

export interface UploadedFile {
  filename: string;
  mimetype: string;
  file: Readable;
}

@Injectable()
export class SpreadsheetAgentService {
  private readonly logger = new Logger(SpreadsheetAgentService.name);

  private readonly ACTIVE_RUN_STATUSES: SpreadsheetRunStatus[] = [
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
  // Files
  // ---------------------------------------------------------------------------

  /**
   * List all files for a project (no pagination — max 50 files per project).
   */
  async listFiles(projectId: string) {
    await this.requireProject(projectId);

    const items = await this.prisma.spreadsheetFile.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      items: items.map((f) => this.mapFile(f)),
      total: items.length,
    };
  }

  /**
   * Get a single file, verifying it belongs to the given project.
   */
  async getFile(projectId: string, fileId: string) {
    const file = await this.prisma.spreadsheetFile.findUnique({
      where: { id: fileId },
    });

    if (!file || file.projectId !== projectId) {
      throw new NotFoundException(
        `File ${fileId} not found in project ${projectId}`,
      );
    }

    return this.mapFile(file);
  }

  /**
   * Delete a file from a project.
   * Blocked when an active run is in progress for the project.
   */
  async deleteFile(projectId: string, fileId: string, userId: string) {
    const file = await this.prisma.spreadsheetFile.findUnique({
      where: { id: fileId },
    });

    if (!file || file.projectId !== projectId) {
      throw new NotFoundException(
        `File ${fileId} not found in project ${projectId}`,
      );
    }

    const activeRun = await this.prisma.spreadsheetRun.findFirst({
      where: {
        projectId,
        status: { in: this.ACTIVE_RUN_STATUSES },
      },
      select: { id: true },
    });

    if (activeRun) {
      throw new ConflictException(
        'Cannot delete a file while a run is active for this project',
      );
    }

    // CASCADE removes associated tables
    await this.prisma.spreadsheetFile.delete({ where: { id: fileId } });

    // Decrement file count on the project
    await this.prisma.spreadsheetProject.update({
      where: { id: projectId },
      data: { fileCount: { decrement: 1 } },
    });

    await this.createAuditEvent(
      userId,
      'spreadsheet_files:delete',
      'spreadsheet_file',
      fileId,
      { projectId, fileName: file.fileName },
    );

    this.logger.log(
      `File ${fileId} deleted from project ${projectId} by user ${userId}`,
    );
  }

  /**
   * Upload a spreadsheet file and create a SpreadsheetFile record.
   *
   * The file buffer is consumed from the multipart stream, validated, and its
   * SHA-256 hash is computed. No S3 storage occurs in this phase — the
   * storagePath is a logical path that the agent pipeline will use later.
   */
  async uploadFile(
    projectId: string,
    upload: UploadedFile,
    userId: string,
  ) {
    // Verify project exists and fetch its prefix
    const project = await this.prisma.spreadsheetProject.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException(
        `Spreadsheet project with ID ${projectId} not found`,
      );
    }

    const { filename, mimetype, file: stream } = upload;

    // Validate extension
    const ext = extname(filename).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new BadRequestException(
        `File type not allowed. Accepted extensions: ${[...ALLOWED_EXTENSIONS].join(', ')}`,
      );
    }

    // Validate MIME type (browsers may send octet-stream; we allow it for now
    // since the extension check is the primary guard)
    if (!ALLOWED_MIME_TYPES.has(mimetype)) {
      throw new BadRequestException(
        `MIME type not allowed: ${mimetype}`,
      );
    }

    // Buffer the stream so we can compute the hash and check file size
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_FILE_SIZE_BYTES) {
          reject(
            new BadRequestException(
              `File exceeds the maximum allowed size of ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB`,
            ),
          );
        }
        chunks.push(chunk);
      });
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    const buffer = Buffer.concat(chunks);

    // Compute SHA-256 hash
    const fileHash = createHash('sha256').update(buffer).digest('hex');

    // Write the buffer to disk so the agent ingest node can read it later.
    // Path: /tmp/spreadsheet-agent/{projectId}/{fileHash}{ext}
    const storageDir = join('/tmp', 'spreadsheet-agent', projectId);
    mkdirSync(storageDir, { recursive: true });
    const storagePath = join(storageDir, `${fileHash}${ext}`);
    writeFileSync(storagePath, buffer);

    // Determine fileType from extension
    const fileType = ext.replace('.', '').toUpperCase();

    // Persist the file record and increment the project's fileCount atomically
    const [file] = await this.prisma.$transaction([
      this.prisma.spreadsheetFile.create({
        data: {
          projectId,
          fileName: filename,
          fileType,
          fileSizeBytes: BigInt(totalBytes),
          fileHash,
          storagePath,
          status: 'pending',
          storageObjectId: null,
        },
      }),
      this.prisma.spreadsheetProject.update({
        where: { id: projectId },
        data: { fileCount: { increment: 1 } },
      }),
    ]);

    await this.createAuditEvent(
      userId,
      'spreadsheet_files:upload',
      'spreadsheet_file',
      file.id,
      { projectId, fileName: filename, fileSizeBytes: totalBytes },
    );

    this.logger.log(
      `File "${filename}" (${totalBytes} bytes) uploaded to project ${projectId} by user ${userId} — record ${file.id}`,
    );

    return this.mapFile(file);
  }

  // ---------------------------------------------------------------------------
  // Tables
  // ---------------------------------------------------------------------------

  /**
   * List tables for a project with pagination and optional filters.
   */
  async listTables(projectId: string, query: QueryTableDto) {
    await this.requireProject(projectId);

    const { page, pageSize, fileId, status } = query;
    const skip = (page - 1) * pageSize;

    const where: any = { projectId };
    if (fileId) where.fileId = fileId;
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      this.prisma.spreadsheetTable.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          file: {
            select: { fileName: true },
          },
        },
      }),
      this.prisma.spreadsheetTable.count({ where }),
    ]);

    return {
      items: items.map((t) => this.mapTable(t)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Get a single table, verifying it belongs to the given project.
   */
  async getTable(projectId: string, tableId: string) {
    const table = await this.prisma.spreadsheetTable.findUnique({
      where: { id: tableId },
      include: {
        file: {
          select: { fileName: true },
        },
      },
    });

    if (!table || table.projectId !== projectId) {
      throw new NotFoundException(
        `Table ${tableId} not found in project ${projectId}`,
      );
    }

    return this.mapTable(table);
  }

  /**
   * Return a preview of rows from a ready table.
   * TODO: Implement DuckDB-based Parquet preview in Phase 4.
   */
  async getTablePreview(projectId: string, tableId: string, limit: number) {
    const table = await this.prisma.spreadsheetTable.findUnique({
      where: { id: tableId },
    });

    if (!table || table.projectId !== projectId) {
      throw new NotFoundException(
        `Table ${tableId} not found in project ${projectId}`,
      );
    }

    if (table.status !== 'ready') {
      throw new ConflictException(
        `Table ${tableId} is not ready for preview (status: ${table.status})`,
      );
    }

    // TODO: Implement DuckDB-based Parquet preview in Phase 4
    return {
      columns: [] as string[],
      rows: [] as Record<string, unknown>[],
      rowCount: 0,
      totalRows: Number(table.rowCount),
    };
  }

  /**
   * Return a signed download URL for a ready table's Parquet output.
   * TODO: Implement signed URL generation via StorageProvider.
   */
  async getTableDownloadUrl(projectId: string, tableId: string) {
    const table = await this.prisma.spreadsheetTable.findUnique({
      where: { id: tableId },
    });

    if (!table || table.projectId !== projectId) {
      throw new NotFoundException(
        `Table ${tableId} not found in project ${projectId}`,
      );
    }

    if (table.status !== 'ready') {
      throw new ConflictException(
        `Table ${tableId} is not ready for download (status: ${table.status})`,
      );
    }

    // TODO: Implement signed URL generation via StorageProvider
    return {
      downloadUrl: '',
      expiresAt: '',
      fileName: `${table.tableName}.parquet`,
      sizeBytes: Number(table.outputSizeBytes),
    };
  }

  /**
   * Delete a table record and update project aggregate stats.
   */
  async deleteTable(projectId: string, tableId: string, userId: string) {
    const table = await this.prisma.spreadsheetTable.findUnique({
      where: { id: tableId },
    });

    if (!table || table.projectId !== projectId) {
      throw new NotFoundException(
        `Table ${tableId} not found in project ${projectId}`,
      );
    }

    await this.prisma.spreadsheetTable.delete({ where: { id: tableId } });

    // Decrement aggregate stats on the project
    await this.prisma.spreadsheetProject.update({
      where: { id: projectId },
      data: {
        tableCount: { decrement: 1 },
        totalRows: { decrement: table.rowCount },
        totalSizeBytes: { decrement: table.outputSizeBytes },
      },
    });

    await this.createAuditEvent(
      userId,
      'spreadsheet_tables:delete',
      'spreadsheet_table',
      tableId,
      { projectId, tableName: table.tableName },
    );

    this.logger.log(
      `Table ${tableId} deleted from project ${projectId} by user ${userId}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Runs
  // ---------------------------------------------------------------------------

  /**
   * Create a new agent run for a project.
   * Requires at least one uploaded file and no active run already in progress.
   */
  async createRun(dto: CreateRunDto, userId: string) {
    // Verify project exists
    await this.requireProject(dto.projectId);

    // Verify at least one file is present
    const fileCount = await this.prisma.spreadsheetFile.count({
      where: { projectId: dto.projectId },
    });

    if (fileCount === 0) {
      throw new ConflictException(
        'Cannot start a run: the project has no uploaded files',
      );
    }

    // Verify no active run is already running
    const activeRun = await this.prisma.spreadsheetRun.findFirst({
      where: {
        projectId: dto.projectId,
        status: { in: this.ACTIVE_RUN_STATUSES },
      },
      select: { id: true },
    });

    if (activeRun) {
      throw new ConflictException(
        `An active run (${activeRun.id}) is already in progress for this project`,
      );
    }

    const run = await this.prisma.spreadsheetRun.create({
      data: {
        projectId: dto.projectId,
        config: dto.config ?? {},
        createdByUserId: userId,
      },
    });

    await this.createAuditEvent(
      userId,
      'spreadsheet_runs:create',
      'spreadsheet_run',
      run.id,
      { projectId: dto.projectId },
    );

    this.logger.log(`Spreadsheet run ${run.id} created by user ${userId}`);

    return this.mapRun(run);
  }

  /**
   * Get a run by ID.
   */
  async getRun(runId: string) {
    const run = await this.prisma.spreadsheetRun.findUnique({
      where: { id: runId },
    });

    if (!run) {
      throw new NotFoundException(`Spreadsheet run with ID ${runId} not found`);
    }

    return this.mapRun(run);
  }

  /**
   * Cancel an active or pending run.
   */
  async cancelRun(runId: string, userId: string) {
    const run = await this.prisma.spreadsheetRun.findUnique({
      where: { id: runId },
    });

    if (!run) {
      throw new NotFoundException(`Spreadsheet run with ID ${runId} not found`);
    }

    const nonCancellableStatuses = ['completed', 'failed', 'cancelled'];
    if (nonCancellableStatuses.includes(run.status)) {
      throw new BadRequestException(
        `Cannot cancel run with status '${run.status}'. Only active or pending runs can be cancelled.`,
      );
    }

    const updated = await this.prisma.spreadsheetRun.update({
      where: { id: runId },
      data: { status: 'cancelled' },
    });

    await this.createAuditEvent(
      userId,
      'spreadsheet_runs:cancel',
      'spreadsheet_run',
      runId,
      { previousStatus: run.status },
    );

    this.logger.log(`Spreadsheet run ${runId} cancelled by user ${userId}`);

    return this.mapRun(updated);
  }

  /**
   * Approve (or modify) an extraction plan and reset the run to pending
   * so the agent can proceed with extraction.
   */
  async approvePlan(runId: string, dto: ApprovePlanDto, userId: string) {
    const run = await this.prisma.spreadsheetRun.findUnique({
      where: { id: runId },
    });

    if (!run) {
      throw new NotFoundException(`Spreadsheet run with ID ${runId} not found`);
    }

    if (run.status !== 'review_pending') {
      throw new BadRequestException(
        `Cannot approve plan for run with status '${run.status}'. Run must be in 'review_pending' state.`,
      );
    }

    const updated = await this.prisma.spreadsheetRun.update({
      where: { id: runId },
      data: {
        extractionPlanModified: (dto.modifications ?? null) as any,
        status: 'pending' as SpreadsheetRunStatus,
      },
    });

    await this.createAuditEvent(
      userId,
      'spreadsheet_runs:approve_plan',
      'spreadsheet_run',
      runId,
      { hasModifications: (dto.modifications?.length ?? 0) > 0 },
    );

    this.logger.log(`Spreadsheet run ${runId} plan approved by user ${userId}`);

    return this.mapRun(updated);
  }

  /**
   * List all runs across all projects with pagination and optional status filter.
   */
  async listAllRuns(opts: { page?: number; pageSize?: number; status?: string }) {
    const { page = 1, pageSize = 20, status } = opts;
    const skip = (page - 1) * pageSize;
    const where: any = {};
    if (status) where.status = status;

    const [runs, total] = await Promise.all([
      this.prisma.spreadsheetRun.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          project: { select: { id: true, name: true } },
        },
      }),
      this.prisma.spreadsheetRun.count({ where }),
    ]);

    return {
      runs: runs.map((run) => ({
        ...this.mapRun(run),
        project: run.project,
      })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * List runs for a specific project with pagination and optional status filter.
   */
  async listProjectRuns(
    projectId: string,
    opts: { page?: number; pageSize?: number; status?: string },
  ) {
    await this.requireProject(projectId);

    const { page = 1, pageSize = 20, status } = opts;
    const skip = (page - 1) * pageSize;
    const where: any = { projectId };
    if (status) where.status = status;

    const [runs, total] = await Promise.all([
      this.prisma.spreadsheetRun.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.spreadsheetRun.count({ where }),
    ]);

    return {
      runs: runs.map((run) => this.mapRun(run)),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Delete a failed or cancelled run.
   */
  async deleteRun(runId: string, userId: string) {
    const run = await this.prisma.spreadsheetRun.findUnique({
      where: { id: runId },
    });

    if (!run) {
      throw new NotFoundException(`Spreadsheet run with ID ${runId} not found`);
    }

    if (!['failed', 'cancelled'].includes(run.status)) {
      throw new BadRequestException(
        'Only failed or cancelled runs can be deleted',
      );
    }

    await this.prisma.spreadsheetRun.delete({ where: { id: runId } });

    await this.createAuditEvent(
      userId,
      'spreadsheet_run:delete',
      'spreadsheet_run',
      runId,
      { status: run.status },
    );

    this.logger.log(`Spreadsheet run ${runId} deleted by user ${userId}`);
  }

  /**
   * Atomically claim a pending run for execution (pending → ingesting).
   * Returns true if this caller claimed it; false if already claimed by another process.
   */
  async claimRun(runId: string): Promise<boolean> {
    const result = await this.prisma.spreadsheetRun.updateMany({
      where: { id: runId, status: 'pending' },
      data: {
        status: 'ingesting',
        startedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    return result.count > 0;
  }

  /**
   * Persist run progress JSON (phase progress, table statuses, etc.).
   */
  async updateRunProgress(runId: string, progress: any) {
    await this.prisma.spreadsheetRun.update({
      where: { id: runId },
      data: { progress: progress as any },
    });
  }

  /**
   * Update run status and optional metadata fields.
   */
  async updateRunStatus(
    runId: string,
    status: string,
    data?: {
      currentPhase?: string;
      errorMessage?: string;
      stats?: any;
      completedAt?: Date;
      extractionPlan?: any;
    },
  ) {
    await this.prisma.spreadsheetRun.update({
      where: { id: runId },
      data: {
        status: status as SpreadsheetRunStatus,
        ...(data?.currentPhase !== undefined && { currentPhase: data.currentPhase }),
        ...(data?.errorMessage !== undefined && { errorMessage: data.errorMessage }),
        ...(data?.stats !== undefined && { stats: data.stats }),
        ...(data?.completedAt !== undefined && { completedAt: data.completedAt }),
        ...(data?.extractionPlan !== undefined && { extractionPlan: data.extractionPlan }),
      },
    });
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
    const stats = run.stats as Record<string, any> | null;
    const tokensUsed = stats?.tokensUsed ?? null;
    return {
      ...run,
      tokensUsed: tokensUsed
        ? {
            prompt: Number(tokensUsed.prompt ?? 0),
            completion: Number(tokensUsed.completion ?? 0),
            total: Number(tokensUsed.total ?? 0),
          }
        : { prompt: 0, completion: 0, total: 0 },
    };
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
