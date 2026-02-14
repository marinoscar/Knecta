import { Injectable, Logger } from '@nestjs/common';
import { OSI_SPEC_TEXT } from './spec';

const OSI_SPEC_YAML_URL =
  'https://raw.githubusercontent.com/open-semantic-interchange/OSI/refs/heads/main/core-spec/spec.yaml';
const OSI_SCHEMA_JSON_URL =
  'https://raw.githubusercontent.com/open-semantic-interchange/OSI/refs/heads/main/core-spec/osi-schema.json';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const FETCH_TIMEOUT_MS = 10_000; // 10 seconds

interface CachedSpec {
  specYaml: string;
  schemaJson: string | null;
  fetchedAt: number;
}

@Injectable()
export class OsiSpecService {
  private readonly logger = new Logger(OsiSpecService.name);
  private cache: CachedSpec | null = null;

  /**
   * Get the OSI spec YAML text for LLM prompt injection.
   * Fetches from GitHub with cache and fallback to bundled spec.
   */
  async getSpecText(): Promise<string> {
    // Check cache
    if (this.cache && Date.now() - this.cache.fetchedAt < CACHE_TTL_MS) {
      this.logger.debug('Returning cached OSI spec');
      return this.cache.specYaml;
    }

    // Fetch fresh spec
    try {
      this.logger.debug('Fetching OSI spec from GitHub');
      const specYaml = await this.fetchWithTimeout(OSI_SPEC_YAML_URL);

      // Fetch schema separately (non-blocking)
      let schemaJson: string | null = null;
      try {
        schemaJson = await this.fetchWithTimeout(OSI_SCHEMA_JSON_URL);
      } catch (error) {
        this.logger.warn(
          'Failed to fetch OSI JSON schema, continuing with spec only',
          error instanceof Error ? error.message : String(error),
        );
      }

      // Cache the result
      this.cache = {
        specYaml,
        schemaJson,
        fetchedAt: Date.now(),
      };

      this.logger.log('Successfully fetched and cached OSI spec from GitHub');
      return specYaml;
    } catch (error) {
      this.logger.warn(
        'Failed to fetch OSI spec from GitHub, falling back to bundled spec',
        error instanceof Error ? error.message : String(error),
      );
      return OSI_SPEC_TEXT;
    }
  }

  /**
   * Get the OSI JSON schema for programmatic validation.
   * Returns null if not available.
   */
  async getSchemaJson(): Promise<string | null> {
    // Check cache
    if (this.cache && Date.now() - this.cache.fetchedAt < CACHE_TTL_MS) {
      return this.cache.schemaJson;
    }

    // Trigger fetch to populate cache
    await this.getSpecText();

    return this.cache?.schemaJson ?? null;
  }

  /**
   * Clear the cache (for testing).
   */
  clearCache(): void {
    this.cache = null;
  }

  /**
   * Fetch URL with timeout using AbortController.
   */
  private async fetchWithTimeout(url: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}: ${response.statusText}`,
        );
      }

      return await response.text();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Fetch timeout after ${FETCH_TIMEOUT_MS}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
