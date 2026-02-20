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
  /**
   * Chart type for visualization steps
   * When set, executor will generate a ChartSpec instead of using Python sandbox
   * null/undefined for non-visualization steps
   */
  chartType?: 'bar' | 'line' | 'pie' | 'scatter' | null;
}

export interface PlanArtifact {
  complexity: 'simple' | 'analytical' | 'conversational';
  intent: string;
  metrics: string[];
  dimensions: string[];
  timeWindow: string | null;
  filters: string[];
  grain: string;
  ambiguities: Array<{ question: string; assumption: string }>;
  acceptanceChecks: string[];
  shouldClarify: boolean;
  clarificationQuestions: Array<{ question: string; assumption: string }>;
  /** Planner's self-assessed confidence that the plan is unambiguous */
  confidenceLevel: 'high' | 'medium' | 'low';
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
  chartSpec?: ChartSpec;
  error?: string;
}

// ─── Chart Specification Types ───

export interface ChartSeries {
  label: string;
  data: number[];
}

export interface ChartSlice {
  label: string;
  value: number;
}

export interface ChartPoint {
  x: number;
  y: number;
  label?: string;
}

export interface ChartSpec {
  type: 'bar' | 'line' | 'pie' | 'scatter';
  title: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  categories?: string[];
  series?: ChartSeries[];
  slices?: ChartSlice[];
  points?: ChartPoint[];
  layout?: 'vertical' | 'horizontal';
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

// ─── Cannot Answer Artifact ───

export interface CannotAnswerArtifact {
  reason: string;
  missingDatasets?: string[];
  missingJoins?: string[];
  availableDatasets?: string[];
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
  | 'step_complete'
  | 'llm_call_start'
  | 'llm_call_end'
  | 'token_update'
  | 'clarification_requested'
  | 'preference_suggested'
  | 'preference_auto_saved'
  | 'discovery_start'
  | 'discovery_complete';

// ─── Discovery Result ───

export interface DiscoveryResult {
  embeddingDurationMs: number;
  vectorSearchDurationMs: number;
  yamlFetchDurationMs: number;
  matchedDatasets: Array<{ name: string; score: number }>;
  datasetsWithYaml: number;
  preferencesLoaded: number;
}

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
  clarificationQuestions?: Array<{ question: string; assumption: string }>;
  cannotAnswer?: CannotAnswerArtifact;
  revisionsUsed: number;
  durationMs?: number;
  startedAt?: number;
  llmCallCount?: number;
  discovery?: DiscoveryResult;
}

// ─── LLM Tracing ───

export interface LlmTraceInput {
  phase: DataAgentPhase;
  stepId?: number;
  purpose: string;
  structuredOutput: boolean;
}

export interface CollectedTrace {
  phase: DataAgentPhase;
  callIndex: number;
  stepId?: number;
  purpose: string;
  provider: string;
  model: string;
  temperature?: number;
  structuredOutput: boolean;
  promptMessages: Array<{ role: string; content: string }>;
  responseContent: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  error?: string;
}
