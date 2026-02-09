import { Annotation, MessagesAnnotation } from '@langchain/langgraph';

export const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,

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

  // Validation tracking
  validationAttempts: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),

  // Discovery plan
  plan: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  planApproved: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),

  // Generated model
  semanticModel: Annotation<Record<string, unknown> | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // Run tracking
  semanticModelId: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // Status
  error: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
});

export type AgentStateType = typeof AgentState.State;
