import { buildChartSpecPrompt } from '../executor.prompt';

describe('buildChartSpecPrompt', () => {
  it('should include chart type and step description', () => {
    const prompt = buildChartSpecPrompt(
      'Create revenue by region chart',
      'bar',
      'region | revenue\n--- | ---\nNorth | 100\nSouth | 80',
      '',
    );

    expect(prompt).toContain('bar');
    expect(prompt).toContain('Create revenue by region chart');
  });

  it('should include SQL data when provided', () => {
    const sqlData = 'region | revenue\n--- | ---\nNorth | 100\nSouth | 80';
    const prompt = buildChartSpecPrompt('Create chart', 'bar', sqlData, '');

    expect(prompt).toContain('SQL Query Results');
    expect(prompt).toContain('North | 100');
  });

  it('should not include SQL section when data is null', () => {
    const prompt = buildChartSpecPrompt('Create chart', 'line', null, '');

    expect(prompt).not.toContain('SQL Query Results');
  });

  it('should include prior context when provided', () => {
    const priorContext = 'Step 1: Total revenue = $1M';
    const prompt = buildChartSpecPrompt('Create chart', 'pie', null, priorContext);

    expect(prompt).toContain('Results from Prior Steps');
    expect(prompt).toContain('Total revenue = $1M');
  });

  it('should not include prior context section when empty', () => {
    const prompt = buildChartSpecPrompt('Create chart', 'scatter', null, '');

    expect(prompt).not.toContain('Results from Prior Steps');
  });

  it('should include bar chart rules for bar type', () => {
    const prompt = buildChartSpecPrompt('Create chart', 'bar', null, '');

    expect(prompt).toContain('categories');
    expect(prompt).toContain('series');
    expect(prompt).toContain('layout');
  });

  it('should include pie chart rules for pie type', () => {
    const prompt = buildChartSpecPrompt('Create chart', 'pie', null, '');

    expect(prompt).toContain('slices');
    expect(prompt).toContain('Maximum 8 slices');
  });

  it('should include scatter plot rules for scatter type', () => {
    const prompt = buildChartSpecPrompt('Create chart', 'scatter', null, '');

    expect(prompt).toContain('points');
    expect(prompt).toContain('x and y');
  });

  it('should include line chart rules for line type', () => {
    const prompt = buildChartSpecPrompt('Create chart', 'line', null, '');

    expect(prompt).toContain('time ordering');
    expect(prompt).toContain('time labels');
  });

  it('should include general extraction rules', () => {
    const prompt = buildChartSpecPrompt('Create chart', 'bar', null, '');

    expect(prompt).toContain('Extraction Rules');
    expect(prompt).toContain('max 25 characters');
    expect(prompt).toContain('Round all numbers to 2 decimal places');
  });

  it('should include output format instructions', () => {
    const prompt = buildChartSpecPrompt('Create chart', 'bar', null, '');

    expect(prompt).toContain('Output Format');
    expect(prompt).toContain('ChartSpec schema');
  });

  it('should include both SQL data and prior context when both provided', () => {
    const sqlData = 'month | sales\n--- | ---\nJan | 1000';
    const priorContext = 'Step 1: Total sales = $5000';
    const prompt = buildChartSpecPrompt('Create monthly chart', 'line', sqlData, priorContext);

    expect(prompt).toContain('SQL Query Results');
    expect(prompt).toContain('Jan | 1000');
    expect(prompt).toContain('Results from Prior Steps');
    expect(prompt).toContain('Total sales = $5000');
  });

  it('should handle empty strings for optional parameters', () => {
    const prompt = buildChartSpecPrompt('Create chart', 'bar', '', '');

    expect(prompt).toContain('Create chart');
    expect(prompt).toContain('bar');
    expect(prompt).not.toContain('SQL Query Results');
    expect(prompt).not.toContain('Results from Prior Steps');
  });

  it('should include chart type in extraction rules section', () => {
    const prompt = buildChartSpecPrompt('Create chart', 'pie', null, '');

    expect(prompt).toContain('Extract ONLY the data needed for the pie chart');
  });

  it('should include all four chart types in bar chart rules', () => {
    const prompt = buildChartSpecPrompt('Create chart', 'bar', null, '');

    expect(prompt).toContain('Bar Chart Rules (type: "bar")');
  });

  it('should include horizontal layout option in bar chart rules', () => {
    const prompt = buildChartSpecPrompt('Create chart', 'bar', null, '');

    expect(prompt).toContain('layout: "horizontal"');
    expect(prompt).toContain('layout: "vertical"');
  });

  it('should include schema enforcement note', () => {
    const prompt = buildChartSpecPrompt('Create chart', 'bar', null, '');

    expect(prompt).toContain('schema validator will enforce');
    expect(prompt).toContain('type');
    expect(prompt).toContain('title');
  });
});
