import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  FormControl,
  Select,
  MenuItem,
  Box,
  CircularProgress,
  Alert,
} from '@mui/material';
import { getLlmProviders } from '../../services/api';
import type { LLMProviderInfo } from '../../types';

interface DefaultProviderSettingsProps {
  currentProvider: string | undefined;
  onProviderChange: (provider: string | undefined) => Promise<void>;
  disabled?: boolean;
}

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  azure: 'Azure OpenAI',
};

export function DefaultProviderSettings({
  currentProvider,
  onProviderChange,
  disabled = false,
}: DefaultProviderSettingsProps) {
  const [providers, setProviders] = useState<LLMProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProviders();
  }, []);

  const fetchProviders = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getLlmProviders();
      setProviders(response.providers.filter((p) => p.enabled));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load providers');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = async (value: string) => {
    const newProvider = value === '' ? undefined : value;
    try {
      await onProviderChange(newProvider);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update provider');
    }
  };

  return (
    <Card id="default-provider">
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Default AI Provider
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          Choose your preferred AI provider for new Data Agent conversations
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <FormControl fullWidth disabled={disabled} sx={{ mt: 1 }}>
            <Select
              value={currentProvider || ''}
              onChange={(e) => handleChange(e.target.value)}
              displayEmpty
            >
              <MenuItem value="">
                <Box>
                  <Typography variant="body2">System Default</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Use the system-configured default provider
                  </Typography>
                </Box>
              </MenuItem>
              {providers.map((provider) => (
                <MenuItem key={provider.name} value={provider.name}>
                  <Box>
                    <Typography variant="body2">
                      {PROVIDER_DISPLAY_NAMES[provider.name] || provider.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {provider.model}
                    </Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </CardContent>
    </Card>
  );
}
