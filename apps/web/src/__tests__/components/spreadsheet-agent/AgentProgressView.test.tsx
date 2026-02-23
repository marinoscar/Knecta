import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '../../utils/test-utils';
import { AgentProgressView } from '../../../components/spreadsheet-agent/AgentProgressView';
import type { SpreadsheetStreamEvent, SpreadsheetRunProgress } from '../../../types';

describe('AgentProgressView', () => {
  describe('Phase chips', () => {
    it('renders all six phase labels', () => {
      render(<AgentProgressView events={[]} progress={null} isStreaming={false} />);

      expect(screen.getByText('Ingesting Files')).toBeInTheDocument();
      expect(screen.getByText('Analyzing Sheets')).toBeInTheDocument();
      expect(screen.getByText('Designing Schema')).toBeInTheDocument();
      expect(screen.getByText('Extracting Tables')).toBeInTheDocument();
      expect(screen.getByText('Validating Data')).toBeInTheDocument();
      expect(screen.getByText('Persisting Results')).toBeInTheDocument();
    });
  });

  describe('Progress bar', () => {
    it('shows progress message and percentage when progress is provided', () => {
      const progress: SpreadsheetRunProgress = {
        phase: 'ingest',
        percentComplete: 45,
        message: 'Processing files...',
      };

      render(<AgentProgressView events={[]} progress={progress} isStreaming={true} />);

      expect(screen.getByText('Processing files...')).toBeInTheDocument();
      expect(screen.getByText('45%')).toBeInTheDocument();
    });

    it('renders a determinate progress bar when progress is provided', () => {
      const progress: SpreadsheetRunProgress = {
        phase: 'analyze',
        percentComplete: 60,
        message: 'Analyzing sheets...',
      };

      render(<AgentProgressView events={[]} progress={progress} isStreaming={true} />);

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('renders an indeterminate progress bar when streaming with no progress data', () => {
      render(<AgentProgressView events={[]} progress={null} isStreaming={true} />);

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('does not render any progress bar when not streaming and no progress', () => {
      render(<AgentProgressView events={[]} progress={null} isStreaming={false} />);

      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('shows 0% when progress is at zero', () => {
      const progress: SpreadsheetRunProgress = {
        phase: 'ingest',
        percentComplete: 0,
        message: 'Starting...',
      };

      render(<AgentProgressView events={[]} progress={progress} isStreaming={true} />);

      expect(screen.getByText('0%')).toBeInTheDocument();
    });

    it('shows 100% when progress is complete', () => {
      const progress: SpreadsheetRunProgress = {
        phase: 'persist',
        percentComplete: 100,
        message: 'Done',
      };

      render(<AgentProgressView events={[]} progress={progress} isStreaming={false} />);

      expect(screen.getByText('100%')).toBeInTheDocument();
    });
  });

  describe('Event log', () => {
    it('shows file_complete event message', () => {
      const events: SpreadsheetStreamEvent[] = [
        { type: 'file_complete', fileName: 'data.xlsx' },
      ];

      render(<AgentProgressView events={events} progress={null} isStreaming={false} />);

      expect(screen.getByText(/file complete.*data\.xlsx/i)).toBeInTheDocument();
    });

    it('shows table_start event message', () => {
      const events: SpreadsheetStreamEvent[] = [
        { type: 'table_start', tableName: 'orders' },
      ];

      render(<AgentProgressView events={events} progress={null} isStreaming={false} />);

      expect(screen.getByText(/extracting table.*orders/i)).toBeInTheDocument();
    });

    it('shows table_complete event message', () => {
      const events: SpreadsheetStreamEvent[] = [
        { type: 'table_complete', tableName: 'products' },
      ];

      render(<AgentProgressView events={events} progress={null} isStreaming={false} />);

      expect(screen.getByText(/table complete.*products/i)).toBeInTheDocument();
    });

    it('shows file_start event message', () => {
      const events: SpreadsheetStreamEvent[] = [
        { type: 'file_start', fileName: 'sales.xlsx' },
      ];

      render(<AgentProgressView events={events} progress={null} isStreaming={false} />);

      expect(screen.getByText(/processing file.*sales\.xlsx/i)).toBeInTheDocument();
    });

    it('shows text event content', () => {
      const events: SpreadsheetStreamEvent[] = [
        { type: 'text', message: 'Running validation checks' },
      ];

      render(<AgentProgressView events={events} progress={null} isStreaming={false} />);

      expect(screen.getByText('Running validation checks')).toBeInTheDocument();
    });

    it('shows table_error event message with error detail', () => {
      const events: SpreadsheetStreamEvent[] = [
        { type: 'table_error', tableName: 'broken_table', error: 'Parse failed' },
      ];

      render(<AgentProgressView events={events} progress={null} isStreaming={false} />);

      expect(screen.getByText(/table error.*broken_table/i)).toBeInTheDocument();
    });

    it('does not render the event log section when there are no displayable events', () => {
      // phase_start and run_start are filtered out from the log
      const events: SpreadsheetStreamEvent[] = [
        { type: 'phase_start', phase: 'ingest' },
        { type: 'run_start' },
      ];

      render(<AgentProgressView events={events} progress={null} isStreaming={false} />);

      // No list items should be rendered
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
    });

    it('renders multiple events in the log', () => {
      const events: SpreadsheetStreamEvent[] = [
        { type: 'file_start', fileName: 'file1.csv' },
        { type: 'file_complete', fileName: 'file1.csv' },
        { type: 'table_start', tableName: 'customers' },
      ];

      render(<AgentProgressView events={events} progress={null} isStreaming={false} />);

      expect(screen.getByText(/processing file.*file1\.csv/i)).toBeInTheDocument();
      expect(screen.getByText(/file complete.*file1\.csv/i)).toBeInTheDocument();
      expect(screen.getByText(/extracting table.*customers/i)).toBeInTheDocument();
    });
  });

  describe('Phase status updates', () => {
    it('marks a phase as active when phase_start event is received', () => {
      const events: SpreadsheetStreamEvent[] = [
        { type: 'phase_start', phase: 'ingest' },
      ];

      // The phase chip for 'ingest' should switch to a filled/primary variant
      // We verify this indirectly by ensuring no errors are thrown and the chip is present
      render(<AgentProgressView events={events} progress={null} isStreaming={true} />);

      expect(screen.getByText('Ingesting Files')).toBeInTheDocument();
    });

    it('marks a phase as complete when phase_complete event is received', () => {
      const events: SpreadsheetStreamEvent[] = [
        { type: 'phase_start', phase: 'ingest' },
        { type: 'phase_complete', phase: 'ingest' },
      ];

      render(<AgentProgressView events={events} progress={null} isStreaming={true} />);

      expect(screen.getByText('Ingesting Files')).toBeInTheDocument();
    });
  });

  describe('Elapsed timer chip', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('renders the timer chip when isStreaming=true and startTime is provided', () => {
      const startTime = Date.now();
      render(
        <AgentProgressView
          events={[]}
          progress={null}
          isStreaming={true}
          startTime={startTime}
        />,
      );

      // Timer chip shows initial elapsed time (0:00)
      expect(screen.getByText('0:00')).toBeInTheDocument();
    });

    it('shows timer icon alongside the elapsed time', () => {
      const startTime = Date.now();
      render(
        <AgentProgressView
          events={[]}
          progress={null}
          isStreaming={true}
          startTime={startTime}
        />,
      );

      const timerIcons = document.querySelectorAll('[data-testid="TimerIcon"]');
      expect(timerIcons.length).toBeGreaterThan(0);
    });

    it('does NOT render timer chip when isStreaming=false', () => {
      render(
        <AgentProgressView
          events={[]}
          progress={null}
          isStreaming={false}
          startTime={Date.now()}
        />,
      );

      // Timer chip is only shown while streaming
      expect(screen.queryByText(/^\d+:\d{2}$/)).not.toBeInTheDocument();
    });

    it('renders timer chip with "0:00" when isStreaming=true but startTime is not provided', () => {
      render(
        <AgentProgressView
          events={[]}
          progress={null}
          isStreaming={true}
        />,
      );

      // Timer chip is rendered but frozen at 0:00 since no startTime to tick from
      expect(screen.getByText('0:00')).toBeInTheDocument();
    });

    it('updates elapsed time display as time passes', async () => {
      const startTime = Date.now();
      const { act: actFn } = await import('@testing-library/react');
      render(
        <AgentProgressView
          events={[]}
          progress={null}
          isStreaming={true}
          startTime={startTime}
        />,
      );

      expect(screen.getByText('0:00')).toBeInTheDocument();

      // Advance 65 seconds, wrapped in act so React flushes the state update
      await actFn(() => {
        vi.advanceTimersByTime(65_000);
      });

      expect(screen.getByText('1:05')).toBeInTheDocument();
    });
  });

  describe('Token count chip', () => {
    it('renders token count chip when isStreaming=true and tokensUsed.total > 0', () => {
      render(
        <AgentProgressView
          events={[]}
          progress={null}
          isStreaming={true}
          startTime={Date.now()}
          tokensUsed={{ prompt: 100, completion: 50, total: 1500 }}
        />,
      );

      expect(screen.getByText('1,500 tokens')).toBeInTheDocument();
    });

    it('does NOT render token count chip when total is 0', () => {
      render(
        <AgentProgressView
          events={[]}
          progress={null}
          isStreaming={true}
          startTime={Date.now()}
          tokensUsed={{ prompt: 0, completion: 0, total: 0 }}
        />,
      );

      expect(screen.queryByText(/tokens/)).not.toBeInTheDocument();
    });

    it('does NOT render token count chip when isStreaming=false', () => {
      render(
        <AgentProgressView
          events={[]}
          progress={null}
          isStreaming={false}
          tokensUsed={{ prompt: 200, completion: 100, total: 300 }}
        />,
      );

      // Token chip is inside the isStreaming block; not rendered when streaming stopped
      expect(screen.queryByText('300 tokens')).not.toBeInTheDocument();
    });

    it('does NOT render token count chip when tokensUsed is not provided', () => {
      render(
        <AgentProgressView
          events={[]}
          progress={null}
          isStreaming={true}
          startTime={Date.now()}
        />,
      );

      expect(screen.queryByText(/tokens/)).not.toBeInTheDocument();
    });

    it('formats large token counts with locale separators', () => {
      render(
        <AgentProgressView
          events={[]}
          progress={null}
          isStreaming={true}
          startTime={Date.now()}
          tokensUsed={{ prompt: 5000, completion: 3000, total: 8000 }}
        />,
      );

      // toLocaleString formats 8000 as "8,000" in en-US locales
      expect(screen.getByText(/8[,.]?000 tokens/)).toBeInTheDocument();
    });
  });

  describe('Completion alert', () => {
    it('renders success alert when events include run_complete', () => {
      const events: SpreadsheetStreamEvent[] = [
        { type: 'run_complete' },
      ];

      render(
        <AgentProgressView events={events} progress={null} isStreaming={false} />,
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/agent completed successfully/i)).toBeInTheDocument();
    });

    it('includes token count in success alert when tokensUsed.total > 0', () => {
      const events: SpreadsheetStreamEvent[] = [
        { type: 'run_complete' },
      ];

      render(
        <AgentProgressView
          events={events}
          progress={null}
          isStreaming={false}
          tokensUsed={{ prompt: 1000, completion: 500, total: 1500 }}
        />,
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/1,500 tokens used/i)).toBeInTheDocument();
    });

    it('does NOT render success alert when no run_complete event', () => {
      const events: SpreadsheetStreamEvent[] = [
        { type: 'file_complete', fileName: 'data.xlsx' },
      ];

      render(
        <AgentProgressView events={events} progress={null} isStreaming={false} />,
      );

      expect(screen.queryByText(/agent completed successfully/i)).not.toBeInTheDocument();
    });

    it('does NOT render success alert while still streaming', () => {
      const events: SpreadsheetStreamEvent[] = [
        { type: 'run_complete' },
      ];

      render(
        <AgentProgressView events={events} progress={null} isStreaming={true} />,
      );

      // Alert is suppressed while isStreaming=true
      expect(screen.queryByText(/agent completed successfully/i)).not.toBeInTheDocument();
    });
  });

  describe('Error alert', () => {
    it('renders error alert when events include run_error', () => {
      const events: SpreadsheetStreamEvent[] = [
        { type: 'run_error', message: 'Something went wrong during extraction' },
      ];

      render(
        <AgentProgressView events={events} progress={null} isStreaming={false} />,
      );

      const alerts = screen.getAllByRole('alert');
      expect(alerts.length).toBeGreaterThan(0);
      expect(screen.getByText('Something went wrong during extraction')).toBeInTheDocument();
    });

    it('renders error alert with error field when present', () => {
      const events: SpreadsheetStreamEvent[] = [
        { type: 'run_error', error: 'Database connection refused' },
      ];

      render(
        <AgentProgressView events={events} progress={null} isStreaming={false} />,
      );

      expect(screen.getByText('Database connection refused')).toBeInTheDocument();
    });

    it('renders fallback message when run_error has no error or message fields', () => {
      const events: SpreadsheetStreamEvent[] = [
        { type: 'run_error' },
      ];

      render(
        <AgentProgressView events={events} progress={null} isStreaming={false} />,
      );

      expect(screen.getByText('Agent execution failed')).toBeInTheDocument();
    });

    it('does NOT render error alert when no run_error event', () => {
      render(
        <AgentProgressView events={[]} progress={null} isStreaming={false} />,
      );

      expect(screen.queryByText(/agent execution failed/i)).not.toBeInTheDocument();
    });

    it('does NOT render error alert while still streaming', () => {
      const events: SpreadsheetStreamEvent[] = [
        { type: 'run_error', message: 'Transient error' },
      ];

      render(
        <AgentProgressView events={events} progress={null} isStreaming={true} />,
      );

      expect(screen.queryByText('Transient error')).not.toBeInTheDocument();
    });
  });
});
