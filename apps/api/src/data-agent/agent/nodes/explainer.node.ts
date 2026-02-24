import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { DataAgentStateType } from '../state';
import { ExplainerOutput, DataLineage } from '../types';
import { EmitFn } from '../graph';
import { buildExplainerPrompt, buildConversationalPrompt } from '../prompts/explainer.prompt';
import { SandboxService } from '../../../sandbox/sandbox.service';
import { extractTokenUsage } from '../utils/token-tracker';
import { DataAgentTracer } from '../utils/data-agent-tracer';
import { extractTextContent } from '../utils/content-extractor';

export function createExplainerNode(
  llm: any,
  sandboxService: SandboxService,
  emit: EmitFn,
  tracer: DataAgentTracer,
  webSearchTool: Record<string, unknown> | null = null,
) {
  // Bind web search (server-side) once at node creation time.
  const invoker = webSearchTool ? llm.bindTools([webSearchTool]) : llm;

  return async (state: DataAgentStateType): Promise<Partial<DataAgentStateType>> => {
    emit({ type: 'phase_start', phase: 'explainer', description: 'Synthesizing answer' });

    try {
      // Handle "cannot answer" — Navigator determined ontology can't support the query
      if (state.cannotAnswer) {
        const ca = state.cannotAnswer;
        const availableList = ca.availableDatasets?.length
          ? `\n\nAvailable datasets in this ontology:\n${ca.availableDatasets.map((d) => `- ${d}`).join('\n')}`
          : '';
        const narrative = `I cannot answer this question with the current ontology.\n\n**Reason**: ${ca.reason}${availableList}\n\n**Suggestion**: Consider adding more tables to your semantic model that contain the data needed for this analysis.`;
        const output: ExplainerOutput = {
          narrative,
          dataLineage: { datasets: [], joins: [], timeWindow: null, filters: [], grain: '', rowCount: null },
          caveats: [ca.reason],
          charts: [],
        };
        emit({ type: 'phase_artifact', phase: 'explainer', artifact: output });
        emit({ type: 'text', content: narrative });
        emit({ type: 'phase_complete', phase: 'explainer' });
        return {
          explainerOutput: output,
          currentPhase: 'explainer',
          tokensUsed: { prompt: 0, completion: 0, total: 0 },
        };
      }

      // Handle "conversational" — answer directly without data
      if (state.plan?.complexity === 'conversational') {
        const conversationalPrompt = buildConversationalPrompt(
          state.userQuestion,
          state.plan,
          state.conversationContext,
          state.relevantDatasetDetails,
          state.userPreferences,
          webSearchTool !== null,
        );
        const messages = [
          new SystemMessage(conversationalPrompt),
          new HumanMessage('Provide the answer.'),
        ];
        const { response } = await tracer.trace<any>(
          { phase: 'explainer', purpose: 'conversational_narrative', structuredOutput: false },
          messages,
          () => invoker.invoke(messages),
        );
        const nodeTokens = extractTokenUsage(response);
        const narrative = extractTextContent(response.content);
        const output: ExplainerOutput = {
          narrative,
          dataLineage: { datasets: [], joins: [], timeWindow: null, filters: [], grain: '', rowCount: null },
          caveats: [],
          charts: [],
        };
        emit({ type: 'phase_artifact', phase: 'explainer', artifact: output });
        emit({ type: 'text', content: narrative });
        emit({ type: 'token_update', phase: 'explainer', tokensUsed: nodeTokens });
        emit({ type: 'phase_complete', phase: 'explainer' });
        return {
          explainerOutput: output,
          currentPhase: 'explainer',
          tokensUsed: nodeTokens,
        };
      }

      const plan = state.plan!;
      const stepResults = state.stepResults || [];
      const verificationReport = state.verificationReport;
      const joinPlan = state.joinPlan;

      const prompt = buildExplainerPrompt(
        state.userQuestion,
        plan,
        stepResults,
        verificationReport,
        state.conversationContext,
        state.userPreferences,
        webSearchTool !== null,
      );

      // Get narrative from LLM
      const messages = [
        new SystemMessage(prompt),
        new HumanMessage('Provide the answer.'),
      ];
      const { response } = await tracer.trace<any>(
        { phase: 'explainer', purpose: 'narrative', structuredOutput: false },
        messages,
        () => invoker.invoke(messages),
      );
      const nodeTokens = extractTokenUsage(response);

      const narrative = extractTextContent(response.content);

      // Collect charts from all step results
      const charts: string[] = [];
      for (const result of stepResults) {
        if (result.pythonResult?.charts) {
          charts.push(...result.pythonResult.charts);
        }
      }

      // Build data lineage
      const datasetsUsed = new Set<string>();
      for (const step of plan.steps) {
        for (const ds of step.datasets) {
          datasetsUsed.add(ds);
        }
      }

      const joins: DataLineage['joins'] = [];
      if (joinPlan) {
        for (const jp of joinPlan.joinPaths) {
          for (const edge of jp.edges) {
            joins.push({
              from: edge.fromDataset,
              to: edge.toDataset,
              on: `${edge.fromColumns.join(', ')} = ${edge.toColumns.join(', ')}`,
            });
          }
        }
      }

      const totalRows = stepResults.reduce((sum, r) => sum + (r.sqlResult?.rowCount || 0), 0);

      const dataLineage: DataLineage = {
        datasets: [...datasetsUsed],
        joins,
        timeWindow: plan.timeWindow,
        filters: plan.filters,
        grain: plan.grain,
        rowCount: totalRows || null,
      };

      // Build caveats
      const caveats: string[] = [];
      if (verificationReport && !verificationReport.passed) {
        caveats.push(`Verification issues: ${verificationReport.diagnosis}`);
      }
      for (const ambiguity of plan.ambiguities) {
        caveats.push(`Assumption: ${ambiguity.assumption}`);
      }
      for (const result of stepResults) {
        if (result.error) {
          caveats.push(`Step ${result.stepId} error: ${result.error}`);
        }
      }

      const explainerOutput: ExplainerOutput = {
        narrative,
        dataLineage,
        caveats,
        charts,
      };

      emit({ type: 'phase_artifact', phase: 'explainer', artifact: explainerOutput });
      emit({ type: 'text', content: narrative });
      emit({ type: 'token_update', phase: 'explainer', tokensUsed: nodeTokens });
      emit({ type: 'phase_complete', phase: 'explainer' });

      return {
        explainerOutput,
        currentPhase: 'explainer',
        tokensUsed: nodeTokens,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const fallbackOutput: ExplainerOutput = {
        narrative: `I encountered an error while synthesizing the answer: ${msg}`,
        dataLineage: { datasets: [], joins: [], timeWindow: null, filters: [], grain: '', rowCount: null },
        caveats: [`Explainer error: ${msg}`],
        charts: [],
      };
      emit({ type: 'text', content: fallbackOutput.narrative });
      emit({ type: 'phase_complete', phase: 'explainer' });
      return {
        explainerOutput: fallbackOutput,
        currentPhase: 'explainer',
        tokensUsed: { prompt: 0, completion: 0, total: 0 },
      };
    }
  };
}
