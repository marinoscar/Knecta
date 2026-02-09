export function buildQualityReviewPrompt(modelJson: string): string {
  return `Review this OSI semantic model for quality. Structural validation has already passed.

Focus ONLY on these quality aspects:
1. Are field descriptions meaningful (not just repeating the column name)?
2. Are synonyms diverse and useful (not repeating the field/dataset name)?
3. Are metrics reasonable for the column types?
4. Do relationships make business sense?
5. Are ai_context instructions helpful?

Model:
\`\`\`json
${modelJson}
\`\`\`

If quality is acceptable, respond: QUALITY_OK
If there are significant issues, respond: QUALITY_ISSUES: followed by a brief numbered list of the most important problems (max 5).

Be concise. Only flag genuinely problematic items, not minor style preferences.`;
}
