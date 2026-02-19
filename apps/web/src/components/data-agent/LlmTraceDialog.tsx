import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Box,
  Typography,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Close as CloseIcon,
  ExpandMore as ExpandMoreIcon,
  Person as PersonIcon,
  SmartToy as BotIcon,
  Build as ToolIcon,
  Settings as SystemIcon,
} from '@mui/icons-material';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import json from 'react-syntax-highlighter/dist/esm/languages/hljs/json';
import github from 'react-syntax-highlighter/dist/esm/styles/hljs/github';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { LlmTraceRecord } from '../../types';
import { formatDuration, formatTokenCount, PHASE_LABELS } from './insightsUtils';

// Register JSON language
SyntaxHighlighter.registerLanguage('json', json);

interface LlmTraceDialogProps {
  trace: LlmTraceRecord;
  open: boolean;
  onClose: () => void;
}

// Phase color mapping
const PHASE_COLORS: Record<string, 'info' | 'secondary' | 'primary' | 'warning' | 'success' | 'default'> = {
  planner: 'info',
  navigator: 'secondary',
  sql_builder: 'primary',
  executor: 'warning',
  verifier: 'success',
  explainer: 'default',
};

// Role icons
const ROLE_ICONS: Record<string, React.ReactNode> = {
  system: <SystemIcon fontSize="small" />,
  human: <PersonIcon fontSize="small" />,
  ai: <BotIcon fontSize="small" />,
  tool: <ToolIcon fontSize="small" />,
};

// Format JSON if possible
function formatJsonIfPossible(content: string): string {
  try {
    const parsed = JSON.parse(content);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return content;
  }
}

