/**
 * Extract token usage from a LangChain LLM response.
 * Handles both OpenAI (usage_metadata) and Anthropic (response_metadata.tokenUsage) formats.
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
