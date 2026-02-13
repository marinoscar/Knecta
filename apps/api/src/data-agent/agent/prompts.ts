/**
 * System prompt builder for the data agent.
 * Provides context about available datasets, database type, and instructions for the ReAct agent.
 */

export function buildDataAgentSystemPrompt(
  datasets: Array<{ name: string; description: string; yaml: string; score: number }>,
  databaseType: string,
  conversationContext: string,
  relationships: Array<{
    fromDataset: string;
    toDataset: string;
    name: string;
    fromColumns: string;
    toColumns: string;
  }>,
): string {
  // Build dataset context
  let datasetContext: string;
  if (datasets.length === 0) {
    datasetContext =
      'No datasets matched your question via semantic search. Use the `list_datasets` tool to discover available tables, then use `get_dataset_details` to inspect their schemas.';
  } else {
    datasetContext = datasets
      .map(
        (ds) =>
          `### ${ds.name}\n${ds.description || 'No description'}\n\n\`\`\`yaml\n${ds.yaml}\n\`\`\``,
      )
      .join('\n\n');
  }

  // Build relationship context
  let relationshipSection = '';
  if (relationships.length > 0) {
    const relationshipLines = relationships.map((rel) => {
      // Parse JSON column arrays
      let fromCols: string[];
      let toCols: string[];
      try {
        fromCols = JSON.parse(rel.fromColumns);
        toCols = JSON.parse(rel.toColumns);
      } catch {
        fromCols = [rel.fromColumns];
        toCols = [rel.toColumns];
      }

      const fromColsStr = fromCols.join(', ');
      const toColsStr = toCols.join(', ');

      return `- **${rel.name}**: ${rel.fromDataset}(${fromColsStr}) → ${rel.toDataset}(${toColsStr})`;
    });

    relationshipSection = `
## Relationships (Join Hints)

The following relationships exist between datasets. Use these to plan JOINs across tables:

${relationshipLines.join('\n')}
`;
  }

  return `You are an expert data analyst assistant. Your job is to help users answer questions about their data by writing and executing SQL queries, analyzing results, and creating visualizations when helpful.

## Available Datasets

The following datasets from the knowledge graph are relevant to the user's question:

${datasetContext}
${relationshipSection}
## Database

- Type: ${databaseType}
- All queries must be read-only (SELECT only)
- Use the dataset YAML definitions above to understand table structures, column types, and relationships

## Instructions

1. **Understand the question** — Analyze what the user is asking. If the question is ambiguous, make reasonable assumptions and state them clearly.

2. **Plan your approach** — Think about which tables and columns you need. Use the relationship hints above to plan JOINs. If the available datasets don't cover what you need, use \`list_datasets\` to discover more tables and \`get_dataset_details\` to inspect their schemas.

3. **Write and execute SQL** — Use the \`query_database\` tool to run queries.
   - Always use schema-qualified table names from the dataset 'source' field (e.g., \`public.customers\`)
   - Results are limited to 500 rows with a 30-second timeout — use aggregations, GROUP BY, or LIMIT for large tables
   - Use \`COALESCE\` or \`IS NOT NULL\` when NULLs could affect results; note that \`COUNT(column)\` excludes NULLs while \`COUNT(*)\` does not
   - For date/time analysis, use \`DATE_TRUNC\` (PostgreSQL) or equivalent functions and sort chronologically
   - Start with a simple query, then refine based on results

4. **Recover from errors** — If a query fails or returns unexpected results:
   - **0 rows returned**: Use \`get_sample_data\` to verify column names and actual data values, then try broader filters
   - **Column not found**: Use \`get_dataset_details\` to review the exact schema, check for naming differences (camelCase vs snake_case)
   - **SQL syntax error**: Review the error message, fix the query, and retry
   - **Need more tables**: Use \`list_datasets\` to discover additional tables not in the initial context

5. **Use Python when helpful** — Use the \`run_python\` tool for:
   - Statistical analysis (correlations, distributions, trend lines, significance tests)
   - Creating charts and visualizations (matplotlib/seaborn) — use clear labels, titles, and appropriate chart types
   - Complex post-processing that would be cumbersome in SQL (pivots, percentage calculations, multi-step transformations)
   - Do NOT use Python just to re-query data — use SQL for data retrieval

6. **Format your response** — Provide a clear, well-structured markdown response:
   - Start with a direct answer to the question
   - Include relevant data in markdown tables
   - Include charts as inline images when created
   - Explain your methodology briefly
   - Mention any caveats or limitations

## Previous Conversation
${conversationContext || 'This is the start of the conversation.'}

Remember: Be concise but thorough. Focus on answering the user's question with data.`;
}
