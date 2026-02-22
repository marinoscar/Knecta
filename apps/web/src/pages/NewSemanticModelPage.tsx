import { useState, useEffect, useMemo } from 'react';
import {
  Container,
  Box,
  Paper,
  Typography,
  Stepper,
  Step,
  StepLabel,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Checkbox,
  CircularProgress,
  Alert,
  Chip,
  Divider,
  Card,
  CardContent,
  TextField,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  ArrowForward as ArrowForwardIcon,
  PlayArrow as PlayArrowIcon,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useConnections } from '../hooks/useConnections';
import { useDiscovery } from '../hooks/useDiscovery';
import { usePermissions } from '../hooks/usePermissions';
import { createSemanticModelRun } from '../services/api';
import type { DataConnection, TableInfo } from '../types';
import { AgentLog } from '../components/semantic-models/AgentLog';

function getDatabaseLabel(dbType: string | undefined): string {
  if (dbType === 's3') return 'Bucket';
  if (dbType === 'azure_blob') return 'Container';
  return 'Database';
}

function getSchemaLabel(dbType: string | undefined): string {
  if (dbType === 's3' || dbType === 'azure_blob') return 'Folder';
  return 'Schema';
}


export default function NewSemanticModelPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { hasPermission } = usePermissions();
  const canGenerate = hasPermission('semantic_models:generate');

  const [activeStep, setActiveStep] = useState(0);
  const [selectedConnection, setSelectedConnection] = useState<DataConnection | null>(null);
  const [selectedDatabase, setSelectedDatabase] = useState('');
  const [selectedTables, setSelectedTables] = useState<string[]>([]); // "schema.table" format
  const [isStarting, setIsStarting] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modelName, setModelName] = useState('');
  const [modelInstructions, setModelInstructions] = useState('');

  const { connections, fetchConnections, isLoading: connectionsLoading } = useConnections();
  const {
    databases,
    schemas,
    tables,
    isLoading: discoveryLoading,
    fetchDatabases,
    fetchSchemas,
    fetchTables,
    reset,
    error: discoveryError,
  } = useDiscovery();

  // Fetch connections on mount
  useEffect(() => {
    fetchConnections({ pageSize: 100 });
  }, [fetchConnections]);

  // When connection changes, fetch databases and reset downstream state
  useEffect(() => {
    if (selectedConnection) {
      setSelectedDatabase('');
      setSelectedTables([]);
      reset();
      fetchDatabases(selectedConnection.id);
    }
  }, [selectedConnection, fetchDatabases, reset]);

  // When database changes, fetch schemas
  useEffect(() => {
    if (selectedConnection && selectedDatabase) {
      setSelectedTables([]);
      fetchSchemas(selectedConnection.id, selectedDatabase);
    }
  }, [selectedConnection, selectedDatabase, fetchSchemas]);

  // When schemas load, fetch tables for each schema
  useEffect(() => {
    if (selectedConnection && selectedDatabase && schemas.length > 0) {
      schemas.forEach((schema) => {
        fetchTables(selectedConnection.id, selectedDatabase, schema.name);
      });
    }
  }, [selectedConnection, selectedDatabase, schemas, fetchTables]);

  // Handle retry state from location
  useEffect(() => {
    const retryRun = (location.state as any)?.retryRun;
    if (retryRun && connections.length > 0) {
      const conn = connections.find((c) => c.id === retryRun.connectionId);
      if (conn) {
        setSelectedConnection(conn);
        setSelectedDatabase(retryRun.databaseName);
        setSelectedTables(retryRun.selectedTables);
        setActiveStep(3); // Go directly to Review step
      }
    }
  }, [location.state, connections]);

  // Derive contextual step labels based on selected connection type
  const dbLabel = getDatabaseLabel(selectedConnection?.dbType);
  const schemaLabel = getSchemaLabel(selectedConnection?.dbType);
  const wizardSteps = useMemo(
    () => ['Select Connection', `Select ${dbLabel}`, 'Select Tables', 'Generate Model'],
    [dbLabel]
  );

  // Filter only successfully tested connections
  const testedConnections = useMemo(
    () => connections.filter((conn) => conn.lastTestResult === true),
    [connections]
  );

  // Group tables by schema
  const tablesBySchema = useMemo(() => {
    const grouped = new Map<string, TableInfo[]>();
    tables.forEach((table) => {
      const existing = grouped.get(table.schema) || [];
      grouped.set(table.schema, [...existing, table]);
    });
    return grouped;
  }, [tables]);

  // Check if all tables in a schema are selected
  const isSchemaFullySelected = (schemaName: string): boolean => {
    const schemaTables = tablesBySchema.get(schemaName) || [];
    if (schemaTables.length === 0) return false;
    return schemaTables.every((t) => selectedTables.includes(`${t.schema}.${t.name}`));
  };

  const handleSelectAllSchema = (schemaName: string) => {
    const schemaTables = tablesBySchema.get(schemaName) || [];
    const tableKeys = schemaTables.map((t) => `${t.schema}.${t.name}`);

    if (isSchemaFullySelected(schemaName)) {
      // Deselect all
      setSelectedTables((prev) => prev.filter((t) => !tableKeys.includes(t)));
    } else {
      // Select all
      setSelectedTables((prev) => [...new Set([...prev, ...tableKeys])]);
    }
  };

  const handleToggleTable = (tableKey: string) => {
    setSelectedTables((prev) =>
      prev.includes(tableKey) ? prev.filter((t) => t !== tableKey) : [...prev, tableKey]
    );
  };

  const handleNext = () => {
    setError(null);
    if (activeStep < wizardSteps.length - 1) {
      setActiveStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    setError(null);
    if (activeStep > 0) {
      setActiveStep((prev) => prev - 1);
    }
  };

  const handleStartAgent = async () => {
    if (!selectedConnection || !selectedDatabase || selectedTables.length === 0) {
      setError('Please ensure all selections are made');
      return;
    }

    setIsStarting(true);
    setError(null);
    try {
      const selectedSchemaNames = [...new Set(selectedTables.map((t) => t.split('.')[0]))];
      const run = await createSemanticModelRun({
        connectionId: selectedConnection.id,
        databaseName: selectedDatabase,
        selectedSchemas: selectedSchemaNames,
        selectedTables,
        name: modelName,
        instructions: modelInstructions || undefined,
      });
      setRunId(run.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start agent');
    } finally {
      setIsStarting(false);
    }
  };

  const handleRetry = () => {
    setRunId(null);
    setError(null);
  };

  const handleExit = () => {
    navigate('/semantic-models');
  };

  const canProceed = () => {
    switch (activeStep) {
      case 0:
        return selectedConnection !== null;
      case 1:
        return selectedDatabase !== '';
      case 2:
        return selectedTables.length > 0;
      case 3:
        return modelName.trim().length > 0;
      default:
        return false;
    }
  };

  if (!canGenerate) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ py: 4 }}>
          <Alert severity="error">
            You do not have permission to generate semantic models. Please contact your administrator.
          </Alert>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          New Semantic Model
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
          Follow the steps to configure and generate a new semantic model
        </Typography>

        <Paper sx={{ p: 3, mb: 3 }}>
              <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
                {wizardSteps.map((label) => (
                  <Step key={label}>
                    <StepLabel>{label}</StepLabel>
                  </Step>
                ))}
              </Stepper>

              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}

              {discoveryError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {discoveryError}
                </Alert>
              )}

              {/* Step 1: Select Connection */}
              {activeStep === 0 && (
                <Box>
                  <Typography variant="h6" gutterBottom>
                    Select Database Connection
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Choose a tested connection to use for the semantic model
                  </Typography>

                  {connectionsLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                      <CircularProgress />
                    </Box>
                  ) : testedConnections.length === 0 ? (
                    <Alert severity="info">
                      No tested connections available. Please create and test a connection first.
                    </Alert>
                  ) : (
                    <FormControl fullWidth>
                      <InputLabel>Connection</InputLabel>
                      <Select
                        value={selectedConnection?.id || ''}
                        onChange={(e) => {
                          const conn = testedConnections.find((c) => c.id === e.target.value);
                          setSelectedConnection(conn || null);
                        }}
                        label="Connection"
                      >
                        {testedConnections.map((conn) => (
                          <MenuItem key={conn.id} value={conn.id}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              {conn.name}
                              <Chip label={conn.dbType} size="small" />
                              <Chip label="Connected" color="success" size="small" />
                            </Box>
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                </Box>
              )}

              {/* Step 2: Select Database / Bucket / Container */}
              {activeStep === 1 && (
                <Box>
                  <Typography variant="h6" gutterBottom>
                    Select {dbLabel}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Choose which {dbLabel.toLowerCase()} to analyze
                  </Typography>

                  {discoveryLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                      <CircularProgress />
                    </Box>
                  ) : databases.length === 0 ? (
                    <Alert severity="info">No {dbLabel.toLowerCase()}s found for this connection.</Alert>
                  ) : (
                    <FormControl fullWidth>
                      <InputLabel>{dbLabel}</InputLabel>
                      <Select
                        value={selectedDatabase}
                        onChange={(e) => setSelectedDatabase(e.target.value)}
                        label={dbLabel}
                      >
                        {databases.map((db) => (
                          <MenuItem key={db.name} value={db.name}>
                            {db.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                </Box>
              )}

              {/* Step 3: Select Tables */}
              {activeStep === 2 && (
                <Box>
                  <Typography variant="h6" gutterBottom>
                    Select {schemaLabel}s and Tables
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Choose which tables to include in the semantic model
                  </Typography>

                  {discoveryLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                      <CircularProgress />
                    </Box>
                  ) : tablesBySchema.size === 0 ? (
                    <Alert severity="info">No tables found in the selected {dbLabel.toLowerCase()}.</Alert>
                  ) : (
                    <Box>
                      <Box sx={{ mb: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                        <Typography variant="body2" fontWeight="medium">
                          Selected: {selectedTables.length} table(s) across{' '}
                          {new Set(selectedTables.map((t) => t.split('.')[0])).size} {schemaLabel.toLowerCase()}(s)
                        </Typography>
                      </Box>

                      <Box sx={{ maxHeight: 500, overflow: 'auto' }}>
                        {Array.from(tablesBySchema.entries()).map(([schemaName, schemaTables]) => (
                          <Box key={schemaName} sx={{ mb: 2 }}>
                            <Card variant="outlined">
                              <CardContent>
                                <Box
                                  sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    mb: 1,
                                  }}
                                >
                                  <Typography variant="subtitle1" fontWeight="medium">
                                    {schemaLabel}: {schemaName}
                                  </Typography>
                                  <Button
                                    size="small"
                                    onClick={() => handleSelectAllSchema(schemaName)}
                                  >
                                    {isSchemaFullySelected(schemaName) ? 'Deselect All' : 'Select All'}
                                  </Button>
                                </Box>
                                <Divider sx={{ mb: 1 }} />
                                <List dense disablePadding>
                                  {schemaTables.map((table) => {
                                    const tableKey = `${table.schema}.${table.name}`;
                                    const isSelected = selectedTables.includes(tableKey);
                                    return (
                                      <ListItem key={tableKey} disablePadding>
                                        <ListItemButton
                                          onClick={() => handleToggleTable(tableKey)}
                                          dense
                                        >
                                          <ListItemIcon>
                                            <Checkbox
                                              edge="start"
                                              checked={isSelected}
                                              tabIndex={-1}
                                              disableRipple
                                            />
                                          </ListItemIcon>
                                          <ListItemText
                                            primary={table.name}
                                            secondary={
                                              <Box
                                                sx={{
                                                  display: 'flex',
                                                  alignItems: 'center',
                                                  gap: 0.5,
                                                }}
                                              >
                                                <Chip label={table.type} size="small" />
                                                {table.rowCountEstimate !== undefined && (
                                                  <Typography variant="caption" color="text.secondary">
                                                    ~{table.rowCountEstimate.toLocaleString()} rows
                                                  </Typography>
                                                )}
                                              </Box>
                                            }
                                          />
                                        </ListItemButton>
                                      </ListItem>
                                    );
                                  })}
                                </List>
                              </CardContent>
                            </Card>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  )}
                </Box>
              )}

              {/* Step 4: Review and Start */}
              {activeStep === 3 && (
                <Box>
                  {runId ? (
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                        <Typography variant="body2" color="text.secondary">
                          {selectedConnection?.name} • {selectedDatabase} • {selectedTables.length} tables
                        </Typography>
                      </Box>
                      <AgentLog runId={runId} onRetry={handleRetry} onExit={handleExit} />
                    </Box>
                  ) : (
                    <>
                      <Typography variant="h6" gutterBottom>
                        Review and Generate
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        Review your selections and start the semantic model generation
                      </Typography>

                      <Card variant="outlined" sx={{ mb: 3 }}>
                        <CardContent>
                          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                            Connection
                          </Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                            <Typography variant="body1">{selectedConnection?.name}</Typography>
                            <Chip label={selectedConnection?.dbType} size="small" />
                          </Box>

                          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                            {dbLabel}
                          </Typography>
                          <Typography variant="body1" sx={{ mb: 2 }}>
                            {selectedDatabase}
                          </Typography>

                          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                            Selection Summary
                          </Typography>
                          <Box>
                            <Typography variant="body2">
                              • {new Set(selectedTables.map((t) => t.split('.')[0])).size} {schemaLabel.toLowerCase()}(s)
                            </Typography>
                            <Typography variant="body2">• {selectedTables.length} table(s)</Typography>
                          </Box>
                        </CardContent>
                      </Card>

                      <TextField
                        fullWidth
                        required
                        label="Model Name"
                        value={modelName}
                        onChange={(e) => setModelName(e.target.value)}
                        placeholder="e.g., Sales Analytics, HR Database Model"
                        helperText="Give your semantic model a descriptive name"
                        sx={{ mb: 2 }}
                      />

                      <TextField
                        fullWidth
                        multiline
                        minRows={3}
                        maxRows={6}
                        label="Instructions for the Agent (optional)"
                        value={modelInstructions}
                        onChange={(e) => setModelInstructions(e.target.value)}
                        placeholder="Describe the database, industry, or business context to help the agent generate better results"
                        helperText="Provide context about your business domain, common terms, or specific requirements"
                        sx={{ mb: 3 }}
                        inputProps={{ maxLength: 2000 }}
                      />

                      <Button
                        variant="contained"
                        size="large"
                        startIcon={isStarting ? <CircularProgress size={20} /> : <PlayArrowIcon />}
                        onClick={handleStartAgent}
                        disabled={isStarting || modelName.trim().length === 0}
                        fullWidth
                      >
                        {isStarting ? 'Starting Agent...' : 'Start Agent'}
                      </Button>
                    </>
                  )}
                </Box>
              )}

              {/* Navigation buttons */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
                <Button
                  startIcon={<ArrowBackIcon />}
                  onClick={handleBack}
                  disabled={activeStep === 0 || runId !== null}
                >
                  Back
                </Button>
                {activeStep < wizardSteps.length - 1 && (
                  <Button
                    endIcon={<ArrowForwardIcon />}
                    variant="contained"
                    onClick={handleNext}
                    disabled={!canProceed() || runId !== null}
                  >
                    Next
                  </Button>
                )}
              </Box>
            </Paper>
      </Box>
    </Container>
  );
}
