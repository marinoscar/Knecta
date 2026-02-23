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
import { useSpreadsheetProjects } from '../hooks/useSpreadsheetProjects';
import { usePermissions } from '../hooks/usePermissions';
import type { SpreadsheetProject, SpreadsheetProjectStatus } from '../types';

const STATUS_CONFIG: Record<
  SpreadsheetProjectStatus,
  { label: string; color: 'default' | 'info' | 'warning' | 'success' | 'error' }
> = {
  draft: { label: 'Draft', color: 'default' },
  processing: { label: 'Processing', color: 'info' },
  review_pending: { label: 'Review Pending', color: 'warning' },
  ready: { label: 'Ready', color: 'success' },
  failed: { label: 'Failed', color: 'error' },
  partial: { label: 'Partial', color: 'warning' },
};

const STATUS_OPTIONS: SpreadsheetProjectStatus[] = [
  'draft', 'processing', 'review_pending', 'ready', 'failed', 'partial',
];

export default function SpreadsheetAgentPage() {
  const navigate = useNavigate();
  const {
    projects,
    total,
    page,
    pageSize,
    isLoading,
    error,
    fetchProjects,
    deleteProject,
  } = useSpreadsheetProjects();

  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('spreadsheet_agent:write');
  const canDelete = hasPermission('spreadsheet_agent:delete');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<SpreadsheetProject | null>(null);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    fetchProjects({
      page,
      pageSize,
      search: search || undefined,
      status: statusFilter || undefined,
    });
  }, [page, pageSize, search, statusFilter, fetchProjects]);

  const handlePageChange = (_: unknown, newPage: number) => {
    fetchProjects({
      page: newPage + 1,
      pageSize,
      search: search || undefined,
      status: statusFilter || undefined,
    });
  };

  const handleRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newPageSize = parseInt(event.target.value, 10);
    fetchProjects({
      page: 1,
      pageSize: newPageSize,
      search: search || undefined,
      status: statusFilter || undefined,
    });
  };

  const handleDeleteClick = (project: SpreadsheetProject) => {
    setProjectToDelete(project);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!projectToDelete) return;
    try {
      await deleteProject(projectToDelete.id);
      setSnackbar({ open: true, message: 'Project deleted successfully', severity: 'success' });
    } catch (err) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : 'Failed to delete project',
        severity: 'error',
      });
    } finally {
      setDeleteDialogOpen(false);
      setProjectToDelete(null);
    }
  };

  const formatDate = (dateString: string) => new Date(dateString).toLocaleString();

  const formatRows = (rows: number) => rows.toLocaleString();

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h4" component="h1" gutterBottom>
            Spreadsheet Agent
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Upload spreadsheets, analyze structure, and extract clean data tables
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
              placeholder="Search by name or description"
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
                    {STATUS_CONFIG[status].label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Box sx={{ flexGrow: 1 }} />
            {canWrite && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => navigate('/spreadsheets/new')}
              >
                New Project
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
          ) : projects.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">
                {search || statusFilter
                  ? 'No projects found matching your filters'
                  : 'No spreadsheet projects yet. Create one to get started!'}
              </Typography>
            </Box>
          ) : (
            <>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Files</TableCell>
                      <TableCell align="right">Tables</TableCell>
                      <TableCell align="right">Rows</TableCell>
                      <TableCell>Review Mode</TableCell>
                      <TableCell>Updated</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {projects.map((project) => (
                      <TableRow key={project.id} hover>
                        <TableCell>
                          <Box>
                            <Typography variant="body2">{project.name}</Typography>
                            {project.description && (
                              <Typography variant="caption" color="text.secondary">
                                {project.description}
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={STATUS_CONFIG[project.status]?.label || project.status}
                            color={STATUS_CONFIG[project.status]?.color || 'default'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell align="right">{project.fileCount}</TableCell>
                        <TableCell align="right">{project.tableCount}</TableCell>
                        <TableCell align="right">{formatRows(project.totalRows)}</TableCell>
                        <TableCell>
                          <Chip
                            label={project.reviewMode === 'review' ? 'Manual Review' : 'Auto'}
                            size="small"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>{formatDate(project.updatedAt)}</TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                            <Tooltip title="View project">
                              <IconButton
                                size="small"
                                onClick={() => navigate(`/spreadsheets/${project.id}`)}
                              >
                                <ViewIcon />
                              </IconButton>
                            </Tooltip>
                            {canDelete && (
                              <Tooltip title="Delete project">
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => handleDeleteClick(project)}
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
          setProjectToDelete(null);
        }}
      >
        <DialogTitle>Delete Project</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete "{projectToDelete?.name}"? This will remove all files,
            tables, and runs. This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDeleteDialogOpen(false);
              setProjectToDelete(null);
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
