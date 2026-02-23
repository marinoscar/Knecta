import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  Chip,
  IconButton,
  Tooltip,
  Divider,
  Drawer,
  useTheme,
  useMediaQuery,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Button,
} from '@mui/material';
import {
  Analytics as AnalyticsIcon,
  ChevronRight,
  AccessTime,
  CheckCircle,
  Cancel,
  RadioButtonUnchecked,
  Loop,
  Error as ErrorIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material';
import { ChatMessage } from '../components/data-agent/ChatMessage';
import { LlmTraceDialog } from '../components/data-agent/LlmTraceDialog';
import { getSharedChat } from '../services/api';
import type { SharedChatData, DataChatMessage, ChartSpec, SharedLlmTrace, LlmTraceRecord } from '../types';

// Helper to format duration in ms
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

const PHASE_LABELS: Record<string, string> = {
  planner: 'Planner',
  navigator: 'Navigator',
  sql_builder: 'SQL Builder',
  executor: 'Executor',
  verifier: 'Verifier',
  explainer: 'Explainer',
};

const PHASE_COLORS: Record<string, 'info' | 'secondary' | 'primary' | 'warning' | 'success' | 'default'> = {
  planner: 'info',
  navigator: 'secondary',
  sql_builder: 'primary',
  executor: 'warning',
  verifier: 'success',
  explainer: 'default',
};

function sharedTraceToRecord(trace: SharedLlmTrace, index: number): LlmTraceRecord {
  return {
    id: `shared-trace-${index}`,
    messageId: '',
    phase: trace.phase,
    callIndex: trace.callIndex,
    stepId: trace.stepId,
    purpose: trace.purpose,
    provider: trace.provider,
    model: trace.model,
    temperature: trace.temperature,
    structuredOutput: trace.structuredOutput,
    promptMessages: trace.promptMessages ?? [],
    responseContent: trace.responseContent ?? '',
    toolCalls: trace.toolCalls,
    promptTokens: trace.promptTokens,
    completionTokens: trace.completionTokens,
    totalTokens: trace.totalTokens,
    startedAt: trace.startedAt ?? '',
    completedAt: trace.completedAt ?? '',
    durationMs: trace.durationMs,
    error: trace.error,
  };
}

export default function SharedChatPage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const theme = useTheme();
  const isLargeScreen = useMediaQuery(theme.breakpoints.up('md'));
  const [data, setData] = useState<SharedChatData | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);

  useEffect(() => {
    if (!shareToken) return;

    setIsLoading(true);
    getSharedChat(shareToken)
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((err) => {
        if (err?.status === 410) {
          setError({ status: 410, message: 'This shared conversation has expired or been revoked.' });
        } else if (err?.status === 404) {
          setError({ status: 404, message: 'This shared conversation was not found.' });
        } else {
          setError({ status: 500, message: 'Failed to load shared conversation.' });
        }
      })
      .finally(() => setIsLoading(false));
  }, [shareToken]);

  // Map SharedChatMessage to DataChatMessage for ChatMessage component reuse
  const messages = useMemo(() => {
    if (!data) return [];
    return data.messages.map((msg, index) => ({
      id: `shared-${index}`,
      chatId: 'shared',
      role: msg.role,
      content: msg.content,
      status: msg.status as DataChatMessage['status'],
      createdAt: msg.createdAt,
      metadata: msg.metadata
        ? {
            plan: msg.metadata.plan
              ? {
                  complexity: (msg.metadata.plan.complexity ?? 'simple') as
                    | 'simple'
                    | 'analytical'
                    | 'conversational',
                  intent: msg.metadata.plan.intent ?? '',
                  steps: msg.metadata.plan.steps ?? [],
                }
              : undefined,
            stepResults: msg.metadata.stepResults?.map((step) => ({
              stepId: step.stepId,
              description: step.description ?? '',
              strategy: step.strategy ?? '',
              sqlResult: step.sqlResult,
              pythonResult: step.pythonResult
                ? { stdout: step.pythonResult.stdout, charts: step.pythonResult.charts ?? [] }
                : undefined,
              chartSpec: step.chartSpec as ChartSpec | undefined,
              error: step.error,
            })),
            verificationReport: msg.metadata.verificationReport,
            dataLineage: msg.metadata.dataLineage,
            joinPlan: msg.metadata.joinPlan
              ? {
                  relevantDatasets: msg.metadata.joinPlan.relevantDatasets.map((ds) => ({
                    name: ds.name,
                    description: ds.description,
                    source: '',
                  })),
                  joinPaths: msg.metadata.joinPlan.joinPaths,
                }
              : undefined,
            cannotAnswer: msg.metadata.cannotAnswer,
            durationMs: msg.metadata.durationMs,
            revisionsUsed: msg.metadata.revisionsUsed,
          }
        : undefined,
    })) as DataChatMessage[];
  }, [data]);

  // Default to the last complete assistant message
  const lastAssistantId = useMemo(() => {
    const assistants = messages.filter((m) => m.role === 'assistant' && m.status === 'complete');
    return assistants.length > 0 ? assistants[assistants.length - 1].id : null;
  }, [messages]);

  const tracesMap = useMemo(() => {
    if (!data) return new Map<string, SharedLlmTrace[]>();
    const map = new Map<string, SharedLlmTrace[]>();
    data.messages.forEach((msg, index) => {
      if (msg.traces && msg.traces.length > 0) {
        map.set(`shared-${index}`, msg.traces);
      }
    });
    return map;
  }, [data]);

  const activeMessageId = selectedMessageId ?? lastAssistantId;
  const selectedMessage = messages.find((m) => m.id === activeMessageId);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          gap: 2,
          p: 3,
        }}
      >
        <Typography variant="h4" color="text.secondary">
          {error.status === 410 ? 'Link Expired' : error.status === 404 ? 'Not Found' : 'Error'}
        </Typography>
        <Typography variant="body1" color="text.secondary" textAlign="center">
          {error.message}
        </Typography>
      </Box>
    );
  }

  if (!data) return null;

  const insightsContent = (
    <InsightsPanel
      message={selectedMessage ?? null}
      traces={tracesMap.get(activeMessageId ?? '') ?? []}
      onClose={() => setInsightsOpen(false)}
    />
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Header */}
      <Paper
        elevation={0}
        sx={{
          p: 2,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          bgcolor: 'background.paper',
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="h6">{data.chatName}</Typography>
          {data.ontologyName && <Chip label={data.ontologyName} size="small" variant="outlined" />}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tooltip title={insightsOpen ? 'Hide insights' : 'Show insights'}>
            <IconButton
              onClick={() => setInsightsOpen(!insightsOpen)}
              color={insightsOpen ? 'primary' : 'default'}
              size="small"
            >
              <AnalyticsIcon />
            </IconButton>
          </Tooltip>
          <Typography variant="caption" color="text.secondary">
            Shared conversation
          </Typography>
        </Box>
      </Paper>

      {/* Main content area */}
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Messages */}
        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            px: 3,
            py: 3,
            bgcolor: theme.palette.mode === 'dark' ? 'background.default' : 'grey.50',
          }}
        >
          <Box sx={{ maxWidth: 900, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {messages.map((message) => {
              const isSelectable = message.role === 'assistant' && message.status === 'complete';
              const isSelected = message.id === activeMessageId && insightsOpen;

              return (
                <Box
                  key={message.id}
                  onClick={
                    isSelectable
                      ? () => {
                          setSelectedMessageId(message.id);
                          setInsightsOpen(true);
                        }
                      : undefined
                  }
                  sx={{
                    cursor: isSelectable ? 'pointer' : 'default',
                    borderLeft: isSelected ? 3 : 0,
                    borderColor: isSelected ? 'primary.main' : 'transparent',
                    bgcolor: isSelected ? 'action.hover' : 'transparent',
                    borderRadius: 1,
                    pl: isSelected ? 1 : 0,
                    transition: 'all 0.15s ease',
                    '&:hover': isSelectable ? { bgcolor: 'action.hover' } : {},
                  }}
                >
                  <ChatMessage message={message} isStreaming={false} />
                </Box>
              );
            })}
          </Box>
        </Box>

        {/* Insights Panel — large screen: inline, small screen: drawer */}
        {insightsOpen && isLargeScreen && (
          <Box
            sx={{
              width: 340,
              borderLeft: 1,
              borderColor: 'divider',
              flexShrink: 0,
              overflowY: 'auto',
            }}
          >
            {insightsContent}
          </Box>
        )}
        {!isLargeScreen && (
          <Drawer
            anchor="right"
            open={insightsOpen}
            onClose={() => setInsightsOpen(false)}
            PaperProps={{ sx: { width: 340 } }}
          >
            {insightsContent}
          </Drawer>
        )}
      </Box>

      {/* Footer */}
      <Paper
        elevation={0}
        sx={{
          p: 1.5,
          borderTop: 1,
          borderColor: 'divider',
          textAlign: 'center',
          bgcolor: 'background.paper',
          flexShrink: 0,
        }}
      >
        <Typography variant="caption" color="text.secondary">
          Shared from Knecta Data Agent
        </Typography>
      </Paper>
    </Box>
  );
}

