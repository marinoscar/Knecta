import type { DataAgentStreamEvent, OntologyGraph as OntologyGraphType, GraphNode, GraphEdge } from '../../types';

// Phase configuration
export const PHASE_ORDER = [
  'planner',
  'navigator',
  'sql_builder',
  'executor',
  'verifier',
  'explainer',
] as const;

export const PHASE_LABELS: Record<string, string> = {
  planner: 'Planner',
  navigator: 'Navigator',
  sql_builder: 'SQL Builder',
  executor: 'Executor',
  verifier: 'Verifier',
  explainer: 'Explainer',
};

// Types
export interface PlanData {
  complexity: string;
  intent: string;
  steps: Array<{
    id: number;
    description: string;
    strategy: string;
  }>;
}

export interface StepStatus {
  stepId: number;
  description: string;
  strategy: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  resultSummary?: string;
}

export interface PhaseDetail {
  phase: string;
  label: string;
  status: 'pending' | 'active' | 'complete';
  toolCalls: Array<{
    name: string;
    result?: string;
    isComplete: boolean;
  }>;
}

/**
 * Extract plan from either live stream events or message metadata
 */
export function extractPlan(
  streamEvents: DataAgentStreamEvent[],
  metadata: any,
  isLive: boolean
): PlanData | null {
  if (isLive) {
    const plannerArtifact = streamEvents.find(
      (e) => e.type === 'phase_artifact' && e.phase === 'planner'
    );
    if (!plannerArtifact?.artifact) return null;
    return plannerArtifact.artifact as unknown as PlanData;
  } else {
    return metadata?.plan || null;
  }
}

/**
 * Extract step statuses from plan + stream events or metadata
 */
