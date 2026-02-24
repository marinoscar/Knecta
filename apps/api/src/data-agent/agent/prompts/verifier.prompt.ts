import { PlanArtifact, StepResult } from '../types';

export function buildVerifierPrompt(
  plan: PlanArtifact,
  stepResults: StepResult[],
  webSearchEnabled: boolean = false,
): string {
  const checksSection = plan.acceptanceChecks.length > 0
    ? plan.acceptanceChecks.map((c, i) => `${i + 1}. ${c}`).join('\n')
    : '- Row count > 0\n- No unexpected NULLs in key columns\n- Results are reasonable';

  const resultsSection = stepResults.map((r) => {
    let detail = `### Step ${r.stepId}: ${r.description}\nStrategy: ${r.strategy}`;
    if (r.error) detail += `\nError: ${r.error}`;
    if (r.sqlResult) detail += `\nSQL: ${r.sqlResult.rowCount} rows, columns: ${r.sqlResult.columns.join(', ')}\nSample:\n${r.sqlResult.data.split('\n').slice(0, 10).join('\n')}`;
    if (r.pythonResult) detail += `\nPython output: ${r.pythonResult.stdout.substring(0, 500)}`;
    return detail;
  }).join('\n\n');

  return `You are a data verification specialist. Your job is to generate Python code that validates the execution results against the plan's acceptance criteria.

## Acceptance Checks
${checksSection}

## Execution Results
${resultsSection}

## Instructions

Write Python code that:
1. Parses the step results data
2. Runs each acceptance check programmatically
3. Prints a JSON summary with format: {"passed": true/false, "checks": [{"name": "...", "passed": true/false, "message": "..."}]}

Focus on:
- **Grain correctness**: Is the data at the expected level of detail? (e.g., if grain is "per store per month", verify no duplicate store-month combos)
- **Join explosion**: Did JOINs multiply rows unexpectedly? (compare row counts before/after)
- **NULL contamination**: Are there unexpected NULLs in metric or dimension columns?
- **Reasonableness**: Are values within plausible ranges?
- **Completeness**: Are all expected dimensions represented?

${webSearchEnabled ? `## Web Search\nWeb search is available. You may use it to check expected data ranges, industry benchmarks, or reasonableness of results.\n\n` : ''}Output ONLY executable Python code. No markdown fences. The code MUST print a JSON object as the last line of output.`;
}
