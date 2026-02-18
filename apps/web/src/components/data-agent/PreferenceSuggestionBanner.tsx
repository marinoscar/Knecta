import { Box, Paper, Typography, Button, Chip } from '@mui/material';
import { AutoFixHigh as AutoIcon, Close as CloseIcon } from '@mui/icons-material';

export interface PreferenceSuggestion {
  key: string;
  value: string;
  question: string;
}

interface PreferenceSuggestionBannerProps {
  suggestions: PreferenceSuggestion[];
  onAccept: (key: string, value: string) => void;
  onDismiss: () => void;
}

export function PreferenceSuggestionBanner({
  suggestions,
  onAccept,
  onDismiss,
}: PreferenceSuggestionBannerProps) {
  if (suggestions.length === 0) return null;

  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.5,
        mx: 2,
        mb: 1,
        border: 1,
        borderColor: 'info.light',
        borderRadius: 1,
        bgcolor: (theme) =>
          theme.palette.mode === 'dark'
            ? 'rgba(41, 121, 255, 0.08)'
            : 'rgba(41, 121, 255, 0.04)',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <AutoIcon color="info" fontSize="small" />
        <Typography variant="caption" fontWeight={600} color="info.main">
          Save as preferences?
        </Typography>
      </Box>
      {suggestions.map((s, i) => (
        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Chip label={s.key} size="small" variant="outlined" sx={{ maxWidth: 200 }} />
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ flex: 1 }}
            noWrap
            title={s.value}
          >
            {s.value}
          </Typography>
          <Button size="small" onClick={() => onAccept(s.key, s.value)}>
            Save
          </Button>
        </Box>
      ))}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
        <Button size="small" color="inherit" onClick={onDismiss} startIcon={<CloseIcon />}>
          Dismiss
        </Button>
      </Box>
    </Paper>
  );
}
