import { HumanMessage, SystemMessage, AIMessage, ToolMessage, BaseMessage } from '@langchain/core/messages';
import { DataAgentStateType } from '../state';
import { JoinPlanArtifact } from '../types';
import { EmitFn } from '../graph';
import { buildNavigatorPrompt } from '../prompts/navigator.prompt';
import { createListDatasetsTool } from '../tools/list-datasets.tool';
import { createGetDatasetDetailsTool } from '../tools/get-dataset-details.tool';
import { createGetRelationshipsTool } from '../tools/get-relationships.tool';
import { NeoOntologyService } from '../../../ontologies/neo-ontology.service';

const MAX_NAVIGATOR_ITERATIONS = 8;

export function createNavigatorNode(
  llm: any,
  neoOntologyService: NeoOntologyService,
  ontologyId: string,
  emit: EmitFn,
) {
  return async (state: DataAgentStateType): Promise<Partial<DataAgentStateType>> => {
    emit({ type: 'phase_start', phase: 'navigator', description: 'Exploring ontology to find datasets and join paths' });

    try {
      const plan = state.plan!;
      const systemPrompt = buildNavigatorPrompt(plan);

      // Create ontology exploration tools
      const tools = [
        createListDatasetsTool(neoOntologyService, ontologyId),
        createGetDatasetDetailsTool(neoOntologyService, ontologyId),
        createGetRelationshipsTool(neoOntologyService, ontologyId),
      ];

      // Bind tools to LLM
      const llmWithTools = llm.bindTools(tools);
      const toolsByName = Object.fromEntries(tools.map((t) => [t.name, t]));

      // Build initial messages
      const messages: BaseMessage[] = [
        new SystemMessage(systemPrompt),
        new HumanMessage(
          `Find the datasets and join paths needed for this analysis plan. When done, summarize what you found in a final message (no more tool calls).`,
        ),
      ];

      // Mini-ReAct loop
      let iterations = 0;
      while (iterations < MAX_NAVIGATOR_ITERATIONS) {
        iterations++;

        const response = await llmWithTools.invoke(messages);
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
      const findings = typeof lastAiMessage?.content === 'string'
        ? lastAiMessage.content
        : '';

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

      const joinPlan: JoinPlanArtifact = {
        relevantDatasets: datasetDetails.map((ds) => ({
          name: ds.name,
          description: ds.description,
          source: ds.source,
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

      emit({ type: 'phase_artifact', phase: 'navigator', artifact: joinPlan });
      emit({ type: 'phase_complete', phase: 'navigator' });

      return {
        joinPlan,
        currentPhase: 'navigator',
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      emit({ type: 'phase_complete', phase: 'navigator' });
      return {
        joinPlan: { relevantDatasets: [], joinPaths: [], notes: `Navigator error: ${msg}` },
        currentPhase: 'navigator',
        error: `Navigator error: ${msg}`,
      };
    }
  };
}
