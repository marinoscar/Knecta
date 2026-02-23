import { Logger } from '@nestjs/common';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { z } from 'zod';
import { SpreadsheetAgentStateType } from '../state';
import { ExtractionPlan, TokenUsage } from '../types';
import { EmitFn } from '../graph';
import { extractTokenUsage } from '../utils/token-tracker';

const logger = new Logger('DesignNode');

// ─── Zod schema for ExtractionPlan structured output ───

const extractionPlanColumnSchema = z.object({
  sourceName: z.string(),
  outputName: z.string(),
  outputType: z
    .string()
    .describe('DuckDB type: INTEGER, VARCHAR, DATE, DOUBLE, BOOLEAN, TIMESTAMP, JSON'),
  nullable: z.boolean(),
  transformation: z
    .string()
    .nullable()
    .describe('SQL expression for transformation or null'),
  description: z.string(),
});

const extractionPlanTableSchema = z.object({
  tableName: z.string().describe('Clean globally unique snake_case table name'),
  description: z.string(),
  sourceFileId: z.string(),
  sourceFileName: z.string(),
  sourceSheetName: z.string(),
  headerRow: z.number(),
  dataStartRow: z.number(),
  dataEndRow: z.number().nullable(),
  columns: z.array(extractionPlanColumnSchema),
  skipRows: z.array(z.number()),
  needsTranspose: z.boolean(),
  estimatedRows: z.number(),
  outputPath: z.string().describe('Planned cloud storage path for Parquet file'),
  notes: z.string(),
});

const extractionPlanRelationshipSchema = z.object({
  fromTable: z.string(),
  fromColumn: z.string(),
  toTable: z.string(),
  toColumn: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  notes: z.string(),
});

const extractionPlanSchema = z.object({
  tables: z.array(extractionPlanTableSchema),
  relationships: z.array(extractionPlanRelationshipSchema),
  catalogMetadata: z.object({
    projectDescription: z.string(),
    domainNotes: z.string(),
    dataQualityNotes: z.array(z.string()),
  }),
});

// ─── Public interface ───

export interface DesignNodeDeps {
  llm: BaseChatModel;
  emit: EmitFn;
}

// ─── Node factory ───

