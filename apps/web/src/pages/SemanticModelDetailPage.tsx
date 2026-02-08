import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  Paper,
  Typography,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
  Chip,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Divider,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { getSemanticModel, exportSemanticModelYaml } from '../services/api';
import type { SemanticModel } from '../types';
import { ModelViewer } from '../components/semantic-models/ModelViewer';
import { YamlPreview } from '../components/semantic-models/YamlPreview';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index, ...other }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`tabpanel-${index}`}
      aria-labelledby={`tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

export default function SemanticModelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [model, setModel] = useState<SemanticModel | null>(null);
  const [yaml, setYaml] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingYaml, setIsLoadingYaml] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    if (!id) return;

    const fetchModel = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await getSemanticModel(id);
        setModel(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load semantic model');
      } finally {
        setIsLoading(false);
      }
    };

    fetchModel();
  }, [id]);

  useEffect(() => {
    if (!id || activeTab !== 4) return; // YAML tab is index 4

    const fetchYaml = async () => {
      if (yaml) return; // Already loaded
      setIsLoadingYaml(true);
      try {
        const result = await exportSemanticModelYaml(id);
        setYaml(result.yaml);
      } catch (err) {
        console.error('Failed to load YAML:', err);
      } finally {
        setIsLoadingYaml(false);
      }
    };

    fetchYaml();
  }, [id, activeTab, yaml]);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  if (isLoading) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (error || !model) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ py: 4 }}>
          <Alert severity="error">{error || 'Semantic model not found'}</Alert>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/semantic-models')} sx={{ mt: 2 }}>
            Back to Semantic Models
          </Button>
        </Box>
      </Container>
    );
  }

  const modelData = model.model as any;
  const osiDef = modelData?.semantic_model?.[0];
  const relationships = osiDef?.relationships || [];
  const metrics = osiDef?.metrics || [];

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Box sx={{ mb: 3 }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/semantic-models')} sx={{ mb: 2 }}>
            Back to Semantic Models
          </Button>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
            <Typography variant="h4" component="h1">
              {model.name}
            </Typography>
            <Chip
              label={model.status}
              color={
                model.status === 'ready'
                  ? 'success'
                  : model.status === 'generating'
                  ? 'warning'
                  : model.status === 'failed'
                  ? 'error'
                  : 'default'
              }
            />
          </Box>
          {model.description && (
            <Typography variant="body1" color="text.secondary">
              {model.description}
            </Typography>
          )}
        </Box>

        <Paper>
          <Tabs value={activeTab} onChange={handleTabChange} sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tab label="Overview" />
            <Tab label="Datasets" />
            <Tab label="Relationships" />
            <Tab label="Metrics" />
            <Tab label="YAML" />
          </Tabs>

          <TabPanel value={activeTab} index={0}>
            <Box sx={{ px: 3 }}>
              <Card variant="outlined" sx={{ mb: 3 }}>
                <CardContent>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Connection
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <Typography variant="body1">{model.connection?.name || 'Unknown'}</Typography>
                    <Chip label={model.connection?.dbType || 'N/A'} size="small" />
                  </Box>

                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Database
                  </Typography>
                  <Typography variant="body1" sx={{ mb: 2 }}>
                    {model.databaseName}
                  </Typography>

                  <Divider sx={{ my: 2 }} />

                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Model Statistics
                  </Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 }}>
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Tables
                      </Typography>
                      <Typography variant="h6">{model.tableCount}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Fields
                      </Typography>
                      <Typography variant="h6">{model.fieldCount}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Relationships
                      </Typography>
                      <Typography variant="h6">{model.relationshipCount}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Metrics
                      </Typography>
                      <Typography variant="h6">{model.metricCount}</Typography>
                    </Box>
                  </Box>

                  <Divider sx={{ my: 2 }} />

                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Timestamps
                  </Typography>
                  <Typography variant="body2">
                    Created: {new Date(model.createdAt).toLocaleString()}
                  </Typography>
                  <Typography variant="body2">
                    Updated: {new Date(model.updatedAt).toLocaleString()}
                  </Typography>
                  <Typography variant="body2">Version: {model.modelVersion}</Typography>
                </CardContent>
              </Card>
            </Box>
          </TabPanel>

          <TabPanel value={activeTab} index={1}>
            <Box sx={{ px: 3 }}>
              <ModelViewer model={osiDef || {}} />
            </Box>
          </TabPanel>

          <TabPanel value={activeTab} index={2}>
            <Box sx={{ px: 3 }}>
              {relationships.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No relationships defined in this model.
                </Typography>
              ) : (
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell>From Dataset</TableCell>
                        <TableCell>From Columns</TableCell>
                        <TableCell>To Dataset</TableCell>
                        <TableCell>To Columns</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {relationships.map((rel: any, index: number) => (
                        <TableRow key={index}>
                          <TableCell>{rel.name || rel.constraintName || '-'}</TableCell>
                          <TableCell>{rel.from || rel.fromTable || '-'}</TableCell>
                          <TableCell>{(rel.from_columns || rel.fromColumns)?.join(', ') || '-'}</TableCell>
                          <TableCell>{rel.to || rel.toTable || '-'}</TableCell>
                          <TableCell>{(rel.to_columns || rel.toColumns)?.join(', ') || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          </TabPanel>

          <TabPanel value={activeTab} index={3}>
            <Box sx={{ px: 3 }}>
              {metrics.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No metrics defined in this model.
                </Typography>
              ) : (
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell>Expression</TableCell>
                        <TableCell>Description</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {metrics.map((metric: any, index: number) => (
                        <TableRow key={index}>
                          <TableCell>{metric.name || '-'}</TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                              {metric.expression?.dialects?.[0]?.expression || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell>{metric.description || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          </TabPanel>

          <TabPanel value={activeTab} index={4}>
            <Box sx={{ px: 3 }}>
              {isLoadingYaml ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress />
                </Box>
              ) : (
                <YamlPreview yaml={yaml} fileName={`${model.name.replace(/\s+/g, '-')}.yaml`} />
              )}
            </Box>
          </TabPanel>
        </Paper>
      </Box>
    </Container>
  );
}
