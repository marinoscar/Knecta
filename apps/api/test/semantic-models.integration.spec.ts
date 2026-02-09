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
  createMockConnection,
  createMockSemanticModel,
  createMockSemanticModelRun,
} from './fixtures/test-data.factory';
import { randomBytes } from 'crypto';

describe('Semantic Models (Integration)', () => {
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
  // GET /api/semantic-models
  // ==========================================================================

  describe('GET /api/semantic-models', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .get('/api/semantic-models')
        .expect(401);
    });

    it('should return 403 for user without semantic_models:read permission', async () => {
      const viewer = await createMockViewerUser(context);

      await request(context.app.getHttpServer())
        .get('/api/semantic-models')
        .set(authHeader(viewer.accessToken))
        .expect(403);
    });

    it('should return empty list when no models', async () => {
      const contributor = await createMockContributorUser(context);

      context.prismaMock.semanticModel.findMany.mockResolvedValue([]);
      context.prismaMock.semanticModel.count.mockResolvedValue(0);

      const response = await request(context.app.getHttpServer())
        .get('/api/semantic-models')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data.items).toEqual([]);
      expect(response.body.data.total).toBe(0);
      expect(response.body.data).toHaveProperty('page');
      expect(response.body.data).toHaveProperty('pageSize');
      expect(response.body.data).toHaveProperty('totalPages');
    });

    it('should return paginated results', async () => {
      const contributor = await createMockContributorUser(context);

      const mockConnection = createMockConnection({
        id: '123e4567-e89b-12d3-a456-426614174001',
        name: 'Test DB',
        ownerId: contributor.id,
      });

      const mockModels = [
        createMockSemanticModel({
          id: 'sm-uuid-1',
          name: 'Model 1',
          connectionId: mockConnection.id,
          ownerId: contributor.id,
        }),
        createMockSemanticModel({
          id: 'sm-uuid-2',
          name: 'Model 2',
          connectionId: mockConnection.id,
          ownerId: contributor.id,
        }),
      ];

      // Include connection in response
      const modelsWithConnection = mockModels.map((model) => ({
        ...model,
        connection: mockConnection,
      }));

      context.prismaMock.semanticModel.findMany.mockResolvedValue(
        modelsWithConnection,
      );
      context.prismaMock.semanticModel.count.mockResolvedValue(2);

      const response = await request(context.app.getHttpServer())
        .get('/api/semantic-models')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data.items).toHaveLength(2);
      expect(response.body.data.total).toBe(2);
      expect(response.body.data.items[0]).toHaveProperty('status');
      expect(response.body.data.items[0]).toHaveProperty('connection');
      expect(response.body.data.items[0].connection).toHaveProperty('name');
      expect(response.body.data.items[0].connection).toHaveProperty('dbType');
    });

    it('should filter by status', async () => {
      const contributor = await createMockContributorUser(context);

      const mockModels = [
        createMockSemanticModel({
          id: 'sm-uuid-1',
          name: 'Ready Model',
          connectionId: 'conn-uuid-1',
          status: 'ready',
          ownerId: contributor.id,
        }),
      ];

      context.prismaMock.semanticModel.findMany.mockResolvedValue(mockModels);
      context.prismaMock.semanticModel.count.mockResolvedValue(1);

      await request(context.app.getHttpServer())
        .get('/api/semantic-models?status=ready')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      // Verify the mock was called with status filter
      expect(context.prismaMock.semanticModel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ready',
          }),
        }),
      );
    });

    it('should search by name', async () => {
      const contributor = await createMockContributorUser(context);

      const mockModels = [
        createMockSemanticModel({
          id: 'sm-uuid-1',
          name: 'Sales Model',
          connectionId: 'conn-uuid-1',
          ownerId: contributor.id,
        }),
      ];

      context.prismaMock.semanticModel.findMany.mockResolvedValue(mockModels);
      context.prismaMock.semanticModel.count.mockResolvedValue(1);

      await request(context.app.getHttpServer())
        .get('/api/semantic-models?search=Sales')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      // Verify the mock was called with search filter (OR condition for name and description)
      expect(context.prismaMock.semanticModel.findMany).toHaveBeenCalledWith(
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

    it('should only return user\'s own models (ownership isolation)', async () => {
      const contributor = await createMockContributorUser(context);

      const mockModels = [
        createMockSemanticModel({
          id: 'sm-uuid-1',
          name: 'My Model',
          connectionId: 'conn-uuid-1',
          ownerId: contributor.id,
        }),
      ];

      context.prismaMock.semanticModel.findMany.mockResolvedValue(mockModels);
      context.prismaMock.semanticModel.count.mockResolvedValue(1);

      await request(context.app.getHttpServer())
        .get('/api/semantic-models')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      // Verify the mock was called with ownerId filter
      expect(context.prismaMock.semanticModel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ownerId: contributor.id,
          }),
        }),
      );
    });
  });

  // ==========================================================================
  // GET /api/semantic-models/:id
  // ==========================================================================

  describe('GET /api/semantic-models/:id', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .get('/api/semantic-models/123e4567-e89b-12d3-a456-426614174001')
        .expect(401);
    });

    it('should return 200 with model and connection info', async () => {
      const contributor = await createMockContributorUser(context);

      const mockConnection = createMockConnection({
        id: '123e4567-e89b-12d3-a456-426614174001',
        name: 'Test DB',
        ownerId: contributor.id,
      });

      const mockModel = createMockSemanticModel({
        id: '123e4567-e89b-12d3-a456-426614174011',
        name: 'Sales Model',
        connectionId: mockConnection.id,
        ownerId: contributor.id,
      });

      // Include connection in response
      const modelWithConnection = {
        ...mockModel,
        connection: mockConnection,
      };

      context.prismaMock.semanticModel.findFirst.mockResolvedValue(
        modelWithConnection,
      );

      const response = await request(context.app.getHttpServer())
        .get('/api/semantic-models/123e4567-e89b-12d3-a456-426614174011')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data).toHaveProperty('id', '123e4567-e89b-12d3-a456-426614174011');
      expect(response.body.data).toHaveProperty('name', 'Sales Model');
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data.connection).toEqual({ name: 'Test DB', dbType: 'postgresql' });
    });

    it('should return 404 for non-existent model', async () => {
      const contributor = await createMockContributorUser(context);

      context.prismaMock.semanticModel.findFirst.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .get('/api/semantic-models/123e4567-e89b-12d3-a456-426614174999')
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });

    it('should return 404 for other user\'s model', async () => {
      const contributor = await createMockContributorUser(context);

      // Mock returns null because ownerId doesn't match
      context.prismaMock.semanticModel.findFirst.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .get('/api/semantic-models/123e4567-e89b-12d3-a456-426614174001')
        .set(authHeader(contributor.accessToken))
        .expect(404);

      // Verify the query included ownerId filter
      expect(context.prismaMock.semanticModel.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ownerId: contributor.id,
          }),
        }),
      );
    });
  });

  // ==========================================================================
  // PATCH /api/semantic-models/:id
  // ==========================================================================

  describe('PATCH /api/semantic-models/:id', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .patch('/api/semantic-models/123e4567-e89b-12d3-a456-426614174011')
        .send({ name: 'Updated' })
        .expect(401);
    });

    it('should return 403 without write permission', async () => {
      const viewer = await createMockViewerUser(context);

      await request(context.app.getHttpServer())
        .patch('/api/semantic-models/123e4567-e89b-12d3-a456-426614174011')
        .set(authHeader(viewer.accessToken))
        .send({ name: 'Updated' })
        .expect(403);
    });

    it('should return 200 and update name and description', async () => {
      const contributor = await createMockContributorUser(context);

      const existingModel = createMockSemanticModel({
        id: '123e4567-e89b-12d3-a456-426614174011',
        name: 'Old Name',
        description: 'Old description',
        connectionId: '123e4567-e89b-12d3-a456-426614174001',
        ownerId: contributor.id,
      });

      const updatedModel = {
        ...existingModel,
        name: 'New Name',
        description: 'New description',
      };

      context.prismaMock.semanticModel.findFirst.mockResolvedValue(
        existingModel,
      );
      context.prismaMock.semanticModel.update.mockResolvedValue(updatedModel);
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      const response = await request(context.app.getHttpServer())
        .patch('/api/semantic-models/123e4567-e89b-12d3-a456-426614174011')
        .set(authHeader(contributor.accessToken))
        .send({ name: 'New Name', description: 'New description' })
        .expect(200);

      expect(response.body.data).toHaveProperty('name', 'New Name');
      expect(response.body.data).toHaveProperty(
        'description',
        'New description',
      );
    });

    it('should return 404 for non-existent model', async () => {
      const contributor = await createMockContributorUser(context);

      context.prismaMock.semanticModel.findFirst.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .patch('/api/semantic-models/123e4567-e89b-12d3-a456-426614174999')
        .set(authHeader(contributor.accessToken))
        .send({ name: 'Updated' })
        .expect(404);
    });
  });

  // ==========================================================================
  // DELETE /api/semantic-models/:id
  // ==========================================================================

  describe('DELETE /api/semantic-models/:id', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .delete('/api/semantic-models/123e4567-e89b-12d3-a456-426614174011')
        .expect(401);
    });

    it('should return 403 without delete permission', async () => {
      const viewer = await createMockViewerUser(context);

      await request(context.app.getHttpServer())
        .delete('/api/semantic-models/123e4567-e89b-12d3-a456-426614174011')
        .set(authHeader(viewer.accessToken))
        .expect(403);
    });

    it('should return 204 on success', async () => {
      const contributor = await createMockContributorUser(context);

      const mockModel = createMockSemanticModel({
        id: '123e4567-e89b-12d3-a456-426614174011',
        name: 'To Delete',
        connectionId: '123e4567-e89b-12d3-a456-426614174001',
        ownerId: contributor.id,
      });

      context.prismaMock.semanticModel.findFirst.mockResolvedValue(mockModel);
      context.prismaMock.semanticModel.delete.mockResolvedValue(mockModel);
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      await request(context.app.getHttpServer())
        .delete('/api/semantic-models/123e4567-e89b-12d3-a456-426614174011')
        .set(authHeader(contributor.accessToken))
        .expect(204);

      expect(context.prismaMock.semanticModel.delete).toHaveBeenCalledWith({
        where: { id: '123e4567-e89b-12d3-a456-426614174011' },
      });
    });

    it('should return 404 for non-existent model', async () => {
      const contributor = await createMockContributorUser(context);

      context.prismaMock.semanticModel.findFirst.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .delete('/api/semantic-models/123e4567-e89b-12d3-a456-426614174999')
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });
  });

  // ==========================================================================
  // GET /api/semantic-models/:id/yaml
  // ==========================================================================

  describe('GET /api/semantic-models/:id/yaml', () => {
    it('should return 200 with YAML string', async () => {
      const contributor = await createMockContributorUser(context);

      const mockModel = createMockSemanticModel({
        id: '123e4567-e89b-12d3-a456-426614174011',
        name: 'Sales Model',
        connectionId: '123e4567-e89b-12d3-a456-426614174001',
        ownerId: contributor.id,
        model: {
          semantic_model: [
            {
              name: 'sales',
              datasets: [{ name: 'orders', columns: ['id', 'total'] }],
              relationships: [],
              metrics: [],
            },
          ],
        },
      });

      context.prismaMock.semanticModel.findFirst.mockResolvedValue(mockModel);

      const response = await request(context.app.getHttpServer())
        .get('/api/semantic-models/123e4567-e89b-12d3-a456-426614174011/yaml')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data).toHaveProperty('yaml');
      expect(typeof response.body.data.yaml).toBe('string');
      expect(response.body.data.yaml).toContain('semantic_model');
    });

    it('should return 404 for non-existent model', async () => {
      const contributor = await createMockContributorUser(context);

      context.prismaMock.semanticModel.findFirst.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .get('/api/semantic-models/123e4567-e89b-12d3-a456-426614174999/yaml')
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });
  });

  // ==========================================================================
  // POST /api/semantic-models/runs
  // ==========================================================================

  describe('POST /api/semantic-models/runs', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .post('/api/semantic-models/runs')
        .send({
          connectionId: 'conn-uuid-1',
          databaseName: 'testdb',
          selectedSchemas: ['public'],
          name: 'Test Model',
        })
        .expect(401);
    });

    it('should return 403 without generate permission', async () => {
      const viewer = await createMockViewerUser(context);

      await request(context.app.getHttpServer())
        .post('/api/semantic-models/runs')
        .set(authHeader(viewer.accessToken))
        .send({
          connectionId: 'conn-uuid-1',
          databaseName: 'testdb',
          selectedSchemas: ['public'],
          name: 'Test Model',
        })
        .expect(403);
    });

    it('should return 201 and create a new run', async () => {
      const contributor = await createMockContributorUser(context);

      const mockConnection = createMockConnection({
        id: '123e4567-e89b-12d3-a456-426614174001',
        name: 'Test DB',
        ownerId: contributor.id,
      });

      const mockRun = createMockSemanticModelRun({
        id: '123e4567-e89b-12d3-a456-426614174021',
        connectionId: mockConnection.id,
        databaseName: 'testdb',
        selectedSchemas: ['public'],
        selectedTables: ['public.users'],
        status: 'pending',
        ownerId: contributor.id,
      });

      context.prismaMock.dataConnection.findFirst.mockResolvedValue(
        mockConnection,
      );
      context.prismaMock.semanticModelRun.create.mockResolvedValue(mockRun);
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      const response = await request(context.app.getHttpServer())
        .post('/api/semantic-models/runs')
        .set(authHeader(contributor.accessToken))
        .send({
          connectionId: '123e4567-e89b-12d3-a456-426614174001',
          databaseName: 'testdb',
          selectedSchemas: ['public'],
          selectedTables: ['public.users'],
          name: 'Test Semantic Model',
        })
        .expect(201);

      expect(response.body.data).toHaveProperty('id', '123e4567-e89b-12d3-a456-426614174021');
      expect(response.body.data).toHaveProperty('status', 'pending');
      expect(context.prismaMock.semanticModelRun.create).toHaveBeenCalled();
    });

    it('should return 400 for validation errors (missing connectionId)', async () => {
      const contributor = await createMockContributorUser(context);

      await request(context.app.getHttpServer())
        .post('/api/semantic-models/runs')
        .set(authHeader(contributor.accessToken))
        .send({
          // Missing connectionId
          databaseName: 'testdb',
          selectedSchemas: ['public'],
          name: 'Test Model',
        })
        .expect(400);
    });

    it('should return 400 for validation errors (missing databaseName)', async () => {
      const contributor = await createMockContributorUser(context);

      await request(context.app.getHttpServer())
        .post('/api/semantic-models/runs')
        .set(authHeader(contributor.accessToken))
        .send({
          connectionId: '123e4567-e89b-12d3-a456-426614174001',
          // Missing databaseName
          selectedSchemas: ['public'],
          name: 'Test Model',
        })
        .expect(400);
    });

    it('should return 404 if connection doesn\'t exist', async () => {
      const contributor = await createMockContributorUser(context);

      context.prismaMock.dataConnection.findFirst.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .post('/api/semantic-models/runs')
        .set(authHeader(contributor.accessToken))
        .send({
          connectionId: '123e4567-e89b-12d3-a456-426614174999',
          databaseName: 'testdb',
          selectedSchemas: ['public'],
          selectedTables: ['public.users'],
          name: 'Test Model',
        })
        .expect(404);
    });
  });

  // ==========================================================================
  // GET /api/semantic-models/runs/:runId
  // ==========================================================================

  describe('GET /api/semantic-models/runs/:runId', () => {
    it('should return 200 with run status', async () => {
      const contributor = await createMockContributorUser(context);

      const mockRun = createMockSemanticModelRun({
        id: '123e4567-e89b-12d3-a456-426614174021',
        connectionId: '123e4567-e89b-12d3-a456-426614174001',
        databaseName: 'testdb',
        status: 'pending',
        ownerId: contributor.id,
      });

      context.prismaMock.semanticModelRun.findFirst.mockResolvedValue(mockRun);

      const response = await request(context.app.getHttpServer())
        .get('/api/semantic-models/runs/123e4567-e89b-12d3-a456-426614174021')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data).toHaveProperty('id', '123e4567-e89b-12d3-a456-426614174021');
      expect(response.body.data).toHaveProperty('status', 'pending');
    });

    it('should return 404 for non-existent run', async () => {
      const contributor = await createMockContributorUser(context);

      context.prismaMock.semanticModelRun.findFirst.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .get('/api/semantic-models/runs/123e4567-e89b-12d3-a456-426614174999')
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });
  });

  // ==========================================================================
  // POST /api/semantic-models/runs/:runId/cancel
  // ==========================================================================

  describe('POST /api/semantic-models/runs/:runId/cancel', () => {
    it('should return 200 and cancel a pending run', async () => {
      const contributor = await createMockContributorUser(context);

      const mockRun = createMockSemanticModelRun({
        id: '123e4567-e89b-12d3-a456-426614174021',
        connectionId: '123e4567-e89b-12d3-a456-426614174001',
        status: 'pending',
        ownerId: contributor.id,
      });

      const cancelledRun = {
        ...mockRun,
        status: 'cancelled',
      };

      context.prismaMock.semanticModelRun.findFirst.mockResolvedValue(mockRun);
      context.prismaMock.semanticModelRun.update.mockResolvedValue(
        cancelledRun,
      );
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      const response = await request(context.app.getHttpServer())
        .post('/api/semantic-models/runs/123e4567-e89b-12d3-a456-426614174021/cancel')
        .set(authHeader(contributor.accessToken))
        .expect(201);

      expect(response.body.data).toHaveProperty('status', 'cancelled');
    });

    it('should return 400 for already completed run', async () => {
      const contributor = await createMockContributorUser(context);

      const mockRun = createMockSemanticModelRun({
        id: '123e4567-e89b-12d3-a456-426614174021',
        connectionId: '123e4567-e89b-12d3-a456-426614174001',
        status: 'completed',
        ownerId: contributor.id,
      });

      context.prismaMock.semanticModelRun.findFirst.mockResolvedValue(mockRun);

      await request(context.app.getHttpServer())
        .post('/api/semantic-models/runs/123e4567-e89b-12d3-a456-426614174021/cancel')
        .set(authHeader(contributor.accessToken))
        .expect(400);
    });
  });

  // ==========================================================================
  // GET /api/llm/providers
  // ==========================================================================

  describe('GET /api/llm/providers', () => {
    it('should return available providers based on config', async () => {
      const contributor = await createMockContributorUser(context);

      const response = await request(context.app.getHttpServer())
        .get('/api/llm/providers')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data).toHaveProperty('providers');
      expect(Array.isArray(response.body.data.providers)).toBe(true);
    });

    it('should return 403 without semantic_models:read permission', async () => {
      const viewer = await createMockViewerUser(context);

      await request(context.app.getHttpServer())
        .get('/api/llm/providers')
        .set(authHeader(viewer.accessToken))
        .expect(403);
    });
  });
});
