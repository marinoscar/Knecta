import type { DataAgentStreamEvent } from '../../types';

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
    return plannerArtifact.artifact as PlanData;
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
 * Format token count with commas
 */
export function formatTokenCount(n: number): string {
  return n.toLocaleString('en-US');
}
