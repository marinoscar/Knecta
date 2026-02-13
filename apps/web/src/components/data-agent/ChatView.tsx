import { useRef, useEffect, useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Chip,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  useTheme,
} from '@mui/material';
import { Delete as DeleteIcon, Edit as EditIcon } from '@mui/icons-material';
import { ChatMessage } from './ChatMessage';
import { ToolCallAccordion } from './ToolCallAccordion';
import { PhaseIndicator } from './PhaseIndicator';
import type { DataChat, DataChatMessage, DataAgentStreamEvent } from '../../types';

interface ChatViewProps {
  chat: DataChat | null;
  messages: DataChatMessage[];
  streamEvents: DataAgentStreamEvent[];
  isStreaming: boolean;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

export function ChatView({
  chat,
  messages,
  streamEvents,
  isStreaming,
  onRename,
  onDelete,
}: ChatViewProps) {
  const theme = useTheme();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [userScrolled, setUserScrolled] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Auto-scroll to bottom on new messages (unless user has scrolled up)
  useEffect(() => {
    if (!userScrolled && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamEvents, userScrolled]);

  // Track user scrolling
  const handleScroll = () => {
    if (containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
      setUserScrolled(!isAtBottom);
    }
  };

  const handleEditName = () => {
    if (chat) {
      setEditNameValue(chat.name);
      setIsEditingName(true);
    }
  };

  const handleSaveNameEdit = async () => {
    if (editNameValue.trim()) {
      await onRename(editNameValue.trim());
      setIsEditingName(false);
    }
  };

  const handleDeleteConfirm = async () => {
    await onDelete();
    setDeleteConfirmOpen(false);
  };

  if (!chat) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
        }}
      >
        <Typography variant="body1" color="text.secondary">
          Select a conversation or start a new one
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <Box
        sx={{
          p: 2,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          bgcolor: 'background.paper',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
          <Typography
            variant="h6"
            sx={{
              cursor: 'pointer',
              '&:hover': { color: 'primary.main' },
            }}
            onClick={handleEditName}
          >
            {chat.name}
          </Typography>
          <IconButton size="small" onClick={handleEditName}>
            <EditIcon fontSize="small" />
          </IconButton>
          {chat.ontology && (
            <Chip
              label={chat.ontology.name}
              size="small"
              variant="outlined"
              sx={{ ml: 1 }}
            />
          )}
        </Box>
        <IconButton onClick={() => setDeleteConfirmOpen(true)} color="error">
          <DeleteIcon />
        </IconButton>
      </Box>

      {/* Messages */}
      <Box
        ref={containerRef}
        onScroll={handleScroll}
        sx={{
          flex: 1,
          overflowY: 'auto',
          p: 3,
          bgcolor: theme.palette.mode === 'dark' ? 'background.default' : 'grey.50',
        }}
      >
        {messages.length === 0 ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
            }}
          >
            <Typography variant="body1" color="text.secondary">
              Ask a question about your data to get started
            </Typography>
          </Box>
        ) : (
          <Box sx={{ maxWidth: 900, mx: 'auto' }}>
            {messages.map((message, index) => (
              <Box key={message.id}>
                <ChatMessage message={message} />
                {/* Show phase indicator and tool calls above the current streaming assistant message */}
                {message.role === 'assistant' &&
                  message.status === 'generating' &&
                  index === messages.length - 1 &&
                  streamEvents.length > 0 && (
                    <>
                      <PhaseIndicator events={streamEvents} isStreaming={isStreaming} />
                      <ToolCallAccordion events={streamEvents} isStreaming={isStreaming} />
                    </>
                  )}
              </Box>
            ))}
            <div ref={messagesEndRef} />
          </Box>
        )}
      </Box>

      {/* Edit Name Dialog */}
      <Dialog open={isEditingName} onClose={() => setIsEditingName(false)}>
        <DialogTitle>Rename Conversation</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            value={editNameValue}
            onChange={(e) => setEditNameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveNameEdit();
              } else if (e.key === 'Escape') {
                setIsEditingName(false);
              }
            }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsEditingName(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSaveNameEdit}
            disabled={!editNameValue.trim()}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>Delete Conversation</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this conversation? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDeleteConfirm}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
