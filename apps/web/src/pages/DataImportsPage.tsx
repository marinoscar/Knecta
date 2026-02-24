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
  LinearProgress,
} from '@mui/material';
import {
  Add as AddIcon,
  Visibility as ViewIcon,
  Delete as DeleteIcon,
  Replay as RetryIcon,
} from '@mui/icons-material';
import { useDataImports } from '../hooks/useDataImports';
import { usePermissions } from '../hooks/usePermissions';
import {
  listAllDataImportRuns,
  deleteDataImportRun,
} from '../services/api';
import { DataImportStatusChip } from '../components/data-imports/DataImportStatusChip';
import type {
  DataImport,
  DataImportStatus,
  DataImportRun,
  DataImportRunStatus,
} from '../types';

const STATUS_OPTIONS: DataImportStatus[] = [
  'draft', 'pending', 'importing', 'ready', 'partial', 'failed',
];

const RUN_STATUS_CONFIG: Record<
  DataImportRunStatus,
  { label: string; color: 'default' | 'info' | 'warning' | 'success' | 'error' }
> = {
  pending: { label: 'Pending', color: 'default' },
  parsing: { label: 'Parsing', color: 'info' },
  converting: { label: 'Converting', color: 'info' },
  uploading: { label: 'Uploading', color: 'info' },
  connecting: { label: 'Connecting', color: 'info' },
  completed: { label: 'Completed', color: 'success' },
  failed: { label: 'Failed', color: 'error' },
  cancelled: { label: 'Cancelled', color: 'default' },
};

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) return '-';
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DataImportsPage() {
  const navigate = useNavigate();
  const {
    imports,
    total,
    page,
    pageSize,
    isLoading,
    error,
    fetchImports,
    deleteImport,
  } = useDataImports();

  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('data_imports:write');
  const canDelete = hasPermission('data_imports:delete');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [importToDelete, setImportToDelete] = useState<DataImport | null>(null);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });

  const [activeTab, setActiveTab] = useState(0);
  const [runs, setRuns] = useState<DataImportRun[]>([]);
  const [runsTotal, setRunsTotal] = useState(0);
  const [runsPage, setRunsPage] = useState(1);
  const [runsPageSize, setRunsPageSize] = useState(20);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsStatusFilter, setRunsStatusFilter] = useState<string>('');
  const [runToDelete, setRunToDelete] = useState<DataImportRun | null>(null);
  const [deleteRunDialogOpen, setDeleteRunDialogOpen] = useState(false);

  useEffect(() => {
    fetchImports({
      page,
      pageSize,
      search: search || undefined,
      status: statusFilter || undefined,
    });
  }, [page, pageSize, search, statusFilter, fetchImports]);

  const fetchRunsData = useCallback(async () => {
    setRunsLoading(true);
    try {
      const result = await listAllDataImportRuns({
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
    if (activeTab === 1) fetchRunsData();
  }, [activeTab, fetchRunsData]);

  const handlePageChange = (_: unknown, newPage: number) => {
    fetchImports({
      page: newPage + 1,
      pageSize,
      search: search || undefined,
      status: statusFilter || undefined,
    });
  };

  const handleRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newPageSize = parseInt(event.target.value, 10);
    fetchImports({
      page: 1,
      pageSize: newPageSize,
      search: search || undefined,
      status: statusFilter || undefined,
    });
  };

  const handleDeleteClick = (dataImport: DataImport) => {
    setImportToDelete(dataImport);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!importToDelete) return;
    try {
      await deleteImport(importToDelete.id);
      setSnackbar({ open: true, message: 'Import deleted successfully', severity: 'success' });
    } catch (err) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : 'Failed to delete import',
        severity: 'error',
      });
    } finally {
      setDeleteDialogOpen(false);
      setImportToDelete(null);
    }
  };

  const handleDeleteRunClick = (run: DataImportRun) => {
    setRunToDelete(run);
    setDeleteRunDialogOpen(true);
  };

  const handleDeleteRunConfirm = async () => {
    if (!runToDelete) return;
    try {
      await deleteDataImportRun(runToDelete.id);
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

  const formatDate = (dateString: string) => new Date(dateString).toLocaleString();

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h4" component="h1" gutterBottom>
            Data Import
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Upload CSV or Excel files, configure parsing, and import clean Parquet tables
          </Typography>
        </Box>

        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 2 }}>
          <Tab label="Imports" />
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
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or file"
                sx={{ minWidth: 250 }}
              />
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>Status</InputLabel>
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  label="Status"
                >
                  <MenuItem value="">All</MenuItem>
                  {STATUS_OPTIONS.map((status) => (
                    <MenuItem key={status} value={status}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Box sx={{ flexGrow: 1 }} />
              {canWrite && (
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => navigate('/data-imports/new')}
                >
                  New Import
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
            ) : imports.length === 0 ? (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography color="text.secondary">
                  {search || statusFilter
                    ? 'No imports found matching your filters'
                    : 'No imports yet. Create one to get started!'}
                </Typography>
              </Box>
            ) : (
              <>
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell>Source File</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell align="right">Rows</TableCell>
                        <TableCell align="right">Size</TableCell>
                        <TableCell>Created</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {imports.map((imp) => (
                        <TableRow key={imp.id} hover>
                          <TableCell>
                            <Typography variant="body2" fontWeight="medium">
                              {imp.name}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 200 }}>
                              {imp.sourceFileName}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={imp.sourceFileType.toUpperCase()}
                              size="small"
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell>
                            <DataImportStatusChip status={imp.status} />
                          </TableCell>
                          <TableCell align="right">
                            {imp.totalRowCount != null
                              ? imp.totalRowCount.toLocaleString()
                              : '-'}
                          </TableCell>
                          <TableCell align="right">
                            {formatBytes(imp.totalSizeBytes)}
                          </TableCell>
                          <TableCell>{formatDate(imp.createdAt)}</TableCell>
                          <TableCell align="right">
                            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                              <Tooltip title="View import">
                                <IconButton
                                  size="small"
                                  onClick={() => navigate(`/data-imports/${imp.id}`)}
                                >
                                  <ViewIcon />
                                </IconButton>
                              </Tooltip>
                              {canDelete && (
                                <Tooltip title="Delete import">
                                  <IconButton
                                    size="small"
                                    color="error"
                                    onClick={() => handleDeleteClick(imp)}
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
                    <MenuItem key={key} value={key}>
                      {config.label}
                    </MenuItem>
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
                        <TableCell>Import</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Phase</TableCell>
                        <TableCell>Progress</TableCell>
                        <TableCell>Duration</TableCell>
                        <TableCell>Created</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {runs.map((run) => {
                        const statusConfig = RUN_STATUS_CONFIG[run.status] ?? {
                          label: run.status,
                          color: 'default' as const,
                        };
                        const pct = run.progress?.percentComplete;
                        return (
                          <TableRow key={run.id} hover>
                            <TableCell>
                              <Typography variant="body2" noWrap sx={{ maxWidth: 180 }}>
                                {run.importId}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={statusConfig.label}
                                color={statusConfig.color}
                                size="small"
                              />
                            </TableCell>
                            <TableCell>
                              {run.currentPhase ? (
                                <Typography variant="caption" color="text.secondary">
                                  {run.currentPhase}
                                </Typography>
                              ) : (
                                '-'
                              )}
                            </TableCell>
                            <TableCell sx={{ minWidth: 120 }}>
                              {pct != null ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <LinearProgress
                                    variant="determinate"
                                    value={pct}
                                    sx={{ flexGrow: 1, height: 6, borderRadius: 3 }}
                                  />
                                  <Typography variant="caption">{pct}%</Typography>
                                </Box>
                              ) : (
                                '-'
                              )}
                            </TableCell>
                            <TableCell>
                              {formatDuration(run.startedAt, run.completedAt)}
                            </TableCell>
                            <TableCell>{formatDate(run.createdAt)}</TableCell>
                            <TableCell align="right">
                              <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                                <Tooltip title="View import">
                                  <IconButton
                                    size="small"
                                    onClick={() => navigate(`/data-imports/${run.importId}`)}
                                  >
                                    <ViewIcon />
                                  </IconButton>
                                </Tooltip>
                                {canWrite && ['failed', 'cancelled'].includes(run.status) && (
                                  <Tooltip title="Retry">
                                    <IconButton
                                      size="small"
                                      onClick={() => navigate(`/data-imports/${run.importId}`)}
                                    >
                                      <RetryIcon />
                                    </IconButton>
                                  </Tooltip>
                                )}
                                {canDelete && ['failed', 'cancelled'].includes(run.status) && (
                                  <Tooltip title="Delete run">
                                    <IconButton
                                      size="small"
                                      color="error"
                                      onClick={() => handleDeleteRunClick(run)}
                                    >
                                      <DeleteIcon />
                                    </IconButton>
                                  </Tooltip>
                                )}
                              </Box>
                            </TableCell>
                          </TableRow>
                        );
                      })}
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
        onClose={() => {
          setDeleteDialogOpen(false);
          setImportToDelete(null);
        }}
      >
        <DialogTitle>Delete Import</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete "{importToDelete?.name}"? This will remove all
            associated data and runs. This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDeleteDialogOpen(false);
              setImportToDelete(null);
            }}
          >
            Cancel
          </Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={deleteRunDialogOpen}
        onClose={() => {
          setDeleteRunDialogOpen(false);
          setRunToDelete(null);
        }}
      >
        <DialogTitle>Delete Run</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this run? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDeleteRunDialogOpen(false);
              setRunToDelete(null);
            }}
          >
            Cancel
          </Button>
          <Button onClick={handleDeleteRunConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
