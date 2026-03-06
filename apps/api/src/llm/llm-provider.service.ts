import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { encrypt, decrypt, getEncryptionKey } from '../common/utils/encryption.util';
import { CreateLlmProviderDto, CONFIG_SCHEMAS } from './dto/create-llm-provider.dto';
import { UpdateLlmProviderDto } from './dto/update-llm-provider.dto';
import { SENSITIVE_FIELDS, DEFAULT_MODELS, ProviderType, TYPE_ALIASES } from './types/provider-config.types';

@Injectable()
export class LlmProviderService {
  private readonly logger = new Logger(LlmProviderService.name);
  private encryptionKey: Buffer;

  // Simple TTL cache for decrypted provider configs
  private configCache: Map<string, { config: any; expiry: number }> = new Map();
  private readonly CACHE_TTL_MS = 60_000; // 60 seconds
  private providerListCache: { data: any[]; expiry: number } | null = null;

  constructor(private readonly prisma: PrismaService) {
    this.encryptionKey = getEncryptionKey();
  }

  /**
   * List all LLM providers with masked sensitive fields.
   */
  async list() {
    const records = await this.prisma.llmProvider.findMany({
      orderBy: { createdAt: 'asc' },
    });

    return records.map((record) => {
      const config = this.decryptConfig(record.encryptedConfig);
      return this.mapProvider(record, this.maskConfig(record.type as ProviderType, config));
    });
  }

  /**
   * Get a single provider by ID with masked config.
   */
  async getById(id: string) {
    const record = await this.prisma.llmProvider.findUnique({ where: { id } });

    if (!record) {
      throw new NotFoundException(`LLM provider with ID ${id} not found`);
    }

    const config = this.decryptConfig(record.encryptedConfig);
    return this.mapProvider(record, this.maskConfig(record.type as ProviderType, config));
  }

  /**
   * Create a new LLM provider record.
   */
  async create(dto: CreateLlmProviderDto, userId: string) {
    // Validate config against the type-specific schema
    const schema = CONFIG_SCHEMAS[dto.type];
    if (!schema) {
      throw new BadRequestException(`Unknown provider type: ${dto.type}`);
    }

    const validation = schema.safeParse(dto.config);
    if (!validation.success) {
      throw new BadRequestException({
        message: 'Invalid provider configuration',
        details: validation.error.flatten().fieldErrors,
      });
    }

    // Enforce one record per type
    const existing = await this.prisma.llmProvider.findFirst({
      where: { type: dto.type },
    });
    if (existing) {
      throw new ConflictException(
        `A provider of type "${dto.type}" already exists. Update the existing provider instead.`,
      );
    }

    const encryptedConfig = encrypt(JSON.stringify(dto.config), this.encryptionKey);

    let record: any;

    if (dto.isDefault) {
      // Clear other defaults and create in a single transaction
      record = await this.prisma.$transaction(async (tx) => {
        await tx.llmProvider.updateMany({
          where: { isDefault: true },
          data: { isDefault: false },
        });

        return tx.llmProvider.create({
          data: {
            type: dto.type,
            name: dto.name,
            enabled: dto.enabled,
            isDefault: true,
            encryptedConfig,
            createdByUserId: userId,
            updatedByUserId: userId,
          },
        });
      });
    } else {
      record = await this.prisma.llmProvider.create({
        data: {
          type: dto.type,
          name: dto.name,
          enabled: dto.enabled,
          isDefault: false,
          encryptedConfig,
          createdByUserId: userId,
          updatedByUserId: userId,
        },
      });
    }

    this.invalidateCache();
    this.logger.log(
      `LLM provider "${record.name}" (type: ${record.type}) created by user ${userId}`,
    );

    const config = this.decryptConfig(record.encryptedConfig);
    return this.mapProvider(record, this.maskConfig(record.type as ProviderType, config));
  }

  /**
   * Update an existing LLM provider.
   */
  async update(id: string, dto: UpdateLlmProviderDto, userId: string) {
    const existing = await this.prisma.llmProvider.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException(`LLM provider with ID ${id} not found`);
    }

    // If new config provided, validate it against the existing provider's type
    let encryptedConfig: string | undefined;
    if (dto.config !== undefined) {
      const schema = CONFIG_SCHEMAS[existing.type];
      if (!schema) {
        throw new BadRequestException(`Unknown provider type: ${existing.type}`);
      }

      const validation = schema.safeParse(dto.config);
      if (!validation.success) {
        throw new BadRequestException({
          message: 'Invalid provider configuration',
          details: validation.error.flatten().fieldErrors,
        });
      }

      encryptedConfig = encrypt(JSON.stringify(dto.config), this.encryptionKey);
    }

