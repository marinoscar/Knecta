import { useState, useCallback, useRef, useEffect } from 'react';
import type { DataImportRun, DataImportStreamEvent, DataImportProgress } from '../types';
import { getDataImportRun, cancelDataImportRun, api } from '../services/api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

interface UseDataImportRunResult {
  run: DataImportRun | null;
  events: DataImportStreamEvent[];
  progress: DataImportProgress | null;
  isStreaming: boolean;
  error: string | null;
  streamStartTime: number | null;
  fetchRun: (runId: string) => Promise<void>;
  startStream: (runId: string) => void;
  stopStream: () => void;
  cancelRun: (runId: string) => Promise<void>;
}

interface UseDataImportRunOptions {
  onStreamEnd?: () => void;
}

export function useDataImportRun(opts?: UseDataImportRunOptions): UseDataImportRunResult {
  const [run, setRun] = useState<DataImportRun | null>(null);
  const [events, setEvents] = useState<DataImportStreamEvent[]>([]);
  const [progress, setProgress] = useState<DataImportProgress | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamStartTime, setStreamStartTime] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchRun = useCallback(async (runId: string) => {
    setError(null);
    try {
      const result = await getDataImportRun(runId);
      setRun(result);
      if (result.progress) {
        setProgress(result.progress as unknown as DataImportProgress);
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
      setStreamStartTime(Date.now());

      const token = api.getAccessToken();

      // Small delay to handle React StrictMode double-mount
      const timeout = setTimeout(() => {
        fetch(`${API_BASE_URL}/data-imports/runs/${runId}/stream`, {
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
              throw new Error(
                (errData as { message?: string }).message || `Stream failed: ${response.status}`,
              );
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
                    const event: DataImportStreamEvent = JSON.parse(jsonStr);
                    setEvents((prev) => [...prev, event]);

                    if (event.type === 'progress') {
                      const evData = event.data as unknown as DataImportProgress;
                      setProgress({
                        percentComplete: evData.percentComplete ?? 0,
                        message: evData.message,
                        currentTable: evData.currentTable,
                        completedTables: evData.completedTables,
                        totalTables: evData.totalTables,
                      });
                    }

                    if (
                      event.type === 'run_complete' ||
                      event.type === 'run_error'
                    ) {
                      setIsStreaming(false);
                      // Refresh the run to get final state
                      fetchRun(runId);
                      // Notify the consuming page so it can refetch related data
                      opts?.onStreamEnd?.();
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
    [stopStream, fetchRun, opts],
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
        const result = await cancelDataImportRun(runId);
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

  return {
    run,
    events,
    progress,
    isStreaming,
    error,
    streamStartTime,
    fetchRun,
    startStream,
    stopStream,
    cancelRun: cancelRunFn,
  };
}
