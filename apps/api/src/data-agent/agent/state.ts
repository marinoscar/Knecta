import { Annotation } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';
import {
  PlanArtifact,
  JoinPlanArtifact,
  QuerySpec,
  StepResult,
  VerificationReport,
  ExplainerOutput,
  TrackedToolCall,
  DataAgentPhase,
} from './types';

export const DataAgentState = Annotation.Root({
  // ─── Inputs (set once at invocation) ───
  userQuestion: Annotation<string>,
  chatId: Annotation<string>,
  messageId: Annotation<string>,
  userId: Annotation<string>,
  ontologyId: Annotation<string>,
  connectionId: Annotation<string>,
  databaseType: Annotation<string>,
  conversationContext: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),
  relevantDatasets: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // ─── Pre-fetched Dataset Details (with YAML) ───
  relevantDatasetDetails: Annotation<Array<{ name: string; description: string; source: string; yaml: string }>>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // ─── User Preferences ───
  userPreferences: Annotation<Array<{ key: string; value: string; source: string }>>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // ─── Phase Artifacts ───
  plan: Annotation<PlanArtifact | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  joinPlan: Annotation<JoinPlanArtifact | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  querySpecs: Annotation<QuerySpec[] | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  stepResults: Annotation<StepResult[] | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  verificationReport: Annotation<VerificationReport | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  explainerOutput: Annotation<ExplainerOutput | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // ─── Control Flow ───
  currentPhase: Annotation<DataAgentPhase | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  revisionCount: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),
  revisionDiagnosis: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  revisionTarget: Annotation<'navigator' | 'sql_builder' | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // ─── Tracking ───
  toolCalls: Annotation<TrackedToolCall[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  tokensUsed: Annotation<{ prompt: number; completion: number; total: number }>({
    reducer: (prev, next) => ({
      prompt: prev.prompt + next.prompt,
      completion: prev.completion + next.completion,
      total: prev.total + next.total,
    }),
    default: () => ({ prompt: 0, completion: 0, total: 0 }),
  }),
  error: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // ─── Navigator Messages (for mini-ReAct loop) ───
  messages: Annotation<BaseMessage[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
});

export type DataAgentStateType = typeof DataAgentState.State;
