import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  CircularProgress,
  Alert,
  Button,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  ExpandMore as ExpandMoreIcon,
  Build as BuildIcon,
  Replay as ReplayIcon,
  ArrowBack as ArrowBackIcon,
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
  | { type: 'text'; content: string }
  | { type: 'text_delta'; content: string }
  | { type: 'tool_start'; tool: string; args: Record<string, unknown> }
  | { type: 'tool_result'; tool: string; content: string }
  | { type: 'step_end'; step: string }
  | { type: 'run_complete'; semanticModelId: string | null }
  | { type: 'run_error'; message: string };

interface TextEntry {
  type: 'text';
  content: string;
  timestamp: string;
}

interface ToolEntry {
  type: 'tool';
  tool: string;
  args: Record<string, unknown>;
  result?: string;
  timestamp: string;
}

type LogEntry = TextEntry | ToolEntry;

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
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  useEffect(() => {
    let isMounted = true;
    const abortController = new AbortController();

    const connectToStream = async () => {
      try {
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

        case 'text_delta':
          setSections((prev) => {
            if (prev.length === 0) return prev;
            const updated = [...prev];
            const current = { ...updated[updated.length - 1] };
            updated[updated.length - 1] = current;
            const entries = [...current.entries];
            current.entries = entries;

            const lastEntry = entries[entries.length - 1];
            if (lastEntry && lastEntry.type === 'text') {
              // Append to existing text entry (immutable update)
              entries[entries.length - 1] = {
                ...lastEntry,
                content: lastEntry.content + event.content,
              };
            } else {
              // Create new text entry
              entries.push({
                type: 'text',
                content: event.content,
                timestamp,
              });
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

        case 'tool_start':
          setSections((prev) => {
            if (prev.length === 0) return prev;
            const updated = [...prev];
            const current = updated[updated.length - 1];
            current.entries.push({
              type: 'tool',
              tool: event.tool,
              args: event.args,
              timestamp,
            });
            return updated;
          });
          break;

        case 'tool_result':
          setSections((prev) => {
            if (prev.length === 0) return prev;
            const updated = [...prev];
            const current = updated[updated.length - 1];
            // Find the most recent tool entry matching this tool name
            for (let i = current.entries.length - 1; i >= 0; i--) {
              const entry = current.entries[i];
              if (entry.type === 'tool' && entry.tool === event.tool && !entry.result) {
                entry.result = event.content;
                break;
              }
            }
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

        case 'run_complete':
          setStatus('completed');
          setSemanticModelId(event.semanticModelId);
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
              } else {
                // Tool entry
                const hasResult = entry.result !== undefined;
                return (
                  <Accordion
                    key={entryIdx}
                    sx={{
                      mb: 0.5,
                      boxShadow: 'none',
                      '&:before': { display: 'none' },
                      bgcolor: 'transparent',
                    }}
                    disableGutters
                  >
                    <AccordionSummary
                      expandIcon={<ExpandMoreIcon fontSize="small" />}
                      sx={{
                        minHeight: 32,
                        '& .MuiAccordionSummary-content': {
                          my: 0.5,
                          alignItems: 'center',
                        },
                        px: 1,
                        bgcolor: 'background.paper',
                        borderRadius: 1,
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                        <BuildIcon fontSize="small" color="action" />
                        <Typography variant="body2" fontFamily="monospace">
                          {entry.tool}
                        </Typography>
                        {hasResult ? (
                          <CheckCircleIcon
                            fontSize="small"
                            color="success"
                            sx={{ ml: 'auto' }}
                          />
                        ) : (
                          <CircularProgress size={12} sx={{ ml: 'auto' }} />
                        )}
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails sx={{ pt: 1, pb: 1, px: 1 }}>
                      <Typography variant="caption" color="text.secondary" fontWeight="bold">
                        Arguments:
                      </Typography>
                      <Box
                        component="pre"
                        sx={{
                          fontSize: '0.75rem',
                          bgcolor: 'background.default',
                          p: 1,
                          borderRadius: 1,
                          overflow: 'auto',
                          mb: hasResult ? 1 : 0,
                        }}
                      >
                        {JSON.stringify(entry.args, null, 2)}
                      </Box>
                      {hasResult && (
                        <>
                          <Typography variant="caption" color="text.secondary" fontWeight="bold">
                            Result:
                          </Typography>
                          <Box
                            component="pre"
                            sx={{
                              fontSize: '0.75rem',
                              bgcolor: 'background.default',
                              p: 1,
                              borderRadius: 1,
                              overflow: 'auto',
                              maxHeight: 200,
                            }}
                          >
                            {entry.result}
                          </Box>
                        </>
                      )}
                    </AccordionDetails>
                  </Accordion>
                );
              }
            })}
          </Box>
        </Box>
      ))}

      {status === 'completed' && (
        <Box sx={{ mt: 2 }}>
          <Alert
            severity="success"
            icon={<CheckCircleIcon />}
            action={
              semanticModelId ? (
                <Button color="inherit" size="small" onClick={handleViewModel}>
                  View Semantic Model
                </Button>
              ) : undefined
            }
          >
            Model generated successfully
          </Alert>
          {onExit && (
            <Box sx={{ mt: 1 }}>
              <Button size="small" startIcon={<ArrowBackIcon />} onClick={onExit}>
                Back to List
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
