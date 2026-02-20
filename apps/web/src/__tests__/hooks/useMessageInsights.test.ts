import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMessageInsights } from '../../hooks/useMessageInsights';
import type { LlmTraceRecord } from '../../types';
import type { TraceDerivedInsights } from '../../components/data-agent/traceInsightsParser';

// ─── Mocks ───

vi.mock('../../services/api', () => ({
  getMessageTraces: vi.fn(),
}));

vi.mock('../../components/data-agent/traceInsightsParser', () => ({
  deriveInsightsFromTraces: vi.fn(),
}));

// ─── Helpers ───

import { getMessageTraces } from '../../services/api';
import { deriveInsightsFromTraces } from '../../components/data-agent/traceInsightsParser';

const mockGetMessageTraces = getMessageTraces as ReturnType<typeof vi.fn>;
const mockDeriveInsights = deriveInsightsFromTraces as ReturnType<typeof vi.fn>;

function createMockTrace(overrides: Partial<LlmTraceRecord> = {}): LlmTraceRecord {
  return {
    id: 'trace-1',
    messageId: 'msg-1',
    phase: 'planner',
    provider: 'openai',
    model: 'gpt-4',
    promptTokens: 100,
    completionTokens: 50,
    totalTokens: 150,
    durationMs: 1000,
    requestContent: '{}',
    responseContent: 'response',
    structuredOutput: false,
    error: null,
    createdAt: '2026-02-19T12:00:00Z',
    ...overrides,
  };
}

function createMockInsights(overrides: Partial<TraceDerivedInsights> = {}): TraceDerivedInsights {
  return {
    plan: { steps: [{ stepId: 1, description: 'Step 1', strategy: 'sql' }] },
    stepStatuses: [{ stepId: 1, status: 'completed', result: 'success' }],
    phaseDetails: [
      {
        phase: 'planner',
        status: 'completed',
        durationMs: 1000,
        tokens: { prompt: 100, completion: 50, total: 150 },
        traceCount: 1,
      },
    ],
    tokens: { prompt: 100, completion: 50, total: 150 },
    durationMs: 1000,
    startedAt: '2026-02-19T12:00:00Z',
    completedAt: '2026-02-19T12:00:01Z',
    providerModel: { provider: 'openai', model: 'gpt-4' },
    sqlQueries: [{ stepId: 1, sql: 'SELECT * FROM users', description: 'Get users' }],
    ...overrides,
  };
}

// ─── Tests ───

