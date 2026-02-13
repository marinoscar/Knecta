import { createListDatasetsTool } from './list-datasets.tool';

describe('list_datasets tool', () => {
  const mockOntologyId = 'ontology-123';
  let mockNeoOntologyService: any;

  beforeEach(() => {
    mockNeoOntologyService = {
      listDatasets: jest.fn(),
    };
  });

  it('should return formatted list of datasets', async () => {
    const mockDatasets = [
      { name: 'customers', description: 'Customer records', source: 'public.customers' },
      { name: 'orders', description: 'Order data', source: 'public.orders' },
    ];

    mockNeoOntologyService.listDatasets.mockResolvedValue(mockDatasets);

    const tool = createListDatasetsTool(mockNeoOntologyService, mockOntologyId);
    const result = await tool.invoke({});

    expect(result).toContain('customers');
    expect(result).toContain('orders');
    expect(result).toContain('2 datasets available');
    expect(mockNeoOntologyService.listDatasets).toHaveBeenCalledWith(mockOntologyId);
  });

  it('should return message when no datasets found', async () => {
    mockNeoOntologyService.listDatasets.mockResolvedValue([]);

    const tool = createListDatasetsTool(mockNeoOntologyService, mockOntologyId);
    const result = await tool.invoke({});

    expect(result).toContain('No datasets found');
  });

  it('should handle errors gracefully', async () => {
    mockNeoOntologyService.listDatasets.mockRejectedValue(new Error('Database connection failed'));

    const tool = createListDatasetsTool(mockNeoOntologyService, mockOntologyId);
    const result = await tool.invoke({});

    expect(result).toContain('Error listing datasets');
    expect(result).toContain('Database connection failed');
  });
});
