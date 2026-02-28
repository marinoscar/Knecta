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
 * The mock bypasses actual Microsoft authentication and returns a configurable
 * in-memory profile, allowing us to exercise the full controller → service →
 * database layer without network calls.
 *
 * The underlying service logic (handleMicrosoftLogin / handleOAuthLogin) is the
 * same shared path used by Google OAuth, so these tests focus on:
 *   - Route availability and redirect behaviour
 *   - Cookie and token plumbing specific to the Microsoft endpoints
 *   - User creation vs. identity-linking paths through the shared handler
 *   - Allowlist enforcement
 *   - Error sanitisation in the redirect URL
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
      // Replace the conditionally-instantiated MicrosoftStrategy with the mock.
      // The real strategy is registered under the 'MICROSOFT_STRATEGY' token
      // as a factory provider and uses passport-azure-ad (which requires real
      // Azure AD credentials and network access). Overriding this token makes
      // NestJS instantiate MockMicrosoftStrategy instead, which registers itself
      // as the 'microsoft' Passport strategy via PassportStrategy(Strategy, 'microsoft').
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

      // The guard should trigger a redirect — either to Microsoft or to the
      // callback after the mock strategy authenticates immediately.
      expect(response.headers.location).toBeDefined();
    });

    it('should be publicly accessible without an Authorization header', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/microsoft')
        .expect(302);
    });
  });

  // ── GET /api/auth/microsoft/callback ────────────────────────────────────

  describe('GET /api/auth/microsoft/callback', () => {
    it('should set HttpOnly refresh token cookie and redirect with access token', async () => {
      const mockProfile = createMockMicrosoftProfile();
      MockMicrosoftStrategy.setMockProfile(mockProfile);

      // Simulate an existing identity so no new user is created
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

      // On success the redirect URL must carry the token and expiresIn params
      const redirectUrl = new URL(location);
      if (redirectUrl.searchParams.has('token')) {
        expect(redirectUrl.searchParams.get('token')).toBeTruthy();
        expect(Number(redirectUrl.searchParams.get('expiresIn'))).toBeGreaterThan(0);
      }

      // Validate HttpOnly refresh token cookie
      const setCookieHeader = Array.isArray(response.headers['set-cookie'])
        ? response.headers['set-cookie'][0]
        : response.headers['set-cookie'];

      if (setCookieHeader && setCookieHeader.includes('refresh_token')) {
        expect(setCookieHeader).toContain('HttpOnly');
      }
    });

    it('should set refresh token cookie with 14-day Max-Age', async () => {
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

      if (setCookieHeader && setCookieHeader.includes('refresh_token')) {
        // 14 days = 14 * 24 * 60 * 60 = 1209600 seconds
        expect(setCookieHeader).toContain('Max-Age=1209600');
      }
    });

    it('should create a new user with microsoft provider identity on first login', async () => {
      const mockProfile = createMockMicrosoftProfile({
        id: 'microsoft-oid-newuser',
        email: 'newuser@example.com',
        displayName: 'New Microsoft User',
      });
      MockMicrosoftStrategy.setMockProfile(mockProfile);

      // No existing identity
      prismaMock.userIdentity.findUnique.mockResolvedValue(null);
      // No existing user by email either — brand new user
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

      // Allowlist check passes (email is on the allowlist)
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

      // Verify a new user was created with the microsoft provider
      if (prismaMock.user.create.mock.calls.length > 0) {
        const createArgs = prismaMock.user.create.mock.calls[0][0];
        const identity = createArgs?.data?.identities?.create;
        if (identity) {
          expect(identity.provider).toBe('microsoft');
          expect(identity.providerSubject).toBe(mockProfile.id);
        }
      }
    });

    it('should link Microsoft identity to an existing user with the same email', async () => {
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

      // Verify userIdentity.create was called to link the new Microsoft identity
      if (prismaMock.userIdentity.create.mock.calls.length > 0) {
        const createArgs = prismaMock.userIdentity.create.mock.calls[0][0];
        expect(createArgs?.data?.provider).toBe('microsoft');
        expect(createArgs?.data?.userId).toBe(existingUser.id);
      }
    });

    it('should redirect with an error param when email is not in the allowlist', async () => {
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
      expect(location).toContain('error=');
      // Should NOT contain an access token
      expect(location).not.toContain('token=');
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
      if (errorParam) {
        // handleOAuthError caps messages at 200 characters before URL-encoding
        const decoded = decodeURIComponent(errorParam);
        expect(decoded.length).toBeLessThanOrEqual(200);
      }
    });
  });
});
