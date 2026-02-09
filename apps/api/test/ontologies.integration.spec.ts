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
        id: 'sm-uuid-1',
        name: 'Test Model',
        connectionId: 'conn-uuid-1',
        ownerId: contributor.id,
      });

      const mockOntologies = [
        createMockOntology({
          id: 'ont-uuid-1',
          name: 'Ontology 1',
          semanticModelId: mockSemanticModel.id,
          ownerId: contributor.id,
        }),
        createMockOntology({
          id: 'ont-uuid-2',
          name: 'Ontology 2',
          semanticModelId: mockSemanticModel.id,
          ownerId: contributor.id,
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
          id: 'ont-uuid-1',
          name: 'Ready Ontology',
          semanticModelId: 'sm-uuid-1',
          status: 'ready',
          ownerId: contributor.id,
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
          id: 'ont-uuid-1',
          name: 'Sales Ontology',
          semanticModelId: 'sm-uuid-1',
          ownerId: contributor.id,
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

    it("should only return user's own ontologies (ownership isolation)", async () => {
      const contributor = await createMockContributorUser(context);

      const mockOntologies = [
        createMockOntology({
          id: 'ont-uuid-1',
          name: 'My Ontology',
          semanticModelId: 'sm-uuid-1',
          ownerId: contributor.id,
        }),
      ];

      context.prismaMock.ontology.findMany.mockResolvedValue(mockOntologies);
      context.prismaMock.ontology.count.mockResolvedValue(1);

      await request(context.app.getHttpServer())
        .get('/api/ontologies')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      // Verify the mock was called with ownerId filter
      expect(context.prismaMock.ontology.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ownerId: contributor.id,
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

      context.prismaMock.ontology.findFirst.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .get('/api/ontologies/123e4567-e89b-12d3-a456-426614174999')
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });

    it('should return ontology details', async () => {
      const contributor = await createMockContributorUser(context);

      const mockSemanticModel = createMockSemanticModel({
        id: 'sm-uuid-1',
        name: 'Test Model',
        connectionId: 'conn-uuid-1',
        ownerId: contributor.id,
      });

      const mockOntology = createMockOntology({
        id: '123e4567-e89b-12d3-a456-426614174001',
        name: 'Test Ontology',
        description: 'Test description',
        semanticModelId: mockSemanticModel.id,
        ownerId: contributor.id,
      });

      // Include semantic model in response
      const ontologyWithModel = {
        ...mockOntology,
        semanticModel: {
          name: mockSemanticModel.name,
          status: mockSemanticModel.status,
        },
      };

      context.prismaMock.ontology.findFirst.mockResolvedValue(
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

    it("should return 404 for other user's ontology", async () => {
      const contributor = await createMockContributorUser(context);

      // Mock returns null because ownerId doesn't match
      context.prismaMock.ontology.findFirst.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .get('/api/ontologies/123e4567-e89b-12d3-a456-426614174001')
        .set(authHeader(contributor.accessToken))
        .expect(404);

      // Verify the query included ownerId filter
      expect(context.prismaMock.ontology.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ownerId: contributor.id,
          }),
        }),
      );
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
          semanticModelId: 'sm-uuid-1',
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
          semanticModelId: 'sm-uuid-1',
        })
        .expect(403);
    });

    it('should return 400 if semantic model not found', async () => {
      const contributor = await createMockContributorUser(context);

      context.prismaMock.semanticModel.findFirst.mockResolvedValue(null);

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
        id: 'sm-uuid-1',
        name: 'Test Model',
        connectionId: 'conn-uuid-1',
        status: 'generating', // Not ready
        ownerId: contributor.id,
      });

      context.prismaMock.semanticModel.findFirst.mockResolvedValue(
        mockSemanticModel,
      );

      await request(context.app.getHttpServer())
        .post('/api/ontologies')
        .set(authHeader(contributor.accessToken))
        .send({
          name: 'Test Ontology',
          semanticModelId: 'sm-uuid-1',
        })
        .expect(400);
    });

    it('should create ontology successfully', async () => {
      const contributor = await createMockContributorUser(context);

      const mockSemanticModel = createMockSemanticModel({
        id: 'sm-uuid-1',
        name: 'Test Model',
        connectionId: 'conn-uuid-1',
        status: 'ready',
        ownerId: contributor.id,
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
        id: 'ont-uuid-1',
        name: 'Test Ontology',
        description: 'Test description',
        semanticModelId: mockSemanticModel.id,
        status: 'ready',
        nodeCount: 25,
        relationshipCount: 30,
        ownerId: contributor.id,
      });

      const ontologyWithModel = {
        ...mockOntology,
        semanticModel: {
          name: mockSemanticModel.name,
          status: mockSemanticModel.status,
        },
      };

      context.prismaMock.semanticModel.findFirst.mockResolvedValue(
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
        context.app.get('NeoOntologyService') as any;
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
          semanticModelId: 'sm-uuid-1',
        })
        .expect(201);

      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('name', 'Test Ontology');
      expect(response.body.data).toHaveProperty('status', 'ready');
      expect(response.body.data).toHaveProperty('nodeCount', 25);
      expect(response.body.data).toHaveProperty('relationshipCount', 30);
      expect(context.prismaMock.ontology.create).toHaveBeenCalled();
      expect(context.prismaMock.ontology.update).toHaveBeenCalled();
    });

    it('should handle Neo4j failure gracefully', async () => {
      const contributor = await createMockContributorUser(context);

      const mockSemanticModel = createMockSemanticModel({
        id: 'sm-uuid-1',
        name: 'Test Model',
        connectionId: 'conn-uuid-1',
        status: 'ready',
        ownerId: contributor.id,
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
        id: 'ont-uuid-1',
        name: 'Test Ontology',
        semanticModelId: mockSemanticModel.id,
        status: 'failed',
        errorMessage: 'Neo4j connection failed',
        nodeCount: null,
        relationshipCount: null,
        ownerId: contributor.id,
      });

      context.prismaMock.semanticModel.findFirst.mockResolvedValue(
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
        context.app.get('NeoOntologyService') as any;
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
          semanticModelId: 'sm-uuid-1',
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

      context.prismaMock.ontology.findFirst.mockResolvedValue(null);

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
        semanticModelId: 'sm-uuid-1',
        ownerId: contributor.id,
      });

      context.prismaMock.ontology.findFirst.mockResolvedValue(mockOntology);
      context.prismaMock.ontology.delete.mockResolvedValue(mockOntology);
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      // Mock NeoOntologyService.deleteGraph
      const mockNeoOntologyService =
        context.app.get('NeoOntologyService') as any;
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
        semanticModelId: 'sm-uuid-1',
        status: 'ready',
        ownerId: contributor.id,
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

      context.prismaMock.ontology.findFirst.mockResolvedValue(mockOntology);

      // Mock NeoOntologyService.getGraph
      const mockNeoOntologyService =
        context.app.get('NeoOntologyService') as any;
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
        semanticModelId: 'sm-uuid-1',
        status: 'creating', // Not ready
        ownerId: contributor.id,
      });

      context.prismaMock.ontology.findFirst.mockResolvedValue(mockOntology);

      await request(context.app.getHttpServer())
        .get('/api/ontologies/123e4567-e89b-12d3-a456-426614174001/graph')
        .set(authHeader(contributor.accessToken))
        .expect(400);
    });

    it('should return 404 for non-existent ontology', async () => {
      const contributor = await createMockContributorUser(context);

      context.prismaMock.ontology.findFirst.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .get('/api/ontologies/123e4567-e89b-12d3-a456-426614174999/graph')
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });
  });
});
