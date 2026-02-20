import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Button,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Loop as LoopIcon,
} from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { DataAgentStreamEvent, LlmTraceRecord } from '../../types';
import { extractLiveLlmTraces, formatDuration, formatTokenCount, PHASE_LABELS, type LiveLlmTrace } from './insightsUtils';
import { getMessageTraces } from '../../services/api';
import { LlmTraceDialog } from './LlmTraceDialog';

interface LlmTracesSectionProps {
  streamEvents: DataAgentStreamEvent[];
  isLiveMode: boolean;
  chatId?: string;
  messageId?: string;
  historyTraces?: LlmTraceRecord[];
}

// Phase color mapping (matches PhaseIndicator)
const PHASE_COLORS: Record<string, 'info' | 'secondary' | 'primary' | 'warning' | 'success' | 'default'> = {
  planner: 'info',
  navigator: 'secondary',
  sql_builder: 'primary',
  executor: 'warning',
  verifier: 'success',
  explainer: 'default',
};

// Helper to convert LiveLlmTrace to LlmTraceRecord for the dialog
function liveTraceToRecord(trace: LiveLlmTrace): LlmTraceRecord {
  return {
    id: `live-${trace.callIndex}`,
    messageId: '',
    phase: trace.phase,
    callIndex: trace.callIndex,
    stepId: trace.stepId ?? null,
    purpose: trace.purpose,
    provider: trace.provider,
    model: trace.model,
    temperature: null,
    structuredOutput: trace.structuredOutput,
    promptMessages: [],
    responseContent: trace.responsePreview || '',
    toolCalls: null,
    promptTokens: trace.promptTokens || 0,
    completionTokens: trace.completionTokens || 0,
    totalTokens: trace.totalTokens || 0,
    startedAt: '',
    completedAt: '',
    durationMs: trace.durationMs || 0,
    error: trace.error || null,
  };
}

