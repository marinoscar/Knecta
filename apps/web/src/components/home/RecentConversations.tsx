import {
  Card,
  CardContent,
  Typography,
  List,
  ListItemButton,
  ListItemText,
  Chip,
  Box,
  Skeleton,
  Button,
} from '@mui/material';
import { ChevronRight as ChevronRightIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import type { DataChat } from '../../types';
import { formatRelativeTime } from '../../utils/formatRelativeTime';

interface RecentConversationsProps {
  chats: DataChat[];
  isLoading?: boolean;
}

export function RecentConversations({ chats, isLoading = false }: RecentConversationsProps) {
  const navigate = useNavigate();

  return (
    <Card
      elevation={0}
      sx={{ border: 1, borderColor: 'divider' }}
    >
      <CardContent>
        <Typography variant="h6" fontWeight="medium" sx={{ mb: 1 }}>
          Recent Conversations
        </Typography>

        {isLoading ? (
          <Box>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton
                key={i}
                variant="rectangular"
                height={48}
                sx={{ borderRadius: 1, mb: 1 }}
              />
            ))}
          </Box>
        ) : chats.length === 0 ? (
          <Typography
            color="text.secondary"
            sx={{ py: 3, textAlign: 'center' }}
          >
            No conversations yet. Ask your first question above.
          </Typography>
        ) : (
          <>
            <List disablePadding>
              {chats.map((chat) => (
                <ListItemButton
                  key={chat.id}
                  onClick={() => navigate(`/agent/${chat.id}`)}
                  sx={{ gap: 1, px: 0 }}
                >
                  <ListItemText
                    primary={chat.name}
                    primaryTypographyProps={{ noWrap: true }}
                  />
                  {chat.ontology && (
                    <Chip
                      size="small"
                      label={chat.ontology.name}
                      variant="outlined"
                    />
                  )}
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ flexShrink: 0 }}
                  >
                    {formatRelativeTime(chat.updatedAt)}
                  </Typography>
                  <ChevronRightIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                </ListItemButton>
              ))}
            </List>
            <Button
              fullWidth
              variant="text"
              size="small"
              onClick={() => navigate('/agent')}
              sx={{ mt: 1 }}
            >
              View all conversations
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
