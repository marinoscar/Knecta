import {
  Container,
  Typography,
  Box,
  Alert,
  Snackbar,
} from '@mui/material';
import { useState } from 'react';
import { ThemeSettings } from '../components/settings/ThemeSettings';
import { ProfileSettings } from '../components/settings/ProfileSettings';
import { DefaultProviderSettings } from '../components/settings/DefaultProviderSettings';
import { useUserSettings } from '../hooks/useUserSettings';
import { LoadingSpinner } from '../components/common/LoadingSpinner';

export default function UserSettingsPage() {
  const {
    settings,
    isLoading,
    error,
    isSaving,
    updateTheme,
    updateProfile,
    updateDefaultProvider,
  } = useUserSettings();

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleThemeChange = async (theme: 'light' | 'dark' | 'system') => {
    try {
      await updateTheme(theme);
      setSuccessMessage('Theme updated');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to update theme');
    }
  };

  const handleProfileSave = async (
    profile: NonNullable<typeof settings>['profile']
  ) => {
    try {
      await updateProfile(profile);
      setSuccessMessage('Profile updated');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to update profile');
    }
  };

  const handleDefaultProviderChange = async (provider: string | undefined) => {
    try {
      await updateDefaultProvider(provider);
      setSuccessMessage('Default provider updated');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to update default provider');
    }
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <Container maxWidth="md">
      <Box sx={{ py: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Settings
        </Typography>
        <Typography color="text.secondary" paragraph>
          Manage your account preferences
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {settings && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Theme Settings */}
            <ThemeSettings
              currentTheme={settings.theme}
              onThemeChange={handleThemeChange}
              disabled={isSaving}
            />

            {/* Profile Settings */}
            <ProfileSettings
              profile={settings.profile}
              onSave={handleProfileSave}
              disabled={isSaving}
            />

            {/* Default Provider Settings */}
            <DefaultProviderSettings
              currentProvider={settings.defaultProvider}
              onProviderChange={handleDefaultProviderChange}
              disabled={isSaving}
            />
          </Box>
        )}

        {/* Success Snackbar */}
        <Snackbar
          open={!!successMessage}
          autoHideDuration={3000}
          onClose={() => setSuccessMessage(null)}
          message={successMessage}
        />

        {/* Error Snackbar */}
        <Snackbar
          open={!!localError}
          autoHideDuration={5000}
          onClose={() => setLocalError(null)}
        >
          <Alert severity="error" onClose={() => setLocalError(null)}>
            {localError}
          </Alert>
        </Snackbar>
      </Box>
    </Container>
  );
}
