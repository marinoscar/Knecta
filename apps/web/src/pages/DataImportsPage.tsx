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
  Visibility as ViewIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { useDataImports } from '../hooks/useDataImports';
import { usePermissions } from '../hooks/usePermissions';
import { DataImportStatusChip } from '../components/data-imports/DataImportStatusChip';
import type {
  DataImport,
  DataImportStatus,
} from '../types';

const STATUS_OPTIONS: DataImportStatus[] = [
  'draft', 'pending', 'importing', 'ready', 'partial', 'failed',
];

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

  useEffect(() => {
    fetchImports({
      page,
      pageSize,
      search: search || undefined,
      status: statusFilter || undefined,
    });
  }, [page, pageSize, search, statusFilter, fetchImports]);

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
    </Container>
  );
}
