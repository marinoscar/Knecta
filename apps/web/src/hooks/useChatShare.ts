import { useState, useCallback } from 'react';
import {
  createChatShare,
  getChatShareStatus,
  revokeChatShare,
} from '../services/api';
import type { ChatShareInfo } from '../types';

export function useChatShare(chatId: string | undefined) {
  const [share, setShare] = useState<ChatShareInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchShareStatus = useCallback(async () => {
    if (!chatId) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await getChatShareStatus(chatId);
      setShare(result);
    } catch (err: any) {
      if (err?.status === 404) {
        setShare(null);
      } else {
        setError(err?.message || 'Failed to fetch share status');
      }
    } finally {
      setIsLoading(false);
    }
  }, [chatId]);

  const create = useCallback(async (expiresInDays?: number) => {
    if (!chatId) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await createChatShare(chatId, expiresInDays);
      setShare(result);
      return result;
    } catch (err: any) {
      setError(err?.message || 'Failed to create share link');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [chatId]);

  const revoke = useCallback(async () => {
    if (!chatId) return;
    setIsLoading(true);
    setError(null);
    try {
      await revokeChatShare(chatId);
      setShare(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to revoke share');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [chatId]);

  const clearError = useCallback(() => setError(null), []);

  return {
    share,
    isLoading,
    error,
    fetchShareStatus,
    createShare: create,
    revokeShare: revoke,
    clearError,
  };
}
