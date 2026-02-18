import { useState, useCallback } from 'react';
import {
  getAgentPreferences,
  createAgentPreference,
  updateAgentPreference,
  deleteAgentPreference,
  clearAgentPreferences,
} from '../services/api';
import type { AgentPreference } from '../services/api';

export function useAgentPreferences() {
  const [preferences, setPreferences] = useState<AgentPreference[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPreferences = useCallback(async (ontologyId?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getAgentPreferences(ontologyId, 'all');
      setPreferences(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch preferences');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addPreference = useCallback(
    async (data: {
      ontologyId?: string | null;
      key: string;
      value: string;
      source?: 'manual' | 'auto_captured';
    }) => {
      try {
        const pref = await createAgentPreference(data);
        setPreferences((prev) => {
          // Remove any existing pref with same key + ontologyId, then add new
          const filtered = prev.filter(
            (p) => !(p.key === data.key && p.ontologyId === (data.ontologyId ?? null)),
          );
          return [...filtered, pref];
        });
      } catch (err: any) {
        setError(err.message || 'Failed to create preference');
        throw err;
      }
    },
    [],
  );

  const editPreference = useCallback(async (id: string, value: string) => {
    try {
      const updated = await updateAgentPreference(id, { value });
      setPreferences((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch (err: any) {
      setError(err.message || 'Failed to update preference');
      throw err;
    }
  }, []);

  const removePreference = useCallback(async (id: string) => {
    try {
      await deleteAgentPreference(id);
      setPreferences((prev) => prev.filter((p) => p.id !== id));
    } catch (err: any) {
      setError(err.message || 'Failed to delete preference');
      throw err;
    }
  }, []);

  const clearAll = useCallback(async (ontologyId?: string) => {
    try {
      await clearAgentPreferences(ontologyId);
      if (ontologyId) {
        setPreferences((prev) => prev.filter((p) => p.ontologyId !== ontologyId));
      } else {
        setPreferences([]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to clear preferences');
      throw err;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    preferences,
    isLoading,
    error,
    fetchPreferences,
    addPreference,
    editPreference,
    removePreference,
    clearAll,
    clearError,
  };
}
