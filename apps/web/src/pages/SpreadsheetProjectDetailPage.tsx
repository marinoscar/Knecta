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
  Snackbar,
  CircularProgress,
  Grid,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  PlayArrow as RunIcon,
} from '@mui/icons-material';
import { FileList } from '../components/spreadsheet-agent/FileList';
import { TableList } from '../components/spreadsheet-agent/TableList';
import { TablePreview } from '../components/spreadsheet-agent/TablePreview';
import { RunHistory } from '../components/spreadsheet-agent/RunHistory';
import { CatalogPreview } from '../components/spreadsheet-agent/CatalogPreview';
import { ExtractionPlanReview } from '../components/spreadsheet-agent/ExtractionPlanReview';
import { AgentProgressView } from '../components/spreadsheet-agent/AgentProgressView';
import { useSpreadsheetRun } from '../hooks/useSpreadsheetRun';
import { usePermissions } from '../hooks/usePermissions';
import {
  getSpreadsheetProject,
  getSpreadsheetFiles,
  getSpreadsheetTables,
  getSpreadsheetTablePreview,
  getSpreadsheetTableDownloadUrl,
  deleteSpreadsheetFile,
  deleteSpreadsheetTable,
  createSpreadsheetRun,
  listProjectSpreadsheetRuns,
  deleteSpreadsheetRun,
} from '../services/api';
import type {
  SpreadsheetProject,
  SpreadsheetFile,
  SpreadsheetTable,
  SpreadsheetTablesResponse,
  SpreadsheetRun,
  SpreadsheetProjectStatus,
  SpreadsheetExtractionPlan,
  SpreadsheetPlanModification,
  TablePreviewData,
} from '../types';

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

