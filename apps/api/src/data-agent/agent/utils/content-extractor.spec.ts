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
});
