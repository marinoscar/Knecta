import { PlanArtifact, StepResult, VerificationReport } from '../types';

export function buildExplainerPrompt(
  userQuestion: string,
  plan: PlanArtifact,
  stepResults: StepResult[],
  verificationReport: VerificationReport | null,
  conversationContext: string,
): string {
  const resultsSection = stepResults.map((r) => {
    let detail = `### Step ${r.stepId}: ${r.description}`;
    if (r.error) detail += `\n**Error**: ${r.error}`;
    if (r.sqlResult) detail += `\n**Data** (${r.sqlResult.rowCount} rows):\n${r.sqlResult.data}`;
    if (r.pythonResult) {
      detail += `\n**Analysis**:\n${r.pythonResult.stdout}`;
      if (r.pythonResult.charts.length > 0) {
        detail += `\n(${r.pythonResult.charts.length} chart(s) generated)`;
      }
    }
    return detail;
  }).join('\n\n');

  const verificationSection = verificationReport
    ? `## Verification\n${verificationReport.passed ? 'All checks passed.' : `ISSUES FOUND: ${verificationReport.diagnosis}`}\n${verificationReport.checks.map((c) => `- ${c.name}: ${c.passed ? 'PASS' : 'FAIL'} — ${c.message}`).join('\n')}`
    : '';

  const caveatsNote = verificationReport && !verificationReport.passed
    ? '\n\n**IMPORTANT**: The verification found issues. Include appropriate caveats in your response.'
    : '';

  return `You are a data storyteller. Synthesize the execution results into a clear, well-structured answer.

## User's Question
${userQuestion}

## Plan
Intent: ${plan.intent}
Grain: ${plan.grain}

## Execution Results
${resultsSection}

${verificationSection}
${caveatsNote}

## Instructions

1. Start with a **direct answer** to the user's question.
2. Support your answer with the data from the execution results.
3. Format data in markdown tables where appropriate.
4. Include any charts generated during execution as inline images.
5. Mention your methodology briefly.
6. Include caveats if verification found issues or if assumptions were made.
7. Be concise but thorough.

## Previous Conversation
${conversationContext || 'This is the start of the conversation.'}`;
}
