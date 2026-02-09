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
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { useOntologies } from '../hooks/useOntologies';
import { usePermissions } from '../hooks/usePermissions';
import { CreateOntologyDialog } from '../components/ontologies/CreateOntologyDialog';
import type { Ontology, OntologyStatus } from '../types';

const STATUS_CONFIG: Record<
  OntologyStatus,
  { label: string; color: 'default' | 'warning' | 'success' | 'error' }
> = {
  creating: { label: 'Creating', color: 'warning' },
  ready: { label: 'Ready', color: 'success' },
  failed: { label: 'Failed', color: 'error' },
};

const STATUS_OPTIONS: OntologyStatus[] = ['creating', 'ready', 'failed'];

export default function OntologiesPage() {
  const navigate = useNavigate();
  const {
    ontologies,
    total,
    page,
    pageSize,
    isLoading,
    error,
    fetchOntologies,
    deleteOntology,
  } = useOntologies();

  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('ontologies:write');
  const canDelete = hasPermission('ontologies:delete');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ontologyToDelete, setOntologyToDelete] = useState<Ontology | null>(null);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    fetchOntologies({
      page,
      pageSize,
      search: search || undefined,
      status: statusFilter || undefined,
    });
  }, [page, pageSize, search, statusFilter, fetchOntologies]);

  const handlePageChange = (_: unknown, newPage: number) => {
    fetchOntologies({
      page: newPage + 1,
      pageSize,
      search: search || undefined,
      status: statusFilter || undefined,
    });
  };

  const handleRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newPageSize = parseInt(event.target.value, 10);
    fetchOntologies({
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
    navigate(`/ontologies/${id}`);
  };

  const handleCreateClick = () => {
    setCreateDialogOpen(true);
  };

  const handleCreateSuccess = async () => {
    setSnackbar({
      open: true,
      message: 'Ontology created successfully',
      severity: 'success',
    });
    await fetchOntologies({
      page,
      pageSize,
      search: search || undefined,
      status: statusFilter || undefined,
    });
  };

  const handleDeleteClick = (ontology: Ontology) => {
    setOntologyToDelete(ontology);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!ontologyToDelete) return;

    try {
      await deleteOntology(ontologyToDelete.id);
      setSnackbar({
        open: true,
        message: 'Ontology deleted successfully',
        severity: 'success',
      });
    } catch (err) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : 'Failed to delete ontology',
        severity: 'error',
      });
    } finally {
      setDeleteDialogOpen(false);
      setOntologyToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setOntologyToDelete(null);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h4" component="h1" gutterBottom>
            Ontologies
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Browse and manage knowledge graph ontologies
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
            {canWrite && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleCreateClick}
              >
                New Ontology
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
          ) : ontologies.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">
                {search || statusFilter ? 'No ontologies found matching your filters' : 'No ontologies found'}
              </Typography>
            </Box>
          ) : (
            <>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Semantic Model</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Nodes</TableCell>
                      <TableCell align="right">Relationships</TableCell>
                      <TableCell>Created</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {ontologies.map((ontology) => (
                      <TableRow key={ontology.id} hover>
                        <TableCell>
                          <Box>
                            <Typography
                              variant="body2"
                              sx={{
                                cursor: 'pointer',
                                '&:hover': { textDecoration: 'underline' },
                              }}
                              onClick={() => handleView(ontology.id)}
                            >
                              {ontology.name}
                            </Typography>
                            {ontology.description && (
                              <Typography variant="caption" color="text.secondary">
                                {ontology.description}
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          {ontology.semanticModel
                            ? ontology.semanticModel.name
                            : '-'}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={STATUS_CONFIG[ontology.status].label}
                            color={STATUS_CONFIG[ontology.status].color}
                            size="small"
                          />
                        </TableCell>
                        <TableCell align="right">{ontology.nodeCount}</TableCell>
                        <TableCell align="right">
                          {ontology.relationshipCount}
                        </TableCell>
                        <TableCell>{formatDate(ontology.createdAt)}</TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                            <Tooltip title="View details">
                              <IconButton
                                size="small"
                                onClick={() => handleView(ontology.id)}
                              >
                                <VisibilityIcon />
                              </IconButton>
                            </Tooltip>
                            {canDelete && (
                              <Tooltip title="Delete ontology">
                                <IconButton
                                  size="small"
                                  onClick={() => handleDeleteClick(ontology)}
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

      <CreateOntologyDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onCreated={handleCreateSuccess}
      />

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

      <Dialog open={deleteDialogOpen} onClose={handleDeleteCancel}>
        <DialogTitle>Delete Ontology</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete the ontology "{ontologyToDelete?.name}"? This action cannot be undone.
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
