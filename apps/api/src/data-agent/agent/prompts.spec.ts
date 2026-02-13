import { buildDataAgentSystemPrompt } from './prompts';

describe('buildDataAgentSystemPrompt', () => {
  const mockDatasets = [
    { name: 'customers', description: 'Customer records', yaml: 'name: customers\nfields: []', score: 0.9 },
  ];
  const mockRelationships = [
    {
      fromDataset: 'orders',
      toDataset: 'customers',
      name: 'orders_customer',
      fromColumns: '["customer_id"]',
      toColumns: '["id"]',
    },
  ];

  it('should include dataset YAML', () => {
    const prompt = buildDataAgentSystemPrompt(mockDatasets, 'PostgreSQL', '', []);

    expect(prompt).toContain('customers');
    expect(prompt).toContain('Customer records');
    expect(prompt).toContain('```yaml');
    expect(prompt).toContain('name: customers\nfields: []');
  });

  it('should include relationship join hints', () => {
    const prompt = buildDataAgentSystemPrompt(mockDatasets, 'PostgreSQL', '', mockRelationships);

    expect(prompt).toContain('Relationships (Join Hints)');
    expect(prompt).toContain('orders_customer');
    expect(prompt).toContain('customer_id');
    expect(prompt).toContain('id');
  });

  it('should omit relationships section when empty', () => {
    const prompt = buildDataAgentSystemPrompt(mockDatasets, 'PostgreSQL', '', []);

    expect(prompt).not.toContain('Relationships (Join Hints)');
  });

  it('should show discovery guidance when no datasets', () => {
    const prompt = buildDataAgentSystemPrompt([], 'PostgreSQL', '', []);

    expect(prompt).toContain('list_datasets');
    expect(prompt).toContain('No datasets matched your question');
    expect(prompt).toContain('get_dataset_details');
  });

  it('should include enhanced instructions', () => {
    const prompt = buildDataAgentSystemPrompt(mockDatasets, 'PostgreSQL', '', []);

    expect(prompt).toContain('Recover from errors');
    expect(prompt).toContain('0 rows returned');
    expect(prompt).toContain('COALESCE');
    expect(prompt).toContain('DATE_TRUNC');
  });

  it('should include conversation context', () => {
    const conversationContext = 'User previously asked about sales data.';
    const prompt = buildDataAgentSystemPrompt(mockDatasets, 'PostgreSQL', conversationContext, []);

    expect(prompt).toContain('User previously asked about sales data.');
  });

  it('should show default when no conversation', () => {
    const prompt = buildDataAgentSystemPrompt(mockDatasets, 'PostgreSQL', '', []);

    expect(prompt).toContain('This is the start of the conversation.');
  });
});
