import { useState, useRef, useEffect } from 'react';
import { Box, OutlinedInput, IconButton, InputAdornment, Tooltip, useTheme } from '@mui/material';
import { ArrowUpward as SendIcon, Language as LanguageIcon } from '@mui/icons-material';

interface ChatInputProps {
  onSend: (content: string) => void;
  isStreaming: boolean;
  disabled?: boolean;
  webSearchEnabled?: boolean;
  onToggleWebSearch?: () => void;
  globalWebSearchEnabled?: boolean;
}

export function ChatInput({
  onSend,
  isStreaming,
  disabled = false,
  webSearchEnabled = false,
  onToggleWebSearch,
  globalWebSearchEnabled = false,
}: ChatInputProps) {
  const theme = useTheme();
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    if (value.trim() && !isStreaming && !disabled) {
      onSend(value.trim());
      setValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  useEffect(() => {
    // Focus input when streaming stops
    if (!isStreaming && !disabled) {
      inputRef.current?.focus();
    }
  }, [isStreaming, disabled]);

  const placeholder = isStreaming
    ? 'Agent is thinking...'
    : disabled
    ? 'Chat is not available'
    : 'Ask a question about your data...';

  const canSend = value.trim() && !isStreaming && !disabled;

  const webSearchButton = globalWebSearchEnabled ? (
    <InputAdornment position="start">
      <Tooltip title={webSearchEnabled ? 'Web search enabled' : 'Web search'}>
        <IconButton
          onClick={onToggleWebSearch}
          size="small"
          disabled={disabled || isStreaming}
          aria-label={webSearchEnabled ? 'Disable web search' : 'Enable web search'}
          sx={{
            color: webSearchEnabled ? 'primary.main' : 'action.disabled',
            '&:hover': {
              color: webSearchEnabled ? 'primary.dark' : 'text.secondary',
              bgcolor: 'transparent',
            },
          }}
        >
          <LanguageIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </InputAdornment>
  ) : undefined;

  return (
    <Box
      sx={{
        px: 2,
        pt: 1.5,
        pb: 2,
        bgcolor: (theme) =>
          theme.palette.mode === 'dark'
            ? 'background.default'
            : 'grey.50',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 1,
          maxWidth: 900,
          mx: 'auto',
        }}
      >
        <OutlinedInput
          inputRef={inputRef}
          fullWidth
          multiline
          maxRows={5}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isStreaming || disabled}
          startAdornment={webSearchButton}
          endAdornment={
            <InputAdornment position="end">
              <IconButton
                onClick={handleSubmit}
                disabled={!canSend}
                sx={{
                  bgcolor: canSend ? theme.palette.primary.main : theme.palette.action.disabledBackground,
                  color: canSend ? theme.palette.primary.contrastText : theme.palette.action.disabled,
                  '&:hover': {
                    bgcolor: canSend ? theme.palette.primary.dark : theme.palette.action.disabledBackground,
                  },
                  width: 36,
                  height: 36,
                }}
              >
                <SendIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          }
          sx={{
            bgcolor: 'background.paper',
            borderRadius: 3,
            boxShadow: theme.palette.mode === 'dark'
              ? '0 2px 12px rgba(0, 0, 0, 0.4)'
              : '0 2px 12px rgba(0, 0, 0, 0.08)',
            '& .MuiOutlinedInput-notchedOutline': {
              borderRadius: 3,
              borderColor: theme.palette.mode === 'dark'
                ? 'rgba(255, 255, 255, 0.08)'
                : 'rgba(0, 0, 0, 0.08)',
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: theme.palette.mode === 'dark'
                ? 'rgba(255, 255, 255, 0.15)'
                : 'rgba(0, 0, 0, 0.15)',
            },
          }}
        />
      </Box>
    </Box>
  );
}
