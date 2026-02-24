import { extractTextContent } from './content-extractor';

describe('extractTextContent', () => {
  describe('plain string content', () => {
    it('should return the string as-is', () => {
      const content = 'This is a plain string response';
      expect(extractTextContent(content)).toBe('This is a plain string response');
    });

    it('should return empty string when given empty string', () => {
      expect(extractTextContent('')).toBe('');
    });
  });

  describe('array with single text block', () => {
    it('should extract text from single text block', () => {
      const content = [{ type: 'text', text: 'Single text block' }];
      expect(extractTextContent(content)).toBe('Single text block');
    });
  });

  describe('array with thinking + text blocks', () => {
    it('should return only text, skipping thinking blocks', () => {
      const content = [
        { type: 'thinking', thinking: 'Internal reasoning here...' },
        { type: 'text', text: 'Final answer' },
      ];
      expect(extractTextContent(content)).toBe('Final answer');
    });

    it('should handle multiple thinking blocks with text', () => {
      const content = [
        { type: 'thinking', thinking: 'First thought' },
        { type: 'thinking', thinking: 'Second thought' },
        { type: 'text', text: 'User-facing response' },
      ];
      expect(extractTextContent(content)).toBe('User-facing response');
    });

    it('should handle interleaved thinking and text blocks', () => {
      const content = [
        { type: 'thinking', thinking: 'Thinking about part 1' },
        { type: 'text', text: 'Part 1' },
        { type: 'thinking', thinking: 'Thinking about part 2' },
        { type: 'text', text: ' Part 2' },
      ];
      expect(extractTextContent(content)).toBe('Part 1 Part 2');
    });
  });

  describe('array with multiple text blocks', () => {
    it('should concatenate multiple text blocks', () => {
      const content = [
        { type: 'text', text: 'First part. ' },
        { type: 'text', text: 'Second part. ' },
        { type: 'text', text: 'Third part.' },
      ];
      expect(extractTextContent(content)).toBe('First part. Second part. Third part.');
    });
  });

  describe('empty array', () => {
    it('should return empty string for empty array', () => {
      expect(extractTextContent([])).toBe('');
    });
  });

  describe('null/undefined', () => {
    it('should return empty string for null', () => {
      expect(extractTextContent(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
      expect(extractTextContent(undefined)).toBe('');
    });
  });

  describe('array with no text blocks', () => {
    it('should return empty string when only thinking blocks present', () => {
      const content = [
        { type: 'thinking', thinking: 'Only internal thoughts' },
        { type: 'thinking', thinking: 'More internal thoughts' },
      ];
      expect(extractTextContent(content)).toBe('');
    });

    it('should return empty string when array has unknown block types', () => {
      const content = [
        { type: 'unknown', data: 'some data' },
        { type: 'other', value: 'some value' },
      ];
      expect(extractTextContent(content)).toBe('');
    });
  });

  describe('edge cases', () => {
    it('should handle text blocks with missing text property', () => {
      const content = [
        { type: 'text' }, // no text property
        { type: 'text', text: 'Valid text' },
      ];
      expect(extractTextContent(content)).toBe('Valid text');
    });

    it('should handle text blocks with null text property', () => {
      const content = [
        { type: 'text', text: null },
        { type: 'text', text: 'Valid text' },
      ];
      expect(extractTextContent(content)).toBe('Valid text');
    });

    it('should handle text blocks with empty text property', () => {
      const content = [
        { type: 'text', text: '' },
        { type: 'text', text: 'Valid text' },
      ];
      expect(extractTextContent(content)).toBe('Valid text');
    });

    it('should handle non-object array elements', () => {
      const content = [
        'plain string',
        42,
        { type: 'text', text: 'Valid text' },
      ];
      expect(extractTextContent(content)).toBe('Valid text');
    });

    it('should handle array with all empty text blocks', () => {
      const content = [
        { type: 'text', text: '' },
        { type: 'text', text: '' },
      ];
      expect(extractTextContent(content)).toBe('');
    });
  });

  describe('OpenAI Responses API output_text blocks', () => {
    it('should extract text from a single output_text block', () => {
      const content = [{ type: 'output_text', text: 'Response from Responses API' }];
      expect(extractTextContent(content)).toBe('Response from Responses API');
    });

    it('should concatenate multiple output_text blocks', () => {
      const content = [
        { type: 'output_text', text: 'Part one. ' },
        { type: 'output_text', text: 'Part two.' },
      ];
      expect(extractTextContent(content)).toBe('Part one. Part two.');
    });

    it('should handle mixed text and output_text blocks', () => {
      const content = [
        { type: 'text', text: 'Standard text block. ' },
        { type: 'output_text', text: 'Output text block.' },
      ];
      expect(extractTextContent(content)).toBe('Standard text block. Output text block.');
    });

    it('should ignore thinking blocks alongside output_text blocks', () => {
      const content = [
        { type: 'thinking', thinking: 'Internal reasoning' },
        { type: 'output_text', text: 'Final answer via Responses API' },
      ];
      expect(extractTextContent(content)).toBe('Final answer via Responses API');
    });

    it('should handle mixed thinking, text, and output_text blocks', () => {
      const content = [
        { type: 'thinking', thinking: 'Step 1 reasoning' },
        { type: 'text', text: 'Narrative text. ' },
        { type: 'thinking', thinking: 'Step 2 reasoning' },
        { type: 'output_text', text: 'API output text.' },
      ];
      expect(extractTextContent(content)).toBe('Narrative text. API output text.');
    });

    it('should return empty string for array containing only output_text with empty text', () => {
      const content = [{ type: 'output_text', text: '' }];
      expect(extractTextContent(content)).toBe('');
    });
  });

  describe('OpenAI vs Anthropic response formats', () => {
    it('should handle OpenAI response format (plain string content)', () => {
      // OpenAI returns: response.content = "The answer is 42"
      const openAiContent = 'The answer is 42. Here is the analysis...';
      expect(extractTextContent(openAiContent)).toBe(openAiContent);
    });

    it('should handle Anthropic response format without thinking (plain string)', () => {
      // Anthropic without thinking also returns plain string
      const anthropicContent = 'Based on the data, the top operators are...';
      expect(extractTextContent(anthropicContent)).toBe(anthropicContent);
    });

    it('should handle Anthropic response with thinking mode enabled', () => {
      // Anthropic with thinking returns array of content blocks
      const anthropicThinkingContent = [
        { type: 'thinking', thinking: 'Let me analyze the query step by step...' },
        { type: 'text', text: 'The top 5 operators by production are:' },
      ];
      expect(extractTextContent(anthropicThinkingContent)).toBe('The top 5 operators by production are:');
    });

    it('should handle Anthropic response with multiple thinking and text blocks', () => {
      const anthropicComplexContent = [
        { type: 'thinking', thinking: 'First, I need to understand the question...' },
        { type: 'text', text: 'Here is part 1 of the answer. ' },
        { type: 'thinking', thinking: 'Now let me elaborate...' },
        { type: 'text', text: 'And here is part 2.' },
      ];
      expect(extractTextContent(anthropicComplexContent)).toBe(
        'Here is part 1 of the answer. And here is part 2.'
      );
    });

    it('should handle Anthropic response with only thinking blocks (no text)', () => {
      // Edge case: thinking enabled but no text output (possible error state)
      const thinkingOnlyContent = [
        { type: 'thinking', thinking: 'I am thinking but produced no text output...' },
      ];
      expect(extractTextContent(thinkingOnlyContent)).toBe('');
    });

    it('should handle OpenAI response with complex multi-line content', () => {
      // OpenAI complex analytical response
      const openAiComplex = `Based on the analysis, here are the results:

1. Total production: 42,000 barrels
2. Average cost: $15.50 per barrel
3. Top operator: ACME Corp

The data shows a steady increase over the past quarter.`;
      expect(extractTextContent(openAiComplex)).toBe(openAiComplex);
    });

    it('should handle Anthropic thinking mode with detailed analysis', () => {
      // Anthropic with extended thinking process
      const anthropicDetailedThinking = [
        { type: 'thinking', thinking: 'Let me break down this query:\n1. Need to join production data\n2. Aggregate by operator\n3. Sort by total volume' },
        { type: 'text', text: 'Analysis complete. ' },
        { type: 'thinking', thinking: 'Now I should format the results in a readable way...' },
        { type: 'text', text: 'The top operators are:\n1. ACME Corp\n2. Global Oil\n3. Energy Inc' },
      ];
      expect(extractTextContent(anthropicDetailedThinking)).toBe(
        'Analysis complete. The top operators are:\n1. ACME Corp\n2. Global Oil\n3. Energy Inc'
      );
    });

    it('should handle Azure OpenAI response (same format as OpenAI)', () => {
      // Azure OpenAI uses the same response format as OpenAI
      const azureContent = 'Query executed successfully. Results: 150 records found.';
      expect(extractTextContent(azureContent)).toBe(azureContent);
    });

    it('should handle Anthropic thinking mode with reasoning_effort=high', () => {
      // When reasoning level is high, Anthropic may include longer thinking blocks
      const highReasoningContent = [
        {
          type: 'thinking',
          thinking: 'This is a complex multi-dataset query. I need to carefully consider:\n- Join paths between tables\n- Grain of the final result\n- Potential NULL values\n- Performance implications\n\nLet me validate my approach...',
        },
        {
          type: 'text',
          text: 'I have identified a safe join path through the ontology. The query will aggregate at the monthly level.',
        },
        {
          type: 'thinking',
          thinking: 'Good, now I can construct the SQL with confidence in the join correctness.',
        },
        {
          type: 'text',
          text: '\n\nFinal SQL:\nSELECT month, SUM(production) FROM wells GROUP BY month',
        },
      ];
      expect(extractTextContent(highReasoningContent)).toBe(
        'I have identified a safe join path through the ontology. The query will aggregate at the monthly level.\n\nFinal SQL:\nSELECT month, SUM(production) FROM wells GROUP BY month'
      );
    });
  });
});
