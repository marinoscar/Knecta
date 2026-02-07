import { AgentStateType } from '../state';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage } from '@langchain/core/messages';

const GENERATE_PROMPT = `Based on all the information you've gathered from the database, now generate the complete OSI semantic model as a JSON object.

The model must be a valid JSON object following this structure:
{
  "semantic_model": [{
    "name": "model_name",
    "description": "...",
    "ai_context": { "instructions": "...", "synonyms": [...] },
    "datasets": [...],
    "relationships": [...],
    "metrics": [...],
    "custom_extensions": [...]
  }]
}

Requirements:
- Include ALL discovered tables as datasets
- Include ALL columns as fields with ANSI_SQL expressions
- Include BOTH explicit FKs and inferred relationships
- For inferred relationships, add ai_context noting the confidence level and that it's inferred
- Include sample_data in each dataset's ai_context
- Generate SUM, AVG, COUNT metrics for numeric columns
- Generate COUNT DISTINCT metrics for categorical columns that appear to be identifiers or categories
- Set dimension.is_time to true for date/timestamp columns
- Set the source as "database.schema.table" format

Output ONLY the JSON object, nothing else.`;

export function createGenerateModelNode(llm: BaseChatModel) {
  return async (state: AgentStateType) => {
    const response = await llm.invoke([
      ...state.messages,
      new HumanMessage(GENERATE_PROMPT),
    ]);

    let modelJson: Record<string, unknown> | null = null;
    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        modelJson = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      // Will be handled by error state
    }

    return {
      messages: [response],
      semanticModel: modelJson,
    };
  };
}
