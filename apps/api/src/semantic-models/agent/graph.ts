import { StateGraph, END, START } from '@langchain/langgraph';
import { AgentState } from './state';
import { createPlanNode } from './nodes/plan-discovery';
import { createAwaitApprovalNode } from './nodes/await-approval';
import { createAgentNode, createToolNode, shouldContinueTools } from './nodes/agent-loop';
import { createGenerateModelNode } from './nodes/generate-model';
import { createValidateModelNode } from './nodes/validate-model';
import { createPersistNode } from './nodes/persist-model';
import { createAgentTools } from './tools';
import { buildSystemPrompt } from './prompts/system-prompt';
import { DiscoveryService } from '../../discovery/discovery.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { SystemMessage } from '@langchain/core/messages';

export function buildAgentGraph(
  llm: BaseChatModel,
  discoveryService: DiscoveryService,
  prisma: PrismaService,
  connectionId: string,
  userId: string,
  databaseName: string,
  selectedSchemas: string[],
  selectedTables: string[],
  options?: { skipApproval?: boolean },
) {
  const tools = createAgentTools(discoveryService, connectionId, userId);

  const approvalNode = options?.skipApproval
    ? async () => ({ planApproved: true })
    : createAwaitApprovalNode();

  const workflow = new StateGraph(AgentState)
    .addNode('plan_discovery', createPlanNode(llm))
    .addNode('await_approval', approvalNode)
    .addNode('agent', createAgentNode(llm, tools))
    .addNode('tools', createToolNode(tools))
    .addNode('generate_model', createGenerateModelNode(llm))
    .addNode('validate_model', createValidateModelNode(llm))
    .addNode('persist_model', createPersistNode(prisma))
    .addEdge(START, 'plan_discovery')
    .addEdge('plan_discovery', 'await_approval')
    .addConditionalEdges('await_approval', (state) => {
      return state.planApproved ? 'agent' : END;
    })
    .addConditionalEdges('agent', shouldContinueTools)
    .addEdge('tools', 'agent')
    .addEdge('generate_model', 'validate_model')
    .addConditionalEdges('validate_model', (state) => {
      if (!state.semanticModel && state.validationAttempts < 5) {
        return 'generate_model';
      }
      return 'persist_model';
    })
    .addEdge('persist_model', END);

  return workflow.compile();
}
