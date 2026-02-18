import { randomUUID } from 'crypto';
import request from 'supertest';
import {
  TestContext,
  createTestApp,
  closeTestApp,
} from './helpers/test-app.helper';
import { resetPrismaMock } from './mocks/prisma.mock';
import { setupBaseMocks } from './fixtures/mock-setup.helper';
import {
  createMockContributorUser,
  createMockViewerUser,
  authHeader,
} from './helpers/auth-mock.helper';
import { createMockDataAgentPreference } from './fixtures/test-data.factory';

describe('Data Agent Preferences (Integration)', () => {
  let context: TestContext;

  beforeAll(async () => {
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
  // GET /api/data-agent/preferences
  // ==========================================================================

  describe('GET /api/data-agent/preferences', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .get('/api/data-agent/preferences')
        .expect(401);
    });

    it('should return preferences for the authenticated user', async () => {
      const contributor = await createMockContributorUser(context);

      const mockPrefs = [
        createMockDataAgentPreference({
          id: randomUUID(),
          userId: contributor.id,
          ontologyId: null,
          key: 'output_format',
          value: 'table',
        }),
        createMockDataAgentPreference({
          id: randomUUID(),
          userId: contributor.id,
          ontologyId: null,
          key: 'verbosity',
          value: 'concise',
        }),
      ];

      context.prismaMock.dataAgentPreference.findMany.mockResolvedValue(
        mockPrefs,
      );

      const response = await request(context.app.getHttpServer())
        .get('/api/data-agent/preferences')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0]).toHaveProperty('key', 'output_format');
      expect(response.body.data[0]).toHaveProperty('value', 'table');
      expect(response.body.data[0]).toHaveProperty('userId', contributor.id);
    });

    it('should filter by scope=global (only ontologyId=null preferences)', async () => {
      const contributor = await createMockContributorUser(context);

      const globalPref = createMockDataAgentPreference({
        id: randomUUID(),
        userId: contributor.id,
        ontologyId: null,
        key: 'output_format',
        value: 'table',
      });

      context.prismaMock.dataAgentPreference.findMany.mockResolvedValue([
        globalPref,
      ]);

      const response = await request(context.app.getHttpServer())
        .get('/api/data-agent/preferences?scope=global')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].ontologyId).toBeNull();

      // Verify the query was made with ontologyId: null filter
      expect(
        context.prismaMock.dataAgentPreference.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: contributor.id,
            ontologyId: null,
          }),
        }),
      );
    });

    it('should filter by scope=ontology with specific ontologyId', async () => {
      const contributor = await createMockContributorUser(context);
      const ontologyId = randomUUID();

      const ontologyPref = createMockDataAgentPreference({
        id: randomUUID(),
        userId: contributor.id,
        ontologyId,
        key: 'chart_type',
        value: 'bar',
      });

      context.prismaMock.dataAgentPreference.findMany.mockResolvedValue([
        ontologyPref,
      ]);

      const response = await request(context.app.getHttpServer())
        .get(
          `/api/data-agent/preferences?scope=ontology&ontologyId=${ontologyId}`,
        )
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].ontologyId).toBe(ontologyId);

      // Verify the query uses ontologyId filter
      expect(
        context.prismaMock.dataAgentPreference.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: contributor.id,
            ontologyId,
          }),
        }),
      );
    });

    it('should return both global and ontology prefs when scope=all with ontologyId', async () => {
      const contributor = await createMockContributorUser(context);
      const ontologyId = randomUUID();

      const globalPref = createMockDataAgentPreference({
        id: randomUUID(),
        userId: contributor.id,
        ontologyId: null,
        key: 'output_format',
        value: 'table',
      });

      const ontologyPref = createMockDataAgentPreference({
        id: randomUUID(),
        userId: contributor.id,
        ontologyId,
        key: 'chart_type',
        value: 'bar',
      });

      context.prismaMock.dataAgentPreference.findMany.mockResolvedValue([
        globalPref,
        ontologyPref,
      ]);

      const response = await request(context.app.getHttpServer())
        .get(
          `/api/data-agent/preferences?scope=all&ontologyId=${ontologyId}`,
        )
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data).toHaveLength(2);

      // Verify the query uses OR condition for global + ontology prefs
      expect(
        context.prismaMock.dataAgentPreference.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: contributor.id,
            OR: expect.arrayContaining([
              { ontologyId: null },
              { ontologyId },
            ]),
          }),
        }),
      );
    });

    it('should return empty array when no preferences exist', async () => {
      const contributor = await createMockContributorUser(context);

      context.prismaMock.dataAgentPreference.findMany.mockResolvedValue([]);

      const response = await request(context.app.getHttpServer())
        .get('/api/data-agent/preferences')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data).toEqual([]);
    });

    it('should allow viewer to read preferences', async () => {
      const viewer = await createMockViewerUser(context);

      context.prismaMock.dataAgentPreference.findMany.mockResolvedValue([]);

      await request(context.app.getHttpServer())
        .get('/api/data-agent/preferences')
        .set(authHeader(viewer.accessToken))
        .expect(200);
    });
  });

  // ==========================================================================
  // POST /api/data-agent/preferences
  // ==========================================================================

  describe('POST /api/data-agent/preferences', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .post('/api/data-agent/preferences')
        .send({ key: 'output_format', value: 'table' })
        .expect(401);
    });

    it('should create a new preference (201)', async () => {
      const contributor = await createMockContributorUser(context);

      const created = createMockDataAgentPreference({
        id: randomUUID(),
        userId: contributor.id,
        ontologyId: null,
        key: 'output_format',
        value: 'table',
      });

      context.prismaMock.dataAgentPreference.upsert.mockResolvedValue(created);

      const response = await request(context.app.getHttpServer())
        .post('/api/data-agent/preferences')
        .set(authHeader(contributor.accessToken))
        .send({ key: 'output_format', value: 'table' })
        .expect(201);

      // Controller returns the upserted record directly (wrapped by global transformer)
      const body = response.body.data ?? response.body;
      expect(body).toHaveProperty('key', 'output_format');
      expect(body).toHaveProperty('value', 'table');
      expect(body).toHaveProperty('userId', contributor.id);
      expect(context.prismaMock.dataAgentPreference.upsert).toHaveBeenCalled();
    });

    it('should upsert when same user+ontology+key exists (updates value)', async () => {
      const contributor = await createMockContributorUser(context);
      const ontologyId = randomUUID();

      const updated = createMockDataAgentPreference({
        id: randomUUID(),
        userId: contributor.id,
        ontologyId,
        key: 'chart_type',
        value: 'line', // Updated value
      });

      context.prismaMock.dataAgentPreference.upsert.mockResolvedValue(updated);

      const response = await request(context.app.getHttpServer())
        .post('/api/data-agent/preferences')
        .set(authHeader(contributor.accessToken))
        .send({ ontologyId, key: 'chart_type', value: 'line' })
        .expect(201);

      // Controller returns the upserted record wrapped by global transformer
      const body = response.body.data ?? response.body;
      expect(body).toHaveProperty('value', 'line');

      // Verify upsert was called with correct where + update
      expect(
        context.prismaMock.dataAgentPreference.upsert,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            user_ontology_key_unique: expect.objectContaining({
              userId: contributor.id,
              key: 'chart_type',
            }),
          }),
          update: expect.objectContaining({ value: 'line' }),
          create: expect.objectContaining({
            userId: contributor.id,
            key: 'chart_type',
            value: 'line',
          }),
        }),
      );
    });

    it('should create global preference when ontologyId is null', async () => {
      const contributor = await createMockContributorUser(context);

      const created = createMockDataAgentPreference({
        id: randomUUID(),
        userId: contributor.id,
        ontologyId: null,
        key: 'verbosity',
        value: 'detailed',
      });

      context.prismaMock.dataAgentPreference.upsert.mockResolvedValue(created);

      const response = await request(context.app.getHttpServer())
        .post('/api/data-agent/preferences')
        .set(authHeader(contributor.accessToken))
        .send({ key: 'verbosity', value: 'detailed' }) // No ontologyId
        .expect(201);

      // Controller returns the upserted record wrapped by global transformer
      const body = response.body.data ?? response.body;
      expect(body).toHaveProperty('ontologyId', null);

      // Verify create payload has ontologyId: null
      expect(
        context.prismaMock.dataAgentPreference.upsert,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            userId: contributor.id,
            ontologyId: null,
          }),
        }),
      );
    });

    it('should return 400 when key is missing', async () => {
      const contributor = await createMockContributorUser(context);

      await request(context.app.getHttpServer())
        .post('/api/data-agent/preferences')
        .set(authHeader(contributor.accessToken))
        .send({ value: 'table' }) // Missing key
        .expect(400);
    });

    it('should return 400 when value is missing', async () => {
      const contributor = await createMockContributorUser(context);

      await request(context.app.getHttpServer())
        .post('/api/data-agent/preferences')
        .set(authHeader(contributor.accessToken))
        .send({ key: 'output_format' }) // Missing value
        .expect(400);
    });

    it('should return 403 for viewer without write permission', async () => {
      const viewer = await createMockViewerUser(context);

      await request(context.app.getHttpServer())
        .post('/api/data-agent/preferences')
        .set(authHeader(viewer.accessToken))
        .send({ key: 'output_format', value: 'table' })
        .expect(403);
    });
  });

  // ==========================================================================
  // PATCH /api/data-agent/preferences/:id
  // ==========================================================================

  describe('PATCH /api/data-agent/preferences/:id', () => {
    it('should return 401 if not authenticated', async () => {
      const prefId = randomUUID();
      await request(context.app.getHttpServer())
        .patch(`/api/data-agent/preferences/${prefId}`)
        .send({ value: 'chart' })
        .expect(401);
    });

    it('should update preference value (200)', async () => {
      const contributor = await createMockContributorUser(context);
      const prefId = randomUUID();

      const existingPref = createMockDataAgentPreference({
        id: prefId,
        userId: contributor.id,
        ontologyId: null,
        key: 'output_format',
        value: 'table',
      });

      const updatedPref = { ...existingPref, value: 'chart' };

      context.prismaMock.dataAgentPreference.findFirst.mockResolvedValue(
        existingPref,
      );
      context.prismaMock.dataAgentPreference.update.mockResolvedValue(
        updatedPref,
      );

      const response = await request(context.app.getHttpServer())
        .patch(`/api/data-agent/preferences/${prefId}`)
        .set(authHeader(contributor.accessToken))
        .send({ value: 'chart' })
        .expect(200);

      // Controller returns the updated record wrapped by global transformer
      const body = response.body.data ?? response.body;
      expect(body).toHaveProperty('value', 'chart');
      expect(
        context.prismaMock.dataAgentPreference.findFirst,
      ).toHaveBeenCalledWith({
        where: { id: prefId, userId: contributor.id },
      });
      expect(
        context.prismaMock.dataAgentPreference.update,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: prefId },
          data: { value: 'chart' },
        }),
      );
    });

    it('should return 404 if preference belongs to different user', async () => {
      const contributor = await createMockContributorUser(context);
      const prefId = randomUUID();

      // findFirst returns null because userId doesn't match
      context.prismaMock.dataAgentPreference.findFirst.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .patch(`/api/data-agent/preferences/${prefId}`)
        .set(authHeader(contributor.accessToken))
        .send({ value: 'chart' })
        .expect(404);
    });

    it('should return 404 if preference does not exist', async () => {
      const contributor = await createMockContributorUser(context);
      const nonExistentId = randomUUID();

      context.prismaMock.dataAgentPreference.findFirst.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .patch(`/api/data-agent/preferences/${nonExistentId}`)
        .set(authHeader(contributor.accessToken))
        .send({ value: 'chart' })
        .expect(404);
    });

    it('should return 400 when value is empty', async () => {
      const contributor = await createMockContributorUser(context);
      const prefId = randomUUID();

      await request(context.app.getHttpServer())
        .patch(`/api/data-agent/preferences/${prefId}`)
        .set(authHeader(contributor.accessToken))
        .send({ value: '' }) // Empty string fails min(1)
        .expect(400);
    });
  });

  // ==========================================================================
  // DELETE /api/data-agent/preferences/:id
  // ==========================================================================

  describe('DELETE /api/data-agent/preferences/:id', () => {
    it('should return 401 if not authenticated', async () => {
      const prefId = randomUUID();
      await request(context.app.getHttpServer())
        .delete(`/api/data-agent/preferences/${prefId}`)
        .expect(401);
    });

    it('should delete preference (204)', async () => {
      const contributor = await createMockContributorUser(context);
      const prefId = randomUUID();

      const existingPref = createMockDataAgentPreference({
        id: prefId,
        userId: contributor.id,
        ontologyId: null,
        key: 'output_format',
        value: 'table',
      });

      context.prismaMock.dataAgentPreference.findFirst.mockResolvedValue(
        existingPref,
      );
      context.prismaMock.dataAgentPreference.delete.mockResolvedValue(
        existingPref,
      );

      await request(context.app.getHttpServer())
        .delete(`/api/data-agent/preferences/${prefId}`)
        .set(authHeader(contributor.accessToken))
        .expect(204);

      expect(
        context.prismaMock.dataAgentPreference.findFirst,
      ).toHaveBeenCalledWith({
        where: { id: prefId, userId: contributor.id },
      });
      expect(
        context.prismaMock.dataAgentPreference.delete,
      ).toHaveBeenCalledWith({
        where: { id: prefId },
      });
    });

    it('should return 404 if preference belongs to different user', async () => {
      const contributor = await createMockContributorUser(context);
      const prefId = randomUUID();

      // Simulates another user's preference — findFirst with userId filter returns null
      context.prismaMock.dataAgentPreference.findFirst.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .delete(`/api/data-agent/preferences/${prefId}`)
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });

    it('should return 403 for viewer without write permission', async () => {
      const viewer = await createMockViewerUser(context);
      const prefId = randomUUID();

      await request(context.app.getHttpServer())
        .delete(`/api/data-agent/preferences/${prefId}`)
        .set(authHeader(viewer.accessToken))
        .expect(403);
    });
  });

  // ==========================================================================
  // DELETE /api/data-agent/preferences (clear all)
  // ==========================================================================

  describe('DELETE /api/data-agent/preferences (clear all)', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .delete('/api/data-agent/preferences')
        .expect(401);
    });

    it('should clear all preferences for user (204)', async () => {
      const contributor = await createMockContributorUser(context);

      context.prismaMock.dataAgentPreference.deleteMany.mockResolvedValue({
        count: 3,
      });

      await request(context.app.getHttpServer())
        .delete('/api/data-agent/preferences')
        .set(authHeader(contributor.accessToken))
        .expect(204);

      expect(
        context.prismaMock.dataAgentPreference.deleteMany,
      ).toHaveBeenCalledWith({
        where: { userId: contributor.id },
      });
    });

    it('should clear only ontology-scoped preferences when ontologyId query param provided', async () => {
      const contributor = await createMockContributorUser(context);
      const ontologyId = randomUUID();

      context.prismaMock.dataAgentPreference.deleteMany.mockResolvedValue({
        count: 2,
      });

      await request(context.app.getHttpServer())
        .delete(`/api/data-agent/preferences?ontologyId=${ontologyId}`)
        .set(authHeader(contributor.accessToken))
        .expect(204);

      expect(
        context.prismaMock.dataAgentPreference.deleteMany,
      ).toHaveBeenCalledWith({
        where: { userId: contributor.id, ontologyId },
      });
    });

    it('should return 403 for viewer without write permission', async () => {
      const viewer = await createMockViewerUser(context);

      await request(context.app.getHttpServer())
        .delete('/api/data-agent/preferences')
        .set(authHeader(viewer.accessToken))
        .expect(403);
    });

    it('should return 204 even when no preferences exist (idempotent)', async () => {
      const contributor = await createMockContributorUser(context);

      context.prismaMock.dataAgentPreference.deleteMany.mockResolvedValue({
        count: 0,
      });

      await request(context.app.getHttpServer())
        .delete('/api/data-agent/preferences')
        .set(authHeader(contributor.accessToken))
        .expect(204);
    });
  });
});
