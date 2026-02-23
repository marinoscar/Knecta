import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../../utils/test-utils';
import { PipelineStatusStrip } from '../../../components/home/PipelineStatusStrip';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const defaultProps = {
  connectionsTotal: 3,
  readyModelsCount: 5,
  readyOntologiesCount: 2,
  chatsTotal: 12,
};

describe('PipelineStatusStrip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders 4 pipeline step cards with correct labels', () => {
      render(<PipelineStatusStrip {...defaultProps} />);

      expect(screen.getByText('databases connected')).toBeInTheDocument();
      expect(screen.getByText('models ready')).toBeInTheDocument();
      expect(screen.getByText('ontologies ready')).toBeInTheDocument();
      expect(screen.getByText('conversations')).toBeInTheDocument();
    });

    it('renders the correct count values', () => {
      render(<PipelineStatusStrip {...defaultProps} />);

      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('12')).toBeInTheDocument();
    });

    it('renders zero counts correctly', () => {
      render(
        <PipelineStatusStrip
          connectionsTotal={0}
          readyModelsCount={0}
          readyOntologiesCount={0}
          chatsTotal={0}
        />,
      );

      const zeros = screen.getAllByText('0');
      expect(zeros).toHaveLength(4);
    });
  });

  describe('loading state', () => {
    it('shows loading skeletons when isLoading is true', () => {
      const { container } = render(
        <PipelineStatusStrip {...defaultProps} isLoading />,
      );

      const skeletons = container.querySelectorAll('.MuiSkeleton-root');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('does not show count values when isLoading is true', () => {
      render(<PipelineStatusStrip {...defaultProps} isLoading />);

      // The numeric values should not appear when loading
      expect(screen.queryByText('3')).not.toBeInTheDocument();
      expect(screen.queryByText('5')).not.toBeInTheDocument();
    });
  });

  describe('navigation', () => {
    it('navigates to /connections when the connections card is clicked', async () => {
      const user = userEvent.setup();

      render(<PipelineStatusStrip {...defaultProps} />);

      // The card containing "databases connected" label
      const connectionsLabel = screen.getByText('databases connected');
      await user.click(connectionsLabel);

      expect(mockNavigate).toHaveBeenCalledWith('/connections');
    });

    it('navigates to /semantic-models when the models card is clicked', async () => {
      const user = userEvent.setup();

      render(<PipelineStatusStrip {...defaultProps} />);

      const modelsLabel = screen.getByText('models ready');
      await user.click(modelsLabel);

      expect(mockNavigate).toHaveBeenCalledWith('/semantic-models');
    });

    it('navigates to /ontologies when the ontologies card is clicked', async () => {
      const user = userEvent.setup();

      render(<PipelineStatusStrip {...defaultProps} />);

      const ontologiesLabel = screen.getByText('ontologies ready');
      await user.click(ontologiesLabel);

      expect(mockNavigate).toHaveBeenCalledWith('/ontologies');
    });

    it('navigates to /agent when the conversations card is clicked', async () => {
      const user = userEvent.setup();

      render(<PipelineStatusStrip {...defaultProps} />);

      const conversationsLabel = screen.getByText('conversations');
      await user.click(conversationsLabel);

      expect(mockNavigate).toHaveBeenCalledWith('/agent');
    });
  });

  describe('grid layout', () => {
    it('renders inside a Grid container', () => {
      const { container } = render(<PipelineStatusStrip {...defaultProps} />);

      const gridContainer = container.querySelector('.MuiGrid-container');
      expect(gridContainer).toBeInTheDocument();
    });

    it('renders 4 Grid items', () => {
      const { container } = render(<PipelineStatusStrip {...defaultProps} />);

      const gridItems = container.querySelectorAll('.MuiGrid-item');
      expect(gridItems).toHaveLength(4);
    });
  });
});