export function LlmTraceDialog({ trace, open, onClose }: LlmTraceDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [expandedMessages, setExpandedMessages] = useState<Set<number>>(new Set([0]));

  const phaseColor = PHASE_COLORS[trace.phase] || 'default';
  const phaseLabel = PHASE_LABELS[trace.phase] || trace.phase;

  const toggleMessage = (index: number) => {
    setExpandedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{
        sx: {
          height: isMobile ? '100%' : '90vh',
        },
      }}
    >
      {/* Title */}
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: 1,
          borderColor: 'divider',
          pb: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Chip
            size="small"
            label={phaseLabel}
            color={phaseColor}
            sx={{ fontSize: '0.75rem', height: 24 }}
          />
          <Typography variant="h6" component="span">
            {trace.purpose}
          </Typography>
        </Box>
        <IconButton onClick={onClose} edge="end">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      {/* Header Stats */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2,
          px: 3,
          pt: 2,
          pb: 1,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Box>
          <Typography variant="caption" color="text.secondary">
            Provider / Model
          </Typography>
          <Typography variant="body2" fontWeight="medium">
            {trace.provider} / {trace.model}
          </Typography>
        </Box>

        <Box>
          <Typography variant="caption" color="text.secondary">
            Duration
          </Typography>
          <Typography variant="body2" fontWeight="medium">
            {formatDuration(trace.durationMs)}
          </Typography>
        </Box>

        <Box>
          <Typography variant="caption" color="text.secondary">
            Tokens (in / out / total)
          </Typography>
          <Typography variant="body2" fontWeight="medium">
            {formatTokenCount(trace.promptTokens)} / {formatTokenCount(trace.completionTokens)} /{' '}
            {formatTokenCount(trace.totalTokens)}
          </Typography>
        </Box>

        {trace.temperature !== null && (
          <Box>
            <Typography variant="caption" color="text.secondary">
              Temperature
            </Typography>
            <Typography variant="body2" fontWeight="medium">
              {trace.temperature}
            </Typography>
          </Box>
        )}

        {trace.structuredOutput && (
          <Box>
            <Chip
              size="small"
              label="Structured Output"
              color="primary"
              variant="outlined"
              sx={{ mt: 0.5 }}
            />
          </Box>
        )}
      </Box>

      {/* Content */}
      <DialogContent sx={{ p: 0, overflow: 'auto' }}>
        {/* Error Section */}
        {trace.error && (
          <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Alert severity="error">
              <Typography variant="body2">{trace.error}</Typography>
            </Alert>
          </Box>
        )}

        {/* Prompt Messages Section */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Accordion defaultExpanded disableGutters elevation={0}>
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              sx={{
                px: 2,
                bgcolor: 'action.hover',
                borderBottom: 1,
                borderColor: 'divider',
              }}
            >
              <Typography variant="subtitle2" fontWeight={600}>
                Prompt Messages ({trace.promptMessages.length})
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              {trace.promptMessages.map((msg, idx) => {
                const isLong = msg.content.length > 5000;
                const isExpanded = expandedMessages.has(idx);
                const displayContent = isLong && !isExpanded
                  ? msg.content.slice(0, 2000)
                  : msg.content;

                return (
                  <Box
                    key={idx}
                    sx={{
                      borderBottom: idx < trace.promptMessages.length - 1 ? 1 : 0,
                      borderColor: 'divider',
                      p: 2,
                    }}
                  >
                    {/* Role Label */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      {ROLE_ICONS[msg.role.toLowerCase()] || <PersonIcon fontSize="small" />}
                      <Typography variant="caption" fontWeight={600} textTransform="uppercase">
                        {msg.role}
                      </Typography>
                    </Box>

                    {/* Content */}
                    <Box
                      sx={{
                        fontSize: '0.875rem',
                        bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100',
                        p: 1.5,
                        borderRadius: 1,
                        overflowX: 'auto',
                        '& p': { my: 0.5 },
                        '& p:first-of-type': { mt: 0 },
                        '& p:last-of-type': { mb: 0 },
                        '& pre': { my: 1, p: 1.5, borderRadius: 1, overflow: 'auto', bgcolor: theme.palette.mode === 'dark' ? 'grey.800' : 'grey.200' },
                        '& code': { fontFamily: 'monospace', fontSize: '0.85em', bgcolor: theme.palette.action.hover, px: 0.5, py: 0.25, borderRadius: 0.5 },
                        '& pre code': { bgcolor: 'transparent', p: 0 },
                        '& table': { borderCollapse: 'collapse', width: '100%', my: 1 },
                        '& th, & td': { border: '1px solid', borderColor: 'divider', px: 1, py: 0.5, textAlign: 'left' },
                        '& th': { bgcolor: theme.palette.action.hover, fontWeight: 600 },
                        '& ul, & ol': { pl: 2.5, my: 0.5 },
                        '& blockquote': { borderLeft: 3, borderColor: 'divider', pl: 2, my: 1, color: 'text.secondary' },
                      }}
                    >
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {displayContent}
                      </ReactMarkdown>
                    </Box>

                    {/* Show Full toggle */}
                    {isLong && (
                      <Box sx={{ mt: 1 }}>
                        <Typography
                          variant="caption"
                          color="primary"
                          sx={{ cursor: 'pointer', textDecoration: 'underline' }}
                          onClick={() => toggleMessage(idx)}
                        >
                          {isExpanded ? 'Show less' : 'Show full'}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                );
              })}
            </AccordionDetails>
          </Accordion>
        </Box>

        {/* Response Section */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Accordion defaultExpanded disableGutters elevation={0}>
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              sx={{
                px: 2,
                bgcolor: 'action.hover',
                borderBottom: 1,
                borderColor: 'divider',
              }}
            >
              <Typography variant="subtitle2" fontWeight={600}>
                Response
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 2 }}>
              {trace.structuredOutput ? (
                <SyntaxHighlighter
                  language="json"
                  style={github}
                  customStyle={{
                    margin: 0,
                    borderRadius: 4,
                    fontSize: '0.875rem',
                  }}
                >
                  {formatJsonIfPossible(trace.responseContent)}
                </SyntaxHighlighter>
              ) : (
                <Box
                  sx={{
                    fontSize: '0.875rem',
                    bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100',
                    p: 1.5,
                    borderRadius: 1,
                    overflowX: 'auto',
                    '& p': { my: 0.5 },
                    '& p:first-of-type': { mt: 0 },
                    '& p:last-of-type': { mb: 0 },
                    '& pre': { my: 1, p: 1.5, borderRadius: 1, overflow: 'auto', bgcolor: theme.palette.mode === 'dark' ? 'grey.800' : 'grey.200' },
                    '& code': { fontFamily: 'monospace', fontSize: '0.85em', bgcolor: theme.palette.action.hover, px: 0.5, py: 0.25, borderRadius: 0.5 },
                    '& pre code': { bgcolor: 'transparent', p: 0 },
                    '& table': { borderCollapse: 'collapse', width: '100%', my: 1 },
                    '& th, & td': { border: '1px solid', borderColor: 'divider', px: 1, py: 0.5, textAlign: 'left' },
                    '& th': { bgcolor: theme.palette.action.hover, fontWeight: 600 },
                    '& ul, & ol': { pl: 2.5, my: 0.5 },
                    '& blockquote': { borderLeft: 3, borderColor: 'divider', pl: 2, my: 1, color: 'text.secondary' },
                  }}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {trace.responseContent}
                  </ReactMarkdown>
                </Box>
              )}
            </AccordionDetails>
          </Accordion>
        </Box>

        {/* Tool Calls Section */}
        {trace.toolCalls && trace.toolCalls.length > 0 && (
          <Box>
            <Accordion disableGutters elevation={0}>
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                sx={{
                  px: 2,
                  bgcolor: 'action.hover',
                  borderBottom: 1,
                  borderColor: 'divider',
                }}
              >
                <Typography variant="subtitle2" fontWeight={600}>
                  Tool Calls ({trace.toolCalls.length})
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 2 }}>
                {trace.toolCalls.map((tc, idx) => (
                  <Box
                    key={idx}
                    sx={{
                      mb: idx < trace.toolCalls!.length - 1 ? 2 : 0,
                    }}
                  >
                    <Typography variant="body2" fontWeight={600} mb={1}>
                      {tc.name}
                    </Typography>
                    <SyntaxHighlighter
                      language="json"
                      style={github}
                      customStyle={{
                        margin: 0,
                        borderRadius: 4,
                        fontSize: '0.875rem',
                      }}
                    >
                      {JSON.stringify(tc.args, null, 2)}
                    </SyntaxHighlighter>
                  </Box>
                ))}
              </AccordionDetails>
            </Accordion>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
