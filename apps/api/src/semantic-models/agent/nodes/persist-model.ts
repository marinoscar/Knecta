import { AgentStateType } from '../state';
import { PrismaService } from '../../../prisma/prisma.service';
import { computeModelStats } from '../utils/compute-model-stats';

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
    const stats = computeModelStats(state.semanticModel as Record<string, unknown>);

    // Create or update the semantic model
    const semanticModel = await prisma.semanticModel.create({
      data: {
        name,
        description,
        connectionId: state.connectionId,
        databaseName: state.databaseName,
        status: 'ready',
        model: state.semanticModel as any,
        tableCount: stats.tableCount,
        fieldCount: stats.fieldCount,
        relationshipCount: stats.relationshipCount,
        metricCount: stats.metricCount,
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