export function LlmTracesSection({
  streamEvents,
  isLiveMode,
  chatId,
  messageId,
  historyTraces: preloadedTraces,
}: LlmTracesSectionProps) {
  const [fetchedTraces, setFetchedTraces] = useState<LlmTraceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTrace, setSelectedTrace] = useState<LlmTraceRecord | null>(null);

  // Use pre-loaded traces if available, otherwise fetch
  const historyTraces = preloadedTraces ?? fetchedTraces;

  // Fetch traces in history mode (only when no pre-loaded traces)
  useEffect(() => {
    if (!isLiveMode && !preloadedTraces && chatId && messageId) {
      setIsLoading(true);
      getMessageTraces(chatId, messageId)
        .then((traces) => setFetchedTraces(traces))
        .catch((err) => console.error('Failed to load LLM traces:', err))
        .finally(() => setIsLoading(false));
    }
  }, [isLiveMode, preloadedTraces, chatId, messageId]);

  // Extract live traces from stream events
  const liveTraces = isLiveMode ? extractLiveLlmTraces(streamEvents) : [];

  // Display traces (live or history)
  const traces = isLiveMode ? liveTraces : historyTraces;

  if (isLoading) {
    return (
      <Box>
        <Typography variant="subtitle2" fontWeight={600} mb={1}>
          LLM Traces
        </Typography>
        <Typography variant="body2" color="text.secondary" fontStyle="italic">
          Loading traces...
        </Typography>
      </Box>
    );
  }

  if (traces.length === 0) {
    return (
      <Box>
        <Typography variant="subtitle2" fontWeight={600} mb={1}>
          LLM Traces
        </Typography>
        <Typography variant="body2" color="text.secondary" fontStyle="italic">
          No LLM calls recorded
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Section Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="subtitle2" fontWeight={600}>
          LLM Traces
        </Typography>
        <Chip size="small" label={`${traces.length} calls`} variant="outlined" />
      </Box>

      {/* Trace Cards */}
      {isLiveMode ? (
        // Live mode - simple cards
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {liveTraces.map((trace) => {
            const phaseColor = PHASE_COLORS[trace.phase] || 'default';
            const phaseLabel = PHASE_LABELS[trace.phase] || trace.phase;

            return (
              <Accordion
                key={trace.callIndex}
                disableGutters
                elevation={0}
                sx={{
                  '&:before': { display: 'none' },
                  bgcolor: 'transparent',
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon />}
                  sx={{
                    px: 1,
                    minHeight: 48,
                    '&.Mui-expanded': { minHeight: 48 },
                    '& .MuiAccordionSummary-content': { my: 1 },
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      width: '100%',
                      flexWrap: 'wrap',
                    }}
                  >
                    {/* Phase Chip */}
                    <Chip
                      size="small"
                      label={phaseLabel}
                      color={phaseColor}
                      sx={{ fontSize: '0.7rem', height: 22 }}
                    />

                    {/* Running indicator */}
                    {trace.status === 'running' && (
                      <LoopIcon
                        sx={{
                          fontSize: 16,
                          color: 'primary.main',
                          '@keyframes spin': {
                            '0%': { transform: 'rotate(0deg)' },
                            '100%': { transform: 'rotate(360deg)' },
                          },
                          animation: 'spin 1s linear infinite',
                        }}
                      />
                    )}

                    {/* Purpose */}
                    <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
                      {trace.purpose}
                    </Typography>

                    {/* Duration */}
                    {trace.status === 'complete' && trace.durationMs !== undefined && (
                      <Typography variant="caption" color="text.secondary">
                        {formatDuration(trace.durationMs)}
                      </Typography>
                    )}

                    {trace.status === 'running' && (
                      <Typography variant="caption" color="text.secondary">
                        running...
                      </Typography>
                    )}
                  </Box>
                </AccordionSummary>

                {/* Expandable Details */}
                <AccordionDetails sx={{ px: 2, py: 1 }}>
                  {trace.responsePreview ? (
                    <>
                      {trace.status === 'complete' && (
                        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                          {formatTokenCount(trace.promptTokens || 0)} in / {formatTokenCount(trace.completionTokens || 0)} out
                        </Typography>
                      )}
                      <Box
                        sx={{
                          fontSize: '0.8rem',
                          bgcolor: 'action.hover',
                          p: 1,
                          borderRadius: 1,
                          '& p': { my: 0.25 },
                          '& p:first-of-type': { mt: 0 },
                          '& p:last-of-type': { mb: 0 },
                          '& code': { fontFamily: 'monospace', fontSize: '0.85em' },
                          '& pre': { my: 0.5, p: 1, borderRadius: 1, overflow: 'auto' },
                        }}
                      >
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {trace.responsePreview}
                        </ReactMarkdown>
                      </Box>
                      {trace.status === 'complete' && (
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => setSelectedTrace(liveTraceToRecord(trace))}
                          sx={{ mt: 1 }}
                        >
                          View Full
                        </Button>
                      )}
                    </>
                  ) : (
                    <Typography variant="caption" color="text.secondary" fontStyle="italic">
                      Response pending...
                    </Typography>
                  )}
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Box>
      ) : (
        // History mode - cards with "View Full" button
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {historyTraces.map((trace) => {
            const phaseColor = PHASE_COLORS[trace.phase] || 'default';
            const phaseLabel = PHASE_LABELS[trace.phase] || trace.phase;

            return (
              <Accordion
                key={trace.id}
                disableGutters
                elevation={0}
                sx={{
                  '&:before': { display: 'none' },
                  bgcolor: 'transparent',
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon />}
                  sx={{
                    px: 1,
                    minHeight: 48,
                    '&.Mui-expanded': { minHeight: 48 },
                    '& .MuiAccordionSummary-content': { my: 1 },
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      width: '100%',
                      flexWrap: 'wrap',
                    }}
                  >
                    {/* Phase Chip */}
                    <Chip
                      size="small"
                      label={phaseLabel}
                      color={phaseColor}
                      sx={{ fontSize: '0.7rem', height: 22 }}
                    />

                    {/* Purpose */}
                    <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
                      {trace.purpose}
                    </Typography>

                    {/* Duration */}
                    <Typography variant="caption" color="text.secondary">
                      {formatDuration(trace.durationMs)}
                    </Typography>
                  </Box>
                </AccordionSummary>

                {/* Expandable Details */}
                <AccordionDetails sx={{ px: 2, py: 1 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                    {formatTokenCount(trace.promptTokens)} in / {formatTokenCount(trace.completionTokens)} out
                  </Typography>
                  <Box
                    sx={{
                      fontSize: '0.8rem',
                      bgcolor: 'action.hover',
                      p: 1,
                      borderRadius: 1,
                      mb: 1,
                      '& p': { my: 0.25 },
                      '& p:first-of-type': { mt: 0 },
                      '& p:last-of-type': { mb: 0 },
                      '& code': { fontFamily: 'monospace', fontSize: '0.85em' },
                      '& pre': { my: 0.5, p: 1, borderRadius: 1, overflow: 'auto' },
                    }}
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {trace.responseContent.length > 200
                        ? `${trace.responseContent.slice(0, 200)}...`
                        : trace.responseContent}
                    </ReactMarkdown>
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => setSelectedTrace(trace)}
                  >
                    View Full
                  </Button>
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Box>
      )}

      {/* Detail Dialog (history mode only) */}
      {selectedTrace && (
        <LlmTraceDialog
          trace={selectedTrace}
          open={!!selectedTrace}
          onClose={() => setSelectedTrace(null)}
        />
      )}
    </Box>
  );
}
