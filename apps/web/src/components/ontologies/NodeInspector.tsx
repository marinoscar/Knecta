import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Divider,
  Paper,
  useTheme,
  Chip,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import CodeMirror from '@uiw/react-codemirror';
import { yaml } from '@codemirror/lang-yaml';
import type { GraphNode } from '../../types';

interface NodeInspectorProps {
  node: GraphNode | null;
  open: boolean;
  onClose: () => void;
}

export function NodeInspector({ node, open, onClose }: NodeInspectorProps) {
  const theme = useTheme();

  if (!node) return null;

  const isDataset = node.label === 'Dataset';

  // Helper to safely convert unknown to string
  const asString = (value: unknown): string => String(value ?? '');

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: { width: { xs: '100%', sm: 500 }, p: 3 },
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip
            label={node.label}
            color={isDataset ? 'primary' : 'success'}
            size="small"
          />
          <Typography variant="h6">
            {(node.properties.label as string) || node.name}
          </Typography>
        </Box>
        <IconButton onClick={onClose} edge="end">
          <CloseIcon />
        </IconButton>
      </Box>

      <Divider sx={{ mb: 3 }} />

      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>
          Properties
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column' as const, gap: 2 }}>
          {isDataset ? (
            <>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Name
                </Typography>
                <Typography variant="body2">
                  {asString(node.properties.name || node.name)}
                </Typography>
              </Box>
              {node.properties.label ? (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Label
                  </Typography>
                  <Typography variant="body2">
                    {asString(node.properties.label)}
                  </Typography>
                </Box>
              ) : null}
              {node.properties.source ? (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Source
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                    {asString(node.properties.source)}
                  </Typography>
                </Box>
              ) : null}
              {node.properties.description ? (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Description
                  </Typography>
                  <Typography variant="body2">
                    {asString(node.properties.description)}
                  </Typography>
                </Box>
              ) : null}
            </>
          ) : (
            <>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Field Name
                </Typography>
                <Typography variant="body2">
                  {asString(node.properties.name || node.name)}
                </Typography>
              </Box>
              {node.properties.datasetName ? (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Dataset
                  </Typography>
                  <Typography variant="body2">
                    {asString(node.properties.datasetName)}
                  </Typography>
                </Box>
              ) : null}
              {node.properties.expression ? (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Expression
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                    {asString(node.properties.expression)}
                  </Typography>
                </Box>
              ) : null}
              {node.properties.label ? (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Label
                  </Typography>
                  <Typography variant="body2">
                    {asString(node.properties.label)}
                  </Typography>
                </Box>
              ) : null}
              {node.properties.description ? (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Description
                  </Typography>
                  <Typography variant="body2">
                    {asString(node.properties.description)}
                  </Typography>
                </Box>
              ) : null}
            </>
          )}
        </Box>
      </Box>

      {node.properties.yaml ? (
        <Box>
          <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>
            YAML Definition
          </Typography>
          <Paper
            sx={{
              bgcolor: theme.palette.mode === 'dark' ? theme.palette.grey[900] : theme.palette.grey[100],
              overflow: 'hidden',
            }}
          >
            <CodeMirror
              value={asString(node.properties.yaml)}
              height="400px"
              extensions={[yaml()]}
              theme={theme.palette.mode === 'dark' ? 'dark' : 'light'}
              readOnly={true}
              basicSetup={{
                lineNumbers: true,
                foldGutter: true,
                highlightActiveLineGutter: false,
                highlightActiveLine: false,
              }}
            />
          </Paper>
        </Box>
      ) : null}
    </Drawer>
  );
}
