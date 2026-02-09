import { AgentStateType } from '../state';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { DynamicStructuredTool } from '@langchain/core/tools';
// @ts-ignore - ToolNode exists at runtime but TypeScript moduleResolution:node can't resolve /prebuilt path
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { AIMessage } from '@langchain/core/messages';

export function createAgentNode(llm: BaseChatModel, tools: DynamicStructuredTool[]) {
  const llmWithTools = llm.bindTools!(tools);

  return async (state: AgentStateType) => {
    const response = await llmWithTools.invoke(state.messages);
    return {
      messages: [response],
      toolIterations: state.toolIterations + 1,
    };
  };
}

export function createToolNode(tools: DynamicStructuredTool[]) {
  return new ToolNode(tools);
}

// Edge function: decide if agent should continue calling tools or move to model generation
export function shouldContinueTools(state: AgentStateType): 'tools' | 'generate_model' {
  if (state.toolIterations >= 5) {
    return 'generate_model';
  }
  const lastMessage = state.messages[state.messages.length - 1];
  if (lastMessage instanceof AIMessage && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
    return 'tools';
  }
  return 'generate_model';
}
