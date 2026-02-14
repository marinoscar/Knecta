import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { DataAgentStateType } from '../state';
import { QuerySpec } from '../types';
import { EmitFn } from '../graph';
import { buildSqlBuilderPrompt } from '../prompts/sql-builder.prompt';
import { NeoOntologyService } from '../../../ontologies/neo-ontology.service';
import { extractTokenUsage } from '../utils/token-tracker';

const QuerySpecSchema = z.object({
  queries: z.array(z.object({
    stepId: z.number().describe('The step ID from the plan'),
    description: z.string().describe('What this query does'),
    pilotSql: z.string().describe('Lightweight probe query with LIMIT 10'),
    fullSql: z.string().describe('Full query without artificial LIMIT'),
    expectedColumns: z.array(z.string()).describe('Expected column names in the result'),
    notes: z.string().describe('Any notes about the query'),
  })),
});

export function createSqlBuilderNode(
  llm: any,
  neoOntologyService: NeoOntologyService,
  ontologyId: string,
  databaseType: string,
  emit: EmitFn,
) {
  return async (state: DataAgentStateType): Promise<Partial<DataAgentStateType>> => {
    emit({ type: 'phase_start', phase: 'sql_builder', description: 'Generating SQL queries for each step' });

    try {
      const plan = state.plan!;
      const joinPlan = state.joinPlan!;

      // If joinPlan has no dataset details yet (e.g. on revision), fetch them
      let enrichedJoinPlan = joinPlan;
      if (joinPlan.relevantDatasets.length === 0 && plan.steps.length > 0) {
        const allDatasets = new Set<string>();
        plan.steps.forEach((s) => s.datasets.forEach((d) => allDatasets.add(d)));
        const details = await neoOntologyService.getDatasetsByNames(ontologyId, [...allDatasets]);
        enrichedJoinPlan = {
          ...joinPlan,
          relevantDatasets: details.map((ds) => ({
            name: ds.name,
            description: ds.description,
            source: ds.source,
            yaml: ds.yaml,
          })),
        };
      }

      const systemPrompt = buildSqlBuilderPrompt(
        plan,
        enrichedJoinPlan,
        databaseType,
        state.revisionDiagnosis,
      );

      const structuredLlm = llm.withStructuredOutput(QuerySpecSchema, {
        name: 'generate_queries',
        includeRaw: true,
      });

      const response = await structuredLlm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(
          `Generate SQL queries for the plan. User question: "${state.userQuestion}"`,
        ),
      ]);

      const querySpecs: QuerySpec[] = response.parsed.queries;
      const nodeTokens = extractTokenUsage(response.raw);

      emit({ type: 'phase_artifact', phase: 'sql_builder', artifact: querySpecs });
      emit({ type: 'token_update', phase: 'sql_builder', tokensUsed: nodeTokens });
      emit({ type: 'phase_complete', phase: 'sql_builder' });

      return {
        querySpecs,
        currentPhase: 'sql_builder',
        error: undefined,
        tokensUsed: nodeTokens,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      emit({ type: 'phase_complete', phase: 'sql_builder' });
      return {
        querySpecs: [],
        currentPhase: 'sql_builder',
        error: `SQL Builder error: ${msg}`,
        tokensUsed: { prompt: 0, completion: 0, total: 0 },
      };
    }
  };
}
