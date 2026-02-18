import { PlanArtifact, JoinPlanArtifact } from '../types';

export function buildSqlBuilderPrompt(
  plan: PlanArtifact,
  joinPlan: JoinPlanArtifact,
  databaseType: string,
  revisionDiagnosis: string | null,
): string {
  // Build dataset schema section with full YAML from semantic model
  const schemaSection = joinPlan.relevantDatasets
    .map((ds) => `### ${ds.name}\nSource: \`${ds.source}\`\n${ds.description}\n\n\`\`\`yaml\n${ds.yaml}\n\`\`\``)
    .join('\n\n');

  // Build join paths section
  const joinSection = joinPlan.joinPaths
    .map((jp) => {
      const edges = jp.edges.map(
        (e) => `  ${e.fromDataset}(${e.fromColumns.join(', ')}) → ${e.toDataset}(${e.toColumns.join(', ')})`,
      );
      return `- Path: ${jp.datasets.join(' → ')}\n${edges.join('\n')}`;
    })
    .join('\n');

  // Build steps section (only SQL-involving steps)
  const sqlSteps = plan.steps.filter((s) => s.strategy !== 'python');
  const stepsSection = sqlSteps
    .map((s) => `- Step ${s.id}: ${s.description}\n  Strategy: ${s.strategy}\n  Datasets: ${s.datasets.join(', ')}\n  Expected: ${s.expectedOutput}`)
    .join('\n');

  // Revision context
  const revisionSection = revisionDiagnosis
    ? `\n## REVISION REQUIRED\n\nThe verifier found issues with the previous SQL. Diagnosis:\n${revisionDiagnosis}\n\nPlease fix the SQL based on this feedback.\n`
    : '';

  return `You are a SQL query builder. Generate precise SQL queries for each step in the execution plan.

## Database Type
${databaseType}

## Dataset Schemas (from semantic model)

The YAML below is the **authoritative schema** for each dataset. Use ONLY column names, types, and expressions from these definitions. Do NOT guess or invent column names.

${schemaSection || 'No datasets specified.'}

## Join Paths (from ontology)
${joinSection || 'No join paths available.'}

## Steps to Generate SQL For
${stepsSection || 'No SQL steps found.'}
${revisionSection}
## Rules

1. Use ONLY the column names from the semantic model YAML above and join paths from the ontology. Do NOT guess column names or join keys.
2. Use schema-qualified table names from the dataset 'source' field.
3. For each step, generate TWO queries:
   - **Pilot SQL**: A lightweight probe (LIMIT 10) to verify the query structure works
   - **Full SQL**: The complete query without artificial LIMIT (unless the step requires one)
4. Use appropriate SQL dialect for ${databaseType}.
5. Dialect notes:
   - PostgreSQL: Use double-quoted identifiers, \`::type\` for casts, \`ILIKE\` for case-insensitive matching.
   - Snowflake: Identifiers are case-insensitive (stored uppercase). Use double-quoted identifiers to preserve case. Supports \`LIMIT\`, \`DATE_TRUNC\`, \`ILIKE\`, \`::type\` casts (similar to PostgreSQL). Use \`FLATTEN()\` for semi-structured data.
6. Handle NULLs explicitly (COALESCE, IS NOT NULL, etc.).
7. Use DATE_TRUNC for time-based groupings when applicable.
8. Include column aliases that match the expected output description.`;
}
