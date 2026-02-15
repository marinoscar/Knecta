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
  azure: 'Azure OpenAI',
};

export function ModelSelector({
  providers,
  selectedProvider,
  onChange,
  disabled = false,
  size = 'small',
}: ModelSelectorProps) {
  // Ensure selected provider is valid, otherwise use first provider
  const validSelected = providers.find((p) => p.name === selectedProvider)
    ? (selectedProvider as string)
    : providers[0]?.name || '';

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
          <MenuItem key={provider.name} value={provider.name}>
            <Typography variant="body2">
              {PROVIDER_DISPLAY_NAMES[provider.name] || provider.name}
            </Typography>
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
