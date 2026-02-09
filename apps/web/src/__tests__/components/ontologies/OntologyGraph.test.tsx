import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OntologyGraph } from '../../../components/ontologies/OntologyGraph';
import type { OntologyGraph as OntologyGraphType, GraphNode } from '../../../types';

// Mock react-force-graph-2d since it uses canvas
vi.mock('react-force-graph-2d', () => ({
  default: ({ onNodeClick, graphData }: any) => (
    <div data-testid="force-graph">
      {graphData.nodes.map((node: any) => (
        <button
          key={node.id}
          data-testid={`node-${node.id}`}
          onClick={() => onNodeClick && onNodeClick(node)}
        >
          {node.name}
        </button>
      ))}
    </div>
  ),
}));

describe('OntologyGraph', () => {
  const mockGraph: OntologyGraphType = {
    nodes: [
      {
        id: '1',
        label: 'Dataset',
        name: 'orders',
        properties: { source: 'db.public.orders', description: 'Orders table' },
      },
      {
        id: '2',
        label: 'Dataset',
        name: 'customers',
        properties: { source: 'db.public.customers', description: 'Customers table' },
      },
      {
        id: '3',
        label: 'Field',
        name: 'id',
        properties: { datasetName: 'orders', expression: 'id', dataType: 'integer' },
      },
    ],
    edges: [
      {
        id: 'e1',
        source: '1',
        target: '3',
        type: 'HAS_FIELD',
        properties: {},
      },
      {
        id: 'e2',
        source: '1',
        target: '2',
        type: 'RELATES_TO',
        properties: { name: 'orders_to_customers' },
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders without crashing', () => {
      render(<OntologyGraph graph={mockGraph} />);
      expect(screen.getByTestId('force-graph')).toBeInTheDocument();
    });

    it('renders legend', () => {
      render(<OntologyGraph graph={mockGraph} />);
      expect(screen.getByText('Legend')).toBeInTheDocument();
      expect(screen.getByText('Dataset')).toBeInTheDocument();
      expect(screen.getByText('RELATES_TO')).toBeInTheDocument();
      expect(screen.getByText('HAS_FIELD')).toBeInTheDocument();
    });

    it('renders only dataset nodes by default (showFields=false)', () => {
      render(<OntologyGraph graph={mockGraph} showFields={false} />);

      // Dataset nodes should be rendered
      expect(screen.getByTestId('node-1')).toBeInTheDocument();
      expect(screen.getByTestId('node-2')).toBeInTheDocument();

      // Field nodes should NOT be rendered
      expect(screen.queryByTestId('node-3')).not.toBeInTheDocument();
    });

    it('renders all nodes when showFields=true', () => {
      render(<OntologyGraph graph={mockGraph} showFields={true} />);

      // All nodes should be rendered
      expect(screen.getByTestId('node-1')).toBeInTheDocument();
      expect(screen.getByTestId('node-2')).toBeInTheDocument();
      expect(screen.getByTestId('node-3')).toBeInTheDocument();
    });

    it('shows Field in legend when showFields=true', () => {
      render(<OntologyGraph graph={mockGraph} showFields={true} />);

      // Field should appear twice: once in legend, once as a node name
      const fieldElements = screen.getAllByText('Field');
      expect(fieldElements.length).toBeGreaterThan(0);
    });

    it('does not show Field in legend when showFields=false', () => {
      render(<OntologyGraph graph={mockGraph} showFields={false} />);

      // Field should not appear in legend when showFields is false
      const fieldElements = screen.queryAllByText('Field');
      expect(fieldElements.length).toBe(0);
    });
  });

  describe('Node Click Handler', () => {
    it('calls onNodeClick callback when node is clicked', async () => {
      const onNodeClick = vi.fn();
      render(<OntologyGraph graph={mockGraph} onNodeClick={onNodeClick} />);

      const node1 = screen.getByTestId('node-1');
      await userEvent.click(node1);

      expect(onNodeClick).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '1',
          label: 'Dataset',
          name: 'orders',
        })
      );
    });

    it('does not throw error if onNodeClick is not provided', async () => {
      render(<OntologyGraph graph={mockGraph} />);

      const node1 = screen.getByTestId('node-1');
      await userEvent.click(node1);

      // Should not throw error
      expect(true).toBe(true);
    });

    it('calls onNodeClick with correct node data', async () => {
      const onNodeClick = vi.fn();
      render(<OntologyGraph graph={mockGraph} onNodeClick={onNodeClick} />);

      const node2 = screen.getByTestId('node-2');
      await userEvent.click(node2);

      expect(onNodeClick).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '2',
          label: 'Dataset',
          name: 'customers',
        })
      );
    });
  });

  describe('Empty Graph', () => {
    it('handles empty graph gracefully', () => {
      const emptyGraph: OntologyGraphType = {
        nodes: [],
        edges: [],
      };

      render(<OntologyGraph graph={emptyGraph} />);
      expect(screen.getByTestId('force-graph')).toBeInTheDocument();
      expect(screen.getByText('Legend')).toBeInTheDocument();
    });
  });

  describe('Filtering', () => {
    it('filters out field nodes when showFields is false', () => {
      render(<OntologyGraph graph={mockGraph} showFields={false} />);

      // Only dataset nodes should be rendered
      const nodes = screen.queryAllByRole('button');
      expect(nodes.length).toBe(2); // Only 2 dataset nodes
    });

    it('includes all nodes when showFields is true', () => {
      render(<OntologyGraph graph={mockGraph} showFields={true} />);

      // All 3 nodes should be rendered
      const nodes = screen.queryAllByRole('button');
      expect(nodes.length).toBe(3); // All 3 nodes
    });
  });

  describe('Graph with Only Dataset Nodes', () => {
    it('renders graph with only dataset nodes correctly', () => {
      const datasetOnlyGraph: OntologyGraphType = {
        nodes: [
          {
            id: '1',
            label: 'Dataset',
            name: 'orders',
            properties: { source: 'db.public.orders' },
          },
          {
            id: '2',
            label: 'Dataset',
            name: 'customers',
            properties: { source: 'db.public.customers' },
          },
        ],
        edges: [
          {
            id: 'e1',
            source: '1',
            target: '2',
            type: 'RELATES_TO',
            properties: { name: 'orders_to_customers' },
          },
        ],
      };

      render(<OntologyGraph graph={datasetOnlyGraph} showFields={false} />);

      expect(screen.getByTestId('node-1')).toBeInTheDocument();
      expect(screen.getByTestId('node-2')).toBeInTheDocument();
    });
  });
});
