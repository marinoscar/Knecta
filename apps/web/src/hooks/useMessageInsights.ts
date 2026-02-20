import { useState, useEffect, useMemo } from 'react';
import type { LlmTraceRecord } from '../types';
import { getMessageTraces } from '../services/api';
import {
  deriveInsightsFromTraces,
  type TraceDerivedInsights,
  type PhaseDetailWithTiming,
  type SqlQueryInfo,
} from '../components/data-agent/traceInsightsParser';
import type { PlanData, StepStatus, JoinPlanData } from '../components/data-agent/insightsUtils';

// ─── Types ───

export interface MergedInsights {
  plan: PlanData | null;
  stepStatuses: StepStatus[];
  phaseDetails: PhaseDetailWithTiming[];
  tokens: { prompt: number; completion: number; total: number };
  durationMs: number | null;
  startedAt: string | null;
  completedAt: string | null;
  providerModel: { provider: string; model: string } | null;
  sqlQueries: SqlQueryInfo[];
  // Metadata-only fields (not derivable from traces)
  joinPlan: JoinPlanData | null;
  verificationReport: { passed: boolean; checks: any[] } | null;
  dataLineage: any | null;
  hasTraces: boolean;
}

interface UseMessageInsightsOptions {
  chatId?: string;
  messageId?: string;
  metadata?: any;
  enabled?: boolean;
}

interface UseMessageInsightsResult {
  traces: LlmTraceRecord[];
  insights: MergedInsights | null;
  isLoading: boolean;
  error: string | null;
}

// ─── Hook ───

/**
 * Fetches LLM traces for a message, parses them into structured insights,
 * and merges with message metadata (trace data takes priority).
 */
export function useMessageInsights({
  chatId,
  messageId,
  metadata,
  enabled = true,
}: UseMessageInsightsOptions): UseMessageInsightsResult {
  const [traces, setTraces] = useState<LlmTraceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch traces when messageId changes
  useEffect(() => {
    if (!enabled || !chatId || !messageId) {
      setTraces([]);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    getMessageTraces(chatId, messageId)
      .then((result) => {
        if (!cancelled) {
          setTraces(result);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to load LLM traces:', err);
          setError(err?.message || 'Failed to load traces');
          setTraces([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [chatId, messageId, enabled]);

  // Derive insights from traces
  const traceDerived = useMemo<TraceDerivedInsights | null>(() => {
    if (traces.length === 0) return null;
    return deriveInsightsFromTraces(traces);
  }, [traces]);

  // Merge trace-derived insights with metadata
  const insights = useMemo<MergedInsights | null>(() => {
    const hasTraces = traces.length > 0;

    // If no traces and no metadata, nothing to show
    if (!hasTraces && !metadata) return null;

    return {
      // Trace-derived takes priority, metadata as fallback
      plan: traceDerived?.plan ?? metadata?.plan ?? null,
      stepStatuses: traceDerived?.stepStatuses ?? [],
      phaseDetails: traceDerived?.phaseDetails ?? [],
      tokens: traceDerived?.tokens ?? metadata?.tokensUsed ?? { prompt: 0, completion: 0, total: 0 },
      durationMs: traceDerived?.durationMs ?? metadata?.durationMs ?? null,
      startedAt: traceDerived?.startedAt ?? (metadata?.startedAt ? new Date(metadata.startedAt).toISOString() : null),
      completedAt: traceDerived?.completedAt ?? null,
      providerModel: traceDerived?.providerModel ?? null,
      sqlQueries: traceDerived?.sqlQueries ?? [],
      // Metadata-only fields
      joinPlan: metadata?.joinPlan ?? null,
      verificationReport: metadata?.verificationReport ?? null,
      dataLineage: metadata?.dataLineage ?? null,
      hasTraces,
    };
  }, [traceDerived, metadata, traces.length]);

  return { traces, insights, isLoading, error };
}
