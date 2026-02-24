import { useMemo, useState, useEffect } from 'react';
import {
  Box,
  Typography,
  LinearProgress,
  Chip,
  Paper,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  HourglassTop as PendingIcon,
  Loop as ProcessingIcon,
  Timer as TimerIcon,
} from '@mui/icons-material';
import type { DataImportStreamEvent, DataImportProgress } from '../../types';

interface ImportProgressViewProps {
  events: DataImportStreamEvent[];
  progress: DataImportProgress | null;
  isStreaming: boolean;
  startTime?: number | null;
}

const PHASE_LABELS: Record<string, string> = {
  parsing: 'Parsing File',
  converting: 'Converting to Parquet',
  uploading: 'Uploading to Storage',
  connecting: 'Creating Connection',
};

const PHASE_ORDER = ['parsing', 'converting', 'uploading', 'connecting'];

export function ImportProgressView({
  events,
  progress,
  isStreaming,
  startTime,
}: ImportProgressViewProps) {
  const [elapsed, setElapsed] = useState('0:00');

  useEffect(() => {
    if (!isStreaming || !startTime) return;
    const interval = setInterval(() => {
      const seconds = Math.floor((Date.now() - startTime) / 1000);
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      setElapsed(`${mins}:${secs.toString().padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [isStreaming, startTime]);

  const phaseStatus = useMemo(() => {
    const status: Record<string, 'pending' | 'active' | 'complete' | 'error'> = {};
    PHASE_ORDER.forEach((p) => (status[p] = 'pending'));

    for (const event of events) {
      if (event.type === 'phase_start') {
        const phase = event.data?.phase as string | undefined;
        if (phase && status[phase] !== undefined) status[phase] = 'active';
      }
      if (event.type === 'phase_complete') {
        const phase = event.data?.phase as string | undefined;
        if (phase && status[phase] !== undefined) status[phase] = 'complete';
      }
      if (event.type === 'run_error') {
        for (const p of PHASE_ORDER) {
          if (status[p] === 'active') status[p] = 'error';
        }
      }
    }
    return status;
  }, [events]);

  const recentEvents = useMemo(() => {
    return events
      .filter((e) =>
        ['table_start', 'table_complete', 'table_error', 'phase_start', 'phase_complete'].includes(
          e.type,
        ),
      )
      .slice(-20);
  }, [events]);

  const getPhaseIcon = (status: string) => {
    switch (status) {
      case 'complete':
        return <CheckIcon color="success" fontSize="small" />;
      case 'active':
        return (
          <ProcessingIcon
            color="primary"
            fontSize="small"
            sx={{
              animation: 'spin 1s linear infinite',
              '@keyframes spin': {
                '0%': { transform: 'rotate(0deg)' },
                '100%': { transform: 'rotate(360deg)' },
              },
            }}
          />
        );
      case 'error':
        return <ErrorIcon color="error" fontSize="small" />;
      default:
        return <PendingIcon color="disabled" fontSize="small" />;
    }
  };

  const getEventMessage = (event: DataImportStreamEvent): string => {
    const data = event.data;
    switch (event.type) {
      case 'phase_start':
        return `Starting phase: ${PHASE_LABELS[data?.phase as string] || data?.phase}`;
      case 'phase_complete':
        return `Completed: ${PHASE_LABELS[data?.phase as string] || data?.phase}`;
      case 'table_start':
        return `Processing table: ${data?.tableName || ''}`;
      case 'table_complete':
        return `Table complete: ${data?.tableName || ''} (${data?.rowCount?.toLocaleString() || '?'} rows)`;
      case 'table_error':
        return `Table error: ${data?.tableName || ''} — ${data?.error || 'Unknown error'}`;
      default:
        return (data?.message as string) || event.type;
    }
  };

  const isComplete = events.some((e) => e.type === 'run_complete');
  const hasError = events.some((e) => e.type === 'run_error');

  return (
    <Box>
      {/* Progress bar */}
      {progress && (
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {progress.message || 'Processing...'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {progress.percentComplete}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={progress.percentComplete}
            sx={{ height: 8, borderRadius: 4 }}
          />
          {progress.totalTables != null && progress.completedTables != null && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              {progress.completedTables} / {progress.totalTables} tables complete
            </Typography>
          )}
        </Box>
      )}

      {isStreaming && !progress && <LinearProgress sx={{ mb: 3 }} />}

      {/* Timer */}
      {(isStreaming || events.length > 0) && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mb: 2 }}>
          <Chip
            size="small"
            variant="outlined"
            icon={<TimerIcon />}
            label={elapsed}
            sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
          />
        </Box>
      )}

      {/* Phase chips */}
      <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap' }}>
        {PHASE_ORDER.map((phase) => (
          <Chip
            key={phase}
            icon={getPhaseIcon(phaseStatus[phase])}
            label={PHASE_LABELS[phase]}
            variant={phaseStatus[phase] === 'active' ? 'filled' : 'outlined'}
            color={
              phaseStatus[phase] === 'complete'
                ? 'success'
                : phaseStatus[phase] === 'active'
                  ? 'primary'
                  : phaseStatus[phase] === 'error'
                    ? 'error'
                    : 'default'
            }
            size="small"
          />
        ))}
      </Box>

      {/* Event log */}
      {recentEvents.length > 0 && (
        <Paper variant="outlined" sx={{ maxHeight: 300, overflow: 'auto' }}>
          <List dense>
            {recentEvents.map((event, index) => (
              <ListItem key={index}>
                <ListItemIcon sx={{ minWidth: 32 }}>
                  {event.type.includes('error')
                    ? <ErrorIcon color="error" fontSize="small" />
                    : event.type.includes('complete')
                      ? <CheckIcon color="success" fontSize="small" />
                      : <ProcessingIcon color="primary" fontSize="small" />}
                </ListItemIcon>
                <ListItemText
                  primary={getEventMessage(event)}
                  primaryTypographyProps={{ variant: 'body2' }}
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      )}

      {/* Completion / error summary */}
      {!isStreaming && isComplete && (
        <Box
          sx={{
            mt: 2,
            p: 2,
            bgcolor: hasError ? 'warning.light' : 'success.light',
            borderRadius: 1,
          }}
        >
          <Typography variant="body2" color={hasError ? 'warning.dark' : 'success.dark'}>
            {hasError ? 'Import completed with some errors' : 'Import completed successfully'}
            {startTime && (
              <> in {Math.floor((Date.now() - startTime) / 1000)} seconds</>
            )}
          </Typography>
        </Box>
      )}

      {!isStreaming && hasError && !isComplete && (
        <Box sx={{ mt: 2, p: 2, bgcolor: 'error.light', borderRadius: 1 }}>
          <Typography variant="body2" color="error.dark">
            {(events.find((e) => e.type === 'run_error')?.data?.error as string) ||
              (events.find((e) => e.type === 'run_error')?.data?.message as string) ||
              'Import failed'}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
