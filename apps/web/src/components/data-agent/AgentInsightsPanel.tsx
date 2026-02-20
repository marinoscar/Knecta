import { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Divider,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Button,
} from '@mui/material';
import {
  ChevronRight,
  AccessTime,
  FormatListNumbered,
  RadioButtonUnchecked,
  Loop,
  CheckCircle,
  Error,
  Cancel,
  AccountTree,
  TravelExplore,
  SmartToy,
  Code,
  ExpandMore,
} from '@mui/icons-material';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import sql from 'react-syntax-highlighter/dist/esm/languages/hljs/sql';
import { vs2015 } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import type { DataChatMessage, DataAgentStreamEvent } from '../../types';
import {
  extractPlan,
  extractStepStatuses,
  extractPhaseDetails,
  extractLiveTokens,
  extractJoinPlan,
  extractDiscovery,
  formatDuration,
  formatTokenCount,
  formatDurationMs,
} from './insightsUtils';
import { useElapsedTimer } from '../../hooks/useElapsedTimer';
import { useMessageInsights } from '../../hooks/useMessageInsights';
import { JoinGraphDialog } from './JoinGraphDialog';
import { LlmTracesSection } from './LlmTracesSection';
import type { PhaseDetailWithTiming } from './traceInsightsParser';

SyntaxHighlighter.registerLanguage('sql', sql);

interface AgentInsightsPanelProps {
  messages: DataChatMessage[];
  streamEvents: DataAgentStreamEvent[];
  isStreaming: boolean;
  onClose: () => void;
  selectedMessageId?: string;
  chatId?: string;
}

