import { useState, useCallback, useRef, useEffect } from 'react';
import type { SpreadsheetRun, SpreadsheetStreamEvent, SpreadsheetRunProgress, SpreadsheetPlanModification } from '../types';
import {
  getSpreadsheetRun,
  cancelSpreadsheetRun,
  approveSpreadsheetPlan,
  api,
} from '../services/api';

interface UseSpreadsheetRunResult {
  run: SpreadsheetRun | null;
  events: SpreadsheetStreamEvent[];
  progress: SpreadsheetRunProgress | null;
  isStreaming: boolean;
  error: string | null;
  tokensUsed: { prompt: number; completion: number; total: number };
  streamStartTime: number | null;
  fetchRun: (runId: string) => Promise<void>;
  startStream: (runId: string) => void;
  stopStream: () => void;
  cancelRun: (runId: string) => Promise<void>;
  approvePlan: (runId: string, modifications?: SpreadsheetPlanModification[]) => Promise<void>;
}

export function useSpreadsheetRun(): UseSpreadsheetRunResult {
  const [run, setRun] = useState<SpreadsheetRun | null>(null);
  const [events, setEvents] = useState<SpreadsheetStreamEvent[]>([]);
  const [progress, setProgress] = useState<SpreadsheetRunProgress | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokensUsed, setTokensUsed] = useState<{ prompt: number; completion: number; total: number }>({ prompt: 0, completion: 0, total: 0 });
  const [streamStartTime, setStreamStartTime] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchRun = useCallback(async (runId: string) => {
    setError(null);
    try {
      const result = await getSpreadsheetRun(runId);
      setRun(result);
      if (result.progress) {
        setProgress(result.progress as SpreadsheetRunProgress);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch run';
      setError(message);
    }
  }, []);

  const stopStream = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const startStream = useCallback(
    (runId: string) => {
      // Abort any existing stream
      stopStream();

      const controller = new AbortController();
      abortRef.current = controller;
      setIsStreaming(true);
      setEvents([]);
      setError(null);
      setTokensUsed({ prompt: 0, completion: 0, total: 0 });
      setStreamStartTime(Date.now());

      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
      const token = api.getAccessToken();

      // Small delay to handle React StrictMode double-mount
      const timeout = setTimeout(() => {
        fetch(`${API_BASE_URL}/spreadsheet-agent/runs/${runId}/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: 'include',
          signal: controller.signal,
          body: JSON.stringify({}),
        })
          .then(async (response) => {
            if (!response.ok) {
              const errData = await response.json().catch(() => ({}));
              throw new Error((errData as { message?: string }).message || `Stream failed: ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error('No response body');

            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const jsonStr = line.slice(6).trim();
                  if (!jsonStr || jsonStr === ':heartbeat') continue;
                  try {
                    const event: SpreadsheetStreamEvent = JSON.parse(jsonStr);
                    setEvents((prev) => [...prev, event]);

                    if (event.type === 'progress' && event.progress) {
                      setProgress(event.progress);
                    }
                    if (event.type === 'token_update' && event.tokensUsed) {
                      setTokensUsed(event.tokensUsed);
                    }
                    if ((event.type === 'run_complete' || event.type === 'review_ready') && event.tokensUsed) {
                      setTokensUsed(event.tokensUsed);
                    }
                    if (event.type === 'run_complete' || event.type === 'run_error' || event.type === 'review_ready') {
                      setIsStreaming(false);
                      // Refresh the run to get final state
                      fetchRun(runId);
                    }
                  } catch {
                    // Skip malformed JSON
                  }
                }
              }
            }
            setIsStreaming(false);
          })
          .catch((err) => {
            if ((err as Error).name === 'AbortError') return;
            setError((err as Error).message || 'Stream connection failed');
            setIsStreaming(false);
          });
      }, 100); // 100ms delay for StrictMode

      // Store the timeout so abort can clear it
      const originalAbort = controller.abort.bind(controller);
      controller.abort = () => {
        clearTimeout(timeout);
        originalAbort();
      };
    },
    [stopStream, fetchRun],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  const cancelRunFn = useCallback(
    async (runId: string) => {
      setError(null);
      try {
        const result = await cancelSpreadsheetRun(runId);
        setRun(result);
        stopStream();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to cancel run';
        setError(message);
        throw err;
      }
    },
    [stopStream],
  );

  const approvePlanFn = useCallback(
    async (runId: string, modifications?: SpreadsheetPlanModification[]) => {
      setError(null);
      try {
        const result = await approveSpreadsheetPlan(runId, modifications);
        setRun(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to approve plan';
        setError(message);
        throw err;
      }
    },
    [],
  );

  return {
    run,
    events,
    progress,
    isStreaming,
    error,
    tokensUsed,
    streamStartTime,
    fetchRun,
    startStream,
    stopStream,
    cancelRun: cancelRunFn,
    approvePlan: approvePlanFn,
  };
}
