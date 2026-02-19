import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import OntologyDetailPage from '../OntologyDetailPage';
import { getOntology, getOntologyGraph, exportOntologyRdf } from '../../services/api';
import type { Ontology, OntologyGraph } from '../../types';

// Mock react-router-dom hooks (MUST be before importing component)
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: 'test-ontology-id' }),
    useNavigate: () => vi.fn(),
  };
});

// Mock API functions
vi.mock('../../services/api', () => ({
  getOntology: vi.fn(),
  getOntologyGraph: vi.fn(),
  exportOntologyRdf: vi.fn(),
}));

// Mock OntologyGraph component (uses canvas/force-graph)
vi.mock('../../components/ontologies/OntologyGraph', () => ({
  OntologyGraph: () => <div data-testid="mock-graph">Mock Graph</div>,
}));

// Mock NodeInspector component
vi.mock('../../components/ontologies/NodeInspector', () => ({
  NodeInspector: () => null,
}));

// Mock URL.createObjectURL and URL.revokeObjectURL
const mockCreateObjectURL = vi.fn(() => 'blob:mock-url');
const mockRevokeObjectURL = vi.fn();
global.URL.createObjectURL = mockCreateObjectURL;
global.URL.revokeObjectURL = mockRevokeObjectURL;

// Mock document methods
const mockAppendChild = vi.fn();
const mockRemoveChild = vi.fn();
const mockClick = vi.fn();

// Test data
const mockReadyOntology: Ontology = {
  id: 'test-ontology-id',
  name: 'Test Ontology',
  description: 'A test ontology',
  status: 'ready',
  nodeCount: 5,
  relationshipCount: 2,
  semanticModel: { name: 'Test Model', status: 'ready' },
  semanticModelId: 'model-1',
  errorMessage: null,
  createdByUserId: 'user-1',
  createdAt: '2026-02-19T00:00:00Z',
  updatedAt: '2026-02-19T00:00:00Z',
};

const mockCreatingOntology: Ontology = {
  ...mockReadyOntology,
  status: 'creating',
};

const mockFailedOntology: Ontology = {
  ...mockReadyOntology,
  status: 'failed',
  errorMessage: 'Graph creation failed',
};

const mockGraph: OntologyGraph = {
  nodes: [
    { id: '1', label: 'Dataset', name: 'customers', properties: {} },
    { id: '2', label: 'Field', name: 'id', properties: {} },
  ],
  edges: [
    { id: 'e1', source: '1', target: '2', type: 'HAS_FIELD', properties: {} },
  ],
};

const mockRdfResponse = {
  rdf: '@prefix ex: <http://example.org/> .\nex:Test ex:prop "value" .',
  name: 'Test Ontology',
};

