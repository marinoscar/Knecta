import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '../utils/test-utils';
import { ImportPreview } from '../../components/data-imports/ImportPreview';

interface TablePreviewEntry {
  tableName: string;
  columns: Array<{ name: string; type: string }>;
  sampleRows: unknown[][];
  estimatedRowCount?: number;
}

function buildTable(overrides: Partial<TablePreviewEntry> = {}): TablePreviewEntry {
  return {
    tableName: 'sales',
    columns: [
      { name: 'id', type: 'integer' },
      { name: 'name', type: 'varchar' },
      { name: 'amount', type: 'decimal' },
    ],
    sampleRows: [
      ['1', 'Alice', '100.00'],
      ['2', 'Bob', '200.00'],
    ],
    estimatedRowCount: 5000,
    ...overrides,
  };
}

describe('ImportPreview', () => {
  describe('Empty state', () => {
    it('renders empty state message when tables array is empty', () => {
      render(<ImportPreview tables={[]} />);

      expect(screen.getByText(/no tables to preview/i)).toBeInTheDocument();
    });

    it('does not render a table element when tables is empty', () => {
      render(<ImportPreview tables={[]} />);

      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });

  describe('Single table', () => {
    it('renders the table name as a heading', () => {
      render(<ImportPreview tables={[buildTable()]} />);

      expect(screen.getByText('sales')).toBeInTheDocument();
    });

    it('renders a chip showing the column count', () => {
      render(<ImportPreview tables={[buildTable()]} />);

      expect(screen.getByText('3 columns')).toBeInTheDocument();
    });

    it('renders estimated row count chip when provided', () => {
      render(<ImportPreview tables={[buildTable({ estimatedRowCount: 5000 })]} />);

      expect(screen.getByText(/~5,000 rows/)).toBeInTheDocument();
    });

    it('does not render estimated row count chip when estimatedRowCount is undefined', () => {
      render(<ImportPreview tables={[buildTable({ estimatedRowCount: undefined })]} />);

      // The "~N rows" chip should not be present (but "Sample data (first N rows)" may appear)
      expect(screen.queryByText(/~[\d,]+ rows/)).not.toBeInTheDocument();
    });

    it('renders column chips with name:type format', () => {
      render(<ImportPreview tables={[buildTable()]} />);

      expect(screen.getByText('id: integer')).toBeInTheDocument();
      expect(screen.getByText('name: varchar')).toBeInTheDocument();
      expect(screen.getByText('amount: decimal')).toBeInTheDocument();
    });

    it('renders sample data rows in the preview table', () => {
      render(<ImportPreview tables={[buildTable()]} />);

      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    it('renders the preview table column headers', () => {
      render(<ImportPreview tables={[buildTable()]} />);

      expect(screen.getByRole('columnheader', { name: 'id' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'name' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'amount' })).toBeInTheDocument();
    });

    it('shows "Sample data" label above the preview table', () => {
      render(<ImportPreview tables={[buildTable()]} />);

      expect(screen.getByText(/sample data/i)).toBeInTheDocument();
    });
  });

  describe('Empty sample rows', () => {
    it('does not render a sample data table when sampleRows is empty', () => {
      render(<ImportPreview tables={[buildTable({ sampleRows: [] })]} />);

      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('still renders column chips when sampleRows is empty', () => {
      render(<ImportPreview tables={[buildTable({ sampleRows: [] })]} />);

      expect(screen.getByText('id: integer')).toBeInTheDocument();
    });
  });

  describe('Multiple tables', () => {
    it('renders each table name when multiple tables are provided', () => {
      render(
        <ImportPreview
          tables={[
            buildTable({ tableName: 'sales' }),
            buildTable({ tableName: 'inventory' }),
          ]}
        />,
      );

      expect(screen.getByText('sales')).toBeInTheDocument();
      expect(screen.getByText('inventory')).toBeInTheDocument();
    });

    it('renders a divider between tables', () => {
      const { container } = render(
        <ImportPreview
          tables={[
            buildTable({ tableName: 'sales' }),
            buildTable({ tableName: 'inventory' }),
          ]}
        />,
      );

      const dividers = container.querySelectorAll('hr');
      expect(dividers.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Column type coloring', () => {
    it('renders integer column chip without error', () => {
      render(
        <ImportPreview
          tables={[
            buildTable({
              columns: [
                { name: 'count', type: 'integer' },
                { name: 'is_active', type: 'boolean' },
                { name: 'created', type: 'datetime' },
              ],
              sampleRows: [],
            }),
          ]}
        />,
      );

      expect(screen.getByText('count: integer')).toBeInTheDocument();
      expect(screen.getByText('is_active: boolean')).toBeInTheDocument();
      expect(screen.getByText('created: datetime')).toBeInTheDocument();
    });
  });
});
