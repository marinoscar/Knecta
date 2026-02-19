import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '../../../__tests__/utils/test-utils';
import { ChatMessage } from '../ChatMessage';
import type { DataChatMessage } from '../../../types';

// Mock MUI X Charts
vi.mock('@mui/x-charts', () => ({
  BarChart: () => <div data-testid="bar-chart" />,
  LineChart: () => <div data-testid="line-chart" />,
  PieChart: () => <div data-testid="pie-chart" />,
  ScatterChart: () => <div data-testid="scatter-chart" />,
}));

// Mock syntax highlighter to avoid issues
vi.mock('react-syntax-highlighter', () => ({
  Prism: ({ children }: any) => <pre>{children}</pre>,
}));
vi.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({
  oneDark: {},
}));

describe('ChatMessage chart rendering', () => {
  it('should render chart when stepResults contain chartSpec', () => {
    const message: DataChatMessage = {
      id: '1',
      chatId: 'chat-1',
      role: 'assistant',
      content: 'Here is the revenue breakdown:',
      status: 'complete',
      createdAt: new Date().toISOString(),
      metadata: {
        stepResults: [
          {
            stepId: 1,
            description: 'Revenue by region',
            strategy: 'sql_then_python',
            chartSpec: {
              type: 'bar',
              title: 'Revenue by Region',
              categories: ['North', 'South'],
              series: [{ label: 'Revenue', data: [100, 80] }],
            },
          },
        ],
      },
    };

    render(<ChatMessage message={message} />);

    expect(screen.getByText('Revenue by Region')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('should NOT render chart when no chartSpec present', () => {
    const message: DataChatMessage = {
      id: '2',
      chatId: 'chat-1',
      role: 'assistant',
      content: 'The total revenue is $1M.',
      status: 'complete',
      createdAt: new Date().toISOString(),
      metadata: {
        stepResults: [
          {
            stepId: 1,
            description: 'Total revenue',
            strategy: 'sql',
          },
        ],
      },
    };

    render(<ChatMessage message={message} />);

    expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument();
    expect(screen.queryByTestId('line-chart')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pie-chart')).not.toBeInTheDocument();
    expect(screen.queryByTestId('scatter-chart')).not.toBeInTheDocument();
  });

  it('should render multiple charts from multiple steps', () => {
    const message: DataChatMessage = {
      id: '3',
      chatId: 'chat-1',
      role: 'assistant',
      content: 'Here are the results:',
      status: 'complete',
      createdAt: new Date().toISOString(),
      metadata: {
        stepResults: [
          {
            stepId: 1,
            description: 'Revenue chart',
            strategy: 'sql_then_python',
            chartSpec: {
              type: 'bar',
              title: 'Revenue Chart',
              categories: ['A'],
              series: [{ label: 'Rev', data: [10] }],
            },
          },
          {
            stepId: 2,
            description: 'Trend chart',
            strategy: 'sql_then_python',
            chartSpec: {
              type: 'line',
              title: 'Trend Chart',
              categories: ['Jan'],
              series: [{ label: 'Sales', data: [100] }],
            },
          },
        ],
      },
    };

    render(<ChatMessage message={message} />);

    expect(screen.getByText('Revenue Chart')).toBeInTheDocument();
    expect(screen.getByText('Trend Chart')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });

  it('should not render charts for user messages', () => {
    const message: DataChatMessage = {
      id: '4',
      chatId: 'chat-1',
      role: 'user',
      content: 'Show me revenue by region',
      status: 'complete',
      createdAt: new Date().toISOString(),
    };

    render(<ChatMessage message={message} />);

    expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument();
  });

  it('should render chart alongside narrative text', () => {
    const message: DataChatMessage = {
      id: '5',
      chatId: 'chat-1',
      role: 'assistant',
      content: 'Revenue is highest in the North region.',
      status: 'complete',
      createdAt: new Date().toISOString(),
      metadata: {
        stepResults: [
          {
            stepId: 1,
            description: 'Revenue analysis',
            strategy: 'sql_then_python',
            chartSpec: {
              type: 'pie',
              title: 'Revenue Distribution',
              slices: [{ label: 'North', value: 60 }, { label: 'South', value: 40 }],
            },
          },
        ],
      },
    };

    render(<ChatMessage message={message} />);

    // Both text and chart should be present
    expect(screen.getByText(/Revenue is highest/)).toBeInTheDocument();
    expect(screen.getByText('Revenue Distribution')).toBeInTheDocument();
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
  });

  it('should render scatter chart from step results', () => {
    const message: DataChatMessage = {
      id: '6',
      chatId: 'chat-1',
      role: 'assistant',
      content: 'Here is the correlation analysis:',
      status: 'complete',
      createdAt: new Date().toISOString(),
      metadata: {
        stepResults: [
          {
            stepId: 1,
            description: 'Correlation chart',
            strategy: 'sql_then_python',
            chartSpec: {
              type: 'scatter',
              title: 'Price vs Sales',
              xAxisLabel: 'Price',
              yAxisLabel: 'Sales',
              points: [
                { x: 10, y: 100 },
                { x: 20, y: 80 },
              ],
            },
          },
        ],
      },
    };

    render(<ChatMessage message={message} />);

    expect(screen.getByText('Price vs Sales')).toBeInTheDocument();
    expect(screen.getByTestId('scatter-chart')).toBeInTheDocument();
  });

  it('should handle steps with both chartSpec and other metadata', () => {
    const message: DataChatMessage = {
      id: '7',
      chatId: 'chat-1',
      role: 'assistant',
      content: 'Analysis complete.',
      status: 'complete',
      createdAt: new Date().toISOString(),
      metadata: {
        stepResults: [
          {
            stepId: 1,
            description: 'Revenue query',
            strategy: 'sql_then_python',
            sqlResult: {
              rowCount: 100,
              columns: ['region', 'revenue'],
              data: '[{"region": "North", "revenue": 100}]',
            },
            chartSpec: {
              type: 'bar',
              title: 'Revenue by Region',
              categories: ['North', 'South'],
              series: [{ label: 'Revenue', data: [100, 80] }],
            },
          },
        ],
      },
    };

    render(<ChatMessage message={message} />);

    expect(screen.getByText('Revenue by Region')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('should not render charts when stepResults is undefined', () => {
    const message: DataChatMessage = {
      id: '8',
      chatId: 'chat-1',
      role: 'assistant',
      content: 'Processing...',
      status: 'generating',
      createdAt: new Date().toISOString(),
      metadata: {},
    };

    render(<ChatMessage message={message} />);

    expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument();
    expect(screen.queryByTestId('line-chart')).not.toBeInTheDocument();
  });

  it('should not render charts when stepResults is empty array', () => {
    const message: DataChatMessage = {
      id: '9',
      chatId: 'chat-1',
      role: 'assistant',
      content: 'No data available.',
      status: 'complete',
      createdAt: new Date().toISOString(),
      metadata: {
        stepResults: [],
      },
    };

    render(<ChatMessage message={message} />);

    expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument();
  });

  it('should render only steps with chartSpec when mixed steps present', () => {
    const message: DataChatMessage = {
      id: '10',
      chatId: 'chat-1',
      role: 'assistant',
      content: 'Here are the insights:',
      status: 'complete',
      createdAt: new Date().toISOString(),
      metadata: {
        stepResults: [
          {
            stepId: 1,
            description: 'Count query',
            strategy: 'sql',
            // No chartSpec
          },
          {
            stepId: 2,
            description: 'Revenue visualization',
            strategy: 'sql_then_python',
            chartSpec: {
              type: 'line',
              title: 'Revenue Trend',
              categories: ['Jan', 'Feb'],
              series: [{ label: 'Revenue', data: [100, 120] }],
            },
          },
        ],
      },
    };

    render(<ChatMessage message={message} />);

    expect(screen.getByText('Revenue Trend')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    // Only one chart should be rendered
    expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument();
  });

  it('should render chart for message with verification metadata', () => {
    const message: DataChatMessage = {
      id: '11',
      chatId: 'chat-1',
      role: 'assistant',
      content: 'Verified analysis:',
      status: 'complete',
      createdAt: new Date().toISOString(),
      metadata: {
        stepResults: [
          {
            stepId: 1,
            description: 'Revenue analysis',
            strategy: 'sql_then_python',
            chartSpec: {
              type: 'bar',
              title: 'Verified Revenue',
              categories: ['Q1', 'Q2'],
              series: [{ label: 'Revenue', data: [50, 60] }],
            },
          },
        ],
        verificationReport: {
          passed: true,
          checks: [{ name: 'grain_check', passed: true, message: 'OK' }],
        },
        dataLineage: {
          datasets: ['sales'],
          joins: [],
          grain: 'quarter',
          rowCount: 2,
        },
      },
    };

    render(<ChatMessage message={message} />);

    expect(screen.getByText('Verified Revenue')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    // Verification badge should also be present
    expect(screen.getByText('Verified')).toBeInTheDocument();
  });
});
