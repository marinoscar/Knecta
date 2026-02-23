import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  IconButton,
  Chip,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  InsertDriveFile as FileIcon,
} from '@mui/icons-material';
import type { SpreadsheetFile, SpreadsheetFileStatus } from '../../types';

interface FileListProps {
  files: SpreadsheetFile[];
  isLoading?: boolean;
  canDelete?: boolean;
  onDelete?: (fileId: string) => void;
}

const FILE_STATUS_CONFIG: Record<
  SpreadsheetFileStatus,
  { label: string; color: 'default' | 'info' | 'success' | 'error' | 'warning' }
> = {
  pending: { label: 'Pending', color: 'default' },
  uploading: { label: 'Uploading', color: 'info' },
  uploaded: { label: 'Uploaded', color: 'success' },
  ingested: { label: 'Ingested', color: 'success' },
  failed: { label: 'Failed', color: 'error' },
  deleted: { label: 'Deleted', color: 'warning' },
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function FileList({ files, isLoading, canDelete, onDelete }: FileListProps) {
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (files.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">No files uploaded yet</Typography>
      </Box>
    );
  }

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>File Name</TableCell>
            <TableCell>Type</TableCell>
            <TableCell align="right">Size</TableCell>
            <TableCell align="right">Sheets</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Uploaded</TableCell>
            {canDelete && <TableCell align="right">Actions</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {files.map((file) => (
            <TableRow key={file.id} hover>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <FileIcon fontSize="small" color="action" />
                  <Typography variant="body2">{file.originalName}</Typography>
                </Box>
              </TableCell>
              <TableCell>{file.fileType}</TableCell>
              <TableCell align="right">{formatFileSize(file.fileSizeBytes)}</TableCell>
              <TableCell align="right">{file.sheetCount}</TableCell>
              <TableCell>
                <Chip
                  label={FILE_STATUS_CONFIG[file.status]?.label || file.status}
                  color={FILE_STATUS_CONFIG[file.status]?.color || 'default'}
                  size="small"
                />
              </TableCell>
              <TableCell>{new Date(file.createdAt).toLocaleString()}</TableCell>
              {canDelete && (
                <TableCell align="right">
                  <Tooltip title="Delete file">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => onDelete?.(file.id)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
