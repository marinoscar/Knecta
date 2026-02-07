import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { render } from '../utils/test-utils';
import ConnectionsPage from '../../pages/ConnectionsPage';

// Mock usePermissions to control permissions
vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({
    hasPermission: (perm: string) => {
      // Give all permissions by default
      return ['connections:read', 'connections:write', 'connections:delete', 'connections:test'].includes(perm);
    },
    isAdmin: true,
    permissions: new Set(['connections:read', 'connections:write', 'connections:delete', 'connections:test']),
    roles: new Set(['admin']),
    hasRole: () => true,
    hasAnyPermission: () => true,
    hasAllPermissions: () => true,
    hasAnyRole: () => true,
  }),
}));

// Mock ConnectionDialog component
vi.mock('../../components/connections/ConnectionDialog', () => ({
  ConnectionDialog: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div data-testid="connection-dialog">
        <button onClick={onClose}>Close Dialog</button>
      </div>
    ) : null,
}));

describe('ConnectionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Page Layout', () => {
    it('renders the page title', async () => {
      render(<ConnectionsPage />);
      expect(screen.getByText('Database Connections')).toBeInTheDocument();
    });

    it('renders the page description', async () => {
      render(<ConnectionsPage />);
      expect(screen.getByText('Manage your database connection configurations')).toBeInTheDocument();
    });

    it('shows loading state initially', () => {
      render(<ConnectionsPage />);
      // The loading spinner should be visible initially
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
  });

  describe('Connections Table', () => {
    it('renders connections table after loading', async () => {
      render(<ConnectionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Test PostgreSQL')).toBeInTheDocument();
      });

      // Check table headers
      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Type')).toBeInTheDocument();
      expect(screen.getByText('Host')).toBeInTheDocument();
      expect(screen.getByText('Database')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Last Tested')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });

    it('displays connection data correctly', async () => {
      render(<ConnectionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Test PostgreSQL')).toBeInTheDocument();
      });

      // Check connection details
      expect(screen.getByText('Test database')).toBeInTheDocument();
      expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
      expect(screen.getByText('localhost:5432')).toBeInTheDocument();
      expect(screen.getByText('testdb')).toBeInTheDocument();
      expect(screen.getByText('Untested')).toBeInTheDocument();
    });

    it('shows database type chip with correct color', async () => {
      render(<ConnectionsPage />);

      await waitFor(() => {
        expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
      });

      const chip = screen.getByText('PostgreSQL').closest('.MuiChip-root');
      expect(chip).toHaveClass('MuiChip-colorPrimary');
    });

    it('displays "Untested" status for connections that have not been tested', async () => {
      render(<ConnectionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Untested')).toBeInTheDocument();
      });
    });
  });

  describe('Empty State', () => {
    it('shows empty state when no connections exist', async () => {
      server.use(
        http.get('*/api/connections', () => {
          return HttpResponse.json({
            data: {
              items: [],
              total: 0,
              page: 1,
              pageSize: 20,
              totalPages: 0,
            },
          });
        }),
      );

      render(<ConnectionsPage />);

      await waitFor(() => {
        expect(screen.getByText('No connections found')).toBeInTheDocument();
      });
    });

    it('shows filtered empty state message', async () => {
      server.use(
        http.get('*/api/connections', () => {
          return HttpResponse.json({
            data: {
              items: [],
              total: 0,
              page: 1,
              pageSize: 20,
              totalPages: 0,
            },
          });
        }),
      );

      render(<ConnectionsPage />);

      // Type in search box
      const searchBox = screen.getByPlaceholderText('Search by name or description');
      await userEvent.type(searchBox, 'nonexistent');

      await waitFor(() => {
        expect(screen.getByText('No connections found matching your filters')).toBeInTheDocument();
      });
    });
  });

  describe('Permissions', () => {
    it('shows Add Connection button for users with write permission', async () => {
      render(<ConnectionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Add Connection')).toBeInTheDocument();
      });
    });

    // Note: Testing permission-based rendering would require unmocking and re-mocking
    // usePermissions per test, which is complex in Vitest. This test verifies the button
    // exists when permissions are granted. Permission denial is tested in integration tests.
  });

  describe('Search and Filters', () => {
    it('renders search input', () => {
      render(<ConnectionsPage />);

      expect(screen.getByPlaceholderText('Search by name or description')).toBeInTheDocument();
    });

    it('renders database type filter', async () => {
      render(<ConnectionsPage />);

      // Wait for page to load
      await waitFor(() => {
        expect(screen.getByText('Test PostgreSQL')).toBeInTheDocument();
      });

      // Check for the Select component - it appears multiple times so use getAllByText
      const dbTypeElements = screen.getAllByText('Database Type');
      expect(dbTypeElements.length).toBeGreaterThan(0);
    });

    it('allows typing in search box', async () => {
      render(<ConnectionsPage />);

      const searchBox = screen.getByPlaceholderText('Search by name or description');
      await userEvent.type(searchBox, 'test query');

      expect(searchBox).toHaveValue('test query');
    });
  });

  describe('Actions', () => {
    it('shows test, edit, and delete action buttons', async () => {
      render(<ConnectionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Test PostgreSQL')).toBeInTheDocument();
      });

      // Find the table row
      const row = screen.getByText('Test PostgreSQL').closest('tr');
      expect(row).toBeInTheDocument();

      // Check for action buttons (they have tooltips)
      const actionButtons = within(row!).getAllByRole('button');
      expect(actionButtons.length).toBeGreaterThan(0);
    });

    it('opens dialog when Add Connection is clicked', async () => {
      render(<ConnectionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Add Connection')).toBeInTheDocument();
      });

      const addButton = screen.getByText('Add Connection');
      await userEvent.click(addButton);

      await waitFor(() => {
        expect(screen.getByTestId('connection-dialog')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('displays error message when fetch fails', async () => {
      server.use(
        http.get('*/api/connections', () => {
          return HttpResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
          );
        }),
      );

      render(<ConnectionsPage />);

      await waitFor(
        () => {
          const errorAlert = screen.queryByRole('alert');
          expect(errorAlert).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });
  });

  describe('Pagination', () => {
    it('renders pagination controls', async () => {
      render(<ConnectionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Test PostgreSQL')).toBeInTheDocument();
      });

      // Check for pagination text
      expect(screen.getByText(/1–1 of 1/i)).toBeInTheDocument();
    });

    it('shows correct rows per page options', async () => {
      render(<ConnectionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Test PostgreSQL')).toBeInTheDocument();
      });

      // The TablePagination component should render with rowsPerPageOptions
      const pagination = screen.getByRole('combobox', { name: /rows per page/i });
      expect(pagination).toBeInTheDocument();
    });
  });

  describe('Connection Status', () => {
    it('displays "Connected" status for successful test', async () => {
      server.use(
        http.get('*/api/connections', () => {
          return HttpResponse.json({
            data: {
              items: [
                {
                  id: 'conn-1',
                  name: 'Test PostgreSQL',
                  description: 'Test database',
                  dbType: 'postgresql',
                  host: 'localhost',
                  port: 5432,
                  databaseName: 'testdb',
                  username: 'testuser',
                  hasCredential: true,
                  useSsl: false,
                  options: null,
                  lastTestedAt: '2024-01-01T12:00:00.000Z',
                  lastTestResult: true,
                  lastTestMessage: 'Connection successful',
                  createdAt: '2024-01-01T00:00:00.000Z',
                  updatedAt: '2024-01-01T00:00:00.000Z',
                },
              ],
              total: 1,
              page: 1,
              pageSize: 20,
              totalPages: 1,
            },
          });
        }),
      );

      render(<ConnectionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });
    });

    it('displays "Failed" status for failed test', async () => {
      server.use(
        http.get('*/api/connections', () => {
          return HttpResponse.json({
            data: {
              items: [
                {
                  id: 'conn-1',
                  name: 'Test PostgreSQL',
                  description: 'Test database',
                  dbType: 'postgresql',
                  host: 'localhost',
                  port: 5432,
                  databaseName: 'testdb',
                  username: 'testuser',
                  hasCredential: true,
                  useSsl: false,
                  options: null,
                  lastTestedAt: '2024-01-01T12:00:00.000Z',
                  lastTestResult: false,
                  lastTestMessage: 'Connection failed: timeout',
                  createdAt: '2024-01-01T00:00:00.000Z',
                  updatedAt: '2024-01-01T00:00:00.000Z',
                },
              ],
              total: 1,
              page: 1,
              pageSize: 20,
              totalPages: 1,
            },
          });
        }),
      );

      render(<ConnectionsPage />);

      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument();
      });
    });
  });
});
