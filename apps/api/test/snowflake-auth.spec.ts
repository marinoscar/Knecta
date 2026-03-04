/**
 * Snowflake Driver - Auth Method Unit Tests
 *
 * Tests the resolveAuth logic inside SnowflakeDriver:
 *   - password auth (default and explicit)
 *   - key_pair auth (JSON-encoded credential, raw PEM, without passphrase, missing key)
 *
 * Also verifies that testConnection uses buildConnectionConfig end-to-end for
 * key_pair auth.
 *
 * No real Snowflake connection is required — snowflake-sdk is fully mocked.
 */

import { SnowflakeDriver } from '../src/connections/drivers/snowflake.driver';

// ---------------------------------------------------------------------------
// Shared mock infrastructure (same pattern as snowflake-discovery.integration.spec.ts)
// ---------------------------------------------------------------------------

const mockDestroy = jest.fn((cb) => cb(null));
const mockExecute = jest.fn((opts) => {
  const { complete } = opts;
  // For testConnection: SELECT 1
  const stmt = { getColumns: () => [{ getName: () => '1' }] };
  complete(null, stmt, [{ '1': 1 }]);
});

const mockConnect = jest.fn((cb) => {
  cb(null, mockConnectionObj);
});

const mockConnectionObj = {
  connect: mockConnect,
  execute: mockExecute,
  destroy: mockDestroy,
};

const mockCreateConnection = jest.fn(() => mockConnectionObj);

// Intercepts both static and dynamic imports of snowflake-sdk
jest.mock('snowflake-sdk', () => ({
  createConnection: mockCreateConnection,
}));

// ---------------------------------------------------------------------------
// Shared base params
// ---------------------------------------------------------------------------

