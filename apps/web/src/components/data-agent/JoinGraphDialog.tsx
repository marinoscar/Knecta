import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Box,
  Typography,
  Chip,
  Divider,
  Paper,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import CodeMirror from '@uiw/react-codemirror';
import { yaml } from '@codemirror/lang-yaml';
import { OntologyGraph as OntologyGraphComponent } from '../ontologies/OntologyGraph';
import { joinPlanToGraph } from './insightsUtils';
import type { JoinPlanData, JoinEdgeData } from './insightsUtils';
import type { GraphNode } from '../../types';

interface JoinGraphDialogProps {
  joinPlan: JoinPlanData;
  open: boolean;
  onClose: () => void;
}

export function JoinGraphDialog({ joinPlan, open, onClose }: JoinGraphDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  // Compute graph data from join plan
  const graphData = useMemo(() => joinPlanToGraph(joinPlan), [joinPlan]);

  // Helper to find edges involving the selected node
  const getNodeEdges = (nodeName: string): JoinEdgeData[] => {
    return joinPlan.joinPaths.flatMap((jp) =>
      jp.edges.filter((e) => e.fromDataset === nodeName || e.toDataset === nodeName)
    );
  };

  // Reset selected node when dialog closes
  const handleClose = () => {
    setSelectedNode(null);
    onClose();
  };

  // Helper to safely convert unknown to string
  const asString = (value: unknown): string => String(value ?? '');

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth={isMobile ? false : 'lg'}
      fullWidth={!isMobile}
      fullScreen={isMobile}
      PaperProps={{
        sx: {
          height: isMobile ? '100%' : '80vh',
        },
      }}
    >
      {/* Title */}
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Typography variant="h6" fontWeight={600}>
          Navigator Join Graph
        </Typography>
        <IconButton onClick={handleClose} edge="end">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      {/* Content */}
      <DialogContent sx={{ p: 0, overflow: 'hidden', height: '100%' }}>
        {graphData.nodes.length === 0 ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
            }}
          >
            <Typography variant="body2" color="text.secondary">
              No datasets found
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', md: 'row' },
              height: '100%',
            }}
          >
            {/* Graph pane */}
            <Box sx={{ flex: 1, minWidth: 0, position: 'relative' }}>
              <OntologyGraphComponent
                graph={graphData}
                showFields={false}
                onNodeClick={setSelectedNode}
              />
            </Box>

            {/* Detail pane - only show when node selected */}
            {selectedNode && (
              <Box
                sx={{
                  width: { xs: '100%', md: 350 },
                  maxHeight: { xs: '40vh', md: 'none' },
                  borderLeft: { xs: 0, md: 1 },
                  borderTop: { xs: 1, md: 0 },
                  borderColor: 'divider',
                  overflowY: 'auto',
                  bgcolor: 'background.paper',
                }}
              >
                {/* Detail header */}
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    p: 2,
                    borderBottom: 1,
                    borderColor: 'divider',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip label={selectedNode.label} color="primary" size="small" />
                    <Typography variant="subtitle2" fontWeight={600}>
                      {selectedNode.name}
                    </Typography>
                  </Box>
                  <IconButton size="small" onClick={() => setSelectedNode(null)}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Box>

                {/* Dataset properties */}
                <Box sx={{ p: 2 }}>
                  {selectedNode.properties.source && (
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="caption" color="text.secondary">
                        Source
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
                      >
                        {asString(selectedNode.properties.source)}
                      </Typography>
                    </Box>
                  )}

                  {selectedNode.properties.description && (
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="caption" color="text.secondary">
                        Description
                      </Typography>
                      <Typography variant="body2">
                        {asString(selectedNode.properties.description)}
                      </Typography>
                    </Box>
                  )}

                  {/* Joins section */}
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                      Joins
                    </Typography>
                    {(() => {
                      const edges = getNodeEdges(selectedNode.name);
                      if (edges.length === 0) {
                        return (
                          <Typography variant="body2" color="text.secondary" fontStyle="italic">
                            No joins
                          </Typography>
                        );
                      }
                      return (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                          {edges.map((edge, idx) => {
                            const isSource = edge.fromDataset === selectedNode.name;
                            const targetDataset = isSource ? edge.toDataset : edge.fromDataset;
                            const fromCols = isSource
                              ? edge.fromColumns.join(', ')
                              : edge.toColumns.join(', ');
                            const toCols = isSource
                              ? edge.toColumns.join(', ')
                              : edge.fromColumns.join(', ');

                            return (
                              <Paper
                                key={idx}
                                variant="outlined"
                                sx={{
                                  p: 1,
                                  bgcolor: 'action.hover',
                                }}
                              >
                                <Typography variant="body2" sx={{ mb: 0.5 }}>
                                  <strong>{targetDataset}</strong>
                                </Typography>
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  sx={{ fontFamily: 'monospace' }}
                                >
                                  {fromCols} = {toCols}
                                </Typography>
                              </Paper>
                            );
                          })}
                        </Box>
                      );
                    })()}
                  </Box>

                  {/* YAML definition */}
                  {selectedNode.properties.yaml && (
                    <>
                      <Divider sx={{ my: 2 }} />
                      <Box>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ mb: 1, display: 'block' }}
                        >
                          YAML Definition
                        </Typography>
                        <Paper
                          sx={{
                            bgcolor:
                              theme.palette.mode === 'dark'
                                ? theme.palette.grey[900]
                                : theme.palette.grey[100],
                            overflow: 'hidden',
                          }}
                        >
                          <CodeMirror
                            value={asString(selectedNode.properties.yaml)}
                            height="300px"
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
                    </>
                  )}
                </Box>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
