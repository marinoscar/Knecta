import { HumanMessage, SystemMessage, AIMessage, ToolMessage, BaseMessage } from '@langchain/core/messages';
import { DataAgentStateType } from '../state';
import { JoinPlanArtifact } from '../types';
import { EmitFn } from '../graph';
import { buildNavigatorPrompt } from '../prompts/navigator.prompt';
import { createListDatasetsTool } from '../tools/list-datasets.tool';
import { createGetDatasetDetailsTool } from '../tools/get-dataset-details.tool';
import { createGetRelationshipsTool } from '../tools/get-relationships.tool';
import { NeoOntologyService } from '../../../ontologies/neo-ontology.service';
import { extractTokenUsage, mergeTokenUsage } from '../utils/token-tracker';
import { DataAgentTracer } from '../utils/data-agent-tracer';
import { extractTextContent } from '../utils/content-extractor';

const MAX_NAVIGATOR_ITERATIONS = 8;

export function createNavigatorNode(
  llm: any,
  neoOntologyService: NeoOntologyService,
  ontologyId: string,
  emit: EmitFn,
  tracer: DataAgentTracer,
  webSearchTool: Record<string, unknown> | null = null,
) {
  return async (state: DataAgentStateType): Promise<Partial<DataAgentStateType>> => {
    emit({ type: 'phase_start', phase: 'navigator', description: 'Exploring ontology to find datasets and join paths' });

    try {
      const plan = state.plan!;
      const systemPrompt = buildNavigatorPrompt(plan, webSearchTool !== null);

      // Create ontology exploration tools (client-side, executed in our loop)
      const tools = [
        createListDatasetsTool(neoOntologyService, ontologyId),
        createGetDatasetDetailsTool(neoOntologyService, ontologyId),
        createGetRelationshipsTool(neoOntologyService, ontologyId),
      ];

      // Add web search (server-side) if enabled — transparent to the tool loop
      const allTools: any[] = [...tools];
      if (webSearchTool) allTools.push(webSearchTool);

      // Bind all tools to LLM; only client-side tools are executed in our loop
      const llmWithTools = llm.bindTools(allTools);
      const toolsByName = Object.fromEntries(tools.map((t) => [t.name, t]));

      // Build initial messages
      const messages: BaseMessage[] = [
        new SystemMessage(systemPrompt),
        new HumanMessage(
          `Find the datasets and join paths needed for this analysis plan. When done, summarize what you found in a final message (no more tool calls).`,
        ),
      ];

      // Mini-ReAct loop
      let nodeTokens = { prompt: 0, completion: 0, total: 0 };
      let iterations = 0;
      while (iterations < MAX_NAVIGATOR_ITERATIONS) {
        iterations++;

        const { response } = await tracer.trace<any>(
          { phase: 'navigator', purpose: `tool_exploration_${iterations}`, structuredOutput: false },
          messages,
          () => llmWithTools.invoke(messages),
        );
        nodeTokens = mergeTokenUsage(nodeTokens, extractTokenUsage(response));
        messages.push(response);

        // Check if the LLM wants to call tools
        const toolCalls = response.tool_calls || [];
        if (toolCalls.length === 0) {
          // No more tool calls — navigator is done
          break;
        }

        // Execute tool calls
        for (const toolCall of toolCalls) {
          emit({
            type: 'tool_start',
            phase: 'navigator',
            name: toolCall.name,
            args: toolCall.args,
          });

          const tool = toolsByName[toolCall.name];
          let result: string;
          try {
            result = await tool.invoke(toolCall.args);
          } catch (error) {
            result = `Error: ${error instanceof Error ? error.message : String(error)}`;
          }

          emit({
            type: 'tool_end',
            phase: 'navigator',
            name: toolCall.name,
            result: result.substring(0, 500),
          });

          messages.push(
            new ToolMessage({
              content: result,
              tool_call_id: toolCall.id,
            }),
          );
        }
      }

      // Extract the final AI message as the navigator's findings
      const lastAiMessage = messages
        .filter((m) => m._getType() === 'ai')
        .pop();
      const findings = extractTextContent(lastAiMessage?.content);

      // Build JoinPlanArtifact from the navigator's exploration
      // Get all relationships for structured output
      const allRelationships = await neoOntologyService.getAllRelationships(ontologyId);

      // Collect all dataset names referenced in the plan
      const planDatasets = new Set<string>();
      for (const step of plan.steps) {
        for (const ds of step.datasets) {
          planDatasets.add(ds);
        }
      }

      // Get details for referenced datasets
      const datasetDetails = planDatasets.size > 0
        ? await neoOntologyService.getDatasetsByNames(ontologyId, [...planDatasets])
        : [];

      // Filter relationships to those involving plan datasets
      const relevantRelationships = allRelationships.filter(
        (r) => planDatasets.has(r.fromDataset) || planDatasets.has(r.toDataset),
      );

      // ─── POST-VALIDATION: Ontology gatekeeper ───

      // Check which plan datasets were NOT found in the ontology
      const missingDatasets: string[] = [];
      for (const dsName of planDatasets) {
        if (!datasetDetails.some((d) => d.name === dsName)) {
          missingDatasets.push(dsName);
        }
      }

      // Check for missing join paths between datasets that need joining
      const missingJoins: string[] = [];
      for (const step of plan.steps) {
        if (step.datasets.length > 1) {
          for (let i = 0; i < step.datasets.length - 1; i++) {
            for (let j = i + 1; j < step.datasets.length; j++) {
              const ds1 = step.datasets[i];
              const ds2 = step.datasets[j];
              const bothExist = datasetDetails.some((d) => d.name === ds1)
                             && datasetDetails.some((d) => d.name === ds2);
              if (!bothExist) continue; // Only check joins between datasets that both exist
              const hasRelation = relevantRelationships.some(
                (r) => (r.fromDataset === ds1 && r.toDataset === ds2) ||
                       (r.fromDataset === ds2 && r.toDataset === ds1),
              );
              if (!hasRelation) {
                missingJoins.push(`${ds1} <-> ${ds2}`);
              }
            }
          }
        }
      }

      // CRITICAL FAILURE: No datasets found at all for a data query
      if (datasetDetails.length === 0 && planDatasets.size > 0) {
        const allAvailable = await neoOntologyService.listDatasets(ontologyId);
        const cannotAnswer = {
          reason: `The ontology does not contain the datasets needed for this analysis: ${[...planDatasets].join(', ')}`,
          missingDatasets: [...planDatasets],
          availableDatasets: allAvailable.map((d: any) => d.name),
        };
        emit({ type: 'phase_artifact', phase: 'navigator', artifact: { cannotAnswer } });
        emit({ type: 'phase_complete', phase: 'navigator' });
        return {
          cannotAnswer,
          joinPlan: { relevantDatasets: [], joinPaths: [], notes: `Cannot answer: ${cannotAnswer.reason}` },
          currentPhase: 'navigator',
          tokensUsed: nodeTokens,
        };
      }

      const joinPlan: JoinPlanArtifact = {
        relevantDatasets: datasetDetails.map((ds) => ({
          name: ds.name,
          description: ds.description,
          source: ds.source,
          yaml: ds.yaml,
        })),
        joinPaths: relevantRelationships.map((r) => ({
          datasets: [r.fromDataset, r.toDataset],
          edges: [{
            fromDataset: r.fromDataset,
            toDataset: r.toDataset,
            fromColumns: r.fromColumns,
            toColumns: r.toColumns,
            relationshipName: r.name,
          }],
        })),
        notes: findings,
      };

      // NON-CRITICAL: Add warnings for missing joins (proceed with caveats)
      if (missingJoins.length > 0) {
        joinPlan.notes += `\nWARNING: No ontology relationship found for: ${missingJoins.join(', ')}. SQL Builder must not fabricate joins for these pairs.`;
      }

      emit({ type: 'phase_artifact', phase: 'navigator', artifact: joinPlan });
      emit({ type: 'token_update', phase: 'navigator', tokensUsed: nodeTokens });
      emit({ type: 'phase_complete', phase: 'navigator' });

      return {
        joinPlan,
        currentPhase: 'navigator',
        tokensUsed: nodeTokens,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      emit({ type: 'phase_complete', phase: 'navigator' });
      return {
        joinPlan: { relevantDatasets: [], joinPaths: [], notes: `Navigator error: ${msg}` },
        currentPhase: 'navigator',
        error: `Navigator error: ${msg}`,
        tokensUsed: { prompt: 0, completion: 0, total: 0 },
      };
    }
  };
}
