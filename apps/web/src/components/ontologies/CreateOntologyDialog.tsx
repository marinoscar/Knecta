import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
} from '@mui/material';
import type { CreateOntologyPayload, SemanticModel } from '../../types';
import { getSemanticModels, createOntology as createOntologyApi } from '../../services/api';

interface CreateOntologyDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateOntologyDialog({
  open,
  onClose,
  onCreated,
}: CreateOntologyDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [semanticModelId, setSemanticModelId] = useState('');
  const [semanticModels, setSemanticModels] = useState<SemanticModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchSemanticModels();
    }
  }, [open]);

  const fetchSemanticModels = async () => {
    setLoadingModels(true);
    setError(null);
    try {
      const response = await getSemanticModels({
        status: 'ready',
        pageSize: 100,
      });
      setSemanticModels(response.items);
      if (response.items.length === 0) {
        setError('No ready semantic models found. Please create a semantic model first.');
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to fetch semantic models',
      );
    } finally {
      setLoadingModels(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload: CreateOntologyPayload = {
        name,
        semanticModelId,
      };

      if (description.trim()) {
        payload.description = description.trim();
      }

      await createOntologyApi(payload);
      onCreated();
      handleClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create ontology',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    setSemanticModelId('');
    setError(null);
    onClose();
  };

  const isValid = name.trim() && semanticModelId;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>Create New Ontology</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {loadingModels ? (
            <CircularProgress />
          ) : (
            <>
              <TextField
                autoFocus
                margin="dense"
                label="Name"
                fullWidth
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
              />

              <TextField
                margin="dense"
                label="Description"
                fullWidth
                multiline
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={loading}
              />

              <FormControl fullWidth margin="dense" required disabled={loading}>
                <InputLabel>Semantic Model</InputLabel>
                <Select
                  value={semanticModelId}
                  onChange={(e) => setSemanticModelId(e.target.value)}
                  label="Semantic Model"
                >
                  {semanticModels.map((model) => (
                    <MenuItem key={model.id} value={model.id}>
                      {model.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
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
            disabled={!isValid || loading || loadingModels}
          >
            {loading ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
