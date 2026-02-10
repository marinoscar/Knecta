import { Box, Paper, Typography, IconButton, useTheme } from '@mui/material';
import { ContentCopy as CopyIcon } from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { DataChatMessage } from '../../types';
import { getDataTableComponents } from './DataTable';

interface ChatMessageProps {
  message: DataChatMessage;
}

function TypingIndicator() {
  return (
    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', p: 1 }}>
      <Box
        sx={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          bgcolor: 'text.secondary',
          animation: 'typing 1.4s infinite',
          animationDelay: '0s',
          '@keyframes typing': {
            '0%, 60%, 100%': { opacity: 0.3 },
            '30%': { opacity: 1 },
          },
        }}
      />
      <Box
        sx={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          bgcolor: 'text.secondary',
          animation: 'typing 1.4s infinite',
          animationDelay: '0.2s',
        }}
      />
      <Box
        sx={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          bgcolor: 'text.secondary',
          animation: 'typing 1.4s infinite',
          animationDelay: '0.4s',
        }}
      />
    </Box>
  );
}

function CodeBlock({ language, code }: { language?: string; code: string }) {
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
  };

  return (
    <Box sx={{ position: 'relative', my: 1 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          px: 2,
          py: 0.5,
          bgcolor: '#282c34',
          borderTopLeftRadius: 4,
          borderTopRightRadius: 4,
        }}
      >
        <Typography variant="caption" sx={{ color: '#abb2bf', fontFamily: 'monospace' }}>
          {language || 'code'}
        </Typography>
        <IconButton size="small" onClick={handleCopy} sx={{ color: '#abb2bf' }}>
          <CopyIcon fontSize="small" />
        </IconButton>
      </Box>
      <SyntaxHighlighter
        language={language || 'text'}
        style={oneDark}
        customStyle={{
          margin: 0,
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          borderBottomLeftRadius: 4,
          borderBottomRightRadius: 4,
        }}
      >
        {code}
      </SyntaxHighlighter>
    </Box>
  );
}

export function ChatMessage({ message }: ChatMessageProps) {
  const theme = useTheme();
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'flex-end',
          mb: 2,
        }}
      >
        <Paper
          sx={{
            maxWidth: '70%',
            px: 2,
            py: 1.5,
            bgcolor: theme.palette.primary.main,
            color: theme.palette.primary.contrastText,
            borderRadius: 2,
          }}
        >
          <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
            {message.content}
          </Typography>
        </Paper>
      </Box>
    );
  }

  // Assistant message
  const showTyping = message.status === 'generating' && !message.content;

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'flex-start',
        mb: 2,
      }}
    >
      <Paper
        sx={{
          maxWidth: '85%',
          px: 2,
          py: 1.5,
          bgcolor: theme.palette.background.paper,
          borderRadius: 2,
        }}
      >
        {showTyping ? (
          <TypingIndicator />
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              ...getDataTableComponents(),
              code({ node, inline, className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || '');
                const code = String(children).replace(/\n$/, '');

                if (!inline && match) {
                  return <CodeBlock language={match[1]} code={code} />;
                }

                return (
                  <Box
                    component="code"
                    sx={{
                      bgcolor: theme.palette.action.hover,
                      px: 0.75,
                      py: 0.25,
                      borderRadius: 0.5,
                      fontFamily: 'monospace',
                      fontSize: '0.875em',
                    }}
                    {...props}
                  >
                    {children}
                  </Box>
                );
              },
              img({ src, alt }) {
                // Handle base64 images
                if (src?.startsWith('data:image')) {
                  return (
                    <Box
                      component="img"
                      src={src}
                      alt={alt}
                      sx={{
                        maxWidth: '100%',
                        height: 'auto',
                        borderRadius: 1,
                        my: 1,
                      }}
                    />
                  );
                }
                return (
                  <Box
                    component="img"
                    src={src}
                    alt={alt}
                    sx={{
                      maxWidth: '100%',
                      height: 'auto',
                      borderRadius: 1,
                      my: 1,
                    }}
                  />
                );
              },
              p({ children }) {
                return (
                  <Typography variant="body1" component="p" sx={{ mb: 1 }}>
                    {children}
                  </Typography>
                );
              },
              h1: ({ children }) => (
                <Typography variant="h5" sx={{ mt: 2, mb: 1, fontWeight: 'bold' }}>
                  {children}
                </Typography>
              ),
              h2: ({ children }) => (
                <Typography variant="h6" sx={{ mt: 2, mb: 1, fontWeight: 'bold' }}>
                  {children}
                </Typography>
              ),
              h3: ({ children }) => (
                <Typography variant="subtitle1" sx={{ mt: 1.5, mb: 1, fontWeight: 'bold' }}>
                  {children}
                </Typography>
              ),
              ul: ({ children }) => (
                <Box component="ul" sx={{ pl: 2, my: 1 }}>
                  {children}
                </Box>
              ),
              ol: ({ children }) => (
                <Box component="ol" sx={{ pl: 2, my: 1 }}>
                  {children}
                </Box>
              ),
            }}
          >
            {message.content}
          </ReactMarkdown>
        )}
      </Paper>
    </Box>
  );
}
