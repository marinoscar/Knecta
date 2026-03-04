/**
 * Databricks Driver - Auth Method Unit Tests
 *
 * Tests the auth branching inside DatabricksDriver.testConnection:
 *   - token auth (default and explicit)
 *   - oauth_m2m auth (success and missing-field error paths)
 *   - Full success flow (connect → openSession → executeStatement → close)
 *
 * No real Databricks cluster is required — @databricks/sql is fully mocked.
 */

import { DatabricksDriver } from '../src/connections/drivers/databricks.driver';

// ---------------------------------------------------------------------------
// Mock @databricks/sql at module level
// ---------------------------------------------------------------------------

const mockQueryOperationClose = jest.fn().mockResolvedValue(undefined);
const mockQueryOperation = { close: mockQueryOperationClose };

const mockSessionExecuteStatement = jest.fn().mockResolvedValue(mockQueryOperation);
const mockSessionClose = jest.fn().mockResolvedValue(undefined);
const mockSession = {
  executeStatement: mockSessionExecuteStatement,
  close: mockSessionClose,
};

const mockClientConnect = jest.fn().mockResolvedValue(undefined);
const mockClientOpenSession = jest.fn().mockResolvedValue(mockSession);
const mockClientClose = jest.fn().mockResolvedValue(undefined);

// Factory for a fresh DBSQLClient instance — each `new DBSQLClient()` call
// returns this same mock object (reset between tests via beforeEach).
const mockClientInstance = {
  connect: mockClientConnect,
  openSession: mockClientOpenSession,
  close: mockClientClose,
};

const MockDBSQLClient = jest.fn(() => mockClientInstance);

jest.mock('@databricks/sql', () => ({
  DBSQLClient: MockDBSQLClient,
}));

// ---------------------------------------------------------------------------
// Shared base params
// ---------------------------------------------------------------------------

