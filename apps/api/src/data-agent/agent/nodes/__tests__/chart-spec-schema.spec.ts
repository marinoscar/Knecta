import { ChartSpecSchema } from '../executor.node';

describe('ChartSpecSchema', () => {
  it('should validate a valid bar chart spec', () => {
    const spec = {
      type: 'bar',
      title: 'Test Bar Chart',
      categories: ['A', 'B', 'C'],
      series: [{ label: 'Data', data: [10, 20, 30] }],
      xAxisLabel: 'Categories',
      yAxisLabel: 'Values',
    };
    const result = ChartSpecSchema.safeParse(spec);
    expect(result.success).toBe(true);
  });

  it('should validate a valid line chart spec', () => {
    const spec = {
      type: 'line',
      title: 'Test Line Chart',
      categories: ['Jan', 'Feb', 'Mar'],
      series: [{ label: 'Sales', data: [100, 150, 120] }],
    };
    const result = ChartSpecSchema.safeParse(spec);
    expect(result.success).toBe(true);
  });

  it('should validate a valid pie chart spec', () => {
    const spec = {
      type: 'pie',
      title: 'Test Pie Chart',
      slices: [
        { label: 'A', value: 30 },
        { label: 'B', value: 70 },
      ],
    };
    const result = ChartSpecSchema.safeParse(spec);
    expect(result.success).toBe(true);
  });

  it('should validate a valid scatter chart spec', () => {
    const spec = {
      type: 'scatter',
      title: 'Test Scatter Plot',
      points: [
        { x: 1, y: 2, label: 'A' },
        { x: 3, y: 4 },
      ],
    };
    const result = ChartSpecSchema.safeParse(spec);
    expect(result.success).toBe(true);
  });

  it('should reject invalid chart type', () => {
    const spec = {
      type: 'heatmap',
      title: 'Invalid',
    };
    const result = ChartSpecSchema.safeParse(spec);
    expect(result.success).toBe(false);
  });

  it('should reject title longer than 60 characters', () => {
    const spec = {
      type: 'bar',
      title: 'A'.repeat(61),
      categories: ['A'],
      series: [{ label: 'Data', data: [10] }],
    };
    const result = ChartSpecSchema.safeParse(spec);
    expect(result.success).toBe(false);
  });

  it('should reject pie chart with more than 8 slices', () => {
    const spec = {
      type: 'pie',
      title: 'Too Many Slices',
      slices: Array.from({ length: 9 }, (_, i) => ({ label: `S${i}`, value: 10 })),
    };
    const result = ChartSpecSchema.safeParse(spec);
    expect(result.success).toBe(false);
  });

  it('should accept horizontal layout for bar chart', () => {
    const spec = {
      type: 'bar',
      title: 'Horizontal Bar',
      categories: ['A'],
      series: [{ label: 'Data', data: [10] }],
      layout: 'horizontal',
    };
    const result = ChartSpecSchema.safeParse(spec);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.layout).toBe('horizontal');
    }
  });

  it('should allow optional fields to be omitted', () => {
    const spec = {
      type: 'bar',
      title: 'Minimal',
    };
    const result = ChartSpecSchema.safeParse(spec);
    expect(result.success).toBe(true);
  });

  it('should validate bar chart with multiple series', () => {
    const spec = {
      type: 'bar',
      title: 'Multi-Series Bar Chart',
      categories: ['Q1', 'Q2', 'Q3'],
      series: [
        { label: '2024', data: [100, 120, 110] },
        { label: '2025', data: [110, 130, 125] },
      ],
    };
    const result = ChartSpecSchema.safeParse(spec);
    expect(result.success).toBe(true);
  });

  it('should validate line chart with multiple series', () => {
    const spec = {
      type: 'line',
      title: 'Multi-Series Line Chart',
      categories: ['Jan', 'Feb', 'Mar'],
      series: [
        { label: 'Revenue', data: [1000, 1200, 1100] },
        { label: 'Costs', data: [800, 850, 900] },
      ],
    };
    const result = ChartSpecSchema.safeParse(spec);
    expect(result.success).toBe(true);
  });

  it('should validate pie chart with exactly 8 slices', () => {
    const spec = {
      type: 'pie',
      title: 'Max Slices',
      slices: Array.from({ length: 8 }, (_, i) => ({ label: `S${i}`, value: 10 + i })),
    };
    const result = ChartSpecSchema.safeParse(spec);
    expect(result.success).toBe(true);
  });

  it('should validate scatter plot with optional labels', () => {
    const spec = {
      type: 'scatter',
      title: 'Scatter with Labels',
      points: [
        { x: 1, y: 2, label: 'Point A' },
        { x: 3, y: 4, label: 'Point B' },
        { x: 5, y: 6 }, // No label
      ],
    };
    const result = ChartSpecSchema.safeParse(spec);
    expect(result.success).toBe(true);
  });

  it('should reject bar chart with invalid layout value', () => {
    const spec = {
      type: 'bar',
      title: 'Invalid Layout',
      categories: ['A'],
      series: [{ label: 'Data', data: [10] }],
      layout: 'diagonal', // Invalid
    };
    const result = ChartSpecSchema.safeParse(spec);
    expect(result.success).toBe(false);
  });

  it('should accept vertical layout for bar chart', () => {
    const spec = {
      type: 'bar',
      title: 'Vertical Bar',
      categories: ['A'],
      series: [{ label: 'Data', data: [10] }],
      layout: 'vertical',
    };
    const result = ChartSpecSchema.safeParse(spec);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.layout).toBe('vertical');
    }
  });

  it('should validate chart with all optional fields provided', () => {
    const spec = {
      type: 'bar',
      title: 'Complete Bar Chart',
      xAxisLabel: 'Month',
      yAxisLabel: 'Revenue ($M)',
      categories: ['Jan', 'Feb'],
      series: [{ label: 'Sales', data: [100, 120] }],
      layout: 'vertical',
    };
    const result = ChartSpecSchema.safeParse(spec);
    expect(result.success).toBe(true);
  });

  it('should reject empty title', () => {
    const spec = {
      type: 'bar',
      title: '',
    };
    const result = ChartSpecSchema.safeParse(spec);
    expect(result.success).toBe(false);
  });

  it('should reject missing title', () => {
    const spec = {
      type: 'bar',
    };
    const result = ChartSpecSchema.safeParse(spec);
    expect(result.success).toBe(false);
  });

  it('should reject missing type', () => {
    const spec = {
      title: 'Chart without type',
    };
    const result = ChartSpecSchema.safeParse(spec);
    expect(result.success).toBe(false);
  });

  it('should validate scatter plot with decimal coordinates', () => {
    const spec = {
      type: 'scatter',
      title: 'Scatter with Decimals',
      points: [
        { x: 1.5, y: 2.3 },
        { x: 3.7, y: 4.1 },
      ],
    };
    const result = ChartSpecSchema.safeParse(spec);
    expect(result.success).toBe(true);
  });

  it('should validate bar chart with negative values', () => {
    const spec = {
      type: 'bar',
      title: 'Bar with Negative Values',
      categories: ['A', 'B'],
      series: [{ label: 'Profit', data: [100, -50] }],
    };
    const result = ChartSpecSchema.safeParse(spec);
    expect(result.success).toBe(true);
  });

  it('should validate pie chart with decimal values', () => {
    const spec = {
      type: 'pie',
      title: 'Pie with Decimals',
      slices: [
        { label: 'A', value: 33.33 },
        { label: 'B', value: 66.67 },
      ],
    };
    const result = ChartSpecSchema.safeParse(spec);
    expect(result.success).toBe(true);
  });

  it('should reject scatter plot with string coordinates', () => {
    const spec = {
      type: 'scatter',
      title: 'Invalid Scatter',
      points: [
        { x: 'invalid', y: 2 },
      ],
    };
    const result = ChartSpecSchema.safeParse(spec);
    expect(result.success).toBe(false);
  });

  it('should reject bar chart series with string data values', () => {
    const spec = {
      type: 'bar',
      title: 'Invalid Bar Data',
      categories: ['A'],
      series: [{ label: 'Data', data: ['invalid'] }],
    };
    const result = ChartSpecSchema.safeParse(spec);
    expect(result.success).toBe(false);
  });

  it('should validate empty series array', () => {
    const spec = {
      type: 'bar',
      title: 'Empty Series',
      categories: ['A', 'B'],
      series: [],
    };
    const result = ChartSpecSchema.safeParse(spec);
    expect(result.success).toBe(true);
  });

  it('should validate empty categories array', () => {
    const spec = {
      type: 'line',
      title: 'Empty Categories',
      categories: [],
      series: [{ label: 'Data', data: [] }],
    };
    const result = ChartSpecSchema.safeParse(spec);
    expect(result.success).toBe(true);
  });

  it('should validate empty slices array', () => {
    const spec = {
      type: 'pie',
      title: 'Empty Pie',
      slices: [],
    };
    const result = ChartSpecSchema.safeParse(spec);
    expect(result.success).toBe(true);
  });

  it('should validate empty points array', () => {
    const spec = {
      type: 'scatter',
      title: 'Empty Scatter',
      points: [],
    };
    const result = ChartSpecSchema.safeParse(spec);
    expect(result.success).toBe(true);
  });

  it('should accept title with exactly 60 characters', () => {
    const spec = {
      type: 'bar',
      title: 'A'.repeat(60),
    };
    const result = ChartSpecSchema.safeParse(spec);
    expect(result.success).toBe(true);
  });

  it('should accept pie chart with single slice', () => {
    const spec = {
      type: 'pie',
      title: 'Single Slice Pie',
      slices: [{ label: 'Total', value: 100 }],
    };
    const result = ChartSpecSchema.safeParse(spec);
    expect(result.success).toBe(true);
  });
});
