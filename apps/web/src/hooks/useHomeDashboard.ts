import { useState, useEffect, useCallback } from 'react';
import type { DataChat, Ontology, SemanticModel, LLMProviderInfo } from '../types';
import {
  getConnections,
  getSemanticModels,
  getOntologies,
  getDataChats,
  getLlmProviders,
} from '../services/api';

export type DashboardMode = 'new' | 'setup' | 'active';

export interface HomeDashboardData {
  mode: DashboardMode;
  // Counts
  connectionsTotal: number;
  modelsTotal: number;
  readyModelsCount: number;
  ontologiesTotal: number;
  readyOntologiesCount: number;
  chatsTotal: number;
  totalDatasets: number;
  totalRelationships: number;
  providerCount: number;
  // Items for display
  readyOntologies: Ontology[];
  recentModels: SemanticModel[];
  recentOntologies: Ontology[];
  recentChats: DataChat[];
  providers: LLMProviderInfo[];
  // State
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

function deriveDashboardMode(
  connectionsTotal: number,
  readyOntologiesCount: number,
): DashboardMode {
  if (connectionsTotal === 0) return 'new';
  if (readyOntologiesCount === 0) return 'setup';
  return 'active';
}

export function useHomeDashboard(): HomeDashboardData {
  const [mode, setMode] = useState<DashboardMode>('new');
  const [connectionsTotal, setConnectionsTotal] = useState(0);
  const [modelsTotal, setModelsTotal] = useState(0);
  const [readyModelsCount, setReadyModelsCount] = useState(0);
  const [ontologiesTotal, setOntologiesTotal] = useState(0);
  const [readyOntologiesCount, setReadyOntologiesCount] = useState(0);
  const [chatsTotal, setChatsTotal] = useState(0);
  const [totalDatasets, setTotalDatasets] = useState(0);
  const [totalRelationships, setTotalRelationships] = useState(0);
  const [providerCount, setProviderCount] = useState(0);
  const [readyOntologies, setReadyOntologies] = useState<Ontology[]>([]);
  const [recentModels, setRecentModels] = useState<SemanticModel[]>([]);
  const [recentOntologies, setRecentOntologies] = useState<Ontology[]>([]);
  const [recentChats, setRecentChats] = useState<DataChat[]>([]);
  const [providers, setProviders] = useState<LLMProviderInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const [
      connectionsResult,
      recentModelsResult,
      readyModelsCountResult,
      readyOntologiesResult,
      recentOntologiesResult,
      recentChatsResult,
      providersResult,
    ] = await Promise.allSettled([
      // 1. Connections — only need the total count
      getConnections({ pageSize: 1 }),
      // 2. Recent semantic models (all statuses) + total count
      getSemanticModels({ pageSize: 5, sortBy: 'updatedAt', sortOrder: 'desc' }),
      // 3. Ready semantic models — only need total count
      getSemanticModels({ status: 'ready', pageSize: 1 }),
      // 4. Ready ontologies for hero selector
      getOntologies({ status: 'ready', pageSize: 10 }),
      // 5. Recent ontologies (all statuses) for activity feed
      getOntologies({ pageSize: 5, sortBy: 'updatedAt', sortOrder: 'desc' }),
      // 6. Recent data agent chats
      getDataChats({ pageSize: 5, sortBy: 'updatedAt', sortOrder: 'desc' }),
      // 7. LLM providers for provider count
      getLlmProviders(),
    ]);

    // Connections
    const connTotal =
      connectionsResult.status === 'fulfilled' ? connectionsResult.value.total : 0;

    // Recent models
    const recentModelsItems =
      recentModelsResult.status === 'fulfilled' ? recentModelsResult.value.items : [];
    const mTotal =
      recentModelsResult.status === 'fulfilled' ? recentModelsResult.value.total : 0;

    // Ready models count
    const readyMCount =
      readyModelsCountResult.status === 'fulfilled'
        ? readyModelsCountResult.value.total
        : 0;

    // Ready ontologies
    const readyOntItems =
      readyOntologiesResult.status === 'fulfilled'
        ? readyOntologiesResult.value.items
        : [];
    const readyOntCount =
      readyOntologiesResult.status === 'fulfilled'
        ? readyOntologiesResult.value.total
        : 0;

    // Recent ontologies
    const recentOntItems =
      recentOntologiesResult.status === 'fulfilled'
        ? recentOntologiesResult.value.items
        : [];
    const ontTotal =
      recentOntologiesResult.status === 'fulfilled'
        ? recentOntologiesResult.value.total
        : 0;

    // Recent chats
    const recentChatItems =
      recentChatsResult.status === 'fulfilled' ? recentChatsResult.value.items : [];
    const chatTotal =
      recentChatsResult.status === 'fulfilled' ? recentChatsResult.value.total : 0;

    // LLM providers
    const providerItems =
      providersResult.status === 'fulfilled' ? providersResult.value.providers : [];
    const enabledProviderCount = providerItems.filter((p) => p.enabled).length;

    // Derived aggregates from ready ontologies
    const datasetsSum = readyOntItems.reduce((sum, o) => sum + o.nodeCount, 0);
    const relationshipsSum = readyOntItems.reduce(
      (sum, o) => sum + o.relationshipCount,
      0,
    );

    // Mode
    const dashboardMode = deriveDashboardMode(connTotal, readyOntCount);

    setConnectionsTotal(connTotal);
    setModelsTotal(mTotal);
    setReadyModelsCount(readyMCount);
    setOntologiesTotal(ontTotal);
    setReadyOntologiesCount(readyOntCount);
    setChatsTotal(chatTotal);
    setTotalDatasets(datasetsSum);
    setTotalRelationships(relationshipsSum);
    setProviderCount(enabledProviderCount);
    setReadyOntologies(readyOntItems);
    setRecentModels(recentModelsItems);
    setRecentOntologies(recentOntItems);
    setRecentChats(recentChatItems);
    setProviders(providerItems);
    setMode(dashboardMode);

    // Surface a top-level error only if every call failed
    const allFailed = [
      connectionsResult,
      recentModelsResult,
      readyModelsCountResult,
      readyOntologiesResult,
      recentOntologiesResult,
      recentChatsResult,
      providersResult,
    ].every((r) => r.status === 'rejected');

    if (allFailed) {
      setError('Failed to load dashboard data');
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  return {
    mode,
    connectionsTotal,
    modelsTotal,
    readyModelsCount,
    ontologiesTotal,
    readyOntologiesCount,
    chatsTotal,
    totalDatasets,
    totalRelationships,
    providerCount,
    readyOntologies,
    recentModels,
    recentOntologies,
    recentChats,
    providers,
    isLoading,
    error,
    refresh: fetchDashboard,
  };
}