const baseParams = {
  host: 'adb-1234567890.1.azuredatabricks.net',
  port: 443,
  useSsl: true,
  options: {
    httpPath: '/sql/1.0/warehouses/abc123def456',
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DatabricksDriver - auth methods', () => {
  let driver: DatabricksDriver;

  beforeEach(() => {
    driver = new DatabricksDriver();
    jest.clearAllMocks();

    // Restore resolved-value defaults after clearAllMocks
    mockClientConnect.mockResolvedValue(undefined);
    mockClientOpenSession.mockResolvedValue(mockSession);
    mockClientClose.mockResolvedValue(undefined);
    mockSessionExecuteStatement.mockResolvedValue(mockQueryOperation);
    mockSessionClose.mockResolvedValue(undefined);
    mockQueryOperationClose.mockResolvedValue(undefined);
    MockDBSQLClient.mockImplementation(() => mockClientInstance);
  });

  // =========================================================================
  // Token auth
  // =========================================================================

  describe('token auth (default — no authMethod in options)', () => {
    it('should call client.connect with host, path, and token', async () => {
      const params = {
        ...baseParams,
        password: 'dapi1234abcd',
        // authMethod deliberately omitted
      };

      await driver.testConnection(params);

      expect(mockClientConnect).toHaveBeenCalledTimes(1);
      const connectArg = mockClientConnect.mock.calls[0][0] as Record<string, unknown>;
      expect(connectArg.host).toBe(baseParams.host);
      expect(connectArg.path).toBe(baseParams.options.httpPath);
      expect(connectArg.token).toBe('dapi1234abcd');
      expect(connectArg).not.toHaveProperty('authType');
      expect(connectArg).not.toHaveProperty('oauthClientId');
      expect(connectArg).not.toHaveProperty('oauthClientSecret');
    });
  });

  describe('token auth (explicit authMethod: "token")', () => {
    it('should call client.connect with token, not oauth fields', async () => {
      const params = {
        ...baseParams,
        password: 'dapiExplicitToken',
        options: { ...baseParams.options, authMethod: 'token' },
      };

      await driver.testConnection(params);

      expect(mockClientConnect).toHaveBeenCalledTimes(1);
      const connectArg = mockClientConnect.mock.calls[0][0] as Record<string, unknown>;
      expect(connectArg.token).toBe('dapiExplicitToken');
      expect(connectArg).not.toHaveProperty('authType');
    });
  });

  // =========================================================================
  // OAuth M2M auth
  // =========================================================================

  describe('oauth_m2m auth (success path)', () => {
    it('should call client.connect with authType="databricks-oauth", oauthClientId, and oauthClientSecret', async () => {
      const params = {
        ...baseParams,
        password: 'my-client-secret',
        options: {
          ...baseParams.options,
          authMethod: 'oauth_m2m',
          oauthClientId: 'my-service-principal-id',
        },
      };

      const result = await driver.testConnection(params);

      expect(result.success).toBe(true);
      expect(mockClientConnect).toHaveBeenCalledTimes(1);
      const connectArg = mockClientConnect.mock.calls[0][0] as Record<string, unknown>;
      expect(connectArg.authType).toBe('databricks-oauth');
      expect(connectArg.oauthClientId).toBe('my-service-principal-id');
      expect(connectArg.oauthClientSecret).toBe('my-client-secret');
      expect(connectArg.host).toBe(baseParams.host);
      expect(connectArg.path).toBe(baseParams.options.httpPath);
      expect(connectArg).not.toHaveProperty('token');
    });
  });

  describe('oauth_m2m auth with missing oauthClientId', () => {
    it('should return { success: false } with message about OAuth Client ID', async () => {
      const params = {
        ...baseParams,
        password: 'some-secret',
        options: {
          ...baseParams.options,
          authMethod: 'oauth_m2m',
          // oauthClientId deliberately omitted
        },
      };

      const result = await driver.testConnection(params);

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/OAuth Client ID is required/i);
      expect(typeof result.latencyMs).toBe('number');
      // Should not attempt to connect at all
      expect(mockClientConnect).not.toHaveBeenCalled();
    });
  });

  describe('oauth_m2m auth with missing httpPath', () => {
    it('should return { success: false } with message about HTTP Path', async () => {
      const params = {
        ...baseParams,
        password: 'some-secret',
        options: {
          // httpPath deliberately omitted
          authMethod: 'oauth_m2m',
          oauthClientId: 'my-service-principal-id',
        },
      };

      const result = await driver.testConnection(params);

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/HTTP Path is required/i);
      expect(typeof result.latencyMs).toBe('number');
      expect(mockClientConnect).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Full success flow (both auth methods)
  // =========================================================================

  describe('testConnection success flow — token auth', () => {
    it('should connect, open session, execute SELECT 1, close session and client, return success', async () => {
      const params = {
        ...baseParams,
        password: 'dapi-token',
      };

      const result = await driver.testConnection(params);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Connection successful');
      expect(typeof result.latencyMs).toBe('number');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);

      // Verify full lifecycle
      expect(mockClientConnect).toHaveBeenCalledTimes(1);
      expect(mockClientOpenSession).toHaveBeenCalledTimes(1);
      expect(mockSessionExecuteStatement).toHaveBeenCalledWith('SELECT 1');
      expect(mockQueryOperationClose).toHaveBeenCalledTimes(1);
      expect(mockSessionClose).toHaveBeenCalledTimes(1);
      expect(mockClientClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('testConnection success flow — oauth_m2m auth', () => {
    it('should connect with oauth, open session, execute SELECT 1, close everything, return success', async () => {
      const params = {
        ...baseParams,
        password: 'client-secret',
        options: {
          ...baseParams.options,
          authMethod: 'oauth_m2m',
          oauthClientId: 'sp-123',
        },
      };

      const result = await driver.testConnection(params);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Connection successful');

      expect(mockClientConnect).toHaveBeenCalledTimes(1);
      expect(mockClientOpenSession).toHaveBeenCalledTimes(1);
      expect(mockSessionExecuteStatement).toHaveBeenCalledWith('SELECT 1');
      expect(mockQueryOperationClose).toHaveBeenCalledTimes(1);
      expect(mockSessionClose).toHaveBeenCalledTimes(1);
      expect(mockClientClose).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Error propagation
  // =========================================================================

  describe('error handling', () => {
    it('should return { success: false } when client.connect throws', async () => {
      mockClientConnect.mockRejectedValueOnce(new Error('Network unreachable'));

      const params = {
        ...baseParams,
        password: 'dapi-token',
      };

      const result = await driver.testConnection(params);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Network unreachable');
      expect(typeof result.latencyMs).toBe('number');
    });

    it('should return { success: false } when openSession throws', async () => {
      mockClientOpenSession.mockRejectedValueOnce(new Error('Session limit exceeded'));

      const params = {
        ...baseParams,
        password: 'dapi-token',
      };

      const result = await driver.testConnection(params);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Session limit exceeded');
    });

    it('should return { success: false } when executeStatement throws', async () => {
      mockSessionExecuteStatement.mockRejectedValueOnce(new Error('SQL parse error'));

      const params = {
        ...baseParams,
        password: 'dapi-token',
      };

      const result = await driver.testConnection(params);

      expect(result.success).toBe(false);
      expect(result.message).toBe('SQL parse error');
    });
  });
});
