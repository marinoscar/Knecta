import { AgentStateType } from '../state';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { DynamicStructuredTool } from '@langchain/core/tools';
// @ts-ignore - ToolNode exists at runtime but TypeScript moduleResolution:node can't resolve /prebuilt path
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { AIMessage } from '@langchain/core/messages';

const MAX_TOOL_ITERATIONS = 20;

export function createAgentNode(llm: BaseChatModel, tools: DynamicStructuredTool[]) {
  const llmWithTools = llm.bindTools!(tools);

  return async (state: AgentStateType) => {
    // On the last allowed iteration, invoke WITHOUT tools to produce a text
    // summary. Prevents unanswered tool_calls that cause OpenAI 400 errors.
    const isLastIteration = state.toolIterations >= MAX_TOOL_ITERATIONS - 1;
    const response = isLastIteration
      ? await llm.invoke(state.messages)
      : await llmWithTools.invoke(state.messages);
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
  if (state.toolIterations >= MAX_TOOL_ITERATIONS) {
    return 'generate_model';
  }
  const lastMessage = state.messages[state.messages.length - 1];
  if (lastMessage instanceof AIMessage && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
    return 'tools';
  }
  return 'generate_model';
}
