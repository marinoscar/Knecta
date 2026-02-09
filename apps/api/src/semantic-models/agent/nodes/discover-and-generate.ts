import { AgentStateType } from '../state';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { DiscoveryService } from '../../../discovery/discovery.service';
import { SemanticModelsService } from '../../semantic-models.service';

export function createDiscoverAndGenerateNode(
  llm: BaseChatModel,
  discoveryService: DiscoveryService,
  semanticModelsService: SemanticModelsService,
  connectionId: string,
  userId: string,
  databaseName: string,
  runId: string,
  emitProgress: (event: object) => void,
) {
  return async (state: AgentStateType) => {
    // TODO: Implement per-table discovery and generation
    return {};
  };
}