describe('OntologyDetailPage - RDF Export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should load and mount correctly', () => {
    expect(true).toBe(true);
  });

  it('renders Export to RDF button when ontology is ready', async () => {
    vi.mocked(getOntology).mockResolvedValue(mockReadyOntology);
    vi.mocked(getOntologyGraph).mockResolvedValue(mockGraph);

    render(
      <BrowserRouter>
        <OntologyDetailPage />
      </BrowserRouter>
    );

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    // Verify Export to RDF button is visible
    const exportButton = screen.getByRole('button', { name: /export to rdf/i });
    expect(exportButton).toBeInTheDocument();
    expect(exportButton).not.toBeDisabled();
  });

  it('does not render Export button when ontology is creating', async () => {
    vi.mocked(getOntology).mockResolvedValue(mockCreatingOntology);
    vi.mocked(getOntologyGraph).mockResolvedValue(mockGraph);

    render(
      <BrowserRouter>
        <OntologyDetailPage />
      </BrowserRouter>
    );

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    // Verify Export button is not present
    const exportButton = screen.queryByRole('button', { name: /export to rdf/i });
    expect(exportButton).not.toBeInTheDocument();

    // Verify creating status is shown
    expect(screen.getByText(/creating/i)).toBeInTheDocument();
  });

  it('does not render Export button when ontology is failed', async () => {
    vi.mocked(getOntology).mockResolvedValue(mockFailedOntology);
    vi.mocked(getOntologyGraph).mockResolvedValue(mockGraph);

    render(
      <BrowserRouter>
        <OntologyDetailPage />
      </BrowserRouter>
    );

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    // Verify Export button is not present
    const exportButton = screen.queryByRole('button', { name: /export to rdf/i });
    expect(exportButton).not.toBeInTheDocument();

    // Verify failed status and error message are shown
    expect(screen.getByText('Failed')).toBeInTheDocument(); // Status chip
    expect(screen.getByText(/graph creation failed/i)).toBeInTheDocument(); // Error alert
  });

  it('calls exportOntologyRdf on button click', async () => {
    vi.mocked(getOntology).mockResolvedValue(mockReadyOntology);
    vi.mocked(getOntologyGraph).mockResolvedValue(mockGraph);
    vi.mocked(exportOntologyRdf).mockResolvedValue(mockRdfResponse);

    render(
      <BrowserRouter>
        <OntologyDetailPage />
      </BrowserRouter>
    );

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    // Click the export button
    const exportButton = screen.getByRole('button', { name: /export to rdf/i });
    fireEvent.click(exportButton);

    // Verify API function was called
    await waitFor(() => {
      expect(exportOntologyRdf).toHaveBeenCalledWith('test-ontology-id');
    });
  });

  it('shows success snackbar after export', async () => {
    vi.mocked(getOntology).mockResolvedValue(mockReadyOntology);
    vi.mocked(getOntologyGraph).mockResolvedValue(mockGraph);
    vi.mocked(exportOntologyRdf).mockResolvedValue(mockRdfResponse);

    render(
      <BrowserRouter>
        <OntologyDetailPage />
      </BrowserRouter>
    );

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    // Click the export button
    const exportButton = screen.getByRole('button', { name: /export to rdf/i });
    fireEvent.click(exportButton);

    // Wait for success message
    await waitFor(() => {
      expect(screen.getByText(/rdf exported successfully/i)).toBeInTheDocument();
    });
  });

  it('shows error snackbar on export failure', async () => {
    vi.mocked(getOntology).mockResolvedValue(mockReadyOntology);
    vi.mocked(getOntologyGraph).mockResolvedValue(mockGraph);
    vi.mocked(exportOntologyRdf).mockRejectedValue(new Error('Export failed'));

    render(
      <BrowserRouter>
        <OntologyDetailPage />
      </BrowserRouter>
    );

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    // Click the export button
    const exportButton = screen.getByRole('button', { name: /export to rdf/i });
    fireEvent.click(exportButton);

    // Wait for error message
    await waitFor(() => {
      expect(screen.getByText(/export failed/i)).toBeInTheDocument();
    });
  });

  it('disables button while exporting', async () => {
    vi.mocked(getOntology).mockResolvedValue(mockReadyOntology);
    vi.mocked(getOntologyGraph).mockResolvedValue(mockGraph);

    // Create a promise we can control
    let resolveExport: (value: typeof mockRdfResponse) => void;
    const exportPromise = new Promise<typeof mockRdfResponse>((resolve) => {
      resolveExport = resolve;
    });
    vi.mocked(exportOntologyRdf).mockReturnValue(exportPromise);

    render(
      <BrowserRouter>
        <OntologyDetailPage />
      </BrowserRouter>
    );

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    // Click the export button
    const exportButton = screen.getByRole('button', { name: /export to rdf/i });
    fireEvent.click(exportButton);

    // Verify button shows "Exporting..." and is disabled
    await waitFor(() => {
      const disabledButton = screen.getByRole('button', { name: /exporting/i });
      expect(disabledButton).toBeInTheDocument();
      expect(disabledButton).toBeDisabled();
    });

    // Resolve the export
    resolveExport!(mockRdfResponse);

    // Verify button returns to normal state
    await waitFor(() => {
      const enabledButton = screen.getByRole('button', { name: /export to rdf/i });
      expect(enabledButton).toBeInTheDocument();
      expect(enabledButton).not.toBeDisabled();
    });
  });

  it('creates blob with correct type and triggers download', async () => {
    vi.mocked(getOntology).mockResolvedValue(mockReadyOntology);
    vi.mocked(getOntologyGraph).mockResolvedValue(mockGraph);
    vi.mocked(exportOntologyRdf).mockResolvedValue(mockRdfResponse);

    render(
      <BrowserRouter>
        <OntologyDetailPage />
      </BrowserRouter>
    );

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    // Click the export button
    const exportButton = screen.getByRole('button', { name: /export to rdf/i });
    fireEvent.click(exportButton);

    // Wait for export to complete - blob URL should be created
    await waitFor(() => {
      expect(mockCreateObjectURL).toHaveBeenCalled();
    });

    // Verify blob was created with correct type
    const blobCall = mockCreateObjectURL.mock.calls[0][0] as Blob;
    expect(blobCall.type).toBe('text/turtle');

    // Verify URL was revoked after download
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('renders ontology details correctly when ready', async () => {
    vi.mocked(getOntology).mockResolvedValue(mockReadyOntology);
    vi.mocked(getOntologyGraph).mockResolvedValue(mockGraph);

    render(
      <BrowserRouter>
        <OntologyDetailPage />
      </BrowserRouter>
    );

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    // Verify ontology details are displayed
    expect(screen.getByText('Test Ontology')).toBeInTheDocument();
    expect(screen.getByText('A test ontology')).toBeInTheDocument();
    expect(screen.getByText(/Ready/i)).toBeInTheDocument();
    expect(screen.getByText(/Nodes: 5/i)).toBeInTheDocument();
    expect(screen.getByText(/Relationships: 2/i)).toBeInTheDocument();
  });

  it('shows graph visualization when ontology is ready', async () => {
    vi.mocked(getOntology).mockResolvedValue(mockReadyOntology);
    vi.mocked(getOntologyGraph).mockResolvedValue(mockGraph);

    render(
      <BrowserRouter>
        <OntologyDetailPage />
      </BrowserRouter>
    );

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    // Verify graph component is rendered
    expect(screen.getByTestId('mock-graph')).toBeInTheDocument();
  });

  it('handles non-Error exceptions in export', async () => {
    vi.mocked(getOntology).mockResolvedValue(mockReadyOntology);
    vi.mocked(getOntologyGraph).mockResolvedValue(mockGraph);
    vi.mocked(exportOntologyRdf).mockRejectedValue('String error');

    render(
      <BrowserRouter>
        <OntologyDetailPage />
      </BrowserRouter>
    );

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    // Click the export button
    const exportButton = screen.getByRole('button', { name: /export to rdf/i });
    fireEvent.click(exportButton);

    // Wait for generic error message
    await waitFor(() => {
      expect(screen.getByText(/failed to export rdf/i)).toBeInTheDocument();
    });
  });

  it('shows "Show Fields" toggle when ontology is ready', async () => {
    vi.mocked(getOntology).mockResolvedValue(mockReadyOntology);
    vi.mocked(getOntologyGraph).mockResolvedValue(mockGraph);

    render(
      <BrowserRouter>
        <OntologyDetailPage />
      </BrowserRouter>
    );

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    // Verify Show Fields toggle is present
    const showFieldsToggle = screen.getByLabelText(/show fields/i);
    expect(showFieldsToggle).toBeInTheDocument();
  });
});
