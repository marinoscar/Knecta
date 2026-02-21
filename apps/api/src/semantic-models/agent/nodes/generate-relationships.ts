import { z } from 'zod';
import { AgentStateType } from '../state';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage } from '@langchain/core/messages';
import { SemanticModelsService } from '../../semantic-models.service';
import { OSIRelationship, OSIMetric, OSIAIContext } from '../osi/types';
import { buildGenerateRelationshipsPrompt } from '../prompts/generate-relationships-prompt';
import { extractJson, extractTokenUsage } from '../utils';
import { extractTextContent } from '../../../data-agent/agent/utils/content-extractor';
import { Logger } from '@nestjs/common';

const logger = new Logger('GenerateRelationships');

const RelationshipOutputSchema = z.object({
  relationships: z.array(z.object({
    name: z.string(),
    from: z.string(),
    to: z.string(),
    from_columns: z.array(z.string()),
    to_columns: z.array(z.string()),
    ai_context: z.record(z.unknown()).optional(),
  })),
  model_metrics: z.array(z.object({
    name: z.string(),
    expression: z.record(z.unknown()),
    description: z.string().optional(),
    ai_context: z.record(z.unknown()).optional(),
  })).optional().default([]),
  model_ai_context: z.object({
    instructions: z.string().optional(),
    synonyms: z.array(z.string()).optional(),
  }).nullable().optional().default(null),
});

export function createGenerateRelationshipsNode(
  llm: BaseChatModel,
  semanticModelsService: SemanticModelsService,
  runId: string,
  emitProgress: (event: object) => void,
) {
  async function invokeAndParse(
    llmInstance: BaseChatModel,
    prompt: string,
  ): Promise<{ parsed: z.infer<typeof RelationshipOutputSchema> | null; rawResponse: any }> {
    try {
      const structured = llmInstance.withStructuredOutput(RelationshipOutputSchema, {
        name: 'generate_relationships',
        includeRaw: true,
      });
      const result = await structured.invoke([new HumanMessage(prompt)]);
      return { parsed: result.parsed, rawResponse: result.raw };
    } catch (err) {
      logger.warn(`withStructuredOutput failed, falling back to plain invoke: ${(err as Error).message}`);
      const response = await llmInstance.invoke([new HumanMessage(prompt)]);
      const content = extractTextContent(response.content);
      const extracted = extractJson(content);
      const parsed = extracted
        ? {
            relationships: extracted.relationships || [],
            model_metrics: extracted.model_metrics || [],
            model_ai_context: extracted.model_ai_context || null,
          }
        : null;
      return { parsed, rawResponse: response };
    }
  }

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

    const { parsed, rawResponse } = await invokeAndParse(llm, prompt);

    const callTokens = extractTokenUsage(rawResponse);
    let tokensUsed = {
      prompt: state.tokensUsed.prompt + callTokens.prompt,
      completion: state.tokensUsed.completion + callTokens.completion,
      total: state.tokensUsed.total + callTokens.total,
    };

    emitProgress({ type: 'token_update', tokensUsed });

    let relationships: OSIRelationship[] = [];
    let modelMetrics: OSIMetric[] = [];
    let modelAiContext: OSIAIContext | null = null;

    if (parsed) {
      relationships = (parsed.relationships || []) as OSIRelationship[];
      modelMetrics = ((parsed as any).model_metrics || []) as OSIMetric[];
      modelAiContext = ((parsed as any).model_ai_context || null) as OSIAIContext | null;
    } else {
      logger.warn('Failed to parse relationship generation response');
    }

    // Retry if candidates existed but zero relationships were produced
    const hadCandidates = state.relationshipCandidates.length > 0;
    const gotZeroRelationships = relationships.length === 0;

    if (hadCandidates && gotZeroRelationships) {
      logger.warn(
        `Got 0 relationships from ${state.relationshipCandidates.length} candidates. Retrying with temperature=0.2...`,
      );

      emitProgress({
        type: 'text',
        content: `Relationship generation produced no results from ${state.relationshipCandidates.length} candidates. Retrying...`,
      });

      // Retry with slightly elevated temperature to get different output
      const retryLlm = llm.bind({ temperature: 0.2 } as any);
      const retryResult = await invokeAndParse(retryLlm, prompt);

      const retryTokens = extractTokenUsage(retryResult.rawResponse);
      tokensUsed.prompt += retryTokens.prompt;
      tokensUsed.completion += retryTokens.completion;
      tokensUsed.total += retryTokens.total;

      if (retryResult.parsed) {
        relationships = (retryResult.parsed.relationships || []) as OSIRelationship[];
        modelMetrics = ((retryResult.parsed as any).model_metrics || []) as OSIMetric[];
        modelAiContext = ((retryResult.parsed as any).model_ai_context || null) as OSIAIContext | null;
        logger.log(`Retry succeeded: ${relationships.length} relationships generated`);
      } else {
        logger.error(
          `Retry also failed to generate relationships from ${state.relationshipCandidates.length} candidates`,
        );
      }

      emitProgress({ type: 'token_update', tokensUsed });
    }

    if (hadCandidates && relationships.length === 0) {
      emitProgress({
        type: 'text',
        content: `Warning: Could not generate relationships despite ${state.relationshipCandidates.length} candidates being available. The model will be saved without relationships.`,
      });
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
