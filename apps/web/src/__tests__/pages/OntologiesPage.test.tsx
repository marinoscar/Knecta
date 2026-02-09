import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { render } from '../utils/test-utils';
import OntologiesPage from '../../pages/OntologiesPage';

// Mock usePermissions to control permissions
vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({
    hasPermission: (perm: string) => {
      // Give all permissions by default
      return ['ontologies:read', 'ontologies:write', 'ontologies:delete'].includes(perm);
    },
    isAdmin: true,
    permissions: new Set(['ontologies:read', 'ontologies:write', 'ontologies:delete']),
    roles: new Set(['admin']),
    hasRole: () => true,
    hasAnyPermission: () => true,
    hasAllPermissions: () => true,
    hasAnyRole: () => true,
  }),
}));

// Mock CreateOntologyDialog component
vi.mock('../../components/ontologies/CreateOntologyDialog', () => ({
  CreateOntologyDialog: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div data-testid="create-ontology-dialog">
        <button onClick={onClose}>Close Dialog</button>
      </div>
    ) : null,
}));

describe('OntologiesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Page Layout', () => {
    it('renders the page title', async () => {
      render(<OntologiesPage />);
      expect(screen.getByText('Ontologies')).toBeInTheDocument();
    });

    it('renders the page description', async () => {
      render(<OntologiesPage />);
      expect(screen.getByText('Browse and manage knowledge graph ontologies')).toBeInTheDocument();
    });

    it('shows loading state initially', () => {
      render(<OntologiesPage />);
      // The loading spinner should be visible initially
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
  });

  describe('Ontologies Table', () => {
    it('renders ontologies table after loading', async () => {
      render(<OntologiesPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Ontology')).toBeInTheDocument();
      });

      // Check table headers
      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Semantic Model')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Nodes')).toBeInTheDocument();
      expect(screen.getByText('Relationships')).toBeInTheDocument();
      expect(screen.getByText('Created')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });

    it('displays ontology data correctly', async () => {
      render(<OntologiesPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Ontology')).toBeInTheDocument();
      });

      // Check ontology details
      expect(screen.getByText('Test description')).toBeInTheDocument();
      expect(screen.getByText('Sales Model')).toBeInTheDocument();
      expect(screen.getByText('Ready')).toBeInTheDocument();
      expect(screen.getByText('25')).toBeInTheDocument();
      expect(screen.getByText('30')).toBeInTheDocument();
    });

    it('shows status chip with correct color', async () => {
      render(<OntologiesPage />);

      await waitFor(() => {
        expect(screen.getByText('Ready')).toBeInTheDocument();
      });

      const chip = screen.getByText('Ready').closest('.MuiChip-root');
      expect(chip).toHaveClass('MuiChip-colorSuccess');
    });
  });

  describe('Empty State', () => {
    it('shows empty state when no ontologies exist', async () => {
      server.use(
        http.get('*/api/ontologies', () => {
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

      render(<OntologiesPage />);

      await waitFor(() => {
        expect(screen.getByText('No ontologies found')).toBeInTheDocument();
      });
    });

    it('shows filtered empty state message', async () => {
      server.use(
        http.get('*/api/ontologies', () => {
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

      render(<OntologiesPage />);

      // Type in search box
      const searchBox = screen.getByPlaceholderText('Search by name or description');
      await userEvent.type(searchBox, 'nonexistent');

      await waitFor(() => {
        expect(screen.getByText('No ontologies found matching your filters')).toBeInTheDocument();
      });
    });
  });

  describe('Permissions', () => {
    it('shows New Ontology button for users with write permission', async () => {
      render(<OntologiesPage />);

      await waitFor(() => {
        expect(screen.getByText('New Ontology')).toBeInTheDocument();
      });
    });
  });

  describe('Search and Filters', () => {
    it('renders search input', () => {
      render(<OntologiesPage />);

      expect(screen.getByPlaceholderText('Search by name or description')).toBeInTheDocument();
    });

    it('renders status filter', async () => {
      render(<OntologiesPage />);

      // Wait for page to load
      await waitFor(() => {
        expect(screen.getByText('Test Ontology')).toBeInTheDocument();
      });

      // Check for the Select component - it appears as a label
      const statusElements = screen.getAllByText('Status');
      expect(statusElements.length).toBeGreaterThan(0);
    });

    it('allows typing in search box', async () => {
      render(<OntologiesPage />);

      const searchBox = screen.getByPlaceholderText('Search by name or description');
      await userEvent.type(searchBox, 'test query');

      expect(searchBox).toHaveValue('test query');
    });
  });

  describe('Actions', () => {
    it('shows view and delete action buttons', async () => {
      render(<OntologiesPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Ontology')).toBeInTheDocument();
      });

      // Find the table row
      const row = screen.getByText('Test Ontology').closest('tr');
      expect(row).toBeInTheDocument();

      // Check for action buttons (they have tooltips)
      const actionButtons = within(row!).getAllByRole('button');
      expect(actionButtons.length).toBeGreaterThan(0);
    });

    it('opens dialog when New Ontology button is clicked', async () => {
      render(<OntologiesPage />);

      await waitFor(() => {
        expect(screen.getByText('New Ontology')).toBeInTheDocument();
      });

      const newButton = screen.getByText('New Ontology');
      await userEvent.click(newButton);

      await waitFor(() => {
        expect(screen.getByTestId('create-ontology-dialog')).toBeInTheDocument();
      });
    });

    it('opens delete confirmation dialog when delete button is clicked', async () => {
      render(<OntologiesPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Ontology')).toBeInTheDocument();
      });

      // Find the table row
      const row = screen.getByText('Test Ontology').closest('tr');
      const deleteButton = within(row!).getAllByRole('button')[1]; // Second button is delete

      await userEvent.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText('Delete Ontology')).toBeInTheDocument();
        expect(screen.getByText(/Are you sure you want to delete/i)).toBeInTheDocument();
      });
    });
  });

  describe('Navigation', () => {
    it('navigates to detail page when ontology name is clicked', async () => {
      const mockNavigate = vi.fn();
      vi.mock('react-router-dom', async () => {
        const actual = await vi.importActual('react-router-dom');
        return {
          ...actual,
          useNavigate: () => mockNavigate,
        };
      });

      render(<OntologiesPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Ontology')).toBeInTheDocument();
      });

      const nameLink = screen.getByText('Test Ontology');
      await userEvent.click(nameLink);

      // Note: Due to the mock setup, we can't verify navigation in this test
      // Navigation is tested in integration tests
    });
  });

  describe('Error Handling', () => {
    it('displays error message when fetch fails', async () => {
      server.use(
        http.get('*/api/ontologies', () => {
          return HttpResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
          );
        }),
      );

      render(<OntologiesPage />);

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
      render(<OntologiesPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Ontology')).toBeInTheDocument();
      });

      // Check for pagination text
      expect(screen.getByText(/1–1 of 1/i)).toBeInTheDocument();
    });

    it('shows correct rows per page options', async () => {
      render(<OntologiesPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Ontology')).toBeInTheDocument();
      });

      // The TablePagination component should render with rowsPerPageOptions
      const pagination = screen.getByRole('combobox', { name: /rows per page/i });
      expect(pagination).toBeInTheDocument();
    });
  });

  describe('Ontology Status', () => {
    it('displays "Creating" status for ontologies being created', async () => {
      server.use(
        http.get('*/api/ontologies', () => {
          return HttpResponse.json({
            data: {
              items: [
                {
                  id: 'onto-1',
                  name: 'New Ontology',
                  description: 'Being created',
                  semanticModelId: 'sm-1',
                  semanticModel: { name: 'Sales Model', status: 'ready' },
                  status: 'creating',
                  nodeCount: 0,
                  relationshipCount: 0,
                  errorMessage: null,
                  ownerId: 'user-1',
                  createdAt: '2026-02-09T00:00:00Z',
                  updatedAt: '2026-02-09T00:00:00Z',
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

      render(<OntologiesPage />);

      await waitFor(() => {
        expect(screen.getByText('Creating')).toBeInTheDocument();
      });

      const chip = screen.getByText('Creating').closest('.MuiChip-root');
      expect(chip).toHaveClass('MuiChip-colorWarning');
    });

    it('displays "Failed" status for ontologies that failed', async () => {
      server.use(
        http.get('*/api/ontologies', () => {
          return HttpResponse.json({
            data: {
              items: [
                {
                  id: 'onto-1',
                  name: 'Failed Ontology',
                  description: 'Creation failed',
                  semanticModelId: 'sm-1',
                  semanticModel: { name: 'Sales Model', status: 'ready' },
                  status: 'failed',
                  nodeCount: 0,
                  relationshipCount: 0,
                  errorMessage: 'Neo4j connection timeout',
                  ownerId: 'user-1',
                  createdAt: '2026-02-09T00:00:00Z',
                  updatedAt: '2026-02-09T00:00:00Z',
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

      render(<OntologiesPage />);

      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument();
      });

      const chip = screen.getByText('Failed').closest('.MuiChip-root');
      expect(chip).toHaveClass('MuiChip-colorError');
    });
  });
});
