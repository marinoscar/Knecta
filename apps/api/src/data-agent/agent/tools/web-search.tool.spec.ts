import { createWebSearchTool } from './web-search.tool';

// Mock the langchain provider tool modules so tests run without real API keys
jest.mock('@langchain/openai', () => ({
  tools: {
    webSearch: jest.fn(() => ({ type: 'web_search' })),
  },
}));

jest.mock('@langchain/anthropic', () => ({
  tools: {
    webSearch_20250305: jest.fn(({ maxUses }: { maxUses: number }) => ({
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: maxUses,
    })),
  },
}));

// Re-import after mocking so we can spy on the mocked functions
import { tools as openAITools } from '@langchain/openai';
import { tools as anthropicTools } from '@langchain/anthropic';

describe('createWebSearchTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('openai provider', () => {
    it('should return an object with type "web_search"', () => {
      const result = createWebSearchTool('openai');

      expect(result).toEqual({ type: 'web_search' });
    });

    it('should call openAITools.webSearch()', () => {
      createWebSearchTool('openai');

      expect((openAITools as any).webSearch).toHaveBeenCalledTimes(1);
    });
  });

  describe('azure provider', () => {
    it('should return an object with type "web_search"', () => {
      const result = createWebSearchTool('azure');

      expect(result).toEqual({ type: 'web_search' });
    });

    it('should call openAITools.webSearch() (azure reuses OpenAI tool)', () => {
      createWebSearchTool('azure');

      expect((openAITools as any).webSearch).toHaveBeenCalledTimes(1);
    });
  });

  describe('anthropic provider', () => {
    it('should return an object with type "web_search_20250305"', () => {
      const result = createWebSearchTool('anthropic');

      expect(result).not.toBeNull();
      expect(result!['type']).toBe('web_search_20250305');
    });

    it('should return an object with name "web_search"', () => {
      const result = createWebSearchTool('anthropic');

      expect(result).not.toBeNull();
      expect(result!['name']).toBe('web_search');
    });

    it('should set max_uses to 5', () => {
      const result = createWebSearchTool('anthropic');

      expect(result).not.toBeNull();
      expect(result!['max_uses']).toBe(5);
    });

    it('should call anthropicTools.webSearch_20250305 with maxUses: 5', () => {
      createWebSearchTool('anthropic');

      expect((anthropicTools as any).webSearch_20250305).toHaveBeenCalledWith({ maxUses: 5 });
    });

    it('should return the full expected anthropic tool shape', () => {
      const result = createWebSearchTool('anthropic');

      expect(result).toEqual({
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 5,
      });
    });
  });

  describe('unknown provider', () => {
    it('should return null for an unknown provider string', () => {
      const result = createWebSearchTool('gemini');

      expect(result).toBeNull();
    });

    it('should return null for an empty string provider', () => {
      const result = createWebSearchTool('');

      expect(result).toBeNull();
    });

    it('should return null for a provider with different casing', () => {
      // Provider matching is case-sensitive
      const result = createWebSearchTool('OpenAI');

      expect(result).toBeNull();
    });

    it('should not call any provider tool function for unknown providers', () => {
      createWebSearchTool('unknown-provider');

      expect((openAITools as any).webSearch).not.toHaveBeenCalled();
      expect((anthropicTools as any).webSearch_20250305).not.toHaveBeenCalled();
    });
  });

  describe('return type', () => {
    it('should return a non-null object for openai', () => {
      const result = createWebSearchTool('openai');

      expect(result).not.toBeNull();
      expect(typeof result).toBe('object');
    });

    it('should return a non-null object for azure', () => {
      const result = createWebSearchTool('azure');

      expect(result).not.toBeNull();
      expect(typeof result).toBe('object');
    });

    it('should return a non-null object for anthropic', () => {
      const result = createWebSearchTool('anthropic');

      expect(result).not.toBeNull();
      expect(typeof result).toBe('object');
    });

    it('openai and azure should produce equivalent tool objects', () => {
      const openaiResult = createWebSearchTool('openai');
      const azureResult = createWebSearchTool('azure');

      expect(openaiResult).toEqual(azureResult);
    });
  });
});
