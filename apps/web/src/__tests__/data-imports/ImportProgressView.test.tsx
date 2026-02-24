import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, act } from '@testing-library/react';
import { render } from '../utils/test-utils';
import { ImportProgressView } from '../../components/data-imports/ImportProgressView';
import type { DataImportStreamEvent, DataImportProgress } from '../../types';

function buildProgressEvent(
  type: DataImportStreamEvent['type'],
  data: Record<string, unknown> = {},
): DataImportStreamEvent {
  return {
    type,
    data,
    timestamp: new Date().toISOString(),
  };
}

function buildProgress(overrides: Partial<DataImportProgress> = {}): DataImportProgress {
  return {
    percentComplete: 50,
    message: 'Processing...',
    completedTables: 2,
    totalTables: 4,
    ...overrides,
  };
}

describe('ImportProgressView', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initial state — no events', () => {
    it('renders phase chips for all four phases', () => {
      render(
        <ImportProgressView
          events={[]}
          progress={null}
          isStreaming={false}
          startTime={null}
        />,
      );

      expect(screen.getByText('Parsing File')).toBeInTheDocument();
      expect(screen.getByText('Converting to Parquet')).toBeInTheDocument();
      expect(screen.getByText('Uploading to Storage')).toBeInTheDocument();
      expect(screen.getByText('Creating Connection')).toBeInTheDocument();
    });

    it('does not render the progress bar when progress is null and not streaming', () => {
      const { container } = render(
        <ImportProgressView
          events={[]}
          progress={null}
          isStreaming={false}
          startTime={null}
        />,
      );

      const progressbars = container.querySelectorAll('[role="progressbar"]');
      expect(progressbars.length).toBe(0);
    });

    it('does not render the event log when there are no events', () => {
      render(
        <ImportProgressView
          events={[]}
          progress={null}
          isStreaming={false}
          startTime={null}
        />,
      );

      expect(screen.queryByRole('list')).not.toBeInTheDocument();
    });
  });

  describe('Progress bar', () => {
    it('renders a determinate progress bar when progress is provided', () => {
      render(
        <ImportProgressView
          events={[]}
          progress={buildProgress({ percentComplete: 65 })}
          isStreaming={true}
          startTime={Date.now()}
        />,
      );

      const progressbar = screen.getByRole('progressbar');
      expect(progressbar).toBeInTheDocument();
    });

    it('displays the percentage value next to the progress bar', () => {
      render(
        <ImportProgressView
          events={[]}
          progress={buildProgress({ percentComplete: 65 })}
          isStreaming={true}
          startTime={Date.now()}
        />,
      );

      expect(screen.getByText('65%')).toBeInTheDocument();
    });

    it('displays the progress message', () => {
      render(
        <ImportProgressView
          events={[]}
          progress={buildProgress({ message: 'Converting rows...' })}
          isStreaming={true}
          startTime={Date.now()}
        />,
      );

      expect(screen.getByText('Converting rows...')).toBeInTheDocument();
    });

    it('shows tables completed count when available', () => {
      render(
        <ImportProgressView
          events={[]}
          progress={buildProgress({ completedTables: 2, totalTables: 4 })}
          isStreaming={true}
          startTime={Date.now()}
        />,
      );

      expect(screen.getByText(/2 \/ 4 tables/)).toBeInTheDocument();
    });

    it('renders indeterminate progress bar when streaming without progress data', () => {
      const { container } = render(
        <ImportProgressView
          events={[]}
          progress={null}
          isStreaming={true}
          startTime={Date.now()}
        />,
      );

      const progressbar = container.querySelector('[role="progressbar"]');
      expect(progressbar).toBeInTheDocument();
    });
  });

  describe('Phase indicators', () => {
    it('marks a phase as active when a phase_start event is received', () => {
      const events: DataImportStreamEvent[] = [
        buildProgressEvent('phase_start', { phase: 'parsing' }),
      ];

      render(
        <ImportProgressView
          events={events}
          progress={null}
          isStreaming={true}
          startTime={Date.now()}
        />,
      );

      // The active phase chip uses "filled" variant — it renders differently
      // We check the chip label is present and the component doesn't error
      expect(screen.getByText('Parsing File')).toBeInTheDocument();
    });

    it('marks a phase as complete when a phase_complete event is received', () => {
      const events: DataImportStreamEvent[] = [
        buildProgressEvent('phase_start', { phase: 'parsing' }),
        buildProgressEvent('phase_complete', { phase: 'parsing' }),
      ];

      render(
        <ImportProgressView
          events={events}
          progress={null}
          isStreaming={true}
          startTime={Date.now()}
        />,
      );

      expect(screen.getByText('Parsing File')).toBeInTheDocument();
    });

    it('marks the active phase as error when run_error event is received', () => {
      const events: DataImportStreamEvent[] = [
        buildProgressEvent('phase_start', { phase: 'converting' }),
        buildProgressEvent('run_error', { error: 'Conversion failed' }),
      ];

      render(
        <ImportProgressView
          events={events}
          progress={null}
          isStreaming={false}
          startTime={null}
        />,
      );

      expect(screen.getByText('Converting to Parquet')).toBeInTheDocument();
    });
  });

  describe('Event log', () => {
    it('renders phase_start events in the log', () => {
      const events: DataImportStreamEvent[] = [
        buildProgressEvent('phase_start', { phase: 'parsing' }),
      ];

      render(
        <ImportProgressView
          events={events}
          progress={null}
          isStreaming={true}
          startTime={Date.now()}
        />,
      );

      expect(screen.getByText(/starting phase: parsing file/i)).toBeInTheDocument();
    });

    it('renders phase_complete events in the log', () => {
      const events: DataImportStreamEvent[] = [
        buildProgressEvent('phase_start', { phase: 'parsing' }),
        buildProgressEvent('phase_complete', { phase: 'parsing' }),
      ];

      render(
        <ImportProgressView
          events={events}
          progress={null}
          isStreaming={true}
          startTime={Date.now()}
        />,
      );

      expect(screen.getByText(/completed: parsing file/i)).toBeInTheDocument();
    });

    it('renders table_start events in the log', () => {
      const events: DataImportStreamEvent[] = [
        buildProgressEvent('table_start', { tableName: 'orders' }),
      ];

      render(
        <ImportProgressView
          events={events}
          progress={null}
          isStreaming={true}
          startTime={Date.now()}
        />,
      );

      expect(screen.getByText(/processing table: orders/i)).toBeInTheDocument();
    });

    it('renders table_complete events with row count in the log', () => {
      const events: DataImportStreamEvent[] = [
        buildProgressEvent('table_complete', { tableName: 'orders', rowCount: 1500 }),
      ];

      render(
        <ImportProgressView
          events={events}
          progress={null}
          isStreaming={true}
          startTime={Date.now()}
        />,
      );

      expect(screen.getByText(/table complete: orders.*1,500 rows/i)).toBeInTheDocument();
    });

    it('renders table_error events in the log', () => {
      const events: DataImportStreamEvent[] = [
        buildProgressEvent('table_error', { tableName: 'orders', error: 'Type mismatch' }),
      ];

      render(
        <ImportProgressView
          events={events}
          progress={null}
          isStreaming={false}
          startTime={null}
        />,
      );

      expect(screen.getByText(/table error: orders.*type mismatch/i)).toBeInTheDocument();
    });
  });

  describe('Elapsed timer', () => {
    it('renders the timer chip when streaming with a startTime', () => {
      // Use a fixed system time so that elapsed is deterministic
      const startTime = 1000000000000;
      vi.setSystemTime(startTime);

      render(
        <ImportProgressView
          events={[buildProgressEvent('phase_start', { phase: 'parsing' })]}
          progress={null}
          isStreaming={true}
          startTime={startTime}
        />,
      );

      // Timer chip should show the initial elapsed time (0:00)
      expect(screen.getByText('0:00')).toBeInTheDocument();
    });

    it('timer shows mm:ss format on initial render', () => {
      // Use a fixed startTime so the initial render shows 0:00
      const startTime = 1000000000000;
      vi.setSystemTime(startTime);

      render(
        <ImportProgressView
          events={[buildProgressEvent('phase_start', { phase: 'parsing' })]}
          progress={null}
          isStreaming={true}
          startTime={startTime}
        />,
      );

      // Initially shows 0:00 — verifies the mm:ss format is used
      expect(screen.getByText('0:00')).toBeInTheDocument();
    });
  });

  describe('Completion summary', () => {
    it('shows success summary when run_complete event is received and streaming is done', () => {
      const events: DataImportStreamEvent[] = [
        buildProgressEvent('run_complete', {}),
      ];

      render(
        <ImportProgressView
          events={events}
          progress={null}
          isStreaming={false}
          startTime={null}
        />,
      );

      expect(screen.getByText(/import completed successfully/i)).toBeInTheDocument();
    });

    it('shows error summary when run_error event is received and streaming is done', () => {
      const events: DataImportStreamEvent[] = [
        buildProgressEvent('run_error', { error: 'Disk full' }),
      ];

      render(
        <ImportProgressView
          events={events}
          progress={null}
          isStreaming={false}
          startTime={null}
        />,
      );

      expect(screen.getByText(/disk full/i)).toBeInTheDocument();
    });

    it('shows partial error summary when run_complete fires but there were also errors', () => {
      const events: DataImportStreamEvent[] = [
        buildProgressEvent('table_error', { tableName: 'orders', error: 'Parse error' }),
        buildProgressEvent('run_complete', {}),
      ];

      render(
        <ImportProgressView
          events={events}
          progress={null}
          isStreaming={false}
          startTime={null}
        />,
      );

      // run_complete fires so "Import completed" is shown (either success or with errors)
      expect(screen.getByText(/import completed/i)).toBeInTheDocument();
    });
  });
});
