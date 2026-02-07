import { AgentStateType } from '../state';
import { PrismaService } from '../../../prisma/prisma.service';
import { AIMessage } from '@langchain/core/messages';

export function createPersistNode(prisma: PrismaService) {
  return async (state: AgentStateType) => {
    if (!state.semanticModel) {
      return {
        error: 'No semantic model was generated',
        messages: [new AIMessage('Error: Failed to generate semantic model. The model JSON was empty or invalid.')],
      };
    }

    const modelDef = (state.semanticModel as any)?.semantic_model?.[0];
    const name = modelDef?.name || `Model for ${state.databaseName}`;
    const description = modelDef?.description || '';
    const datasets = modelDef?.datasets || [];
    const relationships = modelDef?.relationships || [];
    const metrics = modelDef?.metrics || [];

    // Count fields across all datasets
    let fieldCount = 0;
    for (const ds of datasets) {
      fieldCount += (ds.fields || []).length;
    }

    // Create or update the semantic model
    const semanticModel = await prisma.semanticModel.create({
      data: {
        name,
        description,
        connectionId: state.connectionId,
        databaseName: state.databaseName,
        status: 'ready',
        model: state.semanticModel as any,
        tableCount: datasets.length,
        fieldCount,
        relationshipCount: relationships.length,
        metricCount: metrics.length,
        ownerId: state.userId,
      },
    });

    // Update the run
    if (state.runId) {
      await prisma.semanticModelRun.update({
        where: { id: state.runId },
        data: {
          status: 'completed',
          semanticModelId: semanticModel.id,
          completedAt: new Date(),
        },
      });
    }

    return {
      semanticModelId: semanticModel.id,
      messages: [new AIMessage(`Semantic model "${name}" has been generated and saved successfully! It contains ${datasets.length} datasets, ${fieldCount} fields, ${relationships.length} relationships, and ${metrics.length} metrics.`)],
    };
  };
}
