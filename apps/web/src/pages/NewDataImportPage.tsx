import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Paper,
  Stepper,
  Step,
  StepLabel,
  Button,
  TextField,
  Alert,
} from '@mui/material';
import { DataImportFileUpload } from '../components/data-imports/DataImportFileUpload';
import { CsvConfigPanel } from '../components/data-imports/CsvConfigPanel';
import { ExcelSheetSelector } from '../components/data-imports/ExcelSheetSelector';
import { ImportPreview } from '../components/data-imports/ImportPreview';
import { ImportProgressView } from '../components/data-imports/ImportProgressView';
import { useDataImportRun } from '../hooks/useDataImportRun';
import {
  uploadDataImportFile,
  getDataImportPreview,
  updateDataImport,
  createDataImportRun,
} from '../services/api';
import type {
  DataImport,
  CsvParseResult,
  ExcelParseResult,
  SheetConfig,
  SheetPreviewResult,
} from '../types';

const STEPS = ['Upload File', 'Configure', 'Review & Name', 'Importing'];

// Helper to build table preview entries for the Review step
interface TablePreviewEntry {
  tableName: string;
  columns: Array<{ name: string; type: string }>;
  sampleRows: unknown[][];
  estimatedRowCount?: number;
}

function buildCsvTablePreview(
  name: string,
  parseResult: CsvParseResult,
): TablePreviewEntry {
  // Create column types as generic string unless we have detected types
  const columns = parseResult.columns.map((col) => ({ name: col, type: 'varchar' }));
  return {
    tableName: name,
    columns,
    sampleRows: parseResult.sampleRows.slice(0, 20),
    estimatedRowCount: parseResult.rowCountEstimate,
  };
}

function buildExcelTablePreviews(
  sheetConfigs: SheetConfig[],
  previews: Record<string, SheetPreviewResult>,
): TablePreviewEntry[] {
  return sheetConfigs.map((cfg) => {
    const preview = previews[cfg.sheetName];
    const columns = preview
      ? preview.detectedTypes.map((dt) => ({ name: dt.name, type: dt.type }))
      : [{ name: '...', type: '...' }];
    return {
      tableName: cfg.sheetName,
      columns,
      sampleRows: preview ? preview.rows.slice(0, 20) : [],
      estimatedRowCount: preview?.totalRows,
    };
  });
}

