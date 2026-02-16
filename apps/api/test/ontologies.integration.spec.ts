import request from 'supertest';
import {
  TestContext,
  createTestApp,
  closeTestApp,
} from './helpers/test-app.helper';
import { resetPrismaMock } from './mocks/prisma.mock';
import { setupBaseMocks } from './fixtures/mock-setup.helper';
import {
  createMockAdminUser,
  createMockContributorUser,
  createMockViewerUser,
  authHeader,
} from './helpers/auth-mock.helper';
import {
  createMockOntology,
  createMockSemanticModel,
} from './fixtures/test-data.factory';
import { randomBytes } from 'crypto';
import { NeoOntologyService } from '../src/ontologies/neo-ontology.service';

describe('Ontologies (Integration)', () => {
  let context: TestContext;

  beforeAll(async () => {
    // Set encryption key for tests
    process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
    context = await createTestApp({ useMockDatabase: true });
  });

  afterAll(async () => {
    await closeTestApp(context);
  });

  beforeEach(async () => {
    resetPrismaMock();
    setupBaseMocks();
  });

  // ==========================================================================
  // GET /api/ontologies
  // ==========================================================================

  describe('GET /api/ontologies', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .get('/api/ontologies')
        .expect(401);
    });

    it('should return empty list when no ontologies', async () => {
      const contributor = await createMockContributorUser(context);

      context.prismaMock.ontology.findMany.mockResolvedValue([]);
      context.prismaMock.ontology.count.mockResolvedValue(0);

      const response = await request(context.app.getHttpServer())
        .get('/api/ontologies')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data.items).toEqual([]);
      expect(response.body.data.total).toBe(0);
      expect(response.body.data).toHaveProperty('page');
      expect(response.body.data).toHaveProperty('pageSize');
      expect(response.body.data).toHaveProperty('totalPages');
    });

    it('should return paginated ontologies', async () => {
      const contributor = await createMockContributorUser(context);

      const mockSemanticModel = createMockSemanticModel({
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Test Model',
        connectionId: '33333333-3333-3333-3333-333333333333',
        createdByUserId: contributor.id,
      });

      const mockOntologies = [
        createMockOntology({
          id: '44444444-4444-4444-4444-444444444444',
          name: 'Ontology 1',
          semanticModelId: mockSemanticModel.id,
          createdByUserId: contributor.id,
        }),
        createMockOntology({
          id: '55555555-5555-5555-5555-555555555555',
          name: 'Ontology 2',
          semanticModelId: mockSemanticModel.id,
          createdByUserId: contributor.id,
        }),
      ];

      // Include semantic model in response
      const ontologiesWithModel = mockOntologies.map((ont) => ({
        ...ont,
        semanticModel: {
          name: mockSemanticModel.name,
          status: mockSemanticModel.status,
        },
      }));

      context.prismaMock.ontology.findMany.mockResolvedValue(
        ontologiesWithModel,
      );
      context.prismaMock.ontology.count.mockResolvedValue(2);

      const response = await request(context.app.getHttpServer())
        .get('/api/ontologies')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data.items).toHaveLength(2);
      expect(response.body.data.total).toBe(2);
      expect(response.body.data.items[0]).toHaveProperty('status');
      expect(response.body.data.items[0]).toHaveProperty('semanticModel');
      expect(response.body.data.items[0].semanticModel).toHaveProperty('name');
      expect(response.body.data.items[0].semanticModel).toHaveProperty(
        'status',
      );
    });

    it('should filter by status', async () => {
      const contributor = await createMockContributorUser(context);

      const mockOntologies = [
        createMockOntology({
          id: '44444444-4444-4444-4444-444444444444',
          name: 'Ready Ontology',
          semanticModelId: '11111111-1111-1111-1111-111111111111',
          status: 'ready',
          createdByUserId: contributor.id,
        }),
      ];

      context.prismaMock.ontology.findMany.mockResolvedValue(mockOntologies);
      context.prismaMock.ontology.count.mockResolvedValue(1);

      await request(context.app.getHttpServer())
        .get('/api/ontologies?status=ready')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      // Verify the mock was called with status filter
      expect(context.prismaMock.ontology.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ready',
          }),
        }),
      );
    });

    it('should search by name', async () => {
      const contributor = await createMockContributorUser(context);

      const mockOntologies = [
        createMockOntology({
          id: '44444444-4444-4444-4444-444444444444',
          name: 'Sales Ontology',
          semanticModelId: '11111111-1111-1111-1111-111111111111',
          createdByUserId: contributor.id,
        }),
      ];

      context.prismaMock.ontology.findMany.mockResolvedValue(mockOntologies);
      context.prismaMock.ontology.count.mockResolvedValue(1);

      await request(context.app.getHttpServer())
        .get('/api/ontologies?search=Sales')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      // Verify the mock was called with search filter (OR condition for name and description)
      expect(context.prismaMock.ontology.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({
                name: expect.objectContaining({
                  contains: 'Sales',
                }),
              }),
            ]),
          }),
        }),
      );
    });

  });

  // ==========================================================================
  // GET /api/ontologies/:id
  // ==========================================================================

  describe('GET /api/ontologies/:id', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .get('/api/ontologies/123e4567-e89b-12d3-a456-426614174001')
        .expect(401);
    });

    it('should return 404 for non-existent ontology', async () => {
      const contributor = await createMockContributorUser(context);

      context.prismaMock.ontology.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .get('/api/ontologies/123e4567-e89b-12d3-a456-426614174999')
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });

    it('should return ontology details', async () => {
      const contributor = await createMockContributorUser(context);

      const mockSemanticModel = createMockSemanticModel({
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Test Model',
        connectionId: '33333333-3333-3333-3333-333333333333',
        createdByUserId: contributor.id,
      });

      const mockOntology = createMockOntology({
        id: '123e4567-e89b-12d3-a456-426614174001',
        name: 'Test Ontology',
        description: 'Test description',
        semanticModelId: mockSemanticModel.id,
        createdByUserId: contributor.id,
      });

      // Include semantic model in response
      const ontologyWithModel = {
        ...mockOntology,
        semanticModel: {
          name: mockSemanticModel.name,
          status: mockSemanticModel.status,
        },
      };

      context.prismaMock.ontology.findUnique.mockResolvedValue(
        ontologyWithModel,
      );

      const response = await request(context.app.getHttpServer())
        .get('/api/ontologies/123e4567-e89b-12d3-a456-426614174001')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data).toHaveProperty(
        'id',
        '123e4567-e89b-12d3-a456-426614174001',
      );
      expect(response.body.data).toHaveProperty('name', 'Test Ontology');
      expect(response.body.data).toHaveProperty('description');
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data).toHaveProperty('nodeCount');
      expect(response.body.data).toHaveProperty('relationshipCount');
      expect(response.body.data.semanticModel).toEqual({
        name: mockSemanticModel.name,
        status: mockSemanticModel.status,
      });
    });

  });

  // ==========================================================================
  // POST /api/ontologies
  // ==========================================================================

  describe('POST /api/ontologies', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .post('/api/ontologies')
        .send({
          name: 'Test Ontology',
          semanticModelId: '11111111-1111-1111-1111-111111111111',
        })
        .expect(401);
    });

    it('should return 403 for viewer without write permission', async () => {
      const viewer = await createMockViewerUser(context);

      await request(context.app.getHttpServer())
        .post('/api/ontologies')
        .set(authHeader(viewer.accessToken))
        .send({
          name: 'Test Ontology',
          semanticModelId: '11111111-1111-1111-1111-111111111111',
        })
        .expect(403);
    });

    it('should return 400 if semantic model not found', async () => {
      const contributor = await createMockContributorUser(context);

      context.prismaMock.semanticModel.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .post('/api/ontologies')
        .set(authHeader(contributor.accessToken))
        .send({
          name: 'Test Ontology',
          semanticModelId: '123e4567-e89b-12d3-a456-426614174999',
        })
        .expect(404);
    });

    it('should return 400 if semantic model not ready', async () => {
      const contributor = await createMockContributorUser(context);

      const mockSemanticModel = createMockSemanticModel({
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Test Model',
        connectionId: '33333333-3333-3333-3333-333333333333',
        status: 'generating', // Not ready
        createdByUserId: contributor.id,
      });

      context.prismaMock.semanticModel.findUnique.mockResolvedValue(
        mockSemanticModel,
      );

      await request(context.app.getHttpServer())
        .post('/api/ontologies')
        .set(authHeader(contributor.accessToken))
        .send({
          name: 'Test Ontology',
          semanticModelId: '11111111-1111-1111-1111-111111111111',
        })
        .expect(400);
    });

    it('should create ontology successfully', async () => {
      const contributor = await createMockContributorUser(context);

      const mockSemanticModel = createMockSemanticModel({
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Test Model',
        connectionId: '33333333-3333-3333-3333-333333333333',
        status: 'ready',
        createdByUserId: contributor.id,
        model: {
          semantic_model: [
            {
              name: 'Test',
              datasets: [
                {
                  name: 'users',
                  source: 'db.public.users',
                  description: 'User table',
                  fields: [
                    {
                      name: 'id',
                      expression: {
                        dialects: [{ dialect: 'ANSI_SQL', expression: 'id' }],
                      },
                    },
                  ],
                },
              ],
              relationships: [],
            },
          ],
        },
      });

      const mockOntology = createMockOntology({
        id: '44444444-4444-4444-4444-444444444444',
        name: 'Test Ontology',
        description: 'Test description',
        semanticModelId: mockSemanticModel.id,
        status: 'ready',
        nodeCount: 25,
        relationshipCount: 30,
        createdByUserId: contributor.id,
      });

      const ontologyWithModel = {
        ...mockOntology,
        semanticModel: {
          name: mockSemanticModel.name,
          status: mockSemanticModel.status,
        },
      };

      context.prismaMock.semanticModel.findUnique.mockResolvedValue(
        mockSemanticModel,
      );

      // First create call returns with status 'creating'
      context.prismaMock.ontology.create.mockResolvedValue({
        ...mockOntology,
        status: 'creating',
        nodeCount: null,
        relationshipCount: null,
      } as any);

      // Update call returns with status 'ready' and counts
      context.prismaMock.ontology.update.mockResolvedValue(
        ontologyWithModel as any,
      );

      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      // Mock NeoOntologyService.createGraph
      const mockNeoOntologyService =
        context.module.get(NeoOntologyService) as any;
      if (mockNeoOntologyService && mockNeoOntologyService.createGraph) {
        mockNeoOntologyService.createGraph.mockResolvedValue({
          nodeCount: 25,
          relationshipCount: 30,
        });
      }

      const response = await request(context.app.getHttpServer())
        .post('/api/ontologies')
        .set(authHeader(contributor.accessToken))
        .send({
          name: 'Test Ontology',
          description: 'Test description',
          semanticModelId: '11111111-1111-1111-1111-111111111111',
        })
        .expect(201);

      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('name', 'Test Ontology');
      expect(response.body.data).toHaveProperty('status', 'ready');
      expect(response.body.data).toHaveProperty('nodeCount', 25);
      expect(response.body.data).toHaveProperty('relationshipCount', 30);
      expect(context.prismaMock.ontology.create).toHaveBeenCalled();
      expect(context.prismaMock.ontology.update).toHaveBeenCalled();

      // Verify createdByUserId is passed (system-level resource)
      expect(context.prismaMock.ontology.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            createdByUserId: contributor.id,
          }),
        }),
      );

      // Verify ownerId is NOT used (regression guard)
      expect(context.prismaMock.ontology.create).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ownerId: expect.anything(),
          }),
        }),
      );
    });

    it('should handle Neo4j failure gracefully', async () => {
      const contributor = await createMockContributorUser(context);

      const mockSemanticModel = createMockSemanticModel({
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Test Model',
        connectionId: '33333333-3333-3333-3333-333333333333',
        status: 'ready',
        createdByUserId: contributor.id,
        model: {
          semantic_model: [
            {
              name: 'Test',
              datasets: [],
              relationships: [],
            },
          ],
        },
      });

      const mockOntology = createMockOntology({
        id: '44444444-4444-4444-4444-444444444444',
        name: 'Test Ontology',
        semanticModelId: mockSemanticModel.id,
        status: 'failed',
        errorMessage: 'Neo4j connection failed',
        nodeCount: null,
        relationshipCount: null,
        createdByUserId: contributor.id,
      });

      context.prismaMock.semanticModel.findUnique.mockResolvedValue(
        mockSemanticModel,
      );

      // First create call returns with status 'creating'
      context.prismaMock.ontology.create.mockResolvedValue({
        ...mockOntology,
        status: 'creating',
        errorMessage: null,
      } as any);

      // Update call returns with status 'failed'
      context.prismaMock.ontology.update.mockResolvedValue(mockOntology as any);

      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      // Mock NeoOntologyService.createGraph to throw error
      const mockNeoOntologyService =
        context.module.get(NeoOntologyService) as any;
      if (mockNeoOntologyService && mockNeoOntologyService.createGraph) {
        mockNeoOntologyService.createGraph.mockRejectedValue(
          new Error('Neo4j connection failed'),
        );
      }

      const response = await request(context.app.getHttpServer())
        .post('/api/ontologies')
        .set(authHeader(contributor.accessToken))
        .send({
          name: 'Test Ontology',
          semanticModelId: '11111111-1111-1111-1111-111111111111',
        })
        .expect(201);

      expect(response.body.data).toHaveProperty('status', 'failed');
      expect(response.body.data).toHaveProperty('errorMessage');
      expect(response.body.data.nodeCount).toBeNull();
      expect(response.body.data.relationshipCount).toBeNull();
    });
  });

  // ==========================================================================
  // DELETE /api/ontologies/:id
  // ==========================================================================

  describe('DELETE /api/ontologies/:id', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .delete('/api/ontologies/123e4567-e89b-12d3-a456-426614174001')
        .expect(401);
    });

    it('should return 403 for viewer without delete permission', async () => {
      const viewer = await createMockViewerUser(context);

      await request(context.app.getHttpServer())
        .delete('/api/ontologies/123e4567-e89b-12d3-a456-426614174001')
        .set(authHeader(viewer.accessToken))
        .expect(403);
    });

    it('should return 404 for non-existent ontology', async () => {
      const contributor = await createMockContributorUser(context);

      context.prismaMock.ontology.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .delete('/api/ontologies/123e4567-e89b-12d3-a456-426614174999')
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });

    it('should delete ontology successfully', async () => {
      const contributor = await createMockContributorUser(context);

      const mockOntology = createMockOntology({
        id: '123e4567-e89b-12d3-a456-426614174001',
        name: 'To Delete',
        semanticModelId: '11111111-1111-1111-1111-111111111111',
        createdByUserId: contributor.id,
      });

      context.prismaMock.ontology.findUnique.mockResolvedValue(mockOntology);
      context.prismaMock.ontology.delete.mockResolvedValue(mockOntology);
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      // Mock NeoOntologyService.deleteGraph
      const mockNeoOntologyService =
        context.module.get(NeoOntologyService) as any;
      if (mockNeoOntologyService && mockNeoOntologyService.deleteGraph) {
        mockNeoOntologyService.deleteGraph.mockResolvedValue(undefined);
      }

      await request(context.app.getHttpServer())
        .delete('/api/ontologies/123e4567-e89b-12d3-a456-426614174001')
        .set(authHeader(contributor.accessToken))
        .expect(204);

      expect(context.prismaMock.ontology.delete).toHaveBeenCalledWith({
        where: { id: '123e4567-e89b-12d3-a456-426614174001' },
      });
    });
  });

  // ==========================================================================
  // GET /api/ontologies/:id/graph
  // ==========================================================================

  describe('GET /api/ontologies/:id/graph', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .get('/api/ontologies/123e4567-e89b-12d3-a456-426614174001/graph')
        .expect(401);
    });

    it('should return graph data for ready ontology', async () => {
      const contributor = await createMockContributorUser(context);

      const mockOntology = createMockOntology({
        id: '123e4567-e89b-12d3-a456-426614174001',
        name: 'Test Ontology',
        semanticModelId: '11111111-1111-1111-1111-111111111111',
        status: 'ready',
        createdByUserId: contributor.id,
      });

      const mockGraph = {
        nodes: [
          {
            id: '1',
            label: 'Dataset',
            name: 'users',
            properties: { source: 'db.public.users' },
          },
          {
            id: '2',
            label: 'Field',
            name: 'id',
            properties: { expression: 'id' },
          },
        ],
        edges: [
          {
            id: '3',
            source: '1',
            target: '2',
            type: 'HAS_FIELD',
            properties: {},
          },
        ],
      };

      context.prismaMock.ontology.findUnique.mockResolvedValue(mockOntology);

      // Mock NeoOntologyService.getGraph
      const mockNeoOntologyService =
        context.module.get(NeoOntologyService) as any;
      if (mockNeoOntologyService && mockNeoOntologyService.getGraph) {
        mockNeoOntologyService.getGraph.mockResolvedValue(mockGraph);
      }

      const response = await request(context.app.getHttpServer())
        .get('/api/ontologies/123e4567-e89b-12d3-a456-426614174001/graph')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data).toHaveProperty('nodes');
      expect(response.body.data).toHaveProperty('edges');
      expect(Array.isArray(response.body.data.nodes)).toBe(true);
      expect(Array.isArray(response.body.data.edges)).toBe(true);
      expect(response.body.data.nodes).toHaveLength(2);
      expect(response.body.data.edges).toHaveLength(1);
    });

    it('should return 400 for non-ready ontology', async () => {
      const contributor = await createMockContributorUser(context);

      const mockOntology = createMockOntology({
        id: '123e4567-e89b-12d3-a456-426614174001',
        name: 'Test Ontology',
        semanticModelId: '11111111-1111-1111-1111-111111111111',
        status: 'creating', // Not ready
        createdByUserId: contributor.id,
      });

      context.prismaMock.ontology.findUnique.mockResolvedValue(mockOntology);

      await request(context.app.getHttpServer())
        .get('/api/ontologies/123e4567-e89b-12d3-a456-426614174001/graph')
        .set(authHeader(contributor.accessToken))
        .expect(400);
    });

    it('should return 404 for non-existent ontology', async () => {
      const contributor = await createMockContributorUser(context);

      context.prismaMock.ontology.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .get('/api/ontologies/123e4567-e89b-12d3-a456-426614174999/graph')
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });
  });
});
