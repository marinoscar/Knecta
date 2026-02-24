import { readFileSync, statSync, createReadStream, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { SpreadsheetAgentStateType } from '../state';
import { ExtractionPlan, ExtractionResult, PlanModification } from '../types';
import { EmitFn } from '../graph';
import { StorageProvider } from '../../../storage/providers/storage-provider.interface';
import { applyColumnTransformations } from '../utils/type-coercion';
import { writeParquet } from '../utils/duckdb-writer';
import { ensureLocalFile } from '../utils/ensure-local-file';

const logger = new Logger('ExtractNode');

// ─── Node factory ───

export function createExtractNode(emit: EmitFn, storageProvider: StorageProvider) {
  return async (
    state: SpreadsheetAgentStateType,
  ): Promise<Partial<SpreadsheetAgentStateType>> => {
    emit({ type: 'phase_start', phase: 'extract', label: 'Extracting tables' });

    const { extractionPlan, planModifications, config } = state;

    if (!extractionPlan) {
      logger.error('Extract node called without an extraction plan');
      emit({ type: 'phase_complete', phase: 'extract' });
      return {
        currentPhase: 'extract',
        extractionResults: [],
        error: 'No extraction plan available',
      };
    }

    const concurrency = config.concurrency || 5;

    // Clear existing Parquet files for this project before uploading new ones
    const s3Prefix = `spreadsheet-agent/${state.projectId}/`;
    try {
      const deleted = await storageProvider.deleteByPrefix(s3Prefix);
      if (deleted > 0) {
        logger.log(`Cleared ${deleted} existing files under ${s3Prefix}`);
      }
    } catch (err) {
      logger.warn(`Failed to clear S3 prefix ${s3Prefix}: ${(err as Error).message}`);
    }

    // Apply plan modifications (skip/include/override)
    const tablesToExtract = applyModifications(extractionPlan.tables, planModifications);

    const extractionResults: ExtractionResult[] = [];
    let completedTables = 0;
    const totalTables = tablesToExtract.length;

    // Process tables with parallel execution respecting the concurrency limit
    const results = await processTablesWithConcurrency(
      tablesToExtract,
      concurrency,
      state,
      emit,
      storageProvider,
      (count: number) => {
        completedTables = count;
      },
      totalTables,
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        extractionResults.push(result.value);
      }
    }

    emit({ type: 'phase_complete', phase: 'extract' });

    // Increment revision count if this is a revision cycle (validation previously failed)
    const isRevision = state.validationReport != null && !state.validationReport.passed;

    return {
      currentPhase: 'extract',
      extractionResults,
      revisionCount: isRevision ? state.revisionCount + 1 : state.revisionCount,
    };
  };
}

// ─── Concurrency helpers ───

async function processTablesWithConcurrency(
  tables: ExtractionPlan['tables'],
  concurrency: number,
  state: SpreadsheetAgentStateType,
  emit: EmitFn,
  storageProvider: StorageProvider,
  onProgress: (completedCount: number) => void,
  totalTables: number,
): Promise<PromiseSettledResult<ExtractionResult>[]> {
  let activeCount = 0;
  let completedCount = 0;
  const queue: Array<() => void> = [];

  const runNext = () => {
    while (activeCount < concurrency && queue.length > 0) {
      const next = queue.shift()!;
      activeCount++;
      next();
    }
  };

  const promises = tables.map(
    (table) =>
      new Promise<ExtractionResult>((resolve, reject) => {
        const task = async () => {
          try {
            const result = await extractTable(table, state, emit, storageProvider);
            completedCount++;
            onProgress(completedCount);

            emit({
              type: 'progress',
              completedFiles: state.fileInventory.length,
              totalFiles: state.fileInventory.length,
              completedSheets: state.sheetAnalyses.length,
              totalSheets: state.sheetAnalyses.length,
              completedTables: completedCount,
              totalTables,
              percentComplete: 50 + Math.round((completedCount / Math.max(totalTables, 1)) * 30), // Phase 5 = 50-80%
            });

            resolve(result);
          } catch (error) {
            completedCount++;
            onProgress(completedCount);
            reject(error);
          } finally {
            activeCount--;
            runNext();
          }
        };

        queue.push(task);
      }),
  );

  runNext();

  return Promise.allSettled(promises);
}

