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
} from '@mui/material';
import {
  Replay as RetryIcon,
  Visibility as ViewIcon,
  Delete as DeleteIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import type { SpreadsheetRun, SpreadsheetRunStatus } from '../../types';

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) return '-';
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface RunHistoryProps {
  runs: SpreadsheetRun[];
  isLoading?: boolean;
  canWrite?: boolean;
  canDelete?: boolean;
  onView?: (runId: string) => void;
  onRetry?: (run: SpreadsheetRun) => void;
  onCancel?: (runId: string) => void;
  onDelete?: (runId: string) => void;
}

const RUN_STATUS_CONFIG: Record<
  SpreadsheetRunStatus,
  { label: string; color: 'default' | 'info' | 'warning' | 'success' | 'error' }
> = {
  pending: { label: 'Pending', color: 'default' },
  ingesting: { label: 'Ingesting', color: 'info' },
  analyzing: { label: 'Analyzing', color: 'info' },
  designing: { label: 'Designing', color: 'info' },
  review_pending: { label: 'Review Pending', color: 'warning' },
  extracting: { label: 'Extracting', color: 'info' },
  validating: { label: 'Validating', color: 'info' },
  persisting: { label: 'Persisting', color: 'info' },
  completed: { label: 'Completed', color: 'success' },
  failed: { label: 'Failed', color: 'error' },
  cancelled: { label: 'Cancelled', color: 'default' },
};

const ACTIVE_STATUSES: SpreadsheetRunStatus[] = [
  'pending',
  'ingesting',
  'analyzing',
  'designing',
  'extracting',
  'validating',
  'persisting',
];

export function RunHistory({
  runs,
  isLoading,
  canWrite,
  canDelete,
  onView,
  onRetry,
  onCancel,
  onDelete,
}: RunHistoryProps) {
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
            <TableCell>Tokens</TableCell>
            <TableCell>Started</TableCell>
            <TableCell>Completed</TableCell>
            <TableCell>Duration</TableCell>
            <TableCell>Error</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {runs.map((run) => (
            <TableRow key={run.id} hover>
              <TableCell>
                <Chip
                  label={RUN_STATUS_CONFIG[run.status]?.label || run.status}
                  color={RUN_STATUS_CONFIG[run.status]?.color || 'default'}
                  size="small"
                />
              </TableCell>
              <TableCell>
                {typeof run.tokensUsed === 'object'
                  ? run.tokensUsed.total.toLocaleString()
                  : String(run.tokensUsed || 0)}
              </TableCell>
              <TableCell>
                {run.startedAt ? new Date(run.startedAt).toLocaleString() : '-'}
              </TableCell>
              <TableCell>
                {run.completedAt ? new Date(run.completedAt).toLocaleString() : '-'}
              </TableCell>
              <TableCell>
                {run.startedAt && run.completedAt
                  ? formatDuration(run.startedAt, run.completedAt)
                  : ACTIVE_STATUSES.includes(run.status)
                    ? 'Running...'
                    : '-'}
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
                    <Tooltip title="View details">
                      <IconButton size="small" onClick={() => onView(run.id)}>
                        <ViewIcon />
                      </IconButton>
                    </Tooltip>
                  )}
                  {canWrite && ACTIVE_STATUSES.includes(run.status) && onCancel && (
                    <Tooltip title="Cancel run">
                      <IconButton size="small" onClick={() => onCancel(run.id)}>
                        <CancelIcon />
                      </IconButton>
                    </Tooltip>
                  )}
                  {canWrite &&
                    ['failed', 'cancelled'].includes(run.status) &&
                    onRetry && (
                      <Tooltip title="Retry">
                        <IconButton size="small" onClick={() => onRetry(run)}>
                          <RetryIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                  {canDelete &&
                    ['failed', 'cancelled', 'completed'].includes(run.status) &&
                    onDelete && (
                      <Tooltip title="Delete run">
                        <IconButton size="small" color="error" onClick={() => onDelete(run.id)}>
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
  );
}
