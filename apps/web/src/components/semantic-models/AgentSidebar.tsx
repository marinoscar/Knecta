import { CopilotKit } from '@copilotkit/react-core';
import { CopilotSidebar } from '@copilotkit/react-ui';
import '@copilotkit/react-ui/styles.css';

interface AgentSidebarProps {
  open: boolean;
  runId: string;
}

export function AgentSidebar({ open, runId }: AgentSidebarProps) {
  if (!open) return null;

  return (
    <CopilotKit runtimeUrl="/api/copilotkit">
      <CopilotSidebar
        defaultOpen={true}
        labels={{
          title: 'Semantic Model Agent',
          initial: 'I will analyze your database and create a semantic model. Let me start by creating a discovery plan...',
        }}
        clickOutsideToClose={false}
      />
    </CopilotKit>
  );
}
