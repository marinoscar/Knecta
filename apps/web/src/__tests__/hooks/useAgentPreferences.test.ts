import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAgentPreferences } from '../../hooks/useAgentPreferences';
import * as api from '../../services/api';
import type { AgentPreference } from '../../services/api';

vi.mock('../../services/api', () => ({
  getAgentPreferences: vi.fn(),
  createAgentPreference: vi.fn(),
  updateAgentPreference: vi.fn(),
  deleteAgentPreference: vi.fn(),
  clearAgentPreferences: vi.fn(),
}));

describe('useAgentPreferences', () => {
  const makePreference = (
    overrides: Partial<AgentPreference> = {},
  ): AgentPreference => ({
    id: 'pref-1',
    userId: 'user-1',
    ontologyId: null,
    key: 'date_format',
    value: 'YYYY-MM-DD',
    source: 'manual',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });

  const mockPreferences: AgentPreference[] = [
    makePreference({ id: 'pref-1', key: 'date_format', value: 'YYYY-MM-DD' }),
    makePreference({
      id: 'pref-2',
      key: 'currency',
      value: 'USD',
      source: 'auto_captured',
    }),
    makePreference({
      id: 'pref-3',
      key: 'region',
      value: 'North America',
      ontologyId: 'ont-1',
    }),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial State', () => {
    it('starts with empty preferences, not loading, and no error', () => {
      const { result } = renderHook(() => useAgentPreferences());

      expect(result.current.preferences).toHaveLength(0);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('fetchPreferences', () => {
    it('loads preferences and updates state', async () => {
      vi.mocked(api.getAgentPreferences).mockResolvedValue(mockPreferences);

      const { result } = renderHook(() => useAgentPreferences());

      await act(async () => {
        await result.current.fetchPreferences();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.preferences).toHaveLength(3);
      expect(result.current.preferences[0].key).toBe('date_format');
      expect(result.current.error).toBeNull();
    });

    it('calls getAgentPreferences with scope "all"', async () => {
      vi.mocked(api.getAgentPreferences).mockResolvedValue([]);

      const { result } = renderHook(() => useAgentPreferences());

      await act(async () => {
        await result.current.fetchPreferences();
      });

      expect(api.getAgentPreferences).toHaveBeenCalledWith(undefined, 'all');
    });

    it('calls getAgentPreferences with provided ontologyId', async () => {
      vi.mocked(api.getAgentPreferences).mockResolvedValue([]);

      const { result } = renderHook(() => useAgentPreferences());

      await act(async () => {
        await result.current.fetchPreferences('ont-42');
      });

      expect(api.getAgentPreferences).toHaveBeenCalledWith('ont-42', 'all');
    });

    it('sets isLoading to true during fetch', async () => {
      let resolvePromise!: (value: AgentPreference[]) => void;
      const pendingPromise = new Promise<AgentPreference[]>((resolve) => {
        resolvePromise = resolve;
      });

      vi.mocked(api.getAgentPreferences).mockReturnValue(pendingPromise);

      const { result } = renderHook(() => useAgentPreferences());

      // Start fetch without awaiting
      act(() => {
        result.current.fetchPreferences();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(true);
      });

      // Resolve the promise
      await act(async () => {
        resolvePromise([]);
        await pendingPromise;
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('sets error state when fetch fails', async () => {
      vi.mocked(api.getAgentPreferences).mockRejectedValue(
        new Error('Network error'),
      );

      const { result } = renderHook(() => useAgentPreferences());

      await act(async () => {
        await result.current.fetchPreferences();
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Network error');
      });

      expect(result.current.preferences).toHaveLength(0);
      expect(result.current.isLoading).toBe(false);
    });

    it('uses fallback error message when error has no message', async () => {
      vi.mocked(api.getAgentPreferences).mockRejectedValue({});

      const { result } = renderHook(() => useAgentPreferences());

      await act(async () => {
        await result.current.fetchPreferences();
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to fetch preferences');
      });
    });

    it('clears previous error before new fetch', async () => {
      vi.mocked(api.getAgentPreferences)
        .mockRejectedValueOnce(new Error('First error'))
        .mockResolvedValueOnce(mockPreferences);

      const { result } = renderHook(() => useAgentPreferences());

      // First fetch - fails
      await act(async () => {
        await result.current.fetchPreferences();
      });

      await waitFor(() => {
        expect(result.current.error).toBe('First error');
      });

      // Second fetch - succeeds and clears the error
      await act(async () => {
        await result.current.fetchPreferences();
      });

      await waitFor(() => {
        expect(result.current.error).toBeNull();
        expect(result.current.preferences).toHaveLength(3);
      });
    });
  });

  describe('addPreference', () => {
    it('adds new preference to local state', async () => {
      const newPref = makePreference({
        id: 'pref-new',
        key: 'timezone',
        value: 'UTC',
      });
      vi.mocked(api.createAgentPreference).mockResolvedValue(newPref);

      const { result } = renderHook(() => useAgentPreferences());

      await act(async () => {
        await result.current.addPreference({
          key: 'timezone',
          value: 'UTC',
        });
      });

      await waitFor(() => {
        expect(result.current.preferences).toHaveLength(1);
        expect(result.current.preferences[0].key).toBe('timezone');
        expect(result.current.preferences[0].value).toBe('UTC');
      });
    });

    it('upserts existing preference with same key and ontologyId', async () => {
      const existingPref = makePreference({
        id: 'pref-1',
        key: 'date_format',
        value: 'YYYY-MM-DD',
        ontologyId: null,
      });
      const updatedPref = makePreference({
        id: 'pref-updated',
        key: 'date_format',
        value: 'DD/MM/YYYY',
        ontologyId: null,
      });

      vi.mocked(api.createAgentPreference)
        .mockResolvedValueOnce(existingPref)
        .mockResolvedValueOnce(updatedPref);

      const { result } = renderHook(() => useAgentPreferences());

      // Add initial preference
      await act(async () => {
        await result.current.addPreference({
          ontologyId: null,
          key: 'date_format',
          value: 'YYYY-MM-DD',
        });
      });

      await waitFor(() => {
        expect(result.current.preferences).toHaveLength(1);
        expect(result.current.preferences[0].value).toBe('YYYY-MM-DD');
      });

      // Add same key again - should replace
      await act(async () => {
        await result.current.addPreference({
          ontologyId: null,
          key: 'date_format',
          value: 'DD/MM/YYYY',
        });
      });

      await waitFor(() => {
        expect(result.current.preferences).toHaveLength(1);
        expect(result.current.preferences[0].id).toBe('pref-updated');
        expect(result.current.preferences[0].value).toBe('DD/MM/YYYY');
      });
    });

    it('does not remove preference with same key but different ontologyId', async () => {
      const globalPref = makePreference({
        id: 'pref-global',
        key: 'date_format',
        value: 'YYYY-MM-DD',
        ontologyId: null,
      });
      const ontologyPref = makePreference({
        id: 'pref-ont',
        key: 'date_format',
        value: 'DD/MM/YYYY',
        ontologyId: 'ont-1',
      });

      vi.mocked(api.createAgentPreference)
        .mockResolvedValueOnce(globalPref)
        .mockResolvedValueOnce(ontologyPref);

      const { result } = renderHook(() => useAgentPreferences());

      await act(async () => {
        await result.current.addPreference({ ontologyId: null, key: 'date_format', value: 'YYYY-MM-DD' });
      });

      await act(async () => {
        await result.current.addPreference({ ontologyId: 'ont-1', key: 'date_format', value: 'DD/MM/YYYY' });
      });

      await waitFor(() => {
        // Both should exist - different ontologyId
        expect(result.current.preferences).toHaveLength(2);
      });
    });

    it('sets error state when add fails', async () => {
      vi.mocked(api.createAgentPreference).mockRejectedValue(
        new Error('Create failed'),
      );

      const { result } = renderHook(() => useAgentPreferences());

      await act(async () => {
        try {
          await result.current.addPreference({ key: 'test', value: 'val' });
        } catch {
          // expected to throw
        }
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Create failed');
      });
    });

    it('throws error so caller can handle it', async () => {
      vi.mocked(api.createAgentPreference).mockRejectedValue(
        new Error('Create failed'),
      );

      const { result } = renderHook(() => useAgentPreferences());

      let thrownError: Error | undefined;
      await act(async () => {
        try {
          await result.current.addPreference({ key: 'test', value: 'val' });
        } catch (err: any) {
          thrownError = err;
        }
      });

      expect(thrownError?.message).toBe('Create failed');
    });
  });

  describe('editPreference', () => {
    it('updates the correct preference in state', async () => {
      const initial = [
        makePreference({ id: 'pref-1', key: 'date_format', value: 'YYYY-MM-DD' }),
        makePreference({ id: 'pref-2', key: 'currency', value: 'USD' }),
      ];
      const updated = makePreference({ id: 'pref-1', key: 'date_format', value: 'MM/DD/YYYY' });

      vi.mocked(api.getAgentPreferences).mockResolvedValue(initial);
      vi.mocked(api.updateAgentPreference).mockResolvedValue(updated);

      const { result } = renderHook(() => useAgentPreferences());

      await act(async () => {
        await result.current.fetchPreferences();
      });

      await waitFor(() => {
        expect(result.current.preferences).toHaveLength(2);
      });

      await act(async () => {
        await result.current.editPreference('pref-1', 'MM/DD/YYYY');
      });

      await waitFor(() => {
        const editedPref = result.current.preferences.find((p) => p.id === 'pref-1');
        expect(editedPref?.value).toBe('MM/DD/YYYY');
      });

      // Other preference should be unchanged
      const otherPref = result.current.preferences.find((p) => p.id === 'pref-2');
      expect(otherPref?.value).toBe('USD');
    });

    it('calls updateAgentPreference with correct id and value', async () => {
      const updated = makePreference({ id: 'pref-1', value: 'new_value' });
      vi.mocked(api.updateAgentPreference).mockResolvedValue(updated);

      const { result } = renderHook(() => useAgentPreferences());

      await act(async () => {
        await result.current.editPreference('pref-1', 'new_value');
      });

      expect(api.updateAgentPreference).toHaveBeenCalledWith('pref-1', {
        value: 'new_value',
      });
    });

    it('sets error state when edit fails', async () => {
      vi.mocked(api.updateAgentPreference).mockRejectedValue(
        new Error('Update failed'),
      );

      const { result } = renderHook(() => useAgentPreferences());

      await act(async () => {
        try {
          await result.current.editPreference('pref-1', 'value');
        } catch {
          // expected to throw
        }
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Update failed');
      });
    });
  });

  describe('removePreference', () => {
    it('removes preference from state by id', async () => {
      const initial = [
        makePreference({ id: 'pref-1', key: 'date_format' }),
        makePreference({ id: 'pref-2', key: 'currency' }),
      ];

      vi.mocked(api.getAgentPreferences).mockResolvedValue(initial);
      vi.mocked(api.deleteAgentPreference).mockResolvedValue(undefined);

      const { result } = renderHook(() => useAgentPreferences());

      await act(async () => {
        await result.current.fetchPreferences();
      });

      await waitFor(() => {
        expect(result.current.preferences).toHaveLength(2);
      });

      await act(async () => {
        await result.current.removePreference('pref-1');
      });

      await waitFor(() => {
        expect(result.current.preferences).toHaveLength(1);
        expect(result.current.preferences[0].id).toBe('pref-2');
      });
    });

    it('calls deleteAgentPreference with correct id', async () => {
      vi.mocked(api.deleteAgentPreference).mockResolvedValue(undefined);

      const { result } = renderHook(() => useAgentPreferences());

      await act(async () => {
        await result.current.removePreference('pref-42');
      });

      expect(api.deleteAgentPreference).toHaveBeenCalledWith('pref-42');
    });

    it('sets error state when delete fails', async () => {
      vi.mocked(api.deleteAgentPreference).mockRejectedValue(
        new Error('Delete failed'),
      );

      const { result } = renderHook(() => useAgentPreferences());

      await act(async () => {
        try {
          await result.current.removePreference('pref-1');
        } catch {
          // expected to throw
        }
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Delete failed');
      });
    });
  });

  describe('clearAll', () => {
    it('clears all preferences from state when no ontologyId provided', async () => {
      const initial = [
        makePreference({ id: 'pref-1', ontologyId: null }),
        makePreference({ id: 'pref-2', ontologyId: 'ont-1' }),
      ];

      vi.mocked(api.getAgentPreferences).mockResolvedValue(initial);
      vi.mocked(api.clearAgentPreferences).mockResolvedValue(undefined);

      const { result } = renderHook(() => useAgentPreferences());

      await act(async () => {
        await result.current.fetchPreferences();
      });

      await waitFor(() => {
        expect(result.current.preferences).toHaveLength(2);
      });

      await act(async () => {
        await result.current.clearAll();
      });

      await waitFor(() => {
        expect(result.current.preferences).toHaveLength(0);
      });
    });

    it('only clears preferences for given ontologyId', async () => {
      const initial = [
        makePreference({ id: 'pref-1', ontologyId: null }),
        makePreference({ id: 'pref-2', ontologyId: 'ont-1' }),
        makePreference({ id: 'pref-3', ontologyId: 'ont-2' }),
      ];

      vi.mocked(api.getAgentPreferences).mockResolvedValue(initial);
      vi.mocked(api.clearAgentPreferences).mockResolvedValue(undefined);

      const { result } = renderHook(() => useAgentPreferences());

      await act(async () => {
        await result.current.fetchPreferences();
      });

      await waitFor(() => {
        expect(result.current.preferences).toHaveLength(3);
      });

      await act(async () => {
        await result.current.clearAll('ont-1');
      });

      await waitFor(() => {
        expect(result.current.preferences).toHaveLength(2);
        // pref-2 (ont-1) should be gone
        expect(
          result.current.preferences.find((p) => p.id === 'pref-2'),
        ).toBeUndefined();
        // pref-1 (global) and pref-3 (ont-2) should remain
        expect(
          result.current.preferences.find((p) => p.id === 'pref-1'),
        ).toBeDefined();
        expect(
          result.current.preferences.find((p) => p.id === 'pref-3'),
        ).toBeDefined();
      });
    });

    it('calls clearAgentPreferences without ontologyId when clearing global', async () => {
      vi.mocked(api.clearAgentPreferences).mockResolvedValue(undefined);

      const { result } = renderHook(() => useAgentPreferences());

      await act(async () => {
        await result.current.clearAll();
      });

      expect(api.clearAgentPreferences).toHaveBeenCalledWith(undefined);
    });

    it('calls clearAgentPreferences with ontologyId when provided', async () => {
      vi.mocked(api.clearAgentPreferences).mockResolvedValue(undefined);

      const { result } = renderHook(() => useAgentPreferences());

      await act(async () => {
        await result.current.clearAll('ont-99');
      });

      expect(api.clearAgentPreferences).toHaveBeenCalledWith('ont-99');
    });

    it('sets error state when clearAll fails', async () => {
      vi.mocked(api.clearAgentPreferences).mockRejectedValue(
        new Error('Clear failed'),
      );

      const { result } = renderHook(() => useAgentPreferences());

      await act(async () => {
        try {
          await result.current.clearAll();
        } catch {
          // expected to throw
        }
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Clear failed');
      });
    });
  });

  describe('clearError', () => {
    it('resets error state to null', async () => {
      vi.mocked(api.getAgentPreferences).mockRejectedValue(
        new Error('Test error'),
      );

      const { result } = renderHook(() => useAgentPreferences());

      await act(async () => {
        await result.current.fetchPreferences();
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Test error');
      });

      act(() => {
        result.current.clearError();
      });

      await waitFor(() => {
        expect(result.current.error).toBeNull();
      });
    });

    it('has no effect when error is already null', () => {
      const { result } = renderHook(() => useAgentPreferences());

      expect(result.current.error).toBeNull();

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });
});
