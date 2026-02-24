import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataImportStatus, DataImportRunStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { mkdir, writeFile, readFile, access } from 'fs/promises';
import { join } from 'path';
import { Readable } from 'stream';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';
import {
  STORAGE_PROVIDER,
  StorageProvider,
} from '../storage/providers/storage-provider.interface';
import { encrypt, getEncryptionKey } from '../common/utils/encryption.util';
import { writeParquet } from '../spreadsheet-agent/agent/utils/duckdb-writer';
import { DataImportsParser } from './data-imports.parser';
import { UpdateImportDto } from './dto/update-import.dto';
import { ImportQueryDto } from './dto/import-query.dto';
import { CreateRunDto } from './dto/create-run.dto';
import { RunQueryDto } from './dto/run-query.dto';
import { PreviewRequestDto } from './dto/preview-request.dto';
import {
  DataImportStreamEvent,
  ImportConfig,
  OutputTable,
  ColumnDefinition,
} from './data-imports.types';

// ─── File type constants ─────────────────────────────────────────────────────

const ALLOWED_EXTENSIONS = new Set(['.csv', '.xlsx', '.xls']);
const ALLOWED_MIME_TYPES = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream', // Generic binary, allowed by extension check
]);
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

@Injectable()
export class DataImportsService {
  private readonly logger = new Logger(DataImportsService.name);
  private readonly encryptionKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
    private readonly parser: DataImportsParser,
  ) {
    this.encryptionKey = getEncryptionKey();
  }

  // ─── Upload ──────────────────────────────────────────────────────────────

  /**
   * Upload a CSV or Excel file, auto-parse its structure, and create a
   * DataImport record in draft status.
   */
  async upload(
    file: { buffer: Buffer; filename: string; mimetype: string },
    userId: string,
  ) {
    const { buffer, filename, mimetype } = file;

    // Validate extension
    const ext = this.getExtension(filename);
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new BadRequestException(
        `Unsupported file type '${ext}'. Allowed: .csv, .xlsx, .xls`,
      );
    }

    // Validate MIME type (permissive — extension is the primary guard)
    if (!ALLOWED_MIME_TYPES.has(mimetype)) {
      this.logger.warn(`Unexpected MIME type '${mimetype}' for file '${filename}'`);
    }

    // Validate size
    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `File too large: ${buffer.length} bytes. Max allowed: ${MAX_FILE_SIZE_BYTES} bytes`,
      );
    }

    const importId = randomUUID();

    // Store locally in /tmp for fast subsequent parsing
    const localDir = join('/tmp', 'data-imports', importId, 'source');
    await mkdir(localDir, { recursive: true });
    const localPath = join(localDir, filename);
    await writeFile(localPath, buffer);

    // Upload to S3
    const s3Key = `data-imports/${importId}/source/${filename}`;
    await this.storageProvider.upload(s3Key, Readable.from(buffer), {
      mimeType: mimetype,
    });

    // Determine file type from extension
    const fileType = ext === '.csv' ? 'csv' : 'excel';

    // Auto-parse
    let parseResult: object;
    try {
      if (fileType === 'csv') {
        parseResult = this.parser.parseCsv(buffer);
      } else {
        parseResult = this.parser.parseExcelSheets(buffer);
      }
    } catch (err) {
      this.logger.error(`Failed to parse file '${filename}': ${String(err)}`);
      parseResult = { type: fileType, error: 'Parse failed — review file manually' };
    }

    // Auto-generate name from filename (strip extension)
    const autoName = filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();

    // Create DataImport record
    const dataImport = await this.prisma.dataImport.create({
      data: {
        id: importId,
        name: autoName,
        sourceFileName: filename,
        sourceFileType: fileType,
        sourceFileSizeBytes: BigInt(buffer.length),
        sourceStoragePath: s3Key,
        status: DataImportStatus.draft,
        parseResult: parseResult as object,
        createdByUserId: userId,
      },
    });

    this.logger.log(`Import ${importId} created from file '${filename}'`);
    return dataImport;
  }

  // ─── Retrieval ────────────────────────────────────────────────────────────

  async getById(id: string) {
    const item = await this.prisma.dataImport.findUnique({
      where: { id },
      include: { _count: { select: { runs: true } } },
    });

    if (!item) {
      throw new NotFoundException(`DataImport '${id}' not found`);
    }

    return item;
  }

  async list(query: ImportQueryDto) {
    const { page, pageSize, search, status, sortBy, sortOrder } = query;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sourceFileName: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status) {
      where.status = status;
    }

    const [items, total] = await Promise.all([
      this.prisma.dataImport.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { [sortBy]: sortOrder },
        include: { _count: { select: { runs: true } } },
      }),
      this.prisma.dataImport.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  // ─── Preview ──────────────────────────────────────────────────────────────

  /**
   * Return the auto-detected parse result stored during upload.
   */
  async getPreview(id: string) {
    const item = await this.getById(id);
    return item.parseResult;
  }

  /**
   * Parse a specific Excel sheet range on demand.
   * Reads the source file from local cache or downloads from S3.
   */
  async getSheetPreview(id: string, dto: PreviewRequestDto) {
    const item = await this.getById(id);

    if (item.sourceFileType !== 'excel') {
      throw new BadRequestException('Sheet preview is only available for Excel files');
    }

    const buffer = await this.readSourceFile(item.id, item.sourceFileName, item.sourceStoragePath);

    const result = this.parser.parseExcelRange(
      buffer,
      dto.sheetName,
      dto.range as { startRow: number; startCol: number } | undefined,
      dto.hasHeader,
      dto.limit,
    );

    return result;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateImportDto) {
    await this.getById(id); // ensure exists

    const updateData: Record<string, unknown> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.config !== undefined) {
      updateData.config = dto.config;
      // When config changes, mark as pending (ready to execute)
      updateData.status = DataImportStatus.pending;
    }

    const updated = await this.prisma.dataImport.update({
      where: { id },
      data: updateData,
    });

    return updated;
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async delete(id: string) {
    const item = await this.getById(id);

    // Delete all S3 objects for this import
    try {
      const deleted = await this.storageProvider.deleteByPrefix(`data-imports/${id}/`);
      this.logger.log(`Deleted ${deleted} S3 objects for import ${id}`);
    } catch (err) {
      this.logger.warn(`Failed to delete S3 objects for import ${id}: ${String(err)}`);
    }

    // Delete auto-created connections (derived from outputTables)
    const outputTables = item.outputTables as OutputTable[] | null;
    if (outputTables && outputTables.length > 0) {
      const connectionIds = outputTables
        .map((t) => t.connectionId)
        .filter((cid): cid is string => !!cid);

      for (const connectionId of connectionIds) {
        try {
          await this.prisma.dataConnection.delete({ where: { id: connectionId } });
          this.logger.log(`Deleted connection ${connectionId} for import ${id}`);
        } catch (err) {
          this.logger.warn(`Failed to delete connection ${connectionId}: ${String(err)}`);
        }
      }
    }

    await this.prisma.dataImport.delete({ where: { id } });
    this.logger.log(`DataImport ${id} deleted`);
  }

  // ─── Runs ─────────────────────────────────────────────────────────────────

  async createRun(dto: CreateRunDto, userId: string) {
    const item = await this.getById(dto.importId);

    const allowedStatuses: DataImportStatus[] = [
      DataImportStatus.draft,
      DataImportStatus.pending,
      DataImportStatus.failed,
    ];

    if (!allowedStatuses.includes(item.status)) {
      throw new ConflictException(
        `Import '${dto.importId}' is in status '${item.status}' and cannot be re-run`,
      );
    }

    const run = await this.prisma.dataImportRun.create({
      data: {
        importId: dto.importId,
        status: DataImportRunStatus.pending,
        config: (item.config ?? {}) as object,
        createdByUserId: userId,
      },
    });

    this.logger.log(`Run ${run.id} created for import ${dto.importId}`);
    return run;
  }

  async getRun(runId: string) {
    const run = await this.prisma.dataImportRun.findUnique({ where: { id: runId } });
    if (!run) {
      throw new NotFoundException(`DataImportRun '${runId}' not found`);
    }
    return run;
  }

  async listRuns(importId: string, query: RunQueryDto) {
    // Ensure import exists
    await this.getById(importId);

    const { page, pageSize, status } = query;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { importId };
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      this.prisma.dataImportRun.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.dataImportRun.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async cancelRun(runId: string) {
    const run = await this.getRun(runId);
    const cancellableStatuses: DataImportRunStatus[] = [
      DataImportRunStatus.pending,
      DataImportRunStatus.parsing,
      DataImportRunStatus.converting,
      DataImportRunStatus.uploading,
      DataImportRunStatus.connecting,
    ];

    if (!cancellableStatuses.includes(run.status)) {
      throw new BadRequestException(
        `Run '${runId}' cannot be cancelled in status '${run.status}'`,
      );
    }

    const updated = await this.prisma.dataImportRun.update({
      where: { id: runId },
      data: { status: DataImportRunStatus.cancelled },
    });

    return updated;
  }

  async deleteRun(runId: string) {
    const run = await this.getRun(runId);
    const deletableStatuses: DataImportRunStatus[] = [
      DataImportRunStatus.failed,
      DataImportRunStatus.cancelled,
    ];

    if (!deletableStatuses.includes(run.status)) {
      throw new BadRequestException(
        `Only failed or cancelled runs can be deleted. Run '${runId}' is '${run.status}'`,
      );
    }

    await this.prisma.dataImportRun.delete({ where: { id: runId } });
  }

  /**
   * Atomic transition from pending → parsing.
   * Returns true if this process successfully claimed the run.
   */
  async claimRun(runId: string): Promise<boolean> {
    const result = await this.prisma.dataImportRun.updateMany({
      where: { id: runId, status: DataImportRunStatus.pending },
      data: { status: DataImportRunStatus.parsing, startedAt: new Date() },
    });

    return result.count === 1;
  }

  // ─── Execution pipeline ──────────────────────────────────────────────────

  /**
   * Execute the full import pipeline for a given run.
   * Called from the stream controller after the run has been claimed.
   */
  async executeImport(
    runId: string,
    emitEvent: (event: DataImportStreamEvent) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const emit = (
      type: DataImportStreamEvent['type'],
      data?: unknown,
    ) => {
      emitEvent({ type, data, timestamp: new Date().toISOString() });
    };

    const run = await this.getRun(runId);
    const dataImport = await this.getById(run.importId);
    const importConfig = (dataImport.config ?? {}) as ImportConfig;

    emit('run_start', { runId, importId: dataImport.id, name: dataImport.name });

    try {
      // ── Phase 1: Parsing ────────────────────────────────────────────────
      if (signal.aborted) throw new Error('Cancelled');

      await this.prisma.dataImportRun.update({
        where: { id: runId },
        data: { currentPhase: 'parsing', status: DataImportRunStatus.parsing },
      });
      emit('phase_start', { phase: 'parsing' });

      const buffer = await this.readSourceFile(
        dataImport.id,
        dataImport.sourceFileName,
        dataImport.sourceStoragePath,
      );

      let tables: Array<{
        tableName: string;
        sheetName?: string;
        headerRow: string[];
        rows: unknown[][];
        columns: ColumnDefinition[];
      }>;

      if (dataImport.sourceFileType === 'csv') {
        // CSV → single table
        const parsed = this.parser.parseCsv(buffer, {
          delimiter: importConfig.delimiter,
          hasHeader: importConfig.hasHeader,
          encoding: importConfig.encoding,
          skipRows: importConfig.skipRows,
        });

        // All data rows (not just the 100-row sample) — re-read full file
        const wb = XLSX.read(buffer.toString('utf8').replace(/^\ufeff/, ''), {
          type: 'string',
          FS: parsed.detectedDelimiter,
        });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const allRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: null,
        });
        const dataRows = allRows.slice((importConfig.skipRows ?? 0) + (parsed.hasHeader ? 1 : 0));

        const headerRow = parsed.columns.map((c) => c.name);
        const safeName = this.toSafeIdentifier(dataImport.name) || 'data';

        tables = [
          {
            tableName: safeName,
            headerRow,
            rows: dataRows,
            columns: (importConfig.columns as ColumnDefinition[] | undefined) ?? [],
          },
        ];
      } else {
        // Excel → one table per sheet
        const sheetConfigs = importConfig.sheets ? [...importConfig.sheets] : [];

        if (sheetConfigs.length === 0) {
          // No explicit config — import all sheets
          const parsed = this.parser.parseExcelSheets(buffer);
          for (const sheet of parsed.sheets) {
            const result = this.parser.parseExcelRange(buffer, sheet.name, undefined, true, 99999);
            sheetConfigs.push({
              sheetName: sheet.name,
              hasHeader: true,
              columns: result.detectedTypes.map((t) => ({
                sourceName: t.name,
                outputName: t.name,
                outputType: t.type as ColumnDefinition['outputType'],
                include: true,
              })),
            });
          }
        }

        tables = [];
        for (const sheetConfig of sheetConfigs) {
          const result = this.parser.parseExcelRange(
            buffer,
            sheetConfig.sheetName,
            sheetConfig.range,
            sheetConfig.hasHeader,
            99999,
          );

          const headerRow = result.columns.map((c) => c.name);
          const safeName = this.toSafeIdentifier(sheetConfig.sheetName);

          tables.push({
            tableName: safeName,
            sheetName: sheetConfig.sheetName,
            headerRow,
            rows: result.rows,
            columns: (sheetConfig.columns as ColumnDefinition[] | undefined) ?? [],
          });
        }
      }

      emit('phase_complete', { phase: 'parsing', tableCount: tables.length });

      // ── Phase 2: Converting to Parquet ───────────────────────────────────
      if (signal.aborted) throw new Error('Cancelled');

      await this.prisma.dataImportRun.update({
        where: { id: runId },
        data: { currentPhase: 'converting', status: DataImportRunStatus.converting },
      });
      emit('phase_start', { phase: 'converting', tableCount: tables.length });

      const localParquetDir = join('/tmp', 'data-imports', dataImport.id, 'tables');
      await mkdir(localParquetDir, { recursive: true });

      const convertedTables: Array<{
        tableName: string;
        sheetName?: string;
        localPath: string;
        rowCount: number;
        columns: Array<{ name: string; type: string }>;
      }> = [];

      for (let i = 0; i < tables.length; i++) {
        const table = tables[i];
        if (signal.aborted) throw new Error('Cancelled');

        emit('table_start', {
          tableName: table.tableName,
          index: i,
          total: tables.length,
        });

        try {
          // Apply column overrides / type detection
          const useOverrides = table.columns.length > 0;
          const detectedTypes = useOverrides
            ? []
            : this.parser.detectColumnTypes(table.headerRow, table.rows.slice(0, 100));

          const effectiveColumns: ColumnDefinition[] = useOverrides
            ? table.columns
            : table.headerRow.map((name, idx) => ({
                sourceName: name,
                outputName: name,
                outputType: (detectedTypes[idx]?.type ?? 'VARCHAR') as ColumnDefinition['outputType'],
                include: true,
              }));

          const { columns: writerCols, rows: writerRows } = this.parser.prepareForParquet(
            table.headerRow,
            table.rows,
            effectiveColumns,
          );

          const localPath = join(localParquetDir, `${table.tableName}.parquet`);
          await writeParquet(writerRows, writerCols, localPath);

          const rowCount = writerRows.length;
          convertedTables.push({
            tableName: table.tableName,
            sheetName: table.sheetName,
            localPath,
            rowCount,
            columns: writerCols.map((c) => ({ name: c.outputName, type: c.outputType })),
          });

          emit('table_complete', {
            tableName: table.tableName,
            rowCount,
            index: i,
            total: tables.length,
            percentComplete: Math.round(((i + 1) / tables.length) * 100),
          });
        } catch (tableErr) {
          const msg = tableErr instanceof Error ? tableErr.message : String(tableErr);
          this.logger.error(`Failed converting table '${table.tableName}': ${msg}`);
          emit('table_error', { tableName: table.tableName, error: msg });
          // Continue with remaining tables (partial import)
        }
      }

      emit('phase_complete', { phase: 'converting', convertedCount: convertedTables.length });

      // ── Phase 3: Uploading to S3 ──────────────────────────────────────────
      if (signal.aborted) throw new Error('Cancelled');

      await this.prisma.dataImportRun.update({
        where: { id: runId },
        data: { currentPhase: 'uploading', status: DataImportRunStatus.uploading },
      });
      emit('phase_start', { phase: 'uploading', tableCount: convertedTables.length });

      const uploadedTables: Array<{
        tableName: string;
        sheetName?: string;
        s3Key: string;
        rowCount: number;
        sizeBytes: number;
        columns: Array<{ name: string; type: string }>;
      }> = [];

      for (const ct of convertedTables) {
        if (signal.aborted) throw new Error('Cancelled');

        const parquetBuffer = await readFile(ct.localPath);
        const s3Key = `data-imports/${dataImport.id}/tables/${ct.tableName}.parquet`;

        await this.storageProvider.upload(
          s3Key,
          Readable.from(parquetBuffer),
          { mimeType: 'application/octet-stream' },
        );

        uploadedTables.push({
          tableName: ct.tableName,
          sheetName: ct.sheetName,
          s3Key,
          rowCount: ct.rowCount,
          sizeBytes: parquetBuffer.length,
          columns: ct.columns,
        });
      }

      emit('phase_complete', { phase: 'uploading', uploadedCount: uploadedTables.length });

      // ── Phase 4: Creating S3 connections ─────────────────────────────────
      if (signal.aborted) throw new Error('Cancelled');

      await this.prisma.dataImportRun.update({
        where: { id: runId },
        data: { currentPhase: 'connecting', status: DataImportRunStatus.connecting },
      });
      emit('phase_start', { phase: 'connecting', tableCount: uploadedTables.length });

      const bucket = this.configService.get<string>('storage.s3.bucket') ?? '';
      const region = this.configService.get<string>('storage.s3.region') ?? 'us-east-1';
      const accessKeyId = this.configService.get<string>('storage.s3.accessKeyId') ?? '';
      const secretAccessKey = this.configService.get<string>('storage.s3.secretAccessKey') ?? '';

      // Encrypt the secret access key for storage
      const encryptedCredential = secretAccessKey
        ? encrypt(secretAccessKey, this.encryptionKey)
        : null;

      const outputTables: OutputTable[] = [];

      for (const ut of uploadedTables) {
        const connectionName = `Import: ${dataImport.name} - ${ut.tableName}`;

        const connection = await this.prisma.dataConnection.create({
          data: {
            name: connectionName,
            dbType: 's3',
            host: `s3.${region}.amazonaws.com`,
            port: 443,
            username: accessKeyId || null,
            encryptedCredential,
            options: {
              bucket,
              pathPrefix: `data-imports/${dataImport.id}/tables`,
              region,
              tableName: ut.tableName,
              s3Key: ut.s3Key,
            },
            createdByUserId: run.createdByUserId,
          },
        });

        outputTables.push({
          tableName: ut.tableName,
          sheetName: ut.sheetName,
          s3Key: ut.s3Key,
          rowCount: ut.rowCount,
          sizeBytes: ut.sizeBytes,
          connectionId: connection.id,
          columns: ut.columns,
        });
      }

      emit('phase_complete', { phase: 'connecting', connectionCount: outputTables.length });

      // ── Finalize ──────────────────────────────────────────────────────────
      const totalRowCount = outputTables.reduce((sum, t) => sum + t.rowCount, 0);
      const totalSizeBytes = outputTables.reduce((sum, t) => sum + t.sizeBytes, 0);

      const finalStatus =
        outputTables.length === tables.length
          ? DataImportStatus.ready
          : outputTables.length > 0
          ? DataImportStatus.partial
          : DataImportStatus.failed;

      await this.prisma.dataImport.update({
        where: { id: dataImport.id },
        data: {
          status: finalStatus,
          outputTables: outputTables as unknown as object[],
          totalRowCount: BigInt(totalRowCount),
          totalSizeBytes: BigInt(totalSizeBytes),
          errorMessage: null,
        },
      });

      await this.prisma.dataImportRun.update({
        where: { id: runId },
        data: {
          status: DataImportRunStatus.completed,
          currentPhase: null,
          completedAt: new Date(),
          progress: {
            totalTables: tables.length,
            completedTables: outputTables.length,
            totalRows: totalRowCount,
            totalBytes: totalSizeBytes,
          },
        },
      });

      emit('run_complete', {
        importId: dataImport.id,
        runId,
        status: finalStatus,
        totalTables: outputTables.length,
        totalRows: totalRowCount,
        totalBytes: totalSizeBytes,
      });

      this.logger.log(
        `Import ${dataImport.id} run ${runId} completed: ${outputTables.length}/${tables.length} tables, ${totalRowCount} rows`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isCancelled = message === 'Cancelled' || signal.aborted;

      this.logger.error(`Import run ${runId} failed: ${message}`);

      const failedRunStatus = isCancelled
        ? DataImportRunStatus.cancelled
        : DataImportRunStatus.failed;

      await this.prisma.dataImportRun.update({
        where: { id: runId },
        data: {
          status: failedRunStatus,
          errorMessage: message,
          completedAt: new Date(),
        },
      });

      await this.prisma.dataImport.update({
        where: { id: run.importId },
        data: {
          status: DataImportStatus.failed,
          errorMessage: message,
        },
      });

      emit('run_error', { runId, error: message, cancelled: isCancelled });
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Read the source file from local cache; fall back to downloading from S3.
   */
  private async readSourceFile(
    importId: string,
    filename: string,
    storagePath: string,
  ): Promise<Buffer> {
    const localPath = join('/tmp', 'data-imports', importId, 'source', filename);

    try {
      await access(localPath);
      return readFile(localPath);
    } catch {
      // Not cached — download from S3
      this.logger.log(`Cache miss for ${localPath}, downloading from S3`);
      const stream = await this.storageProvider.download(storagePath);
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', resolve);
        stream.on('error', reject);
      });
      const buffer = Buffer.concat(chunks);

      // Cache locally for subsequent calls
      const dir = join('/tmp', 'data-imports', importId, 'source');
      await mkdir(dir, { recursive: true });
      await writeFile(localPath, buffer);

      return buffer;
    }
  }

  private getExtension(filename: string): string {
    const parts = filename.split('.');
    return parts.length > 1 ? `.${parts.at(-1)!.toLowerCase()}` : '';
  }

  /**
   * Convert a human-readable name to a safe SQL identifier.
   * Keeps alphanumeric chars and underscores, collapses spaces to underscores.
   */
  private toSafeIdentifier(name: string): string {
    return name
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .replace(/^_+|_+$/g, '')
      .slice(0, 63);
  }
}
