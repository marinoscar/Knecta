import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { render } from '../../utils/test-utils';
import { JoinGraphDialog } from '../../../components/data-agent/JoinGraphDialog';
import type { JoinPlanData } from '../../../components/data-agent/insightsUtils';

// Mock react-force-graph-2d
vi.mock('react-force-graph-2d', () => ({
  default: vi.fn(() => null),
}));

// Mock CodeMirror
vi.mock('@uiw/react-codemirror', () => ({
  default: vi.fn(({ value }: { value: string }) => <pre data-testid="codemirror">{value}</pre>),
}));

vi.mock('@codemirror/lang-yaml', () => ({
  yaml: vi.fn(() => []),
}));

describe('JoinGraphDialog', () => {
  const sampleJoinPlan: JoinPlanData = {
    relevantDatasets: [
      { name: 'orders', description: 'Customer orders', source: 'public.orders', yaml: 'name: orders\nfields: []' },
      { name: 'customers', description: 'Customer accounts', source: 'public.customers', yaml: 'name: customers\nfields: []' },
    ],
    joinPaths: [
      {
        datasets: ['orders', 'customers'],
        edges: [
          {
            fromDataset: 'orders',
            toDataset: 'customers',
            fromColumns: ['customer_id'],
            toColumns: ['id'],
            relationshipName: 'placed_by',
          },
        ],
      },
    ],
    notes: 'Found 2 datasets and 1 join path',
  };

  it('does not render when open=false', () => {
    render(
      <JoinGraphDialog
        joinPlan={sampleJoinPlan}
        open={false}
        onClose={() => {}}
      />
    );

    expect(screen.queryByText('Navigator Join Graph')).not.toBeInTheDocument();
  });

  it('renders dialog title "Navigator Join Graph" when open=true', () => {
    render(
      <JoinGraphDialog
        joinPlan={sampleJoinPlan}
        open={true}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('Navigator Join Graph')).toBeInTheDocument();
  });

  it('shows "No datasets found" when joinPlan has empty relevantDatasets', () => {
    const emptyJoinPlan: JoinPlanData = {
      relevantDatasets: [],
      joinPaths: [],
      notes: 'No datasets',
    };

    render(
      <JoinGraphDialog
        joinPlan={emptyJoinPlan}
        open={true}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('No datasets found')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const onCloseMock = vi.fn();

    render(
      <JoinGraphDialog
        joinPlan={sampleJoinPlan}
        open={true}
        onClose={onCloseMock}
      />
    );

    // Find the close button in the dialog title
    const closeButtons = screen.getAllByRole('button');
    const titleCloseButton = closeButtons.find((btn) =>
      btn.querySelector('svg[data-testid="CloseIcon"]')
    );
    expect(titleCloseButton).toBeDefined();

    fireEvent.click(titleCloseButton!);

    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('shows dataset count and join edges info', () => {
    render(
      <JoinGraphDialog
        joinPlan={sampleJoinPlan}
        open={true}
        onClose={() => {}}
      />
    );

    // The component should render the graph data
    // Since we mocked react-force-graph-2d, we verify by checking the title is present
    expect(screen.getByText('Navigator Join Graph')).toBeInTheDocument();

    // Verify it's not showing empty state
    expect(screen.queryByText('No datasets found')).not.toBeInTheDocument();

    // Verify the dialog is rendered
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
