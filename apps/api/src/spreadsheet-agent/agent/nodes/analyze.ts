import { Logger } from '@nestjs/common';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { z } from 'zod';
import { SpreadsheetAgentStateType } from '../state';
import { FileInventory, SheetAnalysis, TokenUsage } from '../types';
import { EmitFn } from '../graph';

const logger = new Logger('AnalyzeNode');

// ─── Zod schema for structured LLM output ───

const columnSchema = z.object({
  index: z.number().describe('0-indexed column number'),
  sourceName: z.string().describe('Original header text from the cell'),
  cleanName: z.string().describe('Clean snake_case column name'),
  inferredType: z
    .enum(['integer', 'decimal', 'text', 'date', 'datetime', 'boolean', 'json'])
    .describe('Inferred SQL-compatible column type'),
  nullable: z.boolean(),
  notes: z.string().describe('Notes about this column, e.g. "Contains currency symbols"'),
});

const logicalTableSchema = z.object({
  suggestedName: z.string().describe('Clean snake_case table name'),
  description: z.string().describe('Brief description of this logical table'),
  headerRow: z.number().describe('0-indexed row number of the header row'),
  dataStartRow: z.number().describe('0-indexed row where data begins'),
  dataEndRow: z
    .number()
    .nullable()
    .describe('0-indexed row where data ends, null if data continues to end'),
  columns: z.array(columnSchema),
  skipRows: z
    .array(z.number())
    .describe('0-indexed row numbers to exclude (totals, blanks, metadata rows)'),
  needsTranspose: z.boolean().describe('True for pivot-style layouts that need transposing'),
  estimatedRowCount: z.number().describe('Approximate number of data rows'),
  notes: z.string().describe('General observations about this table'),
});

const sheetAnalysisOutputSchema = z.object({
  logicalTables: z.array(logicalTableSchema).describe('All logical data tables found in the sheet'),
  crossFileHints: z
    .array(z.string())
    .describe('Hints about relationships with other files in this project'),
});

// ─── Public interface ───

export interface AnalyzeNodeDeps {
  llm: BaseChatModel;
  emit: EmitFn;
}

// ─── Node factory ───

export function createAnalyzeNode(deps: AnalyzeNodeDeps) {
  const { llm, emit } = deps;

  return async (
    state: SpreadsheetAgentStateType,
  ): Promise<Partial<SpreadsheetAgentStateType>> => {
    emit({ type: 'phase_start', phase: 'analyze', label: 'Analyzing sheet structure' });

    const { fileInventory, config } = state;

    // Collect all sheets from all files into a flat list for parallel processing
    const sheetTasks: Array<{
      fileId: string;
      fileName: string;
      sheet: FileInventory['sheets'][0];
    }> = [];

    for (const file of fileInventory) {
      for (const sheet of file.sheets) {
        sheetTasks.push({ fileId: file.fileId, fileName: file.fileName, sheet });
      }
    }

    const totalSheets = sheetTasks.length;
    const concurrency = config.concurrency || 5;

    // Process sheets with a concurrency limiter
    const sheetAnalyses = await processSheetTasksWithConcurrency(
      sheetTasks,
      concurrency,
      llm,
      emit,
    );

    const totalTokens: TokenUsage = { prompt: 0, completion: 0, total: 0 };

    emit({
      type: 'progress',
      completedFiles: fileInventory.length,
      totalFiles: fileInventory.length,
      completedSheets: sheetAnalyses.length,
      totalSheets,
      completedTables: 0,
      totalTables: 0,
      percentComplete: 40, // Phase 2 = 20-40%
    });

    emit({ type: 'token_update', phase: 'analyze', tokensUsed: totalTokens });
    emit({ type: 'phase_complete', phase: 'analyze' });

    return {
      currentPhase: 'analyze',
      sheetAnalyses,
      tokensUsed: totalTokens,
    };
  };
}

// ─── Concurrency helpers ───

