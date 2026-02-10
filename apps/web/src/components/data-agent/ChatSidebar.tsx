import { useState, useMemo } from 'react';
import {
  Box,
  Drawer,
  TextField,
  Button,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  IconButton,
  Typography,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import type { DataChat } from '../../types';

interface ChatSidebarProps {
  chats: DataChat[];
  activeChatId?: string;
  onNewChat: () => void;
  onSelectChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => Promise<void>;
  onRenameChat: (chatId: string, name: string) => Promise<void>;
  isLoading: boolean;
}

const SIDEBAR_WIDTH = 280;

interface DateGroup {
  label: string;
  chats: DataChat[];
}

function groupChatsByDate(chats: DataChat[]): DateGroup[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const groups: DateGroup[] = [
    { label: 'Today', chats: [] },
    { label: 'Yesterday', chats: [] },
    { label: 'Previous 7 Days', chats: [] },
    { label: 'Previous 30 Days', chats: [] },
    { label: 'Older', chats: [] },
  ];

  for (const chat of chats) {
    const chatDate = new Date(chat.updatedAt);
    if (chatDate >= today) {
      groups[0].chats.push(chat);
    } else if (chatDate >= yesterday) {
      groups[1].chats.push(chat);
    } else if (chatDate >= sevenDaysAgo) {
      groups[2].chats.push(chat);
    } else if (chatDate >= thirtyDaysAgo) {
      groups[3].chats.push(chat);
    } else {
      groups[4].chats.push(chat);
    }
  }

  return groups.filter((group) => group.chats.length > 0);
}

function ChatListItem({
  chat,
  isActive,
  onSelect,
  onRename,
  onDelete,
}: {
  chat: DataChat;
  isActive: boolean;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const theme = useTheme();

  return (
    <ListItem
      disablePadding
      secondaryAction={
        <Box sx={{ display: 'flex', gap: 0.5, opacity: 0, '.MuiListItem-root:hover &': { opacity: 1 } }}>
          <IconButton edge="end" size="small" onClick={onRename}>
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton edge="end" size="small" onClick={onDelete}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      }
    >
      <ListItemButton
        selected={isActive}
        onClick={onSelect}
        sx={{
          '&.Mui-selected': {
            backgroundColor: theme.palette.action.selected,
            '&:hover': {
              backgroundColor: theme.palette.action.hover,
            },
          },
        }}
      >
        <ListItemText
          primary={chat.name}
          secondary={
            chat.ontology && (
              <Chip
                label={chat.ontology.name}
                size="small"
                variant="outlined"
                sx={{ mt: 0.5, fontSize: '0.7rem', height: 20 }}
              />
            )
          }
          primaryTypographyProps={{
            noWrap: true,
            fontSize: '0.875rem',
          }}
        />
      </ListItemButton>
    </ListItem>
  );
}

export function ChatSidebar({
  chats,
  activeChatId,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onRenameChat,
  isLoading,
}: ChatSidebarProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [searchQuery, setSearchQuery] = useState('');
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteConfirmChatId, setDeleteConfirmChatId] = useState<string | null>(null);

  const filteredChats = useMemo(() => {
    if (!searchQuery.trim()) return chats;
    const query = searchQuery.toLowerCase();
    return chats.filter(
      (chat) =>
        chat.name.toLowerCase().includes(query) ||
        chat.ontology?.name.toLowerCase().includes(query),
    );
  }, [chats, searchQuery]);

  const groupedChats = useMemo(() => groupChatsByDate(filteredChats), [filteredChats]);

  const handleRenameClick = (chat: DataChat) => {
    setRenamingChatId(chat.id);
    setRenameValue(chat.name);
  };

  const handleRenameSubmit = async () => {
    if (renamingChatId && renameValue.trim()) {
      await onRenameChat(renamingChatId, renameValue.trim());
      setRenamingChatId(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (deleteConfirmChatId) {
      await onDeleteChat(deleteConfirmChatId);
      setDeleteConfirmChatId(null);
    }
  };

  const content = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Button
          variant="contained"
          fullWidth
          startIcon={<AddIcon />}
          onClick={onNewChat}
          sx={{ mb: 2 }}
        >
          New Chat
        </Button>
        <TextField
          fullWidth
          size="small"
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
          }}
        />
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {isLoading ? (
          <Typography variant="body2" sx={{ p: 2, color: 'text.secondary' }}>
            Loading conversations...
          </Typography>
        ) : groupedChats.length === 0 ? (
          <Typography variant="body2" sx={{ p: 2, color: 'text.secondary' }}>
            {searchQuery ? 'No matching conversations' : 'No conversations yet'}
          </Typography>
        ) : (
          groupedChats.map((group) => (
            <Box key={group.label} sx={{ mb: 2 }}>
              <Typography
                variant="caption"
                sx={{
                  px: 2,
                  py: 1,
                  display: 'block',
                  color: 'text.secondary',
                  fontWeight: 'bold',
                }}
              >
                {group.label}
              </Typography>
              <List disablePadding>
                {group.chats.map((chat) => (
                  <ChatListItem
                    key={chat.id}
                    chat={chat}
                    isActive={chat.id === activeChatId}
                    onSelect={() => onSelectChat(chat.id)}
                    onRename={() => handleRenameClick(chat)}
                    onDelete={() => setDeleteConfirmChatId(chat.id)}
                  />
                ))}
              </List>
            </Box>
          ))
        )}
      </Box>

      {/* Rename Dialog */}
      <Dialog open={renamingChatId !== null} onClose={() => setRenamingChatId(null)}>
        <DialogTitle>Rename Conversation</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleRenameSubmit();
              } else if (e.key === 'Escape') {
                setRenamingChatId(null);
              }
            }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenamingChatId(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleRenameSubmit}
            disabled={!renameValue.trim()}
          >
            Rename
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmChatId !== null} onClose={() => setDeleteConfirmChatId(null)}>
        <DialogTitle>Delete Conversation</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this conversation? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmChatId(null)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDeleteConfirm}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );

  if (isMobile) {
    return (
      <Drawer
        variant="temporary"
        open
        sx={{
          width: SIDEBAR_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: SIDEBAR_WIDTH,
            boxSizing: 'border-box',
          },
        }}
      >
        {content}
      </Drawer>
    );
  }

  return (
    <Box
      sx={{
        width: SIDEBAR_WIDTH,
        flexShrink: 0,
        borderRight: 1,
        borderColor: 'divider',
        height: '100%',
      }}
    >
      {content}
    </Box>
  );
}
