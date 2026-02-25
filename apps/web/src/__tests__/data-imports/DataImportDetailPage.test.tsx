import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { render } from '../utils/test-utils';
import DataImportDetailPage from '../../pages/DataImportDetailPage';
import type { DataImport } from '../../types';

// ------------------------------------------------------------------
// Router mocks
// ------------------------------------------------------------------

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ id: 'import-detail-1' }),
  };
});

// ------------------------------------------------------------------
// Permissions — write + delete granted
// ------------------------------------------------------------------

vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({
    hasPermission: (perm: string) =>
      ['data_imports:read', 'data_imports:write', 'data_imports:delete'].includes(perm),
    hasAnyPermission: () => true,
    hasAllPermissions: () => true,
    hasRole: () => false,
    hasAnyRole: () => false,
    isAdmin: false,
    permissions: new Set(['data_imports:read', 'data_imports:write', 'data_imports:delete']),
    roles: new Set<string>(),
  }),
}));

// ------------------------------------------------------------------
// SSE hook mock — not relevant for these tests
// ------------------------------------------------------------------

vi.mock('../../hooks/useDataImportRun', () => ({
  useDataImportRun: () => ({
    run: null,
    events: [],
    progress: null,
    isStreaming: false,
    error: null,
    streamStartTime: null,
    fetchRun: vi.fn(),
    startStream: vi.fn(),
    stopStream: vi.fn(),
    cancelRun: vi.fn(),
  }),
}));

// ------------------------------------------------------------------
// Data builders
// ------------------------------------------------------------------

function buildImport(overrides: Partial<DataImport> = {}): DataImport {
  return {
    id: 'import-detail-1',
    name: 'Sales Import',
    sourceFileName: 'sales.csv',
    sourceFileType: 'csv',
    sourceFileSizeBytes: 1024 * 512,
    sourceStoragePath: '/imports/sales.csv',
    status: 'ready',
    config: null,
    parseResult: null,
    outputTables: null,
    totalRowCount: 5000,
    totalSizeBytes: 1024 * 256,
    errorMessage: null,
    connectionId: null,
    createdByUserId: 'user-1',
    createdAt: '2026-02-01T10:00:00Z',
    updatedAt: '2026-02-01T10:05:00Z',
    ...overrides,
  };
}

const importWithOutputTables: DataImport = buildImport({
  status: 'ready',
  outputTables: [
    {
      tableName: 'sales_data',
      outputPath: 's3://bucket/sales_data.parquet',
      rowCount: 5000,
      columnCount: 4,
      outputSizeBytes: 1024 * 256,
      connectionId: 'conn-s3-1',
      columns: [
        { name: 'id', type: 'BIGINT' },
        { name: 'amount', type: 'DECIMAL' },
        { name: 'date', type: 'DATE' },
        { name: 'region', type: 'VARCHAR' },
      ],
    },
  ],
  totalRowCount: 5000,
  totalSizeBytes: 1024 * 256,
});

// ------------------------------------------------------------------
// Test suite
// ------------------------------------------------------------------

