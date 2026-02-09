import { AgentStateType } from '../state';
import { SemanticModelsService } from '../../semantic-models.service';

export function createAssembleModelNode(
  semanticModelsService: SemanticModelsService,
  runId: string,
  emitProgress: (event: object) => void,
) {
  return async (state: AgentStateType) => {
    // TODO: Implement model assembly
    return {};
  };
}
