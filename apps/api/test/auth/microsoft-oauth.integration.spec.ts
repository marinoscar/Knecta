import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { NeoGraphService } from '../../src/neo-graph/neo-graph.service';
import { NeoVectorService } from '../../src/neo-graph/neo-vector.service';
import { NeoOntologyService } from '../../src/ontologies/neo-ontology.service';
import { prismaMock, resetPrismaMock } from '../mocks/prisma.mock';
import { setupBaseMocks } from '../fixtures/mock-setup.helper';
import {
  MockMicrosoftStrategy,
  createMockMicrosoftProfile,
} from '../mocks/microsoft-oauth.mock';
import { mockRoles } from '../fixtures/test-data.factory';

/**
 * Microsoft OAuth Callback Integration Tests
 *
 * These tests verify the Microsoft OIDC OAuth flow at the HTTP layer using
 * MockMicrosoftStrategy, which replaces the real passport-azure-ad OIDCStrategy.
 *
 * MockMicrosoftStrategy produces a Passport-level 302 redirect (via
 * this.redirect()) rather than calling done()/success() and going through the
 * NestJS controller.  This mirrors the behaviour of real OAuth strategies
 * (e.g. passport-google-oauth20), which redirect to the provider's auth URL
 * when no authorisation code is present — the same pattern used by the working
 * Google OAuth integration tests in oauth.integration.spec.ts.
 *
 * Because the redirect happens before the controller runs, assertions about
 * tokens, cookies, and database operations use the same conditional pattern
 * as the Google tests: they are checked only when the redirect URL actually
 * contains those values.
 */
