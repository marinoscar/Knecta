import { useState } from 'react';
import {
  Box,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Chip,
  CircularProgress,
  Button,
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon, Build as BuildIcon } from '@mui/icons-material';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getDataTableComponents } from './DataTable';
import type { DataAgentStreamEvent } from '../../types';

interface ToolCallAccordionProps {
  events: DataAgentStreamEvent[];
  isStreaming: boolean;
}

interface ToolCall {
  name: string;
  args?: Record<string, unknown>;
  result?: string;
  isComplete: boolean;
}

function extractToolCalls(events: DataAgentStreamEvent[]): ToolCall[] {
  const toolCalls: Map<string, ToolCall> = new Map();

  for (const event of events) {
    if (event.type === 'tool_call' && event.name) {
      toolCalls.set(event.name, {
        name: event.name,
        args: event.args,
        result: undefined,
        isComplete: false,
      });
    } else if (event.type === 'tool_result' && event.name) {
      const existing = toolCalls.get(event.name);
      if (existing) {
        existing.result = event.result;
        existing.isComplete = true;
      }
    }
  }

  return Array.from(toolCalls.values());
}

export function ToolCallAccordion({ events, isStreaming }: ToolCallAccordionProps) {
  const toolCalls = extractToolCalls(events);
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());

  if (toolCalls.length === 0) return null;

  const toggleExpanded = (toolName: string) => {
    setExpandedResults((prev) => {
      const next = new Set(prev);
      if (next.has(toolName)) {
        next.delete(toolName);
      } else {
        next.add(toolName);
      }
      return next;
    });
  };

  return (
    <Box sx={{ mb: 2 }}>
      {toolCalls.map((toolCall, index) => {
        const isExpanded = expandedResults.has(toolCall.name);

        if (!toolCall.isComplete && isStreaming) {
          // Show collapsed chip with spinner during streaming
          return (
            <Chip
              key={`${toolCall.name}-${index}`}
              icon={<BuildIcon />}
              label={`Running ${toolCall.name}...`}
              sx={{
                mb: 1,
                mr: 1,
                '& .MuiChip-icon': {
                  animation: 'pulse 1.5s infinite',
                  '@keyframes pulse': {
                    '0%, 100%': { opacity: 1 },
                    '50%': { opacity: 0.5 },
                  },
                },
              }}
            />
          );
        }

        return (
          <Accordion
            key={`${toolCall.name}-${index}`}
            defaultExpanded={false}
            sx={{
              mb: 1,
              '&:before': { display: 'none' },
              boxShadow: 1,
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              sx={{
                bgcolor: 'action.hover',
                '&:hover': { bgcolor: 'action.selected' },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <BuildIcon fontSize="small" color="action" />
                <Typography variant="body2" fontWeight="medium">
                  {toolCall.name}
                </Typography>
                {!toolCall.isComplete && (
                  <CircularProgress size={16} sx={{ ml: 1 }} />
                )}
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Box>
                {/* Tool Arguments */}
                {toolCall.args && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" fontWeight="bold" sx={{ mb: 0.5, display: 'block' }}>
                      Input:
                    </Typography>
                    <SyntaxHighlighter
                      language="json"
                      style={oneDark}
                      customStyle={{
                        fontSize: '0.75rem',
                        borderRadius: 4,
                        margin: 0,
                      }}
                    >
                      {JSON.stringify(toolCall.args, null, 2)}
                    </SyntaxHighlighter>
                  </Box>
                )}

                {/* Tool Result */}
                {toolCall.result && (
                  <Box>
                    <Typography variant="caption" fontWeight="bold" sx={{ mb: 0.5, display: 'block' }}>
                      Output:
                    </Typography>
                    <Box
                      sx={{
                        maxHeight: isExpanded ? 'none' : 200,
                        overflow: 'hidden',
                        position: 'relative',
                      }}
                    >
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          ...getDataTableComponents(),
                          p: ({ children }) => (
                            <Typography
                              variant="body2"
                              component="p"
                              sx={{
                                fontFamily: '"Roboto Mono", "Consolas", "Courier New", monospace',
                                fontSize: '0.75rem',
                                mb: 0.5,
                              }}
                            >
                              {children}
                            </Typography>
                          ),
                          code: ({ children }) => (
                            <Box
                              component="code"
                              sx={{
                                fontFamily: '"Roboto Mono", "Consolas", "Courier New", monospace',
                                fontSize: '0.75rem',
                                bgcolor: 'action.hover',
                                px: 0.5,
                                py: 0.25,
                                borderRadius: 0.5,
                              }}
                            >
                              {children}
                            </Box>
                          ),
                        }}
                      >
                        {toolCall.result}
                      </ReactMarkdown>
                    </Box>
                    {toolCall.result.length > 300 && (
                      <Button
                        size="small"
                        onClick={() => toggleExpanded(toolCall.name)}
                        sx={{ mt: 1 }}
                      >
                        {isExpanded ? 'Show less' : 'Show more'}
                      </Button>
                    )}
                  </Box>
                )}
              </Box>
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Box>
  );
}
