import {
  Box,
  Typography,
  Switch,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  TextField,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  FormControlLabel,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { useState } from 'react';

interface FeatureFlagsListProps {
  flags: Record<string, boolean>;
  onSave: (flags: Record<string, boolean>) => Promise<void>;
  disabled?: boolean;
}

// Well-known feature flags with display labels
const KNOWN_FLAGS: Array<{ key: string; label: string; description: string }> = [
  {
    key: 'webSearchEnabled',
    label: 'Web Search',
    description: 'Allow the Data Agent to search the web for additional context',
  },
];

export function FeatureFlagsList({ flags, onSave, disabled }: FeatureFlagsListProps) {
  const [localFlags, setLocalFlags] = useState<Record<string, boolean>>(flags);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newFlagName, setNewFlagName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const hasChanges = JSON.stringify(localFlags) !== JSON.stringify(flags);

  const handleToggle = (key: string) => {
    setLocalFlags((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleDelete = (key: string) => {
    setLocalFlags((prev) => {
      const { [key]: _, ...rest } = prev;
      return rest;
    });
  };

  const handleAddFlag = () => {
    if (newFlagName && !localFlags.hasOwnProperty(newFlagName)) {
      setLocalFlags((prev) => ({
        ...prev,
        [newFlagName]: false,
      }));
      setNewFlagName('');
      setDialogOpen(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(localFlags);
    } finally {
      setIsSaving(false);
    }
  };

  // Separate known flags from custom flags
  const knownFlagEntries = KNOWN_FLAGS.filter((kf) => localFlags.hasOwnProperty(kf.key));
  const knownFlagKeys = new Set(KNOWN_FLAGS.map((kf) => kf.key));
  const customFlagEntries = Object.entries(localFlags)
    .filter(([key]) => !knownFlagKeys.has(key))
    .sort(([a], [b]) => a.localeCompare(b));

  // Known flags that haven't been added yet — available to enable
  const unadded = KNOWN_FLAGS.filter((kf) => !localFlags.hasOwnProperty(kf.key));

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6">Feature Flags</Typography>
        <Button
          startIcon={<AddIcon />}
          onClick={() => setDialogOpen(true)}
          disabled={disabled}
        >
          Add Flag
        </Button>
      </Box>

      {/* Well-known flags section */}
      {(knownFlagEntries.length > 0 || unadded.length > 0) && (
        <>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Built-in Features
          </Typography>
          <List sx={{ mb: 2 }}>
            {KNOWN_FLAGS.map((kf) => {
              const isPresent = localFlags.hasOwnProperty(kf.key);
              const value = isPresent ? localFlags[kf.key] : false;
              return (
                <ListItem key={kf.key} divider>
                  <ListItemText
                    primary={kf.label}
                    secondary={kf.description}
                  />
                  <ListItemSecondaryAction>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={value}
                          onChange={() => {
                            if (isPresent) {
                              handleToggle(kf.key);
                            } else {
                              // Add the flag and enable it
                              setLocalFlags((prev) => ({ ...prev, [kf.key]: true }));
                            }
                          }}
                          disabled={disabled}
                        />
                      }
                      label={value ? 'Enabled' : 'Disabled'}
                      labelPlacement="start"
                    />
                  </ListItemSecondaryAction>
                </ListItem>
              );
            })}
          </List>
          {customFlagEntries.length > 0 && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Custom Flags
              </Typography>
            </>
          )}
        </>
      )}

      {/* Custom flags */}
      {customFlagEntries.length > 0 ? (
        <List>
          {customFlagEntries.map(([key, value]) => (
            <ListItem key={key} divider>
              <ListItemText
                primary={key}
                secondary={value ? 'Enabled' : 'Disabled'}
              />
              <ListItemSecondaryAction>
                <Switch
                  checked={value}
                  onChange={() => handleToggle(key)}
                  disabled={disabled}
                />
                <IconButton
                  edge="end"
                  onClick={() => handleDelete(key)}
                  disabled={disabled}
                  sx={{ ml: 1 }}
                >
                  <DeleteIcon />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
      ) : (
        knownFlagEntries.length === 0 && unadded.length === 0 && (
          <Typography color="text.secondary">
            No feature flags configured
          </Typography>
        )
      )}

      <Box sx={{ mt: 3 }}>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={disabled || !hasChanges || isSaving}
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </Box>

      {/* Add Flag Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <DialogTitle>Add Feature Flag</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            label="Flag Name"
            value={newFlagName}
            onChange={(e) => setNewFlagName(e.target.value.replace(/\s/g, '_'))}
            fullWidth
            sx={{ mt: 1 }}
            helperText="Use snake_case or camelCase"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleAddFlag} disabled={!newFlagName}>
            Add
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
