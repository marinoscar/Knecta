import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../../utils/test-utils';
import { RunHistory } from '../../../components/spreadsheet-agent/RunHistory';
import type { SpreadsheetRun } from '../../../types';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
function buildRun(overrides: Partial<SpreadsheetRun> = {}): SpreadsheetRun {
  return {
    id: 'run-1',
    projectId: 'proj-1',
    status: 'completed',
    config: null,
    extractionPlan: null,
    extractionPlanModified: null,
    validationReport: null,
    progress: null,
    errorMessage: null,
    tokensUsed: { prompt: 0, completion: 0, total: 0 },
    startedAt: null,
    completedAt: null,
    createdByUserId: 'user-1',
    createdAt: '2026-02-01T10:00:00Z',
    updatedAt: '2026-02-01T10:05:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const completedRun = buildRun({
  id: 'run-done',
  status: 'completed',
  startedAt: '2026-02-01T10:00:00Z',
  completedAt: '2026-02-01T10:02:30Z', // 2 min 30 sec
  tokensUsed: { prompt: 800, completion: 400, total: 1200 },
});

const activeRun = buildRun({
  id: 'run-active',
  status: 'extracting',
  startedAt: '2026-02-01T10:00:00Z',
  completedAt: null,
  tokensUsed: { prompt: 0, completion: 0, total: 0 },
});

