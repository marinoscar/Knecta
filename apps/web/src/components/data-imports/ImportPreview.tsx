import {
  Box,
  Typography,
  Chip,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Paper,
  Divider,
} from '@mui/material';

interface TablePreviewEntry {
  tableName: string;
  columns: Array<{ name: string; type: string }>;
  sampleRows: unknown[][];
  estimatedRowCount?: number;
}

interface ImportPreviewProps {
  tables: TablePreviewEntry[];
}

function getTypeColor(type: string): 'default' | 'primary' | 'secondary' | 'info' | 'success' | 'warning' {
  const lower = type.toLowerCase();
  if (lower.includes('int') || lower.includes('float') || lower.includes('double') || lower.includes('decimal')) return 'primary';
  if (lower.includes('bool')) return 'warning';
  if (lower.includes('date') || lower.includes('time')) return 'info';
  if (lower.includes('varchar') || lower.includes('text') || lower.includes('string')) return 'default';
  return 'default';
}

export function ImportPreview({ tables }: ImportPreviewProps) {
  if (tables.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">No tables to preview</Typography>
      </Box>
    );
  }

  return (
    <Box>
      {tables.map((table, idx) => (
        <Box key={idx} sx={{ mb: idx < tables.length - 1 ? 4 : 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
            <Typography variant="h6">{table.tableName}</Typography>
            <Chip
              label={`${table.columns.length} columns`}
              size="small"
              variant="outlined"
            />
            {table.estimatedRowCount != null && (
              <Chip
                label={`~${table.estimatedRowCount.toLocaleString()} rows`}
                size="small"
                variant="outlined"
              />
            )}
          </Box>

          {/* Column chips */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
            {table.columns.map((col, colIdx) => (
              <Chip
                key={colIdx}
                label={`${col.name}: ${col.type}`}
                size="small"
                color={getTypeColor(col.type)}
                variant="outlined"
                sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}
              />
            ))}
          </Box>

          {/* Sample rows */}
          {table.sampleRows.length > 0 && (
            <>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                Sample data (first {table.sampleRows.length} rows)
              </Typography>
              <TableContainer
                component={Paper}
                variant="outlined"
                sx={{ maxHeight: 300, overflow: 'auto' }}
              >
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      {table.columns.map((col, colIdx) => (
                        <TableCell key={colIdx} sx={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                          {col.name}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {table.sampleRows.slice(0, 20).map((row, rowIdx) => (
                      <TableRow key={rowIdx} hover>
                        {(row as unknown[]).map((cell, cellIdx) => (
                          <TableCell
                            key={cellIdx}
                            sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          >
                            {String(cell ?? '')}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}

          {idx < tables.length - 1 && <Divider sx={{ mt: 3 }} />}
        </Box>
      ))}
    </Box>
  );
}
