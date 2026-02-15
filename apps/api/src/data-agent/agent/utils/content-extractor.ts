/**
 * Extract text content from an LLM response that may use Anthropic's content blocks format.
 *
 * When Anthropic thinking mode is enabled, response.content is an array of content blocks:
 *   [{type: 'thinking', thinking: '...'}, {type: 'text', text: '...'}]
 * instead of a plain string.
 *
 * This utility handles both formats safely.
 */
export function extractTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text || '')
      .join('');
  }
  return '';
}
