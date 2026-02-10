import { useState, useRef, useEffect } from 'react';
import { Box, OutlinedInput, IconButton, InputAdornment, useTheme } from '@mui/material';
import { ArrowUpward as SendIcon } from '@mui/icons-material';

interface ChatInputProps {
  onSend: (content: string) => void;
  isStreaming: boolean;
  disabled?: boolean;
}

export function ChatInput({ onSend, isStreaming, disabled = false }: ChatInputProps) {
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

  return (
    <Box
      sx={{
        p: 2,
        borderTop: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
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
            '& .MuiOutlinedInput-notchedOutline': {
              borderRadius: 3,
            },
          }}
        />
      </Box>
    </Box>
  );
}
