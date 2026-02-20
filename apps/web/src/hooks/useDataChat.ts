import { useState, useCallback, useRef } from 'react';
import { getDataChat, sendDataAgentMessage, updateDataChat } from '../services/api';
import { api } from '../services/api';
import type { DataChat, DataChatMessage, DataAgentStreamEvent } from '../types';
import { useNotifications } from '../contexts/NotificationContext';

export interface PreferenceSuggestion {
  key: string;
  value: string;
  question: string;
}

interface UseDataChatResult {
  chat: DataChat | null;
  messages: DataChatMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  streamEvents: DataAgentStreamEvent[];
  preferenceSuggestions: PreferenceSuggestion[];
  autoSavedPreferences: Array<{ key: string; value: string }>;
  error: string | null;
  loadChat: (id: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  changeProvider: (provider: string) => Promise<void>;
  cancelStream: () => void;
  clearError: () => void;
  clearPreferenceSuggestions: () => void;
  clearAutoSavedPreferences: () => void;
}

export function useDataChat(): UseDataChatResult {
  const { notify } = useNotifications();
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const [chat, setChat] = useState<DataChat | null>(null);
  const [messages, setMessages] = useState<DataChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamEvents, setStreamEvents] = useState<DataAgentStreamEvent[]>([]);
  const [preferenceSuggestions, setPreferenceSuggestions] = useState<PreferenceSuggestion[]>([]);
  const [autoSavedPreferences, setAutoSavedPreferences] = useState<Array<{ key: string; value: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const chatRef = useRef<DataChat | null>(null);

  // Keep chatRef in sync with chat state
  chatRef.current = chat;

  const loadChat = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getDataChat(id);
      setChat(data);
      setMessages(data.messages || []);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load chat';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!chat || isStreaming) return;

      setError(null);
      setStreamEvents([]);
      setPreferenceSuggestions([]);
      setAutoSavedPreferences([]);

      try {
        // Step 1: Send message to backend (creates user + assistant placeholder)
        const { userMessage, assistantMessage } = await sendDataAgentMessage(
          chat.id,
          content,
        );

        // Step 2: Add user message to local state immediately
        const newUserMessage: DataChatMessage = {
          id: userMessage.id,
          chatId: chat.id,
          role: 'user',
          content,
          status: 'complete',
          createdAt: new Date().toISOString(),
        };

        const placeholderAssistant: DataChatMessage = {
          id: assistantMessage.id,
          chatId: chat.id,
          role: 'assistant',
          content: '',
          status: 'generating',
          createdAt: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, newUserMessage, placeholderAssistant]);
        setIsStreaming(true);

        // Step 3: Start SSE stream (with StrictMode delay)
        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        // Small delay for React StrictMode double-fire prevention
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (abortController.signal.aborted) return;

        const token = api.getAccessToken();
        const response = await fetch(
          `/api/data-agent/chats/${chat.id}/messages/${assistantMessage.id}/stream`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
            },
            signal: abortController.signal,
          },
        );

        if (!response.ok) {
          throw new Error(`Stream failed: ${response.status}`);
        }

        // Step 4: Parse SSE stream
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events (separated by \n\n)
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            // Skip keep-alive comments
            if (part.startsWith(':')) continue;

            if (part.startsWith('data: ')) {
              try {
                const event: DataAgentStreamEvent = JSON.parse(part.slice(6));
                setStreamEvents((prev) => [...prev, event]);

                // Handle specific events
                switch (event.type) {
                  case 'text':
                    // Update assistant message content
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantMessage.id
                          ? { ...m, content: event.content || '' }
                          : m,
                      ),
                    );
                    break;

                  case 'clarification_requested':
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantMessage.id
                          ? {
                              ...m,
                              status: 'clarification_needed' as const,
                              metadata: {
                                ...m.metadata,
                                clarificationQuestions: event.questions,
                              },
                            }
                          : m,
                      ),
                    );
                    break;

                  case 'message_complete':
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantMessage.id
                          ? {
                              ...m,
                              content: event.content || m.content,
                              status: ((event.status as any) || 'complete') as DataChatMessage['status'],
                              metadata: event.metadata as any,
                            }
                          : m,
                      ),
                    );
                    // Send browser notification (skip for clarification requests)
                    if ((event as any).status !== 'clarification_needed') {
                      notifyRef.current({
                        title: 'Analysis Complete',
                        body: ((event as any).content || 'Your query has been answered.').slice(0, 120),
                        module: 'data-agent',
                        severity: 'success',
                        clickUrl: chatRef.current ? `/agent/${chatRef.current.id}` : undefined,
                      });
                    }
                    break;

                  case 'message_error':
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantMessage.id
                          ? {
                              ...m,
                              content: event.message || 'An error occurred',
                              status: 'failed' as const,
                            }
                          : m,
                      ),
                    );
                    setError(event.message || 'Agent error');
                    notifyRef.current({
                      title: 'Analysis Failed',
                      body: (event as any).message || 'An error occurred.',
                      module: 'data-agent',
                      severity: 'error',
                      clickUrl: chatRef.current ? `/agent/${chatRef.current.id}` : undefined,
                    });
                    break;

                  case 'preference_suggested':
                    if (event.suggestions && Array.isArray(event.suggestions)) {
                      setPreferenceSuggestions(event.suggestions as PreferenceSuggestion[]);
                    }
                    break;

                  case 'preference_auto_saved':
                    if (event.preferences && Array.isArray(event.preferences)) {
                      setAutoSavedPreferences(
                        event.preferences as Array<{ key: string; value: string }>,
                      );
                    }
                    break;
                }
              } catch {
                // Ignore malformed SSE data
              }
            }
          }
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setError(err.message || 'Failed to send message');
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [chat, isStreaming],
  );

  const changeProvider = useCallback(
    async (provider: string) => {
      if (!chat) return;
      try {
        const updated = await updateDataChat(chat.id, { llmProvider: provider });
        setChat((prev) => prev ? { ...prev, llmProvider: updated.llmProvider } : prev);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update provider');
      }
    },
    [chat],
  );

  const cancelStream = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const clearPreferenceSuggestions = useCallback(() => setPreferenceSuggestions([]), []);

  const clearAutoSavedPreferences = useCallback(() => setAutoSavedPreferences([]), []);

  return {
    chat,
    messages,
    isLoading,
    isStreaming,
    streamEvents,
    preferenceSuggestions,
    autoSavedPreferences,
    error,
    loadChat,
    sendMessage,
    changeProvider,
    cancelStream,
    clearError,
    clearPreferenceSuggestions,
    clearAutoSavedPreferences,
  };
}
