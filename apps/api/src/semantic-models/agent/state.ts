import { Annotation } from '@langchain/langgraph';
import { OSIDataset, OSIRelationship, OSIMetric, OSIAIContext } from './osi/types';
import { ForeignKeyInfo } from '../../connections/drivers/driver.interface';

export const AgentState = Annotation.Root({
  // Input context
  connectionId: Annotation<string>,
  userId: Annotation<string>,
  databaseName: Annotation<string>,
  selectedSchemas: Annotation<string[]>,
  selectedTables: Annotation<string[]>,   // format: "schema.table"
  runId: Annotation<string>,

  // User-provided context
  modelName: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  instructions: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // Per-table discovery results (accumulated by discover_and_generate)
  datasets: Annotation<OSIDataset[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  foreignKeys: Annotation<ForeignKeyInfo[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  tableMetrics: Annotation<OSIMetric[][]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  failedTables: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // Model assembly results
  relationships: Annotation<OSIRelationship[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  modelMetrics: Annotation<OSIMetric[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  modelAiContext: Annotation<OSIAIContext | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // Generated model
  semanticModel: Annotation<Record<string, unknown> | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // Token tracking
  tokensUsed: Annotation<{ prompt: number; completion: number; total: number }>({
    reducer: (_, next) => next,
    default: () => ({ prompt: 0, completion: 0, total: 0 }),
  }),

  // Run tracking
  semanticModelId: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  error: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
});

export type AgentStateType = typeof AgentState.State;
