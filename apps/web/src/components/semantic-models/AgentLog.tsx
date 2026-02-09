import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  CircularProgress,
  Alert,
  Button,
  Chip,
  LinearProgress,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Replay as ReplayIcon,
  ArrowBack as ArrowBackIcon,
  ArrowForward as ArrowForwardIcon,
  Timer as TimerIcon,
} from '@mui/icons-material';
import Markdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { api } from '../../services/api';

interface AgentLogProps {
  runId: string;
  onRetry?: () => void;
  onExit?: () => void;
}

type StreamEvent =
  | { type: 'run_start' }
  | { type: 'step_start'; step: string; label: string }
  | { type: 'step_end'; step: string }
  | { type: 'progress'; currentTable: number; totalTables: number; tableName: string; phase: 'discover' | 'generate'; percentComplete: number }
  | { type: 'table_complete'; tableName: string; tableIndex: number; totalTables: number; datasetName: string }
  | { type: 'table_error'; tableName: string; error: string }
  | { type: 'text'; content: string }
  | { type: 'token_update'; tokensUsed: { prompt: number; completion: number; total: number } }
  | { type: 'run_complete'; semanticModelId: string | null; tokensUsed?: { prompt: number; completion: number; total: number }; failedTables?: string[]; duration?: number }
  | { type: 'run_error'; message: string };

interface TextEntry {
  type: 'text';
  content: string;
  timestamp: string;
}

interface TableProgressEntry {
  type: 'table_progress';
  tableName: string;
  phase: 'pending' | 'discovering' | 'generating' | 'completed' | 'failed';
  error?: string;
  timestamp: string;
}

type LogEntry = TextEntry | TableProgressEntry;

interface StepSection {
  step: string;
  label: string;
  startTime: string;
  endTime?: string;
  entries: LogEntry[];
  isActive: boolean;
}

type LogStatus = 'connecting' | 'running' | 'completed' | 'error';

