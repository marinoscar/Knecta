import request from 'supertest';
import { createHash, randomBytes } from 'crypto';
import {
  TestContext,
  createTestApp,
  closeTestApp,
} from './helpers/test-app.helper';
import { resetPrismaMock } from './mocks/prisma.mock';
import { setupBaseMocks } from './fixtures/mock-setup.helper';
import {
  createMockTestUser,
  createMockInactiveUser,
  authHeader,
} from './helpers/auth-mock.helper';

describe('OAuth 2.1 Integration', () => {
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

  // ============================================================================
  // Helper Functions
  // ============================================================================

  /**
   * Generate a valid PKCE code_verifier and code_challenge pair
   */
  function generatePkce(): { codeVerifier: string; codeChallenge: string } {
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    return { codeVerifier, codeChallenge };
  }

  /**
   * Create a mock authorization code in the database
   */
  function createMockAuthCode(
    userId: string,
    clientId: string,
    redirectUri: string,
    codeChallenge: string,
    options: {
      used?: boolean;
      expired?: boolean;
      scope?: string;
      resource?: string;
    } = {},
  ) {
    const code = randomBytes(32).toString('base64url');
    const expiresAt = options.expired
      ? new Date(Date.now() - 60000) // Expired 1 minute ago
      : new Date(Date.now() + 60000); // Expires in 1 minute

    return {
      id: randomBytes(16).toString('hex'),
      code,
      userId,
      clientId,
      redirectUri,
      scope: options.scope || 'data_agent:read',
      codeChallenge,
      codeChallengeMethod: 'S256' as const,
      resource: options.resource || null,
      expiresAt,
      used: options.used || false,
      createdAt: new Date(),
    };
  }

  // ============================================================================
  // Authorization Endpoint Tests
  // ============================================================================

  describe('GET /api/oauth/authorize', () => {
    const validAuthParams = {
      response_type: 'code',
      client_id: 'test-client-id',
      redirect_uri: 'http://localhost:3001/callback',
      code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      code_challenge_method: 'S256',
      scope: 'data_agent:read',
    };

    it('should return 401 when no auth token provided', async () => {
      const response = await request(context.app.getHttpServer())
        .get('/api/oauth/authorize')
        .query(validAuthParams)
        .expect(401);

      expect(response.body).toHaveProperty('error', 'login_required');
      expect(response.body).toHaveProperty('login_url', '/api/auth/google');
    });

    it('should redirect with auth code when authenticated user calls with valid params', async () => {
      const user = await createMockTestUser(context);

      // Mock oAuthAuthorizationCode.create to return a valid auth code
      const generatedCode = randomBytes(32).toString('base64url');
      context.prismaMock.oAuthAuthorizationCode.create.mockResolvedValue({
        id: 'auth-code-id',
        code: generatedCode,
        userId: user.id,
        clientId: validAuthParams.client_id,
        redirectUri: validAuthParams.redirect_uri,
        scope: validAuthParams.scope,
        codeChallenge: validAuthParams.code_challenge,
        codeChallengeMethod: 'S256',
        resource: null,
        expiresAt: new Date(Date.now() + 60000),
        used: false,
        createdAt: new Date(),
      });

      const response = await request(context.app.getHttpServer())
        .get('/api/oauth/authorize')
        .set(authHeader(user.accessToken))
        .query(validAuthParams)
        .redirects(0); // Don't follow redirects

      // Should redirect (302 or 303 are both acceptable)
      expect([302, 303]).toContain(response.status);

      // Verify redirect location contains code
      const location = response.headers.location;
      expect(location).toBeDefined();
      expect(location).toContain(validAuthParams.redirect_uri);
      expect(location).toContain('code=');

      // Verify oAuthAuthorizationCode.create was called with correct params
      expect(context.prismaMock.oAuthAuthorizationCode.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: user.id,
          clientId: validAuthParams.client_id,
          redirectUri: validAuthParams.redirect_uri,
          scope: validAuthParams.scope,
          codeChallenge: validAuthParams.code_challenge,
          codeChallengeMethod: 'S256',
          used: false,
        }),
      });
    });

    it('should include state parameter in redirect if provided', async () => {
      const user = await createMockTestUser(context);

      const generatedCode = randomBytes(32).toString('base64url');
      context.prismaMock.oAuthAuthorizationCode.create.mockResolvedValue({
        id: 'auth-code-id',
        code: generatedCode,
        userId: user.id,
        clientId: validAuthParams.client_id,
        redirectUri: validAuthParams.redirect_uri,
        scope: validAuthParams.scope,
        codeChallenge: validAuthParams.code_challenge,
        codeChallengeMethod: 'S256',
        resource: null,
        expiresAt: new Date(Date.now() + 60000),
        used: false,
        createdAt: new Date(),
      });

      const response = await request(context.app.getHttpServer())
        .get('/api/oauth/authorize')
        .set(authHeader(user.accessToken))
        .query({ ...validAuthParams, state: 'random-state-value' })
        .redirects(0);

      expect([302, 303]).toContain(response.status);

      const location = response.headers.location;
      expect(location).toContain('code=');
      expect(location).toContain('state=random-state-value');
    });

    it('should handle optional resource parameter', async () => {
      const user = await createMockTestUser(context);

      const generatedCode = randomBytes(32).toString('base64url');
      context.prismaMock.oAuthAuthorizationCode.create.mockResolvedValue({
        id: 'auth-code-id',
        code: generatedCode,
        userId: user.id,
        clientId: validAuthParams.client_id,
        redirectUri: validAuthParams.redirect_uri,
        scope: validAuthParams.scope,
        codeChallenge: validAuthParams.code_challenge,
        codeChallengeMethod: 'S256',
        resource: 'http://localhost:8319/api/data-agent/mcp',
        expiresAt: new Date(Date.now() + 60000),
        used: false,
        createdAt: new Date(),
      });

      const response = await request(context.app.getHttpServer())
        .get('/api/oauth/authorize')
        .set(authHeader(user.accessToken))
        .query({
          ...validAuthParams,
          resource: 'http://localhost:8319/api/data-agent/mcp',
        })
        .redirects(0);

      expect([302, 303]).toContain(response.status);

      expect(context.prismaMock.oAuthAuthorizationCode.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          resource: 'http://localhost:8319/api/data-agent/mcp',
        }),
      });
    });
  });

  // ============================================================================
  // Token Endpoint Tests — authorization_code grant
  // ============================================================================

  describe('POST /api/oauth/token — authorization_code grant', () => {
    const validClientId = 'test-client';
    const validRedirectUri = 'http://localhost:3001/callback';

    it('should return 400 when missing required fields', async () => {
      const response = await request(context.app.getHttpServer())
        .post('/api/oauth/token')
        .send({ grant_type: 'authorization_code' })
        .expect(400);

      expect(response.body.message).toContain(
        'code, code_verifier, redirect_uri, and client_id are required',
      );
    });

    it('should return 401 when code is invalid (not found)', async () => {
      const { codeVerifier } = generatePkce();

      context.prismaMock.oAuthAuthorizationCode.findUnique.mockResolvedValue(
        null,
      );

      await request(context.app.getHttpServer())
        .post('/api/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code: 'invalid-code',
          code_verifier: codeVerifier,
          redirect_uri: validRedirectUri,
          client_id: validClientId,
        })
        .expect(401);
    });

    it('should return 401 when code is already used', async () => {
      const user = await createMockTestUser(context);
      const { codeVerifier, codeChallenge } = generatePkce();
      const authCode = createMockAuthCode(
        user.id,
        validClientId,
        validRedirectUri,
        codeChallenge,
        { used: true },
      );

      context.prismaMock.oAuthAuthorizationCode.findUnique.mockResolvedValue(
        authCode,
      );

      await request(context.app.getHttpServer())
        .post('/api/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code: authCode.code,
          code_verifier: codeVerifier,
          redirect_uri: validRedirectUri,
          client_id: validClientId,
        })
        .expect(401);
    });

    it('should return 401 when code is expired', async () => {
      const user = await createMockTestUser(context);
      const { codeVerifier, codeChallenge } = generatePkce();
      const authCode = createMockAuthCode(
        user.id,
        validClientId,
        validRedirectUri,
        codeChallenge,
        { expired: true },
      );

      context.prismaMock.oAuthAuthorizationCode.findUnique.mockResolvedValue(
        authCode,
      );

      await request(context.app.getHttpServer())
        .post('/api/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code: authCode.code,
          code_verifier: codeVerifier,
          redirect_uri: validRedirectUri,
          client_id: validClientId,
        })
        .expect(401);
    });

    it('should return 400 when redirect_uri does not match', async () => {
      const user = await createMockTestUser(context);
      const { codeVerifier, codeChallenge } = generatePkce();
      const authCode = createMockAuthCode(
        user.id,
        validClientId,
        validRedirectUri,
        codeChallenge,
      );

      context.prismaMock.oAuthAuthorizationCode.findUnique.mockResolvedValue(
        authCode,
      );

      await request(context.app.getHttpServer())
        .post('/api/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code: authCode.code,
          code_verifier: codeVerifier,
          redirect_uri: 'http://evil.com/callback', // Different redirect_uri
          client_id: validClientId,
        })
        .expect(400);
    });

    it('should return 400 when client_id does not match', async () => {
      const user = await createMockTestUser(context);
      const { codeVerifier, codeChallenge } = generatePkce();
      const authCode = createMockAuthCode(
        user.id,
        validClientId,
        validRedirectUri,
        codeChallenge,
      );

      context.prismaMock.oAuthAuthorizationCode.findUnique.mockResolvedValue(
        authCode,
      );

      await request(context.app.getHttpServer())
        .post('/api/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code: authCode.code,
          code_verifier: codeVerifier,
          redirect_uri: validRedirectUri,
          client_id: 'different-client-id',
        })
        .expect(400);
    });

    it('should return 401 when PKCE verification fails', async () => {
      const user = await createMockTestUser(context);
      const { codeChallenge } = generatePkce();
      const authCode = createMockAuthCode(
        user.id,
        validClientId,
        validRedirectUri,
        codeChallenge,
      );

      context.prismaMock.oAuthAuthorizationCode.findUnique.mockResolvedValue(
        authCode,
      );

      // Use a different code_verifier (won't match challenge)
      const wrongVerifier = randomBytes(32).toString('base64url');

      await request(context.app.getHttpServer())
        .post('/api/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code: authCode.code,
          code_verifier: wrongVerifier,
          redirect_uri: validRedirectUri,
          client_id: validClientId,
        })
        .expect(401);
    });

    it('should return 401 when user is inactive', async () => {
      const user = await createMockInactiveUser(context);
      const { codeVerifier, codeChallenge } = generatePkce();
      const authCode = createMockAuthCode(
        user.id,
        validClientId,
        validRedirectUri,
        codeChallenge,
      );

      context.prismaMock.oAuthAuthorizationCode.findUnique.mockResolvedValue(
        authCode,
      );
      context.prismaMock.oAuthAuthorizationCode.update.mockResolvedValue({
        ...authCode,
        used: true,
      });

      // Mock user.findUnique to return inactive user
      context.prismaMock.user.findUnique.mockResolvedValue({
        id: user.id,
        email: user.email,
        displayName: null,
        providerDisplayName: 'Test User',
        profileImageUrl: null,
        providerProfileImageUrl: null,
        isActive: false, // Inactive
        createdAt: new Date(),
        updatedAt: new Date(),
        userRoles: [],
      });

      await request(context.app.getHttpServer())
        .post('/api/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code: authCode.code,
          code_verifier: codeVerifier,
          redirect_uri: validRedirectUri,
          client_id: validClientId,
        })
        .expect(401);
    });

    it('should return 200 with tokens on success', async () => {
      const user = await createMockTestUser(context);
      const { codeVerifier, codeChallenge } = generatePkce();
      const authCode = createMockAuthCode(
        user.id,
        validClientId,
        validRedirectUri,
        codeChallenge,
      );

      context.prismaMock.oAuthAuthorizationCode.findUnique.mockResolvedValue(
        authCode,
      );
      context.prismaMock.oAuthAuthorizationCode.update.mockResolvedValue({
        ...authCode,
        used: true,
      });

      // Mock user.findUnique to return active user with roles
      context.prismaMock.user.findUnique.mockResolvedValue({
        id: user.id,
        email: user.email,
        displayName: null,
        providerDisplayName: 'Test User',
        profileImageUrl: null,
        providerProfileImageUrl: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        userRoles: [
          {
            userId: user.id,
            roleId: 'contributor-role-id',
            role: {
              id: 'contributor-role-id',
              name: 'contributor',
              description: 'Contributor role',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
        ],
      });

      // Mock refreshToken.create for token generation
      context.prismaMock.refreshToken.create.mockResolvedValue({
        id: 'refresh-token-id',
        userId: user.id,
        tokenHash: 'hashed-refresh-token',
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      });

      const response = await request(context.app.getHttpServer())
        .post('/api/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code: authCode.code,
          code_verifier: codeVerifier,
          redirect_uri: validRedirectUri,
          client_id: validClientId,
        })
        .expect(200);

      // Verify response structure (wrapped in { data, meta })
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('access_token');
      expect(response.body.data).toHaveProperty('token_type', 'Bearer');
      expect(response.body.data).toHaveProperty('expires_in');
      expect(response.body.data).toHaveProperty('refresh_token');

      // Verify code was marked as used
      expect(context.prismaMock.oAuthAuthorizationCode.update).toHaveBeenCalledWith(
        {
          where: { code: authCode.code },
          data: { used: true },
        },
      );
    });

    it('should verify PKCE correctly with valid code_verifier', async () => {
      const user = await createMockTestUser(context);
      const { codeVerifier, codeChallenge } = generatePkce();
      const authCode = createMockAuthCode(
        user.id,
        validClientId,
        validRedirectUri,
        codeChallenge,
      );

      context.prismaMock.oAuthAuthorizationCode.findUnique.mockResolvedValue(
        authCode,
      );
      context.prismaMock.oAuthAuthorizationCode.update.mockResolvedValue({
        ...authCode,
        used: true,
      });
      context.prismaMock.user.findUnique.mockResolvedValue({
        id: user.id,
        email: user.email,
        displayName: null,
        providerDisplayName: 'Test User',
        profileImageUrl: null,
        providerProfileImageUrl: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        userRoles: [
          {
            userId: user.id,
            roleId: 'contributor-role-id',
            role: {
              id: 'contributor-role-id',
              name: 'contributor',
              description: 'Contributor role',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
        ],
      });
      context.prismaMock.refreshToken.create.mockResolvedValue({
        id: 'refresh-token-id',
        userId: user.id,
        tokenHash: 'hashed-refresh-token',
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      });

      // Verify that the correct code_verifier works
      const response = await request(context.app.getHttpServer())
        .post('/api/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code: authCode.code,
          code_verifier: codeVerifier, // Correct verifier
          redirect_uri: validRedirectUri,
          client_id: validClientId,
        })
        .expect(200);

      expect(response.body.data).toHaveProperty('access_token');
    });
  });

  // ============================================================================
  // Token Endpoint Tests — refresh_token grant
  // ============================================================================

  describe('POST /api/oauth/token — refresh_token grant', () => {
    it('should return 400 when refresh_token is missing', async () => {
      const response = await request(context.app.getHttpServer())
        .post('/api/oauth/token')
        .send({ grant_type: 'refresh_token' })
        .expect(400);

      expect(response.body.message).toContain(
        'refresh_token is required for refresh_token grant',
      );
    });

    it('should return 200 with new tokens on valid refresh', async () => {
      const user = await createMockTestUser(context);

      // Mock refresh token lookup with user relationship
      context.prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: 'refresh-token-id',
        userId: user.id,
        tokenHash: 'hashed-refresh-token',
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        revokedAt: null,
        createdAt: new Date(),
        user: {
          id: user.id,
          email: user.email,
          displayName: null,
          providerDisplayName: 'Test User',
          profileImageUrl: null,
          providerProfileImageUrl: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          userRoles: [
            {
              userId: user.id,
              roleId: 'contributor-role-id',
              role: {
                id: 'contributor-role-id',
                name: 'contributor',
                description: 'Contributor role',
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            },
          ],
        },
      } as any);

      // Mock refresh token update (revoke old)
      context.prismaMock.refreshToken.update.mockResolvedValue({
        id: 'refresh-token-id',
        userId: user.id,
        tokenHash: 'hashed-refresh-token',
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        revokedAt: new Date(),
        createdAt: new Date(),
      });

      // Mock new refresh token creation
      context.prismaMock.refreshToken.create.mockResolvedValue({
        id: 'new-refresh-token-id',
        userId: user.id,
        tokenHash: 'new-hashed-refresh-token',
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        revokedAt: null,
        createdAt: new Date(),
      });

      const response = await request(context.app.getHttpServer())
        .post('/api/oauth/token')
        .send({
          grant_type: 'refresh_token',
          refresh_token: 'valid-refresh-token',
        })
        .expect(200);

      expect(response.body.data).toHaveProperty('access_token');
      expect(response.body.data).toHaveProperty('token_type', 'Bearer');
      expect(response.body.data).toHaveProperty('expires_in');
      expect(response.body.data).toHaveProperty('refresh_token');
    });
  });

  // ============================================================================
  // Token Endpoint Tests — unsupported grant type
  // ============================================================================

  describe('POST /api/oauth/token — unsupported grant type', () => {
    it('should return 400 for unsupported grant_type', async () => {
      const response = await request(context.app.getHttpServer())
        .post('/api/oauth/token')
        .send({ grant_type: 'client_credentials' })
        .expect(400);

      // Zod validation fails before reaching the controller logic
      expect(response.body.message).toContain('Validation failed');
    });
  });

  // ============================================================================
  // Well-Known Endpoint Tests
  // ============================================================================

  describe('GET /api/oauth/.well-known/protected-resource', () => {
    it('should return correct metadata structure', async () => {
      const response = await request(context.app.getHttpServer())
        .get('/api/oauth/.well-known/protected-resource')
        .expect(200);

      // Response is wrapped in { data, meta } structure
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('resource');
      expect(response.body.data).toHaveProperty('authorization_servers');
      expect(response.body.data).toHaveProperty('scopes_supported');
      expect(response.body.data).toHaveProperty('bearer_methods_supported');

      // Verify structure
      expect(Array.isArray(response.body.data.authorization_servers)).toBe(true);
      expect(Array.isArray(response.body.data.scopes_supported)).toBe(true);
      expect(Array.isArray(response.body.data.bearer_methods_supported)).toBe(true);

      // Verify content
      expect(response.body.data.resource).toContain('/api/data-agent/mcp');
      expect(response.body.data.scopes_supported).toContain('data_agent:read');
      expect(response.body.data.bearer_methods_supported).toContain('header');
    });
  });

  describe('GET /api/oauth/.well-known/authorization-server', () => {
    it('should return correct metadata structure', async () => {
      const response = await request(context.app.getHttpServer())
        .get('/api/oauth/.well-known/authorization-server')
        .expect(200);

      // Response is wrapped in { data, meta } structure
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('issuer');
      expect(response.body.data).toHaveProperty('authorization_endpoint');
      expect(response.body.data).toHaveProperty('token_endpoint');
      expect(response.body.data).toHaveProperty('response_types_supported');
      expect(response.body.data).toHaveProperty('grant_types_supported');
      expect(response.body.data).toHaveProperty('code_challenge_methods_supported');
      expect(response.body.data).toHaveProperty('scopes_supported');
      expect(response.body.data).toHaveProperty('token_endpoint_auth_methods_supported');
      expect(response.body.data).toHaveProperty('client_id_metadata_document_supported');

      // Verify structure
      expect(Array.isArray(response.body.data.response_types_supported)).toBe(true);
      expect(Array.isArray(response.body.data.grant_types_supported)).toBe(true);
      expect(Array.isArray(response.body.data.code_challenge_methods_supported)).toBe(
        true,
      );
      expect(Array.isArray(response.body.data.scopes_supported)).toBe(true);
      expect(Array.isArray(response.body.data.token_endpoint_auth_methods_supported)).toBe(
        true,
      );

      // Verify content
      expect(response.body.data.authorization_endpoint).toContain(
        '/api/oauth/authorize',
      );
      expect(response.body.data.token_endpoint).toContain('/api/oauth/token');
      expect(response.body.data.response_types_supported).toContain('code');
      expect(response.body.data.grant_types_supported).toContain('authorization_code');
      expect(response.body.data.grant_types_supported).toContain('refresh_token');
      expect(response.body.data.code_challenge_methods_supported).toContain('S256');
      expect(response.body.data.scopes_supported).toContain('data_agent:read');
      expect(response.body.data.token_endpoint_auth_methods_supported).toContain('none');
      expect(response.body.data.client_id_metadata_document_supported).toBe(true);
    });
  });
});
