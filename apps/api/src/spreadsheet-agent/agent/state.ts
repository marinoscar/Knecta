import { Annotation } from '@langchain/langgraph';
import type {
  ProjectFile,
  RunConfig,
  FileInventory,
  SheetAnalysis,
  ExtractionPlan,
  PlanModification,
  ExtractionResult,
  ValidationReport,
  TokenUsage,
} from './types';

export const SpreadsheetAgentState = Annotation.Root({
  // ─── Inputs (set once at invocation) ───
  runId: Annotation<string>,
  projectId: Annotation<string>,
  userId: Annotation<string>,
  files: Annotation<ProjectFile[]>,
  config: Annotation<RunConfig>,

  // ─── Phase Artifacts ───
  fileInventory: Annotation<FileInventory[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  sheetAnalyses: Annotation<SheetAnalysis[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  extractionPlan: Annotation<ExtractionPlan | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  planModifications: Annotation<PlanModification[] | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  extractionResults: Annotation<ExtractionResult[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  validationReport: Annotation<ValidationReport | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // ─── Control Flow ───
  currentPhase: Annotation<string | null>({
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

  // ─── Tracking ───
  tokensUsed: Annotation<TokenUsage>({
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
});

export type SpreadsheetAgentStateType = typeof SpreadsheetAgentState.State;
