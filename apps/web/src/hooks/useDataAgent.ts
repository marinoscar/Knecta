import { useState, useCallback } from 'react';
import {
  getDataChats,
  createDataChat,
  deleteDataChat,
  updateDataChat,
} from '../services/api';
import type { DataChat, DataChatsResponse } from '../types';

interface UseDataAgentResult {
  chats: DataChat[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  isLoading: boolean;
  error: string | null;
  fetchChats: (params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    ontologyId?: string;
  }) => Promise<void>;
  createChat: (data: { name: string; ontologyId: string }) => Promise<DataChat>;
  deleteChat: (id: string) => Promise<void>;
  renameChat: (id: string, name: string) => Promise<void>;
  clearError: () => void;
}

export function useDataAgent(): UseDataAgentResult {
  const [chats, setChats] = useState<DataChat[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchChats = useCallback(async (params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    ontologyId?: string;
  }) => {
    setIsLoading(true);
    setError(null);
    try {
      const response: DataChatsResponse = await getDataChats({
        page: params?.page || 1,
        pageSize: params?.pageSize || 50,
        search: params?.search,
        ontologyId: params?.ontologyId,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      });
      setChats(response.items);
      setTotal(response.total);
      setPage(response.page);
      setPageSize(response.pageSize);
      setTotalPages(response.totalPages);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to fetch data chats';
      setError(message);
      setChats([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createChat = useCallback(
    async (data: { name: string; ontologyId: string }) => {
      setError(null);
      try {
        const chat = await createDataChat(data);
        // Refresh list to include new chat
        await fetchChats({ page, pageSize });
        return chat;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to create chat';
        setError(message);
        throw err;
      }
    },
    [fetchChats, page, pageSize],
  );

  const deleteChat = useCallback(async (id: string) => {
    setError(null);
    try {
      await deleteDataChat(id);
      setChats((prev) => prev.filter((c) => c.id !== id));
      setTotal((prev) => prev - 1);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to delete chat';
      setError(message);
      throw err;
    }
  }, []);

  const renameChat = useCallback(async (id: string, name: string) => {
    setError(null);
    try {
      await updateDataChat(id, { name });
      setChats((prev) =>
        prev.map((c) => (c.id === id ? { ...c, name } : c)),
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to rename chat';
      setError(message);
      throw err;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    chats,
    total,
    page,
    pageSize,
    totalPages,
    isLoading,
    error,
    fetchChats,
    createChat,
    deleteChat,
    renameChat,
    clearError,
  };
}
