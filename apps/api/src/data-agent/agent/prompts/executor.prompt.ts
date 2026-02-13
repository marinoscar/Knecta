export function buildExecutorRepairPrompt(
  stepDescription: string,
  failedSql: string,
  errorMessage: string,
  databaseType: string,
): string {
  return `The following SQL query failed during execution. Fix it and return ONLY the corrected SQL query (no markdown fences, no explanation).

## Database Type
${databaseType}

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
): string {
  const dataSection = sqlData
    ? `\n## Data from SQL Query\n\`\`\`\n${sqlData}\n\`\`\``
    : '';

  return `Write Python code for the following analysis step. Output ONLY executable Python code — no markdown fences, no explanation.

## Task
${stepDescription}
${dataSection}
${priorContext ? `\n## Results from Prior Steps\n${priorContext}` : ''}

## Available Libraries
pandas, numpy, matplotlib, seaborn, scipy

## Rules
- Use print() for text output
- Use matplotlib/seaborn for charts (they are auto-saved)
- If working with SQL result data, parse it from the pipe-delimited format
- Be concise — no unnecessary comments`;
}
