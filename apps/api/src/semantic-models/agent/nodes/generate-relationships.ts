import { AgentStateType } from '../state';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { SemanticModelsService } from '../../semantic-models.service';

export function createGenerateRelationshipsNode(
  llm: BaseChatModel,
  semanticModelsService: SemanticModelsService,
  runId: string,
  emitProgress: (event: object) => void,
) {
  return async (state: AgentStateType) => {
    // TODO: Implement relationship generation
    return {};
  };
}
