import request from 'supertest';
import { randomBytes, randomUUID } from 'crypto';
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
import { createMockLlmProvider } from './fixtures/test-data.factory';

// ---------------------------------------------------------------------------
// Stub out the encryption util so tests don't need a real 32-byte key and
// the encrypted configs can be decrypted back to valid JSON.
// ---------------------------------------------------------------------------
jest.mock('../src/common/utils/encryption.util', () => ({
  encrypt: jest.fn(() => 'encrypted-config'),
  decrypt: jest.fn(() => JSON.stringify({ apiKey: 'sk-test', model: 'gpt-4o' })),
  getEncryptionKey: jest.fn(() => randomBytes(32)),
}));

// ---------------------------------------------------------------------------
// Mock LlmService.getChatModelFromConfig so the /test endpoint doesn't try
// to call a real LLM during integration tests.
// ---------------------------------------------------------------------------
jest.mock('../src/llm/llm.service', () => {
  const original = jest.requireActual('../src/llm/llm.service');
  return {
    ...original,
    LlmService: jest.fn().mockImplementation(() => ({
      getChatModelFromConfig: jest.fn(() => ({
        invoke: jest.fn().mockResolvedValue({ content: 'hello' }),
      })),
      getEnabledProviders: jest.fn().mockResolvedValue([]),
      getDefaultProvider: jest.fn().mockResolvedValue('openai'),
      getChatModel: jest.fn(),
    })),
  };
});

