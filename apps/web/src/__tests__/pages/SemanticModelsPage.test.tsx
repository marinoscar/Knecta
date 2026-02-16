import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { render } from '../utils/test-utils';
import SemanticModelsPage from '../../pages/SemanticModelsPage';

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock usePermissions to control permissions
vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({
    hasPermission: (perm: string) => {
      // Give all permissions by default
      return ['semantic_models:read', 'semantic_models:generate', 'semantic_models:delete'].includes(perm);
    },
    isAdmin: true,
    permissions: new Set(['semantic_models:read', 'semantic_models:generate', 'semantic_models:delete']),
    roles: new Set(['admin']),
    hasRole: () => true,
    hasAnyPermission: () => true,
    hasAllPermissions: () => true,
    hasAnyRole: () => true,
  }),
}));

describe('SemanticModelsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock handler for semantic models
    server.use(
      http.get('*/api/semantic-models', () => {
        return HttpResponse.json({
          data: {
            items: [
              {
                id: 'model-1',
                name: 'Test Model',
                description: 'Test description',
                connectionId: 'conn-1',
                databaseName: 'testdb',
                status: 'ready',
                model: { tables: [], metrics: [] },
                modelVersion: 1,
                tableCount: 5,
                fieldCount: 20,
                relationshipCount: 3,
                metricCount: 10,
                createdByUserId: 'user-1',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-15T10:30:00Z',
                connection: { name: 'Test Connection', dbType: 'postgresql' },
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
  });

  describe('Page Layout', () => {
    it('renders the page title', async () => {
      render(<SemanticModelsPage />);
      expect(screen.getByText('Semantic Models')).toBeInTheDocument();
    });

    it('renders the page description', async () => {
      render(<SemanticModelsPage />);
      expect(screen.getByText('Generate and manage semantic models for natural language queries')).toBeInTheDocument();
    });

    it('shows loading state initially', () => {
      render(<SemanticModelsPage />);
      // The loading spinner should be visible initially
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
  });

  describe('Semantic Models Table', () => {
    it('renders table after loading', async () => {
      render(<SemanticModelsPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Model')).toBeInTheDocument();
      });

      // Check table headers - use getAllByText for Status and getByRole for table
      const table = screen.getByRole('table');
      expect(within(table).getByText('Name')).toBeInTheDocument();
      expect(within(table).getByText('Connection')).toBeInTheDocument();
      expect(within(table).getByText('Database')).toBeInTheDocument();
      expect(within(table).getByText('Status')).toBeInTheDocument();
      expect(within(table).getByText('Tables')).toBeInTheDocument();
      expect(within(table).getByText('Fields')).toBeInTheDocument();
      expect(within(table).getByText('Updated')).toBeInTheDocument();
      expect(within(table).getByText('Actions')).toBeInTheDocument();
    });

    it('displays model data correctly', async () => {
      render(<SemanticModelsPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Model')).toBeInTheDocument();
      });

      // Check model details
      expect(screen.getByText('Test description')).toBeInTheDocument();
      expect(screen.getByText('Test Connection')).toBeInTheDocument();
      expect(screen.getByText('testdb')).toBeInTheDocument();
      expect(screen.getByText('Ready')).toBeInTheDocument();

      // Find the table and verify counts within it
      const table = screen.getByRole('table');
      const tableBody = within(table).getAllByRole('rowgroup')[1]; // Second rowgroup is tbody
      expect(within(tableBody).getByText('5')).toBeInTheDocument(); // tableCount
      expect(within(tableBody).getAllByText('20')[0]).toBeInTheDocument(); // fieldCount (first occurrence)
    });

    it('shows status chip with correct color for ready status', async () => {
      render(<SemanticModelsPage />);

      await waitFor(() => {
        expect(screen.getByText('Ready')).toBeInTheDocument();
      });

      const chip = screen.getByText('Ready').closest('.MuiChip-root');
      expect(chip).toHaveClass('MuiChip-colorSuccess');
    });

    it('shows status chip with correct color for draft status', async () => {
      server.use(
        http.get('*/api/semantic-models', () => {
          return HttpResponse.json({
            data: {
              items: [
                {
                  id: 'model-1',
                  name: 'Draft Model',
                  description: null,
                  connectionId: 'conn-1',
                  databaseName: 'testdb',
                  status: 'draft',
                  model: null,
                  modelVersion: 1,
                  tableCount: 0,
                  fieldCount: 0,
                  relationshipCount: 0,
                  metricCount: 0,
                  createdByUserId: 'user-1',
                  createdAt: '2024-01-01T00:00:00Z',
                  updatedAt: '2024-01-01T00:00:00Z',
                  connection: { name: 'Test Connection', dbType: 'postgresql' },
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

      render(<SemanticModelsPage />);

      await waitFor(() => {
        expect(screen.getByText('Draft')).toBeInTheDocument();
      });

      const chip = screen.getByText('Draft').closest('.MuiChip-root');
      expect(chip).toHaveClass('MuiChip-colorDefault');
    });

    it('shows status chip with correct color for generating status', async () => {
      server.use(
        http.get('*/api/semantic-models', () => {
          return HttpResponse.json({
            data: {
              items: [
                {
                  id: 'model-1',
                  name: 'Generating Model',
                  description: null,
                  connectionId: 'conn-1',
                  databaseName: 'testdb',
                  status: 'generating',
                  model: null,
                  modelVersion: 1,
                  tableCount: 0,
                  fieldCount: 0,
                  relationshipCount: 0,
                  metricCount: 0,
                  createdByUserId: 'user-1',
                  createdAt: '2024-01-01T00:00:00Z',
                  updatedAt: '2024-01-01T00:00:00Z',
                  connection: { name: 'Test Connection', dbType: 'postgresql' },
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

      render(<SemanticModelsPage />);

      await waitFor(() => {
        expect(screen.getByText('Generating')).toBeInTheDocument();
      });

      const chip = screen.getByText('Generating').closest('.MuiChip-root');
      expect(chip).toHaveClass('MuiChip-colorWarning');
    });

    it('shows status chip with correct color for failed status', async () => {
      server.use(
        http.get('*/api/semantic-models', () => {
          return HttpResponse.json({
            data: {
              items: [
                {
                  id: 'model-1',
                  name: 'Failed Model',
                  description: null,
                  connectionId: 'conn-1',
                  databaseName: 'testdb',
                  status: 'failed',
                  model: null,
                  modelVersion: 1,
                  tableCount: 0,
                  fieldCount: 0,
                  relationshipCount: 0,
                  metricCount: 0,
                  createdByUserId: 'user-1',
                  createdAt: '2024-01-01T00:00:00Z',
                  updatedAt: '2024-01-01T00:00:00Z',
                  connection: { name: 'Test Connection', dbType: 'postgresql' },
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

      render(<SemanticModelsPage />);

      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument();
      });

      const chip = screen.getByText('Failed').closest('.MuiChip-root');
      expect(chip).toHaveClass('MuiChip-colorError');
    });
  });

  describe('Empty State', () => {
    it('shows empty state when no models exist', async () => {
      server.use(
        http.get('*/api/semantic-models', () => {
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

      render(<SemanticModelsPage />);

      await waitFor(() => {
        expect(screen.getByText('No semantic models found')).toBeInTheDocument();
      });
    });

    it('shows filtered empty state message', async () => {
      server.use(
        http.get('*/api/semantic-models', () => {
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

      render(<SemanticModelsPage />);

      // Type in search box
      const searchBox = screen.getByPlaceholderText('Search by name or description');
      await userEvent.type(searchBox, 'nonexistent');

      await waitFor(() => {
        expect(screen.getByText('No semantic models found matching your filters')).toBeInTheDocument();
      });
    });
  });

  describe('Permissions', () => {
    it('shows New Model button for users with generate permission', async () => {
      render(<SemanticModelsPage />);

      await waitFor(() => {
        expect(screen.getByText('New Model')).toBeInTheDocument();
      });
    });

    // Note: Testing permission denial would require re-mocking usePermissions per test,
    // which is complex in Vitest. Permission denial is tested in integration tests.
    // This test verifies the button exists when permissions are granted.
  });

  describe('Search and Filters', () => {
    it('renders search input', () => {
      render(<SemanticModelsPage />);

      expect(screen.getByPlaceholderText('Search by name or description')).toBeInTheDocument();
    });

    it('renders status filter dropdown', async () => {
      render(<SemanticModelsPage />);

      // Wait for page to load
      await waitFor(() => {
        expect(screen.getByText('Test Model')).toBeInTheDocument();
      });

      // Check for the Select component - find it by role combobox
      const comboboxes = screen.getAllByRole('combobox');
      const statusSelect = comboboxes.find(cb =>
        cb.closest('.MuiFormControl-root')?.querySelector('[class*="MuiInputLabel"]')?.textContent === 'Status'
      );
      expect(statusSelect).toBeTruthy();
    });

    it('allows typing in search box', async () => {
      render(<SemanticModelsPage />);

      const searchBox = screen.getByPlaceholderText('Search by name or description');
      await userEvent.type(searchBox, 'test query');

      expect(searchBox).toHaveValue('test query');
    });

    it('allows selecting status filter', async () => {
      render(<SemanticModelsPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Model')).toBeInTheDocument();
      });

      // Find the status select by its role (it's a combobox)
      const statusSelects = screen.getAllByRole('combobox');
      const statusSelect = statusSelects.find(select =>
        select.closest('.MuiFormControl-root')?.querySelector('[class*="MuiInputLabel"]')?.textContent === 'Status'
      );
      expect(statusSelect).toBeTruthy();

      await userEvent.click(statusSelect!);

      // Check for status options in dropdown
      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Draft' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Generating' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Ready' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Failed' })).toBeInTheDocument();
      });
    });
  });

  describe('Actions', () => {
    it('shows view and delete action buttons', async () => {
      render(<SemanticModelsPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Model')).toBeInTheDocument();
      });

      // Find the table row
      const row = screen.getByText('Test Model').closest('tr');
      expect(row).toBeInTheDocument();

      // Check for action buttons (they have tooltips)
      const actionButtons = within(row!).getAllByRole('button');
      expect(actionButtons.length).toBeGreaterThan(0);
    });

    it('shows export button only for ready models', async () => {
      render(<SemanticModelsPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Model')).toBeInTheDocument();
      });

      // Find the export button (Download icon)
      const exportButtons = screen.getAllByRole('button').filter(
        button => button.querySelector('[data-testid="DownloadIcon"]')
      );
      expect(exportButtons.length).toBeGreaterThan(0);
    });

    it('hides export button for non-ready models', async () => {
      server.use(
        http.get('*/api/semantic-models', () => {
          return HttpResponse.json({
            data: {
              items: [
                {
                  id: 'model-1',
                  name: 'Draft Model',
                  description: null,
                  connectionId: 'conn-1',
                  databaseName: 'testdb',
                  status: 'draft',
                  model: null,
                  modelVersion: 1,
                  tableCount: 0,
                  fieldCount: 0,
                  relationshipCount: 0,
                  metricCount: 0,
                  createdByUserId: 'user-1',
                  createdAt: '2024-01-01T00:00:00Z',
                  updatedAt: '2024-01-01T00:00:00Z',
                  connection: { name: 'Test Connection', dbType: 'postgresql' },
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

      render(<SemanticModelsPage />);

      await waitFor(() => {
        expect(screen.getByText('Draft Model')).toBeInTheDocument();
      });

      // Export button should not exist
      const exportButtons = screen.getAllByRole('button').filter(
        button => button.querySelector('[data-testid="DownloadIcon"]')
      );
      expect(exportButtons.length).toBe(0);
    });

    it('navigates to detail page on view click', async () => {
      render(<SemanticModelsPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Model')).toBeInTheDocument();
      });

      // Find the table row
      const row = screen.getByText('Test Model').closest('tr');
      const viewButton = within(row!).getAllByRole('button')[0]; // First button is view
      await userEvent.click(viewButton);

      expect(mockNavigate).toHaveBeenCalledWith('/semantic-models/model-1');
    });

    it('navigates to new model page on New Model click', async () => {
      render(<SemanticModelsPage />);

      await waitFor(() => {
        expect(screen.getByText('New Model')).toBeInTheDocument();
      });

      const newModelButton = screen.getByText('New Model');
      await userEvent.click(newModelButton);

      expect(mockNavigate).toHaveBeenCalledWith('/semantic-models/new');
    });

    it('opens delete dialog on delete click', async () => {
      render(<SemanticModelsPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Model')).toBeInTheDocument();
      });

      // Find the table row
      const row = screen.getByText('Test Model').closest('tr');
      const deleteButton = within(row!).getAllByRole('button').find(
        button => button.querySelector('[data-testid="DeleteIcon"]')
      );

      await userEvent.click(deleteButton!);

      await waitFor(() => {
        expect(screen.getByText('Delete Semantic Model')).toBeInTheDocument();
        expect(screen.getByText(/Are you sure you want to delete the semantic model "Test Model"/)).toBeInTheDocument();
      });
    });

    it('deletes model on confirmation', async () => {
      let deleteEndpointCalled = false;
      server.use(
        http.delete('*/api/semantic-models/:id', () => {
          deleteEndpointCalled = true;
          return new HttpResponse(null, { status: 204 });
        }),
      );

      render(<SemanticModelsPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Model')).toBeInTheDocument();
      });

      // Find the table row and click delete
      const row = screen.getByText('Test Model').closest('tr');
      const deleteButton = within(row!).getAllByRole('button').find(
        button => button.querySelector('[data-testid="DeleteIcon"]')
      );

      await userEvent.click(deleteButton!);

      // Confirm deletion
      await waitFor(() => {
        expect(screen.getByText('Delete Semantic Model')).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: 'Delete' });
      await userEvent.click(confirmButton);

      await waitFor(() => {
        expect(deleteEndpointCalled).toBe(true);
      });
    });

    it('exports YAML on export click', async () => {
      const mockYaml = 'version: 1\ntables:\n  - name: test\n';
      let exportEndpointCalled = false;
      server.use(
        http.get('*/api/semantic-models/:id/yaml', () => {
          exportEndpointCalled = true;
          return HttpResponse.json({ data: mockYaml });
        }),
      );

      // Mock download functions without interfering with DOM
      const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
      const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      render(<SemanticModelsPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Model')).toBeInTheDocument();
      });

      // Find the table row and click export
      const row = screen.getByText('Test Model').closest('tr');
      const exportButton = within(row!).getAllByRole('button').find(
        button => button.querySelector('[data-testid="DownloadIcon"]')
      );

      await userEvent.click(exportButton!);

      // Just verify the API was called
      await waitFor(() => {
        expect(exportEndpointCalled).toBe(true);
      }, { timeout: 5000 });

      // Verify the download functions were called
      await waitFor(() => {
        expect(createObjectURLSpy).toHaveBeenCalled();
      });

      // Restore mocks
      createObjectURLSpy.mockRestore();
      revokeObjectURLSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('displays error message when fetch fails', async () => {
      server.use(
        http.get('*/api/semantic-models', () => {
          return HttpResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
          );
        }),
      );

      render(<SemanticModelsPage />);

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
      render(<SemanticModelsPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Model')).toBeInTheDocument();
      });

      // Check for pagination text
      expect(screen.getByText(/1–1 of 1/i)).toBeInTheDocument();
    });

    it('shows correct rows per page options', async () => {
      render(<SemanticModelsPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Model')).toBeInTheDocument();
      });

      // The TablePagination component should render with rowsPerPageOptions
      const pagination = screen.getByRole('combobox', { name: /rows per page/i });
      expect(pagination).toBeInTheDocument();
    });

    it('handles page change', async () => {
      server.use(
        http.get('*/api/semantic-models', ({ request }) => {
          const url = new URL(request.url);
          const page = url.searchParams.get('page');

          return HttpResponse.json({
            data: {
              items: [
                {
                  id: `model-${page}`,
                  name: `Model Page ${page}`,
                  description: null,
                  connectionId: 'conn-1',
                  databaseName: 'testdb',
                  status: 'ready',
                  model: { tables: [] },
                  modelVersion: 1,
                  tableCount: 2,
                  fieldCount: 10,
                  relationshipCount: 1,
                  metricCount: 5,
                  createdByUserId: 'user-1',
                  createdAt: '2024-01-01T00:00:00Z',
                  updatedAt: '2024-01-01T00:00:00Z',
                  connection: { name: 'Test Connection', dbType: 'postgresql' },
                },
              ],
              total: 25,
              page: parseInt(page || '1'),
              pageSize: 20,
              totalPages: 2,
            },
          });
        }),
      );

      render(<SemanticModelsPage />);

      await waitFor(() => {
        expect(screen.getByText('Model Page 1')).toBeInTheDocument();
      });

      // Click next page button
      const nextButton = screen.getByRole('button', { name: /next page/i });
      await userEvent.click(nextButton);

      await waitFor(() => {
        expect(screen.getByText('Model Page 2')).toBeInTheDocument();
      });
    });
  });
});
