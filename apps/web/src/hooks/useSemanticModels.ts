import { useState, useCallback } from 'react';
import type { SemanticModel, SemanticModelsResponse } from '../types';
import {
  getSemanticModels,
  deleteSemanticModel,
  exportSemanticModelYaml,
} from '../services/api';

interface UseSemanticModelsResult {
  models: SemanticModel[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  isLoading: boolean;
  error: string | null;
  fetchModels: (params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
    connectionId?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) => Promise<void>;
  deleteModel: (id: string) => Promise<void>;
  exportYaml: (id: string) => Promise<string>;
}

export function useSemanticModels(): UseSemanticModelsResult {
  const [models, setModels] = useState<SemanticModel[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchModels = useCallback(
    async (params?: {
      page?: number;
      pageSize?: number;
      search?: string;
      status?: string;
      connectionId?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }) => {
      setIsLoading(true);
      setError(null);
      try {
        const response: SemanticModelsResponse = await getSemanticModels(params);
        setModels(response.items);
        setTotal(response.total);
        setPage(response.page);
        setPageSize(response.pageSize);
        setTotalPages(response.totalPages);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to fetch semantic models';
        setError(message);
        setModels([]);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const deleteModel = useCallback(
    async (id: string) => {
      setError(null);
      try {
        await deleteSemanticModel(id);
        // Refresh the list
        await fetchModels({ page, pageSize });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to delete semantic model';
        setError(message);
        throw err;
      }
    },
    [fetchModels, page, pageSize],
  );

  const exportYaml = useCallback(async (id: string) => {
    try {
      return await exportSemanticModelYaml(id);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to export YAML';
      setError(message);
      throw err;
    }
  }, []);

  return {
    models,
    total,
    page,
    pageSize,
    totalPages,
    isLoading,
    error,
    fetchModels,
    deleteModel,
    exportYaml,
  };
}
