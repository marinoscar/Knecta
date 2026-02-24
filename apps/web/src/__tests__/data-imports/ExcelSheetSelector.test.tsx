import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { render } from '../utils/test-utils';
import { ExcelSheetSelector } from '../../components/data-imports/ExcelSheetSelector';
import type { ExcelParseResult, SheetConfig, SheetPreviewResult } from '../../types';

const mockParseResult: ExcelParseResult = {
  type: 'excel',
  sheets: [
    { name: 'Sales', rowCount: 1000, colCount: 5, hasMergedCells: false },
    { name: 'Summary', rowCount: 50, colCount: 3, hasMergedCells: true },
    { name: 'Metadata', rowCount: 10, colCount: 2, hasMergedCells: false },
  ],
};

const mockSheetPreview: SheetPreviewResult = {
  columns: [
    { name: 'ID', detectedType: 'BIGINT' },
    { name: 'Name', detectedType: 'VARCHAR' },
    { name: 'Amount', detectedType: 'DECIMAL' },
  ],
  rows: [
    ['1', 'Alice', '100'],
    ['2', 'Bob', '200'],
  ],
  totalRows: 1000,
  detectedTypes: [
    { name: 'ID', type: 'integer' },
    { name: 'Name', type: 'varchar' },
    { name: 'Amount', type: 'decimal' },
  ],
};

function buildProps(
  overrides: Partial<{
    importId: string;
    parseResult: ExcelParseResult;
    sheetConfigs: SheetConfig[];
    onSheetConfigsChange: (configs: SheetConfig[]) => void;
  }> = {},
) {
  return {
    importId: 'import-1',
    parseResult: mockParseResult,
    sheetConfigs: [],
    onSheetConfigsChange: vi.fn(),
    ...overrides,
  };
}

