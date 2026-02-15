import { useState, useEffect, useCallback } from 'react';
import { getLlmProviders } from '../services/api';
import type { LLMProviderInfo } from '../types';

interface UseLlmProvidersResult {
  providers: LLMProviderInfo[];
  defaultProvider: string | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useLlmProviders(userDefaultProvider?: string): UseLlmProvidersResult {
  const [providers, setProviders] = useState<LLMProviderInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProviders = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await getLlmProviders();
      const enabledProviders = response.providers.filter((p) => p.enabled);
      setProviders(enabledProviders);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load providers';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  // Resolve default provider: user setting > system default > first provider
  const defaultProvider = (() => {
    if (!providers.length) return null;

    // If user has a preference, use it (if it's still enabled)
    if (userDefaultProvider) {
      const userPreferred = providers.find((p) => p.name === userDefaultProvider);
      if (userPreferred) return userPreferred.name;
    }

    // Fall back to system default
    const systemDefault = providers.find((p) => p.isDefault);
    if (systemDefault) return systemDefault.name;

    // Fall back to first provider
    return providers[0].name;
  })();

  return {
    providers,
    defaultProvider,
    isLoading,
    error,
    refresh: fetchProviders,
  };
}
