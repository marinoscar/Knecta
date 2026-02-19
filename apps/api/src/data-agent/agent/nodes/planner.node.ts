import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { DataAgentStateType } from '../state';
import { PlanArtifact } from '../types';
import { EmitFn } from '../graph';
import { buildPlannerPrompt } from '../prompts/planner.prompt';
import { z } from 'zod';
import { extractTokenUsage } from '../utils/token-tracker';
import { DataAgentTracer } from '../utils/data-agent-tracer';

const PlanStepSchema = z.object({
  id: z.number().describe('Step number (1, 2, 3, ...)'),
  description: z.string().describe('What this step does'),
  strategy: z.enum(['sql', 'python', 'sql_then_python']).describe('Execution strategy'),
  dependsOn: z.array(z.number()).describe('IDs of steps this depends on'),
  datasets: z.array(z.string()).describe('Dataset names needed for this step'),
  expectedOutput: z.string().describe('What this step produces'),
  chartType: z.enum(['bar', 'line', 'pie', 'scatter'])
    .nullable()
    .optional()
    .describe(
      'Chart type for visualization steps. Set when the step should produce an interactive chart. ' +
      'Use "bar" for comparisons/rankings, "line" for trends, "pie" for proportions (<=6 categories), ' +
      '"scatter" for correlations. Omit or set null for non-visualization steps.'
    ),
});

const PlanArtifactSchema = z.object({
  complexity: z.enum(['simple', 'analytical', 'conversational']).describe('simple=single-table data query, analytical=multi-table/complex, conversational=no data needed (schema questions, explanations)'),
  intent: z.string().describe('High-level intent of the question'),
  metrics: z.array(z.string()).describe('Metrics/measures referenced'),
  dimensions: z.array(z.string()).describe('Dimensions/groupings referenced'),
  timeWindow: z.string().nullable().describe('Time range if applicable'),
  filters: z.array(z.string()).describe('Filter conditions mentioned'),
  grain: z.string().describe('Level of detail (e.g., per-store, per-month)'),
  ambiguities: z.array(z.object({
    question: z.string(),
    assumption: z.string(),
  })).describe('Ambiguities found and assumptions made'),
  acceptanceChecks: z.array(z.string()).describe('Checks the verifier should run to validate results'),
  shouldClarify: z.boolean().describe(
    'Set to true ONLY when the question has critical ambiguities that would significantly change the analysis result. Do NOT set true for minor ambiguities where reasonable defaults exist.'
  ),
  clarificationQuestions: z.array(z.object({
    question: z.string().describe('A specific, clear question to ask the user'),
    assumption: z.string().describe('What the agent will assume if the user does not answer'),
  })).max(3).describe('Up to 3 clarification questions. Only populated when shouldClarify is true. Empty array when shouldClarify is false.'),
  steps: z.array(PlanStepSchema).describe('Ordered sub-tasks to execute'),
});

export function createPlannerNode(llm: any, emit: EmitFn, tracer: DataAgentTracer) {
  return async (state: DataAgentStateType): Promise<Partial<DataAgentStateType>> => {
    emit({ type: 'phase_start', phase: 'planner', description: 'Analyzing question and creating execution plan' });

    try {
      const systemPrompt = buildPlannerPrompt(
        state.conversationContext,
        state.relevantDatasets,
        state.relevantDatasetDetails,
        state.userPreferences,
      );

      const structuredLlm = llm.withStructuredOutput(PlanArtifactSchema, {
        name: 'create_plan',
        includeRaw: true,
      });

      const messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage(state.userQuestion),
      ];

      const { response } = await tracer.trace<any>(
        { phase: 'planner', purpose: 'plan_generation', structuredOutput: true },
        messages,
        () => structuredLlm.invoke(messages),
      );

      const result = response.parsed as PlanArtifact;
      const nodeTokens = extractTokenUsage(response.raw);

      emit({ type: 'phase_artifact', phase: 'planner', artifact: result });
      emit({ type: 'token_update', phase: 'planner', tokensUsed: nodeTokens });
      emit({ type: 'phase_complete', phase: 'planner' });

      return {
        plan: result,
        currentPhase: 'planner',
        tokensUsed: nodeTokens,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      emit({ type: 'phase_complete', phase: 'planner' });
      return {
        plan: {
          complexity: 'simple',
          intent: state.userQuestion,
          metrics: [],
          dimensions: [],
          timeWindow: null,
          filters: [],
          grain: 'unknown',
          ambiguities: [],
          acceptanceChecks: [],
          shouldClarify: false,
          clarificationQuestions: [],
          steps: [{
            id: 1,
            description: state.userQuestion,
            strategy: 'sql',
            dependsOn: [],
            datasets: state.relevantDatasets,
            expectedOutput: 'Query results',
          }],
        },
        currentPhase: 'planner',
        error: `Planner fallback: ${msg}`,
        tokensUsed: { prompt: 0, completion: 0, total: 0 },
      };
    }
  };
}
