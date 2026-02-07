import { interrupt } from '@langchain/langgraph';
import { AgentStateType } from '../state';

export function createAwaitApprovalNode() {
  return async (state: AgentStateType) => {
    // Interrupt execution and present the plan to the user
    const userResponse = interrupt({
      type: 'plan_approval',
      plan: state.plan,
      message: 'Please review the discovery plan above. Reply with "approved" to proceed or suggest modifications.',
    });

    // When resumed, check user's response
    const approved = typeof userResponse === 'string'
      ? userResponse.toLowerCase().includes('approv')
      : true;

    return {
      planApproved: approved,
    };
  };
}
