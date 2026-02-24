import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  IconButton,
  Chip,
  Tooltip,
  CircularProgress,
  LinearProgress,
} from '@mui/material';
import {
  Replay as RetryIcon,
  Visibility as ViewIcon,
  Delete as DeleteIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import type { DataImportRun, DataImportRunStatus } from '../../types';

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) return '-';
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

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

const ACTIVE_STATUSES: DataImportRunStatus[] = ['pending', 'parsing', 'converting', 'uploading', 'connecting'];

interface DataImportRunHistoryProps {
  runs: DataImportRun[];
  isLoading?: boolean;
  canWrite?: boolean;
  canDelete?: boolean;
  onView?: (importId: string) => void;
  onRetry?: (run: DataImportRun) => void;
  onCancel?: (runId: string) => void;
  onDelete?: (runId: string) => void;
}

export function DataImportRunHistory({
  runs,
  isLoading,
  canWrite,
  canDelete,
  onView,
  onRetry,
  onCancel,
  onDelete,
}: DataImportRunHistoryProps) {
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (runs.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">No runs yet</Typography>
      </Box>
    );
  }

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Status</TableCell>
            <TableCell>Phase</TableCell>
            <TableCell>Progress</TableCell>
            <TableCell>Duration</TableCell>
            <TableCell>Started</TableCell>
            <TableCell>Error</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {runs.map((run) => {
            const statusConfig = RUN_STATUS_CONFIG[run.status] ?? { label: run.status, color: 'default' as const };
            const isActive = ACTIVE_STATUSES.includes(run.status);
            const pct = run.progress?.percentComplete;

            return (
              <TableRow key={run.id} hover>
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
                  {isActive && pct != null ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <LinearProgress
                        variant="determinate"
                        value={pct}
                        sx={{ flexGrow: 1, height: 6, borderRadius: 3 }}
                      />
                      <Typography variant="caption">{pct}%</Typography>
                    </Box>
                  ) : run.status === 'completed' ? (
                    <Typography variant="caption" color="success.main">100%</Typography>
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell>
                  {isActive
                    ? 'Running...'
                    : formatDuration(run.startedAt, run.completedAt)}
                </TableCell>
                <TableCell>
                  {run.startedAt ? new Date(run.startedAt).toLocaleString() : '-'}
                </TableCell>
                <TableCell>
                  {run.errorMessage ? (
                    <Tooltip title={run.errorMessage}>
                      <Typography
                        variant="caption"
                        color="error"
                        noWrap
                        sx={{ maxWidth: 200, display: 'block' }}
                      >
                        {run.errorMessage}
                      </Typography>
                    </Tooltip>
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell align="right">
                  <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                    {onView && (
                      <Tooltip title="View import">
                        <IconButton size="small" onClick={() => onView(run.importId)}>
                          <ViewIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                    {canWrite && isActive && onCancel && (
                      <Tooltip title="Cancel run">
                        <IconButton size="small" onClick={() => onCancel(run.id)}>
                          <CancelIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                    {canWrite && ['failed', 'cancelled'].includes(run.status) && onRetry && (
                      <Tooltip title="Retry">
                        <IconButton size="small" onClick={() => onRetry(run)}>
                          <RetryIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                    {canDelete && ['failed', 'cancelled'].includes(run.status) && onDelete && (
                      <Tooltip title="Delete run">
                        <IconButton size="small" color="error" onClick={() => onDelete(run.id)}>
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
  );
}
