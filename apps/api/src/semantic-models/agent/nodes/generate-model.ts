import { AgentStateType } from '../state';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage } from '@langchain/core/messages';

export function createGenerateModelNode(llm: BaseChatModel) {
  return async (state: AgentStateType) => {
    const modelName = state.modelName || `Model for ${state.databaseName}`;

    const generatePrompt = `Based on all the information you've gathered from the database, now generate the complete OSI semantic model as a JSON object.

The model name MUST be: "${modelName}"

The model must be a valid JSON object following this structure:
{
  "semantic_model": [{
    "name": "${modelName}",
    "description": "...",
    "ai_context": {
      "instructions": "...",
      "synonyms": ["domain term 1", "domain term 2", ...]
    },
    "datasets": [{
      "name": "table_name",
      "source": "database.schema.table",
      "description": "...",
      "ai_context": {
        "synonyms": ["business term 1", "alternative name", ...],
        "sample_data": [...],
        "notes": "..."
      },
      "fields": [{
        "name": "column_name",
        "expression": { "dialects": [{ "dialect": "ANSI_SQL", "expression": "column_name" }] },
        "description": "...",
        "ai_context": {
          "synonyms": ["alternative name 1", "business term", ...]
        }
      }],
      ...
    }],
    "relationships": [...],
    "metrics": [...],
    "custom_extensions": [...]
  }]
}

Requirements:
- The model name MUST be "${modelName}"
- Include ALL discovered tables as datasets
- Include ALL columns as fields with ANSI_SQL expressions
- Include BOTH explicit FKs and inferred relationships
- For inferred relationships, add ai_context noting the confidence level and that it's inferred
- Include sample_data in each dataset's ai_context
- Generate SUM, AVG, COUNT metrics for numeric columns
- Generate COUNT DISTINCT metrics for categorical columns that appear to be identifiers or categories
- Set dimension.is_time to true for date/timestamp columns
- Set the source as "database.schema.table" format

CRITICAL - Synonym Requirements (DO NOT SKIP):
- Model-level ai_context MUST have "synonyms" with domain terms and industry keywords (at least 5)
- EVERY dataset ai_context MUST have "synonyms" with business-friendly names and alternative terms (at least 3-5 per dataset)
- EVERY field ai_context MUST have "synonyms" with alternative column names, abbreviation expansions, and business terms (at least 3 per field)
- Expand all abbreviations (e.g., "prod" → "production", "vol" → "volume", "qty" → "quantity")
- Include both technical and business-friendly terms

Output ONLY the JSON object, nothing else.`;

    const response = await llm.invoke([
      ...state.messages,
      new HumanMessage(generatePrompt),
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
