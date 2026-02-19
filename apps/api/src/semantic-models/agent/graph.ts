import { StateGraph, END, START } from '@langchain/langgraph';
import { AgentState } from './state';
import { createDiscoverAndGenerateNode } from './nodes/discover-and-generate';
import { createDiscoverRelationshipsNode } from './nodes/discover-relationships';
import { createGenerateRelationshipsNode } from './nodes/generate-relationships';
import { createAssembleModelNode } from './nodes/assemble-model';
import { createValidateModelNode } from './nodes/validate-model';
import { createPersistNode } from './nodes/persist-model';
import { DiscoveryService } from '../../discovery/discovery.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SemanticModelsService } from '../semantic-models.service';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';

export function buildAgentGraph(
  llm: BaseChatModel,
  discoveryService: DiscoveryService,
  prisma: PrismaService,
  semanticModelsService: SemanticModelsService,
  connectionId: string,
  userId: string,
  databaseName: string,
  selectedSchemas: string[],
  selectedTables: string[],
  runId: string,
  emitProgress: (event: object) => void,
) {
  const workflow = new StateGraph(AgentState)
    .addNode('discover_and_generate', createDiscoverAndGenerateNode(
      llm, discoveryService, semanticModelsService, connectionId, userId, databaseName, runId, emitProgress,
    ))
    .addNode('discover_relationships', createDiscoverRelationshipsNode(
      discoveryService, connectionId, databaseName, semanticModelsService, runId, emitProgress,
    ))
    .addNode('generate_relationships', createGenerateRelationshipsNode(
      llm, semanticModelsService, runId, emitProgress,
    ))
    .addNode('assemble_model', createAssembleModelNode(
      semanticModelsService, runId, emitProgress,
    ))
    .addNode('validate_model', createValidateModelNode(
      llm, semanticModelsService, runId, emitProgress,
    ))
    .addNode('persist_model', createPersistNode(prisma))
    .addEdge(START, 'discover_and_generate')
    .addEdge('discover_and_generate', 'discover_relationships')
    .addEdge('discover_relationships', 'generate_relationships')
    .addEdge('generate_relationships', 'assemble_model')
    .addEdge('assemble_model', 'validate_model')
    .addEdge('validate_model', 'persist_model')
    .addEdge('persist_model', END);

  return workflow.compile();
}
