import { PlanArtifact, JoinPlanArtifact } from '../types';

export function buildSqlBuilderPrompt(
  plan: PlanArtifact,
  joinPlan: JoinPlanArtifact,
  databaseType: string,
  revisionDiagnosis: string | null,
): string {
  // Build dataset schema section
  const schemaSection = joinPlan.relevantDatasets
    .map((ds) => `- **${ds.name}** (source: ${ds.source}): ${ds.description}`)
    .join('\n');

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

## Available Datasets
${schemaSection || 'No datasets specified.'}

## Join Paths (from ontology)
${joinSection || 'No join paths available.'}

## Steps to Generate SQL For
${stepsSection || 'No SQL steps found.'}
${revisionSection}
## Rules

1. Use ONLY the join paths from the ontology above. Do NOT guess join keys.
2. Use schema-qualified table names from the dataset 'source' field.
3. For each step, generate TWO queries:
   - **Pilot SQL**: A lightweight probe (LIMIT 10) to verify the query structure works
   - **Full SQL**: The complete query without artificial LIMIT (unless the step requires one)
4. Use appropriate SQL dialect for ${databaseType}.
5. Handle NULLs explicitly (COALESCE, IS NOT NULL, etc.).
6. Use DATE_TRUNC for time-based groupings when applicable.
7. Include column aliases that match the expected output description.`;
}
