import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useHomeDashboard } from '../../hooks/useHomeDashboard';
import * as api from '../../services/api';
import type {
  ConnectionsResponse,
  SemanticModelsResponse,
  OntologiesResponse,
  DataChatsResponse,
  LLMProviderInfo,
  Ontology,
  SemanticModel,
  DataChat,
} from '../../types';

// ---------------------------------------------------------------------------
// Mock the API module
// ---------------------------------------------------------------------------
vi.mock('../../services/api', () => ({
  getConnections: vi.fn(),
  getSemanticModels: vi.fn(),
  getOntologies: vi.fn(),
  getDataChats: vi.fn(),
  getLlmProviders: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeConnectionsResponse(total: number): ConnectionsResponse {
  return { items: [], total, page: 1, pageSize: 1, totalPages: 1 };
}

function makeSemanticModelsResponse(
  items: SemanticModel[],
  total?: number,
): SemanticModelsResponse {
  return { items, total: total ?? items.length, page: 1, pageSize: 20, totalPages: 1 };
}

function makeOntologiesResponse(
  items: Ontology[],
  total?: number,
): OntologiesResponse {
  return { items, total: total ?? items.length, page: 1, pageSize: 20, totalPages: 1 };
}

function makeDataChatsResponse(
  items: DataChat[],
  total?: number,
): DataChatsResponse {
  return { items, total: total ?? items.length, page: 1, pageSize: 5, totalPages: 1 };
}

function makeProviders(
  enabled: boolean[],
): { providers: LLMProviderInfo[] } {
  return {
    providers: enabled.map((e, i) => ({
      name: `provider-${i}`,
      enabled: e,
      model: `model-${i}`,
      isDefault: i === 0,
    })),
  };
}

const mockSemanticModel: SemanticModel = {
  id: 'sm-1',
  name: 'Sales Model',
  description: null,
  connectionId: 'conn-1',
  databaseName: 'salesdb',
  status: 'ready',
  model: null,
  modelVersion: 1,
  tableCount: 5,
  fieldCount: 20,
  relationshipCount: 3,
  metricCount: 4,
  createdByUserId: 'user-1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-02-01T00:00:00Z',
};

const mockOntology: Ontology = {
  id: 'onto-1',
  name: 'Sales Ontology',
  description: null,
  semanticModelId: 'sm-1',
  status: 'ready',
  nodeCount: 10,
  relationshipCount: 5,
  errorMessage: null,
  createdByUserId: 'user-1',
  createdAt: '2026-01-10T00:00:00Z',
  updatedAt: '2026-02-10T00:00:00Z',
};

const mockChat: DataChat = {
  id: 'chat-1',
  name: 'Sales Q1 analysis',
  ontologyId: 'onto-1',
  llmProvider: 'openai',
  ownerId: 'user-1',
  createdAt: '2026-02-15T00:00:00Z',
  updatedAt: '2026-02-20T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Default "happy path" mock — all 7 calls succeed
// ---------------------------------------------------------------------------
function setupHappyPath() {
  vi.mocked(api.getConnections).mockResolvedValue(makeConnectionsResponse(3));
  vi.mocked(api.getSemanticModels)
    .mockResolvedValueOnce(makeSemanticModelsResponse([mockSemanticModel], 2)) // recent
    .mockResolvedValueOnce(makeSemanticModelsResponse([], 1));                  // ready count
  vi.mocked(api.getOntologies)
    .mockResolvedValueOnce(makeOntologiesResponse([mockOntology], 1))           // ready ontologies
    .mockResolvedValueOnce(makeOntologiesResponse([mockOntology], 1));          // recent ontologies
  vi.mocked(api.getDataChats).mockResolvedValue(
    makeDataChatsResponse([mockChat], 7),
  );
  vi.mocked(api.getLlmProviders).mockResolvedValue(makeProviders([true, false, true]));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useHomeDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  describe('Initial state', () => {
    it('starts with isLoading=true and no error', () => {
      // Hang the first call so we can inspect the initial state
      vi.mocked(api.getConnections).mockReturnValue(new Promise(() => {}));
      vi.mocked(api.getSemanticModels).mockReturnValue(new Promise(() => {}));
      vi.mocked(api.getOntologies).mockReturnValue(new Promise(() => {}));
      vi.mocked(api.getDataChats).mockReturnValue(new Promise(() => {}));
      vi.mocked(api.getLlmProviders).mockReturnValue(new Promise(() => {}));

      const { result } = renderHook(() => useHomeDashboard());

      expect(result.current.isLoading).toBe(true);
      expect(result.current.error).toBeNull();
    });

    it('starts with zero counts and empty arrays', () => {
      vi.mocked(api.getConnections).mockReturnValue(new Promise(() => {}));
      vi.mocked(api.getSemanticModels).mockReturnValue(new Promise(() => {}));
      vi.mocked(api.getOntologies).mockReturnValue(new Promise(() => {}));
      vi.mocked(api.getDataChats).mockReturnValue(new Promise(() => {}));
      vi.mocked(api.getLlmProviders).mockReturnValue(new Promise(() => {}));

      const { result } = renderHook(() => useHomeDashboard());

      expect(result.current.connectionsTotal).toBe(0);
      expect(result.current.modelsTotal).toBe(0);
      expect(result.current.readyModelsCount).toBe(0);
      expect(result.current.ontologiesTotal).toBe(0);
      expect(result.current.readyOntologiesCount).toBe(0);
      expect(result.current.chatsTotal).toBe(0);
      expect(result.current.totalDatasets).toBe(0);
      expect(result.current.totalRelationships).toBe(0);
      expect(result.current.providerCount).toBe(0);
      expect(result.current.readyOntologies).toEqual([]);
      expect(result.current.recentModels).toEqual([]);
      expect(result.current.recentOntologies).toEqual([]);
      expect(result.current.recentChats).toEqual([]);
      expect(result.current.providers).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  describe('Successful fetch on mount', () => {
    it('fetches all dashboard data and clears isLoading', async () => {
      setupHappyPath();

      const { result } = renderHook(() => useHomeDashboard());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(api.getConnections).toHaveBeenCalledWith({ pageSize: 1 });
      expect(api.getSemanticModels).toHaveBeenCalledTimes(2);
      expect(api.getOntologies).toHaveBeenCalledTimes(2);
      expect(api.getDataChats).toHaveBeenCalledTimes(1);
      expect(api.getLlmProviders).toHaveBeenCalledTimes(1);
    });

    it('populates counts from API responses', async () => {
      setupHappyPath();

      const { result } = renderHook(() => useHomeDashboard());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.connectionsTotal).toBe(3);
      expect(result.current.modelsTotal).toBe(2);
      expect(result.current.readyModelsCount).toBe(1);
      expect(result.current.ontologiesTotal).toBe(1);
      expect(result.current.readyOntologiesCount).toBe(1);
      expect(result.current.chatsTotal).toBe(7);
    });

    it('populates item arrays from API responses', async () => {
      setupHappyPath();

      const { result } = renderHook(() => useHomeDashboard());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.recentModels).toHaveLength(1);
      expect(result.current.recentModels[0].id).toBe('sm-1');
      expect(result.current.readyOntologies).toHaveLength(1);
      expect(result.current.readyOntologies[0].id).toBe('onto-1');
      expect(result.current.recentChats).toHaveLength(1);
      expect(result.current.recentChats[0].id).toBe('chat-1');
    });

    it('clears error when fetch succeeds', async () => {
      setupHappyPath();

      const { result } = renderHook(() => useHomeDashboard());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe('Mode derivation', () => {
    it('returns mode="new" when connectionsTotal is 0', async () => {
      vi.mocked(api.getConnections).mockResolvedValue(makeConnectionsResponse(0));
      vi.mocked(api.getSemanticModels)
        .mockResolvedValueOnce(makeSemanticModelsResponse([]))
        .mockResolvedValueOnce(makeSemanticModelsResponse([]));
      vi.mocked(api.getOntologies)
        .mockResolvedValueOnce(makeOntologiesResponse([]))
        .mockResolvedValueOnce(makeOntologiesResponse([]));
      vi.mocked(api.getDataChats).mockResolvedValue(makeDataChatsResponse([]));
      vi.mocked(api.getLlmProviders).mockResolvedValue(makeProviders([]));

      const { result } = renderHook(() => useHomeDashboard());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.mode).toBe('new');
    });

    it('returns mode="setup" when connections exist but no ready ontologies', async () => {
      vi.mocked(api.getConnections).mockResolvedValue(makeConnectionsResponse(2));
      vi.mocked(api.getSemanticModels)
        .mockResolvedValueOnce(makeSemanticModelsResponse([mockSemanticModel]))
        .mockResolvedValueOnce(makeSemanticModelsResponse([]));
      vi.mocked(api.getOntologies)
        // ready ontologies → 0 items, total 0
        .mockResolvedValueOnce(makeOntologiesResponse([]))
        // recent ontologies → also empty
        .mockResolvedValueOnce(makeOntologiesResponse([]));
      vi.mocked(api.getDataChats).mockResolvedValue(makeDataChatsResponse([]));
      vi.mocked(api.getLlmProviders).mockResolvedValue(makeProviders([true]));

      const { result } = renderHook(() => useHomeDashboard());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.mode).toBe('setup');
    });

    it('returns mode="active" when ready ontologies exist', async () => {
      setupHappyPath();

      const { result } = renderHook(() => useHomeDashboard());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.mode).toBe('active');
    });

    it('returns mode="new" even when connection fetch fails (falls back to 0)', async () => {
      vi.mocked(api.getConnections).mockRejectedValue(new Error('Network'));
      vi.mocked(api.getSemanticModels)
        .mockResolvedValueOnce(makeSemanticModelsResponse([]))
        .mockResolvedValueOnce(makeSemanticModelsResponse([]));
      vi.mocked(api.getOntologies)
        .mockResolvedValueOnce(makeOntologiesResponse([]))
        .mockResolvedValueOnce(makeOntologiesResponse([]));
      vi.mocked(api.getDataChats).mockResolvedValue(makeDataChatsResponse([]));
      vi.mocked(api.getLlmProviders).mockResolvedValue(makeProviders([]));

      const { result } = renderHook(() => useHomeDashboard());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.mode).toBe('new');
    });
  });

  // -------------------------------------------------------------------------
  describe('Partial failures — graceful degradation', () => {
    it('uses 0 / empty fallback for each failed call and does not set error', async () => {
      // Only getConnections and getLlmProviders succeed; everything else fails
      vi.mocked(api.getConnections).mockResolvedValue(makeConnectionsResponse(5));
      vi.mocked(api.getSemanticModels).mockRejectedValue(new Error('SM unavailable'));
      vi.mocked(api.getOntologies).mockRejectedValue(new Error('ONT unavailable'));
      vi.mocked(api.getDataChats).mockRejectedValue(new Error('Chat unavailable'));
      vi.mocked(api.getLlmProviders).mockResolvedValue(makeProviders([true]));

      const { result } = renderHook(() => useHomeDashboard());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Error must NOT be set because not ALL calls failed
      expect(result.current.error).toBeNull();

      // Successful calls populate their fields
      expect(result.current.connectionsTotal).toBe(5);
      expect(result.current.providerCount).toBe(1);

      // Failed calls fall back to zero / empty
      expect(result.current.modelsTotal).toBe(0);
      expect(result.current.readyModelsCount).toBe(0);
      expect(result.current.ontologiesTotal).toBe(0);
      expect(result.current.readyOntologiesCount).toBe(0);
      expect(result.current.chatsTotal).toBe(0);
      expect(result.current.recentModels).toEqual([]);
      expect(result.current.readyOntologies).toEqual([]);
      expect(result.current.recentChats).toEqual([]);
    });

    it('does not set error when only one call fails', async () => {
      setupHappyPath();
      // Override one call to fail
      vi.mocked(api.getDataChats).mockRejectedValue(new Error('Chat unavailable'));

      const { result } = renderHook(() => useHomeDashboard());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeNull();
      // The rest still populated
      expect(result.current.connectionsTotal).toBe(3);
      // Failed chat call → zero
      expect(result.current.chatsTotal).toBe(0);
      expect(result.current.recentChats).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  describe('Total failure', () => {
    it('sets error when ALL 7 calls fail', async () => {
      vi.mocked(api.getConnections).mockRejectedValue(new Error('fail'));
      vi.mocked(api.getSemanticModels).mockRejectedValue(new Error('fail'));
      vi.mocked(api.getOntologies).mockRejectedValue(new Error('fail'));
      vi.mocked(api.getDataChats).mockRejectedValue(new Error('fail'));
      vi.mocked(api.getLlmProviders).mockRejectedValue(new Error('fail'));

      const { result } = renderHook(() => useHomeDashboard());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe('Failed to load dashboard data');
    });

    it('sets isLoading to false even when all calls fail', async () => {
      vi.mocked(api.getConnections).mockRejectedValue(new Error('fail'));
      vi.mocked(api.getSemanticModels).mockRejectedValue(new Error('fail'));
      vi.mocked(api.getOntologies).mockRejectedValue(new Error('fail'));
      vi.mocked(api.getDataChats).mockRejectedValue(new Error('fail'));
      vi.mocked(api.getLlmProviders).mockRejectedValue(new Error('fail'));

      const { result } = renderHook(() => useHomeDashboard());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('falls back to all zeros and empty arrays when all calls fail', async () => {
      vi.mocked(api.getConnections).mockRejectedValue(new Error('fail'));
      vi.mocked(api.getSemanticModels).mockRejectedValue(new Error('fail'));
      vi.mocked(api.getOntologies).mockRejectedValue(new Error('fail'));
      vi.mocked(api.getDataChats).mockRejectedValue(new Error('fail'));
      vi.mocked(api.getLlmProviders).mockRejectedValue(new Error('fail'));

      const { result } = renderHook(() => useHomeDashboard());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.connectionsTotal).toBe(0);
      expect(result.current.modelsTotal).toBe(0);
      expect(result.current.readyModelsCount).toBe(0);
      expect(result.current.ontologiesTotal).toBe(0);
      expect(result.current.readyOntologiesCount).toBe(0);
      expect(result.current.chatsTotal).toBe(0);
      expect(result.current.totalDatasets).toBe(0);
      expect(result.current.totalRelationships).toBe(0);
      expect(result.current.providerCount).toBe(0);
      expect(result.current.readyOntologies).toEqual([]);
      expect(result.current.recentModels).toEqual([]);
      expect(result.current.recentOntologies).toEqual([]);
      expect(result.current.recentChats).toEqual([]);
      expect(result.current.providers).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  describe('refresh function', () => {
    it('exposes a refresh function', async () => {
      setupHappyPath();

      const { result } = renderHook(() => useHomeDashboard());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.refresh).toBe('function');
    });

    it('re-fetches all data when refresh is called', async () => {
      setupHappyPath();

      const { result } = renderHook(() => useHomeDashboard());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // First fetch: called once each
      expect(api.getConnections).toHaveBeenCalledTimes(1);
      expect(api.getLlmProviders).toHaveBeenCalledTimes(1);

      // Re-mock for the second fetch round
      vi.mocked(api.getConnections).mockResolvedValue(makeConnectionsResponse(10));
      vi.mocked(api.getSemanticModels)
        .mockResolvedValueOnce(makeSemanticModelsResponse([mockSemanticModel], 5))
        .mockResolvedValueOnce(makeSemanticModelsResponse([], 3));
      vi.mocked(api.getOntologies)
        .mockResolvedValueOnce(makeOntologiesResponse([mockOntology], 2))
        .mockResolvedValueOnce(makeOntologiesResponse([mockOntology], 2));
      vi.mocked(api.getDataChats).mockResolvedValue(makeDataChatsResponse([mockChat], 12));
      vi.mocked(api.getLlmProviders).mockResolvedValue(makeProviders([true, true]));

      await act(async () => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // All API functions called again
      expect(api.getConnections).toHaveBeenCalledTimes(2);
      expect(api.getLlmProviders).toHaveBeenCalledTimes(2);

      // Data updated to new values
      expect(result.current.connectionsTotal).toBe(10);
      expect(result.current.modelsTotal).toBe(5);
      expect(result.current.chatsTotal).toBe(12);
    });

    it('sets isLoading=true during re-fetch', async () => {
      setupHappyPath();

      const { result } = renderHook(() => useHomeDashboard());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Make the second fetch hang
      vi.mocked(api.getConnections).mockReturnValue(new Promise(() => {}));
      vi.mocked(api.getSemanticModels).mockReturnValue(new Promise(() => {}));
      vi.mocked(api.getOntologies).mockReturnValue(new Promise(() => {}));
      vi.mocked(api.getDataChats).mockReturnValue(new Promise(() => {}));
      vi.mocked(api.getLlmProviders).mockReturnValue(new Promise(() => {}));

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(true);
      });
    });

    it('clears a previous error on successful refresh', async () => {
      // First fetch — all fail
      vi.mocked(api.getConnections).mockRejectedValue(new Error('fail'));
      vi.mocked(api.getSemanticModels).mockRejectedValue(new Error('fail'));
      vi.mocked(api.getOntologies).mockRejectedValue(new Error('fail'));
      vi.mocked(api.getDataChats).mockRejectedValue(new Error('fail'));
      vi.mocked(api.getLlmProviders).mockRejectedValue(new Error('fail'));

      const { result } = renderHook(() => useHomeDashboard());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe('Failed to load dashboard data');

      // Second fetch — happy path
      setupHappyPath();

      await act(async () => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe('totalDatasets and totalRelationships computation', () => {
    it('sums nodeCount from all ready ontologies', async () => {
      const ontology2: Ontology = { ...mockOntology, id: 'onto-2', nodeCount: 20, relationshipCount: 15 };

      vi.mocked(api.getConnections).mockResolvedValue(makeConnectionsResponse(1));
      vi.mocked(api.getSemanticModels)
        .mockResolvedValueOnce(makeSemanticModelsResponse([]))
        .mockResolvedValueOnce(makeSemanticModelsResponse([]));
      vi.mocked(api.getOntologies)
        // ready ontologies — 2 items with different nodeCounts
        .mockResolvedValueOnce(makeOntologiesResponse([mockOntology, ontology2]))
        .mockResolvedValueOnce(makeOntologiesResponse([]));
      vi.mocked(api.getDataChats).mockResolvedValue(makeDataChatsResponse([]));
      vi.mocked(api.getLlmProviders).mockResolvedValue(makeProviders([]));

      const { result } = renderHook(() => useHomeDashboard());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // mockOntology.nodeCount=10, ontology2.nodeCount=20 → sum=30
      expect(result.current.totalDatasets).toBe(30);
    });

    it('sums relationshipCount from all ready ontologies', async () => {
      const ontology2: Ontology = { ...mockOntology, id: 'onto-2', nodeCount: 20, relationshipCount: 15 };

      vi.mocked(api.getConnections).mockResolvedValue(makeConnectionsResponse(1));
      vi.mocked(api.getSemanticModels)
        .mockResolvedValueOnce(makeSemanticModelsResponse([]))
        .mockResolvedValueOnce(makeSemanticModelsResponse([]));
      vi.mocked(api.getOntologies)
        .mockResolvedValueOnce(makeOntologiesResponse([mockOntology, ontology2]))
        .mockResolvedValueOnce(makeOntologiesResponse([]));
      vi.mocked(api.getDataChats).mockResolvedValue(makeDataChatsResponse([]));
      vi.mocked(api.getLlmProviders).mockResolvedValue(makeProviders([]));

      const { result } = renderHook(() => useHomeDashboard());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // mockOntology.relationshipCount=5, ontology2.relationshipCount=15 → sum=20
      expect(result.current.totalRelationships).toBe(20);
    });

    it('returns 0 for both when ready ontologies list is empty', async () => {
      vi.mocked(api.getConnections).mockResolvedValue(makeConnectionsResponse(1));
      vi.mocked(api.getSemanticModels)
        .mockResolvedValueOnce(makeSemanticModelsResponse([]))
        .mockResolvedValueOnce(makeSemanticModelsResponse([]));
      vi.mocked(api.getOntologies)
        .mockResolvedValueOnce(makeOntologiesResponse([]))
        .mockResolvedValueOnce(makeOntologiesResponse([]));
      vi.mocked(api.getDataChats).mockResolvedValue(makeDataChatsResponse([]));
      vi.mocked(api.getLlmProviders).mockResolvedValue(makeProviders([]));

      const { result } = renderHook(() => useHomeDashboard());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.totalDatasets).toBe(0);
      expect(result.current.totalRelationships).toBe(0);
    });

    it('returns 0 for both when the ready ontologies call fails', async () => {
      vi.mocked(api.getConnections).mockResolvedValue(makeConnectionsResponse(1));
      vi.mocked(api.getSemanticModels)
        .mockResolvedValueOnce(makeSemanticModelsResponse([]))
        .mockResolvedValueOnce(makeSemanticModelsResponse([]));
      vi.mocked(api.getOntologies)
        // first call (ready ontologies) → fail
        .mockRejectedValueOnce(new Error('ONT fail'))
        // second call (recent ontologies) → empty
        .mockResolvedValueOnce(makeOntologiesResponse([]));
      vi.mocked(api.getDataChats).mockResolvedValue(makeDataChatsResponse([]));
      vi.mocked(api.getLlmProviders).mockResolvedValue(makeProviders([]));

      const { result } = renderHook(() => useHomeDashboard());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.totalDatasets).toBe(0);
      expect(result.current.totalRelationships).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  describe('providerCount — enabled LLM providers', () => {
    it('counts only enabled providers', async () => {
      vi.mocked(api.getConnections).mockResolvedValue(makeConnectionsResponse(1));
      vi.mocked(api.getSemanticModels)
        .mockResolvedValueOnce(makeSemanticModelsResponse([]))
        .mockResolvedValueOnce(makeSemanticModelsResponse([]));
      vi.mocked(api.getOntologies)
        .mockResolvedValueOnce(makeOntologiesResponse([]))
        .mockResolvedValueOnce(makeOntologiesResponse([]));
      vi.mocked(api.getDataChats).mockResolvedValue(makeDataChatsResponse([]));
      // 3 providers: enabled, disabled, enabled → count should be 2
      vi.mocked(api.getLlmProviders).mockResolvedValue(makeProviders([true, false, true]));

      const { result } = renderHook(() => useHomeDashboard());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providerCount).toBe(2);
      expect(result.current.providers).toHaveLength(3);
    });

    it('returns providerCount=0 when all providers are disabled', async () => {
      vi.mocked(api.getConnections).mockResolvedValue(makeConnectionsResponse(1));
      vi.mocked(api.getSemanticModels)
        .mockResolvedValueOnce(makeSemanticModelsResponse([]))
        .mockResolvedValueOnce(makeSemanticModelsResponse([]));
      vi.mocked(api.getOntologies)
        .mockResolvedValueOnce(makeOntologiesResponse([]))
        .mockResolvedValueOnce(makeOntologiesResponse([]));
      vi.mocked(api.getDataChats).mockResolvedValue(makeDataChatsResponse([]));
      vi.mocked(api.getLlmProviders).mockResolvedValue(makeProviders([false, false]));

      const { result } = renderHook(() => useHomeDashboard());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providerCount).toBe(0);
    });

    it('returns providerCount=0 when the providers call fails', async () => {
      vi.mocked(api.getConnections).mockResolvedValue(makeConnectionsResponse(1));
      vi.mocked(api.getSemanticModels)
        .mockResolvedValueOnce(makeSemanticModelsResponse([]))
        .mockResolvedValueOnce(makeSemanticModelsResponse([]));
      vi.mocked(api.getOntologies)
        .mockResolvedValueOnce(makeOntologiesResponse([]))
        .mockResolvedValueOnce(makeOntologiesResponse([]));
      vi.mocked(api.getDataChats).mockResolvedValue(makeDataChatsResponse([]));
      vi.mocked(api.getLlmProviders).mockRejectedValue(new Error('LLM unavailable'));

      const { result } = renderHook(() => useHomeDashboard());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providerCount).toBe(0);
      expect(result.current.providers).toEqual([]);
    });

    it('counts all providers when all are enabled', async () => {
      vi.mocked(api.getConnections).mockResolvedValue(makeConnectionsResponse(1));
      vi.mocked(api.getSemanticModels)
        .mockResolvedValueOnce(makeSemanticModelsResponse([]))
        .mockResolvedValueOnce(makeSemanticModelsResponse([]));
      vi.mocked(api.getOntologies)
        .mockResolvedValueOnce(makeOntologiesResponse([]))
        .mockResolvedValueOnce(makeOntologiesResponse([]));
      vi.mocked(api.getDataChats).mockResolvedValue(makeDataChatsResponse([]));
      vi.mocked(api.getLlmProviders).mockResolvedValue(makeProviders([true, true, true]));

      const { result } = renderHook(() => useHomeDashboard());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providerCount).toBe(3);
    });
  });
});
