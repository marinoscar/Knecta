import { useState, useEffect, useCallback } from 'react';
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
  Tab,
  Tabs,
} from '@mui/material';
import {
  Add as AddIcon,
  Visibility as VisibilityIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
  Replay as ReplayIcon,
} from '@mui/icons-material';
import { useSemanticModels } from '../hooks/useSemanticModels';
import { usePermissions } from '../hooks/usePermissions';
import { listAllRuns, deleteSemanticModelRun, cancelSemanticModelRun } from '../services/api';
import type { SemanticModel, SemanticModelStatus, SemanticModelRun } from '../types';

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

const RUN_STATUS_CONFIG: Record<
  string,
  { label: string; color: 'default' | 'warning' | 'success' | 'error' | 'info' }
> = {
  pending: { label: 'Pending', color: 'default' },
  planning: { label: 'Planning', color: 'info' },
  awaiting_approval: { label: 'Awaiting Approval', color: 'info' },
  executing: { label: 'Executing', color: 'warning' },
  completed: { label: 'Completed', color: 'success' },
  failed: { label: 'Failed', color: 'error' },
  cancelled: { label: 'Cancelled', color: 'default' },
};

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

  const [activeTab, setActiveTab] = useState(0);
  const [runs, setRuns] = useState<SemanticModelRun[]>([]);
  const [runsTotal, setRunsTotal] = useState(0);
  const [runsPage, setRunsPage] = useState(1);
  const [runsPageSize, setRunsPageSize] = useState(20);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsStatusFilter, setRunsStatusFilter] = useState<string>('');
  const [runToDelete, setRunToDelete] = useState<SemanticModelRun | null>(null);
  const [deleteRunDialogOpen, setDeleteRunDialogOpen] = useState(false);

  useEffect(() => {
    fetchModels({
      page,
      pageSize,
      search: search || undefined,
      status: statusFilter || undefined,
    });
  }, [page, pageSize, search, statusFilter, fetchModels]);

  const fetchRunsData = useCallback(async () => {
    setRunsLoading(true);
    try {
      const result = await listAllRuns({
        page: runsPage,
        pageSize: runsPageSize,
        status: runsStatusFilter || undefined,
      });
      setRuns(result.runs);
      setRunsTotal(result.total);
    } catch (err) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : 'Failed to fetch runs',
        severity: 'error',
      });
    } finally {
      setRunsLoading(false);
    }
  }, [runsPage, runsPageSize, runsStatusFilter]);

  useEffect(() => {
    if (activeTab === 1) {
      fetchRunsData();
    }
  }, [activeTab, fetchRunsData]);

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

  const handleRetryRun = (run: SemanticModelRun) => {
    navigate('/semantic-models/new', {
      state: {
        retryRun: {
          connectionId: run.connectionId,
          databaseName: run.databaseName,
          selectedSchemas: run.selectedSchemas,
          selectedTables: run.selectedTables,
        },
      },
    });
  };

  const handleDeleteRunClick = (run: SemanticModelRun) => {
    setRunToDelete(run);
    setDeleteRunDialogOpen(true);
  };

  const handleDeleteRunConfirm = async () => {
    if (!runToDelete) return;
    try {
      await deleteSemanticModelRun(runToDelete.id);
      setSnackbar({ open: true, message: 'Run deleted successfully', severity: 'success' });
      fetchRunsData();
    } catch (err) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : 'Failed to delete run',
        severity: 'error',
      });
    } finally {
      setDeleteRunDialogOpen(false);
      setRunToDelete(null);
    }
  };

  const handleDeleteRunCancel = () => {
    setDeleteRunDialogOpen(false);
    setRunToDelete(null);
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

        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 2 }}>
          <Tab label="Models" />
          <Tab label="Runs" />
        </Tabs>

        {activeTab === 0 && (
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
        )}

        {activeTab === 1 && (
          <Paper>
            <Box sx={{ p: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>Status</InputLabel>
                <Select
                  value={runsStatusFilter}
                  onChange={(e) => setRunsStatusFilter(e.target.value)}
                  label="Status"
                >
                  <MenuItem value="">All</MenuItem>
                  {Object.entries(RUN_STATUS_CONFIG).map(([key, config]) => (
                    <MenuItem key={key} value={key}>{config.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            {runsLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
              </Box>
            ) : runs.length === 0 ? (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography color="text.secondary">
                  {runsStatusFilter ? 'No runs found matching your filter' : 'No runs found'}
                </Typography>
              </Box>
            ) : (
              <>
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Database</TableCell>
                        <TableCell>Tables</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Error</TableCell>
                        <TableCell>Created</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {runs.map((run) => (
                        <TableRow key={run.id} hover>
                          <TableCell>{run.databaseName}</TableCell>
                          <TableCell>{run.selectedTables.length}</TableCell>
                          <TableCell>
                            <Chip
                              label={RUN_STATUS_CONFIG[run.status]?.label || run.status}
                              color={RUN_STATUS_CONFIG[run.status]?.color || 'default'}
                              size="small"
                            />
                          </TableCell>
                          <TableCell>
                            {run.errorMessage ? (
                              <Tooltip title={run.errorMessage}>
                                <Typography variant="caption" color="error" noWrap sx={{ maxWidth: 200, display: 'block' }}>
                                  {run.errorMessage}
                                </Typography>
                              </Tooltip>
                            ) : '-'}
                          </TableCell>
                          <TableCell>{formatDate(run.createdAt)}</TableCell>
                          <TableCell align="right">
                            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                              {run.status === 'completed' && run.semanticModelId && (
                                <Tooltip title="View Model">
                                  <IconButton size="small" onClick={() => navigate(`/semantic-models/${run.semanticModelId}`)}>
                                    <VisibilityIcon />
                                  </IconButton>
                                </Tooltip>
                              )}
                              {['failed', 'cancelled'].includes(run.status) && canGenerate && (
                                <Tooltip title="Retry">
                                  <IconButton size="small" onClick={() => handleRetryRun(run)}>
                                    <ReplayIcon />
                                  </IconButton>
                                </Tooltip>
                              )}
                              {['failed', 'cancelled'].includes(run.status) && canDelete && (
                                <Tooltip title="Delete run">
                                  <IconButton size="small" onClick={() => handleDeleteRunClick(run)} color="error">
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
                  count={runsTotal}
                  page={runsPage - 1}
                  onPageChange={(_, newPage) => setRunsPage(newPage + 1)}
                  rowsPerPage={runsPageSize}
                  onRowsPerPageChange={(e) => {
                    setRunsPageSize(parseInt(e.target.value, 10));
                    setRunsPage(1);
                  }}
                  rowsPerPageOptions={[10, 20, 50]}
                />
              </>
            )}
          </Paper>
        )}
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

      <Dialog open={deleteRunDialogOpen} onClose={handleDeleteRunCancel}>
        <DialogTitle>Delete Run</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this run? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteRunCancel}>Cancel</Button>
          <Button onClick={handleDeleteRunConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