const baseParams = {
  host: 'test.snowflakecomputing.com',
  port: 443,
  username: 'svc_user',
  useSsl: true,
  options: {
    account: 'myorg-myaccount',
    warehouse: 'COMPUTE_WH',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Capture the config object passed to snowflake.createConnection() by the
 * testConnection method.  We call testConnection so the full code path
 * (buildConnectionConfig → resolveAuth) executes with the real driver.
 */
async function captureCreateConnectionConfig(
  driver: SnowflakeDriver,
  params: Parameters<SnowflakeDriver['testConnection']>[0],
): Promise<Record<string, unknown>> {
  await driver.testConnection(params);
  // testConnection calls createConnection with { ...config, timeout: 10000 }
  expect(mockCreateConnection).toHaveBeenCalled();
  return mockCreateConnection.mock.calls[mockCreateConnection.mock.calls.length - 1][0] as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SnowflakeDriver - auth methods', () => {
  let driver: SnowflakeDriver;

  beforeEach(() => {
    driver = new SnowflakeDriver();
    jest.clearAllMocks();

    mockConnect.mockImplementation((cb) => {
      cb(null, mockConnectionObj);
    });
    mockExecute.mockImplementation((opts) => {
      const stmt = { getColumns: () => [{ getName: () => '1' }] };
      opts.complete(null, stmt, [{ '1': 1 }]);
    });
    mockDestroy.mockImplementation((cb) => cb(null));
    mockCreateConnection.mockReturnValue(mockConnectionObj);
  });

  // =========================================================================
  // Password auth
  // =========================================================================

  describe('password auth (default — no authMethod in options)', () => {
    it('should call createConnection with username and password, no authenticator', async () => {
      const params = {
        ...baseParams,
        password: 'super-secret',
        options: { ...baseParams.options },
        // authMethod deliberately omitted
      };

      const config = await captureCreateConnectionConfig(driver, params);

      expect(config.username).toBe('svc_user');
      expect(config.password).toBe('super-secret');
      expect(config).not.toHaveProperty('authenticator');
      expect(config).not.toHaveProperty('privateKey');
      expect(config).not.toHaveProperty('privateKeyPass');
    });
  });

  describe('password auth (explicit authMethod: "password")', () => {
    it('should call createConnection with username and password, no authenticator', async () => {
      const params = {
        ...baseParams,
        password: 'another-secret',
        options: { ...baseParams.options, authMethod: 'password' },
      };

      const config = await captureCreateConnectionConfig(driver, params);

      expect(config.username).toBe('svc_user');
      expect(config.password).toBe('another-secret');
      expect(config).not.toHaveProperty('authenticator');
      expect(config).not.toHaveProperty('privateKey');
      expect(config).not.toHaveProperty('privateKeyPass');
    });
  });

  // =========================================================================
  // Key pair auth
  // =========================================================================

  describe('key_pair auth with JSON-encoded credential (key + passphrase)', () => {
    it('should call createConnection with authenticator=SNOWFLAKE_JWT, privateKey, and privateKeyPass', async () => {
      const privateKey = '-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----';
      const passphrase = 'test-passphrase';
      const params = {
        ...baseParams,
        password: JSON.stringify({ privateKey, passphrase }),
        options: { ...baseParams.options, authMethod: 'key_pair' },
      };

      const config = await captureCreateConnectionConfig(driver, params);

      expect(config.authenticator).toBe('SNOWFLAKE_JWT');
      expect(config.privateKey).toBe(privateKey);
      expect(config.privateKeyPass).toBe(passphrase);
      expect(config.username).toBe('svc_user');
      expect(config).not.toHaveProperty('password');
    });
  });

  describe('key_pair auth without passphrase in JSON', () => {
    it('should call createConnection without privateKeyPass when passphrase is absent', async () => {
      const privateKey = '-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----';
      const params = {
        ...baseParams,
        // JSON with no passphrase field
        password: JSON.stringify({ privateKey }),
        options: { ...baseParams.options, authMethod: 'key_pair' },
      };

      const config = await captureCreateConnectionConfig(driver, params);

      expect(config.authenticator).toBe('SNOWFLAKE_JWT');
      expect(config.privateKey).toBe(privateKey);
      expect(config).not.toHaveProperty('privateKeyPass');
      expect(config).not.toHaveProperty('password');
    });
  });

  describe('key_pair auth with raw PEM string (not JSON)', () => {
    it('should fall back to treating the raw password as the PEM private key', async () => {
      const rawPem = '-----BEGIN PRIVATE KEY-----\nMIIEvgIBAADANBg...\n-----END PRIVATE KEY-----';
      const params = {
        ...baseParams,
        password: rawPem,
        options: { ...baseParams.options, authMethod: 'key_pair' },
      };

      const config = await captureCreateConnectionConfig(driver, params);

      expect(config.authenticator).toBe('SNOWFLAKE_JWT');
      expect(config.privateKey).toBe(rawPem);
      expect(config).not.toHaveProperty('privateKeyPass');
      expect(config).not.toHaveProperty('password');
    });
  });

  describe('key_pair auth with missing private key (password undefined)', () => {
    it('should return an error result without throwing when password is undefined', async () => {
      const params = {
        ...baseParams,
        password: undefined,
        options: { ...baseParams.options, authMethod: 'key_pair' },
      };

      // testConnection catches the error from buildConnectionConfig / resolveAuth
      // and returns { success: false } rather than throwing
      const result = await driver.testConnection(params);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Private key is required for key pair authentication');
      expect(typeof result.latencyMs).toBe('number');
    });
  });

  // =========================================================================
  // testConnection end-to-end with key pair options
  // =========================================================================

  describe('testConnection with key_pair auth (end-to-end)', () => {
    it('should succeed when the mocked connection accepts SNOWFLAKE_JWT auth', async () => {
      const privateKey = '-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----';
      const params = {
        ...baseParams,
        password: JSON.stringify({ privateKey, passphrase: 'my-pass' }),
        options: { ...baseParams.options, authMethod: 'key_pair' },
      };

      const result = await driver.testConnection(params);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Connection successful');
      expect(typeof result.latencyMs).toBe('number');

      // Verify the config that was actually passed to createConnection
      const config = mockCreateConnection.mock.calls[0][0] as Record<string, unknown>;
      expect(config.authenticator).toBe('SNOWFLAKE_JWT');
      expect(config.privateKey).toBe(privateKey);
      expect(config.privateKeyPass).toBe('my-pass');
    });

    it('should return failure when connection callback returns an error (key_pair)', async () => {
      mockConnect.mockImplementationOnce((cb) => {
        cb(new Error('JWT token verification failed'), null);
      });

      const privateKey = '-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----';
      const params = {
        ...baseParams,
        password: JSON.stringify({ privateKey }),
        options: { ...baseParams.options, authMethod: 'key_pair' },
      };

      const result = await driver.testConnection(params);

      expect(result.success).toBe(false);
      expect(result.message).toBe('JWT token verification failed');
    });
  });
});
