import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../../utils/test-utils';
import { RecentActivity } from '../../../components/home/RecentActivity';
import type { SemanticModel, Ontology } from '../../../types';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const recentDate = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 min ago
const olderDate = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(); // 3 hours ago
const oldestDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days ago

const mockModels: SemanticModel[] = [
  {
    id: 'model-1',
    name: 'Sales Model',
    description: null,
    connectionId: 'conn-1',
    databaseName: 'salesdb',
    status: 'ready',
    model: null,
    modelVersion: 1,
    tableCount: 5,
    fieldCount: 20,
    relationshipCount: 3,
    metricCount: 10,
    createdByUserId: 'user-1',
    createdAt: oldestDate,
    updatedAt: olderDate,
  },
  {
    id: 'model-2',
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
    createdAt: oldestDate,
    updatedAt: oldestDate,
  },
];

const mockOntologies: Ontology[] = [
  {
    id: 'onto-1',
    name: 'Sales Ontology',
    description: null,
    semanticModelId: 'model-1',
    status: 'ready',
    nodeCount: 25,
    relationshipCount: 30,
    errorMessage: null,
    createdByUserId: 'user-1',
    createdAt: oldestDate,
    updatedAt: recentDate,
  },
  {
    id: 'onto-2',
    name: 'Creating Ontology',
    description: null,
    semanticModelId: 'model-2',
    status: 'creating',
    nodeCount: 0,
    relationshipCount: 0,
    errorMessage: null,
    createdByUserId: 'user-1',
    createdAt: oldestDate,
    updatedAt: oldestDate,
  },
];

describe('RecentActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders the section heading', () => {
      render(<RecentActivity models={mockModels} ontologies={mockOntologies} />);

      expect(screen.getByText('Recent Activity')).toBeInTheDocument();
    });

    it('renders model names', () => {
      render(<RecentActivity models={mockModels} ontologies={[]} />);

      expect(screen.getByText('Sales Model')).toBeInTheDocument();
      expect(screen.getByText('Failed Model')).toBeInTheDocument();
    });

    it('renders ontology names', () => {
      render(<RecentActivity models={[]} ontologies={mockOntologies} />);

      expect(screen.getByText('Sales Ontology')).toBeInTheDocument();
      expect(screen.getByText('Creating Ontology')).toBeInTheDocument();
    });
  });

  describe('sorting and merging', () => {
    it('merges models and ontologies into a single list sorted by updatedAt descending', () => {
      render(<RecentActivity models={mockModels} ontologies={mockOntologies} />);

      const listItems = screen.getAllByRole('button');
      // The most recently updated item (Sales Ontology, recentDate) should appear first
      expect(listItems[0]).toHaveTextContent('Sales Ontology');
    });

    it('limits the list to at most 5 items', () => {
      const manyModels: SemanticModel[] = Array.from({ length: 4 }, (_, i) => ({
        id: `model-${i}`,
        name: `Model ${i}`,
        description: null,
        connectionId: 'conn-1',
        databaseName: 'db',
        status: 'ready' as const,
        model: null,
        modelVersion: 1,
        tableCount: 0,
        fieldCount: 0,
        relationshipCount: 0,
        metricCount: 0,
        createdByUserId: 'user-1',
        createdAt: oldestDate,
        updatedAt: new Date(Date.now() - i * 60000).toISOString(),
      }));

      const manyOntologies: Ontology[] = Array.from({ length: 4 }, (_, i) => ({
        id: `onto-${i}`,
        name: `Ontology ${i}`,
        description: null,
        semanticModelId: 'sm-1',
        status: 'ready' as const,
        nodeCount: 0,
        relationshipCount: 0,
        errorMessage: null,
        createdByUserId: 'user-1',
        createdAt: oldestDate,
        updatedAt: new Date(Date.now() - (i + 4) * 60000).toISOString(),
      }));

      render(<RecentActivity models={manyModels} ontologies={manyOntologies} />);

      const listItems = screen.getAllByRole('button');
      expect(listItems).toHaveLength(5);
    });
  });

  describe('icons', () => {
    it('renders AccountTree icon for semantic models (data-testid)', () => {
      const { container } = render(
        <RecentActivity models={[mockModels[0]]} ontologies={[]} />,
      );

      const accountTreeIcon = container.querySelector('[data-testid="AccountTreeIcon"]');
      expect(accountTreeIcon).toBeInTheDocument();
    });

    it('renders Hub icon for ontologies (data-testid)', () => {
      const { container } = render(
        <RecentActivity models={[]} ontologies={[mockOntologies[0]]} />,
      );

      const hubIcon = container.querySelector('[data-testid="HubIcon"]');
      expect(hubIcon).toBeInTheDocument();
    });
  });

  describe('status chips', () => {
    it('shows "ready" status chip for a ready model', () => {
      render(<RecentActivity models={[mockModels[0]]} ontologies={[]} />);

      const chip = screen.getByText('ready');
      expect(chip).toBeInTheDocument();
    });

    it('shows "failed" status chip for a failed model', () => {
      render(<RecentActivity models={[mockModels[1]]} ontologies={[]} />);

      expect(screen.getByText('failed')).toBeInTheDocument();
    });

    it('shows "creating" status chip for a creating ontology', () => {
      render(<RecentActivity models={[]} ontologies={[mockOntologies[1]]} />);

      expect(screen.getByText('creating')).toBeInTheDocument();
    });

    it('uses "success" color for ready status', () => {
      const { container } = render(
        <RecentActivity models={[mockModels[0]]} ontologies={[]} />,
      );

      const successChip = container.querySelector('.MuiChip-colorSuccess');
      expect(successChip).toBeInTheDocument();
    });

    it('uses "error" color for failed status', () => {
      const { container } = render(
        <RecentActivity models={[mockModels[1]]} ontologies={[]} />,
      );

      const errorChip = container.querySelector('.MuiChip-colorError');
      expect(errorChip).toBeInTheDocument();
    });

    it('uses "warning" color for creating status', () => {
      const { container } = render(
        <RecentActivity models={[]} ontologies={[mockOntologies[1]]} />,
      );

      const warningChip = container.querySelector('.MuiChip-colorWarning');
      expect(warningChip).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows empty state message when no models or ontologies', () => {
      render(<RecentActivity models={[]} ontologies={[]} />);

      expect(screen.getByText(/no models or ontologies yet/i)).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('shows loading skeletons when isLoading is true', () => {
      const { container } = render(
        <RecentActivity models={[]} ontologies={[]} isLoading />,
      );

      const skeletons = container.querySelectorAll('.MuiSkeleton-root');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('does not show item names when isLoading is true', () => {
      render(<RecentActivity models={mockModels} ontologies={mockOntologies} isLoading />);

      expect(screen.queryByText('Sales Model')).not.toBeInTheDocument();
    });
  });

  describe('navigation', () => {
    it('navigates to /semantic-models/:id when a model item is clicked', async () => {
      const user = userEvent.setup();

      render(<RecentActivity models={[mockModels[0]]} ontologies={[]} />);

      await user.click(screen.getByText('Sales Model'));

      expect(mockNavigate).toHaveBeenCalledWith('/semantic-models/model-1');
    });

    it('navigates to /ontologies/:id when an ontology item is clicked', async () => {
      const user = userEvent.setup();

      render(<RecentActivity models={[]} ontologies={[mockOntologies[0]]} />);

      await user.click(screen.getByText('Sales Ontology'));

      expect(mockNavigate).toHaveBeenCalledWith('/ontologies/onto-1');
    });
  });
});
