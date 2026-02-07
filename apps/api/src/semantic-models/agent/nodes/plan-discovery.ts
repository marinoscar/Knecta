import { AgentStateType } from '../state';
import { PLAN_PROMPT } from '../prompts/plan-prompt';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';

export function createPlanNode(llm: BaseChatModel) {
  return async (state: AgentStateType) => {
    const response = await llm.invoke([
      ...state.messages,
      { role: 'user', content: PLAN_PROMPT },
    ]);

    return {
      messages: [response],
      plan: typeof response.content === 'string' ? response.content : JSON.stringify(response.content),
    };
  };
}
