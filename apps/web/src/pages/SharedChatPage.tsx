import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  Chip,
  useTheme,
} from '@mui/material';
import { ChatMessage } from '../components/data-agent/ChatMessage';
import { getSharedChat } from '../services/api';
import type { SharedChatData, DataChatMessage, ChartSpec } from '../types';

export default function SharedChatPage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const theme = useTheme();
  const [data, setData] = useState<SharedChatData | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
  const mapToDataChatMessages = (sharedData: SharedChatData): DataChatMessage[] => {
    return sharedData.messages.map((msg, index) => ({
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
                  complexity: (msg.metadata.plan.complexity ?? 'simple') as 'simple' | 'analytical' | 'conversational',
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
                  notes: msg.metadata.joinPlan.notes,
                }
              : undefined,
            cannotAnswer: msg.metadata.cannotAnswer,
            durationMs: msg.metadata.durationMs,
            revisionsUsed: msg.metadata.revisionsUsed,
          }
        : undefined,
    }));
  };

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

  const messages = mapToDataChatMessages(data);

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
          <Chip label={data.ontologyName} size="small" variant="outlined" />
        </Box>
        <Typography variant="caption" color="text.secondary">
          Shared conversation
        </Typography>
      </Paper>

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
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              isStreaming={false}
            />
          ))}
        </Box>
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
