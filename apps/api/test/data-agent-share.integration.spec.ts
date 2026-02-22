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

// ============================================================================
// Test data factories
// ============================================================================

function createMockChat(overrides: Record<string, any> = {}): any {
  return {
    id: randomUUID(),
    name: 'Test Chat',
    ontologyId: randomUUID(),
    ownerId: randomUUID(),
    llmProvider: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockShare(overrides: Record<string, any> = {}): any {
  return {
    id: randomUUID(),
    chatId: randomUUID(),
    shareToken: 'tok_' + randomUUID().replace(/-/g, ''),
    createdById: randomUUID(),
    isActive: true,
    expiresAt: null,
    viewCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockMessage(overrides: Record<string, any> = {}): any {
  return {
    id: randomUUID(),
    chatId: randomUUID(),
    role: 'assistant',
    content: 'Here is the result.',
    status: 'complete',
    metadata: {
      plan: { steps: [{ stepId: 's1', intent: 'Fetch revenue' }] },
      stepResults: [{ stepId: 's1', result: 'ok' }],
      verificationReport: { passed: true },
      dataLineage: { tables: ['orders'] },
      toolCalls: [{ name: 'query_database', input: 'SELECT 1' }],
      tokensUsed: { total: 123 },
      discovery: { datasets: ['orders'] },
      claimed: true,
      durationMs: 800,
    },
    createdAt: new Date(),
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Chat Share Endpoints (Integration)', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await createTestApp({ useMockDatabase: true });
  });

  afterAll(async () => {
    await closeTestApp(context);
  });

  beforeEach(() => {
    resetPrismaMock();
    setupBaseMocks();
  });

  // ==========================================================================
  // POST /api/data-agent/chats/:id/share — create share
  // ==========================================================================

  describe('POST /api/data-agent/chats/:id/share', () => {
    it('should return 401 without auth token', async () => {
      const chatId = randomUUID();

      await request(context.app.getHttpServer())
        .post(`/api/data-agent/chats/${chatId}/share`)
        .expect(401);
    });

    it('should create a share link for own chat (201)', async () => {
      const contributor = await createMockContributorUser(context);
      const chatId = randomUUID();
      const shareId = randomUUID();
      const shareToken = 'tok_abc123';

      const chat = createMockChat({ id: chatId, ownerId: contributor.id });
      const share = createMockShare({
        id: shareId,
        chatId,
        shareToken,
        createdById: contributor.id,
        viewCount: 0,
        expiresAt: null,
        isActive: true,
      });

      // Ownership check
      context.prismaMock.dataChat.findFirst.mockResolvedValue(chat);
      // No existing active share
      context.prismaMock.dataChatShare.findFirst.mockResolvedValue(null);
      // Create new share
      context.prismaMock.dataChatShare.create.mockResolvedValue(share);

      const response = await request(context.app.getHttpServer())
        .post(`/api/data-agent/chats/${chatId}/share`)
        .set(authHeader(contributor.accessToken))
        .send({})
        .expect(201);

      // The global response transformer wraps the result in { data: ..., meta: ... }
      const body = response.body.data ?? response.body;
      expect(body).toHaveProperty('shareToken', shareToken);
      expect(body).toHaveProperty('shareUrl');
      expect(body.shareUrl).toContain(shareToken);
      expect(body).toHaveProperty('viewCount', 0);
      expect(body).toHaveProperty('isActive', true);
      expect(body).toHaveProperty('expiresAt', null);
    });

    it('should return existing active share if one already exists (idempotent)', async () => {
      const contributor = await createMockContributorUser(context);
      const chatId = randomUUID();
      const shareToken = 'tok_existing_share';

      const chat = createMockChat({ id: chatId, ownerId: contributor.id });
      const existingShare = createMockShare({
        chatId,
        shareToken,
        createdById: contributor.id,
        viewCount: 5,
        isActive: true,
      });

      context.prismaMock.dataChat.findFirst.mockResolvedValue(chat);
      // Existing active share found — should return it without creating a new one
      context.prismaMock.dataChatShare.findFirst.mockResolvedValue(existingShare);

      const response = await request(context.app.getHttpServer())
        .post(`/api/data-agent/chats/${chatId}/share`)
        .set(authHeader(contributor.accessToken))
        .send({})
        .expect(201);

      const body = response.body.data ?? response.body;
      expect(body).toHaveProperty('shareToken', shareToken);
      expect(body).toHaveProperty('viewCount', 5);
      // create should NOT have been called
      expect(context.prismaMock.dataChatShare.create).not.toHaveBeenCalled();
    });

    it('should accept expiresInDays and set expiresAt in the future', async () => {
      const contributor = await createMockContributorUser(context);
      const chatId = randomUUID();
      const expiresInDays = 7;
      const now = Date.now();

      const chat = createMockChat({ id: chatId, ownerId: contributor.id });
      const expiresAt = new Date(now + expiresInDays * 86_400_000);
      const share = createMockShare({
        chatId,
        createdById: contributor.id,
        expiresAt,
        isActive: true,
      });

      context.prismaMock.dataChat.findFirst.mockResolvedValue(chat);
      context.prismaMock.dataChatShare.findFirst.mockResolvedValue(null);
      context.prismaMock.dataChatShare.create.mockResolvedValue(share);

      const response = await request(context.app.getHttpServer())
        .post(`/api/data-agent/chats/${chatId}/share`)
        .set(authHeader(contributor.accessToken))
        .send({ expiresInDays })
        .expect(201);

      // expiresAt must be a valid date string in the future
      const body = response.body.data ?? response.body;
      expect(body).toHaveProperty('expiresAt');
      expect(body.expiresAt).not.toBeNull();
      const returnedExpiry = new Date(body.expiresAt).getTime();
      expect(returnedExpiry).toBeGreaterThan(now);
    });

    it('should create share with no expiry when expiresInDays is not provided', async () => {
      const contributor = await createMockContributorUser(context);
      const chatId = randomUUID();

      const chat = createMockChat({ id: chatId, ownerId: contributor.id });
      const share = createMockShare({
        chatId,
        createdById: contributor.id,
        expiresAt: null,
        isActive: true,
      });

      context.prismaMock.dataChat.findFirst.mockResolvedValue(chat);
      context.prismaMock.dataChatShare.findFirst.mockResolvedValue(null);
      context.prismaMock.dataChatShare.create.mockResolvedValue(share);

      const response = await request(context.app.getHttpServer())
        .post(`/api/data-agent/chats/${chatId}/share`)
        .set(authHeader(contributor.accessToken))
        .send({})
        .expect(201);

      const body = response.body.data ?? response.body;
      expect(body.expiresAt).toBeNull();
    });

    it('should return 404 for a non-existent chat', async () => {
      const contributor = await createMockContributorUser(context);
      const chatId = randomUUID();

      // Ownership check fails — chat does not exist
      context.prismaMock.dataChat.findFirst.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .post(`/api/data-agent/chats/${chatId}/share`)
        .set(authHeader(contributor.accessToken))
        .send({})
        .expect(404);
    });

    it('should return 404 for a chat owned by a different user', async () => {
      const contributor = await createMockContributorUser(context);
      const chatId = randomUUID();

      // findFirst with ownerId filter returns null because the chat belongs to another user
      context.prismaMock.dataChat.findFirst.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .post(`/api/data-agent/chats/${chatId}/share`)
        .set(authHeader(contributor.accessToken))
        .send({})
        .expect(404);
    });

    it('should reject an invalid expiresInDays (e.g. 0)', async () => {
      const contributor = await createMockContributorUser(context);
      const chatId = randomUUID();

      await request(context.app.getHttpServer())
        .post(`/api/data-agent/chats/${chatId}/share`)
        .set(authHeader(contributor.accessToken))
        .send({ expiresInDays: 0 })
        .expect(400);
    });

    it('should reject an expiresInDays greater than 365', async () => {
      const contributor = await createMockContributorUser(context);
      const chatId = randomUUID();

      await request(context.app.getHttpServer())
        .post(`/api/data-agent/chats/${chatId}/share`)
        .set(authHeader(contributor.accessToken))
        .send({ expiresInDays: 366 })
        .expect(400);
    });
  });

  // ==========================================================================
  // GET /api/data-agent/chats/:id/share — share status
  // ==========================================================================

  describe('GET /api/data-agent/chats/:id/share', () => {
    it('should return 401 without auth token', async () => {
      const chatId = randomUUID();

      await request(context.app.getHttpServer())
        .get(`/api/data-agent/chats/${chatId}/share`)
        .expect(401);
    });

    it('should return share info when an active share exists', async () => {
      const contributor = await createMockContributorUser(context);
      const chatId = randomUUID();
      const shareToken = 'tok_status_check';

      const chat = createMockChat({ id: chatId, ownerId: contributor.id });
      const share = createMockShare({
        chatId,
        shareToken,
        createdById: contributor.id,
        isActive: true,
        viewCount: 3,
      });

      context.prismaMock.dataChat.findFirst.mockResolvedValue(chat);
      context.prismaMock.dataChatShare.findFirst.mockResolvedValue(share);

      const response = await request(context.app.getHttpServer())
        .get(`/api/data-agent/chats/${chatId}/share`)
        .set(authHeader(contributor.accessToken))
        .expect(200);

      const body = response.body.data ?? response.body;
      expect(body).toHaveProperty('shareToken', shareToken);
      expect(body).toHaveProperty('isActive', true);
      expect(body).toHaveProperty('viewCount', 3);
      expect(body).toHaveProperty('shareUrl');
      expect(body.shareUrl).toContain(shareToken);
    });

    it('should return 404 when no active share exists for the chat', async () => {
      const contributor = await createMockContributorUser(context);
      const chatId = randomUUID();

      const chat = createMockChat({ id: chatId, ownerId: contributor.id });

      context.prismaMock.dataChat.findFirst.mockResolvedValue(chat);
      // Service returns null → controller throws NotFoundException
      context.prismaMock.dataChatShare.findFirst.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .get(`/api/data-agent/chats/${chatId}/share`)
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });

    it('should return 404 for a chat owned by a different user', async () => {
      const contributor = await createMockContributorUser(context);
      const chatId = randomUUID();

      // Ownership check fails
      context.prismaMock.dataChat.findFirst.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .get(`/api/data-agent/chats/${chatId}/share`)
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });

    it('should allow a viewer with DATA_AGENT_READ to check share status', async () => {
      const viewer = await createMockViewerUser(context);
      const chatId = randomUUID();
      const shareToken = 'tok_viewer_check';

      const chat = createMockChat({ id: chatId, ownerId: viewer.id });
      const share = createMockShare({
        chatId,
        shareToken,
        createdById: viewer.id,
        isActive: true,
      });

      context.prismaMock.dataChat.findFirst.mockResolvedValue(chat);
      context.prismaMock.dataChatShare.findFirst.mockResolvedValue(share);

      const response = await request(context.app.getHttpServer())
        .get(`/api/data-agent/chats/${chatId}/share`)
        .set(authHeader(viewer.accessToken))
        .expect(200);

      const body = response.body.data ?? response.body;
      expect(body).toHaveProperty('shareToken', shareToken);
    });
  });

  // ==========================================================================
  // DELETE /api/data-agent/chats/:id/share — revoke share
  // ==========================================================================

  describe('DELETE /api/data-agent/chats/:id/share', () => {
    it('should return 401 without auth token', async () => {
      const chatId = randomUUID();

      await request(context.app.getHttpServer())
        .delete(`/api/data-agent/chats/${chatId}/share`)
        .expect(401);
    });

    it('should revoke an active share and return 204', async () => {
      const contributor = await createMockContributorUser(context);
      const chatId = randomUUID();
      const shareId = randomUUID();

      const chat = createMockChat({ id: chatId, ownerId: contributor.id });
      const share = createMockShare({
        id: shareId,
        chatId,
        createdById: contributor.id,
        isActive: true,
      });
      const revokedShare = { ...share, isActive: false };

      context.prismaMock.dataChat.findFirst.mockResolvedValue(chat);
      context.prismaMock.dataChatShare.findFirst.mockResolvedValue(share);
      context.prismaMock.dataChatShare.update.mockResolvedValue(revokedShare);

      await request(context.app.getHttpServer())
        .delete(`/api/data-agent/chats/${chatId}/share`)
        .set(authHeader(contributor.accessToken))
        .expect(204);

      // Verify the update was called with isActive: false
      expect(context.prismaMock.dataChatShare.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: shareId },
          data: { isActive: false },
        }),
      );
    });

    it('should return 404 when no active share exists to revoke', async () => {
      const contributor = await createMockContributorUser(context);
      const chatId = randomUUID();

      const chat = createMockChat({ id: chatId, ownerId: contributor.id });

      context.prismaMock.dataChat.findFirst.mockResolvedValue(chat);
      // No active share found
      context.prismaMock.dataChatShare.findFirst.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .delete(`/api/data-agent/chats/${chatId}/share`)
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });

    it('should return 404 for a chat owned by a different user', async () => {
      const contributor = await createMockContributorUser(context);
      const chatId = randomUUID();

      // Ownership check fails
      context.prismaMock.dataChat.findFirst.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .delete(`/api/data-agent/chats/${chatId}/share`)
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });

    it('should return 403 for a viewer (no DATA_AGENT_WRITE permission)', async () => {
      const viewer = await createMockViewerUser(context);
      const chatId = randomUUID();

      await request(context.app.getHttpServer())
        .delete(`/api/data-agent/chats/${chatId}/share`)
        .set(authHeader(viewer.accessToken))
        .expect(403);
    });
  });

  // ==========================================================================
  // GET /api/data-agent/share/:shareToken — public share view
  // ==========================================================================

  describe('GET /api/data-agent/share/:shareToken', () => {
    it('should return shared chat data without an Authorization header', async () => {
      const chatId = randomUUID();
      const shareToken = 'tok_public_no_auth';

      const share = createMockShare({ chatId, shareToken, isActive: true, viewCount: 0 });
      const userMessage = createMockMessage({ chatId, role: 'user', content: 'Hello', status: 'complete', metadata: {} });
      const assistantMessage = createMockMessage({ chatId, role: 'assistant', content: 'World', status: 'complete' });
      const chat = createMockChat({
        id: chatId,
        messages: [userMessage, assistantMessage],
        ontology: { name: 'My Ontology' },
      });

      context.prismaMock.dataChatShare.findFirst.mockResolvedValue(share);
      context.prismaMock.dataChatShare.update.mockResolvedValue({
        ...share,
        viewCount: 1,
      });
      context.prismaMock.dataChat.findUnique.mockResolvedValue(chat);

      const response = await request(context.app.getHttpServer())
        .get(`/api/data-agent/share/${shareToken}`)
        // No Authorization header — public endpoint
        .expect(200);

      const body = response.body.data ?? response.body;
      expect(body).toHaveProperty('id', chatId);
      expect(body).toHaveProperty('name');
      expect(body).toHaveProperty('ontologyName', 'My Ontology');
      expect(body).toHaveProperty('messages');
      expect(body).toHaveProperty('share');
    });

    it('should return sanitized messages that exclude sensitive metadata fields', async () => {
      const chatId = randomUUID();
      const shareToken = 'tok_sanitize_check';

      const share = createMockShare({ chatId, shareToken, isActive: true, viewCount: 0 });
      const assistantMessage = createMockMessage({
        chatId,
        role: 'assistant',
        content: 'Analysis complete.',
        status: 'complete',
        metadata: {
          plan: { steps: [] },
          stepResults: [{ stepId: 's1' }],
          verificationReport: { passed: true },
          dataLineage: { tables: ['orders'] },
          // Sensitive fields that MUST be stripped:
          toolCalls: [{ name: 'query_database' }],
          tokensUsed: { total: 500 },
          discovery: { datasets: ['orders'] },
          claimed: true,
        },
      });
      const chat = createMockChat({
        id: chatId,
        messages: [assistantMessage],
        ontology: { name: 'Sales' },
      });

      context.prismaMock.dataChatShare.findFirst.mockResolvedValue(share);
      context.prismaMock.dataChatShare.update.mockResolvedValue({ ...share, viewCount: 1 });
      context.prismaMock.dataChat.findUnique.mockResolvedValue(chat);

      const response = await request(context.app.getHttpServer())
        .get(`/api/data-agent/share/${shareToken}`)
        .expect(200);

      const body = response.body.data ?? response.body;
      const msg = body.messages[0];
      // Fields that SHOULD be present
      expect(msg).toHaveProperty('role', 'assistant');
      expect(msg).toHaveProperty('content', 'Analysis complete.');
      expect(msg).toHaveProperty('status', 'complete');
      expect(msg).toHaveProperty('createdAt');
      expect(msg.metadata).toHaveProperty('plan');
      expect(msg.metadata).toHaveProperty('stepResults');
      expect(msg.metadata).toHaveProperty('verificationReport');
      expect(msg.metadata).toHaveProperty('dataLineage');

      // Sensitive fields that MUST NOT be present
      expect(msg.metadata).not.toHaveProperty('toolCalls');
      expect(msg.metadata).not.toHaveProperty('tokensUsed');
      expect(msg.metadata).not.toHaveProperty('discovery');
      expect(msg.metadata).not.toHaveProperty('claimed');

      // Message-level ID must not be exposed
      expect(msg).not.toHaveProperty('id');
    });

    it('should include plan, verificationReport, dataLineage, and stepResults in metadata', async () => {
      const chatId = randomUUID();
      const shareToken = 'tok_metadata_check';

      const share = createMockShare({ chatId, shareToken, isActive: true, viewCount: 0 });
      const plan = { steps: [{ stepId: 's1', intent: 'Fetch orders' }] };
      const verificationReport = { passed: true, checks: [] };
      const dataLineage = { tables: ['orders', 'customers'] };
      const stepResults = [{ stepId: 's1', result: 'ok' }];

      const assistantMessage = createMockMessage({
        chatId,
        role: 'assistant',
        content: 'Done.',
        status: 'complete',
        metadata: { plan, verificationReport, dataLineage, stepResults },
      });
      const chat = createMockChat({ id: chatId, messages: [assistantMessage], ontology: { name: 'DB' } });

      context.prismaMock.dataChatShare.findFirst.mockResolvedValue(share);
      context.prismaMock.dataChatShare.update.mockResolvedValue({ ...share, viewCount: 1 });
      context.prismaMock.dataChat.findUnique.mockResolvedValue(chat);

      const response = await request(context.app.getHttpServer())
        .get(`/api/data-agent/share/${shareToken}`)
        .expect(200);

      const body = response.body.data ?? response.body;
      const meta = body.messages[0].metadata;
      expect(meta).toHaveProperty('plan');
      expect(meta.plan).toEqual(plan);
      expect(meta).toHaveProperty('verificationReport');
      expect(meta.verificationReport).toEqual(verificationReport);
      expect(meta).toHaveProperty('dataLineage');
      expect(meta.dataLineage).toEqual(dataLineage);
      expect(meta).toHaveProperty('stepResults');
      expect(meta.stepResults).toEqual(stepResults);
    });

    it('should increment viewCount on each access', async () => {
      const chatId = randomUUID();
      const shareToken = 'tok_view_count';
      const shareId = randomUUID();

      const share = createMockShare({ id: shareId, chatId, shareToken, isActive: true, viewCount: 2 });
      const chat = createMockChat({ id: chatId, messages: [], ontology: { name: 'DB' } });

      context.prismaMock.dataChatShare.findFirst.mockResolvedValue(share);
      context.prismaMock.dataChatShare.update.mockResolvedValue({ ...share, viewCount: 3 });
      context.prismaMock.dataChat.findUnique.mockResolvedValue(chat);

      const response = await request(context.app.getHttpServer())
        .get(`/api/data-agent/share/${shareToken}`)
        .expect(200);

      const body = response.body.data ?? response.body;
      // The service increments viewCount by 1 before returning
      expect(body.share).toHaveProperty('viewCount', 3);

      // Verify update was called with increment
      expect(context.prismaMock.dataChatShare.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: shareId },
          data: { viewCount: { increment: 1 } },
        }),
      );
    });

    it('should return 404 for a non-existent share token', async () => {
      const shareToken = 'tok_does_not_exist';

      context.prismaMock.dataChatShare.findFirst.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .get(`/api/data-agent/share/${shareToken}`)
        .expect(404);
    });

    it('should return 410 for a revoked share (isActive=false)', async () => {
      const chatId = randomUUID();
      const shareToken = 'tok_revoked';

      const revokedShare = createMockShare({
        chatId,
        shareToken,
        isActive: false,
        viewCount: 10,
      });

      context.prismaMock.dataChatShare.findFirst.mockResolvedValue(revokedShare);

      await request(context.app.getHttpServer())
        .get(`/api/data-agent/share/${shareToken}`)
        .expect(410);
    });

    it('should return 410 for an expired share (expiresAt in the past)', async () => {
      const chatId = randomUUID();
      const shareToken = 'tok_expired';
      const pastDate = new Date(Date.now() - 86_400_000); // 1 day ago

      const expiredShare = createMockShare({
        chatId,
        shareToken,
        isActive: true, // still "active" flag, but time has passed
        expiresAt: pastDate,
        viewCount: 0,
      });

      context.prismaMock.dataChatShare.findFirst.mockResolvedValue(expiredShare);

      await request(context.app.getHttpServer())
        .get(`/api/data-agent/share/${shareToken}`)
        .expect(410);
    });

    it('should strip yaml from joinPlan.relevantDatasets but keep name and description', async () => {
      const chatId = randomUUID();
      const shareToken = 'tok_join_plan_strip';

      const share = createMockShare({ chatId, shareToken, isActive: true, viewCount: 0 });
      const joinPlan = {
        selectedTables: ['orders'],
        relevantDatasets: [
          {
            name: 'orders',
            description: 'Order records',
            yaml: 'secret yaml content that should be stripped',
          },
          {
            name: 'customers',
            description: 'Customer records',
            yaml: 'more secret yaml',
          },
        ],
      };

      const assistantMessage = createMockMessage({
        chatId,
        role: 'assistant',
        content: 'Joined data.',
        status: 'complete',
        metadata: { joinPlan },
      });
      const chat = createMockChat({ id: chatId, messages: [assistantMessage], ontology: { name: 'Sales' } });

      context.prismaMock.dataChatShare.findFirst.mockResolvedValue(share);
      context.prismaMock.dataChatShare.update.mockResolvedValue({ ...share, viewCount: 1 });
      context.prismaMock.dataChat.findUnique.mockResolvedValue(chat);

      const response = await request(context.app.getHttpServer())
        .get(`/api/data-agent/share/${shareToken}`)
        .expect(200);

      const body = response.body.data ?? response.body;
      const returnedJoinPlan = body.messages[0].metadata.joinPlan;
      expect(returnedJoinPlan).toBeDefined();
      expect(returnedJoinPlan.relevantDatasets).toHaveLength(2);

      // yaml must be stripped; name + description must remain
      for (const dataset of returnedJoinPlan.relevantDatasets) {
        expect(dataset).toHaveProperty('name');
        expect(dataset).toHaveProperty('description');
        expect(dataset).not.toHaveProperty('yaml');
      }
    });
  });

  // ==========================================================================
  // Cascade behavior — share removed when chat is deleted
  // ==========================================================================

  describe('Cascade: deleting a chat removes its shares', () => {
    it('should return 404 via share endpoint after the underlying chat is deleted', async () => {
      const contributor = await createMockContributorUser(context);
      const chatId = randomUUID();
      const shareToken = 'tok_cascade_check';

      // Step 1: Chat exists, delete it
      const chat = createMockChat({ id: chatId, ownerId: contributor.id });
      context.prismaMock.dataChat.findFirst.mockResolvedValue(chat);
      context.prismaMock.dataChat.delete.mockResolvedValue(chat);

      await request(context.app.getHttpServer())
        .delete(`/api/data-agent/chats/${chatId}`)
        .set(authHeader(contributor.accessToken))
        .expect(204);

      // Step 2: Share lookup returns null (cascaded) — simulates ON DELETE CASCADE
      context.prismaMock.dataChatShare.findFirst.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .get(`/api/data-agent/share/${shareToken}`)
        .expect(404);
    });
  });
});
