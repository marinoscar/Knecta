import { useMemo, useEffect, useRef } from 'react';
import { CopilotKit, useCopilotChat } from '@copilotkit/react-core';
import { CopilotSidebar } from '@copilotkit/react-ui';
import '@copilotkit/react-ui/styles.css';
import { api } from '../../services/api';

interface AgentSidebarProps {
  open: boolean;
  runId: string;
}

function AutoStartAgent() {
  const { sendMessage } = useCopilotChat();
  const hasSent = useRef(false);

  useEffect(() => {
    if (!hasSent.current) {
      hasSent.current = true;
      sendMessage({
        id: `auto-start-${Date.now()}`,
        role: 'user',
        content: 'Start analyzing the database and generate a semantic model',
      } as any);
    }
  }, [sendMessage]);

  return null;
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
        }}
        clickOutsideToClose={false}
      >
        <AutoStartAgent />
      </CopilotSidebar>
    </CopilotKit>
  );
}
