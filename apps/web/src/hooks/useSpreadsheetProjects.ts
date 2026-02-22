import { useState, useCallback } from 'react';
import type { SpreadsheetProject, SpreadsheetProjectsResponse } from '../types';
import {
  getSpreadsheetProjects,
  createSpreadsheetProject,
  deleteSpreadsheetProject,
} from '../services/api';

interface UseSpreadsheetProjectsResult {
  projects: SpreadsheetProject[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  isLoading: boolean;
  error: string | null;
  fetchProjects: (params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) => Promise<void>;
  createProject: (data: {
    name: string;
    description?: string;
    storageProvider?: string;
    reviewMode?: 'auto' | 'review';
  }) => Promise<SpreadsheetProject>;
  deleteProject: (id: string) => Promise<void>;
}

export function useSpreadsheetProjects(): UseSpreadsheetProjectsResult {
  const [projects, setProjects] = useState<SpreadsheetProject[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(
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
        const response: SpreadsheetProjectsResponse = await getSpreadsheetProjects(params);
        setProjects(response.items);
        setTotal(response.total);
        setPage(response.page);
        setPageSize(response.pageSize);
        setTotalPages(response.totalPages);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch projects';
        setError(message);
        setProjects([]);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const createProjectFn = useCallback(
    async (data: {
      name: string;
      description?: string;
      storageProvider?: string;
      reviewMode?: 'auto' | 'review';
    }) => {
      setError(null);
      try {
        const project = await createSpreadsheetProject(data);
        // Refresh the list after creation
        await fetchProjects({ page, pageSize });
        return project;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create project';
        setError(message);
        throw err;
      }
    },
    [fetchProjects, page, pageSize],
  );

  const deleteProjectFn = useCallback(
    async (id: string) => {
      setError(null);
      try {
        await deleteSpreadsheetProject(id);
        // Refresh the list
        await fetchProjects({ page, pageSize });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete project';
        setError(message);
        throw err;
      }
    },
    [fetchProjects, page, pageSize],
  );

  return {
    projects,
    total,
    page,
    pageSize,
    totalPages,
    isLoading,
    error,
    fetchProjects,
    createProject: createProjectFn,
    deleteProject: deleteProjectFn,
  };
}
