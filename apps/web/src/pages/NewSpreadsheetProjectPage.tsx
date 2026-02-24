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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
} from '@mui/material';
import { FileUploadZone } from '../components/spreadsheet-agent/FileUploadZone';
import { AgentProgressView } from '../components/spreadsheet-agent/AgentProgressView';
import { useSpreadsheetProjects } from '../hooks/useSpreadsheetProjects';
import { useSpreadsheetUpload } from '../hooks/useSpreadsheetUpload';
import { useSpreadsheetRun } from '../hooks/useSpreadsheetRun';
import { createSpreadsheetRun } from '../services/api';
import type { SpreadsheetProject } from '../types';

const STEPS = ['Project Setup', 'Upload Files', 'Review & Start', 'Processing'];

export default function NewSpreadsheetProjectPage() {
  const navigate = useNavigate();
  const { createProject } = useSpreadsheetProjects();
  const upload = useSpreadsheetUpload();
  const runHook = useSpreadsheetRun();

  const [activeStep, setActiveStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Project setup
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [reviewMode, setReviewMode] = useState<'auto' | 'review'>('review');

  // Step 2: Files
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [project, setProject] = useState<SpreadsheetProject | null>(null);

  // Step 3/4: Run
  const [, setRunId] = useState<string | null>(null);

  const handleCreateProject = useCallback(async () => {
    setError(null);
    try {
      const proj = await createProject({ name, description: description || undefined, reviewMode });
      setProject(proj);
      setActiveStep(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    }
  }, [name, description, reviewMode, createProject]);

  const handleUploadFiles = useCallback(async () => {
    if (!project) return;
    setError(null);
    try {
      await upload.uploadFiles(project.id, selectedFiles);
      setActiveStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    }
  }, [project, selectedFiles, upload]);

  const handleStartRun = useCallback(async () => {
    if (!project) return;
    setError(null);
    try {
      const run = await createSpreadsheetRun({
        projectId: project.id,
        config: { reviewMode },
      });
      setRunId(run.id);
      setActiveStep(3);
      runHook.startStream(run.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start run');
    }
  }, [project, reviewMode, runHook]);

  const canProceedStep0 = name.trim().length > 0;
  const canProceedStep1 = selectedFiles.length > 0;

  return (
    <Container maxWidth="md">
      <Box sx={{ py: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          New Spreadsheet Project
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
          {/* Step 0: Project Setup */}
          {activeStep === 0 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Project Setup
              </Typography>
              <TextField
                label="Project Name"
                fullWidth
                value={name}
                onChange={(e) => setName(e.target.value)}
                sx={{ mb: 2 }}
                required
              />
              <TextField
                label="Description"
                fullWidth
                multiline
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                sx={{ mb: 2 }}
              />
              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel>Review Mode</InputLabel>
                <Select
                  value={reviewMode}
                  onChange={(e) => setReviewMode(e.target.value as 'auto' | 'review')}
                  label="Review Mode"
                >
                  <MenuItem value="review">Manual Review — pause for plan approval</MenuItem>
                  <MenuItem value="auto">Auto — process without stopping</MenuItem>
                </Select>
              </FormControl>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                <Button onClick={() => navigate('/spreadsheets')}>Cancel</Button>
                <Button
                  variant="contained"
                  onClick={handleCreateProject}
                  disabled={!canProceedStep0}
                >
                  Create & Continue
                </Button>
              </Box>
            </Box>
          )}

          {/* Step 1: Upload Files */}
          {activeStep === 1 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Upload Files
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Upload spreadsheet files to project "{project?.name}"
              </Typography>
              <FileUploadZone
                onFilesSelected={setSelectedFiles}
                disabled={upload.isUploading}
              />
              {upload.isUploading && (
                <Box sx={{ mt: 2 }}>
                  {upload.files.map((f) => (
                    <Typography key={f.fileName} variant="body2">
                      {f.fileName}: {f.status} {f.error && `- ${f.error}`}
                    </Typography>
                  ))}
                </Box>
              )}
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 3 }}>
                <Button onClick={() => setActiveStep(0)}>Back</Button>
                <Button
                  variant="contained"
                  onClick={handleUploadFiles}
                  disabled={!canProceedStep1 || upload.isUploading}
                >
                  {upload.isUploading ? 'Uploading...' : 'Upload & Continue'}
                </Button>
              </Box>
            </Box>
          )}

          {/* Step 2: Review & Start */}
          {activeStep === 2 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Review & Start
              </Typography>
              <Box sx={{ mb: 3 }}>
                <Typography variant="body2">
                  <strong>Project:</strong> {project?.name}
                </Typography>
                <Typography variant="body2">
                  <strong>Files:</strong> {selectedFiles.length} uploaded
                </Typography>
                <Typography variant="body2">
                  <strong>Review Mode:</strong>{' '}
                  {reviewMode === 'review' ? 'Manual Review' : 'Auto'}
                </Typography>
              </Box>
              <Alert severity="info" sx={{ mb: 3 }}>
                {reviewMode === 'review'
                  ? 'The agent will pause after schema design for your review before extracting data.'
                  : 'The agent will run all phases automatically without stopping.'}
              </Alert>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                <Button onClick={() => setActiveStep(1)}>Back</Button>
                <Button variant="contained" onClick={handleStartRun}>
                  Start Processing
                </Button>
              </Box>
            </Box>
          )}

          {/* Step 3: Processing */}
          {activeStep === 3 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Processing
              </Typography>

              {/* Top action area — shown when streaming has ended */}
              {!runHook.isStreaming && runHook.run && (
                <>
                  {runHook.events.some((e) => e.type === 'review_ready') && (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                      <strong>Action Required</strong> — The extraction plan is ready for your
                      review. View the project to approve it.
                    </Alert>
                  )}
                  {runHook.events.some((e) => e.type === 'run_error') && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                      {runHook.events.find((e) => e.type === 'run_error')?.error ||
                        runHook.events.find((e) => e.type === 'run_error')?.message ||
                        'The agent encountered an error during processing.'}
                    </Alert>
                  )}
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                    <Button
                      variant="contained"
                      onClick={() => navigate(`/spreadsheets/${project?.id}`)}
                    >
                      View Project
                    </Button>
                  </Box>
                </>
              )}

              <AgentProgressView
                events={runHook.events}
                progress={runHook.progress}
                isStreaming={runHook.isStreaming}
                tokensUsed={runHook.tokensUsed}
                startTime={runHook.streamStartTime}
              />
              {runHook.error && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {runHook.error}
                </Alert>
              )}
              {!runHook.isStreaming && runHook.run && (
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 3 }}>
                  <Button
                    variant="contained"
                    onClick={() => navigate(`/spreadsheets/${project?.id}`)}
                  >
                    View Project
                  </Button>
                </Box>
              )}
            </Box>
          )}
        </Paper>
      </Box>
    </Container>
  );
}
