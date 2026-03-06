import { useState } from 'react';
import {
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  IconButton,
  Chip,
  Switch,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Tooltip,
  Snackbar,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  PlayArrow as TestIcon,
  Star as DefaultIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { useLlmProvidersCrud } from '../../hooks/useLlmProvidersCrud';
import { LlmProviderDialog } from './LlmProviderDialog';
import type {
  LLMProviderDetail,
  CreateLlmProviderRequest,
  UpdateLlmProviderRequest,
} from '../../types';
import { getLlmProviderById } from '../../services/api';

const TYPE_DISPLAY_NAMES: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  azure_openai: 'Azure OpenAI',
  snowflake_cortex: 'Snowflake Cortex',
};

export function LlmProviderSettings() {
  const { providers, isLoading, error, addProvider, editProvider, removeProvider, testProviderConnection } =
    useLlmProvidersCrud();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<LLMProviderDetail | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null);

  const handleOpenCreate = () => {
    setEditingProvider(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = async (id: string) => {
    setLoadingEditId(id);
    try {
      const detail = await getLlmProviderById(id);
      setEditingProvider(detail);
      setDialogOpen(true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to load provider details');
    } finally {
      setLoadingEditId(null);
    }
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingProvider(null);
  };

  const handleSave = async (data: CreateLlmProviderRequest | UpdateLlmProviderRequest) => {
    if (editingProvider) {
      await editProvider(editingProvider.id, data as UpdateLlmProviderRequest);
      setSuccessMessage('Provider updated successfully');
    } else {
      await addProvider(data as CreateLlmProviderRequest);
      setSuccessMessage('Provider created successfully');
    }
    setDialogOpen(false);
    setEditingProvider(null);
  };

  const handleToggleEnabled = async (id: string, enabled: boolean) => {
    try {
      await editProvider(id, { enabled });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update provider');
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    setActionError(null);
    try {
      const result = await testProviderConnection(id);
      if (result.success) {
        setSuccessMessage(`Connection test passed: ${result.message}`);
      } else {
        setActionError(`Connection test failed: ${result.message}`);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTestingId(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmId) return;
    try {
      await removeProvider(deleteConfirmId);
      setSuccessMessage('Provider deleted');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete provider');
    } finally {
      setDeleteConfirmId(null);
    }
  };

  const existingTypes = providers.map((p) => p.type);

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" py={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Box>
          <Typography variant="h6">LLM Providers</Typography>
          <Typography variant="body2" color="text.secondary">
            Manage LLM provider credentials and settings. The default provider is used when no
            specific provider is requested.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreate}>
          Add Provider
        </Button>
      </Box>

      {actionError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      {providers.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">
            No LLM providers configured. Click &quot;Add Provider&quot; to get started.
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>
                  <strong>Name</strong>
                </TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Model</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Default</TableCell>
                <TableCell>Last Test</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {providers.map((provider) => (
                <TableRow key={provider.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">
                      {provider.name}
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Chip
                      label={TYPE_DISPLAY_NAMES[provider.type] ?? provider.type}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>

                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {provider.model ?? '—'}
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Chip
                      label={provider.enabled ? 'Enabled' : 'Disabled'}
                      size="small"
                      color={provider.enabled ? 'success' : 'default'}
                    />
                  </TableCell>

                  <TableCell>
                    {provider.isDefault && (
                      <Tooltip title="Default provider">
                        <DefaultIcon fontSize="small" color="warning" />
                      </Tooltip>
                    )}
                  </TableCell>

                  <TableCell>
                    {provider.lastTestedAt != null ? (
                      <Tooltip
                        title={
                          <>
                            <div>
                              {provider.lastTestResult ? 'Passed' : 'Failed'}
                              {provider.lastTestMessage ? `: ${provider.lastTestMessage}` : ''}
                            </div>
                            <div>{new Date(provider.lastTestedAt).toLocaleString()}</div>
                          </>
                        }
                      >
                        <Box display="inline-flex" alignItems="center">
                          {provider.lastTestResult ? (
                            <SuccessIcon fontSize="small" color="success" />
                          ) : (
                            <ErrorIcon fontSize="small" color="error" />
                          )}
                        </Box>
                      </Tooltip>
                    ) : (
                      <Typography variant="body2" color="text.disabled">
                        —
                      </Typography>
                    )}
                  </TableCell>

                  <TableCell align="right">
                    <Box display="flex" alignItems="center" justifyContent="flex-end" gap={0.5}>
                      <Tooltip title={provider.enabled ? 'Disable provider' : 'Enable provider'}>
                        <Switch
                          size="small"
                          checked={provider.enabled}
                          onChange={(e) => handleToggleEnabled(provider.id, e.target.checked)}
                        />
                      </Tooltip>

                      <Tooltip title="Test connection">
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => handleTest(provider.id)}
                            disabled={testingId === provider.id}
                          >
                            {testingId === provider.id ? (
                              <CircularProgress size={16} />
                            ) : (
                              <TestIcon fontSize="small" />
                            )}
                          </IconButton>
                        </span>
                      </Tooltip>

                      <Tooltip title="Edit provider">
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => handleOpenEdit(provider.id)}
                            disabled={loadingEditId === provider.id}
                          >
                            {loadingEditId === provider.id ? (
                              <CircularProgress size={16} />
                            ) : (
                              <EditIcon fontSize="small" />
                            )}
                          </IconButton>
                        </span>
                      </Tooltip>

                      <Tooltip title="Delete provider">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => setDeleteConfirmId(provider.id)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Create / Edit Dialog */}
      <LlmProviderDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        onSave={handleSave}
        provider={editingProvider}
        existingTypes={existingTypes}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmId} onClose={() => setDeleteConfirmId(null)}>
        <DialogTitle>Delete LLM Provider</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this provider? This action cannot be undone. Any agents
            configured to use this provider will fall back to the default.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDeleteConfirm}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success Snackbar */}
      <Snackbar
        open={!!successMessage}
        autoHideDuration={4000}
        onClose={() => setSuccessMessage(null)}
        message={successMessage}
      />
    </Box>
  );
}
