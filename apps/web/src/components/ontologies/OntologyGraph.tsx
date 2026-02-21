import { useMemo, useRef, useEffect, useState } from 'react';
import { Box, Paper, Typography, useTheme } from '@mui/material';
import ForceGraph2D from 'react-force-graph-2d';
import type { OntologyGraph, GraphNode } from '../../types';

interface OntologyGraphProps {
  graph: OntologyGraph;
  onNodeClick?: (node: GraphNode) => void;
  showFields?: boolean; // Default: false (datasets-only by default)
}

export function OntologyGraph({ graph, onNodeClick, showFields = false }: OntologyGraphProps) {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Update dimensions when container size changes
  useEffect(() => {
    if (!containerRef.current) return;

    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setDimensions({ width: width || 800, height: height || 600 });
      }
    };

    updateDimensions();

    const observer = new ResizeObserver(updateDimensions);
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, []);

  // Transform graph data to react-force-graph-2d format
  const graphData = useMemo(() => {
    const filteredNodes = showFields
      ? graph.nodes
      : graph.nodes.filter(n => n.label === 'Dataset');

    const nodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredEdges = graph.edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

    return {
      nodes: filteredNodes.map(n => ({
        id: n.id,
        name: n.name,
        displayLabel: (n.properties.label as string) || n.name,
        label: n.label,
        color: n.label === 'Dataset' ? theme.palette.primary.main : theme.palette.success.main,
        val: n.label === 'Dataset' ? 10 : 3,
        graphNode: n,
        ...n.properties,
      })),
      links: filteredEdges.map(e => ({
        source: e.source,
        target: e.target,
        type: e.type,
        color: e.type === 'RELATES_TO' ? theme.palette.warning.main : theme.palette.grey[500],
        ...e.properties,
      })),
    };
  }, [graph, showFields, theme]);

  const handleNodeClick = (node: any) => {
    if (onNodeClick && node.graphNode) {
      onNodeClick(node.graphNode);
    }
  };

  // Custom node rendering
  const nodeCanvasObject = (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const label = node.displayLabel || node.name;
    const fontSize = 12 / globalScale;
    const isDataset = node.label === 'Dataset';
    const nodeRadius = isDataset ? 8 : 3;

    // Draw node circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, nodeRadius, 0, 2 * Math.PI);
    ctx.fillStyle = node.color;
    ctx.fill();

    // Draw label for Dataset nodes
    if (isDataset) {
      ctx.font = `${fontSize}px Sans-Serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = theme.palette.text.primary;
      ctx.fillText(label, node.x, node.y + nodeRadius + fontSize);
    }
  };

  return (
    <Box ref={containerRef} sx={{ width: '100%', height: '100%', position: 'relative' }}>
      <ForceGraph2D
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        nodeLabel={(node: any) => {
          const dl = node.displayLabel;
          return dl && dl !== node.name ? `${dl} (${node.name})` : node.name;
        }}
        nodeColor={(node: any) => node.color}
        nodeVal={(node: any) => node.val}
        nodeCanvasObject={nodeCanvasObject}
        linkLabel={(link: any) => link.type}
        linkColor={(link: any) => link.color}
        linkDirectionalArrowLength={6}
        linkDirectionalArrowRelPos={1}
        onNodeClick={handleNodeClick}
        cooldownTicks={100}
        backgroundColor={theme.palette.background.default}
      />

      {/* Legend */}
      <Paper
        sx={{
          position: 'absolute',
          top: 16,
          right: 16,
          p: 2,
          bgcolor: theme.palette.mode === 'dark' ? 'rgba(30, 30, 30, 0.9)' : 'rgba(255, 255, 255, 0.9)',
        }}
      >
        <Typography variant="subtitle2" gutterBottom>
          Legend
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                bgcolor: theme.palette.primary.main,
              }}
            />
            <Typography variant="body2">Dataset</Typography>
          </Box>
          {showFields && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box
                sx={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  bgcolor: theme.palette.success.main,
                }}
              />
              <Typography variant="body2">Field</Typography>
            </Box>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 24,
                height: 2,
                bgcolor: theme.palette.warning.main,
              }}
            />
            <Typography variant="body2">RELATES_TO</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 24,
                height: 2,
                bgcolor: theme.palette.grey[500],
              }}
            />
            <Typography variant="body2">HAS_FIELD</Typography>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
