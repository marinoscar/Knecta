import { AgentStateType } from '../state';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage } from '@langchain/core/messages';
import { SemanticModelsService } from '../../semantic-models.service';
import { OSIRelationship, OSIMetric, OSIAIContext } from '../osi/types';
import { buildGenerateRelationshipsPrompt } from '../prompts/generate-relationships-prompt';
import { extractJson, extractTokenUsage } from '../utils';
import { Logger } from '@nestjs/common';

const logger = new Logger('GenerateRelationships');

export function createGenerateRelationshipsNode(
  llm: BaseChatModel,
  semanticModelsService: SemanticModelsService,
  runId: string,
  emitProgress: (event: object) => void,
) {
  return async (state: AgentStateType) => {
    if (state.datasets.length === 0) {
      logger.warn('No datasets available for relationship generation');
      return {
        relationships: [],
        modelMetrics: [],
        modelAiContext: null,
      };
    }

    // Build dataset summaries for the prompt
    const datasetSummaries = state.datasets.map(ds => ({
      name: ds.name,
      source: ds.source,
      primaryKey: ds.primary_key || [],
      columns: (ds.fields || []).map(f => f.name),
    }));

    const prompt = buildGenerateRelationshipsPrompt({
      modelName: state.modelName || `Model for ${state.databaseName}`,
      databaseName: state.databaseName,
      datasetSummaries,
      relationshipCandidates: state.relationshipCandidates,
      instructions: state.instructions || undefined,
      osiSpecText: state.osiSpecText || undefined,
    });

    const response = await llm.invoke([new HumanMessage(prompt)]);

    // Track tokens
    const callTokens = extractTokenUsage(response);
    const tokensUsed = {
      prompt: state.tokensUsed.prompt + callTokens.prompt,
      completion: state.tokensUsed.completion + callTokens.completion,
      total: state.tokensUsed.total + callTokens.total,
    };

    emitProgress({ type: 'token_update', tokensUsed });

    // Parse response
    const content = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

    const parsed = extractJson(content);

    let relationships: OSIRelationship[] = [];
    let modelMetrics: OSIMetric[] = [];
    let modelAiContext: OSIAIContext | null = null;

    if (parsed) {
      relationships = (parsed.relationships || []) as OSIRelationship[];
      modelMetrics = (parsed.model_metrics || []) as OSIMetric[];
      modelAiContext = (parsed.model_ai_context || null) as OSIAIContext | null;
    } else {
      logger.warn('Failed to parse relationship generation response');
    }

    // Update progress
    await semanticModelsService.updateRunProgress(runId, {
      currentStep: 'generate_relationships',
      currentStepLabel: 'Generating Relationships',
      completedTables: state.datasets.length,
      totalTables: state.selectedTables.length,
      failedTables: state.failedTables,
      percentComplete: 88,
      tokensUsed,
      elapsedMs: Date.now() - new Date(state.runId ? Date.now() : Date.now()).getTime(),
      partialModel: {
        datasets: state.datasets,
        foreignKeys: state.foreignKeys,
        tableMetrics: state.tableMetrics,
        relationships,
        modelMetrics,
      },
      tableStatus: [],
      steps: [],
    }).catch(() => {});

    logger.log(`Generated ${relationships.length} relationships and ${modelMetrics.length} model metrics from ${state.relationshipCandidates.length} candidates (${callTokens.total} tokens)`);

    return {
      relationships,
      modelMetrics,
      modelAiContext,
      tokensUsed,
    };
  };
}
