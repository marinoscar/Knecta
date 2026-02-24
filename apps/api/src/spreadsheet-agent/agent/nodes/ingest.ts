import { readFileSync } from 'fs';
import { Logger } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { SpreadsheetAgentStateType } from '../state';
import { FileInventory } from '../types';
import { EmitFn } from '../graph';
import { StorageProvider } from '../../../storage/providers/storage-provider.interface';

const logger = new Logger('IngestNode');

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createIngestNode(emit: EmitFn, _storageProvider: StorageProvider) {
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
  const buffer = readFileSync(file.storagePath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  logger.debug(
    `Parsed ${file.fileName}: ${workbook.SheetNames.length} sheet(s) — ${workbook.SheetNames.join(', ')}`,
  );

  const sheets = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const ref = sheet['!ref'];

    if (!ref) {
      // Empty sheet — no data range
      logger.debug(`Sheet "${sheetName}" in ${file.fileName} is empty`);
      return {
        name: sheetName,
        rowCount: 0,
        colCount: 0,
        hasMergedCells: false,
        hasFormulas: false,
        dataDensity: 0,
        sampleGrid: [] as string[][],
        lastRows: [] as string[][],
        mergedCellRanges: [] as string[],
      };
    }

    const range = XLSX.utils.decode_range(ref);
    const rowCount = range.e.r - range.s.r + 1;
    const colCount = range.e.c - range.s.c + 1;

    // Merged cell ranges
    const merges: XLSX.Range[] = sheet['!merges'] ?? [];
    const mergedCellRanges = merges.map((m) => XLSX.utils.encode_range(m));

    // Formula detection — iterate all cells in the ref range
    let hasFormulas = false;
    for (const cellAddress of Object.keys(sheet)) {
      if (cellAddress.startsWith('!')) continue;
      const cell = sheet[cellAddress] as XLSX.CellObject;
      if (cell && cell.f) {
        hasFormulas = true;
        break;
      }
    }

    // Count non-empty cells for density calculation
    let nonEmptyCells = 0;
    for (const cellAddress of Object.keys(sheet)) {
      if (cellAddress.startsWith('!')) continue;
      const cell = sheet[cellAddress] as XLSX.CellObject;
      if (cell && cell.v !== undefined && cell.v !== null && cell.v !== '') {
        nonEmptyCells++;
      }
    }
    const totalCells = rowCount * colCount;
    const dataDensity = totalCells > 0 ? nonEmptyCells / totalCells : 0;

    // Full grid as strings for sampling
    const fullGrid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      range: 0,
      defval: '',
    }) as unknown[][];

    const toStringGrid = (rows: unknown[][]): string[][] =>
      rows.map((row) => (row as unknown[]).map((cell) => String(cell ?? '')));

    const sampleGrid = toStringGrid(fullGrid.slice(0, 30));
    const lastRows = toStringGrid(fullGrid.slice(-5));

    logger.debug(
      `Sheet "${sheetName}": ${rowCount}r x ${colCount}c, density=${dataDensity.toFixed(2)}, formulas=${hasFormulas}, merges=${mergedCellRanges.length}`,
    );

    return {
      name: sheetName,
      rowCount,
      colCount,
      hasMergedCells: merges.length > 0,
      hasFormulas,
      dataDensity,
      sampleGrid,
      lastRows,
      mergedCellRanges,
    };
  });

  return {
    fileId: file.fileId,
    fileName: file.fileName,
    fileType: file.fileType,
    fileSizeBytes: file.fileSizeBytes,
    fileHash: file.fileHash,
    sheets,
  };
}
