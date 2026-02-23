import { Paper, Stack, Button, Divider, Typography } from '@mui/material';
import {
  Add as AddIcon,
  AccountTree as AccountTreeIcon,
  Hub as HubIcon,
  SmartToy as SmartToyIcon,
  Settings as SettingsIcon,
  People as PeopleIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { usePermissions } from '../../hooks/usePermissions';

export function HomeQuickActions() {
  const navigate = useNavigate();
  const { isAdmin } = usePermissions();

  return (
    <Paper
      elevation={0}
      sx={{
        border: 1,
        borderColor: 'divider',
        p: 2,
      }}
    >
      <Typography variant="h6" fontWeight="medium" sx={{ mb: 2 }}>
        Quick Actions
      </Typography>

      <Stack spacing={1}>
        <Button
          fullWidth
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => navigate('/connections')}
          sx={{ justifyContent: 'flex-start', py: 1.5, textTransform: 'none' }}
        >
          New Connection
        </Button>

        <Button
          fullWidth
          variant="outlined"
          startIcon={<AccountTreeIcon />}
          onClick={() => navigate('/semantic-models/new')}
          sx={{ justifyContent: 'flex-start', py: 1.5, textTransform: 'none' }}
        >
          Generate Model
        </Button>

        <Button
          fullWidth
          variant="outlined"
          startIcon={<HubIcon />}
          onClick={() => navigate('/ontologies')}
          sx={{ justifyContent: 'flex-start', py: 1.5, textTransform: 'none' }}
        >
          New Ontology
        </Button>

        <Button
          fullWidth
          variant="outlined"
          startIcon={<SmartToyIcon />}
          onClick={() => navigate('/agent')}
          sx={{ justifyContent: 'flex-start', py: 1.5, textTransform: 'none' }}
        >
          Start Conversation
        </Button>

        {isAdmin && (
          <>
            <Divider sx={{ my: 1 }} />

            <Button
              fullWidth
              variant="outlined"
              startIcon={<SettingsIcon />}
              onClick={() => navigate('/admin/settings')}
              sx={{ justifyContent: 'flex-start', py: 1.5, textTransform: 'none' }}
            >
              System Settings
            </Button>

            <Button
              fullWidth
              variant="outlined"
              startIcon={<PeopleIcon />}
              onClick={() => navigate('/admin/users')}
              sx={{ justifyContent: 'flex-start', py: 1.5, textTransform: 'none' }}
            >
              User Management
            </Button>
          </>
        )}
      </Stack>
    </Paper>
  );
}
