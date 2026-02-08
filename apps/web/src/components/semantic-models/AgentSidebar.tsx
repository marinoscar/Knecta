import { useMemo } from 'react';
import { CopilotKit } from '@copilotkit/react-core';
import { CopilotSidebar } from '@copilotkit/react-ui';
import '@copilotkit/react-ui/styles.css';
import { api } from '../../services/api';

interface AgentSidebarProps {
  open: boolean;
  runId: string;
}

export function AgentSidebar({ open, runId }: AgentSidebarProps) {
  const headers = useMemo(() => {
    const h: Record<string, string> = { 'X-Run-Id': runId };
    const token = api.getAccessToken();
    if (token) {
      h['Authorization'] = `Bearer ${token}`;
    }
    return h;
  }, [runId]);

  if (!open) return null;

  return (
    <CopilotKit runtimeUrl="/api/copilotkit" headers={headers}>
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
