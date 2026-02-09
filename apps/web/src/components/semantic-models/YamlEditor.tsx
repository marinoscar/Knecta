import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Paper,
  Chip,
  Alert,
  Snackbar,
  CircularProgress,
  useTheme,
  Typography,
  List,
  ListItem,
  AlertTitle,
} from '@mui/material';
import {
  Save as SaveIcon,
  Check as CheckIcon,
  Undo as UndoIcon,
  ContentCopy as ContentCopyIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import CodeMirror from '@uiw/react-codemirror';
import { yaml } from '@codemirror/lang-yaml';
import * as yamlParser from 'js-yaml';
import { updateSemanticModel, validateSemanticModel } from '../../services/api';

interface YamlEditorProps {
  initialYaml: string;
  fileName: string;
  modelId: string;
  onSaveSuccess: (updatedModel: any, validation?: { fixedIssues: string[]; warnings: string[] }) => void;
  readOnly?: boolean;
}

interface ValidationResults {
  isValid: boolean;
  fatalIssues: string[];
  fixedIssues: string[];
  warnings: string[];
}

interface SnackbarState {
  open: boolean;
  message: string;
  severity: 'success' | 'error' | 'info' | 'warning';
}

export function YamlEditor({
  initialYaml,
  fileName,
  modelId,
  onSaveSuccess,
  readOnly = false,
}: YamlEditorProps) {
  const theme = useTheme();

  const [yamlContent, setYamlContent] = useState(initialYaml);
  const [savedYaml, setSavedYaml] = useState(initialYaml);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResults, setValidationResults] = useState<ValidationResults | null>(null);
  const [snackbar, setSnackbar] = useState<SnackbarState>({
    open: false,
    message: '',
    severity: 'success',
  });

  const isDirty = yamlContent !== savedYaml;

  // Update when initialYaml prop changes (e.g., after parent refreshes)
  useEffect(() => {
    setYamlContent(initialYaml);
    setSavedYaml(initialYaml);
  }, [initialYaml]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(yamlContent);
      setSnackbar({ open: true, message: 'Copied to clipboard!', severity: 'success' });
    } catch (err) {
      console.error('Failed to copy:', err);
      setSnackbar({ open: true, message: 'Failed to copy to clipboard', severity: 'error' });
    }
  };

  const handleDownload = () => {
    const blob = new Blob([yamlContent], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCancel = () => {
    setYamlContent(savedYaml);
    setValidationResults(null);
  };

  const handleValidate = async () => {
    setValidating(true);
    setValidationResults(null);

    // Client-side YAML parse check first
    let parsed;
    try {
      parsed = yamlParser.load(yamlContent);
    } catch (err: any) {
      setValidationResults({
        isValid: false,
        fatalIssues: [`YAML syntax error: ${err.message}`],
        fixedIssues: [],
        warnings: [],
      });
      setValidating(false);
      return;
    }

    if (!parsed || typeof parsed !== 'object') {
      setValidationResults({
        isValid: false,
        fatalIssues: ['YAML must parse to a valid object'],
        fixedIssues: [],
        warnings: [],
      });
      setValidating(false);
      return;
    }

    try {
      const result = await validateSemanticModel(parsed as Record<string, unknown>);
      setValidationResults(result);
      if (result.isValid) {
        setSnackbar({ open: true, message: 'Validation passed', severity: 'success' });
      }
    } catch (err: any) {
      setSnackbar({ open: true, message: err.message || 'Validation request failed', severity: 'error' });
    } finally {
      setValidating(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setValidationResults(null);

    // 1. Client-side YAML parse check
    let parsed;
    try {
      parsed = yamlParser.load(yamlContent);
    } catch (err: any) {
      setValidationResults({
        isValid: false,
        fatalIssues: [`YAML syntax error: ${err.message}`],
        fixedIssues: [],
        warnings: [],
      });
      setSaving(false);
      return;
    }

    if (!parsed || typeof parsed !== 'object') {
      setValidationResults({
        isValid: false,
        fatalIssues: ['YAML must parse to a valid object'],
        fixedIssues: [],
        warnings: [],
      });
      setSaving(false);
      return;
    }

    // 2. Call PATCH endpoint
    try {
      const result = await updateSemanticModel(modelId, { model: parsed as Record<string, unknown> });

      // 3. Handle validation feedback from response
      if (result.validation) {
        setValidationResults({
          isValid: true,
          fatalIssues: [],
          fixedIssues: result.validation.fixedIssues || [],
          warnings: result.validation.warnings || [],
        });
      }

      // 4. Update saved state
      onSaveSuccess(result, result.validation);
      setSavedYaml(yamlContent); // Reset dirty tracking
      setSnackbar({ open: true, message: 'Model saved successfully', severity: 'success' });
    } catch (err: any) {
      // 5. Handle 422 validation errors
      if (err.status === 422 || err.response?.status === 422) {
        const errorData = err.response?.data || err.data || err;
        setValidationResults({
          isValid: false,
          fatalIssues: errorData.fatalIssues || ['Validation failed'],
          fixedIssues: [],
          warnings: errorData.warnings || [],
        });
      } else {
        setSnackbar({ open: true, message: err.message || 'Failed to save', severity: 'error' });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      {/* Toolbar */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button
          startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
          variant="contained"
          onClick={handleSave}
          disabled={!isDirty || saving || readOnly}
        >
          Save
        </Button>
        <Button
          startIcon={validating ? <CircularProgress size={16} /> : <CheckIcon />}
          variant="outlined"
          onClick={handleValidate}
          disabled={saving || validating || readOnly}
        >
          Validate
        </Button>
        <Button
          startIcon={<UndoIcon />}
          variant="text"
          onClick={handleCancel}
          disabled={!isDirty || saving}
        >
          Cancel
        </Button>
        <Box sx={{ flex: 1 }} />
        {isDirty && <Chip label="Unsaved changes" color="warning" size="small" />}
        <Button startIcon={<ContentCopyIcon />} variant="outlined" onClick={handleCopy}>
          Copy
        </Button>
        <Button startIcon={<DownloadIcon />} variant="outlined" onClick={handleDownload}>
          Download
        </Button>
      </Box>

      {/* CodeMirror Editor */}
      <Paper
        sx={{
          bgcolor: theme.palette.mode === 'dark' ? theme.palette.grey[900] : theme.palette.grey[100],
          overflow: 'hidden',
        }}
      >
        <CodeMirror
          value={yamlContent}
          height="600px"
          extensions={[yaml()]}
          theme={theme.palette.mode === 'dark' ? 'dark' : 'light'}
          readOnly={readOnly}
          onChange={(value) => setYamlContent(value)}
        />
      </Paper>

      {/* Validation Panel */}
      {validationResults && (
        <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {/* Fatal errors */}
          {validationResults.fatalIssues.length > 0 && (
            <Alert severity="error" onClose={() => setValidationResults(null)}>
              <AlertTitle>Validation Errors</AlertTitle>
              <List dense sx={{ m: 0, p: 0 }}>
                {validationResults.fatalIssues.map((issue, idx) => (
                  <ListItem key={idx} sx={{ py: 0.5, px: 0, display: 'list-item', ml: 2 }}>
                    <Typography variant="body2">{issue}</Typography>
                  </ListItem>
                ))}
              </List>
            </Alert>
          )}

          {/* Auto-fixed issues */}
          {validationResults.fixedIssues.length > 0 && (
            <Alert severity="info" onClose={() => setValidationResults(null)}>
              <AlertTitle>Auto-fixed Issues</AlertTitle>
              <List dense sx={{ m: 0, p: 0 }}>
                {validationResults.fixedIssues.map((issue, idx) => (
                  <ListItem key={idx} sx={{ py: 0.5, px: 0, display: 'list-item', ml: 2 }}>
                    <Typography variant="body2">{issue}</Typography>
                  </ListItem>
                ))}
              </List>
            </Alert>
          )}

          {/* Warnings */}
          {validationResults.warnings.length > 0 && (
            <Alert severity="warning" onClose={() => setValidationResults(null)}>
              <AlertTitle>Warnings</AlertTitle>
              <List dense sx={{ m: 0, p: 0 }}>
                {validationResults.warnings.map((warning, idx) => (
                  <ListItem key={idx} sx={{ py: 0.5, px: 0, display: 'list-item', ml: 2 }}>
                    <Typography variant="body2">{warning}</Typography>
                  </ListItem>
                ))}
              </List>
            </Alert>
          )}

          {/* Success message when valid and no issues */}
          {validationResults.isValid &&
            validationResults.fatalIssues.length === 0 &&
            validationResults.fixedIssues.length === 0 &&
            validationResults.warnings.length === 0 && (
              <Alert severity="success" onClose={() => setValidationResults(null)}>
                Validation passed successfully
              </Alert>
            )}
        </Box>
      )}

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