export function extractStepStatuses(
  plan: PlanData | null,
  streamEvents: DataAgentStreamEvent[],
  metadata: any,
  isLive: boolean
): StepStatus[] {
  if (!plan) return [];

  if (isLive) {
    return plan.steps.map((step) => {
      const stepStarted = streamEvents.some(
        (e) => e.type === 'step_start' && e.stepId === step.id
      );
      const stepComplete = streamEvents.find(
        (e) => e.type === 'step_complete' && e.stepId === step.id
      );

      let status: StepStatus['status'] = 'pending';
      let resultSummary: string | undefined;

      if (stepComplete) {
        status = 'complete';
        // Extract result summary from step_complete event if available
        if (stepComplete.artifact) {
          const result = stepComplete.artifact as any;
          if (result.sqlResult?.rowCount !== undefined) {
            resultSummary = `${result.sqlResult.rowCount} rows`;
          }
        }
      } else if (stepStarted) {
        status = 'running';
      }

      return {
        stepId: step.id,
        description: step.description,
        strategy: step.strategy,
        status,
        resultSummary,
      };
    });
  } else {
    // History mode: use metadata.stepResults
    const stepResults = metadata?.stepResults || [];
    return plan.steps.map((step) => {
      const stepResult = stepResults.find((r: any) => r.stepId === step.id);

      let status: StepStatus['status'] = 'complete';
      let resultSummary: string | undefined;

      if (stepResult) {
        if (stepResult.error) {
          status = 'failed';
          resultSummary = stepResult.error;
        } else if (stepResult.sqlResult?.rowCount !== undefined) {
          resultSummary = `${stepResult.sqlResult.rowCount} rows`;
        } else if (stepResult.pythonResult) {
          resultSummary = 'Python complete';
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
}

/**
 * Extract phase details with tool calls from stream events or metadata
 */
export function extractPhaseDetails(
  streamEvents: DataAgentStreamEvent[],
  metadata: any,
  isLive: boolean
): PhaseDetail[] {
  if (isLive) {
    // Build phase details from stream events
    const phaseMap = new Map<string, PhaseDetail>();

    // Initialize all phases as pending
    PHASE_ORDER.forEach((phase) => {
      phaseMap.set(phase, {
        phase,
        label: PHASE_LABELS[phase] || phase,
        status: 'pending',
        toolCalls: [],
      });
    });

    // Update statuses from events
    streamEvents.forEach((event) => {
      if (event.type === 'phase_start' && event.phase) {
        const detail = phaseMap.get(event.phase);
        if (detail) {
          detail.status = 'active';
        }
      } else if (event.type === 'phase_complete' && event.phase) {
        const detail = phaseMap.get(event.phase);
        if (detail) {
          detail.status = 'complete';
        }
      } else if (event.type === 'tool_start' && event.phase) {
        const detail = phaseMap.get(event.phase);
        if (detail && event.name) {
          detail.toolCalls.push({
            name: event.name,
            isComplete: false,
          });
        }
      } else if (event.type === 'tool_end' && event.phase) {
        const detail = phaseMap.get(event.phase);
        if (detail && event.name) {
          const toolCall = detail.toolCalls.find((tc) => tc.name === event.name && !tc.isComplete);
          if (toolCall) {
            toolCall.isComplete = true;
            toolCall.result = event.result ? JSON.stringify(event.result) : undefined;
          }
        }
      }
    });

    return Array.from(phaseMap.values());
  } else {
    // History mode: group toolCalls by phase
    const toolCalls = metadata?.toolCalls || [];
    const phaseMap = new Map<string, PhaseDetail>();

    // Initialize all phases as pending
    PHASE_ORDER.forEach((phase) => {
      phaseMap.set(phase, {
        phase,
        label: PHASE_LABELS[phase] || phase,
        status: 'pending',
        toolCalls: [],
      });
    });

    // Group tool calls by phase
    toolCalls.forEach((tc: any) => {
      const phase = tc.phase;
      if (phase) {
        const detail = phaseMap.get(phase);
        if (detail) {
          detail.status = 'complete'; // If there are tool calls, phase is complete
          detail.toolCalls.push({
            name: tc.name,
            result: tc.result ? JSON.stringify(tc.result) : undefined,
            isComplete: true,
          });
        }
      }
    });

    return Array.from(phaseMap.values());
  }
}

/**
 * Format duration in milliseconds as m:ss
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Extract cumulative token usage from live stream events.
 * Sums up all token_update events emitted by agent phases.
 */
export function extractLiveTokens(
  streamEvents: DataAgentStreamEvent[],
): { prompt: number; completion: number; total: number } | null {
  const tokenEvents = streamEvents.filter((e) => e.type === 'token_update');
  if (tokenEvents.length === 0) return null;
  return tokenEvents.reduce(
    (acc, e) => ({
      prompt: acc.prompt + (e.tokensUsed?.prompt || 0),
      completion: acc.completion + (e.tokensUsed?.completion || 0),
      total: acc.total + (e.tokensUsed?.total || 0),
    }),
    { prompt: 0, completion: 0, total: 0 },
  );
}

/**
 * Format token count with commas
 */
export function formatTokenCount(n: number): string {
  return n.toLocaleString('en-US');
}

// Join Plan Types
export interface JoinEdgeData {
  fromDataset: string;
  toDataset: string;
  fromColumns: string[];
  toColumns: string[];
  relationshipName: string;
}

export interface JoinPlanData {
  relevantDatasets: Array<{ name: string; description: string; source: string; yaml?: string }>;
  joinPaths: Array<{
    datasets: string[];
    edges: JoinEdgeData[];
  }>;
  notes: string;
}

/**
 * Extract join plan from either live stream events or message metadata
 */
export function extractJoinPlan(
  streamEvents: DataAgentStreamEvent[],
  metadata: any,
  isLive: boolean
): JoinPlanData | null {
  if (isLive) {
    const navigatorArtifact = streamEvents.find(
      (e) => e.type === 'phase_artifact' && e.phase === 'navigator'
    );
    if (!navigatorArtifact?.artifact) return null;
    return navigatorArtifact.artifact as unknown as JoinPlanData;
  } else {
    return metadata?.joinPlan || null;
  }
}

/**
 * Transform JoinPlanArtifact into OntologyGraph format for visualization
 */
export function joinPlanToGraph(joinPlan: JoinPlanData): OntologyGraphType {
  // 1. Create GraphNode for each dataset in relevantDatasets
  const nodeMap = new Map<string, GraphNode>();
  joinPlan.relevantDatasets.forEach((ds, idx) => {
    nodeMap.set(ds.name, {
      id: `ds-${idx}`,
      label: 'Dataset',
      name: ds.name,
      properties: {
        name: ds.name,
        source: ds.source,
        description: ds.description,
        yaml: ds.yaml || '',
      },
    });
  });

  // 2. Collect unique edges, deduplicate by fromDataset|toDataset|relationshipName
  const seenEdges = new Set<string>();
  const edges: GraphEdge[] = [];

  joinPlan.joinPaths.forEach((jp) => {
    jp.edges.forEach((edge) => {
      const key = `${edge.fromDataset}|${edge.toDataset}|${edge.relationshipName}`;
      if (seenEdges.has(key)) return;
      seenEdges.add(key);

      const sourceNode = nodeMap.get(edge.fromDataset);
      const targetNode = nodeMap.get(edge.toDataset);
      if (!sourceNode || !targetNode) return;

      edges.push({
        id: `edge-${edges.length}`,
        source: sourceNode.id,
        target: targetNode.id,
        type: 'RELATES_TO',
        properties: {
          name: edge.relationshipName,
          fromColumns: edge.fromColumns.join(', '),
          toColumns: edge.toColumns.join(', '),
        },
      });
    });
  });

  return {
    nodes: Array.from(nodeMap.values()),
    edges,
  };
}

// LLM Trace Types and Utilities

export interface LiveLlmTrace {
  callIndex: number;
  phase: string;
  stepId?: number;
  purpose: string;
  provider: string;
  model: string;
  structuredOutput: boolean;
  promptSummary?: { messageCount: number; totalChars: number };
  status: 'running' | 'complete' | 'error';
  durationMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  responsePreview?: string;
  toolCallCount?: number;
  error?: string;
}

/**
 * Extract live LLM traces from stream events by pairing llm_call_start and llm_call_end events
 */
export function extractLiveLlmTraces(
  streamEvents: DataAgentStreamEvent[],
): LiveLlmTrace[] {
  const traceMap = new Map<number, LiveLlmTrace>();

  for (const event of streamEvents) {
    if (event.type === 'llm_call_start' && event.callIndex !== undefined) {
      traceMap.set(event.callIndex, {
        callIndex: event.callIndex,
        phase: event.phase || '',
        stepId: event.stepId,
        purpose: event.purpose || '',
        provider: event.provider || '',
        model: event.model || '',
        structuredOutput: event.structuredOutput || false,
        promptSummary: event.promptSummary,
        status: 'running',
      });
    } else if (event.type === 'llm_call_end' && event.callIndex !== undefined) {
      const existing = traceMap.get(event.callIndex);
      if (existing) {
        existing.status = event.error ? 'error' : 'complete';
        existing.durationMs = event.durationMs;
        existing.promptTokens = event.promptTokens;
        existing.completionTokens = event.completionTokens;
        existing.totalTokens = event.totalTokens;
        existing.responsePreview = event.responsePreview;
        existing.toolCallCount = event.toolCallCount;
        existing.error = event.error;
      }
    }
  }

  return Array.from(traceMap.values()).sort((a, b) => a.callIndex - b.callIndex);
}
