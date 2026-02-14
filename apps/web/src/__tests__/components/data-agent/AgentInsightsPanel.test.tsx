import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '../../utils/test-utils';
import { AgentInsightsPanel } from '../../../components/data-agent/AgentInsightsPanel';
import type { DataChatMessage, DataAgentStreamEvent } from '../../../types';

// Helper function to create test messages
function makeAssistantMessage(overrides: Partial<DataChatMessage> = {}): DataChatMessage {
  return {
    id: 'msg-1',
    chatId: 'chat-1',
    role: 'assistant',
    content: 'Test response',
    status: 'complete',
    createdAt: new Date().toISOString(),
    metadata: {
      durationMs: 5000,
      tokensUsed: { prompt: 1000, completion: 500, total: 1500 },
      plan: {
        complexity: 'analytical',
        intent: 'Test intent',
        steps: [
          { id: 1, description: 'Get data', strategy: 'sql' },
          { id: 2, description: 'Analyze data', strategy: 'python' },
        ],
      },
      stepResults: [
        {
          stepId: 1,
          description: 'Get data',
          strategy: 'sql',
          sqlResult: { rowCount: 100, columns: ['col1'], data: '...' },
        },
        {
          stepId: 2,
          description: 'Analyze data',
          strategy: 'python',
          pythonResult: { stdout: 'done', charts: [] },
        },
      ],
      toolCalls: [
        {
          phase: 'navigator',
          name: 'list_datasets',
          args: {},
          result: '["orders"]',
        },
        {
          phase: 'executor',
          stepId: 1,
          name: 'query_database',
          args: { sql: 'SELECT 1' },
          result: '100 rows',
        },
      ],
      verificationReport: {
        passed: true,
        checks: [
          { name: 'Grain check', passed: true, message: 'OK' },
        ],
      },
      dataLineage: {
        datasets: ['orders', 'products'],
        joins: [],
        grain: 'order-line',
        rowCount: 100,
      },
    },
    ...overrides,
  };
}

