import { useMemo, useState, useEffect } from 'react';
import {
  Alert,
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
import type { SpreadsheetStreamEvent, SpreadsheetRunProgress } from '../../types';

interface AgentProgressViewProps {
  events: SpreadsheetStreamEvent[];
  progress: SpreadsheetRunProgress | null;
  isStreaming: boolean;
  tokensUsed?: { prompt: number; completion: number; total: number };
  startTime?: number | null;
}

const PHASE_LABELS: Record<string, string> = {
  ingest: 'Ingesting Files',
  analyze: 'Analyzing Sheets',
  design: 'Designing Schema',
  extract: 'Extracting Tables',
  validate: 'Validating Data',
  persist: 'Persisting Results',
};

const PHASE_ORDER = ['ingest', 'analyze', 'design', 'extract', 'validate', 'persist'];

export function AgentProgressView({ events, progress, isStreaming, tokensUsed, startTime }: AgentProgressViewProps) {
  const [elapsed, setElapsed] = useState('0:00');

  useEffect(() => {
    if (!isStreaming || !startTime) {
      return;
    }
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
      if (event.type === 'phase_start' && event.phase) {
        status[event.phase] = 'active';
      }
      if (event.type === 'phase_complete' && event.phase) {
        status[event.phase] = 'complete';
      }
      if (event.type === 'run_error') {
        // Mark current active phase as error
        for (const p of PHASE_ORDER) {
          if (status[p] === 'active') {
            status[p] = 'error';
          }
        }
      }
    }
    return status;
  }, [events]);

  const recentEvents = useMemo(() => {
    return events
      .filter((e) =>
        [
          'file_start',
          'file_complete',
          'file_error',
          'table_start',
          'table_complete',
          'table_error',
          'sheet_analysis',
          'validation_result',
          'text',
        ].includes(e.type),
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

  const getEventMessage = (event: SpreadsheetStreamEvent): string => {
    switch (event.type) {
      case 'file_start':
        return `Processing file: ${event.fileName || event.fileId}`;
      case 'file_complete':
        return `File complete: ${event.fileName || event.fileId}`;
      case 'file_error':
        return `File error: ${event.fileName || event.fileId} - ${event.error || 'Unknown error'}`;
      case 'table_start':
        return `Extracting table: ${event.tableName}`;
      case 'table_complete':
        return `Table complete: ${event.tableName}`;
      case 'table_error':
        return `Table error: ${event.tableName} - ${event.error || 'Unknown error'}`;
      case 'sheet_analysis':
        return event.message || `Sheet: ${event.sheetName || ''}`;
      case 'validation_result':
        return `Validation: ${event.message || 'completed'}`;
      case 'text':
        return event.message || (typeof event.content === 'string' ? event.content : '');
      default:
        return event.message || event.type;
    }
  };

  return (
    <Box>
      {/* Phase progress bar */}
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
        </Box>
      )}

      {/* Timer and token chips */}
      {isStreaming && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mb: 1 }}>
          <Chip
            size="small"
            variant="outlined"
            icon={<TimerIcon />}
            label={elapsed}
            sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
          />
          {tokensUsed && tokensUsed.total > 0 && (
            <Chip
              size="small"
              variant="outlined"
              label={`${tokensUsed.total.toLocaleString()} tokens`}
              sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
            />
          )}
        </Box>
      )}

      {/* Phase indicators */}
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
                  {event.type.includes('error') || event.status === 'error' ? (
                    <ErrorIcon color="error" fontSize="small" />
                  ) : event.type.includes('complete') || event.status === 'analyzed' ? (
                    <CheckIcon color="success" fontSize="small" />
                  ) : (
                    <ProcessingIcon color="primary" fontSize="small" />
                  )}
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

      {isStreaming && !progress && (
        <LinearProgress sx={{ mt: 2 }} />
      )}

      {/* Completion alert */}
      {!isStreaming && events.some((e) => e.type === 'run_complete') && (
        <Alert severity="success" sx={{ mt: 2 }}>
          Agent completed successfully
          {startTime && (
            <> in {Math.floor((Date.now() - startTime) / 1000)} seconds</>
          )}
          {tokensUsed && tokensUsed.total > 0 && (
            <> &mdash; {tokensUsed.total.toLocaleString()} tokens used</>
          )}
        </Alert>
      )}

      {/* Error alert */}
      {!isStreaming && events.some((e) => e.type === 'run_error') && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {events.find((e) => e.type === 'run_error')?.error || events.find((e) => e.type === 'run_error')?.message || 'Agent execution failed'}
        </Alert>
      )}
    </Box>
  );
}
