import request from 'supertest';
import {
  TestContext,
  createTestApp,
  closeTestApp,
} from './helpers/test-app.helper';
import { resetPrismaMock } from './mocks/prisma.mock';
import { setupBaseMocks } from './fixtures/mock-setup.helper';
import {
  createMockTestUser,
  createMockAdminUser,
  createMockContributorUser,
  createMockViewerUser,
  authHeader,
} from './helpers/auth-mock.helper';
import { createMockConnection } from './fixtures/test-data.factory';
import { randomBytes } from 'crypto';

describe('Connections (Integration)', () => {
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

  describe('GET /api/connections', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .get('/api/connections')
        .expect(401);
    });

    it('should return 403 for user without connections:read permission', async () => {
      const viewer = await createMockViewerUser(context);

      await request(context.app.getHttpServer())
        .get('/api/connections')
        .set(authHeader(viewer.accessToken))
        .expect(403);
    });

    it('should return empty list when no connections', async () => {
      const contributor = await createMockContributorUser(context);

      context.prismaMock.dataConnection.findMany.mockResolvedValue([]);
      context.prismaMock.dataConnection.count.mockResolvedValue(0);

      const response = await request(context.app.getHttpServer())
        .get('/api/connections')
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

      const mockConnections = [
        createMockConnection({
          id: '123e4567-e89b-12d3-a456-426614174001',
          name: 'Connection 1',
          createdByUserId: contributor.id,
        }),
        createMockConnection({
          id: '123e4567-e89b-12d3-a456-426614174002',
          name: 'Connection 2',
          createdByUserId: contributor.id,
        }),
      ];

      context.prismaMock.dataConnection.findMany.mockResolvedValue(
        mockConnections,
      );
      context.prismaMock.dataConnection.count.mockResolvedValue(2);

      const response = await request(context.app.getHttpServer())
        .get('/api/connections')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data.items).toHaveLength(2);
      expect(response.body.data.total).toBe(2);
      expect(response.body.data.items[0]).toHaveProperty('hasCredential');
      expect(response.body.data.items[0]).not.toHaveProperty('encryptedCredential');
    });

    it('should return all connections (no ownership filter)', async () => {
      const contributor = await createMockContributorUser(context);

      const mockConnections = [
        createMockConnection({
          id: '123e4567-e89b-12d3-a456-426614174001',
          name: 'System Connection',
          createdByUserId: contributor.id,
        }),
      ];

      context.prismaMock.dataConnection.findMany.mockResolvedValue(
        mockConnections,
      );
      context.prismaMock.dataConnection.count.mockResolvedValue(1);

      await request(context.app.getHttpServer())
        .get('/api/connections')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      // Verify no ownership filter is applied (system-level)
      expect(context.prismaMock.dataConnection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
        }),
      );
    });
  });

  describe('GET /api/connections/:id', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .get('/api/connections/123e4567-e89b-12d3-a456-426614174000')
        .expect(401);
    });

    it('should return 403 for user without connections:read permission', async () => {
      const viewer = await createMockViewerUser(context);

      await request(context.app.getHttpServer())
        .get('/api/connections/123e4567-e89b-12d3-a456-426614174000')
        .set(authHeader(viewer.accessToken))
        .expect(403);
    });

    it('should return 200 with connection data', async () => {
      const contributor = await createMockContributorUser(context);

      const mockConnection = createMockConnection({
        id: '123e4567-e89b-12d3-a456-426614174001',
        name: 'Test DB',
        createdByUserId: contributor.id,
        encryptedCredential: 'encrypted-value',
      });

      context.prismaMock.dataConnection.findUnique.mockResolvedValue(
        mockConnection,
      );

      const response = await request(context.app.getHttpServer())
        .get('/api/connections/123e4567-e89b-12d3-a456-426614174001')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data).toHaveProperty('id', '123e4567-e89b-12d3-a456-426614174001');
      expect(response.body.data).toHaveProperty('name', 'Test DB');
      expect(response.body.data).toHaveProperty('hasCredential', true);
      expect(response.body.data).not.toHaveProperty('encryptedCredential');
      expect(response.body.data).not.toHaveProperty('password');
    });

    it('should return 404 for non-existent connection', async () => {
      const contributor = await createMockContributorUser(context);

      context.prismaMock.dataConnection.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .get('/api/connections/123e4567-e89b-12d3-a456-426614174999')
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });
  });

  describe('POST /api/connections', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .post('/api/connections')
        .send({
          name: 'Test DB',
          dbType: 'postgresql',
          host: 'localhost',
          port: 5432,
        })
        .expect(401);
    });

    it('should return 403 for viewer (no connections:write)', async () => {
      const viewer = await createMockViewerUser(context);

      await request(context.app.getHttpServer())
        .post('/api/connections')
        .set(authHeader(viewer.accessToken))
        .send({
          name: 'Test DB',
          dbType: 'postgresql',
          host: 'localhost',
          port: 5432,
        })
        .expect(403);
    });

    it('should return 201 with created connection', async () => {
      const contributor = await createMockContributorUser(context);

      const mockConnection = createMockConnection({
        id: '123e4567-e89b-12d3-a456-426614174003',
        name: 'New DB',
        dbType: 'postgresql',
        host: 'localhost',
        port: 5432,
        createdByUserId: contributor.id,
      });

      context.prismaMock.dataConnection.create.mockResolvedValue(
        mockConnection,
      );
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      const response = await request(context.app.getHttpServer())
        .post('/api/connections')
        .set(authHeader(contributor.accessToken))
        .send({
          name: 'New DB',
          dbType: 'postgresql',
          host: 'localhost',
          port: 5432,
          username: 'testuser',
          password: 'secret',
          useSsl: false,
        })
        .expect(201);

      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('name', 'New DB');
      expect(response.body.data).toHaveProperty('hasCredential');
      expect(response.body.data).not.toHaveProperty('password');
      expect(context.prismaMock.dataConnection.create).toHaveBeenCalled();

      // Verify createdByUserId is passed (system-level resource)
      expect(context.prismaMock.dataConnection.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            createdByUserId: contributor.id,
          }),
        }),
      );

      // Verify ownerId is NOT used (regression guard)
      expect(context.prismaMock.dataConnection.create).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ownerId: expect.anything(),
          }),
        }),
      );
    });

    it('should validate required fields', async () => {
      const contributor = await createMockContributorUser(context);

      await request(context.app.getHttpServer())
        .post('/api/connections')
        .set(authHeader(contributor.accessToken))
        .send({
          // Missing name, dbType, host, port
        })
        .expect(400);
    });

    it('should not return password in response (only hasCredential)', async () => {
      const contributor = await createMockContributorUser(context);

      const mockConnection = createMockConnection({
        id: '123e4567-e89b-12d3-a456-426614174003',
        name: 'Secure DB',
        createdByUserId: contributor.id,
        encryptedCredential: 'encrypted-password',
      });

      context.prismaMock.dataConnection.create.mockResolvedValue(
        mockConnection,
      );
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      const response = await request(context.app.getHttpServer())
        .post('/api/connections')
        .set(authHeader(contributor.accessToken))
        .send({
          name: 'Secure DB',
          dbType: 'postgresql',
          host: 'localhost',
          port: 5432,
          password: 'my-secret-password',
        })
        .expect(201);

      expect(response.body.data).toHaveProperty('hasCredential', true);
      expect(response.body.data).not.toHaveProperty('password');
      expect(response.body.data).not.toHaveProperty('encryptedCredential');
    });
  });

  describe('PATCH /api/connections/:id', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .patch('/api/connections/123e4567-e89b-12d3-a456-426614174000')
        .send({ name: 'Updated' })
        .expect(401);
    });

    it('should return 403 for viewer (no connections:write)', async () => {
      const viewer = await createMockViewerUser(context);

      await request(context.app.getHttpServer())
        .patch('/api/connections/123e4567-e89b-12d3-a456-426614174000')
        .set(authHeader(viewer.accessToken))
        .send({ name: 'Updated' })
        .expect(403);
    });

    it('should return 200 with updated connection', async () => {
      const contributor = await createMockContributorUser(context);

      const existingConnection = createMockConnection({
        id: '123e4567-e89b-12d3-a456-426614174001',
        name: 'Old Name',
        createdByUserId: contributor.id,
      });

      const updatedConnection = {
        ...existingConnection,
        name: 'New Name',
      };

      context.prismaMock.dataConnection.findUnique.mockResolvedValue(
        existingConnection,
      );
      context.prismaMock.dataConnection.update.mockResolvedValue(
        updatedConnection,
      );
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      const response = await request(context.app.getHttpServer())
        .patch('/api/connections/123e4567-e89b-12d3-a456-426614174001')
        .set(authHeader(contributor.accessToken))
        .send({ name: 'New Name' })
        .expect(200);

      expect(response.body.data).toHaveProperty('name', 'New Name');
    });

    it('should preserve credential when password not provided', async () => {
      const contributor = await createMockContributorUser(context);

      const existingConnection = createMockConnection({
        id: '123e4567-e89b-12d3-a456-426614174001',
        name: 'DB',
        createdByUserId: contributor.id,
        encryptedCredential: 'existing-encrypted',
      });

      context.prismaMock.dataConnection.findUnique.mockResolvedValue(
        existingConnection,
      );
      context.prismaMock.dataConnection.update.mockResolvedValue(
        existingConnection,
      );
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      await request(context.app.getHttpServer())
        .patch('/api/connections/123e4567-e89b-12d3-a456-426614174001')
        .set(authHeader(contributor.accessToken))
        .send({ name: 'Updated Name' })
        .expect(200);

      // Verify update was called without encryptedCredential field
      expect(context.prismaMock.dataConnection.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({
            encryptedCredential: expect.anything(),
          }),
        }),
      );
    });

    it('should return 404 for non-existent connection', async () => {
      const contributor = await createMockContributorUser(context);

      context.prismaMock.dataConnection.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .patch('/api/connections/123e4567-e89b-12d3-a456-426614174999')
        .set(authHeader(contributor.accessToken))
        .send({ name: 'Updated' })
        .expect(404);
    });
  });

  describe('DELETE /api/connections/:id', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .delete('/api/connections/123e4567-e89b-12d3-a456-426614174000')
        .expect(401);
    });

    it('should return 403 for viewer (no connections:delete)', async () => {
      const viewer = await createMockViewerUser(context);

      await request(context.app.getHttpServer())
        .delete('/api/connections/123e4567-e89b-12d3-a456-426614174000')
        .set(authHeader(viewer.accessToken))
        .expect(403);
    });

    it('should return 204 on success', async () => {
      const contributor = await createMockContributorUser(context);

      const mockConnection = createMockConnection({
        id: '123e4567-e89b-12d3-a456-426614174001',
        name: 'To Delete',
        createdByUserId: contributor.id,
      });

      context.prismaMock.dataConnection.findUnique.mockResolvedValue(
        mockConnection,
      );
      context.prismaMock.dataConnection.delete.mockResolvedValue(
        mockConnection,
      );
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      await request(context.app.getHttpServer())
        .delete('/api/connections/123e4567-e89b-12d3-a456-426614174001')
        .set(authHeader(contributor.accessToken))
        .expect(204);

      expect(context.prismaMock.dataConnection.delete).toHaveBeenCalledWith({
        where: { id: '123e4567-e89b-12d3-a456-426614174001' },
      });
    });

    it('should return 404 for non-existent connection', async () => {
      const contributor = await createMockContributorUser(context);

      context.prismaMock.dataConnection.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .delete('/api/connections/123e4567-e89b-12d3-a456-426614174999')
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });
  });

  describe('POST /api/connections/test', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .post('/api/connections/test')
        .send({
          dbType: 'postgresql',
          host: 'localhost',
          port: 5432,
        })
        .expect(401);
    });

    it('should return 403 for viewer (no connections:test)', async () => {
      const viewer = await createMockViewerUser(context);

      await request(context.app.getHttpServer())
        .post('/api/connections/test')
        .set(authHeader(viewer.accessToken))
        .send({
          dbType: 'postgresql',
          host: 'localhost',
          port: 5432,
        })
        .expect(403);
    });

    it('should return test result for new connection', async () => {
      const contributor = await createMockContributorUser(context);

      // Note: In real integration, this will attempt to connect and fail
      // The response status depends on the driver's behavior
      // For this test, we just verify the endpoint accepts the request
      const response = await request(context.app.getHttpServer())
        .post('/api/connections/test')
        .set(authHeader(contributor.accessToken))
        .send({
          dbType: 'postgresql',
          host: 'invalid-host-that-will-fail',
          port: 5432,
          username: 'testuser',
          password: 'testpass',
        });

      // POST methods return 201 by default in NestJS
      // The driver will attempt connection and return the result
      expect(response.status).toBe(201);
      expect(response.body.data).toHaveProperty('success');
      expect(response.body.data).toHaveProperty('message');
    });
  });

  describe('POST /api/connections/:id/test', () => {
    it('should return 401 if not authenticated', async () => {
      await request(context.app.getHttpServer())
        .post('/api/connections/123e4567-e89b-12d3-a456-426614174000/test')
        .expect(401);
    });

    it('should return 403 for viewer (no connections:test)', async () => {
      const viewer = await createMockViewerUser(context);

      await request(context.app.getHttpServer())
        .post('/api/connections/123e4567-e89b-12d3-a456-426614174000/test')
        .set(authHeader(viewer.accessToken))
        .expect(403);
    });

    it('should test existing connection', async () => {
      const contributor = await createMockContributorUser(context);

      const mockConnection = createMockConnection({
        id: '123e4567-e89b-12d3-a456-426614174001',
        name: 'Test DB',
        createdByUserId: contributor.id,
        encryptedCredential: null,
      });

      context.prismaMock.dataConnection.findUnique.mockResolvedValue(
        mockConnection,
      );
      context.prismaMock.dataConnection.update.mockResolvedValue(
        mockConnection,
      );
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      const response = await request(context.app.getHttpServer())
        .post('/api/connections/123e4567-e89b-12d3-a456-426614174001/test')
        .set(authHeader(contributor.accessToken));

      // POST methods return 201 by default in NestJS
      // The driver will attempt connection and return the result
      expect(response.status).toBe(201);
      expect(response.body.data).toHaveProperty('success');
      expect(response.body.data).toHaveProperty('message');

      // Verify test results were saved
      expect(context.prismaMock.dataConnection.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: '123e4567-e89b-12d3-a456-426614174001' },
          data: expect.objectContaining({
            lastTestedAt: expect.any(Date),
            lastTestResult: expect.any(Boolean),
            lastTestMessage: expect.any(String),
          }),
        }),
      );
    });

    it('should return 400 for invalid UUID format', async () => {
      const contributor = await createMockContributorUser(context);

      const response = await request(context.app.getHttpServer())
        .post('/api/connections/nonexistent/test')
        .set(authHeader(contributor.accessToken));

      // ParseUUIDPipe validates UUID format and returns 400 for invalid format
      expect(response.status).toBe(400);
    });

    it('should return 404 for valid UUID that does not exist', async () => {
      const contributor = await createMockContributorUser(context);

      context.prismaMock.dataConnection.findUnique.mockResolvedValue(null);

      await request(context.app.getHttpServer())
        .post('/api/connections/123e4567-e89b-12d3-a456-426614174999/test')
        .set(authHeader(contributor.accessToken))
        .expect(404);
    });
  });
});
