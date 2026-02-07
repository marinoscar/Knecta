import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  Button,
  IconButton,
  Chip,
  CircularProgress,
  Alert,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import {
  Add as AddIcon,
  Visibility as VisibilityIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { useSemanticModels } from '../hooks/useSemanticModels';
import { usePermissions } from '../hooks/usePermissions';
import type { SemanticModel, SemanticModelStatus } from '../types';

const STATUS_CONFIG: Record<
  SemanticModelStatus,
  { label: string; color: 'default' | 'warning' | 'success' | 'error' }
> = {
  draft: { label: 'Draft', color: 'default' },
  generating: { label: 'Generating', color: 'warning' },
  ready: { label: 'Ready', color: 'success' },
  failed: { label: 'Failed', color: 'error' },
};

const STATUS_OPTIONS: SemanticModelStatus[] = ['draft', 'generating', 'ready', 'failed'];

export default function SemanticModelsPage() {
  const navigate = useNavigate();
  const {
    models,
    total,
    page,
    pageSize,
    isLoading,
    error,
    fetchModels,
    deleteModel,
    exportYaml,
  } = useSemanticModels();

  const { hasPermission } = usePermissions();
  const canGenerate = hasPermission('semantic_models:generate');
  const canDelete = hasPermission('semantic_models:delete');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [modelToDelete, setModelToDelete] = useState<SemanticModel | null>(null);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    fetchModels({
      page,
      pageSize,
      search: search || undefined,
      status: statusFilter || undefined,
    });
  }, [page, pageSize, search, statusFilter, fetchModels]);

  const handlePageChange = (_: unknown, newPage: number) => {
    fetchModels({
      page: newPage + 1,
      pageSize,
      search: search || undefined,
      status: statusFilter || undefined,
    });
  };

  const handleRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newPageSize = parseInt(event.target.value, 10);
    fetchModels({
      page: 1,
      pageSize: newPageSize,
      search: search || undefined,
      status: statusFilter || undefined,
    });
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
  };

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
  };

  const handleView = (id: string) => {
    navigate(`/semantic-models/${id}`);
  };

  const handleExport = async (model: SemanticModel) => {
    try {
      const yaml = await exportYaml(model.id);

      // Create a blob and download it
      const blob = new Blob([yaml], { type: 'text/yaml' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${model.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.yaml`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setSnackbar({
        open: true,
        message: 'YAML exported successfully',
        severity: 'success',
      });
    } catch (err) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : 'Failed to export YAML',
        severity: 'error',
      });
    }
  };

  const handleDeleteClick = (model: SemanticModel) => {
    setModelToDelete(model);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!modelToDelete) return;

    try {
      await deleteModel(modelToDelete.id);
      setSnackbar({
        open: true,
        message: 'Semantic model deleted successfully',
        severity: 'success',
      });
    } catch (err) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : 'Failed to delete semantic model',
        severity: 'error',
      });
    } finally {
      setDeleteDialogOpen(false);
      setModelToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setModelToDelete(null);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h4" component="h1" gutterBottom>
            Semantic Models
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Generate and manage semantic models for natural language queries
          </Typography>
        </Box>

        <Paper>
          <Box sx={{ p: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
            <TextField
              label="Search"
              variant="outlined"
              size="small"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by name or description"
              sx={{ minWidth: 250 }}
            />
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Status</InputLabel>
              <Select
                value={statusFilter}
                onChange={(e) => handleStatusFilterChange(e.target.value)}
                label="Status"
              >
                <MenuItem value="">All</MenuItem>
                {STATUS_OPTIONS.map((status) => (
                  <MenuItem key={status} value={status}>
                    {STATUS_CONFIG[status].label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Box sx={{ flexGrow: 1 }} />
            {canGenerate && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => navigate('/semantic-models/new')}
              >
                New Model
              </Button>
            )}
          </Box>

          {error && (
            <Alert severity="error" sx={{ mx: 2, mb: 2 }}>
              {error}
            </Alert>
          )}

          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : models.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">
                {search || statusFilter ? 'No semantic models found matching your filters' : 'No semantic models found'}
              </Typography>
            </Box>
          ) : (
            <>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Connection</TableCell>
                      <TableCell>Database</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Tables</TableCell>
                      <TableCell align="right">Fields</TableCell>
                      <TableCell>Updated</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {models.map((model) => (
                      <TableRow key={model.id} hover>
                        <TableCell>
                          <Box>
                            <Typography variant="body2">{model.name}</Typography>
                            {model.description && (
                              <Typography variant="caption" color="text.secondary">
                                {model.description}
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          {model.connection ? model.connection.name : '-'}
                        </TableCell>
                        <TableCell>{model.databaseName || '-'}</TableCell>
                        <TableCell>
                          <Chip
                            label={STATUS_CONFIG[model.status].label}
                            color={STATUS_CONFIG[model.status].color}
                            size="small"
                          />
                        </TableCell>
                        <TableCell align="right">{model.tableCount}</TableCell>
                        <TableCell align="right">{model.fieldCount}</TableCell>
                        <TableCell>{formatDate(model.updatedAt)}</TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                            <Tooltip title="View details">
                              <IconButton
                                size="small"
                                onClick={() => handleView(model.id)}
                              >
                                <VisibilityIcon />
                              </IconButton>
                            </Tooltip>
                            {model.status === 'ready' && (
                              <Tooltip title="Export YAML">
                                <IconButton
                                  size="small"
                                  onClick={() => handleExport(model)}
                                >
                                  <DownloadIcon />
                                </IconButton>
                              </Tooltip>
                            )}
                            {canDelete && (
                              <Tooltip title="Delete model">
                                <IconButton
                                  size="small"
                                  onClick={() => handleDeleteClick(model)}
                                  color="error"
                                >
                                  <DeleteIcon />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                component="div"
                count={total}
                page={page - 1}
                onPageChange={handlePageChange}
                rowsPerPage={pageSize}
                onRowsPerPageChange={handleRowsPerPageChange}
                rowsPerPageOptions={[10, 20, 50]}
              />
            </>
          )}
        </Paper>
      </Box>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>

      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
      >
        <DialogTitle>Delete Semantic Model</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete the semantic model "{modelToDelete?.name}"? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
