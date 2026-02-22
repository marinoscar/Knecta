import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useChatShare } from '../../hooks/useChatShare';
import * as api from '../../services/api';
import type { ChatShareInfo } from '../../types';

vi.mock('../../services/api', () => ({
  getChatShareStatus: vi.fn(),
  createChatShare: vi.fn(),
  revokeChatShare: vi.fn(),
  getSharedChat: vi.fn(),
}));

const mockShareInfo: ChatShareInfo = {
  id: 'share-1',
  shareToken: 'abc123def456ghi789jkl012mno345pqr678stu9',
  shareUrl: 'http://localhost:8319/share/abc123def456ghi789jkl012mno345pqr678stu9',
  expiresAt: null,
  isActive: true,
  viewCount: 5,
  createdAt: '2026-02-22T12:00:00Z',
};

describe('useChatShare', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial state', () => {
    it('should initialize with null share and no loading', () => {
      const { result } = renderHook(() => useChatShare('chat-123'));

      expect(result.current.share).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('fetchShareStatus', () => {
    it('should fetch share status and set share state', async () => {
      vi.mocked(api.getChatShareStatus).mockResolvedValue(mockShareInfo);

      const { result } = renderHook(() => useChatShare('chat-123'));

      await act(async () => {
        await result.current.fetchShareStatus();
      });

      await waitFor(() => {
        expect(result.current.share).toEqual(mockShareInfo);
        expect(result.current.isLoading).toBe(false);
        expect(result.current.error).toBeNull();
      });
    });

    it('should set share to null when status returns 404', async () => {
      const err: any = new Error('Not Found');
      err.status = 404;
      vi.mocked(api.getChatShareStatus).mockRejectedValue(err);

      const { result } = renderHook(() => useChatShare('chat-123'));

      // Pre-set share to non-null to confirm it gets cleared
      vi.mocked(api.getChatShareStatus).mockResolvedValueOnce(mockShareInfo);
      await act(async () => {
        await result.current.fetchShareStatus();
      });

      await waitFor(() => {
        expect(result.current.share).toEqual(mockShareInfo);
      });

      // Now simulate 404
      vi.mocked(api.getChatShareStatus).mockRejectedValue(err);
      await act(async () => {
        await result.current.fetchShareStatus();
      });

      await waitFor(() => {
        expect(result.current.share).toBeNull();
        expect(result.current.error).toBeNull();
      });
    });

    it('should set error on non-404 API failure', async () => {
      const err: any = new Error('Server error');
      err.status = 500;
      vi.mocked(api.getChatShareStatus).mockRejectedValue(err);

      const { result } = renderHook(() => useChatShare('chat-123'));

      await act(async () => {
        await result.current.fetchShareStatus();
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Server error');
        expect(result.current.share).toBeNull();
      });
    });

    it('should not fetch when chatId is undefined', async () => {
      const { result } = renderHook(() => useChatShare(undefined));

      await act(async () => {
        await result.current.fetchShareStatus();
      });

      expect(api.getChatShareStatus).not.toHaveBeenCalled();
    });

    it('should call getChatShareStatus with correct chatId', async () => {
      vi.mocked(api.getChatShareStatus).mockResolvedValue(mockShareInfo);

      const { result } = renderHook(() => useChatShare('chat-456'));

      await act(async () => {
        await result.current.fetchShareStatus();
      });

      expect(api.getChatShareStatus).toHaveBeenCalledWith('chat-456');
    });
  });

  describe('createShare', () => {
    it('should create share and update state', async () => {
      vi.mocked(api.createChatShare).mockResolvedValue(mockShareInfo);

      const { result } = renderHook(() => useChatShare('chat-123'));

      await act(async () => {
        await result.current.createShare();
      });

      await waitFor(() => {
        expect(result.current.share).toEqual(mockShareInfo);
        expect(result.current.isLoading).toBe(false);
        expect(result.current.error).toBeNull();
      });
    });

    it('should create share with expiry days', async () => {
      vi.mocked(api.createChatShare).mockResolvedValue({
        ...mockShareInfo,
        expiresAt: '2026-03-01T12:00:00Z',
      });

      const { result } = renderHook(() => useChatShare('chat-123'));

      await act(async () => {
        await result.current.createShare(7);
      });

      expect(api.createChatShare).toHaveBeenCalledWith('chat-123', 7);
    });

    it('should set error on create failure', async () => {
      const err: any = new Error('Failed to create share link');
      vi.mocked(api.createChatShare).mockRejectedValue(err);

      const { result } = renderHook(() => useChatShare('chat-123'));

      await act(async () => {
        try {
          await result.current.createShare();
        } catch {
          // expected to throw
        }
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to create share link');
        expect(result.current.share).toBeNull();
      });
    });

    it('should throw error so caller can handle it', async () => {
      const err: any = new Error('Create failed');
      vi.mocked(api.createChatShare).mockRejectedValue(err);

      const { result } = renderHook(() => useChatShare('chat-123'));

      let thrownError: Error | undefined;
      await act(async () => {
        try {
          await result.current.createShare();
        } catch (e: any) {
          thrownError = e;
        }
      });

      expect(thrownError?.message).toBe('Create failed');
    });

    it('should not create when chatId is undefined', async () => {
      const { result } = renderHook(() => useChatShare(undefined));

      await act(async () => {
        await result.current.createShare();
      });

      expect(api.createChatShare).not.toHaveBeenCalled();
    });
  });

  describe('revokeShare', () => {
    it('should revoke share and clear state', async () => {
      vi.mocked(api.getChatShareStatus).mockResolvedValue(mockShareInfo);
      vi.mocked(api.revokeChatShare).mockResolvedValue(undefined);

      const { result } = renderHook(() => useChatShare('chat-123'));

      // First set up an active share
      await act(async () => {
        await result.current.fetchShareStatus();
      });

      await waitFor(() => {
        expect(result.current.share).toEqual(mockShareInfo);
      });

      // Now revoke it
      await act(async () => {
        await result.current.revokeShare();
      });

      await waitFor(() => {
        expect(result.current.share).toBeNull();
        expect(result.current.isLoading).toBe(false);
        expect(result.current.error).toBeNull();
      });

      expect(api.revokeChatShare).toHaveBeenCalledWith('chat-123');
    });

    it('should set error on revoke failure', async () => {
      const err: any = new Error('Failed to revoke share');
      vi.mocked(api.revokeChatShare).mockRejectedValue(err);

      const { result } = renderHook(() => useChatShare('chat-123'));

      await act(async () => {
        try {
          await result.current.revokeShare();
        } catch {
          // expected to throw
        }
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to revoke share');
      });
    });

    it('should throw error so caller can handle it', async () => {
      const err: any = new Error('Revoke failed');
      vi.mocked(api.revokeChatShare).mockRejectedValue(err);

      const { result } = renderHook(() => useChatShare('chat-123'));

      let thrownError: Error | undefined;
      await act(async () => {
        try {
          await result.current.revokeShare();
        } catch (e: any) {
          thrownError = e;
        }
      });

      expect(thrownError?.message).toBe('Revoke failed');
    });

    it('should not revoke when chatId is undefined', async () => {
      const { result } = renderHook(() => useChatShare(undefined));

      await act(async () => {
        await result.current.revokeShare();
      });

      expect(api.revokeChatShare).not.toHaveBeenCalled();
    });
  });

  describe('clearError', () => {
    it('should clear error when clearError called', async () => {
      const err: any = new Error('Some error');
      err.status = 500;
      vi.mocked(api.getChatShareStatus).mockRejectedValue(err);

      const { result } = renderHook(() => useChatShare('chat-123'));

      await act(async () => {
        await result.current.fetchShareStatus();
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Some error');
      });

      act(() => {
        result.current.clearError();
      });

      await waitFor(() => {
        expect(result.current.error).toBeNull();
      });
    });

    it('should have no effect when error is already null', () => {
      const { result } = renderHook(() => useChatShare('chat-123'));

      expect(result.current.error).toBeNull();

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('Loading state management', () => {
    it('should set isLoading to true during fetchShareStatus', async () => {
      let resolvePromise!: (value: ChatShareInfo) => void;
      const pendingPromise = new Promise<ChatShareInfo>((resolve) => {
        resolvePromise = resolve;
      });

      vi.mocked(api.getChatShareStatus).mockReturnValue(pendingPromise);

      const { result } = renderHook(() => useChatShare('chat-123'));

      act(() => {
        result.current.fetchShareStatus();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(true);
      });

      await act(async () => {
        resolvePromise(mockShareInfo);
        await pendingPromise;
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should reset error before a new fetch', async () => {
      const err: any = new Error('First error');
      err.status = 500;

      vi.mocked(api.getChatShareStatus)
        .mockRejectedValueOnce(err)
        .mockResolvedValueOnce(mockShareInfo);

      const { result } = renderHook(() => useChatShare('chat-123'));

      // First fetch fails
      await act(async () => {
        await result.current.fetchShareStatus();
      });

      await waitFor(() => {
        expect(result.current.error).toBe('First error');
      });

      // Second fetch succeeds and clears error
      await act(async () => {
        await result.current.fetchShareStatus();
      });

      await waitFor(() => {
        expect(result.current.error).toBeNull();
        expect(result.current.share).toEqual(mockShareInfo);
      });
    });
  });
});