describe('useMessageInsights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return loading state initially, then insights after traces load', async () => {
    const mockTraces = [createMockTrace()];
    const mockInsights = createMockInsights();

    mockGetMessageTraces.mockResolvedValue(mockTraces);
    mockDeriveInsights.mockReturnValue(mockInsights);

    const { result } = renderHook(() =>
      useMessageInsights({
        chatId: 'chat-1',
        messageId: 'msg-1',
        enabled: true,
      }),
    );

    // Initially loading
    expect(result.current.isLoading).toBe(true);
    expect(result.current.insights).toBeNull();
    expect(result.current.traces).toEqual([]);

    // Wait for fetch to complete
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should have traces and insights
    expect(result.current.traces).toEqual(mockTraces);
    expect(result.current.insights).not.toBeNull();
    expect(result.current.insights?.hasTraces).toBe(true);
    expect(result.current.insights?.plan).toEqual(mockInsights.plan);
    expect(result.current.insights?.tokens).toEqual(mockInsights.tokens);
    expect(result.current.error).toBeNull();

    expect(mockGetMessageTraces).toHaveBeenCalledWith('chat-1', 'msg-1');
    expect(mockDeriveInsights).toHaveBeenCalledWith(mockTraces);
  });

  it('should return null insights when disabled (enabled=false)', async () => {
    const mockTraces = [createMockTrace()];
    mockGetMessageTraces.mockResolvedValue(mockTraces);

    const { result } = renderHook(() =>
      useMessageInsights({
        chatId: 'chat-1',
        messageId: 'msg-1',
        enabled: false,
      }),
    );

    // Should not fetch
    expect(result.current.isLoading).toBe(false);
    expect(result.current.insights).toBeNull();
    expect(result.current.traces).toEqual([]);

    // Wait a bit to ensure no fetch happens
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockGetMessageTraces).not.toHaveBeenCalled();
  });

  it('should return null insights when chatId missing', async () => {
    const { result } = renderHook(() =>
      useMessageInsights({
        messageId: 'msg-1',
        enabled: true,
      }),
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.insights).toBeNull();
    expect(result.current.traces).toEqual([]);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockGetMessageTraces).not.toHaveBeenCalled();
  });

  it('should return null insights when messageId missing', async () => {
    const { result } = renderHook(() =>
      useMessageInsights({
        chatId: 'chat-1',
        enabled: true,
      }),
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.insights).toBeNull();
    expect(result.current.traces).toEqual([]);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockGetMessageTraces).not.toHaveBeenCalled();
  });

  it('should handle API errors gracefully', async () => {
    const mockError = new Error('Network error');
    mockGetMessageTraces.mockRejectedValue(mockError);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() =>
      useMessageInsights({
        chatId: 'chat-1',
        messageId: 'msg-1',
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.traces).toEqual([]);
    expect(result.current.insights).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to load LLM traces:', mockError);

    consoleErrorSpy.mockRestore();
  });

  it('should re-fetch when messageId changes', async () => {
    const mockTraces1 = [createMockTrace({ id: 'trace-1', messageId: 'msg-1' })];
    const mockTraces2 = [createMockTrace({ id: 'trace-2', messageId: 'msg-2' })];
    const mockInsights1 = createMockInsights({ durationMs: 1000 });
    const mockInsights2 = createMockInsights({ durationMs: 2000 });

    mockGetMessageTraces.mockResolvedValueOnce(mockTraces1).mockResolvedValueOnce(mockTraces2);
    mockDeriveInsights.mockReturnValueOnce(mockInsights1).mockReturnValueOnce(mockInsights2);

    const { result, rerender } = renderHook(
      ({ messageId }) =>
        useMessageInsights({
          chatId: 'chat-1',
          messageId,
          enabled: true,
        }),
      { initialProps: { messageId: 'msg-1' } },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.traces).toEqual(mockTraces1);
    expect(result.current.insights?.durationMs).toBe(1000);

    // Change messageId
    rerender({ messageId: 'msg-2' });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.traces).toEqual(mockTraces2);
    expect(result.current.insights?.durationMs).toBe(2000);
    expect(mockGetMessageTraces).toHaveBeenCalledTimes(2);
  });

  it('should merge trace-derived insights with metadata (traces take priority)', async () => {
    const mockTraces = [createMockTrace()];
    const mockInsights = createMockInsights({
      plan: { steps: [{ stepId: 1, description: 'From traces', strategy: 'sql' }] },
      tokens: { prompt: 100, completion: 50, total: 150 },
    });

    const metadata = {
      plan: { steps: [{ stepId: 1, description: 'From metadata', strategy: 'sql' }] },
      tokensUsed: { prompt: 200, completion: 100, total: 300 },
      joinPlan: { datasets: ['users', 'orders'] },
      verificationReport: { passed: true, checks: [] },
      dataLineage: { sources: ['db1'] },
    };

    mockGetMessageTraces.mockResolvedValue(mockTraces);
    mockDeriveInsights.mockReturnValue(mockInsights);

    const { result } = renderHook(() =>
      useMessageInsights({
        chatId: 'chat-1',
        messageId: 'msg-1',
        metadata,
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Trace-derived should take priority
    expect(result.current.insights?.plan?.steps[0].description).toBe('From traces');
    expect(result.current.insights?.tokens).toEqual({ prompt: 100, completion: 50, total: 150 });

    // Metadata-only fields should be preserved
    expect(result.current.insights?.joinPlan).toEqual({ datasets: ['users', 'orders'] });
    expect(result.current.insights?.verificationReport).toEqual({ passed: true, checks: [] });
    expect(result.current.insights?.dataLineage).toEqual({ sources: ['db1'] });
  });

  it('should fall back to metadata fields when traces have no data', async () => {
    // Empty traces array
    mockGetMessageTraces.mockResolvedValue([]);
    mockDeriveInsights.mockReturnValue(null);

    const metadata = {
      plan: { steps: [{ stepId: 1, description: 'Metadata plan', strategy: 'sql' }] },
      tokensUsed: { prompt: 200, completion: 100, total: 300 },
      durationMs: 5000,
      startedAt: '2026-02-19T10:00:00Z',
      joinPlan: { datasets: ['users'] },
      verificationReport: { passed: false, checks: [] },
      dataLineage: { sources: ['db1', 'db2'] },
    };

    const { result } = renderHook(() =>
      useMessageInsights({
        chatId: 'chat-1',
        messageId: 'msg-1',
        metadata,
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should use metadata as fallback
    expect(result.current.insights?.plan).toEqual(metadata.plan);
    expect(result.current.insights?.tokens).toEqual(metadata.tokensUsed);
    expect(result.current.insights?.durationMs).toBe(5000);
    expect(result.current.insights?.startedAt).toBe('2026-02-19T10:00:00.000Z');
    expect(result.current.insights?.joinPlan).toEqual(metadata.joinPlan);
    expect(result.current.insights?.verificationReport).toEqual(metadata.verificationReport);
    expect(result.current.insights?.dataLineage).toEqual(metadata.dataLineage);
    expect(result.current.insights?.hasTraces).toBe(false);
  });

  it('should return hasTraces=false when no traces returned from API', async () => {
    mockGetMessageTraces.mockResolvedValue([]);
    mockDeriveInsights.mockReturnValue(null);

    const { result } = renderHook(() =>
      useMessageInsights({
        chatId: 'chat-1',
        messageId: 'msg-1',
        metadata: { plan: null },
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.traces).toEqual([]);
    expect(result.current.insights?.hasTraces).toBe(false);
  });

  it('should handle cleanup on unmount', async () => {
    let resolvePromise: (value: LlmTraceRecord[]) => void;
    const promise = new Promise<LlmTraceRecord[]>((resolve) => {
      resolvePromise = resolve;
    });

    mockGetMessageTraces.mockReturnValue(promise);

    const { result, unmount } = renderHook(() =>
      useMessageInsights({
        chatId: 'chat-1',
        messageId: 'msg-1',
        enabled: true,
      }),
    );

    expect(result.current.isLoading).toBe(true);

    // Unmount before promise resolves
    unmount();

    // Resolve the promise (should be ignored)
    resolvePromise!([createMockTrace()]);

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 50));

    // State should not have been updated after unmount
    expect(result.current.isLoading).toBe(true);
  });

  it('should return null insights when no traces and no metadata', async () => {
    mockGetMessageTraces.mockResolvedValue([]);
    mockDeriveInsights.mockReturnValue(null);

    const { result } = renderHook(() =>
      useMessageInsights({
        chatId: 'chat-1',
        messageId: 'msg-1',
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.insights).toBeNull();
    expect(result.current.traces).toEqual([]);
  });

  it('should handle error without message property', async () => {
    const mockError = { code: 500 }; // Error without message
    mockGetMessageTraces.mockRejectedValue(mockError);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() =>
      useMessageInsights({
        chatId: 'chat-1',
        messageId: 'msg-1',
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Failed to load traces');
    expect(result.current.traces).toEqual([]);

    consoleErrorSpy.mockRestore();
  });

  it('should convert metadata startedAt to ISO string', async () => {
    mockGetMessageTraces.mockResolvedValue([]);
    mockDeriveInsights.mockReturnValue(null);

    const metadata = {
      startedAt: '2026-02-19T15:30:00.000Z',
    };

    const { result } = renderHook(() =>
      useMessageInsights({
        chatId: 'chat-1',
        messageId: 'msg-1',
        metadata,
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.insights?.startedAt).toBe('2026-02-19T15:30:00.000Z');
  });

  it('should handle partial trace-derived insights', async () => {
    const mockTraces = [createMockTrace()];
    const partialInsights: TraceDerivedInsights = {
      plan: null, // No plan from traces
      stepStatuses: [],
      phaseDetails: [],
      tokens: { prompt: 100, completion: 50, total: 150 }, // Has tokens
      durationMs: null,
      startedAt: null,
      completedAt: null,
      providerModel: null,
      sqlQueries: [],
    };

    const metadata = {
      plan: { steps: [{ stepId: 1, description: 'Metadata plan', strategy: 'sql' }] },
      durationMs: 2000,
    };

    mockGetMessageTraces.mockResolvedValue(mockTraces);
    mockDeriveInsights.mockReturnValue(partialInsights);

    const { result } = renderHook(() =>
      useMessageInsights({
        chatId: 'chat-1',
        messageId: 'msg-1',
        metadata,
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Trace tokens take priority, metadata plan is fallback
    expect(result.current.insights?.tokens).toEqual({ prompt: 100, completion: 50, total: 150 });
    expect(result.current.insights?.plan).toEqual(metadata.plan);
    expect(result.current.insights?.durationMs).toBe(2000);
    expect(result.current.insights?.hasTraces).toBe(true);
  });
});
