import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { DataAgentStateType } from '../state';
import { QuerySpec } from '../types';
import { EmitFn } from '../graph';
import { buildSqlBuilderPrompt } from '../prompts/sql-builder.prompt';
import { NeoOntologyService } from '../../../ontologies/neo-ontology.service';
import { extractTokenUsage } from '../utils/token-tracker';
import { DataAgentTracer } from '../utils/data-agent-tracer';

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
  tracer: DataAgentTracer,
  webSearchTool: Record<string, unknown> | null = null,
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

      const dialectType = (databaseType === 's3' || databaseType === 'azure_blob') ? 'DuckDB' : databaseType;

      const systemPrompt = buildSqlBuilderPrompt(
        plan,
        enrichedJoinPlan,
        dialectType,
        state.revisionDiagnosis,
        !!webSearchTool,
      );

      // Bind web search (server-side) before withStructuredOutput so the provider
      // can look up dialect-specific syntax during query generation.
      const baseLlm = webSearchTool ? llm.bindTools([webSearchTool]) : llm;
      const structuredLlm = baseLlm.withStructuredOutput(QuerySpecSchema, {
        name: 'generate_queries',
        includeRaw: true,
      });

      const messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage(
          `Generate SQL queries for the plan. User question: "${state.userQuestion}"`,
        ),
      ];

      const { response } = await tracer.trace<any>(
        { phase: 'sql_builder', purpose: 'query_generation', structuredOutput: true },
        messages,
        () => structuredLlm.invoke(messages),
      );

      const querySpecs: QuerySpec[] = response.parsed.queries;
      const nodeTokens = extractTokenUsage(response.raw);

      // ── Column validation against YAML schemas (defense-in-depth) ──
      const knownColumns = new Set<string>();
      for (const ds of enrichedJoinPlan.relevantDatasets) {
        // Extract field names from YAML using simple regex
        const fieldMatches = ds.yaml.matchAll(/^\s*-?\s*name:\s*(\S+)/gm);
        for (const match of fieldMatches) {
          knownColumns.add(match[1].toLowerCase());
        }
      }

      // Warn if expectedColumns reference unknown fields
      if (knownColumns.size > 0) {
        for (const qs of querySpecs) {
          for (const col of qs.expectedColumns) {
            if (!knownColumns.has(col.toLowerCase())) {
              qs.notes += qs.notes ? ` WARNING: "${col}" not found in YAML schemas.` : `WARNING: "${col}" not found in YAML schemas.`;
            }
          }
        }
      }

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
