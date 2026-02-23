import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../../utils/test-utils';
import { ExtractionPlanReview } from '../../../components/spreadsheet-agent/ExtractionPlanReview';
import type { SpreadsheetExtractionPlan } from '../../../types';

const mockPlan: SpreadsheetExtractionPlan = {
  tables: [
    {
      tableName: 'orders',
      description: 'Customer orders',
      sourceFileId: 'f1',
      sourceFileName: 'sales.xlsx',
      sourceSheetName: 'Sheet1',
      headerRow: 0,
      dataStartRow: 1,
      dataEndRow: null,
      columns: [
        {
          sourceName: 'Order ID',
          outputName: 'order_id',
          outputType: 'integer',
          nullable: false,
          transformation: null,
          description: 'Primary key',
        },
        {
          sourceName: 'Amount',
          outputName: 'amount',
          outputType: 'decimal',
          nullable: true,
          transformation: null,
          description: 'Order amount',
        },
      ],
      skipRows: [],
      needsTranspose: false,
      estimatedRows: 1000,
      outputPath: '/output/orders.parquet',
      notes: '',
    },
    {
      tableName: 'products',
      description: 'Product catalog',
      sourceFileId: 'f1',
      sourceFileName: 'sales.xlsx',
      sourceSheetName: 'Sheet2',
      headerRow: 0,
      dataStartRow: 1,
      dataEndRow: null,
      columns: [
        {
          sourceName: 'Name',
          outputName: 'name',
          outputType: 'text',
          nullable: false,
          transformation: null,
          description: 'Product name',
        },
      ],
      skipRows: [],
      needsTranspose: false,
      estimatedRows: 50,
      outputPath: '/output/products.parquet',
      notes: '',
    },
  ],
  relationships: [],
  catalogMetadata: {
    projectDescription: 'Sales data',
    domainNotes: 'E-commerce',
    dataQualityNotes: ['Some nulls in amount column'],
  },
};

