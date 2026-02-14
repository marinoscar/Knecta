import { extractTokenUsage, mergeTokenUsage } from './token-tracker';

describe('Token Tracker Utilities', () => {
  describe('extractTokenUsage', () => {
    it('should extract tokens from OpenAI format (response_metadata.usage)', () => {
      const response = {
        response_metadata: {
          usage: {
            prompt_tokens: 150,
            completion_tokens: 75,
          },
        },
      };

      const result = extractTokenUsage(response);

      expect(result).toEqual({
        prompt: 150,
        completion: 75,
        total: 225,
      });
    });

    it('should extract tokens from Anthropic format (usage_metadata)', () => {
      const response = {
        usage_metadata: {
          input_tokens: 200,
          output_tokens: 100,
        },
      };

      const result = extractTokenUsage(response);

      expect(result).toEqual({
        prompt: 200,
        completion: 100,
        total: 300,
      });
    });

    it('should return zeros for null response', () => {
      const result = extractTokenUsage(null);

      expect(result).toEqual({
        prompt: 0,
        completion: 0,
        total: 0,
      });
    });

    it('should return zeros for undefined response', () => {
      const result = extractTokenUsage(undefined);

      expect(result).toEqual({
        prompt: 0,
        completion: 0,
        total: 0,
      });
    });

    it('should return zeros for empty response object', () => {
      const result = extractTokenUsage({});

      expect(result).toEqual({
        prompt: 0,
        completion: 0,
        total: 0,
      });
    });

    it('should return zeros when usage fields are missing', () => {
      const response = {
        response_metadata: {
          // usage object missing
        },
      };

      const result = extractTokenUsage(response);

      expect(result).toEqual({
        prompt: 0,
        completion: 0,
        total: 0,
      });
    });

    it('should handle partial OpenAI usage fields', () => {
      const response = {
        response_metadata: {
          usage: {
            prompt_tokens: 100,
            // completion_tokens missing
          },
        },
      };

      const result = extractTokenUsage(response);

      expect(result).toEqual({
        prompt: 100,
        completion: 0,
        total: 100,
      });
    });

    it('should handle partial Anthropic usage fields', () => {
      const response = {
        usage_metadata: {
          input_tokens: 50,
          // output_tokens missing
        },
      };

      const result = extractTokenUsage(response);

      expect(result).toEqual({
        prompt: 50,
        completion: 0,
        total: 50,
      });
    });

    it('should prefer OpenAI format when both formats are present', () => {
      const response = {
        response_metadata: {
          usage: {
            prompt_tokens: 150,
            completion_tokens: 75,
          },
        },
        usage_metadata: {
          input_tokens: 200,
          output_tokens: 100,
        },
      };

      const result = extractTokenUsage(response);

      // OpenAI format takes precedence (OR logic)
      expect(result).toEqual({
        prompt: 150,
        completion: 75,
        total: 225,
      });
    });
  });

  describe('mergeTokenUsage', () => {
    it('should merge two non-zero usage objects', () => {
      const a = { prompt: 100, completion: 50, total: 150 };
      const b = { prompt: 200, completion: 75, total: 275 };

      const result = mergeTokenUsage(a, b);

      expect(result).toEqual({
        prompt: 300,
        completion: 125,
        total: 425,
      });
    });

    it('should merge with a zero usage object (identity)', () => {
      const a = { prompt: 150, completion: 75, total: 225 };
      const b = { prompt: 0, completion: 0, total: 0 };

      const result = mergeTokenUsage(a, b);

      expect(result).toEqual({
        prompt: 150,
        completion: 75,
        total: 225,
      });
    });

    it('should merge two zero usage objects', () => {
      const a = { prompt: 0, completion: 0, total: 0 };
      const b = { prompt: 0, completion: 0, total: 0 };

      const result = mergeTokenUsage(a, b);

      expect(result).toEqual({
        prompt: 0,
        completion: 0,
        total: 0,
      });
    });

    it('should be commutative (order does not matter)', () => {
      const a = { prompt: 100, completion: 50, total: 150 };
      const b = { prompt: 200, completion: 75, total: 275 };

      const resultAB = mergeTokenUsage(a, b);
      const resultBA = mergeTokenUsage(b, a);

      expect(resultAB).toEqual(resultBA);
      expect(resultAB).toEqual({
        prompt: 300,
        completion: 125,
        total: 425,
      });
    });

    it('should handle multiple merges (associative)', () => {
      const a = { prompt: 100, completion: 50, total: 150 };
      const b = { prompt: 200, completion: 75, total: 275 };
      const c = { prompt: 50, completion: 25, total: 75 };

      const result1 = mergeTokenUsage(mergeTokenUsage(a, b), c);
      const result2 = mergeTokenUsage(a, mergeTokenUsage(b, c));

      expect(result1).toEqual(result2);
      expect(result1).toEqual({
        prompt: 350,
        completion: 150,
        total: 500,
      });
    });
  });
});