export default function SpreadsheetProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('spreadsheet_agent:write');
  const canDelete = hasPermission('spreadsheet_agent:delete');

  const runHook = useSpreadsheetRun();

  const [project, setProject] = useState<SpreadsheetProject | null>(null);
  const [files, setFiles] = useState<SpreadsheetFile[]>([]);
  const [tables, setTables] = useState<SpreadsheetTable[]>([]);
  const [tablesTotal, setTablesTotal] = useState(0);
  const [tablesPage, setTablesPage] = useState(1);
  const [tablesPageSize, setTablesPageSize] = useState(20);
  const [runs, setRuns] = useState<SpreadsheetRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Preview state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTableName, setPreviewTableName] = useState('');
  const [previewData, setPreviewData] = useState<TablePreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Review state
  const [reviewPlan, setReviewPlan] = useState<SpreadsheetExtractionPlan | null>(null);
  const [reviewRunId, setReviewRunId] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);

  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });

  const fetchProject = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const proj = await getSpreadsheetProject(id);
      setProject(proj);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  const fetchFiles = useCallback(async () => {
    if (!id) return;
    try {
      const result = await getSpreadsheetFiles(id);
      setFiles(result);
    } catch (err) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : 'Failed to load files',
        severity: 'error',
      });
    }
  }, [id]);

  const fetchTables = useCallback(
    async (page = 1, pageSize = 20) => {
      if (!id) return;
      try {
        const result: SpreadsheetTablesResponse = await getSpreadsheetTables(id, {
          page,
          pageSize,
        });
        setTables(result.items);
        setTablesTotal(result.total);
        setTablesPage(result.page);
        setTablesPageSize(result.pageSize);
      } catch (err) {
        setSnackbar({
          open: true,
          message: err instanceof Error ? err.message : 'Failed to load tables',
          severity: 'error',
        });
      }
    },
    [id],
  );

  const fetchRuns = useCallback(async () => {
    if (!id) return;
    setRunsLoading(true);
    try {
      const result = await listProjectSpreadsheetRuns(id);
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

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  useEffect(() => {
    if (activeTab === 0) fetchFiles();
    if (activeTab === 1) fetchTables(tablesPage, tablesPageSize);
    if (activeTab === 2) fetchRuns();
  }, [activeTab, fetchFiles, fetchTables, fetchRuns, tablesPage, tablesPageSize]);

  const handleStartRun = async () => {
    if (!id) return;
    try {
      const run = await createSpreadsheetRun({
        projectId: id,
        config: { reviewMode: project?.reviewMode },
      });
      setRuns((prev) => [run, ...prev]);
      runHook.startStream(run.id);
      setSnackbar({ open: true, message: 'Run started', severity: 'success' });
    } catch (err) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : 'Failed to start run',
        severity: 'error',
      });
    }
  };

  const handleRetryRun = () => {
    handleStartRun();
  };

  const handleDeleteRun = async (runId: string) => {
    try {
      await deleteSpreadsheetRun(runId);
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

  const handlePreview = async (tableId: string) => {
    if (!id) return;
    const table = tables.find((t) => t.id === tableId);
    setPreviewTableName(table?.tableName || 'Table');
    setPreviewOpen(true);
    setPreviewLoading(true);
    try {
      const data = await getSpreadsheetTablePreview(id, tableId, 50);
      setPreviewData(data);
    } catch (err) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : 'Failed to load preview',
        severity: 'error',
      });
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownload = async (tableId: string) => {
    if (!id) return;
    try {
      const result = await getSpreadsheetTableDownloadUrl(id, tableId);
      window.open(result.url, '_blank');
    } catch (err) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : 'Failed to get download URL',
        severity: 'error',
      });
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!id) return;
    try {
      await deleteSpreadsheetFile(id, fileId);
      setSnackbar({ open: true, message: 'File deleted', severity: 'success' });
      fetchFiles();
    } catch (err) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : 'Failed to delete file',
        severity: 'error',
      });
    }
  };

  const handleDeleteTable = async (tableId: string) => {
    if (!id) return;
    try {
      await deleteSpreadsheetTable(id, tableId);
      setSnackbar({ open: true, message: 'Table deleted', severity: 'success' });
      fetchTables(tablesPage, tablesPageSize);
    } catch (err) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : 'Failed to delete table',
        severity: 'error',
      });
    }
  };

  const handleApprovePlan = async (modifications: SpreadsheetPlanModification[]) => {
    if (!reviewRunId) return;
    setIsApproving(true);
    try {
      await runHook.approvePlan(reviewRunId, modifications);
      setReviewPlan(null);
      setReviewRunId(null);
      setSnackbar({
        open: true,
        message: 'Plan approved, run resuming...',
        severity: 'success',
      });
      runHook.startStream(reviewRunId);
    } catch (err) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : 'Failed to approve plan',
        severity: 'error',
      });
    } finally {
      setIsApproving(false);
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

  if (!project) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ py: 4 }}>
          <Alert severity="error">{error || 'Project not found'}</Alert>
          <Button startIcon={<BackIcon />} onClick={() => navigate('/spreadsheets')} sx={{ mt: 2 }}>
            Back to Projects
          </Button>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <Button startIcon={<BackIcon />} onClick={() => navigate('/spreadsheets')}>
            Back
          </Button>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h5" component="h1">
              {project.name}
            </Typography>
            {project.description && (
              <Typography variant="body2" color="text.secondary">
                {project.description}
              </Typography>
            )}
          </Box>
          <Chip
            label={STATUS_CONFIG[project.status]?.label || project.status}
            color={STATUS_CONFIG[project.status]?.color || 'default'}
          />
          {canWrite && project.status !== 'processing' && (
            <Button variant="contained" startIcon={<RunIcon />} onClick={handleStartRun}>
              Start Run
            </Button>
          )}
        </Box>

        {/* Overview stats */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={3}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h4">{project.fileCount}</Typography>
              <Typography variant="body2" color="text.secondary">
                Files
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={3}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h4">{project.tableCount}</Typography>
              <Typography variant="body2" color="text.secondary">
                Tables
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={3}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h4">{project.totalRows.toLocaleString()}</Typography>
              <Typography variant="body2" color="text.secondary">
                Total Rows
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={3}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Chip
                label={project.reviewMode === 'review' ? 'Manual Review' : 'Auto'}
                size="small"
                variant="outlined"
              />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Review Mode
              </Typography>
            </Paper>
          </Grid>
        </Grid>

        {/* SSE streaming progress (if a run is active) */}
        {runHook.isStreaming && (
          <Paper sx={{ p: 3, mb: 3 }}>
            <AgentProgressView
              events={runHook.events}
              progress={runHook.progress}
              isStreaming={runHook.isStreaming}
              tokensUsed={runHook.tokensUsed}
              startTime={runHook.streamStartTime}
            />
          </Paper>
        )}

        {/* Review plan (if a run is in review_pending) */}
        {reviewPlan && (
          <Paper sx={{ p: 3, mb: 3 }}>
            <ExtractionPlanReview
              plan={reviewPlan}
              onApprove={handleApprovePlan}
              onCancel={() => {
                setReviewPlan(null);
                setReviewRunId(null);
              }}
              isSubmitting={isApproving}
            />
          </Paper>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 2 }}>
          <Tab label="Files" />
          <Tab label="Tables" />
          <Tab label="Runs" />
          <Tab label="Catalog" />
        </Tabs>

        <Paper>
          {activeTab === 0 && (
            <FileList
              files={files}
              canDelete={canDelete}
              onDelete={handleDeleteFile}
            />
          )}
          {activeTab === 1 && (
            <TableList
              tables={tables}
              total={tablesTotal}
              page={tablesPage}
              pageSize={tablesPageSize}
              canDelete={canDelete}
              onPageChange={(p) => fetchTables(p, tablesPageSize)}
              onRowsPerPageChange={(ps) => fetchTables(1, ps)}
              onPreview={handlePreview}
              onDownload={handleDownload}
              onDelete={handleDeleteTable}
            />
          )}
          {activeTab === 2 && (
            <RunHistory
              runs={runs}
              isLoading={runsLoading}
              canWrite={canWrite}
              canDelete={canDelete}
              onCancel={(runId) => runHook.cancelRun(runId)}
              onRetry={handleRetryRun}
              onDelete={handleDeleteRun}
            />
          )}
          {activeTab === 3 && <CatalogPreview catalog={null} />}
        </Paper>
      </Box>

      {/* Table Preview Dialog */}
      <TablePreview
        open={previewOpen}
        tableName={previewTableName}
        data={previewData}
        isLoading={previewLoading}
        onClose={() => {
          setPreviewOpen(false);
          setPreviewData(null);
        }}
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
    </Container>
  );
}
