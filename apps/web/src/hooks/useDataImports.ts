import { useState, useCallback } from 'react';
import type { DataImport, DataImportsResponse } from '../types';
import { getDataImports, deleteDataImport } from '../services/api';

interface UseDataImportsResult {
  imports: DataImport[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  isLoading: boolean;
  error: string | null;
  fetchImports: (params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) => Promise<void>;
  deleteImport: (id: string) => Promise<void>;
}

export function useDataImports(): UseDataImportsResult {
  const [imports, setImports] = useState<DataImport[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchImports = useCallback(
    async (params?: {
      page?: number;
      pageSize?: number;
      search?: string;
      status?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }) => {
      setIsLoading(true);
      setError(null);
      try {
        const response: DataImportsResponse = await getDataImports(params);
        setImports(response.items);
        setTotal(response.total);
        setPage(response.page);
        setPageSize(response.pageSize);
        setTotalPages(response.totalPages);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch imports';
        setError(message);
        setImports([]);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const deleteImportFn = useCallback(
    async (id: string) => {
      setError(null);
      try {
        await deleteDataImport(id);
        // Refresh the list after deletion
        await fetchImports({ page, pageSize });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete import';
        setError(message);
        throw err;
      }
    },
    [fetchImports, page, pageSize],
  );

  return {
    imports,
    total,
    page,
    pageSize,
    totalPages,
    isLoading,
    error,
    fetchImports,
    deleteImport: deleteImportFn,
  };
}
