import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { render } from '../utils/test-utils';
import DataImportsPage from '../../pages/DataImportsPage';
import type { DataImport } from '../../types';

// Mock useNavigate so navigation calls can be asserted
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock usePermissions with full data_imports permissions
vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({
    hasPermission: (perm: string) =>
      [
        'data_imports:read',
        'data_imports:write',
        'data_imports:delete',
      ].includes(perm),
    hasAnyPermission: () => true,
    hasAllPermissions: () => true,
    hasRole: () => false,
    hasAnyRole: () => false,
    isAdmin: false,
    permissions: new Set([
      'data_imports:read',
      'data_imports:write',
      'data_imports:delete',
    ]),
    roles: new Set<string>(),
  }),
}));

// Helper builders
function buildImport(overrides: Partial<DataImport> = {}): DataImport {
  return {
    id: 'import-1',
    name: 'Sales Data',
    sourceFileName: 'sales_2026.csv',
    sourceFileType: 'csv',
    sourceFileSizeBytes: 1024 * 512,
    sourceStoragePath: '/imports/sales_2026.csv',
    status: 'ready',
    config: null,
    parseResult: null,
    outputTables: null,
    totalRowCount: 5000,
    totalSizeBytes: 1024 * 256,
    errorMessage: null,
    createdByUserId: 'user-1',
    createdAt: '2026-02-01T10:00:00Z',
    updatedAt: '2026-02-01T10:05:00Z',
    ...overrides,
  };
}

const emptyImportsResponse = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  totalPages: 0,
};