async function processSheetTasksWithConcurrency(
  tasks: Array<{ fileId: string; fileName: string; sheet: FileInventory['sheets'][0] }>,
  concurrency: number,
  llm: BaseChatModel,
  emit: EmitFn,
): Promise<SheetAnalysis[]> {
  let activeCount = 0;
  const queue: Array<() => void> = [];
  const analyses: SheetAnalysis[] = [];

  const runNext = () => {
    while (activeCount < concurrency && queue.length > 0) {
      const next = queue.shift()!;
      activeCount++;
      next();
    }
  };

  const settledResults = await Promise.allSettled(
    tasks.map(
      (task) =>
        new Promise<SheetAnalysis>((resolve, reject) => {
          const taskFn = async () => {
            try {
              const analysis = await analyzeSheet(task, llm, emit);
              resolve(analysis);
            } catch (err) {
              reject(err);
            } finally {
              activeCount--;
              runNext();
            }
          };
          queue.push(taskFn);
        }),
    ),
  );

  runNext();

  for (const result of settledResults) {
    if (result.status === 'fulfilled') {
      analyses.push(result.value);
    }
  }

  return analyses;
}

async function analyzeSheet(
  task: { fileId: string; fileName: string; sheet: FileInventory['sheets'][0] },
  llm: BaseChatModel,
  emit: EmitFn,
): Promise<SheetAnalysis> {
  const { fileId, fileName, sheet } = task;

  try {
    const prompt = buildAnalyzerPrompt(fileName, sheet);

    // withStructuredOutput has multiple overloads; use unknown cast to stay
    // type-safe without fighting the overload resolution.
    const structuredLlm = llm.withStructuredOutput(sheetAnalysisOutputSchema, {
      name: 'analyze_sheet',
    });
    const rawResult = await structuredLlm.invoke(prompt);
    const parsed = rawResult as unknown as z.infer<typeof sheetAnalysisOutputSchema>;

    emit({
      type: 'sheet_analysis',
      fileId,
      sheetName: sheet.name,
      tablesFound: parsed.logicalTables.length,
      status: 'analyzed',
    });

    return {
      fileId,
      fileName,
      sheetName: sheet.name,
      logicalTables: parsed.logicalTables,
      crossFileHints: parsed.crossFileHints,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to analyze sheet "${sheet.name}" in "${fileName}": ${errorMessage}`);

    emit({
      type: 'sheet_analysis',
      fileId,
      sheetName: sheet.name,
      tablesFound: 0,
      status: 'error',
    });

    // Return a minimal (empty) analysis rather than propagating the error so
    // that a single failed sheet does not abort the entire run.
    return {
      fileId,
      fileName,
      sheetName: sheet.name,
      logicalTables: [],
      crossFileHints: [],
    };
  }
}

// ─── Prompt builder ───

function buildAnalyzerPrompt(
  fileName: string,
  sheet: FileInventory['sheets'][0],
): string {
  let sampleGridText = 'No sample data available';
  if (sheet.sampleGrid.length > 0) {
    const rows = sheet.sampleGrid.map((row, i) => `| ${i} | ${row.join(' | ')} |`);
    sampleGridText = rows.join('\n');
  }

  let lastRowsText = 'No last rows available';
  if (sheet.lastRows.length > 0) {
    const rows = sheet.lastRows.map((row) => `| ${row.join(' | ')} |`);
    lastRowsText = rows.join('\n');
  }

  return `You are analyzing a spreadsheet sheet to identify data tables.

Sheet: "${sheet.name}" from file: "${fileName}"
Row count: ${sheet.rowCount}
Column count: ${sheet.colCount}
Merged cells: ${sheet.mergedCellRanges.length > 0 ? sheet.mergedCellRanges.join(', ') : 'None'}
Has formulas: ${sheet.hasFormulas}
Data density: ${(sheet.dataDensity * 100).toFixed(1)}%

## Raw Cell Grid (first 30 rows)
${sampleGridText}

## Last 5 Rows
${lastRowsText}

## Your Task
Identify ALL logical data tables in this sheet. A sheet may contain:
- One table starting at row 1 with clean headers
- Multiple tables stacked vertically (separated by empty rows)
- Multiple tables placed side by side
- A table with metadata/title rows above the headers
- A table with summary/total rows below the data
- A pivot-style layout that needs transposing to produce a normalised table

For each logical table found, identify:
1. The exact header row number (0-indexed)
2. Where data rows start and end
3. Which rows to skip (totals, metadata, empty separators)
4. Column names and inferred data types
5. Whether the layout needs transposing

If no data tables are found (e.g., the sheet is empty or contains only metadata), return an empty logicalTables array.`;
}
