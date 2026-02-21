import { ColumnInfo, ForeignKeyInfo, SampleDataResult, ColumnStatsResult } from '../../../connections/drivers/driver.interface';

export interface GenerateDatasetPromptParams {
  tableName: string;        // e.g., "public.orders"
  databaseName: string;
  columns: ColumnInfo[];
  sampleData: SampleDataResult;
  foreignKeys: ForeignKeyInfo[];  // FKs where this table is from or to
  columnStats: Map<string, ColumnStatsResult>;
  modelName: string;
  instructions?: string;
  osiSpecText?: string;
}

export function buildGenerateDatasetPrompt(params: GenerateDatasetPromptParams): string {
  // Convert columnStats Map to plain object for JSON serialization
  const columnStatsObj: Record<string, ColumnStatsResult> = {};
  for (const [key, value] of params.columnStats) {
    columnStatsObj[key] = value;
  }

  return `You are generating an OSI (Open Semantic Interchange) dataset definition for a single database table.
${params.osiSpecText ? `
## OSI Specification Reference

Follow this specification EXACTLY for structure and field naming:

${params.osiSpecText}
` : ''}
## Table: ${params.tableName}
Database: ${params.databaseName}
Model: ${params.modelName}

## Column Metadata
${JSON.stringify(params.columns, null, 2)}

## Sample Data (${params.sampleData.rows.length} rows)
Columns: ${params.sampleData.columns.join(', ')}
${JSON.stringify(params.sampleData.rows, null, 2)}

## Foreign Keys (involving this table)
${params.foreignKeys.length > 0 ? JSON.stringify(params.foreignKeys, null, 2) : 'None found'}

## Column Statistics
${Object.keys(columnStatsObj).length > 0 ? JSON.stringify(columnStatsObj, null, 2) : 'None collected'}

${params.instructions ? `## Business Context\n${params.instructions}\n` : ''}
## Your Task

Generate a JSON object for this table as an OSI dataset definition.

### Dataset Requirements:
- **name**: Use the table name (without schema prefix)
- **label**: Human-readable display label (e.g., "Customer Accounts" for users, "Order Line Items" for order_items)
- **source**: "${params.databaseName}.${params.tableName}"
- **primary_key**: Array of primary key column names (from column metadata where isPrimaryKey is true)
- **description**: A meaningful business description of what this table represents
- **ai_context**: Object with:
  - **synonyms**: At least 5 business-friendly alternative names for this table
  - **instructions**: Brief note about the table's business purpose

### Field Requirements (one per column):
- **name**: Column name
- **expression**: { "dialects": [{ "dialect": "ANSI_SQL", "expression": "<column_name>" }] }
- **dimension**: { "is_time": true } for date/timestamp/datetime columns ONLY
- **label**: Human-readable label (e.g., "Customer ID" for customer_id)
- **description**: Meaningful business description (NOT just the column name restated)
- **ai_context**: Object with:
  - **synonyms**: At least 3 alternative names/business terms for this column

### Synonym Requirements (CRITICAL):
- Expand ALL abbreviations (qty → quantity, prod → product, amt → amount, etc.)
- Include both technical names and business-friendly terms
- Include plural/singular variants where appropriate
- At least 3 synonyms per field, 5 per dataset

### Metrics Requirements:
Generate useful metrics for this table:
- **SUM** and **AVG** for numeric columns that represent amounts/quantities
- **COUNT DISTINCT** for categorical/identifier columns
- **COUNT** with filters for status/boolean columns
- Each metric needs: name, expression (ANSI_SQL dialect), description, ai_context with synonyms
- **CRITICAL**: Metric expressions MUST use fully qualified column names in the format \`schema.table.column\`. For this table, that means \`${params.tableName}.column_name\`. Example: \`SUM(${params.tableName}.amount)\` NOT \`SUM(amount)\`
- Only generate metrics that make business sense for this table

Output ONLY a valid JSON object with this exact structure:
{
  "dataset": { <OSI dataset definition> },
  "metrics": [ <array of OSI metric definitions> ]
}

Do not include any text before or after the JSON. Do not wrap in markdown code blocks.`;
}
