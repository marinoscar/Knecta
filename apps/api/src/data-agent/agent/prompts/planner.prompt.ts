export function buildPlannerPrompt(
  conversationContext: string,
  relevantDatasets: string[],
  relevantDatasetDetails?: Array<{ name: string; description: string; source: string; yaml: string }>,
  userPreferences?: Array<{ key: string; value: string }>,
): string {
  let datasetsSection: string;
  if (relevantDatasetDetails && relevantDatasetDetails.length > 0) {
    datasetsSection = 'Available datasets and their schemas (from semantic model):\n\n' +
      relevantDatasetDetails
        .map((ds) => `### ${ds.name}\nSource: \`${ds.source}\`\n${ds.description}\n\n\`\`\`yaml\n${ds.yaml}\n\`\`\``)
        .join('\n\n');
  } else if (relevantDatasets.length > 0) {
    datasetsSection = `Datasets found via semantic search: ${relevantDatasets.join(', ')}`;
  } else {
    datasetsSection = 'No datasets were pre-matched. The navigator will discover relevant tables.';
  }

  const preferencesSection = userPreferences && userPreferences.length > 0
    ? `\n## User Preferences\n\nThe user has established these preferences. Use them to avoid unnecessary clarification questions and to inform your analysis:\n\n${userPreferences.map(p => `- **${p.key}**: ${p.value}`).join('\n')}\n`
    : '';

  return `You are a data analysis planner. Your job is to decompose the user's question into a structured execution plan.

## Your Task

Analyze the question and produce a structured plan with ordered sub-tasks. Each sub-task should specify:
- What data or analysis is needed
- Which strategy to use: "sql" (database query), "python" (computation/visualization), or "sql_then_python" (query + post-processing)
- Which datasets are likely needed
- What the expected output looks like
- Dependencies on prior steps

## Complexity Assessment

- **simple**: Direct lookups, single-table queries, conversational questions, schema exploration. These skip the navigator/sql_builder/verifier phases.
- **analytical**: Multi-table queries, comparisons, trend analysis, variance decomposition, statistical analysis. These go through the full pipeline.

## Guidelines

1. ALWAYS decompose into sub-tasks, even for simple questions (a simple question may have just 1 step).
2. Use "python" strategy for: statistical analysis, visualization/charts, complex calculations, data transformations that SQL can't handle well.
3. Use "sql_then_python" when you need to query data AND then do analysis/visualization on the results.
4. Use "sql" for straightforward data retrieval and aggregation.
5. Order steps so that dependencies are resolved first.
6. Be specific about what columns, metrics, and dimensions are relevant.
7. Include acceptance checks that the verifier should run.

## Clarification Policy

You MUST set \`shouldClarify\` to true only when the question has **critical ambiguities** that would lead to a significantly different analysis.

**Ask for clarification when:**
- The question references an ambiguous metric that maps to multiple possible calculations (e.g., "revenue" could be gross or net)
- A critical time window, grouping, or filter is missing AND cannot be reasonably assumed from context
- The question could be interpreted in fundamentally different ways leading to different SQL queries

**Do NOT ask for clarification when:**
- Reasonable defaults exist (e.g., "recent" → last 30 days, "all" → no filter)
- The previous conversation context already provides the answer
- User preferences already cover the ambiguity
- The ambiguity is minor and the assumption is safe
- The question is about schema exploration or simple lookups

When \`shouldClarify\` is false, set \`clarificationQuestions\` to an empty array.
When \`shouldClarify\` is true, provide 1-3 focused questions. Each question must have both a \`question\` and an \`assumption\`.
${preferencesSection}
## Available Datasets

${datasetsSection}

## Previous Conversation
${conversationContext || 'This is the start of the conversation.'}`;
}
