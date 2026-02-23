import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Container, Grid, Stack } from '@mui/material';
import { useNotifications } from '../contexts/NotificationContext';
import { createDataChat } from '../services/api';
import { useHomeDashboard } from '../hooks/useHomeDashboard';
import type { HomeDashboardData } from '../hooks/useHomeDashboard';
import { useLlmProviders } from '../hooks/useLlmProviders';
import { useUserSettings } from '../hooks/useUserSettings';
import { HeroBanner } from '../components/home/HeroBanner';
import { PipelineStatusStrip } from '../components/home/PipelineStatusStrip';
import { SetupStepper } from '../components/home/SetupStepper';
import { RecentConversations } from '../components/home/RecentConversations';
import { RecentActivity } from '../components/home/RecentActivity';
import { PlatformSummary } from '../components/home/PlatformSummary';
import { HomeQuickActions } from '../components/home/HomeQuickActions';

function getNextSetupStep(
  data: HomeDashboardData,
): { label: string; path: string } | undefined {
  if (data.connectionsTotal === 0)
    return { label: 'Connect a database to get started', path: '/connections' };
  if (data.readyModelsCount === 0)
    return { label: 'Generate a semantic model to continue', path: '/semantic-models/new' };
  if (data.readyOntologiesCount === 0)
    return { label: 'Create an ontology from your model', path: '/ontologies' };
  return undefined;
}

export default function HomePage() {
  const navigate = useNavigate();
  const { browserPermission, requestBrowserPermission, isSupported } = useNotifications();
  const dashboard = useHomeDashboard();
  const { settings } = useUserSettings();
  const { defaultProvider } = useLlmProviders(settings?.defaultProvider ?? undefined);

  // Request permission on first visit
  useEffect(() => {
    if (isSupported && browserPermission === 'default') {
      requestBrowserPermission();
    }
  }, [isSupported, browserPermission, requestBrowserPermission]);

  const handleAskQuestion = async (ontologyId: string, question: string) => {
    try {
      const chat = await createDataChat({
        name: question.slice(0, 60),
        ontologyId,
        llmProvider: defaultProvider,
      });
      navigate(`/agent/${chat.id}`, { state: { initialQuestion: question } });
    } catch (err) {
      // Silently fail — user can navigate to agent page manually
      console.error('Failed to create chat:', err);
    }
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        {/* Notification Permission Banner */}
        {isSupported && browserPermission === 'default' && (
          <Alert
            severity="info"
            sx={{ mb: 2 }}
            action={
              <Button color="inherit" size="small" onClick={requestBrowserPermission}>
                Enable
              </Button>
            }
          >
            Enable notifications to know when your models and analyses complete.
          </Alert>
        )}

        {/* Hero Banner */}
        <HeroBanner
          mode={dashboard.mode}
          readyOntologies={dashboard.readyOntologies}
          totalDatasets={dashboard.totalDatasets}
          isLoading={dashboard.isLoading}
          onAskQuestion={handleAskQuestion}
          nextSetupStep={getNextSetupStep(dashboard)}
        />

        {/* Pipeline Status Strip */}
        <Box sx={{ mb: 3 }}>
          <PipelineStatusStrip
            connectionsTotal={dashboard.connectionsTotal}
            readyModelsCount={dashboard.readyModelsCount}
            readyOntologiesCount={dashboard.readyOntologiesCount}
            chatsTotal={dashboard.chatsTotal}
            isLoading={dashboard.isLoading}
          />
        </Box>

        {/* Setup Stepper (hidden when all steps complete) */}
        <SetupStepper
          connectionsTotal={dashboard.connectionsTotal}
          readyModelsCount={dashboard.readyModelsCount}
          readyOntologiesCount={dashboard.readyOntologiesCount}
          chatsTotal={dashboard.chatsTotal}
        />

        {/* Two-column layout: recent (8) | sidebar (4) */}
        <Grid container spacing={3}>
          <Grid item xs={12} md={8}>
            <Stack spacing={3}>
              <RecentConversations
                chats={dashboard.recentChats}
                isLoading={dashboard.isLoading}
              />
              <RecentActivity
                models={dashboard.recentModels}
                ontologies={dashboard.recentOntologies}
                isLoading={dashboard.isLoading}
              />
            </Stack>
          </Grid>
          <Grid item xs={12} md={4}>
            <Stack spacing={3}>
              <PlatformSummary
                totalDatasets={dashboard.totalDatasets}
                totalRelationships={dashboard.totalRelationships}
                providerCount={dashboard.providerCount}
                isLoading={dashboard.isLoading}
              />
              <HomeQuickActions />
            </Stack>
          </Grid>
        </Grid>

        {/* Error alert at bottom if dashboard failed to load */}
        {dashboard.error && (
          <Alert severity="warning" sx={{ mt: 3 }}>
            {dashboard.error}
          </Alert>
        )}
      </Box>
    </Container>
  );
}
