/**
 * Extract text content from an LLM response that may use various content block formats.
 *
 * Handles the following formats:
 * - Plain string (standard response)
 * - Anthropic thinking mode: [{type: 'thinking', thinking: '...'}, {type: 'text', text: '...'}]
 * - OpenAI Responses API: [{type: 'output_text', text: '...'}]
 *
 * This utility handles all formats safely.
 */
export function extractTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .filter((block: any) => block.type === 'text' || block.type === 'output_text')
      .map((block: any) => block.text || '')
      .join('');
  }
  return '';
}
