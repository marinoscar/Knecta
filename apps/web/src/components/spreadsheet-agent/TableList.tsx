import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Typography,
  IconButton,
  Chip,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import {
  Visibility as PreviewIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import type { SpreadsheetTable, SpreadsheetTableStatus } from '../../types';

interface TableListProps {
  tables: SpreadsheetTable[];
  total: number;
  page: number;
  pageSize: number;
  isLoading?: boolean;
  canDelete?: boolean;
  onPageChange: (page: number) => void;
  onRowsPerPageChange: (pageSize: number) => void;
  onPreview?: (tableId: string) => void;
  onDownload?: (tableId: string) => void;
  onDelete?: (tableId: string) => void;
}

const TABLE_STATUS_CONFIG: Record<
  SpreadsheetTableStatus,
  { label: string; color: 'default' | 'info' | 'success' | 'error' }
> = {
  pending: { label: 'Pending', color: 'default' },
  extracting: { label: 'Extracting', color: 'info' },
  ready: { label: 'Ready', color: 'success' },
  failed: { label: 'Failed', color: 'error' },
};

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function TableList({
  tables,
  total,
  page,
  pageSize,
  isLoading,
  canDelete,
  onPageChange,
  onRowsPerPageChange,
  onPreview,
  onDownload,
  onDelete,
}: TableListProps) {
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (tables.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">No tables extracted yet</Typography>
      </Box>
    );
  }

  return (
    <>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Table Name</TableCell>
              <TableCell>Source Sheet</TableCell>
              <TableCell align="right">Rows</TableCell>
              <TableCell align="right">Columns</TableCell>
              <TableCell align="right">Size</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tables.map((table) => (
              <TableRow key={table.id} hover>
                <TableCell>
                  <Box>
                    <Typography variant="body2">{table.tableName}</Typography>
                    {table.description && (
                      <Typography variant="caption" color="text.secondary">
                        {table.description}
                      </Typography>
                    )}
                  </Box>
                </TableCell>
                <TableCell>{table.sourceSheetName}</TableCell>
                <TableCell align="right">{table.rowCount.toLocaleString()}</TableCell>
                <TableCell align="right">{table.columnCount}</TableCell>
                <TableCell align="right">{formatBytes(table.outputSizeBytes)}</TableCell>
                <TableCell>
                  <Chip
                    label={TABLE_STATUS_CONFIG[table.status]?.label || table.status}
                    color={TABLE_STATUS_CONFIG[table.status]?.color || 'default'}
                    size="small"
                  />
                </TableCell>
                <TableCell align="right">
                  <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                    {table.status === 'ready' && (
                      <>
                        <Tooltip title="Preview data">
                          <IconButton size="small" onClick={() => onPreview?.(table.id)}>
                            <PreviewIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Download Parquet">
                          <IconButton size="small" onClick={() => onDownload?.(table.id)}>
                            <DownloadIcon />
                          </IconButton>
                        </Tooltip>
                      </>
                    )}
                    {canDelete && (
                      <Tooltip title="Delete table">
                        <IconButton size="small" color="error" onClick={() => onDelete?.(table.id)}>
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={total}
        page={page - 1}
        onPageChange={(_, newPage) => onPageChange(newPage + 1)}
        rowsPerPage={pageSize}
        onRowsPerPageChange={(e) => onRowsPerPageChange(parseInt(e.target.value, 10))}
        rowsPerPageOptions={[10, 20, 50]}
      />
    </>
  );
}
