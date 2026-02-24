import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Paper,
  Tabs,
  Tab,
  Button,
  Chip,
  Alert,
  AlertTitle,
  Snackbar,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Grid,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  PlayArrow as RunIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { DataImportStatusChip } from '../components/data-imports/DataImportStatusChip';
import { DataImportRunHistory } from '../components/data-imports/RunHistory';
import { ImportProgressView } from '../components/data-imports/ImportProgressView';
import { useDataImportRun } from '../hooks/useDataImportRun';
import { usePermissions } from '../hooks/usePermissions';
import {
  getDataImport,
  getDataImportRuns,
  createDataImportRun,
  deleteDataImportRun,
  deleteDataImport,
} from '../services/api';
import type { DataImport, DataImportRun } from '../types';

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DataImportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('data_imports:write');
  const canDelete = hasPermission('data_imports:delete');

  const [dataImport, setDataImport] = useState<DataImport | null>(null);
  const [runs, setRuns] = useState<DataImportRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });

  const fetchImport = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const imp = await getDataImport(id);
      setDataImport(imp);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load import');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  const fetchRuns = useCallback(async () => {
    if (!id) return;
    setRunsLoading(true);
    try {
      const result = await getDataImportRuns(id);
      setRuns(result.runs);
    } catch (err) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : 'Failed to load runs',
        severity: 'error',
      });
    } finally {
      setRunsLoading(false);
    }
  }, [id]);

  const runHook = useDataImportRun({
    onStreamEnd: () => {
      fetchImport();
      fetchRuns();
    },
  });

  useEffect(() => {
    fetchImport();
  }, [fetchImport]);

  useEffect(() => {
    if (activeTab === 1) fetchRuns();
  }, [activeTab, fetchRuns]);

  // Load runs on mount for error detail display
  useEffect(() => {
    if (dataImport?.status === 'failed') {
      fetchRuns();
    }
  }, [dataImport?.status, fetchRuns]);

  const handleStartRun = async () => {
    if (!id) return;
    try {
      const run = await createDataImportRun(id);
      setRuns((prev) => [run, ...prev]);
      runHook.startStream(run.id);
      setSnackbar({ open: true, message: 'Import run started', severity: 'success' });
    } catch (err) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : 'Failed to start run',
        severity: 'error',
      });
    }
  };

  const handleDeleteRun = async (runId: string) => {
    try {
      await deleteDataImportRun(runId);
      setSnackbar({ open: true, message: 'Run deleted', severity: 'success' });
      fetchRuns();
    } catch (err) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : 'Failed to delete run',
        severity: 'error',
      });
    }
  };

  const handleDeleteImport = async () => {
    if (!id) return;
    try {
      await deleteDataImport(id);
      navigate('/data-imports');
    } catch (err) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : 'Failed to delete import',
        severity: 'error',
      });
      setDeleteDialogOpen(false);
    }
  };

  if (isLoading) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 8 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (!dataImport) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ py: 4 }}>
          <Alert severity="error">{error || 'Import not found'}</Alert>
          <Button startIcon={<BackIcon />} onClick={() => navigate('/data-imports')} sx={{ mt: 2 }}>
            Back to Imports
          </Button>
        </Box>
      </Container>
    );
  }

  const canRunImport = ['draft', 'failed', 'partial'].includes(dataImport.status);
  const isActiveImport = dataImport.status === 'importing';

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 3 }}>
          <Button startIcon={<BackIcon />} onClick={() => navigate('/data-imports')}>
            Back
          </Button>
          <Box sx={{ flexGrow: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Typography variant="h5" component="h1">
                {dataImport.name}
              </Typography>
              <DataImportStatusChip status={dataImport.status} />
              <Chip
                label={dataImport.sourceFileType.toUpperCase()}
                size="small"
                variant="outlined"
              />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {dataImport.sourceFileName}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
            {canWrite && canRunImport && !isActiveImport && !runHook.isStreaming && (
              <Button
                variant="contained"
                startIcon={<RunIcon />}
                onClick={handleStartRun}
              >
                Run Import
              </Button>
            )}
            {canDelete && (
              <Button
                variant="outlined"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={() => setDeleteDialogOpen(true)}
                disabled={isActiveImport || runHook.isStreaming}
              >
                Delete
              </Button>
            )}
          </Box>
        </Box>

        {/* Stats row */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} sm={3}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h5">
                {dataImport.totalRowCount != null
                  ? dataImport.totalRowCount.toLocaleString()
                  : '-'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total Rows
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h5">
                {dataImport.outputTables != null ? dataImport.outputTables.length : '-'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Output Tables
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h5">{formatBytes(dataImport.sourceFileSizeBytes)}</Typography>
              <Typography variant="body2" color="text.secondary">
                Source Size
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h5">{formatBytes(dataImport.totalSizeBytes)}</Typography>
              <Typography variant="body2" color="text.secondary">
                Output Size
              </Typography>
            </Paper>
          </Grid>
        </Grid>

        {/* SSE streaming progress */}
        {(runHook.isStreaming || runHook.events.length > 0) && (
          <Paper sx={{ p: 3, mb: 3 }}>
            <ImportProgressView
              events={runHook.events}
              progress={runHook.progress}
              isStreaming={runHook.isStreaming}
              startTime={runHook.streamStartTime}
            />
          </Paper>
        )}

        {/* Error details */}
        {dataImport.status === 'failed' && !runHook.isStreaming && (
          <Alert severity="error" sx={{ mb: 3 }}>
            <AlertTitle>Import Failed</AlertTitle>
            {dataImport.errorMessage ||
              runs.find((r) => r.status === 'failed')?.errorMessage ||
              'The import pipeline failed. Check the Runs tab for details.'}
          </Alert>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 2 }}>
          <Tab label="Tables" />
          <Tab label="Runs" />
          <Tab label="Config" />
        </Tabs>

        <Paper>
          {/* Tab 0: Output Tables */}
          {activeTab === 0 && (
            <>
              {!dataImport.outputTables || dataImport.outputTables.length === 0 ? (
                <Box sx={{ p: 4, textAlign: 'center' }}>
                  <Typography color="text.secondary">
                    {['draft', 'pending', 'importing'].includes(dataImport.status)
                      ? 'Output tables will appear here after the import completes.'
                      : 'No output tables found.'}
                  </Typography>
                </Box>
              ) : (
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Table Name</TableCell>
                        <TableCell align="right">Rows</TableCell>
                        <TableCell align="right">Columns</TableCell>
                        <TableCell align="right">Size</TableCell>
                        <TableCell>Output Path</TableCell>
                        <TableCell>Columns</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {dataImport.outputTables.map((table, idx) => (
                        <TableRow key={idx} hover>
                          <TableCell>
                            <Typography variant="body2" fontWeight="medium">
                              {table.tableName}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            {table.rowCount.toLocaleString()}
                          </TableCell>
                          <TableCell align="right">{table.columnCount}</TableCell>
                          <TableCell align="right">
                            {formatBytes(table.outputSizeBytes)}
                          </TableCell>
                          <TableCell>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}
                            >
                              {table.outputPath}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                              {table.columns.slice(0, 5).map((col, colIdx) => (
                                <Chip
                                  key={colIdx}
                                  label={`${col.name}: ${col.type}`}
                                  size="small"
                                  variant="outlined"
                                  sx={{ fontFamily: 'monospace', fontSize: '0.65rem' }}
                                />
                              ))}
                              {table.columns.length > 5 && (
                                <Chip
                                  label={`+${table.columns.length - 5} more`}
                                  size="small"
                                  variant="outlined"
                                />
                              )}
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </>
          )}

          {/* Tab 1: Runs */}
          {activeTab === 1 && (
            <DataImportRunHistory
              runs={runs}
              isLoading={runsLoading}
              canWrite={canWrite}
              canDelete={canDelete}
              onRetry={() => handleStartRun()}
              onCancel={(runId) => runHook.cancelRun(runId)}
              onDelete={handleDeleteRun}
            />
          )}

          {/* Tab 2: Config */}
          {activeTab === 2 && (
            <Box sx={{ p: 3 }}>
              {!dataImport.config ? (
                <Typography color="text.secondary">No configuration saved.</Typography>
              ) : (
                <>
                  <Typography variant="subtitle2" gutterBottom>
                    Import Configuration
                  </Typography>
                  {/* CSV config display */}
                  {dataImport.config.delimiter != null && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                      <Typography variant="body2">
                        <strong>Delimiter:</strong>{' '}
                        {dataImport.config.delimiter === '\t'
                          ? 'Tab'
                          : dataImport.config.delimiter === ','
                            ? 'Comma'
                            : dataImport.config.delimiter === ';'
                              ? 'Semicolon'
                              : dataImport.config.delimiter === '|'
                                ? 'Pipe'
                                : `"${dataImport.config.delimiter}"`}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Has Header:</strong>{' '}
                        {dataImport.config.hasHeader ? 'Yes' : 'No'}
                      </Typography>
                      {dataImport.config.encoding && (
                        <Typography variant="body2">
                          <strong>Encoding:</strong> {dataImport.config.encoding}
                        </Typography>
                      )}
                    </Box>
                  )}
                  {/* Excel sheet config display */}
                  {dataImport.config.sheets && dataImport.config.sheets.length > 0 && (
                    <Box>
                      <Typography variant="body2" sx={{ mb: 1 }}>
                        <strong>Sheets ({dataImport.config.sheets.length}):</strong>
                      </Typography>
                      {dataImport.config.sheets.map((sheet, idx) => (
                        <Box
                          key={idx}
                          sx={{
                            mb: 1,
                            p: 1.5,
                            bgcolor: 'action.hover',
                            borderRadius: 1,
                          }}
                        >
                          <Typography variant="body2" fontWeight="medium">
                            {sheet.sheetName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Header: {sheet.hasHeader !== false ? 'Yes' : 'No'}
                            {sheet.range &&
                              ` | Range: rows ${sheet.range.startRow}${sheet.range.endRow ? `–${sheet.range.endRow}` : '+'}, cols ${sheet.range.startCol}${sheet.range.endCol ? `–${sheet.range.endCol}` : '+'}`}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  )}
                </>
              )}
            </Box>
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

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Import</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete "{dataImport.name}"? This will remove all associated
            data and runs. This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteImport} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