// ---------- Inline Insights Panel ----------

interface InsightsPanelProps {
  message: DataChatMessage | null;
  traces: SharedLlmTrace[];
  onClose: () => void;
}

function InsightsPanel({ message, traces, onClose }: InsightsPanelProps) {
  const [selectedTrace, setSelectedTrace] = useState<LlmTraceRecord | null>(null);

  if (!message) {
    return (
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.paper',
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Click an assistant message to see insights
        </Typography>
      </Box>
    );
  }

  const metadata = message.metadata;
  const plan = metadata?.plan;
  const stepResults = metadata?.stepResults;
  const verificationReport = metadata?.verificationReport;
  const dataLineage = metadata?.dataLineage;
  const joinPlan = metadata?.joinPlan;
  const durationMs = metadata?.durationMs;
  const revisionsUsed = metadata?.revisionsUsed;

  return (
    <Box sx={{ height: '100%', overflowY: 'auto', bgcolor: 'background.paper' }}>
      {/* Panel header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Typography variant="subtitle1" fontWeight={600}>
          Insights
        </Typography>
        <IconButton size="small" onClick={onClose}>
          <ChevronRight />
        </IconButton>
      </Box>

      {/* Duration & Revisions */}
      {(durationMs !== undefined || (revisionsUsed !== undefined && revisionsUsed > 0)) && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, p: 2 }}>
          {durationMs !== undefined && (
            <Box
              sx={{
                bgcolor: 'action.hover',
                borderRadius: 1,
                px: 1.5,
                py: 1,
                flex: '1 1 45%',
                minWidth: 120,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                <AccessTime sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Typography variant="caption" color="text.secondary">
                  Duration
                </Typography>
              </Box>
              <Typography variant="body2" fontWeight="medium">
                {formatDuration(durationMs)}
              </Typography>
            </Box>
          )}
          {revisionsUsed !== undefined && revisionsUsed > 0 && (
            <Box
              sx={{
                bgcolor: 'action.hover',
                borderRadius: 1,
                px: 1.5,
                py: 1,
                flex: '1 1 45%',
                minWidth: 120,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                <Loop sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Typography variant="caption" color="text.secondary">
                  Revisions
                </Typography>
              </Box>
              <Typography variant="body2" fontWeight="medium">
                {revisionsUsed}
              </Typography>
            </Box>
          )}
        </Box>
      )}

      {/* Execution Plan */}
      {plan && plan.steps && plan.steps.length > 0 && (
        <>
          <Divider />
          <Box sx={{ p: 2 }}>
            <Typography variant="subtitle2" fontWeight={600} mb={1}>
              Execution Plan
            </Typography>
            <Box>
              {plan.steps.map((step) => {
                const result = stepResults?.find((sr) => sr.stepId === step.id);
                const hasResult = !!result;
                const hasError = !!result?.error;

                return (
                  <Box
                    key={step.id}
                    sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, py: 0.75 }}
                  >
                    <Box sx={{ flexShrink: 0, mt: 0.25 }}>
                      {hasError ? (
                        <ErrorIcon sx={{ fontSize: 20, color: 'error.main' }} />
                      ) : hasResult ? (
                        <CheckCircle sx={{ fontSize: 20, color: 'success.main' }} />
                      ) : (
                        <RadioButtonUnchecked sx={{ fontSize: 20, color: 'action.disabled' }} />
                      )}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          flexWrap: 'wrap',
                        }}
                      >
                        <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
                          {step.description}
                        </Typography>
                        <Chip
                          size="small"
                          variant="outlined"
                          label={step.strategy.toUpperCase()}
                          sx={{ fontSize: '0.7rem', height: 20 }}
                        />
                      </Box>
                      {result?.sqlResult && (
                        <Typography variant="caption" color="text.secondary">
                          {result.sqlResult.rowCount} row
                          {result.sqlResult.rowCount !== 1 ? 's' : ''}
                          {result.sqlResult.columns
                            ? ` \u00d7 ${result.sqlResult.columns.length} columns`
                            : ''}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>
        </>
      )}

      {/* Join Plan */}
      {joinPlan && joinPlan.relevantDatasets && joinPlan.relevantDatasets.length > 0 && (
        <>
          <Divider />
          <Box sx={{ p: 2 }}>
            <Typography variant="subtitle2" fontWeight={600} mb={1}>
              Join Plan
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              <Chip
                size="small"
                label={`${joinPlan.relevantDatasets.length} dataset${joinPlan.relevantDatasets.length !== 1 ? 's' : ''}`}
                variant="outlined"
              />
              {joinPlan.joinPaths && (
                <Chip
                  size="small"
                  label={`${joinPlan.joinPaths.length} join path${joinPlan.joinPaths.length !== 1 ? 's' : ''}`}
                  variant="outlined"
                />
              )}
            </Box>
          </Box>
        </>
      )}

      {/* Verification */}
      {verificationReport && (
        <>
          <Divider />
          <Box sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography variant="subtitle2" fontWeight={600}>
                Verification
              </Typography>
              <Chip
                size="small"
                label={verificationReport.passed ? 'Passed' : 'Failed'}
                color={verificationReport.passed ? 'success' : 'warning'}
              />
            </Box>
            <Box>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {verificationReport.checks?.map((check: any, idx: number) => (
                <Box
                  key={idx}
                  sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, py: 0.5 }}
                >
                  {check.passed ? (
                    <CheckCircle sx={{ fontSize: 16, color: 'success.main', mt: 0.25 }} />
                  ) : (
                    <Cancel sx={{ fontSize: 16, color: 'warning.main', mt: 0.25 }} />
                  )}
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2">{check.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {check.message}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        </>
      )}

      {/* Data Lineage */}
      {dataLineage && (
        <>
          <Divider />
          <Box sx={{ p: 2 }}>
            <Typography variant="subtitle2" fontWeight={600} mb={1}>
              Data Lineage
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {dataLineage.datasets && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Datasets:
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {dataLineage.datasets.map((dataset: any) => (
                      <Chip key={dataset} size="small" label={dataset} variant="outlined" />
                    ))}
                  </Box>
                </Box>
              )}
              {dataLineage.grain && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Grain:
                  </Typography>
                  <Typography variant="body2">{dataLineage.grain}</Typography>
                </Box>
              )}
              {dataLineage.rowCount != null && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Row Count:
                  </Typography>
                  <Typography variant="body2">
                    {dataLineage.rowCount.toLocaleString()}
                  </Typography>
                </Box>
              )}
              {dataLineage.filters && dataLineage.filters.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Filters:
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {dataLineage.filters.map((f: any, i: number) => (
                      <Chip key={i} size="small" label={f} variant="outlined" />
                    ))}
                  </Box>
                </Box>
              )}
              {dataLineage.timeWindow && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Time Window:
                  </Typography>
                  <Typography variant="body2">{dataLineage.timeWindow}</Typography>
                </Box>
              )}
            </Box>
          </Box>
        </>
      )}

      {/* LLM Traces */}
      {traces.length > 0 && (
        <>
          <Divider />
          <Box sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography variant="subtitle2" fontWeight={600}>
                LLM Traces
              </Typography>
              <Chip size="small" label={`${traces.length} calls`} variant="outlined" />
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {traces.map((trace, idx) => {
                const phaseColor = PHASE_COLORS[trace.phase] || 'default';
                const phaseLabel = PHASE_LABELS[trace.phase] || trace.phase;

                return (
                  <Accordion
                    key={idx}
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
                        <Chip
                          size="small"
                          label={phaseLabel}
                          color={phaseColor}
                          sx={{ fontSize: '0.7rem', height: 22 }}
                        />
                        <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
                          {trace.purpose}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatDuration(trace.durationMs)}
                        </Typography>
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails sx={{ px: 2, py: 1 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                        {trace.promptTokens.toLocaleString()} in / {trace.completionTokens.toLocaleString()} out
                      </Typography>
                      {trace.responseContent && (
                        <Box
                          sx={{
                            fontSize: '0.8rem',
                            bgcolor: 'action.hover',
                            p: 1,
                            borderRadius: 1,
                            mb: 1,
                            maxHeight: 120,
                            overflow: 'hidden',
                            position: 'relative',
                            '&::after': {
                              content: '""',
                              position: 'absolute',
                              bottom: 0,
                              left: 0,
                              right: 0,
                              height: 40,
                              background: 'linear-gradient(transparent, var(--bg, rgba(0,0,0,0.03)))',
                            },
                          }}
                        >
                          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {trace.responseContent.length > 300
                              ? `${trace.responseContent.slice(0, 300)}...`
                              : trace.responseContent}
                          </Typography>
                        </Box>
                      )}
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => setSelectedTrace(sharedTraceToRecord(trace, idx))}
                      >
                        View Full
                      </Button>
                    </AccordionDetails>
                  </Accordion>
                );
              })}
            </Box>
            {/* Token summary */}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
              <Chip
                size="small"
                variant="outlined"
                label={`${traces.reduce((sum, t) => sum + t.promptTokens, 0).toLocaleString()} in`}
              />
              <Chip
                size="small"
                variant="outlined"
                label={`${traces.reduce((sum, t) => sum + t.completionTokens, 0).toLocaleString()} out`}
              />
              <Chip
                size="small"
                variant="outlined"
                label={`${traces.reduce((sum, t) => sum + t.totalTokens, 0).toLocaleString()} total`}
              />
            </Box>
          </Box>
        </>
      )}

      {/* Cannot Answer */}
      {metadata?.cannotAnswer && (
        <>
          <Divider />
          <Box sx={{ p: 2 }}>
            <Typography variant="subtitle2" fontWeight={600} color="warning.main" mb={1}>
              Cannot Answer
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {typeof metadata.cannotAnswer === 'object' &&
              metadata.cannotAnswer !== null &&
              'reason' in metadata.cannotAnswer
                ? (metadata.cannotAnswer as { reason: string }).reason
                : 'The agent was unable to fully answer this question.'}
            </Typography>
          </Box>
        </>
      )}

      {/* Trace Detail Dialog */}
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
