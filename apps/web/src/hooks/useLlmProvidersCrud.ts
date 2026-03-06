import { useState, useEffect, useCallback } from 'react';
import {
  getLlmProviders,
  getLlmProviderById,
  createLlmProvider,
  updateLlmProvider,
  deleteLlmProvider,
  testLlmProvider,
} from '../services/api';
import type {
  LLMProviderInfo,
  LLMProviderDetail,
  CreateLlmProviderRequest,
  UpdateLlmProviderRequest,
} from '../types';

interface UseLlmProvidersCrudReturn {
  providers: LLMProviderInfo[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  getProvider: (id: string) => Promise<LLMProviderDetail>;
  addProvider: (data: CreateLlmProviderRequest) => Promise<LLMProviderDetail>;
  editProvider: (id: string, data: UpdateLlmProviderRequest) => Promise<LLMProviderDetail>;
  removeProvider: (id: string) => Promise<void>;
  testProviderConnection: (id: string) => Promise<{ success: boolean; message: string }>;
}

export function useLlmProvidersCrud(): UseLlmProvidersCrudReturn {
  const [providers, setProviders] = useState<LLMProviderInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const { providers: data } = await getLlmProviders();
      setProviders(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load providers');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addProvider = useCallback(
    async (data: CreateLlmProviderRequest) => {
      const result = await createLlmProvider(data);
      await refresh();
      return result;
    },
    [refresh],
  );

  const editProvider = useCallback(
    async (id: string, data: UpdateLlmProviderRequest) => {
      const result = await updateLlmProvider(id, data);
      await refresh();
      return result;
    },
    [refresh],
  );

  const removeProvider = useCallback(
    async (id: string) => {
      await deleteLlmProvider(id);
      await refresh();
    },
    [refresh],
  );

  const testProviderConnection = useCallback(
    async (id: string) => {
      const result = await testLlmProvider(id);
      await refresh(); // Refresh to show updated test status
      return result;
    },
    [refresh],
  );

  return {
    providers,
    isLoading,
    error,
    refresh,
    getProvider: getLlmProviderById,
    addProvider,
    editProvider,
    removeProvider,
    testProviderConnection,
  };
}
