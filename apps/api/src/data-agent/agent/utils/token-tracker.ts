/**
 * Utilities for extracting and merging token usage from LangChain LLM responses.
 */

/**
 * Extract token usage from a LangChain LLM response (AIMessage).
 * Supports OpenAI (response_metadata.usage) and Anthropic (usage_metadata) formats.
 */
export function extractTokenUsage(response: any): { prompt: number; completion: number; total: number } {
  const rmUsage = response?.response_metadata?.usage;
  const umUsage = response?.usage_metadata;
  const prompt = rmUsage?.prompt_tokens || umUsage?.input_tokens || 0;
  const completion = rmUsage?.completion_tokens || umUsage?.output_tokens || 0;
  return { prompt, completion, total: prompt + completion };
}

/**
 * Merge two token usage objects by summing all fields.
 */
export function mergeTokenUsage(
  a: { prompt: number; completion: number; total: number },
  b: { prompt: number; completion: number; total: number },
): { prompt: number; completion: number; total: number } {
  return {
    prompt: a.prompt + b.prompt,
    completion: a.completion + b.completion,
    total: a.total + b.total,
  };
}
