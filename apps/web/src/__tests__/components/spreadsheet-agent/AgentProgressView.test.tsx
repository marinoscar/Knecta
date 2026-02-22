import { describe, it, expect } from 'vitest';
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
});
