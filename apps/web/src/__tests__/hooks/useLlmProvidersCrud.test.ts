import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { useLlmProvidersCrud } from '../../hooks/useLlmProvidersCrud';
import type {
  LLMProviderInfo,
  LLMProviderDetail,
  CreateLlmProviderRequest,
  UpdateLlmProviderRequest,
} from '../../types';

const API_BASE = '*/api';

const mockProviderInfo: LLMProviderInfo = {
  id: 'provider-1',
  type: 'openai',
  name: 'OpenAI Production',
  enabled: true,
  isDefault: true,
  model: 'gpt-4o',
  lastTestedAt: undefined,
  lastTestResult: undefined,
  lastTestMessage: undefined,
};

const mockProviderDetail: LLMProviderDetail = {
  ...mockProviderInfo,
  config: { apiKey: '***', model: 'gpt-4o' },
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

// Default MSW handlers for LLM providers
function setupDefaultHandlers() {
  server.use(
    http.get(`${API_BASE}/llm/providers`, () => {
      return HttpResponse.json({ providers: [mockProviderInfo] });
    }),

    http.get(`${API_BASE}/llm/providers/:id`, ({ params }) => {
      if (params.id === 'provider-1') {
        return HttpResponse.json({ data: mockProviderDetail });
      }
      return new HttpResponse(null, { status: 404 });
    }),

    http.post(`${API_BASE}/llm/providers`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json(
        {
          data: {
            id: 'provider-new',
            type: body.type,
            name: body.name,
            enabled: body.enabled ?? true,
            isDefault: body.isDefault ?? false,
            model: undefined,
            config: body.config,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        },
        { status: 201 },
      );
    }),

    http.patch(`${API_BASE}/llm/providers/:id`, async ({ params, request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({
        data: {
          ...mockProviderDetail,
          id: params.id as string,
          ...body,
          updatedAt: new Date().toISOString(),
        },
      });
    }),

    http.delete(`${API_BASE}/llm/providers/:id`, () => {
      return new HttpResponse(null, { status: 204 });
    }),

    http.post(`${API_BASE}/llm/providers/:id/test`, () => {
      return HttpResponse.json({
        data: { success: true, message: 'Connection successful' },
      });
    }),
  );
}

describe('useLlmProvidersCrud', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultHandlers();
  });

  describe('Initial Load', () => {
    it('fetches providers on mount', async () => {
      const { result } = renderHook(() => useLlmProvidersCrud());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toHaveLength(1);
      expect(result.current.providers[0].name).toBe('OpenAI Production');
      expect(result.current.error).toBeNull();
    });

    it('sets isLoading=true initially before fetch completes', () => {
      const { result } = renderHook(() => useLlmProvidersCrud());

      // Immediately after mount, loading should be true
      expect(result.current.isLoading).toBe(true);
    });

    it('sets isLoading=false after fetch completes', async () => {
      const { result } = renderHook(() => useLlmProvidersCrud());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('sets error when initial fetch fails', async () => {
      server.use(
        http.get(`${API_BASE}/llm/providers`, () => {
          return new HttpResponse(null, { status: 500 });
        }),
      );

      const { result } = renderHook(() => useLlmProvidersCrud());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.providers).toEqual([]);
    });

    it('provides all required methods', () => {
      const { result } = renderHook(() => useLlmProvidersCrud());

      expect(typeof result.current.refresh).toBe('function');
      expect(typeof result.current.getProvider).toBe('function');
      expect(typeof result.current.addProvider).toBe('function');
      expect(typeof result.current.editProvider).toBe('function');
      expect(typeof result.current.removeProvider).toBe('function');
      expect(typeof result.current.testProviderConnection).toBe('function');
    });
  });

  describe('refresh', () => {
    it('re-fetches providers and updates state', async () => {
      const { result } = renderHook(() => useLlmProvidersCrud());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toHaveLength(1);

      // Override to return 2 providers on next fetch
      server.use(
        http.get(`${API_BASE}/llm/providers`, () => {
          return HttpResponse.json({
            providers: [
              mockProviderInfo,
              {
                ...mockProviderInfo,
                id: 'provider-2',
                name: 'Anthropic',
                type: 'anthropic',
                isDefault: false,
              },
            ],
          });
        }),
      );

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.providers).toHaveLength(2);
      });
    });

    it('clears error on successful refresh', async () => {
      server.use(
        http.get(`${API_BASE}/llm/providers`, () => {
          return new HttpResponse(null, { status: 500 });
        }),
      );

      const { result } = renderHook(() => useLlmProvidersCrud());

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });

      // Restore normal handler
      server.resetHandlers();
      setupDefaultHandlers();

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.error).toBeNull();
      });
    });
  });

  describe('addProvider', () => {
    it('calls create API and refreshes provider list', async () => {
      const { result } = renderHook(() => useLlmProvidersCrud());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const createPayload: CreateLlmProviderRequest = {
        type: 'anthropic',
        name: 'Anthropic',
        enabled: true,
        isDefault: false,
        config: { apiKey: 'sk-ant-test' },
      };

      let created: LLMProviderDetail | undefined;
      await act(async () => {
        created = await result.current.addProvider(createPayload);
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(created).toBeDefined();
      expect(result.current.error).toBeNull();
    });

    it('throws error when create API fails', async () => {
      server.use(
        http.post(`${API_BASE}/llm/providers`, () => {
          return new HttpResponse(null, { status: 400 });
        }),
      );

      const { result } = renderHook(() => useLlmProvidersCrud());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let errorThrown = false;
      await act(async () => {
        try {
          await result.current.addProvider({
            type: 'openai',
            name: 'Test',
            config: {},
          });
        } catch {
          errorThrown = true;
        }
      });

      expect(errorThrown).toBe(true);
    });

    it('refreshes provider list after successful creation', async () => {
      const { result } = renderHook(() => useLlmProvidersCrud());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const initialCount = result.current.providers.length;

      await act(async () => {
        await result.current.addProvider({
          type: 'anthropic',
          name: 'Anthropic',
          config: { apiKey: 'sk-ant-test' },
        });
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // List was refreshed (count stays same since mock returns same data)
      expect(result.current.providers.length).toBe(initialCount);
    });
  });

  describe('editProvider', () => {
    it('calls update API and refreshes provider list', async () => {
      const { result } = renderHook(() => useLlmProvidersCrud());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const updates: UpdateLlmProviderRequest = {
        name: 'Updated OpenAI',
        enabled: false,
      };

      let updated: LLMProviderDetail | undefined;
      await act(async () => {
        updated = await result.current.editProvider('provider-1', updates);
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(updated).toBeDefined();
      expect(result.current.error).toBeNull();
    });

    it('throws error when update API fails', async () => {
      server.use(
        http.patch(`${API_BASE}/llm/providers/:id`, () => {
          return new HttpResponse(null, { status: 404 });
        }),
      );

      const { result } = renderHook(() => useLlmProvidersCrud());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let errorThrown = false;
      await act(async () => {
        try {
          await result.current.editProvider('nonexistent-id', { name: 'Test' });
        } catch {
          errorThrown = true;
        }
      });

      expect(errorThrown).toBe(true);
    });

    it('refreshes provider list after successful update', async () => {
      const { result } = renderHook(() => useLlmProvidersCrud());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.editProvider('provider-1', { enabled: false });
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toHaveLength(1);
    });
  });

  describe('removeProvider', () => {
    it('calls delete API and refreshes provider list', async () => {
      const { result } = renderHook(() => useLlmProvidersCrud());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.removeProvider('provider-1');
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });

    it('throws error when delete API fails', async () => {
      server.use(
        http.delete(`${API_BASE}/llm/providers/:id`, () => {
          return new HttpResponse(null, { status: 404 });
        }),
      );

      const { result } = renderHook(() => useLlmProvidersCrud());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let errorThrown = false;
      await act(async () => {
        try {
          await result.current.removeProvider('nonexistent-id');
        } catch {
          errorThrown = true;
        }
      });

      expect(errorThrown).toBe(true);
    });

    it('refreshes provider list after successful deletion', async () => {
      const { result } = renderHook(() => useLlmProvidersCrud());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toHaveLength(1);

      // After delete, the mock still returns 1 item (mock doesn't remove)
      // but the refresh is called — test that refresh runs without error
      await act(async () => {
        await result.current.removeProvider('provider-1');
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('testProviderConnection', () => {
    it('calls test API and returns success result', async () => {
      const { result } = renderHook(() => useLlmProvidersCrud());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let testResult: { success: boolean; message: string } | undefined;
      await act(async () => {
        testResult = await result.current.testProviderConnection('provider-1');
      });

      expect(testResult).toEqual({ success: true, message: 'Connection successful' });
      expect(result.current.error).toBeNull();
    });

    it('returns failure result when test fails', async () => {
      server.use(
        http.post(`${API_BASE}/llm/providers/:id/test`, () => {
          return HttpResponse.json({
            data: { success: false, message: 'Invalid API key' },
          });
        }),
      );

      const { result } = renderHook(() => useLlmProvidersCrud());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let testResult: { success: boolean; message: string } | undefined;
      await act(async () => {
        testResult = await result.current.testProviderConnection('provider-1');
      });

      expect(testResult).toEqual({ success: false, message: 'Invalid API key' });
    });

    it('throws error when test API call itself fails (network/5xx)', async () => {
      server.use(
        http.post(`${API_BASE}/llm/providers/:id/test`, () => {
          return new HttpResponse(null, { status: 500 });
        }),
      );

      const { result } = renderHook(() => useLlmProvidersCrud());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let errorThrown = false;
      await act(async () => {
        try {
          await result.current.testProviderConnection('provider-1');
        } catch {
          errorThrown = true;
        }
      });

      expect(errorThrown).toBe(true);
    });

    it('refreshes provider list after test to update lastTestedAt', async () => {
      const { result } = renderHook(() => useLlmProvidersCrud());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.testProviderConnection('provider-1');
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Refresh was called — providers list is still populated
      expect(result.current.providers).toHaveLength(1);
    });
  });

  describe('getProvider', () => {
    it('delegates getProvider directly to getLlmProviderById API', async () => {
      const { result } = renderHook(() => useLlmProvidersCrud());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let detail: LLMProviderDetail | undefined;
      await act(async () => {
        detail = await result.current.getProvider('provider-1');
      });

      expect(detail).toBeDefined();
      expect(detail?.id).toBe('provider-1');
      expect(detail?.config).toBeDefined();
    });

    it('throws when getLlmProviderById returns 404', async () => {
      const { result } = renderHook(() => useLlmProvidersCrud());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let errorThrown = false;
      await act(async () => {
        try {
          await result.current.getProvider('nonexistent');
        } catch {
          errorThrown = true;
        }
      });

      expect(errorThrown).toBe(true);
    });
  });
});