export function AgentInsightsPanel({
  messages,
  streamEvents,
  isStreaming,
  onClose,
  selectedMessageId,
  chatId,
}: AgentInsightsPanelProps) {
  // Resolve target message: selected or last assistant message
  const lastAssistantMessage = messages.filter((m) => m.role === 'assistant').pop();
  const targetMessage = useMemo(() => {
    if (selectedMessageId) {
      return messages.find((m) => m.id === selectedMessageId) ?? lastAssistantMessage;
    }
    return lastAssistantMessage;
  }, [selectedMessageId, messages, lastAssistantMessage]);

  // Find the user question that preceded the target message
  const userQuestion = useMemo(() => {
    if (!targetMessage) return null;
    const idx = messages.findIndex((m) => m.id === targetMessage.id);
    if (idx > 0 && messages[idx - 1].role === 'user') {
      return messages[idx - 1].content;
    }
    return null;
  }, [targetMessage, messages]);

  // Mode detection
  const isLiveMode = isStreaming && targetMessage?.status === 'generating';
  const metadata = !isLiveMode ? targetMessage?.metadata : null;

  // Fetch and derive insights from traces (history mode only)
  const { traces, insights, isLoading: insightsLoading } = useMessageInsights({
    chatId,
    messageId: targetMessage?.id,
    metadata,
    enabled: !isLiveMode && !!targetMessage,
  });

  // Extract data — use trace-derived insights in history mode, stream events in live mode
  const plan = isLiveMode
    ? extractPlan(streamEvents, metadata, true)
    : insights?.plan ?? extractPlan(streamEvents, metadata, false);

  const stepStatuses = isLiveMode
    ? extractStepStatuses(plan, streamEvents, metadata, true)
    : insights?.stepStatuses.length
      ? insights.stepStatuses
      : extractStepStatuses(plan, streamEvents, metadata, false);

  const phaseDetails = isLiveMode
    ? extractPhaseDetails(streamEvents, metadata, true)
    : insights?.phaseDetails.length
      ? insights.phaseDetails
      : extractPhaseDetails(streamEvents, metadata, false);

  const joinPlan = isLiveMode
    ? extractJoinPlan(streamEvents, metadata, true)
    : insights?.joinPlan ?? extractJoinPlan(streamEvents, metadata, false);

  const discovery = extractDiscovery(streamEvents, metadata, isLiveMode);

  // State
  const [joinGraphOpen, setJoinGraphOpen] = useState(false);

  // Live timer
  const startedAt = isLiveMode
    ? streamEvents.find((e) => e.type === 'message_start')?.startedAt || null
    : targetMessage?.metadata?.startedAt || null;
  const liveElapsed = useElapsedTimer(startedAt, isLiveMode);

  // Compute duration — prefer trace-derived in history mode
  const duration = isLiveMode
    ? liveElapsed
    : insights?.durationMs
      ? formatDuration(insights.durationMs)
      : metadata?.durationMs
        ? formatDuration(metadata.durationMs)
        : '--';

  // Token stats
  const liveTokens = isLiveMode ? extractLiveTokens(streamEvents) : null;
  const tokenSource = isLiveMode
    ? liveTokens
    : insights?.tokens.total
      ? insights.tokens
      : metadata?.tokensUsed;
  const inputTokens = tokenSource?.prompt ? formatTokenCount(tokenSource.prompt) : '--';
  const outputTokens = tokenSource?.completion ? formatTokenCount(tokenSource.completion) : '--';
  const totalTokens = tokenSource?.total ? formatTokenCount(tokenSource.total) : '--';

  // Provider/model from traces
  const providerModel = insights?.providerModel ?? null;

  // SQL queries from traces
  const sqlQueries = insights?.sqlQueries ?? [];

  // Verification & lineage — metadata only
  const verificationReport = insights?.verificationReport ?? metadata?.verificationReport;
  const dataLineage = insights?.dataLineage ?? metadata?.dataLineage;

  // Filter phases for display
  const visiblePhases = phaseDetails.filter((pd) =>
    isLiveMode
      ? pd.status !== 'pending' || phaseDetails.some((p) => p.status !== 'pending')
      : pd.status !== 'pending',
  );

  // Empty state
  if (!targetMessage) {
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
          Send a message to see insights
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: '100%',
        overflowY: 'auto',
        bgcolor: 'background.paper',
      }}
    >
      {/* Header */}
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

      {/* User Question Context */}
      {userQuestion && !isLiveMode && (
        <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
            Question
          </Typography>
          <Typography
            variant="body2"
            sx={{
              bgcolor: 'action.hover',
              borderRadius: 1,
              px: 1.5,
              py: 1,
              fontStyle: 'italic',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {userQuestion}
          </Typography>
        </Box>
      )}

      {/* Loading indicator */}
      {insightsLoading && !isLiveMode && (
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Loading trace data...
          </Typography>
        </Box>
      )}

      {/* Stats Row */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1.5,
          p: 2,
        }}
      >
        {/* Duration */}
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
            {duration}
          </Typography>
        </Box>

        {/* Input Tokens */}
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
            <FormatListNumbered sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Typography variant="caption" color="text.secondary">
              Input
            </Typography>
          </Box>
          <Typography variant="body2" fontWeight="medium">
            {inputTokens}
          </Typography>
        </Box>

        {/* Output Tokens */}
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
            <FormatListNumbered sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Typography variant="caption" color="text.secondary">
              Output
            </Typography>
          </Box>
          <Typography variant="body2" fontWeight="medium">
            {outputTokens}
          </Typography>
        </Box>

        {/* Total Tokens */}
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
            <FormatListNumbered sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Typography variant="caption" color="text.secondary">
              Total
            </Typography>
          </Box>
          <Typography variant="body2" fontWeight="medium">
            {totalTokens}
          </Typography>
        </Box>

        {/* Provider / Model */}
        {providerModel && (
          <Box
            sx={{
              bgcolor: 'action.hover',
              borderRadius: 1,
              px: 1.5,
              py: 1,
              flex: '1 1 100%',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
              <SmartToy sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary">
                Model
              </Typography>
            </Box>
            <Typography variant="body2" fontWeight="medium">
              {providerModel.provider} / {providerModel.model}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Dataset Discovery Section */}
      {discovery && (
        <>
          <Divider />
          <Box sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <TravelExplore sx={{ fontSize: 18, color: 'text.secondary' }} />
              <Typography variant="subtitle2" fontWeight={600}>
                Dataset Discovery
              </Typography>
              {discovery.status === 'running' && (
                <Chip size="small" label="running" color="primary" sx={{ fontSize: '0.7rem', height: 20 }} />
              )}
              {discovery.status === 'complete' && (
                <Chip size="small" label="complete" color="success" sx={{ fontSize: '0.7rem', height: 20 }} />
              )}
            </Box>

            {discovery.status === 'running' ? (
              <Typography variant="body2" color="text.secondary">
                Searching for relevant datasets...
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {discovery.matchedDatasets.length > 0 && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Matched Datasets ({discovery.matchedDatasets.length})
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                      {discovery.matchedDatasets.map((ds) => (
                        <Chip
                          key={ds.name}
                          size="small"
                          label={`${ds.name} (${(ds.score * 100).toFixed(0)}%)`}
                          variant="outlined"
                          sx={{ fontSize: '0.75rem' }}
                        />
                      ))}
                    </Box>
                  </Box>
                )}
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  <Chip
                    size="small"
                    label={`${discovery.datasetsWithYaml} schemas loaded`}
                    variant="outlined"
                    sx={{ fontSize: '0.75rem' }}
                  />
                  {discovery.preferencesLoaded > 0 && (
                    <Chip
                      size="small"
                      label={`${discovery.preferencesLoaded} preferences`}
                      variant="outlined"
                      sx={{ fontSize: '0.75rem' }}
                    />
                  )}
                </Box>
                {discovery.embeddingDurationMs !== undefined && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Timing
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 0.5 }}>
                      <Typography variant="caption">
                        Embedding: {formatDurationMs(discovery.embeddingDurationMs)}
                      </Typography>
                      {discovery.vectorSearchDurationMs !== undefined && (
                        <Typography variant="caption">
                          Vector Search: {formatDurationMs(discovery.vectorSearchDurationMs)}
                        </Typography>
                      )}
                      {discovery.yamlFetchDurationMs !== undefined && (
                        <Typography variant="caption">
                          YAML Fetch: {formatDurationMs(discovery.yamlFetchDurationMs)}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                )}
              </Box>
            )}
          </Box>
        </>
      )}

      {/* Execution Plan Section */}
      <Divider />
      <Box sx={{ p: 2 }}>
        <Typography variant="subtitle2" fontWeight={600} mb={1}>
          Execution Plan
        </Typography>
        {!plan ? (
          <Typography variant="body2" color="text.secondary">
            {isLiveMode ? 'Waiting for plan...' : 'No plan data'}
          </Typography>
        ) : (
          <Box>
            {stepStatuses.map((step) => (
              <Box
                key={step.stepId}
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 1,
                  py: 0.75,
                }}
              >
                <Box sx={{ flexShrink: 0, mt: 0.25 }}>
                  {step.status === 'pending' && (
                    <RadioButtonUnchecked sx={{ fontSize: 20, color: 'action.disabled' }} />
                  )}
                  {step.status === 'running' && (
                    <Loop
                      sx={{
                        fontSize: 20,
                        color: 'primary.main',
                        '@keyframes spin': {
                          '0%': { transform: 'rotate(0deg)' },
                          '100%': { transform: 'rotate(360deg)' },
                        },
                        animation: 'spin 1s linear infinite',
                      }}
                    />
                  )}
                  {step.status === 'complete' && (
                    <CheckCircle sx={{ fontSize: 20, color: 'success.main' }} />
                  )}
                  {step.status === 'failed' && (
                    <Error sx={{ fontSize: 20, color: 'error.main' }} />
                  )}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      flexWrap: 'wrap',
                      mb: step.resultSummary ? 0.5 : 0,
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
                  {step.resultSummary && (
                    <Typography variant="caption" color="text.secondary">
                      {step.resultSummary}
                    </Typography>
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {/* Phase Details Section */}
      {visiblePhases.length > 0 && (
        <>
          <Divider />
          <Box sx={{ p: 2 }}>
            <Typography variant="subtitle2" fontWeight={600} mb={1}>
              Phase Details
            </Typography>
            {visiblePhases.map((phase) => {
              const phaseTiming = (phase as PhaseDetailWithTiming).durationMs;
              const phaseTokens = (phase as PhaseDetailWithTiming).tokens;

              return (
                <Accordion
                  key={phase.phase}
                  disableGutters
                  elevation={0}
                  sx={{
                    '&:before': { display: 'none' },
                    bgcolor: 'transparent',
                  }}
                >
                  <AccordionSummary
                    sx={{
                      px: 1,
                      minHeight: 40,
                      '&.Mui-expanded': { minHeight: 40 },
                      '& .MuiAccordionSummary-content': { my: 1 },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          bgcolor:
                            phase.status === 'complete'
                              ? 'success.main'
                              : phase.status === 'active'
                                ? 'primary.main'
                                : 'action.disabled',
                          ...(phase.status === 'active' && {
                            '@keyframes pulse': {
                              '0%, 100%': { opacity: 1 },
                              '50%': { opacity: 0.5 },
                            },
                            animation: 'pulse 1.5s ease-in-out infinite',
                          }),
                        }}
                      />
                      <Typography variant="body2" sx={{ flex: 1 }}>
                        {phase.label}
                      </Typography>
                      {/* Per-phase timing from traces */}
                      {phaseTiming > 0 && (
                        <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                          {formatDurationMs(phaseTiming)}
                        </Typography>
                      )}
                      {phaseTokens?.total > 0 && (
                        <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                          {formatTokenCount(phaseTokens.total)} tok
                        </Typography>
                      )}
                      <Chip
                        size="small"
                        label={phase.status}
                        color={
                          phase.status === 'complete'
                            ? 'success'
                            : phase.status === 'active'
                              ? 'primary'
                              : 'default'
                        }
                        sx={{ fontSize: '0.7rem', height: 20 }}
                      />
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails sx={{ px: 2, py: 1 }}>
                    {phase.toolCalls.length === 0 ? (
                      <Typography variant="caption" color="text.secondary" fontStyle="italic">
                        No tools used
                      </Typography>
                    ) : (
                      <Box>
                        {phase.toolCalls.map((toolCall, idx) => (
                          <Typography
                            key={idx}
                            variant="caption"
                            component="div"
                            sx={{ mb: 0.5 }}
                          >
                            <strong>{toolCall.name}</strong>
                            {toolCall.result && (
                              <>
                                {': '}
                                {toolCall.result.length > 100
                                  ? `${toolCall.result.slice(0, 100)}...`
                                  : toolCall.result}
                              </>
                            )}
                          </Typography>
                        ))}
                      </Box>
                    )}
                  </AccordionDetails>
                </Accordion>
              );
            })}
          </Box>
        </>
      )}

      {/* SQL Queries Section (from traces) */}
      {sqlQueries.length > 0 && (
        <>
          <Divider />
          <Box sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Code sx={{ fontSize: 18, color: 'text.secondary' }} />
              <Typography variant="subtitle2" fontWeight={600}>
                SQL Queries
              </Typography>
              <Chip size="small" label={`${sqlQueries.length}`} variant="outlined" sx={{ height: 20 }} />
            </Box>
            {sqlQueries.map((query) => (
              <Accordion
                key={query.stepId}
                disableGutters
                elevation={0}
                sx={{
                  '&:before': { display: 'none' },
                  bgcolor: 'transparent',
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMore />}
                  sx={{
                    px: 1,
                    minHeight: 36,
                    '&.Mui-expanded': { minHeight: 36 },
                    '& .MuiAccordionSummary-content': { my: 0.5 },
                  }}
                >
                  <Typography variant="body2">
                    Step {query.stepId}: {query.description}
                  </Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ p: 0 }}>
                  <SyntaxHighlighter
                    language="sql"
                    style={vs2015}
                    customStyle={{
                      margin: 0,
                      borderRadius: 4,
                      fontSize: '0.8rem',
                      maxHeight: 200,
                    }}
                    wrapLongLines
                  >
                    {query.sql}
                  </SyntaxHighlighter>
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        </>
      )}

      {/* LLM Traces Section */}
      <Divider />
      <Box sx={{ p: 2 }}>
        <LlmTracesSection
          streamEvents={streamEvents}
          isLiveMode={isLiveMode}
          chatId={chatId ?? targetMessage?.chatId}
          messageId={targetMessage?.id}
          historyTraces={!isLiveMode ? traces : undefined}
        />
      </Box>

      {/* Join Graph Section */}
      {joinPlan && joinPlan.relevantDatasets.length > 0 && (
        <>
          <Divider />
          <Box sx={{ p: 2 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                mb: 1,
              }}
            >
              <Typography variant="subtitle2" fontWeight={600}>
                Join Graph
              </Typography>
              <Button
                size="small"
                variant="outlined"
                startIcon={<AccountTree />}
                onClick={() => setJoinGraphOpen(true)}
              >
                View
              </Button>
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              <Chip
                size="small"
                label={`${joinPlan.relevantDatasets.length} datasets`}
                variant="outlined"
              />
              <Chip
                size="small"
                label={`${joinPlan.joinPaths.length} join paths`}
                variant="outlined"
              />
            </Box>
          </Box>
          <JoinGraphDialog
            joinPlan={joinPlan}
            open={joinGraphOpen}
            onClose={() => setJoinGraphOpen(false)}
          />
        </>
      )}

      {/* Verification Summary */}
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
              {verificationReport.checks.map((check: any, idx: number) => (
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
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Datasets:
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                  {dataLineage.datasets.map((dataset: string) => (
                    <Chip key={dataset} size="small" label={dataset} variant="outlined" />
                  ))}
                </Box>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Grain:
                </Typography>
                <Typography variant="body2">{dataLineage.grain}</Typography>
              </Box>
              {dataLineage.rowCount !== null && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Row Count:
                  </Typography>
                  <Typography variant="body2">
                    {dataLineage.rowCount.toLocaleString()}
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        </>
      )}
    </Box>
  );
}
