import { Logger } from '@nestjs/common';

const logger = new Logger('AgentUtils');

/**
 * Extract JSON from LLM response, handling markdown code blocks
 */
export function extractJson(content: string): Record<string, unknown> | null {
  let cleaned = content.trim();

  // Strip markdown code blocks (```json, ```JSON, ```javascript, bare ```)
  const codeBlockMatch = cleaned.match(/^```\w*\s*\n?([\s\S]*?)\n?\s*```$/);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Extract token usage from LLM response
 */
export function extractTokenUsage(response: any): { prompt: number; completion: number; total: number } {
  if (response.usage_metadata) {
    return {
      prompt: response.usage_metadata.input_tokens || 0,
      completion: response.usage_metadata.output_tokens || 0,
      total: response.usage_metadata.total_tokens || 0,
    };
  }
  if (response.response_metadata?.tokenUsage) {
    const tu = response.response_metadata.tokenUsage;
    return {
      prompt: tu.promptTokens || 0,
      completion: tu.completionTokens || 0,
      total: tu.totalTokens || 0,
    };
  }
  return { prompt: 0, completion: 0, total: 0 };
}
