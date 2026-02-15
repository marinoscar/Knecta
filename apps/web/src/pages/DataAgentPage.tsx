import { useState, useEffect, useCallback } from 'react';
import { Box, Alert, useTheme, Drawer, useMediaQuery } from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import { ChatSidebar } from '../components/data-agent/ChatSidebar';
import { ChatView } from '../components/data-agent/ChatView';
import { ChatInput } from '../components/data-agent/ChatInput';
import { WelcomeScreen } from '../components/data-agent/WelcomeScreen';
import { NewChatDialog } from '../components/data-agent/NewChatDialog';
import { AgentInsightsPanel } from '../components/data-agent/AgentInsightsPanel';
import { useDataAgent } from '../hooks/useDataAgent';
import { useDataChat } from '../hooks/useDataChat';
import { useLlmProviders } from '../hooks/useLlmProviders';
import { useUserSettings } from '../hooks/useUserSettings';

export default function DataAgentPage() {
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();
  const [newChatDialogOpen, setNewChatDialogOpen] = useState(false);
  const [pendingSuggestion, setPendingSuggestion] = useState<string | null>(null);
  const [insightsPanelOpen, setInsightsPanelOpen] = useState(false);
  const theme = useTheme();
  const isLargeScreen = useMediaQuery(theme.breakpoints.up('lg'));
  const isMediumScreen = useMediaQuery(theme.breakpoints.between('md', 'lg'));

  const { settings: userSettings } = useUserSettings();
  const { providers, defaultProvider } = useLlmProviders(userSettings?.defaultProvider);

  const {
    chats,
    isLoading: chatsLoading,
    error: chatsError,
    fetchChats,
    createChat,
    deleteChat,
    renameChat,
  } = useDataAgent();

  const {
    chat,
    messages,
    isLoading: chatLoading,
    isStreaming,
    streamEvents,
    error: chatError,
    loadChat,
    sendMessage,
    changeProvider,
    clearError,
  } = useDataChat();

  // Fetch chats on mount
  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  // Load chat when chatId changes
  useEffect(() => {
    if (chatId) {
      loadChat(chatId);
    }
  }, [chatId, loadChat]);

  const handleNewChat = useCallback(() => {
    setNewChatDialogOpen(true);
    setPendingSuggestion(null);
  }, []);

  const handleSuggestionClick = useCallback((text: string) => {
    setPendingSuggestion(text);
    setNewChatDialogOpen(true);
  }, []);

  const handleChatCreated = useCallback(
    async (_tempId: string, ontologyId: string, name: string, llmProvider?: string | null) => {
      try {
        const newChat = await createChat({ name, ontologyId, llmProvider: llmProvider || defaultProvider });
        navigate(`/agent/${newChat.id}`);

        // If there's a pending suggestion, send it after a brief delay
        if (pendingSuggestion) {
          setTimeout(() => {
            sendMessage(pendingSuggestion);
            setPendingSuggestion(null);
          }, 500);
        }
      } catch (err) {
        // Error is already handled by useDataAgent
        console.error('Failed to create chat:', err);
      }
    },
    [createChat, navigate, pendingSuggestion, sendMessage, defaultProvider],
  );

  const handleSelectChat = useCallback(
    (selectedChatId: string) => {
      navigate(`/agent/${selectedChatId}`);
    },
    [navigate],
  );

  const handleDeleteChat = useCallback(
    async (chatIdToDelete: string) => {
      await deleteChat(chatIdToDelete);
      // If we're currently viewing this chat, navigate to welcome
      if (chatId === chatIdToDelete) {
        navigate('/agent');
      }
    },
    [deleteChat, chatId, navigate],
  );

  const handleRenameCurrentChat = useCallback(
    async (name: string) => {
      if (chatId) {
        await renameChat(chatId, name);
      }
    },
    [chatId, renameChat],
  );

  const handleDeleteCurrentChat = useCallback(async () => {
    if (chatId) {
      await deleteChat(chatId);
      navigate('/agent');
    }
  }, [chatId, deleteChat, navigate]);

  // Auto-open insights panel when streaming starts (large screens only)
  useEffect(() => {
    if (isStreaming && isLargeScreen) {
      setInsightsPanelOpen(true);
    }
  }, [isStreaming, isLargeScreen]);

  const showWelcome = !chatId;

  return (
    <Box
      sx={{
        display: 'flex',
        height: 'calc(100vh - 64px)',
        overflow: 'hidden',
      }}
    >
      {/* Sidebar */}
      <ChatSidebar
        chats={chats}
        activeChatId={chatId}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        onDeleteChat={handleDeleteChat}
        onRenameChat={renameChat}
        isLoading={chatsLoading}
      />

      {/* Main content area */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Error alerts */}
        {chatsError && (
          <Alert severity="error" sx={{ m: 2 }}>
            {chatsError}
          </Alert>
        )}
        {chatError && (
          <Alert severity="error" onClose={clearError} sx={{ m: 2 }}>
            {chatError}
          </Alert>
        )}

        {/* Content */}
        {showWelcome ? (
          <WelcomeScreen onSuggestionClick={handleSuggestionClick} />
        ) : (
          <>
            <ChatView
              chat={chat}
              messages={messages}
              streamEvents={streamEvents}
              isStreaming={isStreaming}
              onRename={handleRenameCurrentChat}
              onDelete={handleDeleteCurrentChat}
              insightsPanelOpen={insightsPanelOpen}
              onToggleInsightsPanel={() => setInsightsPanelOpen((prev) => !prev)}
            />
            <ChatInput
              onSend={sendMessage}
              isStreaming={isStreaming}
              disabled={chatLoading || !chat}
              providers={providers}
              selectedProvider={chat?.llmProvider || defaultProvider}
              onProviderChange={changeProvider}
            />
          </>
        )}
      </Box>

      {/* Right Pane - Agent Insights */}
      {!showWelcome && isLargeScreen && insightsPanelOpen && (
        <Box
          sx={{
            width: 360,
            flexShrink: 0,
            borderLeft: 1,
            borderColor: 'divider',
            height: '100%',
          }}
        >
          <AgentInsightsPanel
            messages={messages}
            streamEvents={streamEvents}
            isStreaming={isStreaming}
            onClose={() => setInsightsPanelOpen(false)}
          />
        </Box>
      )}
      {!showWelcome && !isLargeScreen && (
        <Drawer
          anchor="right"
          open={insightsPanelOpen}
          onClose={() => setInsightsPanelOpen(false)}
          PaperProps={{
            sx: { width: isMediumScreen ? 360 : '100vw' },
          }}
        >
          <AgentInsightsPanel
            messages={messages}
            streamEvents={streamEvents}
            isStreaming={isStreaming}
            onClose={() => setInsightsPanelOpen(false)}
          />
        </Drawer>
      )}

      {/* New Chat Dialog */}
      <NewChatDialog
        open={newChatDialogOpen}
        onClose={() => {
          setNewChatDialogOpen(false);
          setPendingSuggestion(null);
        }}
        onCreated={handleChatCreated}
        providers={providers}
        defaultProvider={defaultProvider}
      />
    </Box>
  );
}
