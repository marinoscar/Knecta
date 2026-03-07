import { FormControl, Select, MenuItem, Typography } from '@mui/material';
import type { LLMProviderInfo } from '../../types';

interface ModelSelectorProps {
  providers: LLMProviderInfo[];
  selectedProvider: string | null;
  onChange: (provider: string) => void;
  disabled?: boolean;
  size?: 'small' | 'medium';
}

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  azure_openai: 'Azure OpenAI',
  snowflake_cortex: 'Snowflake Cortex',
  databricks: 'Databricks',
};

export function ModelSelector({
  providers,
  selectedProvider,
  onChange,
  disabled = false,
  size = 'small',
}: ModelSelectorProps) {
  // Ensure selected provider is valid, otherwise use first provider
  // selectedProvider and values are provider type strings (e.g. 'openai', 'anthropic')
  const validSelected = providers.find((p) => p.type === selectedProvider)
    ? (selectedProvider as string)
    : providers[0]?.type || '';

  return (
    <FormControl size={size} sx={{ minWidth: 160 }}>
      <Select
        value={validSelected}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        sx={{
          '& .MuiOutlinedInput-notchedOutline': {
            borderRadius: 3,
          },
        }}
      >
        {providers.map((provider) => (
          <MenuItem key={provider.type} value={provider.type}>
            <Typography variant="body2">
              {PROVIDER_DISPLAY_NAMES[provider.type] || provider.name}
            </Typography>
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
