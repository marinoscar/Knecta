import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import { LlmProviderService } from './llm-provider.service';
import { PrismaService } from '../prisma/prisma.service';

// ---------------------------------------------------------------------------
// Mock the encryption utilities so tests don't need a real ENCRYPTION_KEY and
// don't touch real crypto (fast, deterministic).
// ---------------------------------------------------------------------------
jest.mock('../common/utils/encryption.util', () => ({
  encrypt: jest.fn((_plaintext: string, _key: Buffer) => 'encrypted-config'),
  decrypt: jest.fn(
    (encrypted: string, _key: Buffer) =>
      // Return whatever was "stored" — in the mock we just store a JSON string
      encrypted === 'encrypted-config'
        ? JSON.stringify({ apiKey: 'sk-test', model: 'gpt-4o' })
        : JSON.stringify(JSON.parse(encrypted)),
  ),
  getEncryptionKey: jest.fn(() => randomBytes(32)),
}));

import { encrypt, decrypt } from '../common/utils/encryption.util';

// ---------------------------------------------------------------------------
// Helper: build a minimal prisma llmProvider record
// ---------------------------------------------------------------------------
function makeRecord(overrides: Partial<any> = {}): any {
  return {
    id: randomUUID(),
    type: 'openai',
    name: 'OpenAI',
    enabled: true,
    isDefault: false,
    encryptedConfig: 'encrypted-config',
    createdByUserId: randomUUID(),
    updatedByUserId: randomUUID(),
    lastTestedAt: null,
    lastTestResult: null,
    lastTestMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('LlmProviderService', () => {
  let service: LlmProviderService;
  let prisma: jest.Mocked<any>;

  // We capture the tx callback and re-run it with the prisma mock as the tx arg
  const transactionImpl = async (arg: any) => {
    if (typeof arg === 'function') {
      return arg(prisma);
    }
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    return arg;
  };

  beforeEach(async () => {
    prisma = {
      llmProvider: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn(transactionImpl),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmProviderService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<LlmProviderService>(LlmProviderService);

    jest.clearAllMocks();
    // Re-apply default mock behaviour for encrypt/decrypt after clearAllMocks
    (encrypt as jest.Mock).mockReturnValue('encrypted-config');
    (decrypt as jest.Mock).mockImplementation((enc: string) => {
      if (enc === 'encrypted-config') {
        return JSON.stringify({ apiKey: 'sk-test', model: 'gpt-4o' });
      }
      return enc;
    });
  });

  // =========================================================================
  // list()
  // =========================================================================

  describe('list()', () => {
    it('returns all providers with masked sensitive fields', async () => {
      const record = makeRecord({ type: 'openai', name: 'OpenAI' });
      prisma.llmProvider.findMany.mockResolvedValue([record]);

      const results = await service.list();

      expect(results).toHaveLength(1);
      expect(results[0].config).toHaveProperty('apiKey', '********');
      expect(results[0].config).toHaveProperty('model', 'gpt-4o');
      expect(results[0]).toHaveProperty('id', record.id);
      expect(results[0]).toHaveProperty('type', 'openai');
      expect(results[0]).toHaveProperty('name', 'OpenAI');
      expect(prisma.llmProvider.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'asc' },
      });
    });

    it('returns an empty array when no providers exist', async () => {
      prisma.llmProvider.findMany.mockResolvedValue([]);

      const results = await service.list();

      expect(results).toEqual([]);
    });

    it('masks the PAT field for snowflake_cortex providers', async () => {
      (decrypt as jest.Mock).mockReturnValue(
        JSON.stringify({ account: 'xy12345', pat: 'my-secret-pat' }),
      );
      const record = makeRecord({ type: 'snowflake_cortex' });
      prisma.llmProvider.findMany.mockResolvedValue([record]);

      const results = await service.list();

      expect(results[0].config).toHaveProperty('pat', '********');
      expect(results[0].config).toHaveProperty('account', 'xy12345');
    });
  });

  // =========================================================================
  // getById()
  // =========================================================================

  describe('getById()', () => {
    it('returns a provider with masked config when found', async () => {
      const record = makeRecord({ type: 'openai' });
      prisma.llmProvider.findUnique.mockResolvedValue(record);

      const result = await service.getById(record.id);

      expect(result.id).toBe(record.id);
      expect(result.config).toHaveProperty('apiKey', '********');
      expect(result.config).toHaveProperty('model', 'gpt-4o');
      expect(prisma.llmProvider.findUnique).toHaveBeenCalledWith({
        where: { id: record.id },
      });
    });

    it('throws NotFoundException when provider not found', async () => {
      prisma.llmProvider.findUnique.mockResolvedValue(null);

      await expect(service.getById('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // create()
  // =========================================================================

  describe('create()', () => {
    const userId = randomUUID();

    it('creates a provider and encrypts the config', async () => {
      const record = makeRecord({ type: 'openai', name: 'My OpenAI', isDefault: false });
      prisma.llmProvider.findFirst.mockResolvedValue(null); // no duplicate
      prisma.llmProvider.create.mockResolvedValue(record);

      const result = await service.create(
        {
          type: 'openai',
          name: 'My OpenAI',
          enabled: true,
          isDefault: false,
          config: { apiKey: 'sk-test', model: 'gpt-4o' },
        },
        userId,
      );

      expect(encrypt).toHaveBeenCalledWith(
        JSON.stringify({ apiKey: 'sk-test', model: 'gpt-4o' }),
        expect.any(Buffer),
      );
      expect(prisma.llmProvider.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'openai',
            name: 'My OpenAI',
            isDefault: false,
            encryptedConfig: 'encrypted-config',
            createdByUserId: userId,
            updatedByUserId: userId,
          }),
        }),
      );
      expect(result.config).toHaveProperty('apiKey', '********');
    });

    it('throws ConflictException when a provider of the same type already exists', async () => {
      prisma.llmProvider.findFirst.mockResolvedValue(makeRecord());

      await expect(
        service.create(
          {
            type: 'openai',
            name: 'Duplicate',
            enabled: true,
            isDefault: false,
            config: { apiKey: 'sk-x' },
          },
          userId,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException for invalid config (missing required field)', async () => {
      prisma.llmProvider.findFirst.mockResolvedValue(null);

      await expect(
        service.create(
          {
            type: 'openai',
            name: 'Bad Config',
            enabled: true,
            isDefault: false,
            config: { model: 'gpt-4o' }, // missing apiKey
          },
          userId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for unknown provider type', async () => {
      await expect(
        service.create(
          {
            type: 'unknown_type' as any,
            name: 'Unknown',
            enabled: true,
            isDefault: false,
            config: {},
          },
          userId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('clears other defaults and uses a transaction when isDefault is true', async () => {
      const record = makeRecord({ type: 'openai', isDefault: true });
      prisma.llmProvider.findFirst.mockResolvedValue(null);
      prisma.llmProvider.updateMany.mockResolvedValue({ count: 1 });
      prisma.llmProvider.create.mockResolvedValue(record);

      await service.create(
        {
          type: 'openai',
          name: 'Default Provider',
          enabled: true,
          isDefault: true,
          config: { apiKey: 'sk-default' },
        },
        userId,
      );

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.llmProvider.updateMany).toHaveBeenCalledWith({
        where: { isDefault: true },
        data: { isDefault: false },
      });
      expect(prisma.llmProvider.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isDefault: true }),
        }),
      );
    });

    it('does not use a transaction when isDefault is false', async () => {
      const record = makeRecord({ type: 'anthropic', isDefault: false });
      prisma.llmProvider.findFirst.mockResolvedValue(null);
      prisma.llmProvider.create.mockResolvedValue(record);

      await service.create(
        {
          type: 'anthropic',
          name: 'Anthropic',
          enabled: true,
          isDefault: false,
          config: { apiKey: 'sk-ant' },
        },
        userId,
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.llmProvider.create).toHaveBeenCalled();
    });

    it('validates azure_openai config schema correctly', async () => {
      prisma.llmProvider.findFirst.mockResolvedValue(null);

      // Missing required 'deployment' field
      await expect(
        service.create(
          {
            type: 'azure_openai',
            name: 'Azure',
            enabled: true,
            isDefault: false,
            config: { apiKey: 'key', endpoint: 'https://example.openai.azure.com' },
          },
          userId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // update()
  // =========================================================================

  describe('update()', () => {
    const userId = randomUUID();

    it('updates the provider without re-encrypting when config is not provided', async () => {
      const existing = makeRecord({ type: 'openai', name: 'Old Name' });
      const updated = { ...existing, name: 'New Name' };
      prisma.llmProvider.findUnique.mockResolvedValue(existing);
      prisma.llmProvider.update.mockResolvedValue(updated);

      const result = await service.update(
        existing.id,
        { name: 'New Name' },
        userId,
      );

      expect(result.name).toBe('New Name');
      expect(encrypt).not.toHaveBeenCalled();
      expect(prisma.llmProvider.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: existing.id },
          data: expect.objectContaining({ name: 'New Name', updatedByUserId: userId }),
        }),
      );
    });

    it('re-encrypts when config is provided', async () => {
      const existing = makeRecord({ type: 'openai' });
      const updated = { ...existing, encryptedConfig: 'encrypted-config' };
      prisma.llmProvider.findUnique.mockResolvedValue(existing);
      prisma.llmProvider.update.mockResolvedValue(updated);

      await service.update(
        existing.id,
        { config: { apiKey: 'sk-new', model: 'gpt-4o-mini' } },
        userId,
      );

      expect(encrypt).toHaveBeenCalledWith(
        JSON.stringify({ apiKey: 'sk-new', model: 'gpt-4o-mini' }),
        expect.any(Buffer),
      );
    });

    it('throws BadRequestException when new config is invalid', async () => {
      const existing = makeRecord({ type: 'openai' });
      prisma.llmProvider.findUnique.mockResolvedValue(existing);

      await expect(
        service.update(
          existing.id,
          { config: { model: 'gpt-4o' } }, // missing apiKey
          userId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when provider does not exist', async () => {
      prisma.llmProvider.findUnique.mockResolvedValue(null);

      await expect(
        service.update('non-existent', { name: 'X' }, userId),
      ).rejects.toThrow(NotFoundException);
    });

    it('clears other defaults in a transaction when isDefault is set to true', async () => {
      const existing = makeRecord({ type: 'openai', isDefault: false });
      const updated = { ...existing, isDefault: true };
      prisma.llmProvider.findUnique.mockResolvedValue(existing);
      prisma.llmProvider.updateMany.mockResolvedValue({ count: 1 });
      prisma.llmProvider.update.mockResolvedValue(updated);

      await service.update(existing.id, { isDefault: true }, userId);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.llmProvider.updateMany).toHaveBeenCalledWith({
        where: { isDefault: true, id: { not: existing.id } },
        data: { isDefault: false },
      });
    });

    it('does not use a transaction when isDefault is false', async () => {
      const existing = makeRecord({ type: 'openai' });
      prisma.llmProvider.findUnique.mockResolvedValue(existing);
      prisma.llmProvider.update.mockResolvedValue(existing);

      await service.update(existing.id, { isDefault: false }, userId);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // delete()
  // =========================================================================

  describe('delete()', () => {
    const userId = randomUUID();

    it('deletes the provider successfully', async () => {
      const record = makeRecord();
      prisma.llmProvider.findUnique.mockResolvedValue(record);
      prisma.llmProvider.delete.mockResolvedValue(record);

      await service.delete(record.id, userId);

      expect(prisma.llmProvider.delete).toHaveBeenCalledWith({
        where: { id: record.id },
      });
    });

    it('throws NotFoundException when provider does not exist', async () => {
      prisma.llmProvider.findUnique.mockResolvedValue(null);

      await expect(service.delete('missing', userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('invalidates the cache after deletion', async () => {
      const record = makeRecord({ type: 'openai', enabled: true });
      // Warm the cache
      prisma.llmProvider.findFirst.mockResolvedValue(record);
      await service.getDecryptedConfig('openai'); // populates configCache

      // Now delete
      prisma.llmProvider.findUnique.mockResolvedValue(record);
      prisma.llmProvider.delete.mockResolvedValue(record);
      await service.delete(record.id, userId);

      // After deletion the cache should be gone — next call must query DB again
      prisma.llmProvider.findFirst.mockResolvedValue(null);
      const config = await service.getDecryptedConfig('openai');
      expect(config).toBeNull();
      // DB was queried again (not served from cache)
      expect(prisma.llmProvider.findFirst).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // getDecryptedConfig()
  // =========================================================================

  describe('getDecryptedConfig()', () => {
    it('returns decrypted config for an enabled provider', async () => {
      const record = makeRecord({ type: 'openai', enabled: true });
      prisma.llmProvider.findFirst.mockResolvedValue(record);

      const config = await service.getDecryptedConfig('openai');

      expect(config).toHaveProperty('apiKey', 'sk-test');
      expect(config).toHaveProperty('model', 'gpt-4o');
    });

    it('returns null when no enabled provider of that type exists', async () => {
      prisma.llmProvider.findFirst.mockResolvedValue(null);

      const config = await service.getDecryptedConfig('openai');

      expect(config).toBeNull();
    });

    it('resolves type aliases (azure → azure_openai)', async () => {
      (decrypt as jest.Mock).mockReturnValue(
        JSON.stringify({ apiKey: 'az-key', endpoint: 'https://x.azure.com', deployment: 'gpt-4o' }),
      );
      const record = makeRecord({ type: 'azure_openai', enabled: true });
      prisma.llmProvider.findFirst.mockResolvedValue(record);

      const config = await service.getDecryptedConfig('azure');

      expect(prisma.llmProvider.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { type: 'azure_openai', enabled: true } }),
      );
      expect(config).toHaveProperty('apiKey', 'az-key');
    });

    it('returns cached config without hitting the database again within TTL', async () => {
      const record = makeRecord({ type: 'openai', enabled: true });
      prisma.llmProvider.findFirst.mockResolvedValue(record);

      await service.getDecryptedConfig('openai'); // fills cache
      await service.getDecryptedConfig('openai'); // should use cache

      expect(prisma.llmProvider.findFirst).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // getEnabledProviders()
  // =========================================================================

  describe('getEnabledProviders()', () => {
    it('returns enabled providers with model from config', async () => {
      const record = makeRecord({ type: 'openai', name: 'OpenAI', enabled: true, isDefault: true });
      prisma.llmProvider.findMany.mockResolvedValue([record]);

      const providers = await service.getEnabledProviders();

      expect(providers).toHaveLength(1);
      expect(providers[0]).toMatchObject({
        id: record.id,
        type: 'openai',
        name: 'OpenAI',
        enabled: true,
        isDefault: true,
        model: 'gpt-4o',
      });
    });

    it('falls back to DEFAULT_MODELS when config has no model', async () => {
      (decrypt as jest.Mock).mockReturnValue(JSON.stringify({ apiKey: 'sk-test' }));
      const record = makeRecord({ type: 'anthropic', enabled: true });
      prisma.llmProvider.findMany.mockResolvedValue([record]);

      const providers = await service.getEnabledProviders();

      expect(providers[0].model).toBe('claude-sonnet-4-5-20250929');
    });

    it('serves subsequent calls from the provider list cache', async () => {
      prisma.llmProvider.findMany.mockResolvedValue([makeRecord({ enabled: true })]);

      await service.getEnabledProviders();
      await service.getEnabledProviders();

      expect(prisma.llmProvider.findMany).toHaveBeenCalledTimes(1);
    });

    it('returns empty array when no enabled providers', async () => {
      prisma.llmProvider.findMany.mockResolvedValue([]);

      const providers = await service.getEnabledProviders();

      expect(providers).toEqual([]);
    });
  });

  // =========================================================================
  // getDefaultProviderType()
  // =========================================================================

  describe('getDefaultProviderType()', () => {
    it('returns the type of the default enabled provider', async () => {
      prisma.llmProvider.findFirst.mockResolvedValue({ type: 'anthropic' });

      const type = await service.getDefaultProviderType();

      expect(type).toBe('anthropic');
      expect(prisma.llmProvider.findFirst).toHaveBeenCalledWith({
        where: { isDefault: true, enabled: true },
        select: { type: true },
      });
    });

    it('returns null when no default provider is configured', async () => {
      prisma.llmProvider.findFirst.mockResolvedValue(null);

      const type = await service.getDefaultProviderType();

      expect(type).toBeNull();
    });
  });

  // =========================================================================
  // maskConfig() — tested via list() / getById()
  // =========================================================================

  describe('maskConfig()', () => {
    it('replaces apiKey with ******** for openai', async () => {
      const record = makeRecord({ type: 'openai' });
      prisma.llmProvider.findUnique.mockResolvedValue(record);

      const result = await service.getById(record.id);

      expect(result.config.apiKey).toBe('********');
    });

    it('replaces apiKey with ******** for anthropic', async () => {
      (decrypt as jest.Mock).mockReturnValue(
        JSON.stringify({ apiKey: 'claude-key', model: 'claude-sonnet-4-5-20250929' }),
      );
      const record = makeRecord({ type: 'anthropic' });
      prisma.llmProvider.findUnique.mockResolvedValue(record);

      const result = await service.getById(record.id);

      expect(result.config.apiKey).toBe('********');
    });

    it('replaces pat with ******** for snowflake_cortex', async () => {
      (decrypt as jest.Mock).mockReturnValue(
        JSON.stringify({ account: 'xy12345', pat: 'my-secret-pat' }),
      );
      const record = makeRecord({ type: 'snowflake_cortex' });
      prisma.llmProvider.findUnique.mockResolvedValue(record);

      const result = await service.getById(record.id);

      expect(result.config.pat).toBe('********');
      expect(result.config.account).toBe('xy12345');
    });

    it('does not mask non-sensitive fields', async () => {
      const record = makeRecord({ type: 'openai' });
      prisma.llmProvider.findUnique.mockResolvedValue(record);

      const result = await service.getById(record.id);

      expect(result.config.model).toBe('gpt-4o');
    });
  });

  // =========================================================================
  // Cache invalidation
  // =========================================================================

  describe('cache invalidation', () => {
    it('create() invalidates the provider list cache', async () => {
      const record1 = makeRecord({ type: 'anthropic', enabled: true, name: 'Before' });
      const record2 = makeRecord({ type: 'anthropic', enabled: true, name: 'After' });

      // First call populates the provider list cache
      prisma.llmProvider.findMany.mockResolvedValue([record1]);
      await service.getEnabledProviders();
      expect(prisma.llmProvider.findMany).toHaveBeenCalledTimes(1);

      // Create a new provider — cache should be invalidated
      prisma.llmProvider.findFirst.mockResolvedValue(null);
      prisma.llmProvider.create.mockResolvedValue(record2);
      await service.create(
        {
          type: 'openai', // different type so no conflict
          name: 'New',
          enabled: true,
          isDefault: false,
          config: { apiKey: 'sk-new' },
        },
        randomUUID(),
      );

      // Second call to getEnabledProviders should hit DB again
      prisma.llmProvider.findMany.mockResolvedValue([record1, record2]);
      await service.getEnabledProviders();
      expect(prisma.llmProvider.findMany).toHaveBeenCalledTimes(2);
    });

    it('update() invalidates the config cache', async () => {
      const record = makeRecord({ type: 'openai', enabled: true });
      prisma.llmProvider.findFirst.mockResolvedValue(record);

      await service.getDecryptedConfig('openai'); // warms cache
      expect(prisma.llmProvider.findFirst).toHaveBeenCalledTimes(1);

      // Update the provider
      prisma.llmProvider.findUnique.mockResolvedValue(record);
      prisma.llmProvider.update.mockResolvedValue({ ...record, name: 'Updated' });
      await service.update(record.id, { name: 'Updated' }, randomUUID());

      // Next getDecryptedConfig must query DB again
      prisma.llmProvider.findFirst.mockResolvedValue(record);
      await service.getDecryptedConfig('openai');
      expect(prisma.llmProvider.findFirst).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // testProvider()
  // =========================================================================

  describe('testProvider()', () => {
    it('returns decrypted config and updates test metadata', async () => {
      const record = makeRecord({ type: 'openai', enabled: true });
      prisma.llmProvider.findUnique.mockResolvedValue(record);
      prisma.llmProvider.update.mockResolvedValue(record);

      const result = await service.testProvider(record.id, {
        success: true,
        message: 'Connection successful',
      });

      expect(result.type).toBe('openai');
      expect(result.config).toHaveProperty('apiKey', 'sk-test');
      expect(prisma.llmProvider.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: record.id },
          data: expect.objectContaining({
            lastTestedAt: expect.any(Date),
            lastTestResult: true,
            lastTestMessage: 'Connection successful',
          }),
        }),
      );
    });

    it('throws NotFoundException when provider does not exist', async () => {
      prisma.llmProvider.findUnique.mockResolvedValue(null);

      await expect(
        service.testProvider('missing', { success: false, message: 'fail' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