describe('ExtractionPlanReview', () => {
  const mockOnApprove = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders table names from the plan', () => {
      render(
        <ExtractionPlanReview
          plan={mockPlan}
          onApprove={mockOnApprove}
          onCancel={mockOnCancel}
        />,
      );

      expect(screen.getByText('orders')).toBeInTheDocument();
      expect(screen.getByText('products')).toBeInTheDocument();
    });

    it('renders column output names for included tables', () => {
      render(
        <ExtractionPlanReview
          plan={mockPlan}
          onApprove={mockOnApprove}
          onCancel={mockOnCancel}
        />,
      );

      expect(screen.getByText('order_id')).toBeInTheDocument();
      expect(screen.getByText('amount')).toBeInTheDocument();
      expect(screen.getByText('name')).toBeInTheDocument();
    });

    it('renders table descriptions', () => {
      render(
        <ExtractionPlanReview
          plan={mockPlan}
          onApprove={mockOnApprove}
          onCancel={mockOnCancel}
        />,
      );

      expect(screen.getByText('Customer orders')).toBeInTheDocument();
      expect(screen.getByText('Product catalog')).toBeInTheDocument();
    });

    it('shows estimated row counts as chips', () => {
      render(
        <ExtractionPlanReview
          plan={mockPlan}
          onApprove={mockOnApprove}
          onCancel={mockOnCancel}
        />,
      );

      expect(screen.getByText('~1000 rows')).toBeInTheDocument();
      expect(screen.getByText('~50 rows')).toBeInTheDocument();
    });

    it('shows column count chips', () => {
      render(
        <ExtractionPlanReview
          plan={mockPlan}
          onApprove={mockOnApprove}
          onCancel={mockOnCancel}
        />,
      );

      expect(screen.getByText('2 columns')).toBeInTheDocument();
      expect(screen.getByText('1 columns')).toBeInTheDocument();
    });

    it('renders catalog metadata project description', () => {
      render(
        <ExtractionPlanReview
          plan={mockPlan}
          onApprove={mockOnApprove}
          onCancel={mockOnCancel}
        />,
      );

      expect(screen.getByText('Sales data')).toBeInTheDocument();
    });

    it('renders data quality notes', () => {
      render(
        <ExtractionPlanReview
          plan={mockPlan}
          onApprove={mockOnApprove}
          onCancel={mockOnCancel}
        />,
      );

      expect(screen.getByText(/some nulls in amount column/i)).toBeInTheDocument();
    });

    it('renders the info alert about review instructions', () => {
      render(
        <ExtractionPlanReview
          plan={mockPlan}
          onApprove={mockOnApprove}
          onCancel={mockOnCancel}
        />,
      );

      expect(screen.getByText(/review the extraction plan/i)).toBeInTheDocument();
    });
  });

  describe('Approve button', () => {
    it('shows approve button with count of included tables', () => {
      render(
        <ExtractionPlanReview
          plan={mockPlan}
          onApprove={mockOnApprove}
          onCancel={mockOnCancel}
        />,
      );

      expect(screen.getByText(/approve plan.*2 tables/i)).toBeInTheDocument();
    });

    it('calls onApprove with all tables as included by default', () => {
      render(
        <ExtractionPlanReview
          plan={mockPlan}
          onApprove={mockOnApprove}
          onCancel={mockOnCancel}
        />,
      );

      fireEvent.click(screen.getByText(/approve plan/i));

      expect(mockOnApprove).toHaveBeenCalledTimes(1);
      expect(mockOnApprove).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ tableName: 'orders', action: 'include' }),
          expect.objectContaining({ tableName: 'products', action: 'include' }),
        ]),
      );
    });

    it('is disabled when isSubmitting is true', () => {
      render(
        <ExtractionPlanReview
          plan={mockPlan}
          onApprove={mockOnApprove}
          onCancel={mockOnCancel}
          isSubmitting
        />,
      );

      expect(screen.getByText(/approving/i)).toBeDisabled();
    });

    it('shows "Approving..." text while submitting', () => {
      render(
        <ExtractionPlanReview
          plan={mockPlan}
          onApprove={mockOnApprove}
          onCancel={mockOnCancel}
          isSubmitting
        />,
      );

      expect(screen.getByText(/approving/i)).toBeInTheDocument();
    });
  });

  describe('Cancel button', () => {
    it('renders cancel button', () => {
      render(
        <ExtractionPlanReview
          plan={mockPlan}
          onApprove={mockOnApprove}
          onCancel={mockOnCancel}
        />,
      );

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    it('calls onCancel when cancel button is clicked', () => {
      render(
        <ExtractionPlanReview
          plan={mockPlan}
          onApprove={mockOnApprove}
          onCancel={mockOnCancel}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(mockOnCancel).toHaveBeenCalledTimes(1);
      expect(mockOnApprove).not.toHaveBeenCalled();
    });

    it('is disabled when isSubmitting is true', () => {
      render(
        <ExtractionPlanReview
          plan={mockPlan}
          onApprove={mockOnApprove}
          onCancel={mockOnCancel}
          isSubmitting
        />,
      );

      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    });
  });

  describe('Table toggle (include/skip)', () => {
    it('skips a table when its toggle switch is turned off', async () => {
      const user = userEvent.setup();
      render(
        <ExtractionPlanReview
          plan={mockPlan}
          onApprove={mockOnApprove}
          onCancel={mockOnCancel}
        />,
      );

      // There are two switches (one per table), toggle the first one off
      const switches = screen.getAllByRole('checkbox');
      await user.click(switches[0]);

      // Approve button count should drop to 1
      expect(screen.getByText(/approve plan.*1 tables/i)).toBeInTheDocument();
    });

    it('calls onApprove with skip action for toggled-off table', async () => {
      const user = userEvent.setup();
      render(
        <ExtractionPlanReview
          plan={mockPlan}
          onApprove={mockOnApprove}
          onCancel={mockOnCancel}
        />,
      );

      const switches = screen.getAllByRole('checkbox');
      await user.click(switches[0]); // toggle 'orders' off

      fireEvent.click(screen.getByText(/approve plan/i));

      expect(mockOnApprove).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ tableName: 'orders', action: 'skip' }),
          expect.objectContaining({ tableName: 'products', action: 'include' }),
        ]),
      );
    });

    it('disables the approve button when all tables are skipped', async () => {
      const user = userEvent.setup();
      render(
        <ExtractionPlanReview
          plan={mockPlan}
          onApprove={mockOnApprove}
          onCancel={mockOnCancel}
        />,
      );

      const switches = screen.getAllByRole('checkbox');
      await user.click(switches[0]);
      await user.click(switches[1]);

      expect(screen.getByText(/approve plan.*0 tables/i)).toBeDisabled();
    });

    it('hides column details for a skipped table', async () => {
      const user = userEvent.setup();
      render(
        <ExtractionPlanReview
          plan={mockPlan}
          onApprove={mockOnApprove}
          onCancel={mockOnCancel}
        />,
      );

      // Column 'order_id' is in the 'orders' table
      expect(screen.getByText('order_id')).toBeInTheDocument();

      const switches = screen.getAllByRole('checkbox');
      await user.click(switches[0]); // skip 'orders'

      expect(screen.queryByText('order_id')).not.toBeInTheDocument();
    });

    it('re-includes a table when the toggle is switched back on', async () => {
      const user = userEvent.setup();
      render(
        <ExtractionPlanReview
          plan={mockPlan}
          onApprove={mockOnApprove}
          onCancel={mockOnCancel}
        />,
      );

      const switches = screen.getAllByRole('checkbox');
      await user.click(switches[0]); // skip
      await user.click(switches[0]); // re-include

      expect(screen.getByText(/approve plan.*2 tables/i)).toBeInTheDocument();
    });
  });

  describe('Table renaming', () => {
    it('renders an output table name text field for each included table', () => {
      render(
        <ExtractionPlanReview
          plan={mockPlan}
          onApprove={mockOnApprove}
          onCancel={mockOnCancel}
        />,
      );

      // Each included table card has an "Output table name" input
      const inputs = screen.getAllByLabelText(/output table name/i);
      expect(inputs).toHaveLength(2);
    });
  });

  describe('Relationships section', () => {
    it('does not render relationships section when there are none', () => {
      render(
        <ExtractionPlanReview
          plan={mockPlan}
          onApprove={mockOnApprove}
          onCancel={mockOnCancel}
        />,
      );

      expect(screen.queryByText('Detected Relationships')).not.toBeInTheDocument();
    });

    it('renders relationships section when relationships are present', () => {
      const planWithRelationships: SpreadsheetExtractionPlan = {
        ...mockPlan,
        relationships: [
          {
            fromTable: 'orders',
            fromColumn: 'product_id',
            toTable: 'products',
            toColumn: 'id',
            confidence: 'high',
            notes: 'FK relationship',
          },
        ],
      };

      render(
        <ExtractionPlanReview
          plan={planWithRelationships}
          onApprove={mockOnApprove}
          onCancel={mockOnCancel}
        />,
      );

      expect(screen.getByText('Detected Relationships')).toBeInTheDocument();
    });
  });

  describe('Single table plan', () => {
    it('shows correct singular table count in approve button', () => {
      const singleTablePlan: SpreadsheetExtractionPlan = {
        ...mockPlan,
        tables: [mockPlan.tables[0]],
      };

      render(
        <ExtractionPlanReview
          plan={singleTablePlan}
          onApprove={mockOnApprove}
          onCancel={mockOnCancel}
        />,
      );

      expect(screen.getByText(/approve plan.*1 tables/i)).toBeInTheDocument();
    });
  });

  describe('cleanDescription — DuckDB/Parquet filtering (Issue 5)', () => {
    it('does not render "DuckDB" in the project description', () => {
      const planWithTechnicalTerms: SpreadsheetExtractionPlan = {
        ...mockPlan,
        catalogMetadata: {
          projectDescription: 'Extract financial data into analytics-ready Parquet tables for DuckDB.',
          domainNotes: 'Finance',
          dataQualityNotes: [],
        },
      };

      render(
        <ExtractionPlanReview
          plan={planWithTechnicalTerms}
          onApprove={mockOnApprove}
          onCancel={mockOnCancel}
        />,
      );

      expect(screen.queryByText(/DuckDB/i)).not.toBeInTheDocument();
    });

    it('does not render "Parquet" in the project description', () => {
      const planWithTechnicalTerms: SpreadsheetExtractionPlan = {
        ...mockPlan,
        catalogMetadata: {
          projectDescription: 'Extract financial data into analytics-ready Parquet tables for DuckDB.',
          domainNotes: 'Finance',
          dataQualityNotes: [],
        },
      };

      render(
        <ExtractionPlanReview
          plan={planWithTechnicalTerms}
          onApprove={mockOnApprove}
          onCancel={mockOnCancel}
        />,
      );

      expect(screen.queryByText(/Parquet/i)).not.toBeInTheDocument();
    });

    it('does not render "DuckDB" in data quality notes', () => {
      const planWithTechnicalNotes: SpreadsheetExtractionPlan = {
        ...mockPlan,
        catalogMetadata: {
          projectDescription: 'Financial data',
          domainNotes: 'Finance',
          dataQualityNotes: ['DuckDB optimized for OLAP queries', 'Parquet files stored in S3'],
        },
      };

      render(
        <ExtractionPlanReview
          plan={planWithTechnicalNotes}
          onApprove={mockOnApprove}
          onCancel={mockOnCancel}
        />,
      );

      expect(screen.queryByText(/DuckDB/i)).not.toBeInTheDocument();
    });

    it('does not render "Parquet" in data quality notes', () => {
      const planWithTechnicalNotes: SpreadsheetExtractionPlan = {
        ...mockPlan,
        catalogMetadata: {
          projectDescription: 'Financial data',
          domainNotes: 'Finance',
          dataQualityNotes: ['DuckDB optimized for OLAP queries', 'Parquet files stored in S3'],
        },
      };

      render(
        <ExtractionPlanReview
          plan={planWithTechnicalNotes}
          onApprove={mockOnApprove}
          onCancel={mockOnCancel}
        />,
      );

      expect(screen.queryByText(/Parquet/i)).not.toBeInTheDocument();
    });

    it('removes "Parquet" from "analytics-ready Parquet tables" phrase, leaving clean text', () => {
      // The cleanDescription function removes "Parquet" before the full-phrase substitution
      // runs, so "analytics-ready Parquet tables" becomes "analytics-ready tables".
      // Either way, the word "Parquet" must not appear in the output.
      const planWithKnownPhrase: SpreadsheetExtractionPlan = {
        ...mockPlan,
        catalogMetadata: {
          projectDescription: 'Extract financial data into analytics-ready Parquet tables for DuckDB.',
          domainNotes: 'Finance',
          dataQualityNotes: [],
        },
      };

      render(
        <ExtractionPlanReview
          plan={planWithKnownPhrase}
          onApprove={mockOnApprove}
          onCancel={mockOnCancel}
        />,
      );

      expect(screen.queryByText(/Parquet/i)).not.toBeInTheDocument();
      // The non-technical portion of the description should still be visible
      expect(screen.getByText(/analytics-ready/i)).toBeInTheDocument();
    });

    it('preserves non-technical description text after filtering', () => {
      const planWithMixedText: SpreadsheetExtractionPlan = {
        ...mockPlan,
        catalogMetadata: {
          projectDescription: 'Extract financial data into analytics-ready Parquet tables for DuckDB.',
          domainNotes: 'Finance',
          dataQualityNotes: [],
        },
      };

      render(
        <ExtractionPlanReview
          plan={planWithMixedText}
          onApprove={mockOnApprove}
          onCancel={mockOnCancel}
        />,
      );

      expect(screen.getByText(/Extract financial data/i)).toBeInTheDocument();
    });

    it('filters technical terms case-insensitively from description', () => {
      const planWithMixedCase: SpreadsheetExtractionPlan = {
        ...mockPlan,
        catalogMetadata: {
          projectDescription: 'Stored as parquet files, optimized for duckdb.',
          domainNotes: 'Finance',
          dataQualityNotes: [],
        },
      };

      render(
        <ExtractionPlanReview
          plan={planWithMixedCase}
          onApprove={mockOnApprove}
          onCancel={mockOnCancel}
        />,
      );

      expect(screen.queryByText(/parquet/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/duckdb/i)).not.toBeInTheDocument();
    });

    it('filters technical terms from each data quality note independently', () => {
      const planWithMultipleNotes: SpreadsheetExtractionPlan = {
        ...mockPlan,
        catalogMetadata: {
          projectDescription: 'Clean financial data',
          domainNotes: 'Finance',
          dataQualityNotes: [
            'Some nulls in amount column',
            'DuckDB optimized for OLAP queries',
            'Parquet format used for storage',
          ],
        },
      };

      render(
        <ExtractionPlanReview
          plan={planWithMultipleNotes}
          onApprove={mockOnApprove}
          onCancel={mockOnCancel}
        />,
      );

      // The clean note should still appear
      expect(screen.getByText(/some nulls in amount column/i)).toBeInTheDocument();
      // Technical terms should be gone from all notes
      expect(screen.queryByText(/DuckDB/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Parquet/i)).not.toBeInTheDocument();
    });

    it('renders catalog metadata without technical terms alongside normal plan data', () => {
      const planWithTechnicalTerms: SpreadsheetExtractionPlan = {
        ...mockPlan,
        catalogMetadata: {
          projectDescription: 'Extract financial data into analytics-ready Parquet tables for DuckDB.',
          domainNotes: 'Finance',
          dataQualityNotes: ['DuckDB optimized for OLAP queries', 'Parquet files stored in S3'],
        },
      };

      render(
        <ExtractionPlanReview
          plan={planWithTechnicalTerms}
          onApprove={mockOnApprove}
          onCancel={mockOnCancel}
        />,
      );

      // Technical terms absent from the entire rendered output
      expect(screen.queryByText(/DuckDB/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Parquet/i)).not.toBeInTheDocument();
      // Table data from mockPlan still renders correctly
      expect(screen.getByText('orders')).toBeInTheDocument();
      expect(screen.getByText('products')).toBeInTheDocument();
    });
  });
});
