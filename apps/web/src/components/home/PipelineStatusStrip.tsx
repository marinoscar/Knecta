import { Grid } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import {
  Storage as StorageIcon,
  AccountTree as AccountTreeIcon,
  Hub as HubIcon,
  SmartToy as SmartToyIcon,
} from '@mui/icons-material';
import { PipelineStepCard } from './PipelineStepCard';

interface PipelineStatusStripProps {
  connectionsTotal: number;
  readyModelsCount: number;
  readyOntologiesCount: number;
  chatsTotal: number;
  isLoading?: boolean;
}

export function PipelineStatusStrip({
  connectionsTotal,
  readyModelsCount,
  readyOntologiesCount,
  chatsTotal,
  isLoading = false,
}: PipelineStatusStripProps) {
  const theme = useTheme();
  const navigate = useNavigate();

  return (
    <Grid container spacing={2}>
      <Grid item xs={6} sm={3}>
        <PipelineStepCard
          icon={<StorageIcon />}
          count={connectionsTotal}
          label="databases connected"
          accentColor={theme.palette.info.main}
          onClick={() => navigate('/connections')}
          isLoading={isLoading}
        />
      </Grid>
      <Grid item xs={6} sm={3}>
        <PipelineStepCard
          icon={<AccountTreeIcon />}
          count={readyModelsCount}
          label="models ready"
          accentColor={theme.palette.secondary.main}
          onClick={() => navigate('/semantic-models')}
          isLoading={isLoading}
        />
      </Grid>
      <Grid item xs={6} sm={3}>
        <PipelineStepCard
          icon={<HubIcon />}
          count={readyOntologiesCount}
          label="ontologies ready"
          accentColor={theme.palette.success.main}
          onClick={() => navigate('/ontologies')}
          isLoading={isLoading}
        />
      </Grid>
      <Grid item xs={6} sm={3}>
        <PipelineStepCard
          icon={<SmartToyIcon />}
          count={chatsTotal}
          label="conversations"
          accentColor={theme.palette.primary.main}
          onClick={() => navigate('/agent')}
          isLoading={isLoading}
        />
      </Grid>
    </Grid>
  );
}
