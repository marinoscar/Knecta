import { SpreadsheetAgentStateType, InferredTable, ColumnDefinition, SheetInfo } from '../state';
import { SpreadsheetAgentService } from '../../spreadsheet-agent.service';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage } from '@langchain/core/messages';
import { Logger } from '@nestjs/common';

const logger = new Logger('InferSchema');

/**
 * Extract JSON from LLM response text
 */
function extractJson(text: string): any | null {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {}

  // Try extracting from code block
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {}
  }

  // Try finding JSON object or array
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch {}
  }

  return null;
}

/**
 * Extract token usage from LLM response
 */
function extractTokenUsage(response: any): { prompt: number; completion: number; total: number } {
  const usage = response?.response_metadata?.tokenUsage
    || response?.usage_metadata
    || {};
  return {
    prompt: usage.promptTokens || usage.input_tokens || 0,
    completion: usage.completionTokens || usage.output_tokens || 0,
    total: usage.totalTokens || (usage.input_tokens || 0) + (usage.output_tokens || 0),
  };
}

/**
 * Build prompt for schema inference
 */
function buildSchemaInferencePrompt(sheet: SheetInfo, instructions?: string): string {
  const sampleDataStr = sheet.sampleRows
    .slice(0, 5)
    .map((row, i) => `  Row ${i + 1}: ${JSON.stringify(row)}`)
    .join('\n');

  return `You are a data engineering assistant. Analyze this spreadsheet data and generate a clean schema for converting it to a Parquet file suitable for SQL querying.

## Source Information
- File: "${sheet.fileName}"
- Sheet: "${sheet.sheetName}"
- Total rows: ${sheet.rowCount}
- Column count: ${sheet.headers.length}

## Raw Column Headers
${sheet.headers.map((h, i) => `  ${i}: "${h}"`).join('\n')}

## Sample Data (first ${sheet.sampleRows.length} rows)
${sampleDataStr}

${instructions ? `## Additional Instructions\n${instructions}\n` : ''}

## Task
Generate a JSON response with the following structure:
{
  "tableName": "<clean_sql_friendly_table_name>",
  "columns": [
    {
      "originalName": "<exact header from spreadsheet>",
      "name": "<clean_sql_friendly_column_name>",
      "dataType": "<one of: string, int64, float64, boolean, date, timestamp>",
      "nullable": <true|false>,
      "description": "<brief description of what this column contains>"
    }
  ]
}

## Rules for table and column naming:
1. Use snake_case (e.g., "customer_orders", "first_name")
2. Remove special characters, spaces, and abbreviations where possible
3. Make names descriptive but concise
4. Table name should reflect the business entity or concept in the data
5. Avoid SQL reserved words

## Rules for data type inference:
1. "string" - text data, IDs, codes, mixed types
2. "int64" - whole numbers without decimals
3. "float64" - numbers with decimals, monetary values, percentages
4. "boolean" - true/false, yes/no, 1/0 columns
5. "date" - dates without time component
6. "timestamp" - dates with time component
7. If uncertain, default to "string"
8. Mark columns as nullable if any sample values are null/empty

Respond with ONLY the JSON object, no additional text.`;
}

export function createInferSchemaNode(
  llm: BaseChatModel,
  spreadsheetService: SpreadsheetAgentService,
  runId: string,
  emitProgress: (event: object) => void,
) {
  return async (state: SpreadsheetAgentStateType) => {
    if (state.sheets.length === 0) {
      return { tables: [], error: state.error || 'No sheets to process' };
    }

    emitProgress({
      type: 'step_start',
      step: 'infer_schema',
      label: 'Inferring Table Schemas',
    });

    const tables: InferredTable[] = [];
    const tokensUsed = { ...state.tokensUsed };

    for (let i = 0; i < state.sheets.length; i++) {
      const sheet = state.sheets[i];

      emitProgress({
        type: 'progress',
        phase: 'infer_schema',
        currentSheet: i + 1,
        totalSheets: state.sheets.length,
        sheetName: `${sheet.fileName} / ${sheet.sheetName}`,
      });

      try {
        const prompt = buildSchemaInferencePrompt(sheet, state.instructions || undefined);
        const response = await llm.invoke([new HumanMessage(prompt)]);

        // Track tokens
        const callTokens = extractTokenUsage(response);
        tokensUsed.prompt += callTokens.prompt;
        tokensUsed.completion += callTokens.completion;
        tokensUsed.total += callTokens.total;

        emitProgress({ type: 'token_update', tokensUsed });

        // Parse response
        const content = typeof response.content === 'string'
          ? response.content
          : JSON.stringify(response.content);

        const parsed = extractJson(content);
        if (!parsed || !parsed.tableName || !parsed.columns) {
          logger.warn(`LLM did not return valid schema for sheet "${sheet.sheetName}" in ${sheet.fileName}`);
          // Fallback: use raw headers with string types
          tables.push(createFallbackTable(sheet));
          continue;
        }

        const columns: ColumnDefinition[] = parsed.columns.map((col: any, idx: number) => ({
          originalName: col.originalName || sheet.headers[idx] || `column_${idx}`,
          name: sanitizeColumnName(col.name || col.originalName || `column_${idx}`),
          dataType: validateDataType(col.dataType),
          nullable: col.nullable !== false,
          description: col.description || '',
        }));

        tables.push({
          sourceFile: sheet.fileName,
          sourceSheet: sheet.sheetName,
          tableName: sanitizeTableName(parsed.tableName),
          columns,
          rowCount: sheet.rowCount,
          tempFilePath: sheet.tempFilePath,
        });

        logger.log(`Inferred schema for "${parsed.tableName}": ${columns.length} columns, ${sheet.rowCount} rows`);

        emitProgress({
          type: 'table_schema_inferred',
          sourceFile: sheet.fileName,
          sourceSheet: sheet.sheetName,
          tableName: parsed.tableName,
          columnCount: columns.length,
          rowCount: sheet.rowCount,
        });
      } catch (error: any) {
        logger.warn(`Failed to infer schema for sheet "${sheet.sheetName}" in ${sheet.fileName}: ${error.message}`);
        // Fallback to raw headers
        tables.push(createFallbackTable(sheet));
      }
    }

    // Update progress
    await spreadsheetService.updateRunProgress(runId, {
      currentStep: 'infer_schema',
      currentStepLabel: 'Inferring Table Schemas',
      percentComplete: 40,
      tokensUsed,
      tablesInferred: tables.length,
    }).catch(() => {});

    return { tables, tokensUsed };
  };
}

/**
 * Create a fallback table using raw headers (no LLM)
 */
function createFallbackTable(sheet: SheetInfo): InferredTable {
  const columns: ColumnDefinition[] = sheet.headers.map((header, i) => ({
    originalName: header,
    name: sanitizeColumnName(header || `column_${i}`),
    dataType: 'string',
    nullable: true,
    description: '',
  }));

  return {
    sourceFile: sheet.fileName,
    sourceSheet: sheet.sheetName,
    tableName: sanitizeTableName(`${sheet.sheetName}`),
    columns,
    rowCount: sheet.rowCount,
    tempFilePath: sheet.tempFilePath,
  };
}

/**
 * Sanitize a string into a valid SQL column name
 */
function sanitizeColumnName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    || 'column';
}

/**
 * Sanitize a string into a valid SQL table name
 */
function sanitizeTableName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    || 'table';
}

/**
 * Validate that a data type is one of the allowed types
 */
function validateDataType(dataType: string): string {
  const validTypes = ['string', 'int64', 'float64', 'boolean', 'date', 'timestamp'];
  const normalized = dataType?.toLowerCase()?.trim();
  return validTypes.includes(normalized) ? normalized : 'string';
}
