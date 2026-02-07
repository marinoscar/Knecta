import { useState, useCallback } from 'react';
import type {
  DataConnection,
  ConnectionsResponse,
  CreateConnectionPayload,
  UpdateConnectionPayload,
  TestConnectionPayload,
  ConnectionTestResult,
} from '../types';
import {
  getConnections as getConnectionsApi,
  createConnection as createConnectionApi,
  updateConnection as updateConnectionApi,
  deleteConnection as deleteConnectionApi,
  testNewConnection as testNewConnectionApi,
  testExistingConnection as testExistingConnectionApi,
} from '../services/api';

interface UseConnectionsResult {
  connections: DataConnection[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  isLoading: boolean;
  error: string | null;
  fetchConnections: (params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    dbType?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) => Promise<void>;
  createConnection: (data: CreateConnectionPayload) => Promise<void>;
  updateConnection: (id: string, data: UpdateConnectionPayload) => Promise<void>;
  deleteConnection: (id: string) => Promise<void>;
  testConnection: (id: string) => Promise<ConnectionTestResult>;
  testNewConnection: (data: TestConnectionPayload) => Promise<ConnectionTestResult>;
}

export function useConnections(): UseConnectionsResult {
  const [connections, setConnections] = useState<DataConnection[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConnections = useCallback(
    async (params?: {
      page?: number;
      pageSize?: number;
      search?: string;
      dbType?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }) => {
      setIsLoading(true);
      setError(null);
      try {
        const response: ConnectionsResponse = await getConnectionsApi(params);
        setConnections(response.items);
        setTotal(response.total);
        setPage(response.page);
        setPageSize(response.pageSize);
        setTotalPages(response.totalPages);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to fetch connections';
        setError(message);
        setConnections([]);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const createConnection = useCallback(
    async (data: CreateConnectionPayload) => {
      setError(null);
      try {
        await createConnectionApi(data);
        // Refresh the list
        await fetchConnections({ page, pageSize });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to create connection';
        setError(message);
        throw err;
      }
    },
    [fetchConnections, page, pageSize],
  );

  const updateConnection = useCallback(
    async (id: string, data: UpdateConnectionPayload) => {
      setError(null);
      try {
        await updateConnectionApi(id, data);
        // Refresh the list
        await fetchConnections({ page, pageSize });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to update connection';
        setError(message);
        throw err;
      }
    },
    [fetchConnections, page, pageSize],
  );

  const deleteConnection = useCallback(
    async (id: string) => {
      setError(null);
      try {
        await deleteConnectionApi(id);
        // Refresh the list
        await fetchConnections({ page, pageSize });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to delete connection';
        setError(message);
        throw err;
      }
    },
    [fetchConnections, page, pageSize],
  );

  const testConnection = useCallback(async (id: string) => {
    setError(null);
    try {
      const result = await testExistingConnectionApi(id);
      return result;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to test connection';
      setError(message);
      throw err;
    }
  }, []);

  const testNewConnection = useCallback(
    async (data: TestConnectionPayload) => {
      setError(null);
      try {
        const result = await testNewConnectionApi(data);
        return result;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to test connection';
        setError(message);
        throw err;
      }
    },
    [],
  );

  return {
    connections,
    total,
    page,
    pageSize,
    totalPages,
    isLoading,
    error,
    fetchConnections,
    createConnection,
    updateConnection,
    deleteConnection,
    testConnection,
    testNewConnection,
  };
}
