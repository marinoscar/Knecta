import { Logger } from '@nestjs/common';
import { SpreadsheetAgentStateType } from '../state';
import { ExtractionPlan, ExtractionResult, PlanModification } from '../types';
import { EmitFn } from '../graph';
import { StorageProvider } from '../../../storage/providers/storage-provider.interface';

const logger = new Logger('ExtractNode');

// ─── Node factory ───

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createExtractNode(emit: EmitFn, _storageProvider: StorageProvider) {
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
            const result = await extractTable(table, state, emit);
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
): Promise<ExtractionResult> {
  emit({ type: 'table_start', tableId: table.tableName, tableName: table.tableName });

  const startTime = Date.now();

  try {
    // TODO: Real implementation will:
    // 1. Build DuckDB SQL from the table's column definitions + transformations
    // 2. Execute in Python sandbox (read source → transform → COPY TO Parquet at /tmp)
    // 3. Retrieve Parquet file from sandbox response
    // 4. Upload to cloud storage via StorageProvider
    // 5. Return row count, size, column null counts

    // Placeholder extraction result
    const result: ExtractionResult = {
      tableId: table.tableName,
      tableName: table.tableName,
      outputPath: table.outputPath,
      rowCount: table.estimatedRows,
      sizeBytes: 0,
      columns: table.columns.map((c) => ({
        name: c.outputName,
        type: c.outputType,
        nullCount: 0,
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
