import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Tabs,
  Tab,
  ToggleButtonGroup,
  ToggleButton,
  Tooltip,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  Add as AddIcon,
  AutoFixHigh as AutoIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import type { AgentPreference } from '../../services/api';

interface PreferencesDialogProps {
  open: boolean;
  onClose: () => void;
  ontologyId?: string;
  ontologyName?: string;
  preferences: AgentPreference[];
  onAdd: (data: { ontologyId?: string | null; key: string; value: string }) => Promise<void>;
  onEdit: (id: string, value: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClearAll: (ontologyId?: string) => Promise<void>;
  isLoading: boolean;
}

export function PreferencesDialog({
  open,
  onClose,
  ontologyId,
  ontologyName,
  preferences,
  onAdd,
  onEdit,
  onDelete,
  onClearAll,
  isLoading,
}: PreferencesDialogProps) {
  const [tab, setTab] = useState(0); // 0=global, 1=ontology
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  // Auto-capture mode derived from preferences
  const autoCapturePref = preferences.find(
    (p) => !p.ontologyId && p.key === 'auto_capture_mode',
  );
  const [autoCaptureMode, setAutoCaptureMode] = useState<string>(
    autoCapturePref?.value || 'auto',
  );

  useEffect(() => {
    const pref = preferences.find((p) => !p.ontologyId && p.key === 'auto_capture_mode');
    setAutoCaptureMode(pref?.value || 'auto');
  }, [preferences]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setNewKey('');
      setNewValue('');
      setEditingId(null);
      setEditValue('');
      setConfirmClear(false);
    }
  }, [open]);

  const globalPrefs = preferences.filter((p) => !p.ontologyId && p.key !== 'auto_capture_mode');
  const ontologyPrefs = preferences.filter((p) => p.ontologyId === ontologyId);
  const currentPrefs = tab === 0 ? globalPrefs : ontologyPrefs;

  const handleAdd = async () => {
    if (!newKey.trim() || !newValue.trim()) return;
    await onAdd({
      ontologyId: tab === 0 ? null : ontologyId,
      key: newKey.trim(),
      value: newValue.trim(),
    });
    setNewKey('');
    setNewValue('');
  };

  const handleEdit = async (id: string) => {
    if (!editValue.trim()) return;
    await onEdit(id, editValue.trim());
    setEditingId(null);
    setEditValue('');
  };

  const handleClear = async () => {
    await onClearAll(tab === 0 ? undefined : ontologyId);
    setConfirmClear(false);
  };

  const handleAutoCaptureChange = async (_: React.MouseEvent<HTMLElement>, newMode: string | null) => {
    if (!newMode) return;
    setAutoCaptureMode(newMode);
    await onAdd({
      ontologyId: null,
      key: 'auto_capture_mode',
      value: newMode,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6">Agent Preferences</Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {/* Auto-capture mode setting */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Auto-capture from clarifications
          </Typography>
          <ToggleButtonGroup
            value={autoCaptureMode}
            exclusive
            onChange={handleAutoCaptureChange}
            size="small"
            fullWidth
          >
            <ToggleButton value="off">Off</ToggleButton>
            <ToggleButton value="auto">Auto</ToggleButton>
            <ToggleButton value="ask">Ask</ToggleButton>
          </ToggleButtonGroup>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            {autoCaptureMode === 'off' &&
              'Clarification answers are not saved as preferences.'}
            {autoCaptureMode === 'auto' &&
              'Clarification answers are automatically saved as preferences.'}
            {autoCaptureMode === 'ask' &&
              'You will be asked before saving clarification answers as preferences.'}
          </Typography>
        </Box>

        <Divider sx={{ mb: 2 }} />

        {/* Tabs */}
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
          <Tab label={`Global (${globalPrefs.length})`} />
          <Tab
            label={`${ontologyName || 'Ontology'} (${ontologyPrefs.length})`}
            disabled={!ontologyId}
          />
        </Tabs>

        {/* Add form */}
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <TextField
            size="small"
            placeholder="Preference name"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            sx={{ flex: 1 }}
            disabled={isLoading}
          />
          <TextField
            size="small"
            placeholder="Value"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            sx={{ flex: 2 }}
            disabled={isLoading}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
            }}
          />
          <IconButton
            color="primary"
            onClick={handleAdd}
            disabled={!newKey.trim() || !newValue.trim() || isLoading}
            size="small"
          >
            <AddIcon />
          </IconButton>
        </Box>

        {/* Preferences list */}
        {currentPrefs.length === 0 ? (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ py: 3, textAlign: 'center' }}
          >
            No {tab === 0 ? 'global' : 'ontology'} preferences yet.
          </Typography>
        ) : (
          <List dense disablePadding>
            {currentPrefs.map((pref) => (
              <ListItem
                key={pref.id}
                sx={{ px: 0, borderBottom: 1, borderColor: 'divider' }}
              >
                {editingId === pref.id ? (
                  <Box
                    sx={{ display: 'flex', gap: 1, width: '100%', alignItems: 'center' }}
                  >
                    <Typography variant="body2" fontWeight={600} sx={{ minWidth: 100 }}>
                      {pref.key}
                    </Typography>
                    <TextField
                      size="small"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      sx={{ flex: 1 }}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleEdit(pref.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                    />
                    <Button size="small" onClick={() => handleEdit(pref.id)}>
                      Save
                    </Button>
                    <Button size="small" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </Box>
                ) : (
                  <>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2" fontWeight={600}>
                            {pref.key}
                          </Typography>
                          {pref.source === 'auto_captured' && (
                            <Tooltip title="Auto-captured from clarification">
                              <Chip
                                icon={<AutoIcon />}
                                label="auto"
                                size="small"
                                variant="outlined"
                                color="info"
                                sx={{
                                  height: 20,
                                  '& .MuiChip-label': { px: 0.5, fontSize: '0.7rem' },
                                }}
                              />
                            </Tooltip>
                          )}
                        </Box>
                      }
                      secondary={pref.value}
                    />
                    <ListItemSecondaryAction>
                      <IconButton
                        size="small"
                        onClick={() => {
                          setEditingId(pref.id);
                          setEditValue(pref.value);
                        }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => onDelete(pref.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </>
                )}
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        {confirmClear ? (
          <Box
            sx={{
              display: 'flex',
              gap: 1,
              width: '100%',
              justifyContent: 'space-between',
              px: 1,
            }}
          >
            <Typography variant="body2" color="error" sx={{ alignSelf: 'center' }}>
              Clear all {tab === 0 ? 'global' : 'ontology'} preferences?
            </Typography>
            <Box>
              <Button onClick={() => setConfirmClear(false)} size="small">
                Cancel
              </Button>
              <Button onClick={handleClear} color="error" size="small">
                Confirm
              </Button>
            </Box>
          </Box>
        ) : (
          <Button
            onClick={() => setConfirmClear(true)}
            disabled={currentPrefs.length === 0}
            color="error"
            size="small"
          >
            Clear All
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
