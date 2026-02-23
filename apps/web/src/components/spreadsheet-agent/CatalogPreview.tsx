import {
  Box,
  Typography,
  Paper,
} from '@mui/material';

interface CatalogPreviewProps {
  catalog: Record<string, unknown> | null;
}

export function CatalogPreview({ catalog }: CatalogPreviewProps) {
  if (!catalog) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">
          Catalog will be available after a successful run
        </Typography>
      </Box>
    );
  }

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        maxHeight: 600,
        overflow: 'auto',
        bgcolor: 'grey.900',
      }}
    >
      <Box
        component="pre"
        sx={{
          m: 0,
          fontFamily: 'monospace',
          fontSize: '0.85rem',
          color: 'grey.100',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {JSON.stringify(catalog, null, 2)}
      </Box>
    </Paper>
  );
}
