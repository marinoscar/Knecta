import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '../../utils/test-utils';
import { PlatformSummary } from '../../../components/home/PlatformSummary';

const defaultProps = {
  totalDatasets: 42,
  totalRelationships: 17,
  providerCount: 3,
};

describe('PlatformSummary', () => {
  describe('rendering', () => {
    it('renders the section heading', () => {
      render(<PlatformSummary {...defaultProps} />);

      expect(screen.getByText('Platform Summary')).toBeInTheDocument();
    });

    it('renders all 3 stat labels', () => {
      render(<PlatformSummary {...defaultProps} />);

      expect(screen.getByText('Datasets')).toBeInTheDocument();
      expect(screen.getByText('Relationships')).toBeInTheDocument();
      expect(screen.getByText('LLM Providers')).toBeInTheDocument();
    });

    it('renders the correct stat values', () => {
      render(<PlatformSummary {...defaultProps} />);

      expect(screen.getByText('42')).toBeInTheDocument();
      expect(screen.getByText('17')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('renders zero values correctly', () => {
      render(
        <PlatformSummary
          totalDatasets={0}
          totalRelationships={0}
          providerCount={0}
        />,
      );

      const zeros = screen.getAllByText('0');
      expect(zeros).toHaveLength(3);
    });

    it('renders inside a Paper component', () => {
      const { container } = render(<PlatformSummary {...defaultProps} />);

      const paper = container.querySelector('.MuiPaper-root');
      expect(paper).toBeInTheDocument();
    });

    it('renders in a Grid layout', () => {
      const { container } = render(<PlatformSummary {...defaultProps} />);

      const gridContainer = container.querySelector('.MuiGrid-container');
      expect(gridContainer).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('shows loading skeletons when isLoading is true', () => {
      const { container } = render(
        <PlatformSummary {...defaultProps} isLoading />,
      );

      const skeletons = container.querySelectorAll('.MuiSkeleton-root');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('does not show stat values when isLoading is true', () => {
      render(<PlatformSummary {...defaultProps} isLoading />);

      expect(screen.queryByText('42')).not.toBeInTheDocument();
      expect(screen.queryByText('17')).not.toBeInTheDocument();
      expect(screen.queryByText('3')).not.toBeInTheDocument();
    });

    it('still shows the section heading when isLoading is true', () => {
      render(<PlatformSummary {...defaultProps} isLoading />);

      expect(screen.getByText('Platform Summary')).toBeInTheDocument();
    });
  });
});
