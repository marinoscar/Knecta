import { Test, TestingModule } from '@nestjs/testing';
import { NeoOntologyService } from './neo-ontology.service';
import { NeoGraphService } from '../neo-graph/neo-graph.service';
import { NeoVectorService } from '../neo-graph/neo-vector.service';
import { EmbeddingService } from '../embedding/embedding.service';

// Helper to create mock Neo4j record
const mockRecord = (data: Record<string, any>) => ({
  get: (key: string) => data[key],
});

describe('NeoOntologyService', () => {
  let service: NeoOntologyService;
  let mockNeoGraphService: any;

  beforeEach(async () => {
    mockNeoGraphService = {
      readTransaction: jest.fn(),
      writeTransaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NeoOntologyService,
        { provide: NeoGraphService, useValue: mockNeoGraphService },
        { provide: EmbeddingService, useValue: {} },
        { provide: NeoVectorService, useValue: {} },
      ],
    }).compile();

    service = module.get<NeoOntologyService>(NeoOntologyService);
  });

  describe('listDatasets', () => {
    it('should return correct structure when datasets exist', async () => {
      mockNeoGraphService.readTransaction.mockImplementation(async (work: any) => {
        const mockTx = {
          run: jest.fn().mockResolvedValue({
            records: [
              mockRecord({
                name: 'customers',
                description: 'Customer data',
                source: 'public.customers',
              }),
              mockRecord({
                name: 'orders',
                description: 'Order transactions',
                source: 'public.orders',
              }),
            ],
          }),
        };
        return work(mockTx);
      });

      const result = await service.listDatasets('ontology-123');

      expect(result).toEqual([
        { name: 'customers', description: 'Customer data', source: 'public.customers' },
        { name: 'orders', description: 'Order transactions', source: 'public.orders' },
      ]);
      expect(mockNeoGraphService.readTransaction).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no datasets found', async () => {
      mockNeoGraphService.readTransaction.mockImplementation(async (work: any) => {
        const mockTx = {
          run: jest.fn().mockResolvedValue({
            records: [],
          }),
        };
        return work(mockTx);
      });

      const result = await service.listDatasets('ontology-empty');

      expect(result).toEqual([]);
    });

    it('should handle null description and source with defaults', async () => {
      mockNeoGraphService.readTransaction.mockImplementation(async (work: any) => {
        const mockTx = {
          run: jest.fn().mockResolvedValue({
            records: [
              mockRecord({
                name: 'products',
                description: null,
                source: null,
              }),
              mockRecord({
                name: 'inventory',
                description: undefined,
                source: undefined,
              }),
            ],
          }),
        };
        return work(mockTx);
      });

      const result = await service.listDatasets('ontology-123');

      expect(result).toEqual([
        { name: 'products', description: '', source: '' },
        { name: 'inventory', description: '', source: '' },
      ]);
    });

    it('should call readTransaction with correct parameters', async () => {
      mockNeoGraphService.readTransaction.mockImplementation(async (work: any) => {
        const mockTx = {
          run: jest.fn().mockResolvedValue({ records: [] }),
        };
        return work(mockTx);
      });

      await service.listDatasets('test-ontology-id');

      const workFunction = mockNeoGraphService.readTransaction.mock.calls[0][0];
      const mockTx = { run: jest.fn().mockResolvedValue({ records: [] }) };
      await workFunction(mockTx);

      expect(mockTx.run).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (d:Dataset {ontologyId: $ontologyId})'),
        { ontologyId: 'test-ontology-id' },
      );
    });
  });

  describe('getDatasetsByNames', () => {
    it('should return matching datasets with all fields including yaml', async () => {
      const mockYaml = 'name: customers\ndescription: Customer data\n';

      mockNeoGraphService.readTransaction.mockImplementation(async (work: any) => {
        const mockTx = {
          run: jest.fn().mockResolvedValue({
            records: [
              mockRecord({
                name: 'customers',
                description: 'Customer data',
                source: 'public.customers',
                yaml: mockYaml,
              }),
            ],
          }),
        };
        return work(mockTx);
      });

      const result = await service.getDatasetsByNames('ontology-123', ['customers']);

      expect(result).toEqual([
        {
          name: 'customers',
          description: 'Customer data',
          source: 'public.customers',
          yaml: mockYaml,
        },
      ]);
    });

    it('should return empty array when no names match', async () => {
      mockNeoGraphService.readTransaction.mockImplementation(async (work: any) => {
        const mockTx = {
          run: jest.fn().mockResolvedValue({
            records: [],
          }),
        };
        return work(mockTx);
      });

      const result = await service.getDatasetsByNames('ontology-123', ['nonexistent']);

      expect(result).toEqual([]);
    });

    it('should handle subset of names matching', async () => {
      mockNeoGraphService.readTransaction.mockImplementation(async (work: any) => {
        const mockTx = {
          run: jest.fn().mockResolvedValue({
            records: [
              mockRecord({
                name: 'customers',
                description: 'Customer data',
                source: 'public.customers',
                yaml: 'name: customers\n',
              }),
            ],
          }),
        };
        return work(mockTx);
      });

      const result = await service.getDatasetsByNames('ontology-123', [
        'customers',
        'nonexistent',
      ]);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('customers');
    });

    it('should handle null/undefined fields with defaults', async () => {
      mockNeoGraphService.readTransaction.mockImplementation(async (work: any) => {
        const mockTx = {
          run: jest.fn().mockResolvedValue({
            records: [
              mockRecord({
                name: 'products',
                description: null,
                source: null,
                yaml: null,
              }),
            ],
          }),
        };
        return work(mockTx);
      });

      const result = await service.getDatasetsByNames('ontology-123', ['products']);

      expect(result).toEqual([
        { name: 'products', description: '', source: '', yaml: '' },
      ]);
    });

    it('should call readTransaction with correct parameters', async () => {
      mockNeoGraphService.readTransaction.mockImplementation(async (work: any) => {
        const mockTx = {
          run: jest.fn().mockResolvedValue({ records: [] }),
        };
        return work(mockTx);
      });

      const names = ['customers', 'orders'];
      await service.getDatasetsByNames('test-ontology', names);

      const workFunction = mockNeoGraphService.readTransaction.mock.calls[0][0];
      const mockTx = { run: jest.fn().mockResolvedValue({ records: [] }) };
      await workFunction(mockTx);

      expect(mockTx.run).toHaveBeenCalledWith(
        expect.stringContaining('WHERE d.name IN $names'),
        { ontologyId: 'test-ontology', names },
      );
    });
  });

  describe('getDatasetRelationships', () => {
    it('should return relationships with parsed columns', async () => {
      mockNeoGraphService.readTransaction.mockImplementation(async (work: any) => {
        const mockTx = {
          run: jest.fn().mockResolvedValue({
            records: [
              mockRecord({
                fromDataset: 'orders',
                toDataset: 'customers',
                name: 'order_customer',
                fromColumns: '["customer_id"]',
                toColumns: '["id"]',
              }),
            ],
          }),
        };
        return work(mockTx);
      });

      const result = await service.getDatasetRelationships('ontology-123', ['orders']);

      expect(result).toEqual([
        {
          fromDataset: 'orders',
          toDataset: 'customers',
          name: 'order_customer',
          fromColumns: '["customer_id"]',
          toColumns: '["id"]',
        },
      ]);
    });

    it('should return empty array when no relationships exist', async () => {
      mockNeoGraphService.readTransaction.mockImplementation(async (work: any) => {
        const mockTx = {
          run: jest.fn().mockResolvedValue({
            records: [],
          }),
        };
        return work(mockTx);
      });

      const result = await service.getDatasetRelationships('ontology-123', ['isolated']);

      expect(result).toEqual([]);
    });

    it('should return relationships where either from or to matches the dataset names', async () => {
      mockNeoGraphService.readTransaction.mockImplementation(async (work: any) => {
        const mockTx = {
          run: jest.fn().mockResolvedValue({
            records: [
              mockRecord({
                fromDataset: 'orders',
                toDataset: 'customers',
                name: 'order_customer',
                fromColumns: '["customer_id"]',
                toColumns: '["id"]',
              }),
              mockRecord({
                fromDataset: 'products',
                toDataset: 'orders',
                name: 'order_product',
                fromColumns: '["id"]',
                toColumns: '["product_id"]',
              }),
            ],
          }),
        };
        return work(mockTx);
      });

      const result = await service.getDatasetRelationships('ontology-123', [
        'orders',
        'customers',
      ]);

      expect(result).toHaveLength(2);
      expect(result[0].fromDataset).toBe('orders');
      expect(result[0].toDataset).toBe('customers');
      expect(result[1].fromDataset).toBe('products');
      expect(result[1].toDataset).toBe('orders');
    });

    it('should handle empty fromColumns/toColumns strings with default []', async () => {
      mockNeoGraphService.readTransaction.mockImplementation(async (work: any) => {
        const mockTx = {
          run: jest.fn().mockResolvedValue({
            records: [
              mockRecord({
                fromDataset: 'orders',
                toDataset: 'customers',
                name: 'order_customer',
                fromColumns: null,
                toColumns: null,
              }),
              mockRecord({
                fromDataset: 'products',
                toDataset: 'orders',
                name: 'order_product',
                fromColumns: undefined,
                toColumns: undefined,
              }),
            ],
          }),
        };
        return work(mockTx);
      });

      const result = await service.getDatasetRelationships('ontology-123', ['orders']);

      expect(result).toEqual([
        {
          fromDataset: 'orders',
          toDataset: 'customers',
          name: 'order_customer',
          fromColumns: '[]',
          toColumns: '[]',
        },
        {
          fromDataset: 'products',
          toDataset: 'orders',
          name: 'order_product',
          fromColumns: '[]',
          toColumns: '[]',
        },
      ]);
    });

    it('should handle empty relationship name with default', async () => {
      mockNeoGraphService.readTransaction.mockImplementation(async (work: any) => {
        const mockTx = {
          run: jest.fn().mockResolvedValue({
            records: [
              mockRecord({
                fromDataset: 'orders',
                toDataset: 'customers',
                name: null,
                fromColumns: '["customer_id"]',
                toColumns: '["id"]',
              }),
            ],
          }),
        };
        return work(mockTx);
      });

      const result = await service.getDatasetRelationships('ontology-123', ['orders']);

      expect(result[0].name).toBe('');
    });

    it('should call readTransaction with correct parameters', async () => {
      mockNeoGraphService.readTransaction.mockImplementation(async (work: any) => {
        const mockTx = {
          run: jest.fn().mockResolvedValue({ records: [] }),
        };
        return work(mockTx);
      });

      const datasetNames = ['customers', 'orders'];
      await service.getDatasetRelationships('test-ontology', datasetNames);

      const workFunction = mockNeoGraphService.readTransaction.mock.calls[0][0];
      const mockTx = { run: jest.fn().mockResolvedValue({ records: [] }) };
      await workFunction(mockTx);

      expect(mockTx.run).toHaveBeenCalledWith(
        expect.stringContaining('WHERE from.name IN $datasetNames OR to.name IN $datasetNames'),
        { ontologyId: 'test-ontology', datasetNames },
      );
    });
  });

  describe('getAllRelationships', () => {
    it('should return all relationships for an ontology with parsed columns', async () => {
      mockNeoGraphService.readTransaction.mockImplementation(async (work: any) => {
        const mockTx = {
          run: jest.fn().mockResolvedValue({
            records: [
              mockRecord({
                fromDataset: 'orders',
                toDataset: 'customers',
                name: 'order_customer',
                fromColumns: '["customer_id"]',
                toColumns: '["id"]',
              }),
              mockRecord({
                fromDataset: 'orders',
                toDataset: 'products',
                name: 'order_product',
                fromColumns: '["product_id"]',
                toColumns: '["id"]',
              }),
            ],
          }),
        };
        return work(mockTx);
      });

      const result = await service.getAllRelationships('ontology-123');

      expect(result).toEqual([
        {
          fromDataset: 'orders',
          toDataset: 'customers',
          name: 'order_customer',
          fromColumns: ['customer_id'],
          toColumns: ['id'],
        },
        {
          fromDataset: 'orders',
          toDataset: 'products',
          name: 'order_product',
          fromColumns: ['product_id'],
          toColumns: ['id'],
        },
      ]);
    });

    it('should return empty array when no relationships exist', async () => {
      mockNeoGraphService.readTransaction.mockImplementation(async (work: any) => {
        const mockTx = {
          run: jest.fn().mockResolvedValue({
            records: [],
          }),
        };
        return work(mockTx);
      });

      const result = await service.getAllRelationships('ontology-empty');

      expect(result).toEqual([]);
    });

    it('should handle null/missing fields gracefully with defaults', async () => {
      mockNeoGraphService.readTransaction.mockImplementation(async (work: any) => {
        const mockTx = {
          run: jest.fn().mockResolvedValue({
            records: [
              mockRecord({
                fromDataset: 'orders',
                toDataset: 'customers',
                name: null,
                fromColumns: null,
                toColumns: null,
              }),
              mockRecord({
                fromDataset: 'products',
                toDataset: 'categories',
                name: undefined,
                fromColumns: undefined,
                toColumns: undefined,
              }),
            ],
          }),
        };
        return work(mockTx);
      });

      const result = await service.getAllRelationships('ontology-123');

      expect(result).toEqual([
        {
          fromDataset: 'orders',
          toDataset: 'customers',
          name: '',
          fromColumns: [],
          toColumns: [],
        },
        {
          fromDataset: 'products',
          toDataset: 'categories',
          name: '',
          fromColumns: [],
          toColumns: [],
        },
      ]);
    });
  });

  describe('findJoinPaths', () => {
    it('should return shortest path between two datasets', async () => {
      mockNeoGraphService.readTransaction.mockImplementation(async (work: any) => {
        const mockTx = {
          run: jest.fn().mockResolvedValue({
            records: [
              mockRecord({
                pathNames: ['orders', 'customers'],
                rels: [
                  {
                    from: 'orders',
                    to: 'customers',
                    name: 'order_customer',
                    fromColumns: '["customer_id"]',
                    toColumns: '["id"]',
                  },
                ],
              }),
            ],
          }),
        };
        return work(mockTx);
      });

      const result = await service.findJoinPaths('ontology-123', 'orders', 'customers');

      expect(result).toEqual([
        {
          datasets: ['orders', 'customers'],
          edges: [
            {
              fromDataset: 'orders',
              toDataset: 'customers',
              name: 'order_customer',
              fromColumns: ['customer_id'],
              toColumns: ['id'],
            },
          ],
        },
      ]);
    });

    it('should return empty array when no path exists', async () => {
      mockNeoGraphService.readTransaction.mockImplementation(async (work: any) => {
        const mockTx = {
          run: jest.fn().mockResolvedValue({
            records: [],
          }),
        };
        return work(mockTx);
      });

      const result = await service.findJoinPaths('ontology-123', 'isolated1', 'isolated2');

      expect(result).toEqual([]);
    });

    it('should return multiple paths if available', async () => {
      mockNeoGraphService.readTransaction.mockImplementation(async (work: any) => {
        const mockTx = {
          run: jest.fn().mockResolvedValue({
            records: [
              mockRecord({
                pathNames: ['orders', 'customers'],
                rels: [
                  {
                    from: 'orders',
                    to: 'customers',
                    name: 'order_customer',
                    fromColumns: '["customer_id"]',
                    toColumns: '["id"]',
                  },
                ],
              }),
              mockRecord({
                pathNames: ['orders', 'payments', 'customers'],
                rels: [
                  {
                    from: 'orders',
                    to: 'payments',
                    name: 'order_payment',
                    fromColumns: '["id"]',
                    toColumns: '["order_id"]',
                  },
                  {
                    from: 'payments',
                    to: 'customers',
                    name: 'payment_customer',
                    fromColumns: '["customer_id"]',
                    toColumns: '["id"]',
                  },
                ],
              }),
            ],
          }),
        };
        return work(mockTx);
      });

      const result = await service.findJoinPaths('ontology-123', 'orders', 'customers');

      expect(result).toHaveLength(2);
      expect(result[0].datasets).toEqual(['orders', 'customers']);
      expect(result[1].datasets).toEqual(['orders', 'payments', 'customers']);
    });
  });
});
