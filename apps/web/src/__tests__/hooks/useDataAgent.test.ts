import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useDataAgent } from '../../hooks/useDataAgent';
import * as api from '../../services/api';
import type { DataChat, DataChatsResponse } from '../../types';

vi.mock('../../services/api', () => ({
  getDataChats: vi.fn(),
  createDataChat: vi.fn(),
  deleteDataChat: vi.fn(),
  updateDataChat: vi.fn(),
}));

describe('useDataAgent', () => {
  const mockChats: DataChat[] = [
    {
      id: 'chat-1',
      name: 'First Chat',
      ontologyId: 'ont-1',
      ownerId: 'user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ontology: {
        name: 'Sales DB',
        status: 'ready',
      },
    },
    {
      id: 'chat-2',
      name: 'Second Chat',
      ontologyId: 'ont-1',
      ownerId: 'user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ontology: {
        name: 'Sales DB',
        status: 'ready',
      },
    },
  ];

  const mockResponse: DataChatsResponse = {
    items: mockChats,
    total: 2,
    page: 1,
    pageSize: 50,
    totalPages: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchChats', () => {
    it('should fetch chats and update state', async () => {
      vi.mocked(api.getDataChats).mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useDataAgent());

      expect(result.current.isLoading).toBe(false);
      expect(result.current.chats).toHaveLength(0);

      await result.current.fetchChats();

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.chats).toHaveLength(2);
      expect(result.current.total).toBe(2);
      expect(result.current.page).toBe(1);
      expect(result.current.totalPages).toBe(1);
      expect(api.getDataChats).toHaveBeenCalledWith({
        page: 1,
        pageSize: 50,
        search: undefined,
        ontologyId: undefined,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      });
    });

    it('should set loading state during fetch', async () => {
      vi.mocked(api.getDataChats).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(mockResponse), 100),
          ),
      );

      const { result } = renderHook(() => useDataAgent());

      const fetchPromise = result.current.fetchChats();

      await waitFor(() => {
        expect(result.current.isLoading).toBe(true);
      });

      await fetchPromise;

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should handle errors', async () => {
      const error = new Error('Failed to fetch');
      vi.mocked(api.getDataChats).mockRejectedValue(error);

      const { result } = renderHook(() => useDataAgent());

      await result.current.fetchChats();

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to fetch');
      });

      expect(result.current.chats).toHaveLength(0);
    });

    it('should accept custom parameters', async () => {
      vi.mocked(api.getDataChats).mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useDataAgent());

      await result.current.fetchChats({
        page: 2,
        pageSize: 20,
        search: 'test',
        ontologyId: 'ont-123',
      });

      expect(api.getDataChats).toHaveBeenCalledWith({
        page: 2,
        pageSize: 20,
        search: 'test',
        ontologyId: 'ont-123',
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      });
    });
  });

  describe('createChat', () => {
    it('should create chat and refresh list', async () => {
      const newChat: DataChat = {
        id: 'chat-3',
        name: 'New Chat',
        ontologyId: 'ont-1',
        ownerId: 'user-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.mocked(api.createDataChat).mockResolvedValue(newChat);
      vi.mocked(api.getDataChats)
        .mockResolvedValueOnce(mockResponse) // Initial fetch returns 2
        .mockResolvedValueOnce({             // Refresh after create returns 3
          ...mockResponse,
          items: [...mockChats, newChat],
          total: 3,
        });

      const { result } = renderHook(() => useDataAgent());

      // Initial fetch
      await result.current.fetchChats();

      await waitFor(() => {
        expect(result.current.chats).toHaveLength(2);
      });

      // Create new chat
      const created = await result.current.createChat({
        name: 'New Chat',
        ontologyId: 'ont-1',
      });

      expect(created).toEqual(newChat);
      expect(api.createDataChat).toHaveBeenCalledWith({
        name: 'New Chat',
        ontologyId: 'ont-1',
      });

      await waitFor(() => {
        expect(result.current.chats).toHaveLength(3);
      });
    });

    it('should handle create errors', async () => {
      const error = new Error('Failed to create chat');
      vi.mocked(api.createDataChat).mockRejectedValue(error);

      const { result } = renderHook(() => useDataAgent());

      await expect(
        result.current.createChat({
          name: 'New Chat',
          ontologyId: 'ont-1',
        }),
      ).rejects.toThrow('Failed to create chat');

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to create chat');
      });
    });
  });

  describe('deleteChat', () => {
    it('should delete chat and update local state', async () => {
      vi.mocked(api.deleteDataChat).mockResolvedValue(undefined);
      vi.mocked(api.getDataChats).mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useDataAgent());

      // Initial fetch
      await result.current.fetchChats();

      await waitFor(() => {
        expect(result.current.chats).toHaveLength(2);
        expect(result.current.total).toBe(2);
      });

      // Delete chat
      await result.current.deleteChat('chat-1');

      expect(api.deleteDataChat).toHaveBeenCalledWith('chat-1');

      await waitFor(() => {
        expect(result.current.chats).toHaveLength(1);
        expect(result.current.total).toBe(1);
      });

      expect(result.current.chats[0].id).toBe('chat-2');
    });

    it('should handle delete errors', async () => {
      const error = new Error('Failed to delete');
      vi.mocked(api.deleteDataChat).mockRejectedValue(error);

      const { result } = renderHook(() => useDataAgent());

      await expect(result.current.deleteChat('chat-1')).rejects.toThrow(
        'Failed to delete',
      );

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to delete');
      });
    });
  });

  describe('renameChat', () => {
    it('should rename chat and update local state', async () => {
      vi.mocked(api.updateDataChat).mockResolvedValue({
        ...mockChats[0],
        name: 'Renamed Chat',
      });
      vi.mocked(api.getDataChats).mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useDataAgent());

      // Initial fetch
      await result.current.fetchChats();

      await waitFor(() => {
        expect(result.current.chats[0].name).toBe('First Chat');
      });

      // Rename chat
      await result.current.renameChat('chat-1', 'Renamed Chat');

      expect(api.updateDataChat).toHaveBeenCalledWith('chat-1', {
        name: 'Renamed Chat',
      });

      await waitFor(() => {
        expect(result.current.chats[0].name).toBe('Renamed Chat');
      });
    });

    it('should handle rename errors', async () => {
      const error = new Error('Failed to rename');
      vi.mocked(api.updateDataChat).mockRejectedValue(error);

      const { result } = renderHook(() => useDataAgent());

      await expect(
        result.current.renameChat('chat-1', 'New Name'),
      ).rejects.toThrow('Failed to rename');

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to rename');
      });
    });
  });

  describe('clearError', () => {
    it('should clear error state', async () => {
      const error = new Error('Test error');
      vi.mocked(api.getDataChats).mockRejectedValue(error);

      const { result } = renderHook(() => useDataAgent());

      await result.current.fetchChats();

      await waitFor(() => {
        expect(result.current.error).toBe('Test error');
      });

      result.current.clearError();

      await waitFor(() => {
        expect(result.current.error).toBeNull();
      });
    });
  });
});