describe('DataImportDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    server.use(
      http.get('*/api/data-imports/import-detail-1', () =>
        HttpResponse.json({ data: buildImport() }),
      ),
    );
  });

  // ================================================================
  // Loading state
  // ================================================================

  describe('Loading state', () => {
    it('shows a loading spinner while fetching import details', async () => {
      server.use(
        http.get('*/api/data-imports/import-detail-1', async () => {
          await new Promise((r) => setTimeout(r, 200));
          return HttpResponse.json({ data: buildImport() });
        }),
      );

      render(<DataImportDetailPage />);

      expect(screen.getByRole('progressbar')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });
    });
  });

  // ================================================================
  // Page header
  // ================================================================

  describe('Page header', () => {
    it('renders the import name as heading', async () => {
      render(<DataImportDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Sales Import' })).toBeInTheDocument();
      });
    });

    it('renders source file name', async () => {
      render(<DataImportDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('sales.csv')).toBeInTheDocument();
      });
    });

    it('renders file type chip', async () => {
      render(<DataImportDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('CSV')).toBeInTheDocument();
      });
    });

    it('renders Back button', async () => {
      render(<DataImportDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
      });
    });

    it('navigates to /data-imports when Back is clicked', async () => {
      const user = userEvent.setup();
      render(<DataImportDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /back/i }));

      expect(mockNavigate).toHaveBeenCalledWith('/data-imports');
    });
  });

  // ================================================================
  // Tabs
  // ================================================================

  describe('Tabs', () => {
    it('renders Tables and Config tabs', async () => {
      render(<DataImportDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: 'Tables' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Config' })).toBeInTheDocument();
      });
    });

    it('does not render a Runs tab', async () => {
      render(<DataImportDetailPage />);

      await waitFor(() => {
        // Runs tab was removed from the detail page
        expect(screen.queryByRole('tab', { name: /runs/i })).not.toBeInTheDocument();
      });
    });

    it('Tables tab is selected by default', async () => {
      render(<DataImportDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: 'Tables' })).toHaveAttribute(
          'aria-selected',
          'true',
        );
      });
    });

    it('switches to Config tab', async () => {
      const user = userEvent.setup();
      render(<DataImportDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: 'Config' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('tab', { name: 'Config' }));

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: 'Config' })).toHaveAttribute(
          'aria-selected',
          'true',
        );
      });
    });
  });

  // ================================================================
  // Run Import button visibility
  // ================================================================

  describe('Run Import button', () => {
    it('shows "Run Import" button for imports in "ready" status', async () => {
      server.use(
        http.get('*/api/data-imports/import-detail-1', () =>
          HttpResponse.json({ data: buildImport({ status: 'ready' }) }),
        ),
      );

      render(<DataImportDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /run import/i })).toBeInTheDocument();
      });
    });

    it('shows "Run Import" button for imports in "draft" status', async () => {
      server.use(
        http.get('*/api/data-imports/import-detail-1', () =>
          HttpResponse.json({ data: buildImport({ status: 'draft' }) }),
        ),
      );

      render(<DataImportDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /run import/i })).toBeInTheDocument();
      });
    });

    it('shows "Run Import" button for imports in "failed" status', async () => {
      server.use(
        http.get('*/api/data-imports/import-detail-1', () =>
          HttpResponse.json({
            data: buildImport({ status: 'failed', errorMessage: 'Pipeline error' }),
          }),
        ),
      );

      render(<DataImportDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /run import/i })).toBeInTheDocument();
      });
    });

    it('does NOT show "Run Import" button when import is actively importing', async () => {
      server.use(
        http.get('*/api/data-imports/import-detail-1', () =>
          HttpResponse.json({ data: buildImport({ status: 'importing' }) }),
        ),
      );

      render(<DataImportDetailPage />);

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /run import/i })).not.toBeInTheDocument();
      });
    });
  });

  // ================================================================
  // Stats cards
  // ================================================================

  describe('Stats cards', () => {
    it('shows total row count stat', async () => {
      render(<DataImportDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('5,000')).toBeInTheDocument();
        expect(screen.getByText('Total Rows')).toBeInTheDocument();
      });
    });

    it('shows Source Size stat', async () => {
      render(<DataImportDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Source Size')).toBeInTheDocument();
      });
    });

    it('shows Output Tables stat', async () => {
      render(<DataImportDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Output Tables')).toBeInTheDocument();
      });
    });
  });

  // ================================================================
  // Output Tables tab content
  // ================================================================

  describe('Output Tables tab content', () => {
    it('shows placeholder text when no output tables exist yet', async () => {
      server.use(
        http.get('*/api/data-imports/import-detail-1', () =>
          HttpResponse.json({
            data: buildImport({ status: 'draft', outputTables: null }),
          }),
        ),
      );

      render(<DataImportDetailPage />);

      await waitFor(() => {
        expect(
          screen.getByText(/output tables will appear here after the import completes/i),
        ).toBeInTheDocument();
      });
    });

    it('renders output tables in the table when they exist', async () => {
      server.use(
        http.get('*/api/data-imports/import-detail-1', () =>
          HttpResponse.json({ data: importWithOutputTables }),
        ),
      );

      render(<DataImportDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('sales_data')).toBeInTheDocument();
      });

      // Check table headers
      const tableEl = screen.getByRole('table');
      expect(within(tableEl).getByRole('columnheader', { name: 'Table Name' })).toBeInTheDocument();
      expect(within(tableEl).getByRole('columnheader', { name: 'Rows' })).toBeInTheDocument();
      // The table has two "Columns" headers (count + chip list), so use getAllBy
      const colHeaders = within(tableEl).getAllByRole('columnheader', { name: 'Columns' });
      expect(colHeaders.length).toBeGreaterThanOrEqual(1);
    });

    it('renders column chips for output table', async () => {
      server.use(
        http.get('*/api/data-imports/import-detail-1', () =>
          HttpResponse.json({ data: importWithOutputTables }),
        ),
      );

      render(<DataImportDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('id: BIGINT')).toBeInTheDocument();
        expect(screen.getByText('amount: DECIMAL')).toBeInTheDocument();
      });
    });
  });

  // ================================================================
  // Error state
  // ================================================================

  describe('Error state', () => {
    it('shows error alert when failed import has an error message', async () => {
      server.use(
        http.get('*/api/data-imports/import-detail-1', () =>
          HttpResponse.json({
            data: buildImport({
              status: 'failed',
              errorMessage: 'DuckDB conversion error',
            }),
          }),
        ),
      );

      render(<DataImportDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/import failed/i)).toBeInTheDocument();
        expect(screen.getByText('DuckDB conversion error')).toBeInTheDocument();
      });
    });

    it('shows error page when API returns 500', async () => {
      server.use(
        http.get('*/api/data-imports/import-detail-1', () =>
          HttpResponse.json({ message: 'Internal server error' }, { status: 500 }),
        ),
      );

      render(<DataImportDetailPage />);

      await waitFor(() => {
        // Falls into the error/not-found render path
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });
  });

  // ================================================================
  // Delete flow
  // ================================================================

  describe('Delete flow', () => {
    it('opens delete confirmation dialog when Delete button is clicked', async () => {
      const user = userEvent.setup();
      render(<DataImportDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete/i }));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('Delete Import')).toBeInTheDocument();
      });
    });

    it('calls delete API on confirmation and navigates away', async () => {
      const user = userEvent.setup();
      let deleteCalled = false;

      server.use(
        http.delete('*/api/data-imports/import-detail-1', () => {
          deleteCalled = true;
          return new HttpResponse(null, { status: 204 });
        }),
      );

      render(<DataImportDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete/i }));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /delete/i }));

      await waitFor(() => {
        expect(deleteCalled).toBe(true);
        expect(mockNavigate).toHaveBeenCalledWith('/data-imports');
      });
    });

    it('closes dialog without deleting when Cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<DataImportDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete/i }));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /cancel/i }));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });
});
