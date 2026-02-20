import type { LlmTraceRecord } from '../../types';
import {
  PHASE_ORDER,
  PHASE_LABELS,
  type PlanData,
  type StepStatus,
  type PhaseDetail,
} from './insightsUtils';

// ─── Extended Types ───

export interface PhaseDetailWithTiming extends PhaseDetail {
  durationMs: number;
  tokens: { prompt: number; completion: number; total: number };
  traceCount: number;
}

export interface SqlQueryInfo {
  stepId: number;
  sql: string;
  description: string;
}

export interface TraceDerivedInsights {
  plan: PlanData | null;
  stepStatuses: StepStatus[];
  phaseDetails: PhaseDetailWithTiming[];
  tokens: { prompt: number; completion: number; total: number };
  durationMs: number | null;
  startedAt: string | null;
  completedAt: string | null;
  providerModel: { provider: string; model: string } | null;
  sqlQueries: SqlQueryInfo[];
}

// ─── Parsing Functions ───

/**
 * Extract the execution plan from the planner trace's structured output.
 * The planner trace with structuredOutput=true stores PlanArtifact JSON in responseContent.
 */
export function extractPlanFromTraces(traces: LlmTraceRecord[]): PlanData | null {
  const plannerTrace = traces.find(
    (t) => t.phase === 'planner' && t.structuredOutput && !t.error,
  );
  if (!plannerTrace) return null;

  try {
    const artifact = JSON.parse(plannerTrace.responseContent);
    if (!artifact.steps || !Array.isArray(artifact.steps)) return null;

    return {
      complexity: artifact.complexity || 'simple',
      intent: artifact.intent || '',
      steps: artifact.steps.map((s: any) => ({
        id: s.id,
        description: s.description,
        strategy: s.strategy,
      })),
    };
  } catch {
    console.warn('Failed to parse planner trace responseContent');
    return null;
  }
}

/**
 * Derive step statuses from plan + executor traces.
 * Maps executor traces to plan steps by stepId, extracts row counts from tool calls.
 */
export function extractStepStatusesFromTraces(
  plan: PlanData | null,
  traces: LlmTraceRecord[],
): StepStatus[] {
  if (!plan) return [];

  const executorTraces = traces.filter((t) => t.phase === 'executor');

  return plan.steps.map((step) => {
    // Find executor traces for this step
    const stepTraces = executorTraces.filter((t) => t.stepId === step.id);

    let status: StepStatus['status'] = 'complete';
    let resultSummary: string | undefined;

    if (stepTraces.length === 0) {
      // No executor traces for this step — check if executor phase ran at all
      const hasExecutor = traces.some((t) => t.phase === 'executor');
      status = hasExecutor ? 'complete' : 'pending';
    } else {
      // Check for errors in any step trace
      const errorTrace = stepTraces.find((t) => t.error);
      if (errorTrace) {
        status = 'failed';
        resultSummary = errorTrace.error || 'Execution failed';
      } else {
        // Look for query_database tool call results to extract row count
        for (const trace of stepTraces) {
          if (!trace.toolCalls) continue;
          for (const tc of trace.toolCalls) {
            if (tc.name === 'query_database' && tc.args) {
              const result = tc.args.result as any;
              if (result?.rowCount !== undefined) {
                resultSummary = `${result.rowCount} rows`;
              }
            }
          }
        }
      }
    }

    return {
      stepId: step.id,
      description: step.description,
      strategy: step.strategy,
      status,
      resultSummary,
    };
  });
}

/**
 * Group traces by phase and compute per-phase timing, tokens, and tool calls.
 */
