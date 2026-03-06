import {
  Box,
  Typography,
  TextField,
  Slider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Paper,
  Alert,
} from '@mui/material';
import { useState, useEffect } from 'react';
import { getLlmProviders } from '../../services/api';
import type { SystemSettings, LLMProviderInfo, AgentProviderConfig } from '../../types';

interface DataAgentSettingsProps {
  settings: SystemSettings;
  onSave: (dataAgent: Record<string, AgentProviderConfig>) => Promise<void>;
  disabled?: boolean;
}

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  azure_openai: 'Azure OpenAI',
  snowflake_cortex: 'Snowflake Cortex',
};

export function DataAgentSettings({ settings, onSave, disabled }: DataAgentSettingsProps) {
  const [providers, setProviders] = useState<LLMProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Local state keyed by provider type (e.g. 'openai', 'anthropic', 'azure_openai')
  const [providerConfigs, setProviderConfigs] = useState<Record<string, AgentProviderConfig>>(
    settings.agentConfigs?.dataAgent || {},
  );

  useEffect(() => {
    loadProviders();
  }, []);

  useEffect(() => {
    // Update local state when settings change
    setProviderConfigs(settings.agentConfigs?.dataAgent || {});
  }, [settings]);

  const loadProviders = async () => {
    try {
      setLoading(true);
      const response = await getLlmProviders();
      setProviders(response.providers.filter(p => p.enabled));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load providers');
    } finally {
      setLoading(false);
    }
  };

  const updateProviderConfig = (providerType: string, updates: Partial<AgentProviderConfig>) => {
    setProviderConfigs(prev => ({
      ...prev,
      [providerType]: { ...prev[providerType], ...updates },
    }));
  };

  const hasChanges = (): boolean => {
    const original = settings.agentConfigs?.dataAgent || {};
    return Object.keys(providerConfigs).some(key => {
      const current = providerConfigs[key];
      const orig = original[key] || {};
      return JSON.stringify(current) !== JSON.stringify(orig);
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Only include configs for enabled providers
      const enabledProviderTypes = providers.map(p => p.type);
      const filteredConfigs: Record<string, AgentProviderConfig> = {};

      enabledProviderTypes.forEach(type => {
        if (providerConfigs[type] && Object.keys(providerConfigs[type]).length > 0) {
          filteredConfigs[type] = providerConfigs[type];
        }
      });

      await onSave(filteredConfigs);
    } finally {
      setIsSaving(false);
    }
  };

  const renderReasoningLevelControl = (_provider: LLMProviderInfo, providerType: string) => {
    const config = providerConfigs[providerType] || {};
    const reasoningLevel = config.reasoningLevel || '';
    const isCustomBudget = reasoningLevel === 'custom';

    let options: { value: string; label: string }[] = [];

    if (providerType === 'openai' || providerType === 'azure_openai') {
      options = [
        { value: '', label: 'None' },
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
      ];
    } else if (providerType === 'anthropic') {
      options = [
        { value: '', label: 'None' },
        { value: 'adaptive', label: 'Adaptive' },
        { value: 'custom', label: 'Custom Budget' },
      ];
    }

    return (
      <>
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>Reasoning Level</InputLabel>
          <Select
            value={reasoningLevel}
            label="Reasoning Level"
            onChange={(e) => {
              const newLevel = e.target.value;
              updateProviderConfig(providerType, {
                reasoningLevel: newLevel,
                customBudget: newLevel === 'custom' ? (config.customBudget || 1024) : undefined,
              });
            }}
            disabled={disabled}
          >
            {options.map(opt => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {providerType === 'anthropic' && isCustomBudget && (
          <TextField
            fullWidth
            type="number"
            label="Custom Token Budget"
            value={config.customBudget || 1024}
            onChange={(e) => {
              const value = parseInt(e.target.value, 10);
              if (!isNaN(value)) {
                updateProviderConfig(providerType, { customBudget: Math.max(1024, Math.min(128000, value)) });
              }
            }}
            disabled={disabled}
            inputProps={{ min: 1024, max: 128000, step: 1024 }}
            helperText="Min: 1024, Max: 128000"
            sx={{ mb: 2 }}
          />
        )}
      </>
    );
  };

  const renderProviderSection = (provider: LLMProviderInfo) => {
    const providerType = provider.type;
    const config = providerConfigs[providerType] || {};
    const displayName = PROVIDER_DISPLAY_NAMES[providerType] || provider.name;

    return (
      <Paper key={providerType} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          {displayName}
        </Typography>

        <TextField
          fullWidth
          label="Model"
          value={config.model || ''}
          onChange={(e) => updateProviderConfig(providerType, { model: e.target.value })}
          placeholder={provider.model}
          disabled={disabled}
          helperText={provider.model ? `Default: ${provider.model}` : undefined}
          sx={{ mb: 2 }}
        />

        <Box sx={{ mb: 3 }}>
          <Typography gutterBottom>
            Temperature: {config.temperature !== undefined ? config.temperature.toFixed(1) : '0.0'}
          </Typography>
          <Slider
            value={config.temperature !== undefined ? config.temperature : 0}
            onChange={(_, value) => updateProviderConfig(providerType, { temperature: value as number })}
            min={0}
            max={2}
            step={0.1}
            valueLabelDisplay="auto"
            disabled={disabled}
            marks={[
              { value: 0, label: '0' },
              { value: 1, label: '1' },
              { value: 2, label: '2' },
            ]}
          />
        </Box>

        {renderReasoningLevelControl(provider, providerType)}
      </Paper>
    );
  };

  if (loading) {
    return (
      <Box>
        <Typography>Loading providers...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }

  if (providers.length === 0) {
    return (
      <Alert severity="info">
        No LLM providers are configured. Configure at least one provider via environment variables.
      </Alert>
    );
  }

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Data Agent Configuration
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Configure LLM parameters for the Data Agent feature. Only enabled providers are shown.
      </Typography>

      {providers.map(renderProviderSection)}

      <Box sx={{ mt: 3 }}>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={disabled || !hasChanges() || isSaving}
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </Box>
    </Box>
  );
}
