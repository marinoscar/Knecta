export function buildExecutorRepairPrompt(
  stepDescription: string,
  failedSql: string,
  errorMessage: string,
  databaseType: string,
  datasetSchemas?: string,
): string {
  const schemaSection = datasetSchemas
    ? `\n## Dataset Schemas (from semantic model)\n\nUse these column names and types to fix the SQL. CRITICAL: Use ONLY column names that appear in these schemas. Do NOT invent or guess column names.\n\n${datasetSchemas}\n`
    : '';

  return `Fix the following failed SQL query and return ONLY the corrected SQL query (no markdown fences, no explanation).

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

export function buildChartSpecPrompt(
  stepDescription: string,
  chartType: string,
  sqlData: string | null,
  priorContext: string,
): string {
  return `Extract chart data from the execution results and output a structured chart specification.

## Task Description
${stepDescription}

## Chart Type Required
${chartType}

${sqlData ? `## SQL Query Results\n\`\`\`\n${sqlData}\n\`\`\`` : ''}

${priorContext ? `## Results from Prior Steps\n${priorContext}` : ''}

## Extraction Rules

### General Rules (All Chart Types)
1. Extract ONLY the data needed for the ${chartType} chart from the results above
2. Keep all labels concise (max 25 characters) — truncate or abbreviate long names
3. Round all numbers to 2 decimal places maximum
4. For rankings or "top N" analysis, order data by value descending
5. Ensure all arrays are the same length where required (e.g., categories and series data)
6. Use descriptive but concise title (max 60 characters)
7. Include units in axis labels where appropriate (e.g., "Revenue ($M)", "Count")

### Bar Chart Rules (type: "bar")
- Provide **categories** array (x-axis labels as strings)
- Provide **series** array (one or more series, each with label and data array)
- Each series data array must have same length as categories array
- Use **layout: "horizontal"** for rankings or when category labels are long (>15 chars)
- Use **layout: "vertical"** (default) for time series or short category names
- Order categories logically (chronological for time, descending by value for rankings)

### Line Chart Rules (type: "line")
- Provide **categories** array (x-axis labels, typically time periods)
- Provide **series** array (one or more trend lines)
- Each series data array must match categories array length
- Preserve time ordering in categories (do NOT sort by value)
- Use clear time labels (e.g., "Jan 2025", "Q1", "Week 1")

### Pie Chart Rules (type: "pie")
- Provide **slices** array with label and value for each slice
- Maximum 8 slices — if more, keep top 7 by value and group remaining as "Other"
- Order slices by value descending
- Ensure all values are positive (pie charts cannot show negative values)
- Do NOT use pie charts for temporal data (use line chart instead)

### Scatter Plot Rules (type: "scatter")
- Provide **points** array with x and y coordinates
- Optionally include **label** for each point (shown on hover tooltip)
- Ensure x and y are numeric values
- Use axis labels to describe what x and y represent

## Output Format

You MUST return a valid JSON object matching the ChartSpec schema. The schema validator will enforce:
- \`type\` is one of: bar, line, pie, scatter
- \`title\` is a non-empty string (max 60 chars)
- For bar/line: both \`categories\` and \`series\` are present and arrays match in length
- For pie: \`slices\` array is present with max 8 items
- For scatter: \`points\` array is present with numeric x/y values

Now extract the chart data from the results above and return a valid ChartSpec JSON object.`;
}