export function AgentLog({ runId, onRetry, onExit }: AgentLogProps) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<LogStatus>('connecting');
  const [sections, setSections] = useState<StepSection[]>([]);
  const [semanticModelId, setSemanticModelId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tokensUsed, setTokensUsed] = useState<{ prompt: number; completion: number; total: number }>({ prompt: 0, completion: 0, total: 0 });
  const [percentComplete, setPercentComplete] = useState<number>(0);
  const [failedTables, setFailedTables] = useState<string[]>([]);
  const [duration, setDuration] = useState<number>(0);
  const [startTime] = useState<number>(Date.now());
  const [elapsed, setElapsed] = useState<string>('0:00');
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  // Elapsed timer
  useEffect(() => {
    if (status !== 'running' && status !== 'connecting') return;
    const interval = setInterval(() => {
      const seconds = Math.floor((Date.now() - startTime) / 1000);
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      setElapsed(`${mins}:${secs.toString().padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [status, startTime]);

  useEffect(() => {
    let isMounted = true;
    const abortController = new AbortController();

    const connectToStream = async () => {
      try {
        // Delay to handle React StrictMode double-firing: cleanup aborts before fetch starts
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (abortController.signal.aborted) return;

        const token = api.getAccessToken();
        const response = await fetch(`/api/semantic-models/runs/${runId}/stream`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`Stream connection failed: ${response.statusText}`);
        }

        const reader = response.body!.getReader();
        readerRef.current = reader;
        const decoder = new TextDecoder();
        let buffer = '';

        setStatus('running');

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!isMounted) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events (separated by \n\n)
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            const line = part.trim();
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.slice(6)) as StreamEvent;
                handleEvent(event);
              } catch (err) {
                console.error('Failed to parse SSE event:', err);
              }
            }
          }
        }
      } catch (err) {
        if (abortController.signal.aborted) return;
        if (isMounted) {
          setStatus('error');
          setErrorMessage(err instanceof Error ? err.message : 'Stream connection failed');
        }
      }
    };

    const handleEvent = (event: StreamEvent) => {
      const timestamp = new Date().toLocaleTimeString();

      switch (event.type) {
        case 'run_start':
          setStatus('running');
          break;

        case 'step_start':
          setSections((prev) => {
            // Mark previous sections as inactive
            const updated = prev.map((s) => ({ ...s, isActive: false }));
            return [
              ...updated,
              {
                step: event.step,
                label: event.label,
                startTime: timestamp,
                entries: [],
                isActive: true,
              },
            ];
          });
          break;

        case 'progress':
          setPercentComplete(event.percentComplete);
          setSections((prev) => {
            if (prev.length === 0) return prev;
            const updated = [...prev];
            const current = { ...updated[updated.length - 1] };
            updated[updated.length - 1] = current;
            const entries = [...current.entries];
            current.entries = entries;

            // Find existing entry for this table or create new one
            const existingIdx = entries.findIndex(
              (e) => e.type === 'table_progress' && e.tableName === event.tableName,
            );
            const phase = event.phase === 'discover' ? 'discovering' : 'generating';
            if (existingIdx >= 0) {
              entries[existingIdx] = { ...entries[existingIdx] as TableProgressEntry, phase, timestamp };
            } else {
              entries.push({
                type: 'table_progress',
                tableName: event.tableName,
                phase,
                timestamp,
              });
            }
            return updated;
          });
          break;

        case 'table_complete':
          setSections((prev) => {
            if (prev.length === 0) return prev;
            const updated = [...prev];
            const current = { ...updated[updated.length - 1] };
            updated[updated.length - 1] = current;
            const entries = [...current.entries];
            current.entries = entries;

            const existingIdx = entries.findIndex(
              (e) => e.type === 'table_progress' && e.tableName === event.tableName,
            );
            if (existingIdx >= 0) {
              entries[existingIdx] = { ...entries[existingIdx] as TableProgressEntry, phase: 'completed', timestamp };
            }
            return updated;
          });
          break;

        case 'table_error':
          setSections((prev) => {
            if (prev.length === 0) return prev;
            const updated = [...prev];
            const current = { ...updated[updated.length - 1] };
            updated[updated.length - 1] = current;
            const entries = [...current.entries];
            current.entries = entries;

            const existingIdx = entries.findIndex(
              (e) => e.type === 'table_progress' && e.tableName === event.tableName,
            );
            if (existingIdx >= 0) {
              entries[existingIdx] = { ...entries[existingIdx] as TableProgressEntry, phase: 'failed', error: event.error, timestamp };
            }
            return updated;
          });
          break;

        case 'text':
          setSections((prev) => {
            if (prev.length === 0) return prev;
            const updated = [...prev];
            const current = updated[updated.length - 1];
            current.entries.push({
              type: 'text',
              content: event.content,
              timestamp,
            });
            return updated;
          });
          break;

        case 'step_end':
          setSections((prev) => {
            const updated = [...prev];
            const current = updated.find((s) => s.step === event.step && s.isActive);
            if (current) {
              current.endTime = timestamp;
              current.isActive = false;
            }
            return updated;
          });
          break;

        case 'token_update':
          setTokensUsed(event.tokensUsed);
          break;

        case 'run_complete':
          setStatus('completed');
          setSemanticModelId(event.semanticModelId);
          if (event.tokensUsed) {
            setTokensUsed(event.tokensUsed);
          }
          if (event.failedTables) {
            setFailedTables(event.failedTables);
          }
          if (event.duration) {
            setDuration(event.duration);
          }
          break;

        case 'run_error':
          setStatus('error');
          setErrorMessage(event.message);
          break;
      }
    };

    connectToStream();

    return () => {
      isMounted = false;
      abortController.abort();
      if (readerRef.current) {
        readerRef.current.cancel().catch(() => {
          // Ignore cancellation errors
        });
      }
    };
  }, [runId]);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (sentinelRef.current) {
      sentinelRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [sections, status]);

  const handleViewModel = () => {
    if (semanticModelId) {
      navigate(`/semantic-models/${semanticModelId}`);
    }
  };

  return (
    <Paper
      ref={containerRef}
      sx={{
        p: 2,
        maxHeight: '60vh',
        overflow: 'auto',
        bgcolor: 'background.default',
      }}
    >
      {(status === 'running' || status === 'completed') && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mb: 1 }}>
          <Chip
            size="small"
            variant="outlined"
            icon={<TimerIcon />}
            label={elapsed}
            sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
          />
          {tokensUsed.total > 0 && (
            <Chip
              size="small"
              variant="outlined"
              label={`${tokensUsed.total.toLocaleString()} tokens`}
              sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
            />
          )}
        </Box>
      )}

      {status === 'running' && (
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Overall Progress
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {percentComplete}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={percentComplete}
            sx={{ height: 8, borderRadius: 4 }}
          />
        </Box>
      )}

      {status === 'connecting' && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 2 }}>
          <CircularProgress size={16} />
          <Typography variant="body2" color="text.secondary">
            Connecting to agent...
          </Typography>
        </Box>
      )}

      {sections.map((section, idx) => (
        <Box key={`${section.step}-${idx}`} sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            {section.isActive ? (
              <CircularProgress size={16} />
            ) : (
              <CheckCircleIcon color="success" fontSize="small" />
            )}
            <Typography variant="subtitle2" fontWeight="bold">
              {section.label}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
              {section.startTime}
            </Typography>
          </Box>

          <Box sx={{ pl: 3.5 }}>
            {section.entries.map((entry, entryIdx) => {
              if (entry.type === 'text') {
                return (
                  <Typography
                    key={entryIdx}
                    component="div"
                    variant="body2"
                    color="text.secondary"
                    sx={{ mb: 1 }}
                  >
                    <Markdown
                      components={{
                        code({ className, children, ...props }) {
                          const match = /language-(\w+)/.exec(className || '');
                          const inline = !match;
                          return inline ? (
                            <code
                              style={{
                                backgroundColor: 'rgba(0,0,0,0.05)',
                                padding: '2px 4px',
                                borderRadius: 4,
                              }}
                              {...props}
                            >
                              {children}
                            </code>
                          ) : (
                            <SyntaxHighlighter style={oneDark} language={match[1]} PreTag="div">
                              {String(children).replace(/\n$/, '')}
                            </SyntaxHighlighter>
                          );
                        },
                      }}
                    >
                      {entry.content}
                    </Markdown>
                  </Typography>
                );
              } else if (entry.type === 'table_progress') {
                return (
                  <Box
                    key={entryIdx}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      py: 0.5,
                      px: 1,
                      bgcolor: entry.phase === 'failed' ? 'error.50' : 'transparent',
                      borderRadius: 1,
                    }}
                  >
                    {entry.phase === 'completed' ? (
                      <CheckCircleIcon color="success" fontSize="small" />
                    ) : entry.phase === 'failed' ? (
                      <ErrorIcon color="error" fontSize="small" />
                    ) : (
                      <CircularProgress size={14} />
                    )}
                    <Typography variant="body2" fontFamily="monospace" sx={{ flex: 1 }}>
                      {entry.tableName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {entry.phase === 'discovering' && 'Discovering...'}
                      {entry.phase === 'generating' && 'Generating...'}
                      {entry.phase === 'completed' && 'Complete'}
                      {entry.phase === 'failed' && `Failed: ${entry.error || 'Unknown error'}`}
                      {entry.phase === 'pending' && 'Pending'}
                    </Typography>
                  </Box>
                );
              }
              return null;
            })}
          </Box>
        </Box>
      ))}

      {status === 'completed' && (
        <Box sx={{ mt: 2 }}>
          {failedTables.length > 0 && (
            <Alert severity="warning" sx={{ mb: 1 }}>
              {failedTables.length} table(s) failed during generation and were skipped:
              <br />
              {failedTables.join(', ')}
            </Alert>
          )}
          <Alert severity="success" icon={<CheckCircleIcon />}>
            Model generated successfully
            {duration > 0 && ` in ${Math.floor(duration / 1000)}s`}
          </Alert>
          {semanticModelId && (
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
              <Button
                variant="contained"
                onClick={handleViewModel}
                endIcon={<ArrowForwardIcon />}
              >
                View Semantic Model
              </Button>
            </Box>
          )}
        </Box>
      )}

      {status === 'error' && errorMessage && (
        <Box sx={{ mt: 2 }}>
          <Alert severity="error" icon={<ErrorIcon />}>
            {errorMessage}
          </Alert>
          <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
            {onRetry && (
              <Button variant="contained" startIcon={<ReplayIcon />} onClick={onRetry}>
                Retry
              </Button>
            )}
            {onExit && (
              <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={onExit}>
                Back to List
              </Button>
            )}
          </Box>
        </Box>
      )}

      <div ref={sentinelRef} />
    </Paper>
  );
}