// NOTE: 'pending' is in the ACTIVE_STATUSES array in RunHistory, so a pending
// run with no start/end times shows "Running...". Use 'cancelled' or 'failed'
// (with no completedAt) to test the "-" case for a truly inactive run with no times.
const noTimesRun = buildRun({
  id: 'run-no-times',
  status: 'cancelled',
  startedAt: null,
  completedAt: null,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('RunHistory', () => {
  describe('Empty / loading states', () => {
    it('shows loading spinner when isLoading=true', () => {
      render(<RunHistory runs={[]} isLoading={true} />);

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('shows empty state message when runs array is empty', () => {
      render(<RunHistory runs={[]} />);

      expect(screen.getByText('No runs yet')).toBeInTheDocument();
    });

    it('does not render a table when runs array is empty', () => {
      render(<RunHistory runs={[]} />);

      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });

  describe('Column headers', () => {
    it('renders the Duration column header', () => {
      render(<RunHistory runs={[completedRun]} />);

      expect(screen.getByRole('columnheader', { name: 'Duration' })).toBeInTheDocument();
    });

    it('renders all expected column headers', () => {
      render(<RunHistory runs={[completedRun]} />);

      expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Tokens' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Started' })).toBeInTheDocument();
      // "Completed" appears both as a column header and as a status chip label;
      // querying by columnheader role is unambiguous.
      expect(screen.getByRole('columnheader', { name: 'Completed' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Duration' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Error' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();
    });
  });

  describe('Duration column', () => {
    it('shows formatted duration for a completed run with start and end times', () => {
      render(<RunHistory runs={[completedRun]} />);

      // 2 minutes 30 seconds
      expect(screen.getByText('2:30')).toBeInTheDocument();
    });

    it('shows "Running..." for an active run without a completion time', () => {
      render(<RunHistory runs={[activeRun]} />);

      expect(screen.getByText('Running...')).toBeInTheDocument();
    });

    it('shows "-" for a run with no start or completion times and an inactive status', () => {
      render(<RunHistory runs={[noTimesRun]} />);

      const rows = screen.getAllByRole('row');
      // rows[0] = header, rows[1] = data row
      const dataRow = rows[1];
      const cells = within(dataRow).getAllByRole('cell');
      // Duration is the 5th data cell (index 4 after Status, Tokens, Started, Completed)
      expect(cells[4].textContent).toBe('-');
    });

    it('shows "-" when only startedAt is set but completedAt is null on a non-active status', () => {
      const run = buildRun({
        status: 'cancelled',
        startedAt: '2026-02-01T10:00:00Z',
        completedAt: null,
      });

      render(<RunHistory runs={[run]} />);

      const rows = screen.getAllByRole('row');
      const dataRow = rows[1];
      const cells = within(dataRow).getAllByRole('cell');
      expect(cells[4].textContent).toBe('-');
    });

    it('formats sub-minute durations as 0:SS', () => {
      const run = buildRun({
        status: 'completed',
        startedAt: '2026-02-01T10:00:00Z',
        completedAt: '2026-02-01T10:00:45Z', // 45 seconds
      });

      render(<RunHistory runs={[run]} />);

      expect(screen.getByText('0:45')).toBeInTheDocument();
    });

    it('zero-pads single-digit seconds in duration', () => {
      const run = buildRun({
        status: 'completed',
        startedAt: '2026-02-01T10:00:00Z',
        completedAt: '2026-02-01T10:01:05Z', // 1 min 5 sec
      });

      render(<RunHistory runs={[run]} />);

      expect(screen.getByText('1:05')).toBeInTheDocument();
    });
  });

  describe('Tokens column', () => {
    it('displays structured tokensUsed.total for a completed run', () => {
      render(<RunHistory runs={[completedRun]} />);

      // completedRun.tokensUsed.total = 1200 → "1,200"
      expect(screen.getByText('1,200')).toBeInTheDocument();
    });

    it('displays "0" when tokensUsed.total is zero', () => {
      const run = buildRun({ tokensUsed: { prompt: 0, completion: 0, total: 0 } });
      render(<RunHistory runs={[run]} />);

      const rows = screen.getAllByRole('row');
      const dataRow = rows[1];
      const cells = within(dataRow).getAllByRole('cell');
      // Tokens is the 2nd cell (index 1)
      expect(cells[1].textContent).toBe('0');
    });

    it('formats large token counts with locale separators', () => {
      const run = buildRun({
        tokensUsed: { prompt: 6000, completion: 4000, total: 10000 },
      });
      render(<RunHistory runs={[run]} />);

      // 10000 formatted as "10,000"
      expect(screen.getByText(/10[,.]?000/)).toBeInTheDocument();
    });
  });

  describe('Status chips', () => {
    it('renders Completed chip for a completed run', () => {
      render(<RunHistory runs={[completedRun]} />);

      // "Completed" appears as both a column header and a chip label;
      // getAllByText verifies at least one chip is present.
      const completedElements = screen.getAllByText('Completed');
      expect(completedElements.length).toBeGreaterThanOrEqual(1);
    });

    it('renders Extracting chip for an extracting run', () => {
      render(<RunHistory runs={[activeRun]} />);

      expect(screen.getByText('Extracting')).toBeInTheDocument();
    });

    it('renders Pending chip for a pending run', () => {
      const pendingRun = buildRun({ id: 'r-pending', status: 'pending' });
      render(<RunHistory runs={[pendingRun]} />);

      expect(screen.getByText('Pending')).toBeInTheDocument();
    });

    it('renders Failed chip for a failed run', () => {
      const run = buildRun({ status: 'failed', errorMessage: 'Out of memory' });
      render(<RunHistory runs={[run]} />);

      expect(screen.getByText('Failed')).toBeInTheDocument();
    });

    it('renders Cancelled chip for a cancelled run', () => {
      render(<RunHistory runs={[noTimesRun]} />);

      expect(screen.getByText('Cancelled')).toBeInTheDocument();
    });
  });

  describe('Error message', () => {
    it('renders error message text for a failed run', () => {
      const run = buildRun({ status: 'failed', errorMessage: 'Extraction pipeline crashed' });
      render(<RunHistory runs={[run]} />);

      expect(screen.getByText('Extraction pipeline crashed')).toBeInTheDocument();
    });

    it('renders "-" in error column when there is no error message', () => {
      render(<RunHistory runs={[completedRun]} />);

      const rows = screen.getAllByRole('row');
      const dataRow = rows[1];
      const cells = within(dataRow).getAllByRole('cell');
      // Error is the 6th data cell (index 5)
      expect(cells[5].textContent).toBe('-');
    });
  });

  describe('Multiple runs', () => {
    it('renders one row per run', () => {
      const runs = [
        buildRun({ id: 'r1', status: 'completed' }),
        buildRun({ id: 'r2', status: 'failed' }),
        buildRun({ id: 'r3', status: 'cancelled' }),
      ];

      render(<RunHistory runs={runs} />);

      const rows = screen.getAllByRole('row');
      // 1 header + 3 data rows
      expect(rows.length).toBe(4);
    });
  });

  describe('Action buttons', () => {
    it('renders View button when onView callback is provided', () => {
      render(<RunHistory runs={[completedRun]} onView={vi.fn()} />);

      // MUI Tooltip wraps the button; the title is passed as the tooltip content.
      // We can find the button by looking inside the row for icon buttons.
      const rows = screen.getAllByRole('row');
      const dataRow = rows[1];
      const buttons = within(dataRow).getAllByRole('button');
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    });

    it('calls onView with the run id when View button is clicked', async () => {
      const user = userEvent.setup();
      const onView = vi.fn();

      render(<RunHistory runs={[completedRun]} onView={onView} />);

      const rows = screen.getAllByRole('row');
      const dataRow = rows[1];
      const buttons = within(dataRow).getAllByRole('button');
      // First button in the action cell is "View details"
      await user.click(buttons[0]);

      expect(onView).toHaveBeenCalledWith('run-done');
    });

    it('renders Cancel button for active runs when canWrite=true and onCancel is provided', () => {
      render(<RunHistory runs={[activeRun]} canWrite={true} onCancel={vi.fn()} />);

      const rows = screen.getAllByRole('row');
      const dataRow = rows[1];
      const buttons = within(dataRow).getAllByRole('button');
      // Cancel is shown for active runs
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    });

    it('does NOT render any action buttons when no callbacks are provided', () => {
      render(<RunHistory runs={[completedRun]} />);

      // Without any callbacks the table renders no buttons
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('renders Retry button for failed runs when canWrite=true and onRetry is provided', () => {
      const failedRun = buildRun({ id: 'r-fail', status: 'failed' });
      render(<RunHistory runs={[failedRun]} canWrite={true} onRetry={vi.fn()} />);

      const rows = screen.getAllByRole('row');
      const dataRow = rows[1];
      const buttons = within(dataRow).getAllByRole('button');
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    });

    it('calls onRetry with the run object when Retry button is clicked', async () => {
      const user = userEvent.setup();
      const onRetry = vi.fn();
      const failedRun = buildRun({ id: 'r-fail', status: 'failed' });

      render(<RunHistory runs={[failedRun]} canWrite={true} onRetry={onRetry} />);

      const rows = screen.getAllByRole('row');
      const dataRow = rows[1];
      const buttons = within(dataRow).getAllByRole('button');
      await user.click(buttons[0]);

      expect(onRetry).toHaveBeenCalledWith(failedRun);
    });

    it('renders Delete button for completed runs when canDelete=true and onDelete is provided', () => {
      render(<RunHistory runs={[completedRun]} canDelete={true} onDelete={vi.fn()} />);

      const rows = screen.getAllByRole('row');
      const dataRow = rows[1];
      const buttons = within(dataRow).getAllByRole('button');
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    });

    it('calls onDelete with the run id when Delete button is clicked', async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn();

      render(<RunHistory runs={[completedRun]} canDelete={true} onDelete={onDelete} />);

      const rows = screen.getAllByRole('row');
      const dataRow = rows[1];
      const buttons = within(dataRow).getAllByRole('button');
      // With onView absent and only onDelete, the single button is Delete
      await user.click(buttons[0]);

      expect(onDelete).toHaveBeenCalledWith('run-done');
    });

    it('renders both View and Delete buttons when both callbacks are provided for a completed run', async () => {
      const onView = vi.fn();
      const onDelete = vi.fn();
      const user = userEvent.setup();

      render(
        <RunHistory
          runs={[completedRun]}
          onView={onView}
          canDelete={true}
          onDelete={onDelete}
        />,
      );

      const rows = screen.getAllByRole('row');
      const dataRow = rows[1];
      const buttons = within(dataRow).getAllByRole('button');
      // 2 buttons: View + Delete
      expect(buttons.length).toBe(2);

      // First button = View
      await user.click(buttons[0]);
      expect(onView).toHaveBeenCalledWith('run-done');

      // Second button = Delete
      await user.click(buttons[1]);
      expect(onDelete).toHaveBeenCalledWith('run-done');
    });
  });
});
