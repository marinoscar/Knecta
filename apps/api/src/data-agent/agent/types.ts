/**
 * Multi-phase Data Agent type definitions.
 *
 * These types define the structured artifacts passed between phases:
 * Planner → Navigator → SQL Builder → Executor → Verifier → Explainer
 */

// ─── Planner Artifacts ───

export interface PlanStep {
  id: number;
  description: string;
  strategy: 'sql' | 'python' | 'sql_then_python';
  dependsOn: number[];
  datasets: string[];
  expectedOutput: string;
}

export interface PlanArtifact {
  complexity: 'simple' | 'analytical';
  intent: string;
  metrics: string[];
  dimensions: string[];
  timeWindow: string | null;
  filters: string[];
  grain: string;
  ambiguities: Array<{ question: string; assumption: string }>;
  acceptanceChecks: string[];
  steps: PlanStep[];
}

// ─── Navigator Artifacts ───

export interface JoinEdge {
  fromDataset: string;
  toDataset: string;
  fromColumns: string[];
  toColumns: string[];
  relationshipName: string;
}

export interface JoinPath {
  datasets: string[];
  edges: JoinEdge[];
}

export interface JoinPlanArtifact {
  relevantDatasets: Array<{ name: string; description: string; source: string; yaml: string }>;
  joinPaths: JoinPath[];
  notes: string;
}

// ─── SQL Builder Artifacts ───

export interface QuerySpec {
  stepId: number;
  description: string;
  pilotSql: string;
  fullSql: string;
  expectedColumns: string[];
  notes: string;
}

// ─── Executor Artifacts ───

export interface StepResult {
  stepId: number;
  description: string;
  strategy: 'sql' | 'python' | 'sql_then_python';
  sqlResult?: {
    rowCount: number;
    columns: string[];
    data: string;
  };
  pythonResult?: {
    stdout: string;
    charts: string[];
  };
  error?: string;
}

// ─── Verifier Artifacts ───

export interface VerificationCheck {
  name: string;
  passed: boolean;
  message: string;
}

export interface VerificationReport {
  passed: boolean;
  checks: VerificationCheck[];
  diagnosis: string;
  recommendedTarget: 'navigator' | 'sql_builder' | null;
}

// ─── Explainer Artifacts ───

export interface DataLineage {
  datasets: string[];
  joins: Array<{ from: string; to: string; on: string }>;
  timeWindow: string | null;
  filters: string[];
  grain: string;
  rowCount: number | null;
}

export interface ExplainerOutput {
  narrative: string;
  dataLineage: DataLineage;
  caveats: string[];
  charts: string[];
}

// ─── Tool Call Tracking ───

export interface TrackedToolCall {
  phase: string;
  stepId?: number;
  name: string;
  args: Record<string, unknown>;
  result?: string;
}

// ─── SSE Event Types ───

export type DataAgentPhase =
  | 'planner'
  | 'navigator'
  | 'sql_builder'
  | 'executor'
  | 'verifier'
  | 'explainer';

export type DataAgentEventType =
  | 'message_start'
  | 'message_chunk'
  | 'message_complete'
  | 'message_error'
  | 'tool_start'
  | 'tool_end'
  | 'tool_error'
  | 'phase_start'
  | 'phase_complete'
  | 'phase_artifact'
  | 'step_start'
  | 'step_complete';

// ─── Message Metadata ───

export interface DataAgentMessageMetadata {
  toolCalls: TrackedToolCall[];
  tokensUsed: { prompt: number; completion: number; total: number };
  datasetsUsed: string[];
  plan?: PlanArtifact;
  joinPlan?: JoinPlanArtifact;
  stepResults?: StepResult[];
  verificationReport?: { passed: boolean; checks: VerificationCheck[] };
  dataLineage?: DataLineage;
  revisionsUsed: number;
  durationMs?: number;
  startedAt?: number;
}
