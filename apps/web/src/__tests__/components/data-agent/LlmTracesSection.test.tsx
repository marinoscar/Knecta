import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../../utils/test-utils';
import { LlmTracesSection } from '../../../components/data-agent/LlmTracesSection';
import type { DataAgentStreamEvent } from '../../../types';
import * as api from '../../../services/api';

// Mock the API
vi.mock('../../../services/api', () => ({
  getMessageTraces: vi.fn(),
}));

describe('LlmTracesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Empty State', () => {
    it('renders "No LLM calls recorded" when no traces exist in live mode', () => {
      const events: DataAgentStreamEvent[] = [];

      render(
        <LlmTracesSection
          streamEvents={events}
          isLiveMode={true}
          chatId="chat-123"
          messageId="msg-123"
        />
      );

      expect(screen.getByText('LLM Traces')).toBeInTheDocument();
      expect(screen.getByText('No LLM calls recorded')).toBeInTheDocument();
    });

    it('renders "No LLM calls recorded" when no traces exist in history mode', async () => {
      vi.mocked(api.getMessageTraces).mockResolvedValue([]);

      render(
        <LlmTracesSection
          streamEvents={[]}
          isLiveMode={false}
          chatId="chat-123"
          messageId="msg-123"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('No LLM calls recorded')).toBeInTheDocument();
      });
    });
  });

  describe('Live Mode', () => {
    it('renders live traces from stream events', () => {
      const events: DataAgentStreamEvent[] = [
        {
          type: 'llm_call_start',
          callIndex: 0,
          phase: 'planner',
          stepId: 1,
          purpose: 'Generate execution plan',
          provider: 'openai',
          model: 'gpt-4',
          structuredOutput: true,
          promptSummary: { messageCount: 2, totalChars: 500 },
        },
        {
          type: 'llm_call_end',
          callIndex: 0,
          phase: 'planner',
          stepId: 1,
          purpose: 'Generate execution plan',
          durationMs: 1500,
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          responsePreview: 'Plan created successfully',
          toolCallCount: 0,
        },
      ];

      render(
        <LlmTracesSection
          streamEvents={events}
          isLiveMode={true}
          chatId="chat-123"
          messageId="msg-123"
        />
      );

      // Should show header with count
      expect(screen.getByText('LLM Traces')).toBeInTheDocument();
      expect(screen.getByText('1 calls')).toBeInTheDocument();

      // Should show phase chip
      expect(screen.getByText('Planner')).toBeInTheDocument();

      // Should show purpose
      expect(screen.getByText('Generate execution plan')).toBeInTheDocument();

      // Should show provider/model
      expect(screen.getByText(/openai\/gpt-4/i)).toBeInTheDocument();

      // Should show tokens
      expect(screen.getByText(/100 in/i)).toBeInTheDocument();
      expect(screen.getByText(/50 out/i)).toBeInTheDocument();
    });

    it('shows running spinner for in-progress traces', () => {
      const events: DataAgentStreamEvent[] = [
        {
          type: 'llm_call_start',
          callIndex: 0,
          phase: 'navigator',
          purpose: 'Find datasets',
          provider: 'anthropic',
          model: 'claude-3-5-sonnet-20241022',
          structuredOutput: false,
        },
      ];

      const { container } = render(
        <LlmTracesSection
          streamEvents={events}
          isLiveMode={true}
          chatId="chat-123"
          messageId="msg-123"
        />
      );

      // Should show running text
      expect(screen.getByText('running...')).toBeInTheDocument();

      // Should have spinning icon
      const loopIcon = container.querySelector('svg[data-testid="LoopIcon"]');
      expect(loopIcon).toBeInTheDocument();
    });

    it('shows completed traces with duration and tokens', () => {
      const events: DataAgentStreamEvent[] = [
        {
          type: 'llm_call_start',
          callIndex: 0,
          phase: 'sql_builder',
          purpose: 'Build SQL query',
          provider: 'openai',
          model: 'gpt-4',
          structuredOutput: true,
        },
        {
          type: 'llm_call_end',
          callIndex: 0,
          phase: 'sql_builder',
          purpose: 'Build SQL query',
          durationMs: 2500,
          promptTokens: 250,
          completionTokens: 125,
          totalTokens: 375,
          responsePreview: 'SELECT * FROM users',
          toolCallCount: 0,
        },
      ];

      render(
        <LlmTracesSection
          streamEvents={events}
          isLiveMode={true}
          chatId="chat-123"
          messageId="msg-123"
        />
      );

      // Should show duration (2500ms = 0:02)
      expect(screen.getByText('0:02')).toBeInTheDocument();

      // Should show tokens
      expect(screen.getByText(/250 in/i)).toBeInTheDocument();
      expect(screen.getByText(/125 out/i)).toBeInTheDocument();
    });

    it('renders multiple traces in order', () => {
      const events: DataAgentStreamEvent[] = [
        {
          type: 'llm_call_start',
          callIndex: 0,
          phase: 'planner',
          purpose: 'Plan step 1',
          provider: 'openai',
          model: 'gpt-4',
          structuredOutput: false,
        },
        {
          type: 'llm_call_end',
          callIndex: 0,
          phase: 'planner',
          purpose: 'Plan step 1',
          durationMs: 1000,
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          responsePreview: 'Step 1 done',
          toolCallCount: 0,
        },
        {
          type: 'llm_call_start',
          callIndex: 1,
          phase: 'navigator',
          purpose: 'Navigate step 2',
          provider: 'openai',
          model: 'gpt-4',
          structuredOutput: false,
        },
        {
          type: 'llm_call_end',
          callIndex: 1,
          phase: 'navigator',
          purpose: 'Navigate step 2',
          durationMs: 800,
          promptTokens: 80,
          completionTokens: 40,
          totalTokens: 120,
          responsePreview: 'Step 2 done',
          toolCallCount: 0,
        },
      ];

      render(
        <LlmTracesSection
          streamEvents={events}
          isLiveMode={true}
          chatId="chat-123"
          messageId="msg-123"
        />
      );

      expect(screen.getByText('2 calls')).toBeInTheDocument();
      expect(screen.getByText('Plan step 1')).toBeInTheDocument();
      expect(screen.getByText('Navigate step 2')).toBeInTheDocument();
    });
  });

  describe('History Mode', () => {
    it('fetches and renders traces in history mode', async () => {
      const user = userEvent.setup();
      const mockTraces = [
        {
          id: 'trace-1',
          messageId: 'msg-123',
          phase: 'planner',
          callIndex: 0,
          stepId: 1,
          purpose: 'Generate plan',
          provider: 'openai',
          model: 'gpt-4',
          temperature: 0.7,
          structuredOutput: true,
          promptMessages: [
            { role: 'system', content: 'System prompt' },
            { role: 'human', content: 'User question' },
          ],
          responseContent: 'Plan response',
          toolCalls: null,
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          startedAt: new Date(),
          completedAt: new Date(),
          durationMs: 1500,
          error: null,
          createdAt: new Date(),
        },
      ];

      vi.mocked(api.getMessageTraces).mockResolvedValue(mockTraces);

      render(
        <LlmTracesSection
          streamEvents={[]}
          isLiveMode={false}
          chatId="chat-123"
          messageId="msg-123"
        />
      );

      // Should show loading initially
      expect(screen.getByText('Loading traces...')).toBeInTheDocument();

      // Wait for traces to load
      await waitFor(() => {
        expect(screen.getByText('1 calls')).toBeInTheDocument();
      });

      expect(screen.getByText('Generate plan')).toBeInTheDocument();
      expect(screen.getByText(/openai\/gpt-4/i)).toBeInTheDocument();
      expect(screen.getByText('0:01')).toBeInTheDocument();
      expect(screen.getByText(/100 in/i)).toBeInTheDocument();
      expect(screen.getByText(/50 out/i)).toBeInTheDocument();

      // Expand the accordion to see the "View Full" button
      const accordionButton = screen.getByRole('button', { name: /Planner/i });
      await user.click(accordionButton);

      // Should have "View Full" button inside the expanded accordion
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /view full/i })).toBeInTheDocument();
      });

      // Should have called API
      expect(api.getMessageTraces).toHaveBeenCalledWith('chat-123', 'msg-123');
    });

    it('handles API error gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(api.getMessageTraces).mockRejectedValue(new Error('Network error'));

      render(
        <LlmTracesSection
          streamEvents={[]}
          isLiveMode={false}
          chatId="chat-123"
          messageId="msg-123"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('No LLM calls recorded')).toBeInTheDocument();
      });

      consoleErrorSpy.mockRestore();
    });

    it('does not fetch traces when chatId or messageId is missing', async () => {
      render(
        <LlmTracesSection
          streamEvents={[]}
          isLiveMode={false}
          chatId={undefined}
          messageId={undefined}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('No LLM calls recorded')).toBeInTheDocument();
      });

      expect(api.getMessageTraces).not.toHaveBeenCalled();
    });
  });
});
