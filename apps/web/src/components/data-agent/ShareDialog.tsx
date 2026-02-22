import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Tooltip,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  ContentCopy as CopyIcon,
  Check as CheckIcon,
} from '@mui/icons-material';
import { useChatShare } from '../../hooks/useChatShare';

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  chatId: string;
  chatName: string;
}

export function ShareDialog({ open, chatId, chatName, onClose }: ShareDialogProps) {
  const { share, isLoading, error, fetchShareStatus, createShare, revokeShare, clearError } = useChatShare(chatId);
  const [expiresInDays, setExpiresInDays] = useState<number | ''>('');
  const [copied, setCopied] = useState(false);
  const [revokeConfirm, setRevokeConfirm] = useState(false);

  useEffect(() => {
    if (open) {
      fetchShareStatus();
      setCopied(false);
      setRevokeConfirm(false);
      clearError();
    }
  }, [open, fetchShareStatus, clearError]);

  const handleCreate = async () => {
    try {
      await createShare(expiresInDays || undefined);
    } catch {
      // error state handled by hook
    }
  };

  const handleCopy = async () => {
    if (share?.shareUrl) {
      await navigator.clipboard.writeText(share.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRevoke = async () => {
    try {
      await revokeShare();
      setRevokeConfirm(false);
    } catch {
      // error state handled by hook
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Share Conversation</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={clearError}>
            {error}
          </Alert>
        )}

        {isLoading && !share ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress />
          </Box>
        ) : share ? (
          // Active share exists
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Anyone with this link can view the conversation read-only.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField
                fullWidth
                size="small"
                value={share.shareUrl}
                slotProps={{ input: { readOnly: true } }}
              />
              <Tooltip title={copied ? 'Copied!' : 'Copy link'}>
                <IconButton onClick={handleCopy} color={copied ? 'success' : 'default'}>
                  {copied ? <CheckIcon /> : <CopyIcon />}
                </IconButton>
              </Tooltip>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="caption" color="text.secondary">
                Viewed {share.viewCount} {share.viewCount === 1 ? 'time' : 'times'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {share.expiresAt
                  ? `Expires ${new Date(share.expiresAt).toLocaleDateString()}`
                  : 'Never expires'}
              </Typography>
            </Box>
            {!revokeConfirm ? (
              <Button
                variant="outlined"
                color="error"
                size="small"
                onClick={() => setRevokeConfirm(true)}
                disabled={isLoading}
              >
                Revoke Link
              </Button>
            ) : (
              <Alert severity="warning" sx={{ '& .MuiAlert-action': { alignItems: 'center' } }}>
                <Typography variant="body2">
                  Revoke this share link? Anyone with the link will no longer be able to access this conversation.
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                  <Button
                    size="small"
                    color="error"
                    variant="contained"
                    onClick={handleRevoke}
                    disabled={isLoading}
                  >
                    Revoke
                  </Button>
                  <Button
                    size="small"
                    onClick={() => setRevokeConfirm(false)}
                    disabled={isLoading}
                  >
                    Cancel
                  </Button>
                </Box>
              </Alert>
            )}
          </Box>
        ) : (
          // No active share
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Generate a public link to share &ldquo;{chatName}&rdquo; as a read-only conversation. Anyone with the link can view the chat messages and insights.
            </Typography>
            <FormControl size="small" fullWidth>
              <InputLabel>Link expiration</InputLabel>
              <Select
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value as number | '')}
                label="Link expiration"
              >
                <MenuItem value={7}>7 days</MenuItem>
                <MenuItem value={30}>30 days</MenuItem>
                <MenuItem value="">Never expires</MenuItem>
              </Select>
            </FormControl>
            <Button
              variant="contained"
              onClick={handleCreate}
              disabled={isLoading}
            >
              {isLoading ? <CircularProgress size={20} /> : 'Generate Link'}
            </Button>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
