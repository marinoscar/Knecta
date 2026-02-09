import { AgentStateType } from '../state';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { OSI_SPEC_TEXT } from '../osi/spec';

export function createValidateModelNode(llm: BaseChatModel) {
  return async (state: AgentStateType) => {
    const currentAttempts = state.validationAttempts;

    if (!state.semanticModel) {
      return {
        error: 'No semantic model to validate',
        messages: [new AIMessage('Validation skipped: No semantic model was generated.')],
        validationAttempts: currentAttempts + 1,
      };
    }

    const modelJson = JSON.stringify(state.semanticModel, null, 2);

    const validatePrompt = `You are validating a generated OSI semantic model against the specification.

## OSI Specification
${OSI_SPEC_TEXT}

## Model to Validate
\`\`\`json
${modelJson}
\`\`\`

## Validation Checklist
Check ALL of the following:

### Structure
1. Root has "semantic_model" array with at least one definition?
2. Model definition has "name" (string) and "datasets" (non-empty array)?
3. Every dataset has "name", "source", and "fields" (non-empty array)?
4. Every field has "name" and "expression" with at least one valid dialect entry?
5. Dialect values are valid (ANSI_SQL, SNOWFLAKE, MDX, TABLEAU, DATABRICKS)?

### Relationships
6. Every relationship has "name", "from", "to", "from_columns", "to_columns"?
7. Relationship "from" and "to" reference existing dataset names?
8. "from_columns" and "to_columns" have equal length?

### Metrics
9. Every metric has "name" and "expression" with at least one valid dialect entry?

### ai_context & Synonyms (CRITICAL)
10. Model-level definition has ai_context with non-empty synonyms array?
11. EVERY dataset has ai_context with non-empty synonyms array?
12. EVERY field has ai_context with non-empty synonyms array?
13. Synonyms contain meaningful business terms (not just the field name repeated)?

Respond with EXACTLY one of:
- "VALID" if ALL checks pass
- "INVALID: " followed by a numbered list of specific issues found, referencing which datasets, fields, or relationships have problems

Be precise and thorough.`;

    const response = await llm.invoke([new HumanMessage(validatePrompt)]);

    const content = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

    const isValid = content.trim().toUpperCase().startsWith('VALID');

    if (isValid) {
      return {
        messages: [new AIMessage('Model validation passed against OSI specification. Proceeding to save.')],
        validationAttempts: currentAttempts + 1,
      };
    }

    // Validation failed — clear model so generate_model can retry with feedback
    return {
      messages: [
        new AIMessage(`Model validation found issues (attempt ${currentAttempts + 1}). Please fix these issues and regenerate:\n${content}`),
      ],
      validationAttempts: currentAttempts + 1,
      semanticModel: null,
    };
  };
}
