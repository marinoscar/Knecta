import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControlLabel,
  Switch,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  Alert,
  CircularProgress,
  IconButton,
  InputAdornment,
  Box,
  Typography,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import type {
  LLMProviderType,
  LLMProviderDetail,
  CreateLlmProviderRequest,
  UpdateLlmProviderRequest,
} from '../../types';

interface LlmProviderDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: CreateLlmProviderRequest | UpdateLlmProviderRequest) => Promise<void>;
  provider?: LLMProviderDetail | null;
  existingTypes?: string[];
}

interface FieldConfig {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url';
  required: boolean;
  placeholder?: string;
  helperText?: string;
}

interface ProviderConfig {
  displayName: string;
  defaultName: string;
  fields: FieldConfig[];
  defaultModel: string;
}

const PROVIDER_CONFIGS: Record<LLMProviderType, ProviderConfig> = {
  openai: {
    displayName: 'OpenAI',
    defaultName: 'OpenAI',
    fields: [
      {
        key: 'apiKey',
        label: 'API Key',
        type: 'password',
        required: true,
        placeholder: 'sk-...',
      },
      {
        key: 'model',
        label: 'Default Model',
        type: 'text',
        required: false,
        placeholder: 'gpt-4o',
        helperText: 'Leave blank for default (gpt-4o)',
      },
    ],
    defaultModel: 'gpt-4o',
  },
  anthropic: {
    displayName: 'Anthropic',
    defaultName: 'Anthropic',
    fields: [
      {
        key: 'apiKey',
        label: 'API Key',
        type: 'password',
        required: true,
        placeholder: 'sk-ant-...',
      },
      {
        key: 'model',
        label: 'Default Model',
        type: 'text',
        required: false,
        placeholder: 'claude-sonnet-4-5-20250929',
        helperText: 'Leave blank for default',
      },
    ],
    defaultModel: 'claude-sonnet-4-5-20250929',
  },
  azure_openai: {
    displayName: 'Azure OpenAI',
    defaultName: 'Azure OpenAI',
    fields: [
      {
        key: 'apiKey',
        label: 'API Key',
        type: 'password',
        required: true,
      },
      {
        key: 'endpoint',
        label: 'Endpoint URL',
        type: 'url',
        required: true,
        placeholder: 'https://myresource.openai.azure.com',
        helperText: 'Azure OpenAI resource endpoint',
      },
      {
        key: 'deployment',
        label: 'Deployment Name',
        type: 'text',
        required: true,
        helperText: 'The deployment name for your model',
      },
      {
        key: 'apiVersion',
        label: 'API Version',
        type: 'text',
        required: false,
        placeholder: '2024-02-01',
        helperText: 'Leave blank for default (2024-02-01)',
      },
      {
        key: 'model',
        label: 'Display Model Name',
        type: 'text',
        required: false,
        helperText: 'For display purposes (uses deployment by default)',
      },
    ],
    defaultModel: '',
  },
  snowflake_cortex: {
    displayName: 'Snowflake Cortex',
    defaultName: 'Snowflake Cortex',
    fields: [
      {
        key: 'account',
        label: 'Account Identifier',
        type: 'text',
        required: true,
        placeholder: 'xy12345.us-east-1',
        helperText: 'Your Snowflake account identifier',
      },
      {
        key: 'pat',
        label: 'Personal Access Token',
        type: 'password',
        required: true,
        helperText: 'Generated from Snowflake Settings - Authentication',
      },
      {
        key: 'model',
        label: 'Default Model',
        type: 'text',
        required: false,
        placeholder: 'claude-3-7-sonnet',
        helperText: 'Available: claude-3-7-sonnet, mistral-large, llama3.1-70b, etc.',
      },
    ],
    defaultModel: 'claude-3-7-sonnet',
  },
  databricks: {
    displayName: 'Databricks',
    defaultName: 'Databricks',
    fields: [
      {
        key: 'host',
        label: 'Workspace Host',
        type: 'text',
        required: true,
        placeholder: 'my-workspace.cloud.databricks.com',
        helperText: 'Databricks workspace hostname (without https://)',
      },
      {
        key: 'token',
        label: 'Personal Access Token',
        type: 'password',
        required: true,
      },
      {
        key: 'endpoint',
        label: 'Serving Endpoint',
        type: 'text',
        required: true,
        placeholder: 'databricks-dbrx-instruct',
        helperText: 'Name of the model serving endpoint',
      },
    ],
    defaultModel: '',
  },
};

