import { useEffect } from 'react';
import { Box, Container, Typography, Grid, Alert, Button } from '@mui/material';
import { UserProfileCard } from '../components/user/UserProfileCard';
import { QuickActions } from '../components/home/QuickActions';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';

export default function HomePage() {
  const { user } = useAuth();
  const { browserPermission, requestBrowserPermission, isSupported } = useNotifications();

  // Request permission on first visit
  useEffect(() => {
    if (isSupported && browserPermission === 'default') {
      requestBrowserPermission();
    }
  }, [isSupported, browserPermission, requestBrowserPermission]);

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        {/* Welcome Header */}
        <Typography variant="h4" component="h1" gutterBottom>
          Welcome back{user?.displayName ? `, ${user.displayName}` : ''}
        </Typography>
        <Typography color="text.secondary" paragraph>
          Your dashboard overview
        </Typography>

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

        <Grid container spacing={3}>
          {/* User Profile Card */}
          <Grid item xs={12} md={4}>
            <UserProfileCard />
          </Grid>

          {/* Quick Actions */}
          <Grid item xs={12} md={8}>
            <QuickActions />
          </Grid>
        </Grid>
      </Box>
    </Container>
  );
}