export function extractPhaseDetailsFromTraces(
  traces: LlmTraceRecord[],
): PhaseDetailWithTiming[] {
  // Group traces by phase
  const tracesByPhase = new Map<string, LlmTraceRecord[]>();
  for (const trace of traces) {
    const existing = tracesByPhase.get(trace.phase) || [];
    existing.push(trace);
    tracesByPhase.set(trace.phase, existing);
  }

  return PHASE_ORDER.map((phase) => {
    const phaseTraces = tracesByPhase.get(phase) || [];
    const hasTraces = phaseTraces.length > 0;

    // Compute per-phase timing
    let durationMs = 0;
    if (hasTraces) {
      const starts = phaseTraces.map((t) => new Date(t.startedAt).getTime());
      const ends = phaseTraces.map((t) => new Date(t.completedAt).getTime());
      durationMs = Math.max(...ends) - Math.min(...starts);
    }

    // Aggregate tokens
    const tokens = phaseTraces.reduce(
      (acc, t) => ({
        prompt: acc.prompt + t.promptTokens,
        completion: acc.completion + t.completionTokens,
        total: acc.total + t.totalTokens,
      }),
      { prompt: 0, completion: 0, total: 0 },
    );

    // Collect tool calls from all traces in this phase
    const toolCalls: PhaseDetail['toolCalls'] = [];
    for (const trace of phaseTraces) {
      if (trace.toolCalls) {
        for (const tc of trace.toolCalls) {
          toolCalls.push({
            name: tc.name,
            result: tc.args?.result ? JSON.stringify(tc.args.result) : undefined,
            isComplete: true,
          });
        }
      }
    }

    return {
      phase,
      label: PHASE_LABELS[phase] || phase,
      status: hasTraces ? 'complete' : ('pending' as const),
      toolCalls,
      durationMs,
      tokens,
      traceCount: phaseTraces.length,
    };
  });
}

/**
 * Extract SQL queries from the sql_builder trace's structured output.
 */
export function extractSqlQueriesFromTraces(
  traces: LlmTraceRecord[],
): SqlQueryInfo[] {
  const sqlBuilderTrace = traces.find(
    (t) => t.phase === 'sql_builder' && t.structuredOutput && !t.error,
  );
  if (!sqlBuilderTrace) return [];

  try {
    const parsed = JSON.parse(sqlBuilderTrace.responseContent);
    const queries = parsed.queries || parsed;
    if (!Array.isArray(queries)) return [];

    return queries.map((q: any) => ({
      stepId: q.stepId,
      sql: q.fullSql || q.pilotSql || '',
      description: q.description || '',
    }));
  } catch {
    console.warn('Failed to parse sql_builder trace responseContent');
    return [];
  }
}

/**
 * Sum token usage across all traces.
 */
export function aggregateTokensFromTraces(
  traces: LlmTraceRecord[],
): { prompt: number; completion: number; total: number } {
  return traces.reduce(
    (acc, t) => ({
      prompt: acc.prompt + t.promptTokens,
      completion: acc.completion + t.completionTokens,
      total: acc.total + t.totalTokens,
    }),
    { prompt: 0, completion: 0, total: 0 },
  );
}

/**
 * Compute overall timing from trace timestamps.
 */
export function computeTimingFromTraces(
  traces: LlmTraceRecord[],
): { durationMs: number; startedAt: string; completedAt: string } | null {
  if (traces.length === 0) return null;

  const starts = traces.map((t) => new Date(t.startedAt).getTime());
  const ends = traces.map((t) => new Date(t.completedAt).getTime());
  const startedAt = Math.min(...starts);
  const completedAt = Math.max(...ends);

  return {
    durationMs: completedAt - startedAt,
    startedAt: new Date(startedAt).toISOString(),
    completedAt: new Date(completedAt).toISOString(),
  };
}

/**
 * Master function: derive all insights from an array of LLM traces.
 */
export function deriveInsightsFromTraces(
  traces: LlmTraceRecord[],
): TraceDerivedInsights {
  if (traces.length === 0) {
    return {
      plan: null,
      stepStatuses: [],
      phaseDetails: PHASE_ORDER.map((phase) => ({
        phase,
        label: PHASE_LABELS[phase] || phase,
        status: 'pending' as const,
        toolCalls: [],
        durationMs: 0,
        tokens: { prompt: 0, completion: 0, total: 0 },
        traceCount: 0,
      })),
      tokens: { prompt: 0, completion: 0, total: 0 },
      durationMs: null,
      startedAt: null,
      completedAt: null,
      providerModel: null,
      sqlQueries: [],
    };
  }

  const plan = extractPlanFromTraces(traces);
  const timing = computeTimingFromTraces(traces);

  // Extract provider/model from the first trace
  const firstTrace = traces[0];
  const providerModel = firstTrace
    ? { provider: firstTrace.provider, model: firstTrace.model }
    : null;

  return {
    plan,
    stepStatuses: extractStepStatusesFromTraces(plan, traces),
    phaseDetails: extractPhaseDetailsFromTraces(traces),
    tokens: aggregateTokensFromTraces(traces),
    durationMs: timing?.durationMs ?? null,
    startedAt: timing?.startedAt ?? null,
    completedAt: timing?.completedAt ?? null,
    providerModel,
    sqlQueries: extractSqlQueriesFromTraces(traces),
  };
}