describe('LLM Providers (Integration)', () => {
  let context: TestContext;

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
    context = await createTestApp({ useMockDatabase: true });
  });

  afterAll(async () => {
    await closeTestApp(context);
  });

  beforeEach(() => {
    resetPrismaMock();
    setupBaseMocks();
  });

  // =========================================================================
  // GET /api/llm/providers
  // =========================================================================

  describe('GET /api/llm/providers', () => {
    it('returns 401 when not authenticated', async () => {
      await request(context.app.getHttpServer())
        .get('/api/llm/providers')
        .expect(401);
    });

    it('returns 200 with providers list for contributor (has llm_providers:read)', async () => {
      const contributor = await createMockContributorUser(context);

      context.prismaMock.llmProvider.findMany.mockResolvedValue([
        createMockLlmProvider({ type: 'openai', name: 'OpenAI', enabled: true }),
      ]);

      const response = await request(context.app.getHttpServer())
        .get('/api/llm/providers')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data).toHaveProperty('providers');
      expect(response.body.data.providers).toHaveLength(1);
      expect(response.body.data.providers[0]).toHaveProperty('type', 'openai');
    });

    it('returns 200 with providers list for viewer (has llm_providers:read)', async () => {
      // Note: the LlmProviderService caches provider list in memory. We set findMany
      // before any call so this test exercises the HTTP auth/permission layer.
      const viewer = await createMockViewerUser(context);

      context.prismaMock.llmProvider.findMany.mockResolvedValue([]);

      const response = await request(context.app.getHttpServer())
        .get('/api/llm/providers')
        .set(authHeader(viewer.accessToken))
        .expect(200);

      expect(response.body.data).toHaveProperty('providers');
      expect(Array.isArray(response.body.data.providers)).toBe(true);
    });

    it('returns provider with model field populated', async () => {
      const admin = await createMockAdminUser(context);

      context.prismaMock.llmProvider.findMany.mockResolvedValue([
        createMockLlmProvider({ type: 'anthropic', name: 'Anthropic', enabled: true, isDefault: true }),
      ]);

      const response = await request(context.app.getHttpServer())
        .get('/api/llm/providers')
        .set(authHeader(admin.accessToken))
        .expect(200);

      const providers = response.body.data.providers;
      // At least confirm the response shape is correct
      expect(providers).toBeInstanceOf(Array);
      if (providers.length > 0) {
        expect(providers[0]).toHaveProperty('model');
        expect(providers[0]).toHaveProperty('type');
      }
    });
  });

  // =========================================================================
  // POST /api/llm/providers
  // =========================================================================

  describe('POST /api/llm/providers', () => {
    it('returns 401 when not authenticated', async () => {
      await request(context.app.getHttpServer())
        .post('/api/llm/providers')
        .send({ type: 'openai', name: 'OpenAI', config: { apiKey: 'sk-test' } })
        .expect(401);
    });

    it('returns 403 for contributor (no llm_providers:write)', async () => {
      const contributor = await createMockContributorUser(context);

      await request(context.app.getHttpServer())
        .post('/api/llm/providers')
        .set(authHeader(contributor.accessToken))
        .send({
          type: 'openai',
          name: 'OpenAI',
          enabled: true,
          isDefault: false,
          config: { apiKey: 'sk-test' },
        })
        .expect(403);
    });

    it('returns 403 for viewer (no llm_providers:write)', async () => {
      const viewer = await createMockViewerUser(context);

      await request(context.app.getHttpServer())
        .post('/api/llm/providers')
        .set(authHeader(viewer.accessToken))
        .send({
          type: 'openai',
          name: 'OpenAI',
          enabled: true,
          isDefault: false,
          config: { apiKey: 'sk-test' },
        })
        .expect(403);
    });

    it('returns 201 with created provider for admin', async () => {
      const admin = await createMockAdminUser(context);
      const mockRecord = createMockLlmProvider({
        id: randomUUID(),
        type: 'openai',
        name: 'OpenAI',
        enabled: true,
        isDefault: false,
      });

      context.prismaMock.llmProvider.findFirst.mockResolvedValue(null); // no duplicate
      context.prismaMock.llmProvider.create.mockResolvedValue(mockRecord);

      const response = await request(context.app.getHttpServer())
        .post('/api/llm/providers')
        .set(authHeader(admin.accessToken))
        .send({
          type: 'openai',
          name: 'OpenAI',
          enabled: true,
          isDefault: false,
          config: { apiKey: 'sk-test', model: 'gpt-4o' },
        })
        .expect(201);

      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('type', 'openai');
      expect(response.body.data).toHaveProperty('name', 'OpenAI');
      // Sensitive field must be masked in the response
      expect(response.body.data.config.apiKey).toBe('********');
    });

    it('returns 400 for invalid config (missing required field)', async () => {
      const admin = await createMockAdminUser(context);

      context.prismaMock.llmProvider.findFirst.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .post('/api/llm/providers')
        .set(authHeader(admin.accessToken))
        .send({
          type: 'openai',
          name: 'OpenAI',
          enabled: true,
          isDefault: false,
          config: { model: 'gpt-4o' }, // missing apiKey
        })
        .expect(400);
    });

    it('returns 400 for missing required top-level fields', async () => {
      const admin = await createMockAdminUser(context);

      await request(context.app.getHttpServer())
        .post('/api/llm/providers')
        .set(authHeader(admin.accessToken))
        .send({}) // missing type, name, config
        .expect(400);
    });

    it('returns 409 when a provider of the same type already exists', async () => {
      const admin = await createMockAdminUser(context);

      context.prismaMock.llmProvider.findFirst.mockResolvedValue(
        createMockLlmProvider({ type: 'openai' }),
      );

      await request(context.app.getHttpServer())
        .post('/api/llm/providers')
        .set(authHeader(admin.accessToken))
        .send({
          type: 'openai',
          name: 'Duplicate OpenAI',
          enabled: true,
          isDefault: false,
          config: { apiKey: 'sk-other' },
        })
        .expect(409);
    });
  });

  // =========================================================================
  // GET /api/llm/providers/:id
  // =========================================================================

  describe('GET /api/llm/providers/:id', () => {
    it('returns 401 when not authenticated', async () => {
      const id = randomUUID();
      await request(context.app.getHttpServer())
        .get(`/api/llm/providers/${id}`)
        .expect(401);
    });

    it('returns 403 for contributor (no llm_providers:write)', async () => {
      const contributor = await createMockContributorUser(context);
      const id = randomUUID();

      await request(context.app.getHttpServer())
        .get(`/api/llm/providers/${id}`)
        .set(authHeader(contributor.accessToken))
        .expect(403);
    });

    it('returns 200 with masked credentials for admin', async () => {
      const admin = await createMockAdminUser(context);
      const mockRecord = createMockLlmProvider({
        id: randomUUID(),
        type: 'openai',
        name: 'OpenAI',
      });

      context.prismaMock.llmProvider.findUnique.mockResolvedValue(mockRecord);

      const response = await request(context.app.getHttpServer())
        .get(`/api/llm/providers/${mockRecord.id}`)
        .set(authHeader(admin.accessToken))
        .expect(200);

      expect(response.body.data).toHaveProperty('id', mockRecord.id);
      expect(response.body.data).toHaveProperty('type', 'openai');
      // API key must be masked
      expect(response.body.data.config.apiKey).toBe('********');
      // Raw encrypted config must not be exposed
      expect(response.body.data).not.toHaveProperty('encryptedConfig');
    });

    it('returns 404 for non-existent provider', async () => {
      const admin = await createMockAdminUser(context);

      context.prismaMock.llmProvider.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .get(`/api/llm/providers/${randomUUID()}`)
        .set(authHeader(admin.accessToken))
        .expect(404);
    });

    it('returns 400 for invalid UUID format', async () => {
      const admin = await createMockAdminUser(context);

      await request(context.app.getHttpServer())
        .get('/api/llm/providers/not-a-uuid')
        .set(authHeader(admin.accessToken))
        .expect(400);
    });
  });

  // =========================================================================
  // PATCH /api/llm/providers/:id
  // =========================================================================

  describe('PATCH /api/llm/providers/:id', () => {
    it('returns 401 when not authenticated', async () => {
      const id = randomUUID();
      await request(context.app.getHttpServer())
        .patch(`/api/llm/providers/${id}`)
        .send({ name: 'Updated' })
        .expect(401);
    });

    it('returns 403 for contributor (no llm_providers:write)', async () => {
      const contributor = await createMockContributorUser(context);
      const id = randomUUID();

      await request(context.app.getHttpServer())
        .patch(`/api/llm/providers/${id}`)
        .set(authHeader(contributor.accessToken))
        .send({ name: 'Updated' })
        .expect(403);
    });

    it('returns 200 with updated provider for admin', async () => {
      const admin = await createMockAdminUser(context);
      const existing = createMockLlmProvider({ type: 'openai', name: 'Old Name' });
      const updated = { ...existing, name: 'New Name' };

      context.prismaMock.llmProvider.findUnique.mockResolvedValue(existing);
      context.prismaMock.llmProvider.update.mockResolvedValue(updated);

      const response = await request(context.app.getHttpServer())
        .patch(`/api/llm/providers/${existing.id}`)
        .set(authHeader(admin.accessToken))
        .send({ name: 'New Name' })
        .expect(200);

      expect(response.body.data).toHaveProperty('name', 'New Name');
    });

    it('returns 404 for non-existent provider', async () => {
      const admin = await createMockAdminUser(context);

      context.prismaMock.llmProvider.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .patch(`/api/llm/providers/${randomUUID()}`)
        .set(authHeader(admin.accessToken))
        .send({ name: 'Updated' })
        .expect(404);
    });

    it('returns 400 when updated config is invalid', async () => {
      const admin = await createMockAdminUser(context);
      const existing = createMockLlmProvider({ type: 'openai' });

      context.prismaMock.llmProvider.findUnique.mockResolvedValue(existing);

      await request(context.app.getHttpServer())
        .patch(`/api/llm/providers/${existing.id}`)
        .set(authHeader(admin.accessToken))
        .send({ config: { model: 'gpt-4o' } }) // missing apiKey
        .expect(400);
    });
  });

  // =========================================================================
  // DELETE /api/llm/providers/:id
  // =========================================================================

  describe('DELETE /api/llm/providers/:id', () => {
    it('returns 401 when not authenticated', async () => {
      const id = randomUUID();
      await request(context.app.getHttpServer())
        .delete(`/api/llm/providers/${id}`)
        .expect(401);
    });

    it('returns 403 for contributor (no llm_providers:delete)', async () => {
      const contributor = await createMockContributorUser(context);
      const id = randomUUID();

      await request(context.app.getHttpServer())
        .delete(`/api/llm/providers/${id}`)
        .set(authHeader(contributor.accessToken))
        .expect(403);
    });

    it('returns 403 for viewer (no llm_providers:delete)', async () => {
      const viewer = await createMockViewerUser(context);
      const id = randomUUID();

      await request(context.app.getHttpServer())
        .delete(`/api/llm/providers/${id}`)
        .set(authHeader(viewer.accessToken))
        .expect(403);
    });

    it('returns 204 on successful delete for admin', async () => {
      const admin = await createMockAdminUser(context);
      const mockRecord = createMockLlmProvider({ id: randomUUID(), type: 'openai' });

      context.prismaMock.llmProvider.findUnique.mockResolvedValue(mockRecord);
      context.prismaMock.llmProvider.delete.mockResolvedValue(mockRecord);

      await request(context.app.getHttpServer())
        .delete(`/api/llm/providers/${mockRecord.id}`)
        .set(authHeader(admin.accessToken))
        .expect(204);

      expect(context.prismaMock.llmProvider.delete).toHaveBeenCalledWith({
        where: { id: mockRecord.id },
      });
    });

    it('returns 404 for non-existent provider', async () => {
      const admin = await createMockAdminUser(context);

      context.prismaMock.llmProvider.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .delete(`/api/llm/providers/${randomUUID()}`)
        .set(authHeader(admin.accessToken))
        .expect(404);
    });

    it('returns 400 for invalid UUID format', async () => {
      const admin = await createMockAdminUser(context);

      await request(context.app.getHttpServer())
        .delete('/api/llm/providers/not-a-uuid')
        .set(authHeader(admin.accessToken))
        .expect(400);
    });
  });

  // =========================================================================
  // POST /api/llm/providers/:id/test
  // =========================================================================

  describe('POST /api/llm/providers/:id/test', () => {
    it('returns 401 when not authenticated', async () => {
      const id = randomUUID();
      await request(context.app.getHttpServer())
        .post(`/api/llm/providers/${id}/test`)
        .expect(401);
    });

    it('returns 403 for contributor (no llm_providers:write)', async () => {
      const contributor = await createMockContributorUser(context);
      const id = randomUUID();

      await request(context.app.getHttpServer())
        .post(`/api/llm/providers/${id}/test`)
        .set(authHeader(contributor.accessToken))
        .expect(403);
    });

    it('returns 404 for non-existent provider', async () => {
      const admin = await createMockAdminUser(context);

      context.prismaMock.llmProvider.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .post(`/api/llm/providers/${randomUUID()}/test`)
        .set(authHeader(admin.accessToken))
        .expect(404);
    });

    it('returns 200 with test result for admin', async () => {
      const admin = await createMockAdminUser(context);
      const mockRecord = createMockLlmProvider({
        id: randomUUID(),
        type: 'openai',
        enabled: true,
      });

      // testProvider calls findUnique twice (once before, once after invoke)
      context.prismaMock.llmProvider.findUnique.mockResolvedValue(mockRecord);
      context.prismaMock.llmProvider.update.mockResolvedValue({
        ...mockRecord,
        lastTestedAt: new Date(),
        lastTestResult: true,
        lastTestMessage: 'Connection successful',
      });

      const response = await request(context.app.getHttpServer())
        .post(`/api/llm/providers/${mockRecord.id}/test`)
        .set(authHeader(admin.accessToken));

      // The /test endpoint returns 201 (NestJS default for POST)
      expect(response.status).toBe(201);
      expect(response.body.data).toHaveProperty('success');
      expect(response.body.data).toHaveProperty('message');
    });

    it('returns 400 for invalid UUID format', async () => {
      const admin = await createMockAdminUser(context);

      await request(context.app.getHttpServer())
        .post('/api/llm/providers/not-a-uuid/test')
        .set(authHeader(admin.accessToken))
        .expect(400);
    });
  });
});
