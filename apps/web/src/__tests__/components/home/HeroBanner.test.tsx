import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../../utils/test-utils';
import { HeroBanner } from '../../../components/home/HeroBanner';
import type { Ontology } from '../../../types';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockOntologies: Ontology[] = [
  {
    id: 'ont-1',
    name: 'Sales DB',
    description: null,
    semanticModelId: 'sm-1',
    status: 'ready',
    nodeCount: 10,
    relationshipCount: 5,
    errorMessage: null,
    createdByUserId: 'user-1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ont-2',
    name: 'Inventory DB',
    description: null,
    semanticModelId: 'sm-2',
    status: 'ready',
    nodeCount: 8,
    relationshipCount: 3,
    errorMessage: null,
    createdByUserId: 'user-1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

const baseProps = {
  readyOntologies: mockOntologies,
  totalDatasets: 18,
  onAskQuestion: vi.fn(),
};

describe('HeroBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('active mode', () => {
    it('renders the ask bar and ontology chips', () => {
      render(<HeroBanner {...baseProps} mode="active" />);

      expect(screen.getByText(/ask anything about your data/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/what would you like to know/i)).toBeInTheDocument();
      expect(screen.getByText('Sales DB')).toBeInTheDocument();
      expect(screen.getByText('Inventory DB')).toBeInTheDocument();
    });

    it('shows ontology count and dataset count in subtitle', () => {
      render(<HeroBanner {...baseProps} mode="active" />);

      expect(screen.getByText(/powered by 2 ontologies across 18 datasets/i)).toBeInTheDocument();
    });

    it('uses singular form for one ontology and one dataset', () => {
      render(
        <HeroBanner
          {...baseProps}
          readyOntologies={[mockOntologies[0]]}
          totalDatasets={1}
          mode="active"
        />,
      );

      expect(screen.getByText(/powered by 1 ontology across 1 dataset/i)).toBeInTheDocument();
    });

    it('typing and pressing Enter submits the question with the selected ontology', async () => {
      const user = userEvent.setup();
      const onAskQuestion = vi.fn();

      render(
        <HeroBanner
          {...baseProps}
          mode="active"
          onAskQuestion={onAskQuestion}
        />,
      );

      const input = screen.getByPlaceholderText(/what would you like to know/i);
      await user.type(input, 'How many orders last month?');
      await user.keyboard('{Enter}');

      expect(onAskQuestion).toHaveBeenCalledWith('ont-1', 'How many orders last month?');
    });

    it('clicking the submit button calls onAskQuestion', async () => {
      const user = userEvent.setup();
      const onAskQuestion = vi.fn();

      render(
        <HeroBanner
          {...baseProps}
          mode="active"
          onAskQuestion={onAskQuestion}
        />,
      );

      const input = screen.getByPlaceholderText(/what would you like to know/i);
      await user.type(input, 'Show me revenue');

      const submitButton = screen.getByRole('button', { name: /submit question/i });
      await user.click(submitButton);

      expect(onAskQuestion).toHaveBeenCalledWith('ont-1', 'Show me revenue');
    });

    it('submit button is disabled when question is empty', () => {
      render(<HeroBanner {...baseProps} mode="active" />);

      const submitButton = screen.getByRole('button', { name: /submit question/i });
      expect(submitButton).toBeDisabled();
    });

    it('clears the input after submission', async () => {
      const user = userEvent.setup();

      render(<HeroBanner {...baseProps} mode="active" />);

      const input = screen.getByPlaceholderText(/what would you like to know/i);
      await user.type(input, 'Test question');
      await user.keyboard('{Enter}');

      expect(input).toHaveValue('');
    });

    it('clicking a chip selects it as the active ontology', async () => {
      const user = userEvent.setup();
      const onAskQuestion = vi.fn();

      render(
        <HeroBanner
          {...baseProps}
          mode="active"
          onAskQuestion={onAskQuestion}
        />,
      );

      // Click the second chip to select it
      const inventoryChip = screen.getByText('Inventory DB');
      await user.click(inventoryChip);

      // Now submit a question - it should use the second ontology
      const input = screen.getByPlaceholderText(/what would you like to know/i);
      await user.type(input, 'Stock levels?');
      await user.keyboard('{Enter}');

      expect(onAskQuestion).toHaveBeenCalledWith('ont-2', 'Stock levels?');
    });

    it('does not call onAskQuestion when input is whitespace only', async () => {
      const user = userEvent.setup();
      const onAskQuestion = vi.fn();

      render(
        <HeroBanner
          {...baseProps}
          mode="active"
          onAskQuestion={onAskQuestion}
        />,
      );

      const input = screen.getByPlaceholderText(/what would you like to know/i);
      await user.type(input, '   ');
      await user.keyboard('{Enter}');

      expect(onAskQuestion).not.toHaveBeenCalled();
    });
  });

  describe('new mode', () => {
    it('renders welcome message and connect button', () => {
      render(<HeroBanner {...baseProps} mode="new" />);

      expect(screen.getByText(/welcome to knecta/i)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /connect your first database/i }),
      ).toBeInTheDocument();
    });

    it('navigates to /connections when connect button is clicked', async () => {
      const user = userEvent.setup();

      render(<HeroBanner {...baseProps} mode="new" />);

      await user.click(screen.getByRole('button', { name: /connect your first database/i }));

      expect(mockNavigate).toHaveBeenCalledWith('/connections');
    });

    it('renders pipeline steps (Connect, Understand, Model, Ask)', () => {
      render(<HeroBanner {...baseProps} mode="new" />);

      expect(screen.getByText('Connect')).toBeInTheDocument();
      expect(screen.getByText('Understand')).toBeInTheDocument();
      expect(screen.getByText('Model')).toBeInTheDocument();
      expect(screen.getByText('Ask')).toBeInTheDocument();
    });
  });

  describe('setup mode', () => {
    it('renders "almost there" heading and continue button', () => {
      render(
        <HeroBanner
          {...baseProps}
          mode="setup"
          nextSetupStep={{ label: 'Generate your first semantic model', path: '/semantic-models/new' }}
        />,
      );

      expect(screen.getByText(/you're almost there/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /continue setup/i })).toBeInTheDocument();
    });

    it('shows the next setup step label as subtitle', () => {
      render(
        <HeroBanner
          {...baseProps}
          mode="setup"
          nextSetupStep={{ label: 'Generate your first semantic model', path: '/semantic-models/new' }}
        />,
      );

      expect(screen.getByText('Generate your first semantic model')).toBeInTheDocument();
    });

    it('navigates to the next step path when continue is clicked', async () => {
      const user = userEvent.setup();

      render(
        <HeroBanner
          {...baseProps}
          mode="setup"
          nextSetupStep={{ label: 'Generate your first semantic model', path: '/semantic-models/new' }}
        />,
      );

      await user.click(screen.getByRole('button', { name: /continue setup/i }));

      expect(mockNavigate).toHaveBeenCalledWith('/semantic-models/new');
    });

    it('disables the continue button when nextSetupStep is undefined', () => {
      render(
        <HeroBanner
          {...baseProps}
          mode="setup"
          nextSetupStep={undefined}
        />,
      );

      const continueButton = screen.getByRole('button', { name: /continue setup/i });
      expect(continueButton).toBeDisabled();
    });

    it('shows fallback text when nextSetupStep is undefined', () => {
      render(<HeroBanner {...baseProps} mode="setup" />);

      expect(
        screen.getByText(/complete setup to start asking questions/i),
      ).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('shows skeleton placeholders when isLoading is true', () => {
      const { container } = render(
        <HeroBanner {...baseProps} mode="active" isLoading />,
      );

      const skeletons = container.querySelectorAll('.MuiSkeleton-root');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('does not render the ask bar when isLoading is true', () => {
      render(<HeroBanner {...baseProps} mode="active" isLoading />);

      expect(
        screen.queryByPlaceholderText(/what would you like to know/i),
      ).not.toBeInTheDocument();
    });
  });
});
