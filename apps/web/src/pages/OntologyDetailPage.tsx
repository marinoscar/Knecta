import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  Paper,
  Typography,
  Chip,
  CircularProgress,
  Alert,
  Button,
  FormControlLabel,
  Switch,
  Snackbar,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon, Download as DownloadIcon } from '@mui/icons-material';
import { getOntology, getOntologyGraph, exportOntologyRdf } from '../services/api';
import type { Ontology, OntologyGraph, GraphNode } from '../types';
import { OntologyGraph as OntologyGraphComponent } from '../components/ontologies/OntologyGraph';
import { NodeInspector } from '../components/ontologies/NodeInspector';

const STATUS_CONFIG = {
  creating: { label: 'Creating', color: 'warning' as const },
  ready: { label: 'Ready', color: 'success' as const },
  failed: { label: 'Failed', color: 'error' as const },
};

export default function OntologyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [ontology, setOntology] = useState<Ontology | null>(null);
  const [graph, setGraph] = useState<OntologyGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [graphLoading, setGraphLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [showFields, setShowFields] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });

  // Fetch ontology details
  useEffect(() => {
    if (!id) return;

    const fetchOntology = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await getOntology(id);
        setOntology(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load ontology');
      } finally {
        setLoading(false);
      }
    };

    fetchOntology();
  }, [id]);

  // Fetch graph data (only if ontology is ready)
  useEffect(() => {
    if (!id || !ontology || ontology.status !== 'ready') {
      setGraph(null);
      return;
    }

    const fetchGraph = async () => {
      setGraphLoading(true);
      try {
        const result = await getOntologyGraph(id);
        setGraph(result);
      } catch (err) {
        console.error('Failed to load graph:', err);
        setError(err instanceof Error ? err.message : 'Failed to load graph');
      } finally {
        setGraphLoading(false);
      }
    };

    fetchGraph();
  }, [id, ontology]);

  const handleNodeClick = (node: GraphNode) => {
    setSelectedNode(node);
  };

  const handleExportRdf = async () => {
    if (!ontology) return;

    setExporting(true);
    try {
      const result = await exportOntologyRdf(ontology.id);

      const blob = new Blob([result.rdf], { type: 'text/turtle' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${ontology.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.ttl`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setSnackbar({
        open: true,
        message: 'RDF exported successfully',
        severity: 'success',
      });
    } catch (err) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : 'Failed to export RDF',
        severity: 'error',
      });
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <Container maxWidth={false}>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (error && !ontology) {
    return (
      <Container maxWidth={false}>
        <Box sx={{ py: 4 }}>
          <Alert severity="error">{error}</Alert>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/ontologies')} sx={{ mt: 2 }}>
            Back to Ontologies
          </Button>
        </Box>
      </Container>
    );
  }

  if (!ontology) {
    return (
      <Container maxWidth={false}>
        <Box sx={{ py: 4 }}>
          <Alert severity="error">Ontology not found</Alert>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/ontologies')} sx={{ mt: 2 }}>
            Back to Ontologies
          </Button>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth={false} sx={{ py: 3 }}>
      {/* Back button */}
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/ontologies')} sx={{ mb: 2 }}>
        Back to Ontologies
      </Button>

      {/* Header: name, status chip, semantic model info */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Typography variant="h4">{ontology.name}</Typography>
        <Chip
          label={STATUS_CONFIG[ontology.status].label}
          color={STATUS_CONFIG[ontology.status].color}
        />
      </Box>
      {ontology.description && (
        <Typography color="text.secondary" gutterBottom>
          {ontology.description}
        </Typography>
      )}

      {/* Stats row */}
      <Box sx={{ display: 'flex', gap: 3, mb: 3 }}>
        <Chip label={`Nodes: ${ontology.nodeCount}`} variant="outlined" />
        <Chip label={`Relationships: ${ontology.relationshipCount}`} variant="outlined" />
        <Chip
          label={`Model: ${ontology.semanticModel?.name || 'Unknown'}`}
          variant="outlined"
        />
      </Box>

      {ontology.status === 'failed' && ontology.errorMessage && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {ontology.errorMessage}
        </Alert>
      )}

      {ontology.status === 'creating' && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Ontology is being created. This may take a few moments.
        </Alert>
      )}

      {ontology.status === 'ready' && (
        <>
          {/* Toolbar: Toggle + Export */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <FormControlLabel
              control={<Switch checked={showFields} onChange={(e) => setShowFields(e.target.checked)} />}
              label="Show Fields"
            />
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={handleExportRdf}
              disabled={exporting}
            >
              {exporting ? 'Exporting...' : 'Export to RDF'}
            </Button>
          </Box>

          {/* Graph + Inspector layout */}
          <Paper sx={{ position: 'relative', height: 'calc(100vh - 300px)', overflow: 'hidden' }}>
            {graphLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <CircularProgress />
              </Box>
            ) : graph ? (
              <OntologyGraphComponent graph={graph} onNodeClick={handleNodeClick} showFields={showFields} />
            ) : (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <Typography color="text.secondary">No graph data available</Typography>
              </Box>
            )}
          </Paper>

          {/* Node Inspector Drawer */}
          <NodeInspector node={selectedNode} open={!!selectedNode} onClose={() => setSelectedNode(null)} />
        </>
      )}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
      >
        <Alert
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
}
