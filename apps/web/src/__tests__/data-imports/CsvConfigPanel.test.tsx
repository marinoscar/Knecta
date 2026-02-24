import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../utils/test-utils';
import { CsvConfigPanel } from '../../components/data-imports/CsvConfigPanel';
import type { CsvParseResult } from '../../types';

const mockParseResult: CsvParseResult = {
  type: 'csv',
  detectedDelimiter: ',',
  detectedEncoding: 'UTF-8',
  hasHeader: true,
  columns: [
    { name: 'id', detectedType: 'BIGINT' },
    { name: 'name', detectedType: 'VARCHAR' },
    { name: 'amount', detectedType: 'DECIMAL' },
    { name: 'date', detectedType: 'DATE' },
  ],
  sampleRows: [
    ['1', 'Alice', '100', '2026-01-01'],
    ['2', 'Bob', '200', '2026-01-02'],
    ['3', 'Carol', '300', '2026-01-03'],
  ],
  rowCountEstimate: 5000,
};

function buildProps(overrides: Partial<Parameters<typeof CsvConfigPanel>[0]> = {}) {
  return {
    parseResult: mockParseResult,
    delimiter: ',',
    hasHeader: true,
    encoding: 'UTF-8',
    onDelimiterChange: vi.fn(),
    onHasHeaderChange: vi.fn(),
    onEncodingChange: vi.fn(),
    ...overrides,
  };
}

describe('CsvConfigPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders the CSV Configuration heading', () => {
      render(<CsvConfigPanel {...buildProps()} />);

      expect(screen.getByText('CSV Configuration')).toBeInTheDocument();
    });

    it('renders the Delimiter dropdown', () => {
      render(<CsvConfigPanel {...buildProps()} />);

      // MUI Select renders as combobox; label text appears at least once
      expect(screen.getAllByText('Delimiter').length).toBeGreaterThanOrEqual(1);
      const comboboxes = screen.getAllByRole('combobox');
      expect(comboboxes.length).toBeGreaterThanOrEqual(2); // delimiter + encoding
    });

    it('renders the Encoding dropdown', () => {
      render(<CsvConfigPanel {...buildProps()} />);

      expect(screen.getAllByText('Encoding').length).toBeGreaterThanOrEqual(1);
    });

    it('renders the "First row is header" checkbox', () => {
      render(<CsvConfigPanel {...buildProps()} />);

      expect(screen.getByLabelText(/first row is header/i)).toBeInTheDocument();
    });

    it('shows detected delimiter info text', () => {
      render(<CsvConfigPanel {...buildProps()} />);

      expect(screen.getByText(/detected delimiter/i)).toBeInTheDocument();
    });

    it('shows estimated row count', () => {
      render(<CsvConfigPanel {...buildProps()} />);

      expect(screen.getByText(/5,000/)).toBeInTheDocument();
    });
  });

  describe('Data preview table', () => {
    it('renders column headers from parseResult.columns', () => {
      render(<CsvConfigPanel {...buildProps()} />);

      expect(screen.getByRole('columnheader', { name: 'id' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'name' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'amount' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'date' })).toBeInTheDocument();
    });

    it('renders column names from object format in header cells', () => {
      render(<CsvConfigPanel {...buildProps()} />);

      // Each column header must show the .name string — not "[object Object]"
      expect(screen.getByRole('columnheader', { name: 'id' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'name' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'amount' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'date' })).toBeInTheDocument();
      expect(screen.queryByText('[object Object]')).not.toBeInTheDocument();
    });

    it('renders sample data rows in the preview table', () => {
      render(<CsvConfigPanel {...buildProps()} />);

      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
      expect(screen.getByText('Carol')).toBeInTheDocument();
    });

    it('renders generic column headers when hasHeader is false', () => {
      render(<CsvConfigPanel {...buildProps({ hasHeader: false })} />);

      expect(screen.getByRole('columnheader', { name: 'Column 1' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Column 2' })).toBeInTheDocument();
    });

    it('shows data preview row count label', () => {
      render(<CsvConfigPanel {...buildProps()} />);

      expect(screen.getByText(/data preview/i)).toBeInTheDocument();
    });
  });

  describe('Delimiter dropdown', () => {
    it('reflects the current delimiter value passed via props', () => {
      render(<CsvConfigPanel {...buildProps({ delimiter: ',' })} />);

      // MUI Select renders comboboxes; "Comma (,)" appears as the selected value
      expect(screen.getAllByText('Comma (,)').length).toBeGreaterThanOrEqual(1);
    });

    it('calls onDelimiterChange when a different delimiter is selected', async () => {
      const user = userEvent.setup();
      const onDelimiterChange = vi.fn();

      render(
        <CsvConfigPanel
          {...buildProps({ onDelimiterChange })}
        />,
      );

      // Click first combobox which is the Delimiter select
      const comboboxes = screen.getAllByRole('combobox');
      await user.click(comboboxes[0]);

      await waitFor(() => {
        expect(screen.getByText('Semicolon (;)')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Semicolon (;)'));

      expect(onDelimiterChange).toHaveBeenCalledWith(';');
    });
  });

  describe('Header checkbox', () => {
    it('shows header checkbox as checked when hasHeader is true', () => {
      render(<CsvConfigPanel {...buildProps({ hasHeader: true })} />);

      const checkbox = screen.getByLabelText(/first row is header/i);
      expect(checkbox).toBeChecked();
    });

    it('shows header checkbox as unchecked when hasHeader is false', () => {
      render(<CsvConfigPanel {...buildProps({ hasHeader: false })} />);

      const checkbox = screen.getByLabelText(/first row is header/i);
      expect(checkbox).not.toBeChecked();
    });

    it('calls onHasHeaderChange with false when unchecking the header checkbox', async () => {
      const user = userEvent.setup();
      const onHasHeaderChange = vi.fn();

      render(
        <CsvConfigPanel {...buildProps({ hasHeader: true, onHasHeaderChange })} />,
      );

      await user.click(screen.getByLabelText(/first row is header/i));

      expect(onHasHeaderChange).toHaveBeenCalledWith(false);
    });

    it('calls onHasHeaderChange with true when checking the header checkbox', async () => {
      const user = userEvent.setup();
      const onHasHeaderChange = vi.fn();

      render(
        <CsvConfigPanel {...buildProps({ hasHeader: false, onHasHeaderChange })} />,
      );

      await user.click(screen.getByLabelText(/first row is header/i));

      expect(onHasHeaderChange).toHaveBeenCalledWith(true);
    });
  });

  describe('Encoding dropdown', () => {
    it('calls onEncodingChange when a different encoding is selected', async () => {
      const user = userEvent.setup();
      const onEncodingChange = vi.fn();

      render(
        <CsvConfigPanel {...buildProps({ encoding: 'UTF-8', onEncodingChange })} />,
      );

      // Click the second combobox which is the Encoding select
      const comboboxes = screen.getAllByRole('combobox');
      await user.click(comboboxes[1]);

      await waitFor(() => {
        expect(screen.getByText('Latin-1')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Latin-1'));

      expect(onEncodingChange).toHaveBeenCalledWith('Latin-1');
    });
  });
});
