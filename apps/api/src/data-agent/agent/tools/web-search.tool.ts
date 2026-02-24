import { tools as openAITools } from '@langchain/openai';
import { tools as anthropicTools } from '@langchain/anthropic';

/**
 * Creates a provider-appropriate web search server tool.
 * Server-side tools are executed by the provider's API (OpenAI/Anthropic),
 * not by our code. Results are embedded in the response content.
 *
 * These tools are transparent to the mini-ReAct loop — they do NOT appear
 * in `response.tool_calls`, only in `response.content`.
 */
export function createWebSearchTool(
  provider: string,
): Record<string, unknown> | null {
  switch (provider) {
    case 'openai':
    case 'azure':
      return openAITools.webSearch();
    case 'anthropic':
      return anthropicTools.webSearch_20250305({ maxUses: 5 });
    default:
      return null;
  }
}