describe('ExcelSheetSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: return preview data for sheet preview POST endpoint
    server.use(
      http.post('*/api/data-imports/*/preview', () =>
        HttpResponse.json(mockSheetPreview),
      ),
    );
  });

  describe('Rendering', () => {
    it('renders the "Select Sheets to Import" heading', () => {
      render(<ExcelSheetSelector {...buildProps()} />);

      expect(screen.getByText('Select Sheets to Import')).toBeInTheDocument();
    });

    it('renders an accordion row for each sheet in the parse result', () => {
      render(<ExcelSheetSelector {...buildProps()} />);

      expect(screen.getByText('Sales')).toBeInTheDocument();
      expect(screen.getByText('Summary')).toBeInTheDocument();
      expect(screen.getByText('Metadata')).toBeInTheDocument();
    });

    it('renders row and column count info for each sheet', () => {
      render(<ExcelSheetSelector {...buildProps()} />);

      // Sales sheet: 1,000 rows × 5 columns
      expect(screen.getByText(/1,000 rows/)).toBeInTheDocument();
    });

    it('notes merged cells on sheets that have them', () => {
      render(<ExcelSheetSelector {...buildProps()} />);

      expect(screen.getByText(/has merged cells/i)).toBeInTheDocument();
    });

    it('shows "Select at least one sheet" alert when no sheets are selected', () => {
      render(<ExcelSheetSelector {...buildProps({ sheetConfigs: [] })} />);

      expect(
        screen.getByText(/select at least one sheet to continue/i),
      ).toBeInTheDocument();
    });

    it('does not show the "at least one sheet" alert when a sheet is selected', () => {
      render(
        <ExcelSheetSelector
          {...buildProps({
            sheetConfigs: [{ sheetName: 'Sales', hasHeader: true }],
          })}
        />,
      );

      expect(
        screen.queryByText(/select at least one sheet to continue/i),
      ).not.toBeInTheDocument();
    });
  });

  describe('Sheet checkboxes', () => {
    it('renders a checkbox for each sheet (unchecked by default)', () => {
      render(<ExcelSheetSelector {...buildProps()} />);

      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes.length).toBe(3);
      checkboxes.forEach((cb) => expect(cb).not.toBeChecked());
    });

    it('calls onSheetConfigsChange with the selected sheet when a checkbox is toggled', async () => {
      const user = userEvent.setup();
      const onSheetConfigsChange = vi.fn();

      render(
        <ExcelSheetSelector
          {...buildProps({ onSheetConfigsChange })}
        />,
      );

      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[0]); // Select "Sales"

      expect(onSheetConfigsChange).toHaveBeenCalledWith([
        { sheetName: 'Sales', hasHeader: true },
      ]);
    });

    it('calls onSheetConfigsChange to remove a sheet when its checkbox is unchecked', async () => {
      const user = userEvent.setup();
      const onSheetConfigsChange = vi.fn();

      render(
        <ExcelSheetSelector
          {...buildProps({
            sheetConfigs: [{ sheetName: 'Sales', hasHeader: true }],
            onSheetConfigsChange,
          })}
        />,
      );

      // First checkbox is for Sales which is currently selected
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[0]);

      expect(onSheetConfigsChange).toHaveBeenCalledWith([]);
    });

    it('shows accordion details (config panel) when a sheet is selected', () => {
      render(
        <ExcelSheetSelector
          {...buildProps({
            sheetConfigs: [{ sheetName: 'Sales', hasHeader: true }],
          })}
        />,
      );

      // Config panel heading for range
      expect(screen.getByText(/range.*optional/i)).toBeInTheDocument();
    });
  });

  describe('Per-sheet config', () => {
    it('renders the "First row is header" checkbox inside an expanded sheet', () => {
      render(
        <ExcelSheetSelector
          {...buildProps({
            sheetConfigs: [{ sheetName: 'Sales', hasHeader: true }],
          })}
        />,
      );

      expect(screen.getByLabelText(/first row is header/i)).toBeInTheDocument();
    });

    it('renders range input fields when a sheet is expanded', () => {
      render(
        <ExcelSheetSelector
          {...buildProps({
            sheetConfigs: [{ sheetName: 'Sales', hasHeader: true }],
          })}
        />,
      );

      expect(screen.getByLabelText(/start row/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/end row/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/start col/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/end col/i)).toBeInTheDocument();
    });

    it('range inputs accept numeric values', async () => {
      const user = userEvent.setup();
      const onSheetConfigsChange = vi.fn();

      render(
        <ExcelSheetSelector
          {...buildProps({
            sheetConfigs: [{ sheetName: 'Sales', hasHeader: true }],
            onSheetConfigsChange,
          })}
        />,
      );

      const startRowInput = screen.getByLabelText(/start row/i);
      await user.type(startRowInput, '2');

      // onSheetConfigsChange should have been called with the updated range
      expect(onSheetConfigsChange).toHaveBeenCalled();
    });

    it('toggling the header checkbox updates config via onSheetConfigsChange', async () => {
      const user = userEvent.setup();
      const onSheetConfigsChange = vi.fn();

      render(
        <ExcelSheetSelector
          {...buildProps({
            sheetConfigs: [{ sheetName: 'Sales', hasHeader: true }],
            onSheetConfigsChange,
          })}
        />,
      );

      await user.click(screen.getByLabelText(/first row is header/i));

      expect(onSheetConfigsChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ sheetName: 'Sales', hasHeader: false }),
        ]),
      );
    });
  });

  describe('Preview loading', () => {
    it('shows a loading indicator while sheet preview is fetching', async () => {
      server.use(
        http.post('*/api/data-imports/*/preview', async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return HttpResponse.json(mockSheetPreview);
        }),
      );

      render(
        <ExcelSheetSelector
          {...buildProps({
            sheetConfigs: [{ sheetName: 'Sales', hasHeader: true }],
          })}
        />,
      );

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('shows preview table after preview data loads', async () => {
      render(
        <ExcelSheetSelector
          {...buildProps({
            sheetConfigs: [{ sheetName: 'Sales', hasHeader: true }],
          })}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Alice')).toBeInTheDocument();
      });
    });

    it('renders column names from object format in preview table', async () => {
      render(
        <ExcelSheetSelector
          {...buildProps({
            sheetConfigs: [{ sheetName: 'Sales', hasHeader: true }],
          })}
        />,
      );

      await waitFor(() => {
        // Column headers must show name strings — not "[object Object]"
        expect(screen.getByText('ID')).toBeInTheDocument();
        expect(screen.getByText('Name')).toBeInTheDocument();
        expect(screen.getByText('Amount')).toBeInTheDocument();
        expect(screen.queryByText('[object Object]')).not.toBeInTheDocument();
      });
    });

    it('shows a warning alert when preview fails', async () => {
      server.use(
        http.post('*/api/data-imports/*/preview', () =>
          HttpResponse.json({ message: 'Preview failed' }, { status: 500 }),
        ),
      );

      render(
        <ExcelSheetSelector
          {...buildProps({
            sheetConfigs: [{ sheetName: 'Sales', hasHeader: true }],
          })}
        />,
      );

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/preview failed/i)).toBeInTheDocument();
      });
    });
  });
});
