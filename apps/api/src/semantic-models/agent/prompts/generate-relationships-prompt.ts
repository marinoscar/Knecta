import { ForeignKeyInfo } from '../../../connections/drivers/driver.interface';

export interface GenerateRelationshipsPromptParams {
  modelName: string;
  databaseName: string;
  datasetSummaries: Array<{
    name: string;
    source: string;
    primaryKey: string[];
    columns: string[];
  }>;
  foreignKeys: ForeignKeyInfo[];
  instructions?: string;
  osiSpecText?: string;
}

export function buildGenerateRelationshipsPrompt(params: GenerateRelationshipsPromptParams): string {
  // Filter FKs to only include those where BOTH tables are in the dataset list
  const datasetTableNames = new Set(params.datasetSummaries.map(d => d.name));
  const relevantFKs = params.foreignKeys.filter(fk =>
    datasetTableNames.has(fk.fromTable) && datasetTableNames.has(fk.toTable)
  );

  return `You are finalizing an OSI semantic model by generating relationships and model-level metadata.
${params.osiSpecText ? `
## OSI Specification Reference

Follow this specification EXACTLY for structure and field naming:

${params.osiSpecText}
` : ''}
## Model: ${params.modelName}
Database: ${params.databaseName}

## Datasets in the model
${JSON.stringify(params.datasetSummaries, null, 2)}

## Foreign Key Constraints (between selected tables only)
${relevantFKs.length > 0 ? JSON.stringify(relevantFKs, null, 2) : 'None found between the selected tables'}

${params.instructions ? `## Business Context\n${params.instructions}\n` : ''}
## Your Task

Generate a JSON object with:

### 1. relationships (Array)
- Create a relationship for EVERY explicit foreign key constraint listed above
- Also infer additional relationships from naming patterns:
  - Column names ending in "_id" that match another dataset's name (e.g., customer_id → customers)
  - Column names matching "<table_name>_id" pattern
- Each relationship needs:
  - **name**: Descriptive name (e.g., "order_customer" or "fk_orders_customer_id")
  - **from**: The dataset name containing the foreign key column (many side)
  - **to**: The dataset name being referenced (one side)
  - **from_columns**: Array of FK column names
  - **to_columns**: Array of referenced column names
  - **ai_context**: For inferred relationships, include { "notes": "Inferred from naming pattern", "confidence": "high" or "medium" or "low" }

### 2. model_metrics (Array)
- Generate cross-table aggregate metrics that make business sense
- Only create metrics that span multiple datasets
- Examples: total count of records, average values, ratios
- Each metric needs: name, expression (ANSI_SQL dialect), description, ai_context with synonyms
- **CRITICAL**: Metric expressions MUST use fully qualified column names in the format \`schema.table.column\`. Reference the \`source\` field of each dataset (minus the database prefix) for the correct qualification. Example: \`SUM(public.orders.total_amount)\` NOT \`SUM(total_amount)\`
- If no cross-table metrics make sense, return an empty array

### 3. model_ai_context (Object)
- **instructions**: Brief description of what this semantic model represents and how to use it
- **synonyms**: At least 5 domain-related terms for this database/model

Output ONLY a valid JSON object:
{
  "relationships": [...],
  "model_metrics": [...],
  "model_ai_context": { "instructions": "...", "synonyms": [...] }
}

Do not include any text before or after the JSON. Do not wrap in markdown code blocks.`;
}