export function createDesignNode(deps: DesignNodeDeps) {
  const { llm, emit } = deps;

  return async (
    state: SpreadsheetAgentStateType,
  ): Promise<Partial<SpreadsheetAgentStateType>> => {
    emit({ type: 'phase_start', phase: 'design', label: 'Designing extraction schema' });

    const { sheetAnalyses, projectId, config } = state;

    // If this is a revision cycle, include the revision diagnosis in the prompt
    const isRevision = state.revisionCount > 0;
    const revisionContext =
      isRevision && state.revisionDiagnosis
        ? `\n\n## REVISION REQUIRED\nThis is revision cycle ${state.revisionCount}. The previous extraction failed validation.\nDiagnosis: ${state.revisionDiagnosis}\nPlease fix the schema design issues identified above.`
        : '';

    const prompt = buildDesignerPrompt(sheetAnalyses, projectId, revisionContext);

    try {
      // includeRaw: true returns { parsed, raw } so we can extract token usage
      // from the underlying AIMessage while still getting structured output.
      const structuredLlm = llm.withStructuredOutput(extractionPlanSchema, {
        name: 'design_extraction_plan',
        includeRaw: true,
      });

      const rawResult = await structuredLlm.invoke(prompt) as { parsed: unknown; raw: unknown };
      const result = rawResult.parsed as z.infer<typeof extractionPlanSchema>;
      const tokens: TokenUsage = extractTokenUsage(rawResult.raw);

      // Programmatically fix sourceFileId — the LLM doesn't have real DB UUIDs,
      // so we resolve them from the sheetAnalyses which carry actual file IDs.
      for (const table of result.tables) {
        const analysis = sheetAnalyses.find(
          (a) => a.fileName === table.sourceFileName && a.sheetName === table.sourceSheetName,
        );
        if (analysis) {
          table.sourceFileId = analysis.fileId;
        } else {
          // Fallback: match by fileName only (handles single-sheet files)
          const fileMatch = sheetAnalyses.find((a) => a.fileName === table.sourceFileName);
          if (fileMatch) {
            table.sourceFileId = fileMatch.fileId;
            logger.warn(
              `Table "${table.tableName}": sheet "${table.sourceSheetName}" not found in analyses, ` +
                `matched by fileName "${table.sourceFileName}" to fileId ${fileMatch.fileId}`,
            );
          } else {
            logger.error(
              `Table "${table.tableName}": could not resolve sourceFileId ` +
                `for file="${table.sourceFileName}", sheet="${table.sourceSheetName}"`,
            );
          }
        }
      }

      const extractionPlan: ExtractionPlan = {
        tables: result.tables,
        relationships: result.relationships,
        catalogMetadata: result.catalogMetadata,
      };

      // Emit the plan summary
      emit({
        type: 'extraction_plan',
        tables: extractionPlan.tables.map((t) => ({
          name: t.tableName,
          columns: t.columns.length,
          sourceFile: t.sourceFileName,
          sourceSheet: t.sourceSheetName,
          estimatedRows: t.estimatedRows,
        })),
      });

      // If review mode, emit review_ready event (graph will route to END)
      if (config.reviewMode === 'review') {
        emit({ type: 'review_ready', extractionPlan });
      }

      emit({
        type: 'progress',
        completedFiles: state.fileInventory.length,
        totalFiles: state.fileInventory.length,
        completedSheets: sheetAnalyses.length,
        totalSheets: sheetAnalyses.length,
        completedTables: 0,
        totalTables: extractionPlan.tables.length,
        percentComplete: 50, // Phase 3 = 40-50%
      });

      emit({ type: 'token_update', phase: 'design', tokensUsed: tokens });
      emit({ type: 'phase_complete', phase: 'design' });

      return {
        currentPhase: 'design',
        extractionPlan,
        tokensUsed: tokens,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Design node failed: ${errorMessage}`);
      emit({ type: 'phase_complete', phase: 'design' });

      return {
        currentPhase: 'design',
        extractionPlan: null,
        error: `Schema design failed: ${errorMessage}`,
      };
    }
  };
}

// ─── Prompt builder ───

function buildDesignerPrompt(
  analyses: SpreadsheetAgentStateType['sheetAnalyses'],
  projectId: string,
  revisionContext: string,
): string {
  // Serialize all analyses for LLM context
  const analysesText = analyses
    .map((a) => {
      const tablesText = a.logicalTables
        .map((t) => {
          const colsText = t.columns
            .map(
              (c) =>
                `    - ${c.sourceName} → ${c.cleanName} (${c.inferredType}${c.nullable ? ', nullable' : ''})${c.notes ? ` [${c.notes}]` : ''}`,
            )
            .join('\n');
          return `  Table: "${t.suggestedName}" — ${t.description}
    Header row: ${t.headerRow}, Data: rows ${t.dataStartRow}–${t.dataEndRow ?? 'end'}
    Est. rows: ${t.estimatedRowCount}, Transpose: ${t.needsTranspose}
    Skip rows: [${t.skipRows.join(', ')}]
    Columns:
${colsText}
    Notes: ${t.notes}`;
        })
        .join('\n\n');

      return `### File: ${a.fileName} / Sheet: ${a.sheetName}
${tablesText}
Cross-file hints: ${a.crossFileHints.length > 0 ? a.crossFileHints.join('; ') : 'None'}`;
    })
    .join('\n\n---\n\n');

  return `You are a data schema designer. Given the analyzed spreadsheet structure below, design a clean, complete extraction plan.

## Project ID: ${projectId}

## Sheet Analyses
${analysesText}

## Your Task
Design the target extraction schema:
1. Choose clean, globally unique snake_case table names (resolve conflicts if two sheets suggest the same name)
2. Choose clean snake_case column names and assign DuckDB-compatible types (INTEGER, VARCHAR, DATE, DOUBLE, BOOLEAN, TIMESTAMP, JSON)
3. Plan SQL transformation expressions where needed (e.g., "CAST AS DATE", "TRIM", "REPLACE(',', '')")
4. Identify cross-file relationships (e.g., matching customer IDs across files)
5. Generate Parquet output paths as: "spreadsheet-agent/${projectId}/<tableName>.parquet"
6. Note any data quality concerns

The extraction plan will be used to generate DuckDB SQL that reads source files and writes Parquet output.${revisionContext}`;
}
