import { useState, useEffect, useCallback } from 'react';
import { Box, Alert, useTheme, Drawer, useMediaQuery, Snackbar } from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import { ChatSidebar } from '../components/data-agent/ChatSidebar';
import { ChatView } from '../components/data-agent/ChatView';
import { ChatInput } from '../components/data-agent/ChatInput';
import { WelcomeScreen } from '../components/data-agent/WelcomeScreen';
import { NewChatDialog } from '../components/data-agent/NewChatDialog';
import { AgentInsightsPanel } from '../components/data-agent/AgentInsightsPanel';
import { PreferencesDialog } from '../components/data-agent/PreferencesDialog';
import { PreferenceSuggestionBanner } from '../components/data-agent/PreferenceSuggestionBanner';
import { useDataAgent } from '../hooks/useDataAgent';
import { useDataChat } from '../hooks/useDataChat';
import { useAgentPreferences } from '../hooks/useAgentPreferences';
import { useLlmProviders } from '../hooks/useLlmProviders';
import { useUserSettings } from '../hooks/useUserSettings';

export default function DataAgentPage() {
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();
  const [newChatDialogOpen, setNewChatDialogOpen] = useState(false);
  const [insightsPanelOpen, setInsightsPanelOpen] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [preferencesDialogOpen, setPreferencesDialogOpen] = useState(false);
  const [autoSavedSnackbarOpen, setAutoSavedSnackbarOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const theme = useTheme();
  const isLargeScreen = useMediaQuery(theme.breakpoints.up('lg'));
  const isMediumScreen = useMediaQuery(theme.breakpoints.between('md', 'lg'));
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

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
    preferenceSuggestions,
    autoSavedPreferences,
    error: chatError,
    loadChat,
    sendMessage,
    clearError,
    clearPreferenceSuggestions,
    clearAutoSavedPreferences,
  } = useDataChat();

  const {
    preferences,
    isLoading: prefsLoading,
    fetchPreferences,
    addPreference,
    editPreference,
    removePreference,
    clearAll: clearPreferences,
  } = useAgentPreferences();

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

  // Load preferences when chat's ontology is available
  useEffect(() => {
    if (chat?.ontologyId) {
      fetchPreferences(chat.ontologyId);
    }
  }, [chat?.ontologyId, fetchPreferences]);

  // Show snackbar when preferences are auto-saved
  useEffect(() => {
    if (autoSavedPreferences.length > 0) {
      setAutoSavedSnackbarOpen(true);
      // Also refresh the preferences list so dialog stays up-to-date
      if (chat?.ontologyId) {
        fetchPreferences(chat.ontologyId);
      }
    }
  }, [autoSavedPreferences, chat?.ontologyId, fetchPreferences]);

  const handleNewChat = useCallback(() => {
    setNewChatDialogOpen(true);
  }, []);

  const handleOntologySelect = useCallback(
    async (ontologyId: string, ontologyName: string) => {
      try {
        const timestamp = new Date().toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
        const chatName = `${ontologyName} Chat ${timestamp}`;

        const newChat = await createChat({
          name: chatName,
          ontologyId,
          llmProvider: defaultProvider,
        });

        navigate(`/agent/${newChat.id}`);

        if (isMobile) {
          setSidebarOpen(false);
        }
      } catch (err) {
        console.error('Failed to create chat:', err);
      }
    },
    [createChat, navigate, defaultProvider, isMobile],
  );

  const handleChatCreated = useCallback(
    async (_tempId: string, ontologyId: string, name: string, llmProvider?: string | null) => {
      try {
        const newChat = await createChat({ name, ontologyId, llmProvider: llmProvider || defaultProvider });
        navigate(`/agent/${newChat.id}`);

        // Close sidebar on mobile after creating chat
        if (isMobile) {
          setSidebarOpen(false);
        }
      } catch (err) {
        // Error is already handled by useDataAgent
        console.error('Failed to create chat:', err);
      }
    },
    [createChat, navigate, defaultProvider, isMobile],
  );

  const handleSelectChat = useCallback(
    (selectedChatId: string) => {
      navigate(`/agent/${selectedChatId}`);
      // Close sidebar on mobile when selecting a chat
      if (isMobile) {
        setSidebarOpen(false);
      }
    },
    [navigate, isMobile],
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

  const handleClarificationAnswer = useCallback(
    (originalQuestion: string, clarification: string) => {
      sendMessage(`${originalQuestion}\n\nClarification: ${clarification}`);
    },
    [sendMessage],
  );

  const handleProceedWithAssumptions = useCallback(
    (originalQuestion: string, assumptions: string) => {
      sendMessage(
        `${originalQuestion}\n\nProceed with these assumptions: ${assumptions}`,
      );
    },
    [sendMessage],
  );

  const handleAcceptSuggestion = useCallback(
    async (key: string, value: string) => {
      await addPreference({
        ontologyId: chat?.ontologyId ?? null,
        key,
        value,
        source: 'auto_captured',
      });
      // Remove this suggestion from the list
      clearPreferenceSuggestions();
    },
    [addPreference, chat?.ontologyId, clearPreferenceSuggestions],
  );

  const handleMessageSelect = useCallback((messageId: string) => {
    setSelectedMessageId(messageId);
    if (!insightsPanelOpen) {
      setInsightsPanelOpen(true);
    }
  }, [insightsPanelOpen]);

  // Auto-open insights panel when streaming starts (large screens only)
  useEffect(() => {
    if (isStreaming && isLargeScreen) {
      setInsightsPanelOpen(true);
      setSelectedMessageId(null); // Reset to latest during streaming
    }
  }, [isStreaming, isLargeScreen]);

  // Auto-close sidebar on mobile
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [isMobile]);

  const showWelcome = !chatId;

  return (
    <Box
      sx={{
        display: 'flex',
        height: '100%',
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
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main content area */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
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
          <WelcomeScreen onOntologySelect={handleOntologySelect} />
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
              selectedMessageId={selectedMessageId ?? undefined}
              onMessageSelect={handleMessageSelect}
              onClarificationAnswer={handleClarificationAnswer}
              onProceedWithAssumptions={handleProceedWithAssumptions}
              onOpenPreferences={() => setPreferencesDialogOpen(true)}
              sidebarOpen={sidebarOpen}
              onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
            />
            {/* Input area - pinned to bottom, always visible */}
            <Box
              sx={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 10,
              }}
            >
              {preferenceSuggestions.length > 0 && (
                <PreferenceSuggestionBanner
                  suggestions={preferenceSuggestions}
                  onAccept={handleAcceptSuggestion}
                  onDismiss={clearPreferenceSuggestions}
                />
              )}
              <ChatInput
                onSend={sendMessage}
                isStreaming={isStreaming}
                disabled={chatLoading || !chat}
              />
            </Box>
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
            selectedMessageId={selectedMessageId ?? undefined}
            chatId={chatId}
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
            selectedMessageId={selectedMessageId ?? undefined}
            chatId={chatId}
            onClose={() => setInsightsPanelOpen(false)}
          />
        </Drawer>
      )}

      {/* New Chat Dialog */}
      <NewChatDialog
        open={newChatDialogOpen}
        onClose={() => setNewChatDialogOpen(false)}
        onCreated={handleChatCreated}
        providers={providers}
        defaultProvider={defaultProvider}
      />

      {/* Preferences Dialog */}
      <PreferencesDialog
        open={preferencesDialogOpen}
        onClose={() => setPreferencesDialogOpen(false)}
        ontologyId={chat?.ontologyId ?? undefined}
        ontologyName={chat?.ontology?.name}
        preferences={preferences}
        onAdd={addPreference}
        onEdit={editPreference}
        onDelete={removePreference}
        onClearAll={clearPreferences}
        isLoading={prefsLoading}
      />

      {/* Auto-saved preferences snackbar */}
      <Snackbar
        open={autoSavedSnackbarOpen}
        autoHideDuration={4000}
        onClose={() => {
          setAutoSavedSnackbarOpen(false);
          clearAutoSavedPreferences();
        }}
        message={`${autoSavedPreferences.length} preference${autoSavedPreferences.length !== 1 ? 's' : ''} auto-saved`}
      />
    </Box>
  );
}