describe('DataImportsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    server.use(
      http.get('*/api/data-imports', () =>
        HttpResponse.json({ data: emptyImportsResponse }),
      ),
    );
  });

  describe('Page layout', () => {
    it('renders the page title', async () => {
      render(<DataImportsPage />);

      await waitFor(() => {
        expect(screen.getByText('Data Import')).toBeInTheDocument();
      });
    });

    it('renders the subtitle describing the feature', async () => {
      render(<DataImportsPage />);

      await waitFor(() => {
        expect(
          screen.getByText(/upload csv or excel files/i),
        ).toBeInTheDocument();
      });
    });

    it('does not render any tab navigation (no Imports/Runs tabs)', async () => {
      render(<DataImportsPage />);

      await waitFor(() => {
        // The simplified DataImportsPage has no tab bar — only a flat list view
        expect(screen.queryByRole('tab')).not.toBeInTheDocument();
      });
    });

    it('renders the New Import button', async () => {
      render(<DataImportsPage />);

      await waitFor(() => {
        expect(screen.getByText('New Import')).toBeInTheDocument();
      });
    });

    it('renders the Search text field', async () => {
      render(<DataImportsPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/search/i)).toBeInTheDocument();
      });
    });

    it('renders the Status filter select', async () => {
      render(<DataImportsPage />);

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });
    });
  });

  describe('Empty state', () => {
    it('shows empty state message when there are no imports', async () => {
      render(<DataImportsPage />);

      await waitFor(() => {
        expect(
          screen.getByText(/no imports yet/i),
        ).toBeInTheDocument();
      });
    });

    it('does not show table when list is empty', async () => {
      render(<DataImportsPage />);

      await waitFor(() => {
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
      });
    });

    it('shows filter-specific empty message when filters are active', async () => {
      const user = userEvent.setup();
      render(<DataImportsPage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/search/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/search/i), 'nonexistent');

      await waitFor(() => {
        expect(
          screen.getByText(/no imports found matching your filters/i),
        ).toBeInTheDocument();
      });
    });
  });

  describe('Loading state', () => {
    it('shows a loading spinner while fetching imports', async () => {
      server.use(
        http.get('*/api/data-imports', async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return HttpResponse.json({ data: emptyImportsResponse });
        }),
      );

      render(<DataImportsPage />);

      expect(screen.getByRole('progressbar')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });
    });
  });

  describe('Imports list', () => {
    beforeEach(() => {
      server.use(
        http.get('*/api/data-imports', () =>
          HttpResponse.json({
            data: {
              items: [buildImport()],
              total: 1,
              page: 1,
              pageSize: 20,
              totalPages: 1,
            },
          }),
        ),
      );
    });

    it('renders import name in the table', async () => {
      render(<DataImportsPage />);

      await waitFor(() => {
        expect(screen.getByText('Sales Data')).toBeInTheDocument();
      });
    });

    it('renders source file name in the table', async () => {
      render(<DataImportsPage />);

      await waitFor(() => {
        expect(screen.getByText('sales_2026.csv')).toBeInTheDocument();
      });
    });

    it('renders file type chip', async () => {
      render(<DataImportsPage />);

      await waitFor(() => {
        expect(screen.getByText('CSV')).toBeInTheDocument();
      });
    });

    it('renders status chip for each import', async () => {
      render(<DataImportsPage />);

      await waitFor(() => {
        expect(screen.getByText('Ready')).toBeInTheDocument();
      });
    });

    it('renders row count formatted with locale', async () => {
      render(<DataImportsPage />);

      await waitFor(() => {
        expect(screen.getByText('5,000')).toBeInTheDocument();
      });
    });

    it('renders table column headers', async () => {
      render(<DataImportsPage />);

      await waitFor(() => {
        expect(
          screen.getByRole('columnheader', { name: 'Name' }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole('columnheader', { name: 'Source File' }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole('columnheader', { name: 'Type' }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole('columnheader', { name: 'Rows' }),
        ).toBeInTheDocument();
      });
    });

    it('renders view action icon button for each import', async () => {
      render(<DataImportsPage />);

      await waitFor(() => {
        const row = screen.getByText('Sales Data').closest('tr')!;
        const buttons = within(row).getAllByRole('button');
        expect(buttons.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Navigation', () => {
    it('navigates to /data-imports/new when New Import button is clicked', async () => {
      const user = userEvent.setup();
      render(<DataImportsPage />);

      await waitFor(() => {
        expect(screen.getByText('New Import')).toBeInTheDocument();
      });

      await user.click(screen.getByText('New Import'));

      expect(mockNavigate).toHaveBeenCalledWith('/data-imports/new');
    });

    it('navigates to import detail when view button is clicked', async () => {
      const user = userEvent.setup();

      server.use(
        http.get('*/api/data-imports', () =>
          HttpResponse.json({
            data: {
              items: [buildImport({ id: 'import-123', name: 'My Import' })],
              total: 1,
              page: 1,
              pageSize: 20,
              totalPages: 1,
            },
          }),
        ),
      );

      render(<DataImportsPage />);

      await waitFor(() => {
        expect(screen.getByText('My Import')).toBeInTheDocument();
      });

      const row = screen.getByText('My Import').closest('tr')!;
      const rowButtons = within(row).getAllByRole('button');
      await user.click(rowButtons[0]);

      expect(mockNavigate).toHaveBeenCalledWith('/data-imports/import-123');
    });
  });

  describe('Delete flow', () => {
    beforeEach(() => {
      server.use(
        http.get('*/api/data-imports', () =>
          HttpResponse.json({
            data: {
              items: [buildImport({ id: 'import-del', name: 'To Delete' })],
              total: 1,
              page: 1,
              pageSize: 20,
              totalPages: 1,
            },
          }),
        ),
        http.delete('*/api/data-imports/import-del', () =>
          new HttpResponse(null, { status: 204 }),
        ),
      );
    });

    it('opens confirmation dialog when delete button is clicked', async () => {
      const user = userEvent.setup();
      render(<DataImportsPage />);

      await waitFor(() => {
        expect(screen.getByText('To Delete')).toBeInTheDocument();
      });

      const row = screen.getByText('To Delete').closest('tr')!;
      const rowButtons = within(row).getAllByRole('button');
      await user.click(rowButtons[rowButtons.length - 1]);

      await waitFor(() => {
        expect(screen.getByText('Delete Import')).toBeInTheDocument();
      });

      expect(
        screen.getByText(/are you sure you want to delete.*"To Delete"/i),
      ).toBeInTheDocument();
    });

    it('closes dialog without deleting when Cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<DataImportsPage />);

      await waitFor(() => {
        expect(screen.getByText('To Delete')).toBeInTheDocument();
      });

      const row = screen.getByText('To Delete').closest('tr')!;
      const rowButtons = within(row).getAllByRole('button');
      await user.click(rowButtons[rowButtons.length - 1]);

      await waitFor(() => {
        expect(screen.getByText('Delete Import')).toBeInTheDocument();
      });

      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /cancel/i }));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('calls delete API and shows success message on confirm', async () => {
      const user = userEvent.setup();
      let deleteCalled = false;

      server.use(
        http.delete('*/api/data-imports/import-del', () => {
          deleteCalled = true;
          return new HttpResponse(null, { status: 204 });
        }),
      );

      render(<DataImportsPage />);

      await waitFor(() => {
        expect(screen.getByText('To Delete')).toBeInTheDocument();
      });

      const row = screen.getByText('To Delete').closest('tr')!;
      const rowButtons = within(row).getAllByRole('button');
      await user.click(rowButtons[rowButtons.length - 1]);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /delete/i }));

      await waitFor(() => {
        expect(deleteCalled).toBe(true);
      });
    });
  });

  describe('Error state', () => {
    it('shows an error alert when the API call fails', async () => {
      server.use(
        http.get('*/api/data-imports', () =>
          HttpResponse.json({ message: 'Internal server error' }, { status: 500 }),
        ),
      );

      render(<DataImportsPage />);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });
  });

  describe('No Runs tab', () => {
    it('does not show any Runs-related tab or runs table', async () => {
      render(<DataImportsPage />);

      await waitFor(() => {
        // The simplified page shows only the flat import list with no Runs tab
        expect(screen.queryByRole('tab', { name: /runs/i })).not.toBeInTheDocument();
      });
    });

    it('does not render a runs-specific column header', async () => {
      server.use(
        http.get('*/api/data-imports', () =>
          HttpResponse.json({
            data: {
              items: [buildImport()],
              total: 1,
              page: 1,
              pageSize: 20,
              totalPages: 1,
            },
          }),
        ),
      );

      render(<DataImportsPage />);

      await waitFor(() => {
        expect(screen.getByText('Sales Data')).toBeInTheDocument();
      });

      // Runs tables typically have "Duration" or "Import" column headers — neither should exist here
      expect(screen.queryByRole('columnheader', { name: 'Duration' })).not.toBeInTheDocument();
    });
  });
});
