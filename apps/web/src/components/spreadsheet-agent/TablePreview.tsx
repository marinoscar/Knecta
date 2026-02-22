import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  CircularProgress,
  Box,
  Paper,
} from '@mui/material';
import type { TablePreviewData } from '../../types';

interface TablePreviewProps {
  open: boolean;
  tableName: string;
  data: TablePreviewData | null;
  isLoading: boolean;
  onClose: () => void;
}

export function TablePreview({ open, tableName, data, isLoading, onClose }: TablePreviewProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>Preview: {tableName}</DialogTitle>
      <DialogContent>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : !data ? (
          <Typography color="text.secondary">No data available</Typography>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Showing {data.rows.length} of {data.totalRows.toLocaleString()} rows
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 500 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    {data.columns.map((col) => (
                      <TableCell key={col} sx={{ fontWeight: 'bold' }}>
                        {col}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.rows.map((row, rowIdx) => (
                    <TableRow key={rowIdx} hover>
                      {data.columns.map((col) => (
                        <TableCell key={col}>
                          {row[col] === null || row[col] === undefined ? (
                            <Typography variant="caption" color="text.disabled">
                              NULL
                            </Typography>
                          ) : (
                            String(row[col])
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
