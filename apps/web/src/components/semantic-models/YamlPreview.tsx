import { useState } from 'react';
import { Paper, Box, Button, Snackbar, Alert, Typography } from '@mui/material';
import { ContentCopy as ContentCopyIcon, Download as DownloadIcon } from '@mui/icons-material';

interface YamlPreviewProps {
  yaml: string;
  fileName?: string;
}

export function YamlPreview({ yaml, fileName = 'semantic-model.yaml' }: YamlPreviewProps) {
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(yaml);
      setSnackbarOpen(true);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <Button startIcon={<ContentCopyIcon />} variant="outlined" onClick={handleCopy}>
          Copy to Clipboard
        </Button>
        <Button startIcon={<DownloadIcon />} variant="outlined" onClick={handleDownload}>
          Download YAML
        </Button>
      </Box>

      <Paper
        sx={{
          p: 2,
          bgcolor: (theme) => theme.palette.mode === 'dark' ? theme.palette.grey[900] : theme.palette.grey[100],
          maxHeight: 600,
          overflow: 'auto',
          fontFamily: 'monospace',
        }}
      >
        <pre
          style={{
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: '0.875rem',
          }}
        >
          {yaml || (
            <Typography variant="body2" color="text.secondary">
              No YAML content available.
            </Typography>
          )}
        </pre>
      </Paper>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSnackbarOpen(false)} severity="success" sx={{ width: '100%' }}>
          Copied to clipboard!
        </Alert>
      </Snackbar>
    </Box>
  );
}