describe('AgentInsightsPanel', () => {
  describe('Empty State', () => {
    it('shows "Send a message to see insights" when no assistant messages', () => {
      const messages: DataChatMessage[] = [
        {
          id: 'msg-1',
          chatId: 'chat-1',
          role: 'user',
          content: 'Hello',
          status: 'complete',
          createdAt: new Date().toISOString(),
        },
      ];

      render(
        <AgentInsightsPanel
          messages={messages}
          streamEvents={[]}
          isStreaming={false}
          onClose={() => {}}
        />
      );

      expect(screen.getByText('Send a message to see insights')).toBeInTheDocument();
    });

    it('shows empty state when messages array is empty', () => {
      render(
        <AgentInsightsPanel
          messages={[]}
          streamEvents={[]}
          isStreaming={false}
          onClose={() => {}}
        />
      );

      expect(screen.getByText('Send a message to see insights')).toBeInTheDocument();
    });
  });

  describe('History Mode - Completed Messages', () => {
    it('shows "Insights" header', () => {
      const message = makeAssistantMessage();

      render(
        <AgentInsightsPanel
          messages={[message]}
          streamEvents={[]}
          isStreaming={false}
          onClose={() => {}}
        />
      );

      expect(screen.getByText('Insights')).toBeInTheDocument();
    });

    it('shows duration from metadata.durationMs', () => {
      const message = makeAssistantMessage({
        metadata: {
          durationMs: 92000,
          tokensUsed: { prompt: 1000, completion: 500, total: 1500 },
        },
      });

      render(
        <AgentInsightsPanel
          messages={[message]}
          streamEvents={[]}
          isStreaming={false}
          onClose={() => {}}
        />
      );

      expect(screen.getByText('Duration')).toBeInTheDocument();
      expect(screen.getByText('1:32')).toBeInTheDocument();
    });

    it('shows token counts from metadata.tokensUsed', () => {
      const message = makeAssistantMessage({
        metadata: {
          tokensUsed: { prompt: 123456, completion: 78901, total: 202357 },
        },
      });

      render(
        <AgentInsightsPanel
          messages={[message]}
          streamEvents={[]}
          isStreaming={false}
          onClose={() => {}}
        />
      );

      expect(screen.getByText('Input')).toBeInTheDocument();
      expect(screen.getByText('123,456')).toBeInTheDocument();

      expect(screen.getByText('Output')).toBeInTheDocument();
      expect(screen.getByText('78,901')).toBeInTheDocument();

      expect(screen.getByText('Total')).toBeInTheDocument();
      expect(screen.getByText('202,357')).toBeInTheDocument();
    });

    it('shows plan steps from metadata.plan', () => {
      const message = makeAssistantMessage();

      render(
        <AgentInsightsPanel
          messages={[message]}
          streamEvents={[]}
          isStreaming={false}
          onClose={() => {}}
        />
      );

      expect(screen.getByText('Execution Plan')).toBeInTheDocument();
      expect(screen.getByText('Get data')).toBeInTheDocument();
      expect(screen.getByText('Analyze data')).toBeInTheDocument();
      expect(screen.getByText('SQL')).toBeInTheDocument();
      expect(screen.getByText('PYTHON')).toBeInTheDocument();
    });

    it('shows verification passed badge when verificationReport.passed', () => {
      const message = makeAssistantMessage({
        metadata: {
          verificationReport: {
            passed: true,
            checks: [
              { name: 'Grain check', passed: true, message: 'Grain is correct' },
              { name: 'Join check', passed: true, message: 'Joins are valid' },
            ],
          },
        },
      });

      render(
        <AgentInsightsPanel
          messages={[message]}
          streamEvents={[]}
          isStreaming={false}
          onClose={() => {}}
        />
      );

      expect(screen.getByText('Verification')).toBeInTheDocument();
      expect(screen.getByText('Passed')).toBeInTheDocument();
      expect(screen.getByText('Grain check')).toBeInTheDocument();
      expect(screen.getByText('Grain is correct')).toBeInTheDocument();
    });

    it('shows verification failed badge when verificationReport not passed', () => {
      const message = makeAssistantMessage({
        metadata: {
          verificationReport: {
            passed: false,
            checks: [
              { name: 'Grain check', passed: false, message: 'Grain mismatch detected' },
            ],
          },
        },
      });

      render(
        <AgentInsightsPanel
          messages={[message]}
          streamEvents={[]}
          isStreaming={false}
          onClose={() => {}}
        />
      );

      expect(screen.getByText('Verification')).toBeInTheDocument();
      expect(screen.getByText('Failed')).toBeInTheDocument();
      expect(screen.getByText('Grain check')).toBeInTheDocument();
      expect(screen.getByText('Grain mismatch detected')).toBeInTheDocument();
    });

    it('shows data lineage datasets', () => {
      const message = makeAssistantMessage({
        metadata: {
          dataLineage: {
            datasets: ['orders', 'products', 'customers'],
            joins: [],
            grain: 'order-line',
            rowCount: 250,
          },
        },
      });

      render(
        <AgentInsightsPanel
          messages={[message]}
          streamEvents={[]}
          isStreaming={false}
          onClose={() => {}}
        />
      );

      expect(screen.getByText('Data Lineage')).toBeInTheDocument();
      expect(screen.getByText('orders')).toBeInTheDocument();
      expect(screen.getByText('products')).toBeInTheDocument();
      expect(screen.getByText('customers')).toBeInTheDocument();
      expect(screen.getByText('order-line')).toBeInTheDocument();
      expect(screen.getByText('250')).toBeInTheDocument();
    });

    it('shows "--" for duration when no metadata.durationMs', () => {
      const message = makeAssistantMessage({
        metadata: {
          tokensUsed: { prompt: 1000, completion: 500, total: 1500 },
        },
      });

      render(
        <AgentInsightsPanel
          messages={[message]}
          streamEvents={[]}
          isStreaming={false}
          onClose={() => {}}
        />
      );

      expect(screen.getByText('Duration')).toBeInTheDocument();
      expect(screen.getByText('--')).toBeInTheDocument();
    });

    it('shows "--" for token counts when no metadata.tokensUsed', () => {
      const message = makeAssistantMessage({
        metadata: {
          durationMs: 5000,
        },
      });

      render(
        <AgentInsightsPanel
          messages={[message]}
          streamEvents={[]}
          isStreaming={false}
          onClose={() => {}}
        />
      );

      // All token fields should show "--"
      const dashDashes = screen.getAllByText('--');
      expect(dashDashes.length).toBeGreaterThanOrEqual(3);
    });

    it('shows step result summaries from stepResults', () => {
      const message = makeAssistantMessage({
        metadata: {
          plan: {
            complexity: 'simple',
            intent: 'Get count',
            steps: [
              { id: 1, description: 'Query database', strategy: 'sql' },
            ],
          },
          stepResults: [
            {
              stepId: 1,
              description: 'Query database',
              strategy: 'sql',
              sqlResult: { rowCount: 42, columns: ['count'], data: '...' },
            },
          ],
        },
      });

      render(
        <AgentInsightsPanel
          messages={[message]}
          streamEvents={[]}
          isStreaming={false}
          onClose={() => {}}
        />
      );

      expect(screen.getByText('42 rows')).toBeInTheDocument();
    });

    it('does not show verification section when verificationReport is missing', () => {
      const message = makeAssistantMessage({
        metadata: {
          durationMs: 5000,
          tokensUsed: { prompt: 1000, completion: 500, total: 1500 },
        },
      });

      render(
        <AgentInsightsPanel
          messages={[message]}
          streamEvents={[]}
          isStreaming={false}
          onClose={() => {}}
        />
      );

      expect(screen.queryByText('Verification')).not.toBeInTheDocument();
    });

    it('does not show data lineage section when dataLineage is missing', () => {
      const message = makeAssistantMessage({
        metadata: {
          durationMs: 5000,
          tokensUsed: { prompt: 1000, completion: 500, total: 1500 },
        },
      });

      render(
        <AgentInsightsPanel
          messages={[message]}
          streamEvents={[]}
          isStreaming={false}
          onClose={() => {}}
        />
      );

      expect(screen.queryByText('Data Lineage')).not.toBeInTheDocument();
    });
  });

  describe('Live Mode - Streaming', () => {
    it('shows "Waiting for plan..." before planner artifact', () => {
      const message = makeAssistantMessage({
        status: 'generating',
        metadata: {
          startedAt: Date.now(),
        },
      });

      const events: DataAgentStreamEvent[] = [
        { type: 'phase_start', phase: 'planner' },
      ];

      render(
        <AgentInsightsPanel
          messages={[message]}
          streamEvents={events}
          isStreaming={true}
          onClose={() => {}}
        />
      );

      expect(screen.getByText('Execution Plan')).toBeInTheDocument();
      expect(screen.getByText('Waiting for plan...')).toBeInTheDocument();
    });

    it('shows plan steps after planner artifact event', () => {
      const message = makeAssistantMessage({
        status: 'generating',
        metadata: {
          startedAt: Date.now(),
        },
      });

      const events: DataAgentStreamEvent[] = [
        { type: 'phase_start', phase: 'planner' },
        {
          type: 'phase_artifact',
          phase: 'planner',
          artifact: {
            complexity: 'simple',
            intent: 'Get user count',
            steps: [
              { id: 1, description: 'Query users table', strategy: 'sql' },
            ],
          },
        },
      ];

      render(
        <AgentInsightsPanel
          messages={[message]}
          streamEvents={events}
          isStreaming={true}
          onClose={() => {}}
        />
      );

      expect(screen.getByText('Query users table')).toBeInTheDocument();
      expect(screen.getByText('SQL')).toBeInTheDocument();
    });

    it('shows phase details with active status', () => {
      const message = makeAssistantMessage({
        status: 'generating',
        metadata: {
          startedAt: Date.now(),
        },
      });

      const events: DataAgentStreamEvent[] = [
        { type: 'phase_start', phase: 'planner' },
        { type: 'phase_complete', phase: 'planner' },
        { type: 'phase_start', phase: 'navigator' },
      ];

      render(
        <AgentInsightsPanel
          messages={[message]}
          streamEvents={events}
          isStreaming={true}
          onClose={() => {}}
        />
      );

      expect(screen.getByText('Phase Details')).toBeInTheDocument();
      expect(screen.getByText('Planner')).toBeInTheDocument();
      expect(screen.getByText('Navigator')).toBeInTheDocument();

      // Should show status chips
      const completeChips = screen.getAllByText('complete');
      const activeChips = screen.getAllByText('active');
      expect(completeChips.length).toBeGreaterThan(0);
      expect(activeChips.length).toBeGreaterThan(0);
    });

    it('shows step as running when step_start received', () => {
      const message = makeAssistantMessage({
        status: 'generating',
        metadata: {
          startedAt: Date.now(),
        },
      });

      const planArtifact = {
        complexity: 'simple',
        intent: 'Test',
        steps: [
          { id: 1, description: 'Execute query', strategy: 'sql' },
        ],
      };

      const events: DataAgentStreamEvent[] = [
        { type: 'phase_artifact', phase: 'planner', artifact: planArtifact },
        { type: 'step_start', stepId: 1, description: 'Execute query' },
      ];

      const { container } = render(
        <AgentInsightsPanel
          messages={[message]}
          streamEvents={events}
          isStreaming={true}
          onClose={() => {}}
        />
      );

      expect(screen.getByText('Execute query')).toBeInTheDocument();

      // Should have Loop icon indicating running status
      const loopIcon = container.querySelector('svg[data-testid="LoopIcon"]');
      expect(loopIcon).toBeInTheDocument();
    });

    it('shows step as complete when step_complete received', () => {
      const message = makeAssistantMessage({
        status: 'generating',
        metadata: {
          startedAt: Date.now(),
        },
      });

      const planArtifact = {
        complexity: 'simple',
        intent: 'Test',
        steps: [
          { id: 1, description: 'Execute query', strategy: 'sql' },
        ],
      };

      const events: DataAgentStreamEvent[] = [
        { type: 'phase_artifact', phase: 'planner', artifact: planArtifact },
        { type: 'step_start', stepId: 1 },
        {
          type: 'step_complete',
          stepId: 1,
          artifact: {
            sqlResult: { rowCount: 150, columns: ['id'], data: '...' },
          },
        },
      ];

      const { container } = render(
        <AgentInsightsPanel
          messages={[message]}
          streamEvents={events}
          isStreaming={true}
          onClose={() => {}}
        />
      );

      expect(screen.getByText('Execute query')).toBeInTheDocument();
      expect(screen.getByText('150 rows')).toBeInTheDocument();

      // Should have CheckCircle icon indicating complete status
      const checkIcon = container.querySelector('svg[data-testid="CheckCircleIcon"]');
      expect(checkIcon).toBeInTheDocument();
    });

    it('does not show verification or data lineage in live mode', () => {
      const message = makeAssistantMessage({
        status: 'generating',
        metadata: {
          startedAt: Date.now(),
        },
      });

      const events: DataAgentStreamEvent[] = [
        { type: 'phase_start', phase: 'planner' },
      ];

      render(
        <AgentInsightsPanel
          messages={[message]}
          streamEvents={events}
          isStreaming={true}
          onClose={() => {}}
        />
      );

      expect(screen.queryByText('Verification')).not.toBeInTheDocument();
      expect(screen.queryByText('Data Lineage')).not.toBeInTheDocument();
    });
  });

  describe('Multiple Assistant Messages', () => {
    it('uses the last assistant message for insights', () => {
      const firstMessage = makeAssistantMessage({
        id: 'msg-1',
        metadata: {
          durationMs: 1000,
          tokensUsed: { prompt: 100, completion: 50, total: 150 },
        },
      });

      const secondMessage = makeAssistantMessage({
        id: 'msg-2',
        metadata: {
          durationMs: 5000,
          tokensUsed: { prompt: 2000, completion: 1000, total: 3000 },
        },
      });

      const messages: DataChatMessage[] = [
        {
          id: 'user-1',
          chatId: 'chat-1',
          role: 'user',
          content: 'First question',
          status: 'complete',
          createdAt: new Date().toISOString(),
        },
        firstMessage,
        {
          id: 'user-2',
          chatId: 'chat-1',
          role: 'user',
          content: 'Second question',
          status: 'complete',
          createdAt: new Date().toISOString(),
        },
        secondMessage,
      ];

      render(
        <AgentInsightsPanel
          messages={messages}
          streamEvents={[]}
          isStreaming={false}
          onClose={() => {}}
        />
      );

      // Should show duration from second message
      expect(screen.getByText('0:05')).toBeInTheDocument();

      // Should show token counts from second message
      expect(screen.getByText('2,000')).toBeInTheDocument();
      expect(screen.getByText('3,000')).toBeInTheDocument();
    });
  });
});
