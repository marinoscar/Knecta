import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  ArrowForward as ArrowForwardIcon,
  PlayArrow as PlayArrowIcon,
} from '@mui/icons-material';
import { useConnections } from '../hooks/useConnections';
import { useDiscovery } from '../hooks/useDiscovery';
import { usePermissions } from '../hooks/usePermissions';
import { createSemanticModelRun } from '../services/api';
import type { DataConnection, TableInfo } from '../types';
import { AgentSidebar } from '../components/semantic-models/AgentSidebar';

const steps = ['Select Connection', 'Select Database', 'Select Tables', 'Generate Model'];

export default function NewSemanticModelPage() {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canGenerate = hasPermission('semantic_models:generate');

  const [activeStep, setActiveStep] = useState(0);
  const [selectedConnection, setSelectedConnection] = useState<DataConnection | null>(null);
  const [selectedDatabase, setSelectedDatabase] = useState('');
  const [selectedTables, setSelectedTables] = useState<string[]>([]); // "schema.table" format
  const [isStarting, setIsStarting] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  // Check if some (but not all) tables in a schema are selected
  const isSchemaPartiallySelected = (schemaName: string): boolean => {
    const schemaTables = tablesBySchema.get(schemaName) || [];
    const selectedCount = schemaTables.filter((t) =>
      selectedTables.includes(`${t.schema}.${t.name}`)
    ).length;
    return selectedCount > 0 && selectedCount < schemaTables.length;
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
    if (activeStep < steps.length - 1) {
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
      });
      setRunId(run.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start agent');
    } finally {
      setIsStarting(false);
    }
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
        return true;
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

        <Box sx={{ display: 'flex', gap: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Paper sx={{ p: 3, mb: 3 }}>
              <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
                {steps.map((label) => (
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

              {/* Step 2: Select Database */}
              {activeStep === 1 && (
                <Box>
                  <Typography variant="h6" gutterBottom>
                    Select Database
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Choose which database to analyze
                  </Typography>

                  {discoveryLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                      <CircularProgress />
                    </Box>
                  ) : databases.length === 0 ? (
                    <Alert severity="info">No databases found for this connection.</Alert>
                  ) : (
                    <FormControl fullWidth>
                      <InputLabel>Database</InputLabel>
                      <Select
                        value={selectedDatabase}
                        onChange={(e) => setSelectedDatabase(e.target.value)}
                        label="Database"
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
                    Select Schemas and Tables
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Choose which tables to include in the semantic model
                  </Typography>

                  {discoveryLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                      <CircularProgress />
                    </Box>
                  ) : tablesBySchema.size === 0 ? (
                    <Alert severity="info">No tables found in the selected database.</Alert>
                  ) : (
                    <Box>
                      <Box sx={{ mb: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                        <Typography variant="body2" fontWeight="medium">
                          Selected: {selectedTables.length} table(s) across{' '}
                          {new Set(selectedTables.map((t) => t.split('.')[0])).size} schema(s)
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
                                    Schema: {schemaName}
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
                        Database
                      </Typography>
                      <Typography variant="body1" sx={{ mb: 2 }}>
                        {selectedDatabase}
                      </Typography>

                      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                        Selection Summary
                      </Typography>
                      <Box>
                        <Typography variant="body2">
                          • {new Set(selectedTables.map((t) => t.split('.')[0])).size} schema(s)
                        </Typography>
                        <Typography variant="body2">• {selectedTables.length} table(s)</Typography>
                      </Box>
                    </CardContent>
                  </Card>

                  {runId ? (
                    <Alert severity="success" sx={{ mb: 2 }}>
                      Agent started successfully! The agent will now analyze your database and create a
                      semantic model. Use the sidebar to interact with the agent.
                    </Alert>
                  ) : (
                    <Button
                      variant="contained"
                      size="large"
                      startIcon={isStarting ? <CircularProgress size={20} /> : <PlayArrowIcon />}
                      onClick={handleStartAgent}
                      disabled={isStarting}
                      fullWidth
                    >
                      {isStarting ? 'Starting Agent...' : 'Start Agent'}
                    </Button>
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
                <Button
                  endIcon={<ArrowForwardIcon />}
                  variant="contained"
                  onClick={handleNext}
                  disabled={!canProceed() || activeStep === steps.length - 1 || runId !== null}
                >
                  Next
                </Button>
              </Box>
            </Paper>
          </Box>

          {/* Agent Sidebar */}
          {runId && (
            <Box sx={{ width: 400 }}>
              <AgentSidebar open={true} runId={runId} />
            </Box>
          )}
        </Box>
      </Box>
    </Container>
  );
}
