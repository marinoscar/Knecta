export function buildExecutorRepairPrompt(
  stepDescription: string,
  failedSql: string,
  errorMessage: string,
  databaseType: string,
  datasetSchemas?: string,
): string {
  const schemaSection = datasetSchemas
    ? `\n## Dataset Schemas (from semantic model)\n\nUse these column names and types to fix the SQL:\n\n${datasetSchemas}\n`
    : '';

  return `The following SQL query failed during execution. Fix it and return ONLY the corrected SQL query (no markdown fences, no explanation).

## Database Type
${databaseType}
${schemaSection}
## Step
${stepDescription}

## Failed SQL
${failedSql}

## Error Message
${errorMessage}

Return ONLY the corrected SQL.`;
}

export function buildPythonGenerationPrompt(
  stepDescription: string,
  strategy: string,
  sqlData: string | null,
  priorContext: string,
  datasetSchemas?: string,
): string {
  const dataSection = sqlData
    ? `\n## Data from SQL Query\n\`\`\`\n${sqlData}\n\`\`\``
    : '';

  const schemaSection = datasetSchemas
    ? `\n## Dataset Schemas (for reference)\n\nThese are the authoritative column definitions from the semantic model:\n\n${datasetSchemas}\n`
    : '';

  return `Write Python code for the following analysis step. Output ONLY executable Python code — no markdown fences, no explanation.

## Task
${stepDescription}
${dataSection}
${schemaSection}
${priorContext ? `\n## Results from Prior Steps\n${priorContext}` : ''}

## Available Libraries
pandas, numpy, matplotlib, seaborn, scipy

## Rules
- Use print() for text output
- Use matplotlib/seaborn for charts (they are auto-saved)
- If working with SQL result data, parse it from the pipe-delimited format
- Be concise — no unnecessary comments`;
}
