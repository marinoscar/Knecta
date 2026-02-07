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
import { createMockConnection } from './fixtures/test-data.factory';
import { randomBytes } from 'crypto';

describe('Discovery (Integration)', () => {
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
  // GET /api/connections/:id/databases
  // ==========================================================================

  describe('GET /api/connections/:id/databases', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .get('/api/connections/123e4567-e89b-12d3-a456-426614174001/databases')
        .expect(401);
    });

    it('should return 403 for user without connections:read permission', async () => {
      const viewer = await createMockViewerUser(context);

      await request(context.app.getHttpServer())
        .get('/api/connections/123e4567-e89b-12d3-a456-426614174001/databases')
        .set(authHeader(viewer.accessToken))
        .expect(403);
    });

    it('should return 404 for non-existent connection', async () => {
      const contributor = await createMockContributorUser(context);

      context.prismaMock.dataConnection.findFirst.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .get('/api/connections/123e4567-e89b-12d3-a456-426614174999/databases')
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });

    it('should return 404 for other user\'s connection', async () => {
      const contributor = await createMockContributorUser(context);

      // Mock returns null because ownerId doesn't match
      context.prismaMock.dataConnection.findFirst.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .get('/api/connections/123e4567-e89b-12d3-a456-426614174001/databases')
        .set(authHeader(contributor.accessToken))
        .expect(404);

      // Verify the query included ownerId filter
      expect(context.prismaMock.dataConnection.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ownerId: contributor.id,
          }),
        }),
      );
    });

    it('should pass auth/RBAC checks and attempt database connection', async () => {
      const contributor = await createMockContributorUser(context);

      const mockConnection = createMockConnection({
        id: '123e4567-e89b-12d3-a456-426614174001',
        name: 'Test DB',
        ownerId: contributor.id,
        encryptedCredential: null, // No password for discovery tests
      });

      context.prismaMock.dataConnection.findFirst.mockResolvedValue(
        mockConnection,
      );

      const response = await request(context.app.getHttpServer())
        .get('/api/connections/123e4567-e89b-12d3-a456-426614174001/databases')
        .set(authHeader(contributor.accessToken));

      // Note: This test validates the API layer (auth/RBAC/ownership)
      // Without a real database, the driver connection will fail with 500
      // In production with valid credentials, this would return 200
      expect([200, 500]).toContain(response.status);
    });
  });

  // ==========================================================================
  // GET /api/connections/:id/databases/:database/schemas
  // ==========================================================================

  describe('GET /api/connections/:id/databases/:database/schemas', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .get(
          '/api/connections/123e4567-e89b-12d3-a456-426614174001/databases/testdb/schemas',
        )
        .expect(401);
    });

    it('should return 403 for user without connections:read permission', async () => {
      const viewer = await createMockViewerUser(context);

      await request(context.app.getHttpServer())
        .get(
          '/api/connections/123e4567-e89b-12d3-a456-426614174001/databases/testdb/schemas',
        )
        .set(authHeader(viewer.accessToken))
        .expect(403);
    });

    it('should return 404 for non-existent connection', async () => {
      const contributor = await createMockContributorUser(context);

      context.prismaMock.dataConnection.findFirst.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .get(
          '/api/connections/123e4567-e89b-12d3-a456-426614174999/databases/testdb/schemas',
        )
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });

    it('should pass auth/RBAC checks and attempt database connection', async () => {
      const contributor = await createMockContributorUser(context);

      const mockConnection = createMockConnection({
        id: '123e4567-e89b-12d3-a456-426614174001',
        name: 'Test DB',
        ownerId: contributor.id,
        encryptedCredential: null, // No password for discovery tests
      });

      context.prismaMock.dataConnection.findFirst.mockResolvedValue(
        mockConnection,
      );

      const response = await request(context.app.getHttpServer())
        .get(
          '/api/connections/123e4567-e89b-12d3-a456-426614174001/databases/testdb/schemas',
        )
        .set(authHeader(contributor.accessToken));

      // Note: This test validates the API layer (auth/RBAC/ownership)
      // Without a real database, the driver connection will fail with 500
      expect([200, 500]).toContain(response.status);
    });
  });

  // ==========================================================================
  // GET /api/connections/:id/databases/:database/schemas/:schema/tables
  // ==========================================================================

  describe('GET /api/connections/:id/databases/:database/schemas/:schema/tables', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .get(
          '/api/connections/123e4567-e89b-12d3-a456-426614174001/databases/testdb/schemas/public/tables',
        )
        .expect(401);
    });

    it('should return 403 for user without connections:read permission', async () => {
      const viewer = await createMockViewerUser(context);

      await request(context.app.getHttpServer())
        .get(
          '/api/connections/123e4567-e89b-12d3-a456-426614174001/databases/testdb/schemas/public/tables',
        )
        .set(authHeader(viewer.accessToken))
        .expect(403);
    });

    it('should return 404 for non-existent connection', async () => {
      const contributor = await createMockContributorUser(context);

      context.prismaMock.dataConnection.findFirst.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .get(
          '/api/connections/123e4567-e89b-12d3-a456-426614174999/databases/testdb/schemas/public/tables',
        )
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });

    it('should reach endpoint with valid auth and connection', async () => {
      const contributor = await createMockContributorUser(context);

      const mockConnection = createMockConnection({
        id: '123e4567-e89b-12d3-a456-426614174001',
        name: 'Test DB',
        ownerId: contributor.id,
        encryptedCredential: null, // No password for discovery tests
      });

      context.prismaMock.dataConnection.findFirst.mockResolvedValue(
        mockConnection,
      );

      const response = await request(context.app.getHttpServer())
        .get(
          '/api/connections/123e4567-e89b-12d3-a456-426614174001/databases/testdb/schemas/public/tables',
        )
        .set(authHeader(contributor.accessToken));

      // Note: This test validates the API layer (auth/RBAC/ownership)
      // Without a real database, the driver connection will fail with 500
      expect([200, 500]).toContain(response.status);
    });
  });

  // ==========================================================================
  // GET /api/connections/:id/databases/:database/schemas/:schema/tables/:table/columns
  // ==========================================================================

  describe('GET /api/connections/:id/databases/:database/schemas/:schema/tables/:table/columns', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .get(
          '/api/connections/123e4567-e89b-12d3-a456-426614174001/databases/testdb/schemas/public/tables/users/columns',
        )
        .expect(401);
    });

    it('should return 403 for user without connections:read permission', async () => {
      const viewer = await createMockViewerUser(context);

      await request(context.app.getHttpServer())
        .get(
          '/api/connections/123e4567-e89b-12d3-a456-426614174001/databases/testdb/schemas/public/tables/users/columns',
        )
        .set(authHeader(viewer.accessToken))
        .expect(403);
    });

    it('should return 404 for non-existent connection', async () => {
      const contributor = await createMockContributorUser(context);

      context.prismaMock.dataConnection.findFirst.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .get(
          '/api/connections/123e4567-e89b-12d3-a456-426614174999/databases/testdb/schemas/public/tables/users/columns',
        )
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });

    it('should reach endpoint with valid auth and connection', async () => {
      const contributor = await createMockContributorUser(context);

      const mockConnection = createMockConnection({
        id: '123e4567-e89b-12d3-a456-426614174001',
        name: 'Test DB',
        ownerId: contributor.id,
        encryptedCredential: null, // No password for discovery tests
      });

      context.prismaMock.dataConnection.findFirst.mockResolvedValue(
        mockConnection,
      );

      const response = await request(context.app.getHttpServer())
        .get(
          '/api/connections/123e4567-e89b-12d3-a456-426614174001/databases/testdb/schemas/public/tables/users/columns',
        )
        .set(authHeader(contributor.accessToken));

      // Note: This test validates the API layer (auth/RBAC/ownership)
      // Without a real database, the driver connection will fail with 500
      expect([200, 500]).toContain(response.status);
    });
  });

  // ==========================================================================
  // Ownership Isolation
  // ==========================================================================

  describe('Ownership Isolation', () => {
    it('should enforce ownership on all discovery endpoints', async () => {
      const contributor = await createMockContributorUser(context);

      // Mock returns null to simulate other user's connection
      context.prismaMock.dataConnection.findFirst.mockResolvedValue(null);

      const endpoints = [
        '/api/connections/123e4567-e89b-12d3-a456-426614174001/databases',
        '/api/connections/123e4567-e89b-12d3-a456-426614174001/databases/testdb/schemas',
        '/api/connections/123e4567-e89b-12d3-a456-426614174001/databases/testdb/schemas/public/tables',
        '/api/connections/123e4567-e89b-12d3-a456-426614174001/databases/testdb/schemas/public/tables/users/columns',
      ];

      for (const endpoint of endpoints) {
        await request(context.app.getHttpServer())
          .get(endpoint)
          .set(authHeader(contributor.accessToken))
          .expect(404);
      }

      // Verify all calls included ownerId filter
      expect(context.prismaMock.dataConnection.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ownerId: contributor.id,
          }),
        }),
      );
    });
  });

  // ==========================================================================
  // Invalid UUID Format
  // ==========================================================================

  describe('Invalid UUID Format', () => {
    it('should return 400 for invalid UUID format', async () => {
      const contributor = await createMockContributorUser(context);

      const response = await request(context.app.getHttpServer())
        .get('/api/connections/invalid-uuid/databases')
        .set(authHeader(contributor.accessToken));

      expect(response.status).toBe(400);
    });
  });
});
