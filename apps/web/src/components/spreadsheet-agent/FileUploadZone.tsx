import { useState, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Alert,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  InsertDriveFile as FileIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';

const ACCEPTED_TYPES = [
  '.xlsx', '.xls', '.csv', '.tsv', '.json', '.jsonl',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'text/tab-separated-values',
  'application/json',
];

const MAX_FILE_SIZE_MB = 500;

interface FileUploadZoneProps {
  onFilesSelected: (files: File[]) => void;
  maxFiles?: number;
  disabled?: boolean;
}

export function FileUploadZone({ onFilesSelected, maxFiles = 50, disabled = false }: FileUploadZoneProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFiles = useCallback(
    (files: File[]): { valid: File[]; errors: string[] } => {
      const valid: File[] = [];
      const errors: string[] = [];
      const remaining = maxFiles - selectedFiles.length;

      for (const file of files) {
        if (valid.length >= remaining) {
          errors.push(`Maximum ${maxFiles} files allowed`);
          break;
        }
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        const isValidType = ACCEPTED_TYPES.includes(ext) || ACCEPTED_TYPES.includes(file.type);
        if (!isValidType) {
          errors.push(`${file.name}: unsupported file type`);
          continue;
        }
        if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
          errors.push(`${file.name}: exceeds ${MAX_FILE_SIZE_MB}MB limit`);
          continue;
        }
        // Check for duplicates
        if (selectedFiles.some((f) => f.name === file.name && f.size === file.size)) {
          errors.push(`${file.name}: already added`);
          continue;
        }
        valid.push(file);
      }
      return { valid, errors };
    },
    [selectedFiles, maxFiles],
  );

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const { valid, errors } = validateFiles(fileArray);
      if (errors.length > 0) {
        setError(errors.join('; '));
      } else {
        setError(null);
      }
      if (valid.length > 0) {
        const updated = [...selectedFiles, ...valid];
        setSelectedFiles(updated);
        onFilesSelected(updated);
      }
    },
    [validateFiles, selectedFiles, onFilesSelected],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      if (disabled) return;
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles, disabled],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragActive(false);
  }, []);

  const handleRemoveFile = useCallback(
    (index: number) => {
      const updated = selectedFiles.filter((_, i) => i !== index);
      setSelectedFiles(updated);
      onFilesSelected(updated);
      setError(null);
    },
    [selectedFiles, onFilesSelected],
  );

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

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
        onClick={() => !disabled && inputRef.current?.click()}
        sx={{
          border: '2px dashed',
          borderColor: dragActive ? 'primary.main' : 'divider',
          borderRadius: 2,
          p: 4,
          textAlign: 'center',
          cursor: disabled ? 'default' : 'pointer',
          bgcolor: dragActive ? 'action.hover' : 'background.default',
          transition: 'all 0.2s',
          opacity: disabled ? 0.5 : 1,
          '&:hover': disabled
            ? {}
            : { borderColor: 'primary.main', bgcolor: 'action.hover' },
        }}
      >
        <UploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
        <Typography variant="h6" gutterBottom>
          Drag & drop files here
        </Typography>
        <Typography variant="body2" color="text.secondary">
          or click to browse — Excel (.xlsx, .xls), CSV, TSV, JSON
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Max {MAX_FILE_SIZE_MB}MB per file, up to {maxFiles} files
        </Typography>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_TYPES.join(',')}
          style={{ display: 'none' }}
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
          disabled={disabled}
        />
      </Box>

      {selectedFiles.length > 0 && (
        <List dense sx={{ mt: 2 }}>
          {selectedFiles.map((file, index) => (
            <ListItem key={`${file.name}-${file.size}`}>
              <ListItemIcon>
                <FileIcon />
              </ListItemIcon>
              <ListItemText
                primary={file.name}
                secondary={formatFileSize(file.size)}
              />
              <ListItemSecondaryAction>
                <IconButton
                  size="small"
                  onClick={() => handleRemoveFile(index)}
                  disabled={disabled}
                >
                  <DeleteIcon />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  );
}
