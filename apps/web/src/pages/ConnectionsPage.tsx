import { useState, useEffect } from 'react';
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
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  PlayArrow as PlayArrowIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { useConnections } from '../hooks/useConnections';
import { usePermissions } from '../hooks/usePermissions';
import type { DataConnection, DatabaseType, CreateConnectionPayload } from '../types';
import { ConnectionDialog } from '../components/connections/ConnectionDialog';

const DB_TYPE_CONFIG: Record<
  DatabaseType,
  { label: string; color: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success' | 'default' }
> = {
  postgresql: { label: 'PostgreSQL', color: 'primary' },
  mysql: { label: 'MySQL', color: 'warning' },
  sqlserver: { label: 'SQL Server', color: 'error' },
  databricks: { label: 'Databricks', color: 'secondary' },
  snowflake: { label: 'Snowflake', color: 'info' },
};

const DB_TYPE_OPTIONS: DatabaseType[] = ['postgresql', 'mysql', 'sqlserver', 'databricks', 'snowflake'];

export default function ConnectionsPage() {
  const {
    connections,
    total,
    page,
    pageSize,
    isLoading,
    error,
    fetchConnections,
    createConnection,
    updateConnection,
    deleteConnection,
    testConnection,
    testNewConnection,
  } = useConnections();

  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('connections:write');
  const canDelete = hasPermission('connections:delete');
  const canTest = hasPermission('connections:test');

  const [search, setSearch] = useState('');
  const [dbTypeFilter, setDbTypeFilter] = useState<string>('');
  const [testingId, setTestingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<DataConnection | null>(null);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    fetchConnections({
      page,
      pageSize,
      search: search || undefined,
      dbType: dbTypeFilter || undefined,
    });
  }, [page, pageSize, search, dbTypeFilter, fetchConnections]);

  const handlePageChange = (_: unknown, newPage: number) => {
    fetchConnections({
      page: newPage + 1,
      pageSize,
      search: search || undefined,
      dbType: dbTypeFilter || undefined,
    });
  };

  const handleRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newPageSize = parseInt(event.target.value, 10);
    fetchConnections({
      page: 1,
      pageSize: newPageSize,
      search: search || undefined,
      dbType: dbTypeFilter || undefined,
    });
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
  };

  const handleDbTypeFilterChange = (value: string) => {
    setDbTypeFilter(value);
  };

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete connection "${name}"?`)) {
      try {
        await deleteConnection(id);
        setSnackbar({
          open: true,
          message: 'Connection deleted successfully',
          severity: 'success',
        });
      } catch (err) {
        setSnackbar({
          open: true,
          message: err instanceof Error ? err.message : 'Failed to delete connection',
          severity: 'error',
        });
      }
    }
  };

  const handleTest = async (id: string, name: string) => {
    setTestingId(id);
    try {
      const result = await testConnection(id);
      setSnackbar({
        open: true,
        message: result.success
          ? `Connection "${name}" successful (${result.latencyMs}ms)`
          : `Connection "${name}" failed: ${result.message}`,
        severity: result.success ? 'success' : 'error',
      });
      // Refresh the list to update test results
      await fetchConnections({
        page,
        pageSize,
        search: search || undefined,
        dbType: dbTypeFilter || undefined,
      });
    } catch (err) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : 'Failed to test connection',
        severity: 'error',
      });
    } finally {
      setTestingId(null);
    }
  };

  const getStatusChip = (connection: DataConnection) => {
    if (connection.lastTestResult === null) {
      return <Chip label="Untested" size="small" />;
    }
    if (connection.lastTestResult) {
      return <Chip label="Connected" color="success" size="small" />;
    }
    return (
      <Tooltip title={connection.lastTestMessage || 'Connection failed'}>
        <Chip label="Failed" color="error" size="small" />
      </Tooltip>
    );
  };

  const formatLastTested = (lastTestedAt: string | null) => {
    if (!lastTestedAt) return '-';
    return new Date(lastTestedAt).toLocaleString();
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h4" component="h1" gutterBottom>
            Database Connections
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage your database connection configurations
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
              <InputLabel>Database Type</InputLabel>
              <Select
                value={dbTypeFilter}
                onChange={(e) => handleDbTypeFilterChange(e.target.value)}
                label="Database Type"
              >
                <MenuItem value="">All</MenuItem>
                {DB_TYPE_OPTIONS.map((type) => (
                  <MenuItem key={type} value={type}>
                    {DB_TYPE_CONFIG[type].label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Box sx={{ flexGrow: 1 }} />
            {canWrite && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => {
                  setEditingConnection(null);
                  setDialogOpen(true);
                }}
              >
                Add Connection
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
          ) : connections.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">
                {search || dbTypeFilter ? 'No connections found matching your filters' : 'No connections found'}
              </Typography>
            </Box>
          ) : (
            <>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Host</TableCell>
                      <TableCell>Database</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Last Tested</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {connections.map((connection) => (
                      <TableRow key={connection.id} hover>
                        <TableCell>
                          <Box>
                            <Typography variant="body2">{connection.name}</Typography>
                            {connection.description && (
                              <Typography variant="caption" color="text.secondary">
                                {connection.description}
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={DB_TYPE_CONFIG[connection.dbType].label}
                            color={DB_TYPE_CONFIG[connection.dbType].color}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          {connection.host}:{connection.port}
                        </TableCell>
                        <TableCell>{connection.databaseName || '-'}</TableCell>
                        <TableCell>{getStatusChip(connection)}</TableCell>
                        <TableCell>{formatLastTested(connection.lastTestedAt)}</TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                            {canTest && (
                              <Tooltip title="Test connection">
                                <span>
                                  <IconButton
                                    size="small"
                                    onClick={() => handleTest(connection.id, connection.name)}
                                    disabled={testingId === connection.id}
                                  >
                                    {testingId === connection.id ? (
                                      <CircularProgress size={20} />
                                    ) : (
                                      <PlayArrowIcon />
                                    )}
                                  </IconButton>
                                </span>
                              </Tooltip>
                            )}
                            {canWrite && (
                              <Tooltip title="Edit connection">
                                <IconButton
                                  size="small"
                                  onClick={() => {
                                    setEditingConnection(connection);
                                    setDialogOpen(true);
                                  }}
                                >
                                  <EditIcon />
                                </IconButton>
                              </Tooltip>
                            )}
                            {canDelete && (
                              <Tooltip title="Delete connection">
                                <IconButton
                                  size="small"
                                  onClick={() => handleDelete(connection.id, connection.name)}
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

      <ConnectionDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditingConnection(null);
        }}
        onSave={async (data) => {
          if (editingConnection) {
            await updateConnection(editingConnection.id, data);
            setSnackbar({ open: true, message: 'Connection updated successfully', severity: 'success' });
          } else {
            await createConnection(data as CreateConnectionPayload);
            setSnackbar({ open: true, message: 'Connection created successfully', severity: 'success' });
          }
        }}
        onTestNew={testNewConnection}
        connection={editingConnection}
      />
    </Container>
  );
}