    const updateData: any = {
      updatedByUserId: userId,
    };

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.enabled !== undefined) updateData.enabled = dto.enabled;
    if (encryptedConfig !== undefined) updateData.encryptedConfig = encryptedConfig;

    let record: any;

    if (dto.isDefault === true) {
      record = await this.prisma.$transaction(async (tx) => {
        await tx.llmProvider.updateMany({
          where: { isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });

        return tx.llmProvider.update({
          where: { id },
          data: { ...updateData, isDefault: true },
        });
      });
    } else {
      if (dto.isDefault === false) {
        updateData.isDefault = false;
      }
      record = await this.prisma.llmProvider.update({
        where: { id },
        data: updateData,
      });
    }

    this.invalidateCache();
    this.logger.log(
      `LLM provider "${record.name}" (id: ${record.id}) updated by user ${userId}`,
    );

    const config = this.decryptConfig(record.encryptedConfig);
    return this.mapProvider(record, this.maskConfig(record.type as ProviderType, config));
  }

  /**
   * Delete an LLM provider.
   */
  async delete(id: string, userId: string) {
    const existing = await this.prisma.llmProvider.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException(`LLM provider with ID ${id} not found`);
    }

    await this.prisma.llmProvider.delete({ where: { id } });

    this.invalidateCache();
    this.logger.log(
      `LLM provider "${existing.name}" (id: ${id}) deleted by user ${userId}`,
    );
  }

  /**
   * Test a provider — returns decrypted config for the controller/LlmService to use.
   * Updates test result metadata on the record.
   */
  async testProvider(
    id: string,
    result: { success: boolean; message: string },
  ) {
    const existing = await this.prisma.llmProvider.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException(`LLM provider with ID ${id} not found`);
    }

    const config = this.decryptConfig(existing.encryptedConfig);

    await this.prisma.llmProvider.update({
      where: { id },
      data: {
        lastTestedAt: new Date(),
        lastTestResult: result.success,
        lastTestMessage: result.message,
      },
    });

    return { type: existing.type as ProviderType, config };
  }

  /**
   * Get the decrypted config for a provider type.
   * Returns null if no enabled provider of that type exists (caller falls back to env vars).
   * Resolves type aliases (e.g., 'azure' → 'azure_openai').
   */
  async getDecryptedConfig(type: string): Promise<any | null> {
    const resolvedType = TYPE_ALIASES[type] ?? type;
    const cacheKey = resolvedType;
    const now = Date.now();

    // Check cache
    const cached = this.configCache.get(cacheKey);
    if (cached && cached.expiry > now) {
      return cached.config;
    }

    const record = await this.prisma.llmProvider.findFirst({
      where: { type: resolvedType, enabled: true },
    });

    if (!record) {
      return null;
    }

    const config = this.decryptConfig(record.encryptedConfig);

    this.configCache.set(cacheKey, {
      config,
      expiry: now + this.CACHE_TTL_MS,
    });

    return config;
  }

  /**
   * Get all enabled providers for the public /llm/providers endpoint.
   * Returns the LLMProviderInfo shape used by the existing endpoint.
   */
  async getEnabledProviders() {
    const now = Date.now();

    if (this.providerListCache && this.providerListCache.expiry > now) {
      return this.providerListCache.data;
    }

    const records = await this.prisma.llmProvider.findMany({
      where: { enabled: true },
      orderBy: { createdAt: 'asc' },
    });

    const data = records.map((record) => {
      const config = this.decryptConfig(record.encryptedConfig);
      const model =
        (config as any).model ||
        DEFAULT_MODELS[record.type as ProviderType] ||
        record.type;

      return {
        id: record.id,
        type: record.type,
        name: record.name,
        enabled: record.enabled,
        isDefault: record.isDefault,
        model,
      };
    });

    this.providerListCache = { data, expiry: now + this.CACHE_TTL_MS };

    return data;
  }

  /**
   * Get the type of the default enabled provider.
   * Returns null if no default is set.
   */
  async getDefaultProviderType(): Promise<string | null> {
    const record = await this.prisma.llmProvider.findFirst({
      where: { isDefault: true, enabled: true },
      select: { type: true },
    });

    return record?.type ?? null;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Decrypt an encrypted config string to a plain object.
   */
  private decryptConfig(encryptedConfig: string): Record<string, unknown> {
    try {
      return JSON.parse(decrypt(encryptedConfig, this.encryptionKey));
    } catch (err) {
      this.logger.error('Failed to decrypt LLM provider config', err);
      return {};
    }
  }

  /**
   * Return a copy of the config with sensitive fields replaced by '********'.
   */
  private maskConfig(
    type: ProviderType,
    config: Record<string, unknown>,
  ): Record<string, unknown> {
    const sensitiveFields = SENSITIVE_FIELDS[type] ?? [];
    const masked = { ...config };

    for (const field of sensitiveFields) {
      if (field in masked) {
        masked[field] = '********';
      }
    }

    return masked;
  }

  /**
   * Invalidate both in-memory caches.
   */
  private invalidateCache(): void {
    this.configCache.clear();
    this.providerListCache = null;
  }

  /**
   * Map a Prisma record and masked config to the API response shape.
   */
  private mapProvider(record: any, maskedConfig: Record<string, unknown>) {
    const model =
      (maskedConfig as any).model ||
      DEFAULT_MODELS[record.type as ProviderType] ||
      record.type;

    return {
      id: record.id,
      type: record.type,
      name: record.name,
      enabled: record.enabled,
      isDefault: record.isDefault,
      config: maskedConfig,
      model,
      lastTestedAt: record.lastTestedAt,
      lastTestResult: record.lastTestResult,
      lastTestMessage: record.lastTestMessage,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