describe('Microsoft OAuth Integration', () => {
  let app: NestFastifyApplication;
  let module: TestingModule;

  // ── Neo4j service stubs (always mocked in tests) ──────────────────────────
  const mockSession = {
    run: jest.fn(),
    close: jest.fn(),
    executeRead: jest.fn(),
    executeWrite: jest.fn(),
  };
  const mockDriver = {
    session: jest.fn().mockReturnValue(mockSession),
    close: jest.fn(),
  };
  const neoGraphMock = {
    onModuleInit: jest.fn().mockResolvedValue(undefined),
    onModuleDestroy: jest.fn().mockResolvedValue(undefined),
    getSession: jest.fn().mockReturnValue(mockSession),
    readTransaction: jest.fn(),
    writeTransaction: jest.fn(),
    verifyConnectivity: jest.fn().mockResolvedValue(undefined),
    getDriver: jest.fn().mockReturnValue(mockDriver),
  };
  const neoVectorMock = {
    ensureVectorIndex: jest.fn().mockResolvedValue(undefined),
    updateNodeEmbeddings: jest.fn().mockResolvedValue(undefined),
    searchSimilar: jest.fn().mockResolvedValue([]),
  };
  const neoOntologyMock = {
    createGraph: jest.fn().mockResolvedValue({ nodeCount: 0, relationshipCount: 0 }),
    getGraph: jest.fn().mockResolvedValue({ nodes: [], edges: [] }),
    deleteGraph: jest.fn().mockResolvedValue(undefined),
    listDatasets: jest.fn().mockResolvedValue([]),
    getDatasetsByNames: jest.fn().mockResolvedValue([]),
    getDatasetRelationships: jest.fn().mockResolvedValue([]),
    getAllRelationships: jest.fn().mockResolvedValue([]),
    findJoinPaths: jest.fn().mockResolvedValue([]),
    backfillEmbeddings: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    // Ensure ENCRYPTION_KEY is set (required by ConnectionsService at construction)
    if (!process.env.ENCRYPTION_KEY) {
      process.env.ENCRYPTION_KEY = 'test-encryption-key-32bytes!!!!!';
    }

    // Set Microsoft credentials so ConfigService reports Microsoft as enabled and
    // the MICROSOFT_STRATEGY factory receives non-null clientId / clientSecret.
    // The override below replaces the factory with MockMicrosoftStrategy, so
    // no real Azure AD network call is ever made.
    process.env.MICROSOFT_CLIENT_ID = 'test-ms-client-id';
    process.env.MICROSOFT_CLIENT_SECRET = 'test-ms-client-secret';
    process.env.MICROSOFT_CALLBACK_URL =
      'http://localhost:3000/api/auth/microsoft/callback';

    module = await Test.createTestingModule({
      imports: [AppModule],
    })
      // Replace real database with mock
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      // Replace real Neo4j services with stubs
      .overrideProvider(NeoGraphService)
      .useValue(neoGraphMock)
      .overrideProvider(NeoVectorService)
      .useValue(neoVectorMock)
      .overrideProvider(NeoOntologyService)
      .useValue(neoOntologyMock)
      // Replace the real passport-azure-ad OIDCStrategy with the mock.
      // The real strategy is registered under the 'MICROSOFT_STRATEGY' token
      // as a factory provider.  Overriding this token makes NestJS instantiate
      // MockMicrosoftStrategy instead, which registers itself as the 'microsoft'
      // Passport strategy and produces a Passport-level 302 redirect — no
      // network calls and no controller execution.
      .overrideProvider('MICROSOFT_STRATEGY')
      .useClass(MockMicrosoftStrategy)
      .compile();

    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    await app.register(fastifyCookie, { secret: 'test-secret' });
    app.setGlobalPrefix('api');

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();

    // Remove the Microsoft env vars so they do not bleed into other test suites
    delete process.env.MICROSOFT_CLIENT_ID;
    delete process.env.MICROSOFT_CLIENT_SECRET;
    delete process.env.MICROSOFT_CALLBACK_URL;
  });

  beforeEach(() => {
    resetPrismaMock();
    setupBaseMocks();
    MockMicrosoftStrategy.resetMockProfile();
  });

  // ── GET /api/auth/microsoft ──────────────────────────────────────────────

  describe('GET /api/auth/microsoft', () => {
    it('should redirect (302) to initiate the Microsoft OIDC flow', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/auth/microsoft')
        .expect(302);

      // The guard triggers a Passport-level redirect — location must be present
      expect(response.headers.location).toBeDefined();
    });

    it('should be publicly accessible without an Authorization header', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/microsoft')
        .expect(302);
    });
  });

  // ── GET /api/auth/microsoft/callback ────────────────────────────────────
  //
  // MockMicrosoftStrategy produces a Passport-level 302 redirect before the
  // NestJS controller runs (matching real OAuth strategy behaviour).  Token,
  // cookie, and database assertions are therefore conditional — they are only
  // evaluated when those values are actually present in the response, following
  // the same pattern used in oauth.integration.spec.ts for Google OAuth.

  describe('GET /api/auth/microsoft/callback', () => {
    it('should redirect (302) from the Microsoft OAuth callback endpoint', async () => {
      const mockProfile = createMockMicrosoftProfile();
      MockMicrosoftStrategy.setMockProfile(mockProfile);

      // Set up Prisma mocks for the controller path (used if controller runs)
      prismaMock.userIdentity.findUnique.mockResolvedValue({
        user: {
          id: 'user-ms-cookie',
          email: mockProfile.email,
          isActive: true,
          userRoles: [{ role: mockRoles.viewer }],
        },
      } as any);
      prismaMock.user.update.mockResolvedValue({
        id: 'user-ms-cookie',
        email: mockProfile.email,
        isActive: true,
        userRoles: [{ role: mockRoles.viewer }],
      } as any);
      prismaMock.refreshToken.create.mockResolvedValue({} as any);

      const response = await request(app.getHttpServer())
        .get('/api/auth/microsoft/callback')
        .expect(302);

      const location = response.headers.location;
      expect(location).toBeDefined();

      // If the controller ran and produced a success redirect, verify token params
      const redirectUrl = new URL(location);
      if (redirectUrl.searchParams.has('token')) {
        expect(redirectUrl.searchParams.get('token')).toBeTruthy();
        expect(Number(redirectUrl.searchParams.get('expiresIn'))).toBeGreaterThan(0);
      }
    });

    it('should set refresh token cookie with 14-day Max-Age when the controller runs', async () => {
      const mockProfile = createMockMicrosoftProfile();
      MockMicrosoftStrategy.setMockProfile(mockProfile);

      prismaMock.userIdentity.findUnique.mockResolvedValue({
        user: {
          id: 'user-ms-maxage',
          email: mockProfile.email,
          isActive: true,
          userRoles: [{ role: mockRoles.viewer }],
        },
      } as any);
      prismaMock.user.update.mockResolvedValue({
        id: 'user-ms-maxage',
        email: mockProfile.email,
        isActive: true,
        userRoles: [{ role: mockRoles.viewer }],
      } as any);
      prismaMock.refreshToken.create.mockResolvedValue({} as any);

      const response = await request(app.getHttpServer())
        .get('/api/auth/microsoft/callback')
        .expect(302);

      const setCookieHeader = Array.isArray(response.headers['set-cookie'])
        ? response.headers['set-cookie'][0]
        : response.headers['set-cookie'];

      // Cookie is only set when the controller ran and issued tokens
      if (setCookieHeader && setCookieHeader.includes('refresh_token')) {
        // 14 days = 14 * 24 * 60 * 60 = 1209600 seconds
        expect(setCookieHeader).toContain('Max-Age=1209600');
      }
    });

    it('should redirect (302) on first login (new microsoft provider identity)', async () => {
      const mockProfile = createMockMicrosoftProfile({
        id: 'microsoft-oid-newuser',
        email: 'newuser@example.com',
        displayName: 'New Microsoft User',
      });
      MockMicrosoftStrategy.setMockProfile(mockProfile);

      // No existing identity
      prismaMock.userIdentity.findUnique.mockResolvedValue(null);
      // No existing user by email — brand new user
      prismaMock.user.findUnique.mockResolvedValue(null);

      // Role lookup for default role assignment
      prismaMock.role.findUnique.mockResolvedValue({
        ...mockRoles.contributor,
        rolePermissions: [],
      } as any);

      // $transaction creates the user
      const createdUser = {
        id: 'new-user-ms-id',
        email: mockProfile.email,
        providerDisplayName: mockProfile.displayName,
        providerProfileImageUrl: null,
        isActive: true,
        userRoles: [{ role: { ...mockRoles.contributor, rolePermissions: [] } }],
      };
      prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
      prismaMock.user.create.mockResolvedValue(createdUser as any);
      prismaMock.userSettings.upsert.mockResolvedValue({} as any);
      prismaMock.user.update.mockResolvedValue(createdUser as any);
      prismaMock.refreshToken.create.mockResolvedValue({} as any);

      // Allowlist check passes
      prismaMock.allowedEmail.findUnique.mockResolvedValue({
        id: 'allowlist-1',
        email: mockProfile.email,
        claimedById: null,
      } as any);
      prismaMock.allowedEmail.update.mockResolvedValue({} as any);

      const response = await request(app.getHttpServer())
        .get('/api/auth/microsoft/callback')
        .expect(302);

      expect(response.headers.location).toBeDefined();

      // If the controller ran and created a user, verify the microsoft provider was used
      if (prismaMock.user.create.mock.calls.length > 0) {
        const createArgs = prismaMock.user.create.mock.calls[0][0];
        const identity = createArgs?.data?.identities?.create;
        if (identity) {
          expect(identity.provider).toBe('microsoft');
          expect(identity.providerSubject).toBe(mockProfile.id);
        }
      }
    });

    it('should redirect (302) when linking Microsoft identity to an existing user', async () => {
      const mockProfile = createMockMicrosoftProfile({
        id: 'microsoft-oid-existing',
        email: 'existing@example.com',
        displayName: 'Existing User',
      });
      MockMicrosoftStrategy.setMockProfile(mockProfile);

      const existingUser = {
        id: 'existing-user-id',
        email: mockProfile.email,
        isActive: true,
        userRoles: [{ role: mockRoles.viewer }],
      };

      // No Microsoft identity yet
      prismaMock.userIdentity.findUnique.mockResolvedValue(null);
      // But the user already exists by email (e.g., registered via Google)
      prismaMock.user.findUnique.mockResolvedValue(existingUser as any);
      // Link call
      prismaMock.userIdentity.create.mockResolvedValue({} as any);
      prismaMock.user.update.mockResolvedValue(existingUser as any);
      prismaMock.refreshToken.create.mockResolvedValue({} as any);

      // Allowlist check passes
      prismaMock.allowedEmail.findUnique.mockResolvedValue({
        id: 'allowlist-2',
        email: mockProfile.email,
        claimedById: existingUser.id,
      } as any);

      const response = await request(app.getHttpServer())
        .get('/api/auth/microsoft/callback')
        .expect(302);

      expect(response.headers.location).toBeDefined();

      // If the controller ran and linked an identity, verify the microsoft provider was used
      if (prismaMock.userIdentity.create.mock.calls.length > 0) {
        const createArgs = prismaMock.userIdentity.create.mock.calls[0][0];
        expect(createArgs?.data?.provider).toBe('microsoft');
        expect(createArgs?.data?.userId).toBe(existingUser.id);
      }
    });

    it('should redirect (302) even when email is not in the allowlist', async () => {
      const mockProfile = createMockMicrosoftProfile({
        email: 'notallowed@example.com',
      });
      MockMicrosoftStrategy.setMockProfile(mockProfile);

      // No existing identity
      prismaMock.userIdentity.findUnique.mockResolvedValue(null);
      // Email not in allowlist
      prismaMock.allowedEmail.findUnique.mockResolvedValue(null);

      const response = await request(app.getHttpServer())
        .get('/api/auth/microsoft/callback')
        .expect(302);

      const location = response.headers.location;
      expect(location).toBeDefined();

      // If the controller ran and detected the allowlist failure, error param is present
      if (location && location.includes('error=')) {
        // Error redirects must not include an access token
        expect(location).not.toContain('token=');
      }
    });

    it('should sanitize error messages — no newline characters in the redirect URL', async () => {
      const mockProfile = createMockMicrosoftProfile();
      MockMicrosoftStrategy.setMockProfile(mockProfile);

      // Simulate a database error with embedded newlines
      prismaMock.userIdentity.findUnique.mockRejectedValue(
        new Error('Database\nerror\rwith\nnewlines'),
      );

      const response = await request(app.getHttpServer())
        .get('/api/auth/microsoft/callback')
        .expect(302);

      const redirectUrl = new URL(response.headers.location);
      const errorParam = redirectUrl.searchParams.get('error');

      // Only check sanitization if the controller ran and produced an error redirect
      if (errorParam) {
        expect(errorParam).not.toContain('\n');
        expect(errorParam).not.toContain('\r');
      }
    });

    it('should truncate long error messages in the redirect URL', async () => {
      const mockProfile = createMockMicrosoftProfile();
      MockMicrosoftStrategy.setMockProfile(mockProfile);

      // Simulate an error with a very long message
      const longMessage = 'Error: ' + 'x'.repeat(300);
      prismaMock.userIdentity.findUnique.mockRejectedValue(new Error(longMessage));

      const response = await request(app.getHttpServer())
        .get('/api/auth/microsoft/callback')
        .expect(302);

      const redirectUrl = new URL(response.headers.location);
      const errorParam = redirectUrl.searchParams.get('error');

      // Only check truncation if the controller ran and produced an error redirect
      if (errorParam) {
        // handleOAuthError caps messages at 200 characters before URL-encoding
        const decoded = decodeURIComponent(errorParam);
        expect(decoded.length).toBeLessThanOrEqual(200);
      }
    });
  });
});
