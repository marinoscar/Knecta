import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { ChartRenderer } from '../ChartRenderer';
import type { ChartSpec } from '../../../types';

// Mock MUI X Charts - they depend on canvas/SVG that JSDOM can't render
vi.mock('@mui/x-charts', () => ({
  BarChart: (props: any) => <div data-testid="bar-chart" data-height={props.height} />,
  LineChart: (props: any) => <div data-testid="line-chart" data-height={props.height} />,
  PieChart: (props: any) => <div data-testid="pie-chart" data-height={props.height} />,
  ScatterChart: (props: any) => <div data-testid="scatter-chart" data-height={props.height} />,
}));

const theme = createTheme();

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
}

describe('ChartRenderer', () => {
  it('should render bar chart with title', () => {
    const spec: ChartSpec = {
      type: 'bar',
      title: 'Revenue by Region',
      categories: ['North', 'South', 'East'],
      series: [{ label: 'Revenue', data: [100, 80, 120] }],
      xAxisLabel: 'Region',
      yAxisLabel: 'Revenue ($M)',
    };

    renderWithTheme(<ChartRenderer chartSpec={spec} />);

    expect(screen.getByText('Revenue by Region')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('should render line chart with title', () => {
    const spec: ChartSpec = {
      type: 'line',
      title: 'Monthly Sales Trend',
      categories: ['Jan', 'Feb', 'Mar'],
      series: [{ label: 'Sales', data: [100, 150, 120] }],
    };

    renderWithTheme(<ChartRenderer chartSpec={spec} />);

    expect(screen.getByText('Monthly Sales Trend')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });

  it('should render pie chart with title', () => {
    const spec: ChartSpec = {
      type: 'pie',
      title: 'Expense Breakdown',
      slices: [
        { label: 'Salaries', value: 60 },
        { label: 'Marketing', value: 25 },
        { label: 'Other', value: 15 },
      ],
    };

    renderWithTheme(<ChartRenderer chartSpec={spec} />);

    expect(screen.getByText('Expense Breakdown')).toBeInTheDocument();
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
  });

  it('should render scatter chart with title', () => {
    const spec: ChartSpec = {
      type: 'scatter',
      title: 'Price vs Quantity',
      xAxisLabel: 'Price ($)',
      yAxisLabel: 'Quantity',
      points: [
        { x: 10, y: 100, label: 'Product A' },
        { x: 20, y: 80, label: 'Product B' },
      ],
    };

    renderWithTheme(<ChartRenderer chartSpec={spec} />);

    expect(screen.getByText('Price vs Quantity')).toBeInTheDocument();
    expect(screen.getByTestId('scatter-chart')).toBeInTheDocument();
  });

  it('should return null for unsupported chart type', () => {
    const spec = { type: 'heatmap' as any, title: 'Invalid' };

    const { container } = renderWithTheme(<ChartRenderer chartSpec={spec} />);

    expect(container.firstChild).toBeNull();
  });

  it('should wrap chart in Paper component', () => {
    const spec: ChartSpec = {
      type: 'bar',
      title: 'Test',
      categories: ['A'],
      series: [{ label: 'S', data: [1] }],
    };

    const { container } = renderWithTheme(<ChartRenderer chartSpec={spec} />);

    expect(container.querySelector('.MuiPaper-root')).toBeInTheDocument();
  });

  it('should use outlined Paper variant', () => {
    const spec: ChartSpec = {
      type: 'bar',
      title: 'Test',
      categories: ['A'],
      series: [{ label: 'S', data: [1] }],
    };

    const { container } = renderWithTheme(<ChartRenderer chartSpec={spec} />);

    expect(container.querySelector('.MuiPaper-outlined')).toBeInTheDocument();
  });

  it('should render bar chart with multiple series', () => {
    const spec: ChartSpec = {
      type: 'bar',
      title: 'Multi-Series Chart',
      categories: ['Q1', 'Q2', 'Q3'],
      series: [
        { label: 'Revenue', data: [100, 120, 110] },
        { label: 'Costs', data: [60, 70, 65] },
      ],
    };

    renderWithTheme(<ChartRenderer chartSpec={spec} />);

    expect(screen.getByText('Multi-Series Chart')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('should render line chart with axis labels', () => {
    const spec: ChartSpec = {
      type: 'line',
      title: 'Temperature Over Time',
      categories: ['Mon', 'Tue', 'Wed'],
      series: [{ label: 'Temperature', data: [20, 22, 21] }],
      xAxisLabel: 'Day',
      yAxisLabel: 'Temperature (°C)',
    };

    renderWithTheme(<ChartRenderer chartSpec={spec} />);

    expect(screen.getByText('Temperature Over Time')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });

  it('should render bar chart with horizontal layout', () => {
    const spec: ChartSpec = {
      type: 'bar',
      title: 'Horizontal Bar Chart',
      categories: ['A', 'B'],
      series: [{ label: 'Values', data: [10, 20] }],
      layout: 'horizontal',
    };

    renderWithTheme(<ChartRenderer chartSpec={spec} />);

    expect(screen.getByText('Horizontal Bar Chart')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('should handle empty series gracefully', () => {
    const spec: ChartSpec = {
      type: 'bar',
      title: 'Empty Chart',
      categories: [],
      series: [],
    };

    renderWithTheme(<ChartRenderer chartSpec={spec} />);

    expect(screen.getByText('Empty Chart')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('should handle missing optional fields', () => {
    const spec: ChartSpec = {
      type: 'line',
      title: 'Simple Line Chart',
      categories: ['A', 'B'],
      series: [{ label: 'Data', data: [1, 2] }],
    };

    renderWithTheme(<ChartRenderer chartSpec={spec} />);

    expect(screen.getByText('Simple Line Chart')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });
});