const PROVIDER_TYPE_OPTIONS: Array<{ value: LLMProviderType; label: string }> = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'azure_openai', label: 'Azure OpenAI' },
  { value: 'snowflake_cortex', label: 'Snowflake Cortex' },
  { value: 'databricks', label: 'Databricks' },
];

export function LlmProviderDialog({
  open,
  onClose,
  onSave,
  provider,
  existingTypes = [],
}: LlmProviderDialogProps) {
  const isEditMode = provider != null;

  const [type, setType] = useState<LLMProviderType>('openai');
  const [name, setName] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [isDefault, setIsDefault] = useState(false);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form state when dialog opens or provider changes
  useEffect(() => {
    if (!open) return;

    if (provider) {
      // Edit mode: pre-fill from existing provider
      setType(provider.type as LLMProviderType);
      setName(provider.name);
      setEnabled(provider.enabled);
      setIsDefault(provider.isDefault);
      // Pre-fill non-sensitive config fields; password fields stay empty
      const prefilledConfig: Record<string, string> = {};
      const providerTypeKey = provider.type as LLMProviderType;
      const fields = PROVIDER_CONFIGS[providerTypeKey]?.fields ?? [];
      for (const field of fields) {
        if (field.type !== 'password') {
          const value = provider.config?.[field.key];
          prefilledConfig[field.key] = typeof value === 'string' ? value : '';
        } else {
          // Password fields start empty in edit mode (placeholder shows ******** visually)
          prefilledConfig[field.key] = '';
        }
      }
      setConfig(prefilledConfig);
    } else {
      // Create mode: reset everything
      const defaultType: LLMProviderType = 'openai';
      setType(defaultType);
      setName(PROVIDER_CONFIGS[defaultType].defaultName);
      setEnabled(true);
      setIsDefault(false);
      setConfig({});
    }

    setShowPasswords({});
    setError(null);
  }, [open, provider]);

  // When type changes in create mode, auto-fill name and clear config
  const handleTypeChange = (newType: LLMProviderType) => {
    setType(newType);
    setName(PROVIDER_CONFIGS[newType].defaultName);
    setConfig({});
    setShowPasswords({});
  };

  const handleConfigChange = (key: string, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const toggleShowPassword = (key: string) => {
    setShowPasswords((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Validation
  const validate = (): string | null => {
    if (!name.trim()) return 'Provider name is required';

    const fields = PROVIDER_CONFIGS[type]?.fields ?? [];
    for (const field of fields) {
      if (!field.required) continue;
      const value = config[field.key] ?? '';
      if (field.type === 'password' && isEditMode) {
        // In edit mode, required password fields can be empty (means keep existing)
        continue;
      }
      if (!value.trim()) {
        return `${field.label} is required`;
      }
    }

    return null;
  };

  const handleSave = async () => {
    setError(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSaving(true);
    try {
      if (isEditMode) {
        // Edit mode: build partial config — only include fields that changed
        const fields = PROVIDER_CONFIGS[type]?.fields ?? [];
        const partialConfig: Record<string, string> = {};
        let hasConfigChanges = false;

        for (const field of fields) {
          const currentValue = config[field.key] ?? '';
          if (field.type === 'password') {
            // Only include password field if user entered a new value
            if (currentValue.trim()) {
              partialConfig[field.key] = currentValue;
              hasConfigChanges = true;
            }
          } else {
            const originalValue = provider?.config?.[field.key];
            const originalStr = typeof originalValue === 'string' ? originalValue : '';
            if (currentValue !== originalStr) {
              hasConfigChanges = true;
            }
            partialConfig[field.key] = currentValue;
          }
        }

        const updatePayload: UpdateLlmProviderRequest = {
          name: name.trim(),
          enabled,
          isDefault,
        };

        if (hasConfigChanges) {
          updatePayload.config = partialConfig;
        }

        await onSave(updatePayload);
      } else {
        // Create mode: include all config fields
        const fields = PROVIDER_CONFIGS[type]?.fields ?? [];
        const fullConfig: Record<string, string> = {};
        for (const field of fields) {
          const value = config[field.key] ?? '';
          if (value.trim()) {
            fullConfig[field.key] = value.trim();
          }
        }

        const createPayload: CreateLlmProviderRequest = {
          type,
          name: name.trim(),
          enabled,
          isDefault,
          config: fullConfig,
        };

        await onSave(createPayload);
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save provider');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (!isSaving) {
      onClose();
    }
  };

  const currentFields = PROVIDER_CONFIGS[type]?.fields ?? [];

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEditMode ? 'Edit LLM Provider' : 'Add LLM Provider'}</DialogTitle>

      <DialogContent>
        <Box display="flex" flexDirection="column" gap={2} mt={1}>
          {error && <Alert severity="error">{error}</Alert>}

          {/* Provider Type — disabled in edit mode */}
          <FormControl required fullWidth disabled={isEditMode || isSaving}>
            <InputLabel>Provider Type</InputLabel>
            <Select
              value={type}
              onChange={(e) => handleTypeChange(e.target.value as LLMProviderType)}
              label="Provider Type"
            >
              {PROVIDER_TYPE_OPTIONS.map((opt) => (
                <MenuItem
                  key={opt.value}
                  value={opt.value}
                  disabled={!isEditMode && existingTypes.includes(opt.value)}
                >
                  {opt.label}
                  {!isEditMode && existingTypes.includes(opt.value) && (
                    <Typography
                      component="span"
                      variant="caption"
                      color="text.secondary"
                      sx={{ ml: 1 }}
                    >
                      (already configured)
                    </Typography>
                  )}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Provider Name */}
          <TextField
            label="Provider Name"
            required
            fullWidth
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSaving}
          />

          {/* Dynamic config fields */}
          {currentFields.map((field) => {
            const isPasswordField = field.type === 'password';
            const showValue = showPasswords[field.key] ?? false;
            const inputType = isPasswordField && !showValue ? 'password' : 'text';
            const value = config[field.key] ?? '';

            return (
              <TextField
                key={field.key}
                label={field.label}
                required={field.required && !isEditMode}
                fullWidth
                type={inputType}
                value={value}
                onChange={(e) => handleConfigChange(field.key, e.target.value)}
                disabled={isSaving}
                placeholder={
                  isPasswordField && isEditMode ? '(unchanged)' : field.placeholder
                }
                helperText={
                  isPasswordField && isEditMode
                    ? 'Leave blank to keep existing value'
                    : field.helperText
                }
                InputProps={
                  isPasswordField
                    ? {
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              aria-label={showValue ? 'Hide field value' : 'Show field value'}
                              onClick={() => toggleShowPassword(field.key)}
                              edge="end"
                              disabled={isSaving}
                              size="small"
                            >
                              {showValue ? <VisibilityOff /> : <Visibility />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      }
                    : undefined
                }
              />
            );
          })}

          {/* Enabled toggle */}
          <FormControlLabel
            control={
              <Switch
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                disabled={isSaving}
              />
            }
            label="Enabled"
          />

          {/* Set as default toggle */}
          <FormControlLabel
            control={
              <Switch
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                disabled={isSaving}
              />
            }
            label="Set as Default"
          />
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={isSaving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <CircularProgress size={20} />
          ) : isEditMode ? (
            'Save Changes'
          ) : (
            'Create'
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