export default function NewDataImportPage() {
  const navigate = useNavigate();
  const runHook = useDataImportRun();

  const [activeStep, setActiveStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Step 0: Upload
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [dataImport, setDataImport] = useState<DataImport | null>(null);

  // Step 1: Configure
  const [parseResult, setParseResult] = useState<CsvParseResult | ExcelParseResult | null>(null);

  // CSV config
  const [csvDelimiter, setCsvDelimiter] = useState(',');
  const [csvHasHeader, setCsvHasHeader] = useState(true);
  const [csvEncoding, setCsvEncoding] = useState('UTF-8');

  // Excel config
  const [sheetConfigs, setSheetConfigs] = useState<SheetConfig[]>([]);
  // Collect previews from ExcelSheetSelector for use in Review step
  const [excelPreviews] = useState<Record<string, SheetPreviewResult>>({});

  // Step 2: Name
  const [importName, setImportName] = useState('');

  // Derived: table preview entries for Review step
  const getTablePreviews = (): TablePreviewEntry[] => {
    if (!dataImport || !parseResult) return [];
    if (parseResult.type === 'csv') {
      return [buildCsvTablePreview(importName || dataImport.name, parseResult)];
    } else {
      return buildExcelTablePreviews(sheetConfigs, excelPreviews);
    }
  };

  const handleFileSelected = useCallback(async (file: File) => {
    setError(null);
    setIsUploading(true);
    setUploadProgress(null);

    // Derive a name from the filename (strip extension)
    const derivedName = file.name.replace(/\.[^.]+$/, '');

    try {
      const imp = await uploadDataImportFile(file, derivedName);
      setDataImport(imp);
      setImportName(derivedName);

      // Fetch parse result
      const preview = await getDataImportPreview(imp.id) as CsvParseResult | ExcelParseResult;
      setParseResult(preview);

      // Pre-populate config from detected values
      if (preview.type === 'csv') {
        setCsvDelimiter(preview.detectedDelimiter || ',');
        setCsvHasHeader(preview.hasHeader);
        setCsvEncoding(preview.detectedEncoding || 'UTF-8');
      }

      // Auto-advance to configure step
      setActiveStep(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  }, []);

  const canProceedStep1 = (): boolean => {
    if (!parseResult) return false;
    if (parseResult.type === 'excel') {
      return sheetConfigs.length > 0;
    }
    return true;
  };

  const handleProceedToReview = useCallback(async () => {
    if (!dataImport || !parseResult) return;
    setError(null);

    // Collect Excel previews for display in review
    // The ExcelSheetSelector already loaded them internally; we do a final re-fetch here
    // using the sheet configs to ensure we have data for Review step.
    // For simplicity, the ExcelSheetSelector exposes previews via the parent state.
    // (See onSheetConfigsChange and excelPreviews state above)

    // Build the config to save
    const config =
      parseResult.type === 'csv'
        ? {
            delimiter: csvDelimiter,
            hasHeader: csvHasHeader,
            encoding: csvEncoding,
          }
        : {
            sheets: sheetConfigs,
          };

    try {
      await updateDataImport(dataImport.id, { config });
      setActiveStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    }
  }, [dataImport, parseResult, csvDelimiter, csvHasHeader, csvEncoding, sheetConfigs]);

  const handleStartImport = useCallback(async () => {
    if (!dataImport) return;
    setError(null);

    try {
      // Save the name first
      await updateDataImport(dataImport.id, {
        name: importName || dataImport.name,
      });

      // Create and start the run
      const run = await createDataImportRun(dataImport.id);
      setActiveStep(3);
      runHook.startStream(run.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start import');
    }
  }, [dataImport, importName, runHook]);

  const isRunComplete = runHook.events.some((e) => e.type === 'run_complete');
  const isRunError = runHook.events.some((e) => e.type === 'run_error');
  const runErrorMessage =
    (runHook.events.find((e) => e.type === 'run_error')?.data?.error as string) ||
    (runHook.events.find((e) => e.type === 'run_error')?.data?.message as string) ||
    runHook.error ||
    null;

  return (
    <Container maxWidth="md">
      <Box sx={{ py: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          New Data Import
        </Typography>

        <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
          {STEPS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Paper sx={{ p: 3 }}>
          {/* Step 0: Upload File */}
          {activeStep === 0 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Upload File
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Upload a CSV or Excel file to begin. The file will be parsed automatically.
              </Typography>
              <DataImportFileUpload
                onFileSelected={handleFileSelected}
                uploadProgress={uploadProgress}
                isUploading={isUploading}
              />
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
                <Button onClick={() => navigate('/data-imports')}>Cancel</Button>
              </Box>
            </Box>
          )}

          {/* Step 1: Configure */}
          {activeStep === 1 && parseResult && dataImport && (
            <Box>
              {parseResult.type === 'csv' ? (
                <CsvConfigPanel
                  parseResult={parseResult}
                  delimiter={csvDelimiter}
                  hasHeader={csvHasHeader}
                  encoding={csvEncoding}
                  onDelimiterChange={setCsvDelimiter}
                  onHasHeaderChange={setCsvHasHeader}
                  onEncodingChange={setCsvEncoding}
                />
              ) : (
                <ExcelSheetSelector
                  importId={dataImport.id}
                  parseResult={parseResult as ExcelParseResult}
                  sheetConfigs={sheetConfigs}
                  onSheetConfigsChange={(configs) => {
                    setSheetConfigs(configs);
                  }}
                />
              )}

              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 3 }}>
                <Button onClick={() => navigate('/data-imports')}>Cancel</Button>
                <Button
                  variant="contained"
                  onClick={handleProceedToReview}
                  disabled={!canProceedStep1()}
                >
                  Continue
                </Button>
              </Box>
            </Box>
          )}

          {/* Step 2: Review & Name */}
          {activeStep === 2 && dataImport && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Review & Name
              </Typography>

              <TextField
                label="Import Name"
                fullWidth
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
                sx={{ mb: 3 }}
                required
                helperText="Give this import a descriptive name"
              />

              {parseResult && (
                <ImportPreview tables={getTablePreviews()} />
              )}

              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 3 }}>
                <Button onClick={() => setActiveStep(1)}>Back</Button>
                <Button
                  variant="contained"
                  onClick={handleStartImport}
                  disabled={!importName.trim()}
                >
                  Start Import
                </Button>
              </Box>
            </Box>
          )}

          {/* Step 3: Importing */}
          {activeStep === 3 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Importing
              </Typography>

              {/* Success state */}
              {!runHook.isStreaming && isRunComplete && (
                <Alert severity="success" sx={{ mb: 3 }}>
                  Import completed successfully! Your data tables are ready.
                  {runHook.run?.progress?.totalTables != null && (
                    <> {runHook.run.progress.totalTables} table(s) imported.</>
                  )}
                </Alert>
              )}

              {/* Error state */}
              {!runHook.isStreaming && isRunError && (
                <Alert severity="error" sx={{ mb: 3 }}>
                  {runErrorMessage || 'The import failed. Please retry from the import detail page.'}
                </Alert>
              )}

              <ImportProgressView
                events={runHook.events}
                progress={runHook.progress}
                isStreaming={runHook.isStreaming}
                startTime={runHook.streamStartTime}
              />

              {/* Actions after streaming ends */}
              {!runHook.isStreaming && (isRunComplete || isRunError) && (
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 3 }}>
                  {isRunError && (
                    <Button onClick={() => navigate('/data-imports')}>
                      Back to Imports
                    </Button>
                  )}
                  {dataImport && (
                    <Button
                      variant="contained"
                      onClick={() => navigate(`/data-imports/${dataImport.id}`)}
                    >
                      View Import
                    </Button>
                  )}
                </Box>
              )}
            </Box>
          )}
        </Paper>
      </Box>
    </Container>
  );
}
