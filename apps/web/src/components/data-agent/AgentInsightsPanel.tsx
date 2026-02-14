import {
  Box,
  Typography,
  IconButton,
  Divider,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
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
} from '@mui/icons-material';
import type { DataChatMessage, DataAgentStreamEvent } from '../../types';
import {
  extractPlan,
  extractStepStatuses,
  extractPhaseDetails,
  formatDuration,
  formatTokenCount,
} from './insightsUtils';
import { useElapsedTimer } from '../../hooks/useElapsedTimer';

interface AgentInsightsPanelProps {
  messages: DataChatMessage[];
  streamEvents: DataAgentStreamEvent[];
  isStreaming: boolean;
  onClose: () => void;
}

export function AgentInsightsPanel({
  messages,
  streamEvents,
  isStreaming,
  onClose,
}: AgentInsightsPanelProps) {
  // Mode detection
  const lastAssistantMessage = messages.filter((m) => m.role === 'assistant').pop();
  const isLiveMode = isStreaming && lastAssistantMessage?.status === 'generating';
  const metadata = !isLiveMode ? lastAssistantMessage?.metadata : null;

  // Extract data
  const plan = extractPlan(streamEvents, metadata, isLiveMode);
  const stepStatuses = extractStepStatuses(plan, streamEvents, metadata, isLiveMode);
  const phaseDetails = extractPhaseDetails(streamEvents, metadata, isLiveMode);

  // Live timer — read startedAt from the message_start stream event (not from metadata, which isn't set until completion)
  const startedAt = isLiveMode
    ? streamEvents.find((e) => e.type === 'message_start')?.startedAt || null
    : lastAssistantMessage?.metadata?.startedAt || null;
  const liveElapsed = useElapsedTimer(startedAt, isLiveMode);

  // Compute duration
  const duration = isLiveMode
    ? liveElapsed
    : metadata?.durationMs
      ? formatDuration(metadata.durationMs)
      : '--';

  // Token stats
  const inputTokens = metadata?.tokensUsed?.prompt
    ? formatTokenCount(metadata.tokensUsed.prompt)
    : '--';
  const outputTokens = metadata?.tokensUsed?.completion
    ? formatTokenCount(metadata.tokensUsed.completion)
    : '--';
  const totalTokens = metadata?.tokensUsed?.total
    ? formatTokenCount(metadata.tokensUsed.total)
    : '--';

  // Filter phases for display
  const visiblePhases = phaseDetails.filter((pd) =>
    isLiveMode ? pd.status !== 'pending' || phaseDetails.some((p) => p.status !== 'pending') : pd.status !== 'pending'
  );

  // Empty state
  if (!lastAssistantMessage) {
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
      </Box>

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
                {/* Status Icon */}
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

                {/* Step Details */}
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
            {visiblePhases.map((phase) => (
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
                    {/* Status Dot */}
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
            ))}
          </Box>
        </>
      )}

      {/* Verification Summary */}
      {metadata?.verificationReport && (
        <>
          <Divider />
          <Box sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography variant="subtitle2" fontWeight={600}>
                Verification
              </Typography>
              <Chip
                size="small"
                label={metadata.verificationReport.passed ? 'Passed' : 'Failed'}
                color={metadata.verificationReport.passed ? 'success' : 'warning'}
              />
            </Box>
            <Box>
              {metadata.verificationReport.checks.map((check: any, idx: number) => (
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
      {metadata?.dataLineage && (
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
                  {metadata.dataLineage.datasets.map((dataset: string) => (
                    <Chip key={dataset} size="small" label={dataset} variant="outlined" />
                  ))}
                </Box>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Grain:
                </Typography>
                <Typography variant="body2">{metadata.dataLineage.grain}</Typography>
              </Box>
              {metadata.dataLineage.rowCount !== null && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Row Count:
                  </Typography>
                  <Typography variant="body2">
                    {metadata.dataLineage.rowCount.toLocaleString()}
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
