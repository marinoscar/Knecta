import { PlanArtifact, StepResult, VerificationReport } from '../types';

export function buildExplainerPrompt(
  userQuestion: string,
  plan: PlanArtifact,
  stepResults: StepResult[],
  verificationReport: VerificationReport | null,
  conversationContext: string,
  userPreferences?: Array<{ key: string; value: string }>,
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

  const preferencesSection = userPreferences && userPreferences.length > 0
    ? `\n## User Preferences\n\nTailor your response considering these user preferences:\n${userPreferences.map((p) => `- **${p.key}**: ${p.value}`).join('\n')}\n`
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
${preferencesSection}
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

export function buildConversationalPrompt(
  userQuestion: string,
  plan: PlanArtifact,
  conversationContext: string,
  datasetDetails?: Array<{ name: string; description: string; source: string; yaml: string }>,
  userPreferences?: Array<{ key: string; value: string }>,
): string {
  const datasetsSection = datasetDetails && datasetDetails.length > 0
    ? `\n## Available Datasets\n\n${datasetDetails.map((ds) => `- **${ds.name}**: ${ds.description} (source: \`${ds.source}\`)`).join('\n')}`
    : '';

  const preferencesSection = userPreferences && userPreferences.length > 0
    ? `\n## User Preferences\n\nApply these user preferences when formatting your response:\n\n${userPreferences.map((p) => `- **${p.key}**: ${p.value}`).join('\n')}`
    : '';

  return `You are a helpful data analyst assistant. Answer the user's question directly based on your knowledge and the conversation context.

This is a conversational question that does not require querying any database. Provide a clear, helpful answer.

## User's Question
${userQuestion}

## Intent
${plan.intent}
${datasetsSection}
${preferencesSection}

## Previous Conversation
${conversationContext || 'This is the start of the conversation.'}

Provide a clear, concise answer. Use markdown formatting where helpful.`;
}
