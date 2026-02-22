import { Logger } from '@nestjs/common';
import { SpreadsheetAgentStateType } from '../state';
import { FileInventory } from '../types';
import { EmitFn } from '../graph';

const logger = new Logger('IngestNode');

export function createIngestNode(emit: EmitFn) {
  return async (state: SpreadsheetAgentStateType): Promise<Partial<SpreadsheetAgentStateType>> => {
    emit({ type: 'phase_start', phase: 'ingest', label: 'Ingesting files' });

    const { files, config } = state;
    const concurrency = config.concurrency || 5;
    const fileInventory: FileInventory[] = [];

    const results = await processFilesWithConcurrency(files, concurrency, emit);

    for (const result of results) {
      if (result.status === 'fulfilled') {
        fileInventory.push(result.value);
      }
    }

    emit({
      type: 'progress',
      completedFiles: fileInventory.length,
      totalFiles: files.length,
      completedSheets: 0,
      totalSheets: 0,
      completedTables: 0,
      totalTables: 0,
      // Phase 1 = 0-20%
      percentComplete: Math.round((fileInventory.length / Math.max(files.length, 1)) * 20),
    });

    emit({ type: 'phase_complete', phase: 'ingest' });

    return {
      currentPhase: 'ingest',
      fileInventory,
    };
  };
}

async function processFilesWithConcurrency(
  files: SpreadsheetAgentStateType['files'],
  concurrency: number,
  emit: EmitFn,
): Promise<PromiseSettledResult<FileInventory>[]> {
  // Simple concurrency limiter using a queue
  let activeCount = 0;
  const queue: Array<() => void> = [];

  const runNext = () => {
    while (activeCount < concurrency && queue.length > 0) {
      const next = queue.shift()!;
      activeCount++;
      next();
    }
  };

  const promises = files.map(
    (file) =>
      new Promise<FileInventory>((resolve, reject) => {
        const task = async () => {
          try {
            emit({
              type: 'file_start',
              fileId: file.fileId,
              fileName: file.fileName,
              fileType: file.fileType,
            });

            // Create inventory from file metadata.
            // In the full implementation this will:
            // 1. Download the file from storage
            // 2. Run openpyxl (Excel) or DuckDB sniff_csv / read_json_auto (CSV/JSON) in a sandbox
            // 3. Extract sheet structure, sample grids, merged cells, formulas, etc.
            const inventory = await inventoryFile(file);

            emit({
              type: 'file_complete',
              fileId: file.fileId,
              fileName: file.fileName,
              sheetCount: inventory.sheets.length,
            });

            resolve(inventory);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`Failed to inventory file ${file.fileName}: ${errorMessage}`);
            emit({
              type: 'file_error',
              fileId: file.fileId,
              fileName: file.fileName,
              error: errorMessage,
            });
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

async function inventoryFile(
  file: SpreadsheetAgentStateType['files'][0],
): Promise<FileInventory> {
  // For Excel files (.xlsx / .xls) we enumerate sheets via openpyxl in the sandbox.
  // For tabular files (.csv / .json) there is a single implicit sheet named after the file.
  // This placeholder creates a minimal inventory record that downstream nodes can refine.
  const isExcel = ['xlsx', 'xls'].includes(file.fileType.toLowerCase());
  const sheetName = isExcel ? 'Sheet1' : file.fileName;

  return {
    fileId: file.fileId,
    fileName: file.fileName,
    fileType: file.fileType,
    fileSizeBytes: file.fileSizeBytes,
    fileHash: file.fileHash,
    sheets: [
      {
        name: sheetName,
        rowCount: 0, // Populated by sandbox execution in full implementation
        colCount: 0,
        hasMergedCells: false,
        hasFormulas: false,
        dataDensity: 0,
        sampleGrid: [],
        lastRows: [],
        mergedCellRanges: [],
      },
    ],
  };
}
