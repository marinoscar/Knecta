import { PlanArtifact } from '../types';

export function buildNavigatorPrompt(plan: PlanArtifact): string {
  const stepsSection = plan.steps
    .filter((s) => s.strategy !== 'python')
    .map((s) => `- Step ${s.id}: ${s.description} (datasets: ${s.datasets.join(', ') || 'unknown'})`)
    .join('\n');

  return `You are a data navigator. Your job is to explore the ontology and find the correct datasets and join paths for the planned SQL queries.

## Plan to Support

Intent: ${plan.intent}
Grain: ${plan.grain}
${plan.timeWindow ? `Time Window: ${plan.timeWindow}` : ''}

SQL-involving steps:
${stepsSection || 'No SQL steps found.'}

## Your Task

1. Use \`list_datasets\` to see all available datasets if the plan references unknown tables.
2. Use \`get_dataset_details\` to inspect schema (columns, types) of candidate datasets.
3. Use \`get_relationships\` to discover join paths between datasets.
4. For each SQL step in the plan, identify:
   - Which datasets contain the needed columns
   - How to join them (using ONLY the relationships from the ontology)
   - Any column name mappings or expressions needed

## CRITICAL RULES

- You MUST use relationships from the ontology for joins. Do NOT guess join keys.
- If no relationship exists between two datasets, report it — do not fabricate a join.
- Verify column names against the actual schema before recommending them.
- Report back when you have found all needed information.`;
}
