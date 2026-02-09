import { useState, useCallback } from 'react';
import type { Ontology, OntologiesResponse, CreateOntologyPayload } from '../types';
import {
  getOntologies,
  createOntology as createOntologyApi,
  deleteOntology as deleteOntologyApi,
} from '../services/api';

interface UseOntologiesResult {
  ontologies: Ontology[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  isLoading: boolean;
  error: string | null;
  fetchOntologies: (params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) => Promise<void>;
  createOntology: (data: CreateOntologyPayload) => Promise<Ontology>;
  deleteOntology: (id: string) => Promise<void>;
}

export function useOntologies(): UseOntologiesResult {
  const [ontologies, setOntologies] = useState<Ontology[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOntologies = useCallback(
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
        const response: OntologiesResponse = await getOntologies(params);
        setOntologies(response.items);
        setTotal(response.total);
        setPage(response.page);
        setPageSize(response.pageSize);
        setTotalPages(response.totalPages);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to fetch ontologies';
        setError(message);
        setOntologies([]);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const createOntology = useCallback(
    async (data: CreateOntologyPayload) => {
      setError(null);
      try {
        const ontology = await createOntologyApi(data);
        // Refresh the list
        await fetchOntologies({ page, pageSize });
        return ontology;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to create ontology';
        setError(message);
        throw err;
      }
    },
    [fetchOntologies, page, pageSize],
  );

  const deleteOntology = useCallback(
    async (id: string) => {
      setError(null);
      try {
        await deleteOntologyApi(id);
        // Refresh the list
        await fetchOntologies({ page, pageSize });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to delete ontology';
        setError(message);
        throw err;
      }
    },
    [fetchOntologies, page, pageSize],
  );

  return {
    ontologies,
    total,
    page,
    pageSize,
    totalPages,
    isLoading,
    error,
    fetchOntologies,
    createOntology,
    deleteOntology,
  };
}
