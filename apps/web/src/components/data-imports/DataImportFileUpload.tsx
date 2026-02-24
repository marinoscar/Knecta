import { useState, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Alert,
  LinearProgress,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  InsertDriveFile as FileIcon,
  TableChart as CsvIcon,
} from '@mui/icons-material';

const ACCEPTED_TYPES = [
  '.csv',
  '.xlsx',
  '.xls',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];

const MAX_FILE_SIZE_MB = 500;

interface DataImportFileUploadProps {
  onFileSelected: (file: File) => void;
  uploadProgress?: number | null;
  isUploading?: boolean;
  disabled?: boolean;
}

function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'csv') return <CsvIcon sx={{ fontSize: 48, color: 'text.secondary' }} />;
  return <FileIcon sx={{ fontSize: 48, color: 'text.secondary' }} />;
}

export function DataImportFileUpload({
  onFileSelected,
  uploadProgress,
  isUploading = false,
  disabled = false,
}: DataImportFileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((file: File): string | null => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    const isValidType = ACCEPTED_TYPES.includes(ext) || ACCEPTED_TYPES.includes(file.type);
    if (!isValidType) {
      return `Unsupported file type. Please upload a CSV or Excel file (.csv, .xlsx, .xls)`;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return `File exceeds the ${MAX_FILE_SIZE_MB}MB size limit`;
    }
    return null;
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
      setError(null);
      setSelectedFile(file);
      onFileSelected(file);
    },
    [validateFile, onFileSelected],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      if (disabled || isUploading) return;
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile, disabled, isUploading],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragActive(false);
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const isInteractive = !disabled && !isUploading;

  return (
    <Box>
      {error && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => isInteractive && inputRef.current?.click()}
        sx={{
          border: '2px dashed',
          borderColor: dragActive ? 'primary.main' : 'divider',
          borderRadius: 2,
          p: 4,
          textAlign: 'center',
          cursor: isInteractive ? 'pointer' : 'default',
          bgcolor: dragActive ? 'action.hover' : 'background.default',
          transition: 'all 0.2s',
          opacity: disabled ? 0.5 : 1,
          '&:hover': isInteractive
            ? { borderColor: 'primary.main', bgcolor: 'action.hover' }
            : {},
        }}
      >
        {selectedFile ? (
          getFileIcon(selectedFile.name)
        ) : (
          <UploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
        )}

        {selectedFile ? (
          <>
            <Typography variant="h6" gutterBottom>
              {selectedFile.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
            </Typography>
            {!isUploading && (
              <Typography variant="caption" color="text.secondary">
                Click or drag to replace
              </Typography>
            )}
          </>
        ) : (
          <>
            <Typography variant="h6" gutterBottom>
              Drag & drop a file here
            </Typography>
            <Typography variant="body2" color="text.secondary">
              or click to browse — CSV (.csv) or Excel (.xlsx, .xls)
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Max {MAX_FILE_SIZE_MB}MB
            </Typography>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          style={{ display: 'none' }}
          onChange={handleChange}
          disabled={!isInteractive}
        />
      </Box>

      {isUploading && (
        <Box sx={{ mt: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Uploading...
            </Typography>
            {uploadProgress != null && (
              <Typography variant="body2" color="text.secondary">
                {uploadProgress}%
              </Typography>
            )}
          </Box>
          <LinearProgress
            variant={uploadProgress != null ? 'determinate' : 'indeterminate'}
            value={uploadProgress ?? undefined}
            sx={{ height: 6, borderRadius: 3 }}
          />
        </Box>
      )}
    </Box>
  );
}
