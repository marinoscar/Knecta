import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Autocomplete,
  Alert,
  CircularProgress,
  Box,
  Typography,
} from '@mui/material';
import { getOntologies } from '../../services/api';
import type { Ontology } from '../../types';

interface NewChatDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (chatId: string, ontologyId: string, name: string) => void;
}

export function NewChatDialog({ open, onClose, onCreated }: NewChatDialogProps) {
  const [name, setName] = useState('');
  const [selectedOntology, setSelectedOntology] = useState<Ontology | null>(null);
  const [ontologies, setOntologies] = useState<Ontology[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOntologies, setLoadingOntologies] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchOntologies();
    }
  }, [open]);

  useEffect(() => {
    // Auto-generate name when ontology is selected
    if (selectedOntology) {
      const timestamp = new Date().toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
      setName(`${selectedOntology.name} Chat ${timestamp}`);
    }
  }, [selectedOntology]);

  const fetchOntologies = async () => {
    setLoadingOntologies(true);
    setError(null);
    try {
      const response = await getOntologies({
        status: 'ready',
        pageSize: 100,
      });
      setOntologies(response.items);
      if (response.items.length === 0) {
        setError('No ready ontologies found. Please create an ontology first.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch ontologies');
    } finally {
      setLoadingOntologies(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOntology || !name.trim()) return;

    setLoading(true);
    setError(null);

    try {
      // We'll create the chat in the parent component
      // This is just for validation and passing data back
      onCreated('temp-id', selectedOntology.id, name.trim());
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create chat');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setName('');
    setSelectedOntology(null);
    setError(null);
    onClose();
  };

  const isValid = name.trim() && selectedOntology;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>Start New Conversation</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {loadingOntologies ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              <Autocomplete
                fullWidth
                options={ontologies}
                value={selectedOntology}
                onChange={(_, newValue) => setSelectedOntology(newValue)}
                getOptionLabel={(option) => option.name}
                renderOption={(props, option) => (
                  <li {...props}>
                    <Box>
                      <Typography variant="body2">{option.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {option.datasetCount} datasets
                      </Typography>
                    </Box>
                  </li>
                )}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Select Ontology"
                    required
                    margin="dense"
                    helperText="Choose which ontology to query"
                  />
                )}
                disabled={loading}
              />

              <TextField
                autoFocus
                margin="dense"
                label="Conversation Name"
                fullWidth
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                helperText="You can change this later"
                sx={{ mt: 2 }}
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={!isValid || loading || loadingOntologies}
          >
            {loading ? 'Creating...' : 'Start Chat'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
