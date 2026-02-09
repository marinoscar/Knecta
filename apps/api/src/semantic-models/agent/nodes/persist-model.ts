import { AgentStateType } from '../state';
import { PrismaService } from '../../../prisma/prisma.service';

export function createPersistNode(prisma: PrismaService) {
  return async (state: AgentStateType) => {
    if (!state.semanticModel) {
      return {
        error: 'No semantic model was generated',
      };
    }

    const modelDef = (state.semanticModel as any)?.semantic_model?.[0];
    const name = state.modelName || modelDef?.name || `Model for ${state.databaseName}`;
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
    };
  };
}