async function extractTable(
  table: ExtractionPlan['tables'][0],
  state: SpreadsheetAgentStateType,
  emit: EmitFn,
  storageProvider: StorageProvider,
): Promise<ExtractionResult> {
  emit({ type: 'table_start', tableId: table.tableName, tableName: table.tableName });
  const startTime = Date.now();

  try {
    // 1. Find the source file
    const file = state.files.find((f) => f.fileId === table.sourceFileId);
    if (!file) {
      throw new Error(
        `Source file ${table.sourceFileId} not found for table ${table.tableName}`,
      );
    }

    // 2. Ensure file is available locally (download from S3 if needed)
    const localPath = await ensureLocalFile(file, storageProvider);

    // 3. Read data from the specific sheet region
    const rawRows = readSheetData(localPath, table);

    // 4. Apply column transformations and type coercions
    const { transformedRows, nullCounts } = applyColumnTransformations(rawRows, table.columns);

    // 5. Write to local Parquet via DuckDB
    const parquetDir = join(tmpdir(), 'spreadsheet-agent', 'parquet', state.projectId);
    const localParquetPath = join(parquetDir, `${table.tableName}.parquet`);
    await writeParquet(transformedRows, table.columns, localParquetPath);

    // 6. Upload Parquet to S3
    const s3Key = `spreadsheet-agent/${state.projectId}/${table.tableName}.parquet`;
    const fileStream = createReadStream(localParquetPath);
    await storageProvider.upload(s3Key, fileStream, {
      mimeType: 'application/octet-stream',
      metadata: {
        projectId: state.projectId,
        tableName: table.tableName,
        rowCount: String(transformedRows.length),
      },
    });

    // 7. Get real file size
    const fileStat = statSync(localParquetPath);

    // 8. Clean up local Parquet file
    try {
      unlinkSync(localParquetPath);
    } catch {
      // ignore cleanup errors
    }

    const result: ExtractionResult = {
      tableId: table.tableName,
      tableName: table.tableName,
      outputPath: s3Key,
      rowCount: transformedRows.length,
      sizeBytes: Number(fileStat.size),
      columns: table.columns.map((c) => ({
        name: c.outputName,
        type: c.outputType,
        nullCount: nullCounts.get(c.outputName) ?? 0,
      })),
      status: 'success',
      durationMs: Date.now() - startTime,
    };

    emit({
      type: 'table_complete',
      tableId: table.tableName,
      tableName: table.tableName,
      rowCount: result.rowCount,
      sizeBytes: result.sizeBytes,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to extract table ${table.tableName}: ${errorMessage}`);

    emit({
      type: 'table_error',
      tableId: table.tableName,
      tableName: table.tableName,
      error: errorMessage,
    });

    return {
      tableId: table.tableName,
      tableName: table.tableName,
      outputPath: table.outputPath,
      rowCount: 0,
      sizeBytes: 0,
      columns: [],
      status: 'failed',
      error: errorMessage,
      durationMs: Date.now() - startTime,
    };
  }
}

// ─── Sheet data reader ───

/**
 * Read data from a specific sheet region based on the extraction plan's coordinates.
 * Returns raw rows keyed by source column name.
 */
function readSheetData(
  localPath: string,
  table: ExtractionPlan['tables'][0],
): Record<string, unknown>[] {
  const buffer = readFileSync(localPath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[table.sourceSheetName];

  if (!sheet) {
    throw new Error(`Sheet "${table.sourceSheetName}" not found in file`);
  }

  const ref = sheet['!ref'];
  if (!ref) {
    logger.warn(`Sheet "${table.sourceSheetName}" has no data range`);
    return [];
  }

  const fullRange = XLSX.utils.decode_range(ref);

  // Get headers from the header row
  const headerRowData = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    range: {
      s: { r: table.headerRow, c: fullRange.s.c },
      e: { r: table.headerRow, c: fullRange.e.c },
    },
    defval: '',
  }) as unknown[][];

  if (!headerRowData.length || !headerRowData[0]) {
    throw new Error(
      `No headers found at row ${table.headerRow} in sheet "${table.sourceSheetName}"`,
    );
  }

  const headers = (headerRowData[0] as unknown[]).map((h) => String(h ?? '').trim());

  // Build column index map: source column name → column index
  // Use case-insensitive matching with trimming to handle LLM/spreadsheet mismatches
  const colIndexMap = new Map<string, number>();
  const headerLowerMap = new Map<string, number>();
  headers.forEach((h, idx) => {
    // Store the first occurrence for case-insensitive lookup
    const key = h.toLowerCase();
    if (!headerLowerMap.has(key)) {
      headerLowerMap.set(key, idx);
    }
  });

  for (const col of table.columns) {
    const exactIdx = headers.indexOf(col.sourceName);
    if (exactIdx !== -1) {
      colIndexMap.set(col.sourceName, exactIdx);
    } else {
      // Fallback: case-insensitive match
      const lowerIdx = headerLowerMap.get(col.sourceName.trim().toLowerCase());
      if (lowerIdx !== undefined) {
        colIndexMap.set(col.sourceName, lowerIdx);
        logger.debug(
          `Column "${col.sourceName}" matched header "${headers[lowerIdx]}" (case-insensitive) in table "${table.tableName}"`,
        );
      } else {
        logger.warn(
          `Column "${col.sourceName}" not found in sheet "${table.sourceSheetName}" headers [${headers.join(', ')}] for table "${table.tableName}"`,
        );
      }
    }
  }

  // Read data rows
  const dataEndRow = table.dataEndRow ?? fullRange.e.r;
  const dataRange = {
    s: { r: table.dataStartRow, c: fullRange.s.c },
    e: { r: dataEndRow, c: fullRange.e.c },
  };

  const rawGrid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    range: dataRange,
    defval: null,
    blankrows: false,
  }) as unknown[][];

  // Build skip rows set (adjust relative to dataStartRow)
  const skipSet = new Set((table.skipRows ?? []).map((r) => r - table.dataStartRow));

  // Map to row objects keyed by source column name
  return rawGrid
    .filter((_, idx) => !skipSet.has(idx))
    .map((row) => {
      const obj: Record<string, unknown> = {};
      for (const col of table.columns) {
        const idx = colIndexMap.get(col.sourceName);
        obj[col.sourceName] =
          idx !== undefined && idx < (row as unknown[]).length
            ? (row as unknown[])[idx]
            : null;
      }
      return obj;
    });
}

// ─── Plan modification helpers ───

function applyModifications(
  tables: ExtractionPlan['tables'],
  modifications: PlanModification[] | null,
): ExtractionPlan['tables'] {
  if (!modifications || modifications.length === 0) {
    return tables;
  }

  const modMap = new Map(modifications.map((m) => [m.tableName, m]));

  return tables
    .filter((table) => {
      const mod = modMap.get(table.tableName);
      if (mod && mod.action === 'skip') return false;
      return true;
    })
    .map((table) => {
      const mod = modMap.get(table.tableName);
      if (!mod || mod.action !== 'include' || !mod.overrides) return table;

      // Apply overrides
      const overridden = { ...table };

      if (mod.overrides.tableName) {
        overridden.tableName = mod.overrides.tableName;
        // Update output path with new name
        const pathParts = overridden.outputPath.split('/');
        pathParts[pathParts.length - 1] = `${mod.overrides.tableName}.parquet`;
        overridden.outputPath = pathParts.join('/');
      }

      if (mod.overrides.columns) {
        // Override matching columns by outputName
        const colOverrides = new Map(mod.overrides.columns.map((c) => [c.outputName, c]));
        overridden.columns = overridden.columns.map((col) => {
          const override = colOverrides.get(col.outputName);
          if (override) {
            return {
              ...col,
              outputName: override.outputName,
              outputType: override.outputType,
            };
          }
          return col;
        });
      }

      return overridden;
    });
}
