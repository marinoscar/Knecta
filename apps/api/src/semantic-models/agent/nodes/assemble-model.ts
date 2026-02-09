import { AgentStateType } from '../state';
import { SemanticModelsService } from '../../semantic-models.service';
import { OSISemanticModel } from '../osi/types';
import { Logger } from '@nestjs/common';

const logger = new Logger('AssembleModel');

export function createAssembleModelNode(
  semanticModelsService: SemanticModelsService,
  runId: string,
  emitProgress: (event: object) => void,
) {
  return async (state: AgentStateType) => {
    const modelName = state.modelName || `Model for ${state.databaseName}`;

    // Flatten per-table metrics into a single array
    const allMetrics = [
      ...state.tableMetrics.flat(),
      ...state.modelMetrics,
    ];

    // Build the full OSI semantic model
    const semanticModel: OSISemanticModel = {
      semantic_model: [{
        name: modelName,
        description: `Semantic model for ${state.databaseName}`,
        ai_context: state.modelAiContext || { synonyms: [], instructions: `Semantic model for the ${state.databaseName} database` },
        datasets: state.datasets,
        relationships: state.relationships,
        metrics: allMetrics,
      }],
    };

    // Update progress
    await semanticModelsService.updateRunProgress(runId, {
      currentStep: 'assemble_model',
      currentStepLabel: 'Assembling Model',
      completedTables: state.datasets.length,
      totalTables: state.selectedTables.length,
      failedTables: state.failedTables,
      percentComplete: 90,
      tokensUsed: state.tokensUsed,
      steps: [],
    }).catch(() => {});

    logger.log(`Assembled model "${modelName}" with ${state.datasets.length} datasets, ${state.relationships.length} relationships, ${allMetrics.length} metrics`);

    return {
      semanticModel: semanticModel as unknown as Record<string, unknown>,
    };
  };
}
