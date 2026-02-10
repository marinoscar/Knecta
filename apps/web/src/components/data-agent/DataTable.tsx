import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  useTheme,
} from '@mui/material';

interface TableComponentProps {
  children?: React.ReactNode;
}

function DataTable({ children }: TableComponentProps) {
  const tableRef = useRef<HTMLDivElement>(null);
  const [rowCount, setRowCount] = useState(0);

  useEffect(() => {
    if (tableRef.current) {
      const rows = tableRef.current.querySelectorAll('tbody tr');
      setRowCount(rows.length);
    }
  }, [children]);

  return (
    <Box
      sx={{
        my: 2,
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        overflow: 'hidden',
      }}
    >
      <TableContainer
        ref={tableRef}
        sx={{
          maxHeight: 400,
          overflowX: 'auto',
          overflowY: 'auto',
        }}
      >
        <Table stickyHeader size="small">
          {children}
        </Table>
      </TableContainer>
      {rowCount > 0 && (
        <Box
          sx={{
            px: 1.5,
            py: 0.5,
            fontFamily: '"Roboto Mono", "Consolas", "Courier New", monospace',
            fontSize: '0.7rem',
            color: 'text.secondary',
            bgcolor: (theme) =>
              theme.palette.mode === 'light'
                ? 'grey.50'
                : 'grey.900',
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          {rowCount === 1 ? '1 row' : `${rowCount} rows`}
        </Box>
      )}
    </Box>
  );
}

function DataTableHead({ children }: TableComponentProps) {
  return <TableHead>{children}</TableHead>;
}

function DataTableBody({ children }: TableComponentProps) {
  return (
    <TableBody
      sx={{
        '& tr:nth-of-type(odd)': {
          bgcolor: 'action.hover',
        },
      }}
    >
      {children}
    </TableBody>
  );
}

function DataTableRow({ children }: TableComponentProps) {
  return <TableRow hover>{children}</TableRow>;
}

function DataTableHeaderCell({ children }: TableComponentProps) {
  const theme = useTheme();

  return (
    <TableCell
      sx={{
        fontWeight: 'bold',
        fontSize: '0.75rem',
        fontFamily: '"Roboto Mono", "Consolas", "Courier New", monospace',
        whiteSpace: 'nowrap',
        bgcolor: theme.palette.mode === 'light' ? 'grey.100' : 'grey.900',
        borderBottom: 2,
        borderColor: 'divider',
        py: 0.75,
        px: 1,
      }}
    >
      {children}
    </TableCell>
  );
}

function DataTableCell({ children }: TableComponentProps) {
  return (
    <TableCell
      sx={{
        fontFamily: '"Roboto Mono", "Consolas", "Courier New", monospace',
        fontSize: '0.75rem',
        py: 0.5,
        px: 1,
        whiteSpace: 'nowrap',
        maxWidth: 300,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {children}
    </TableCell>
  );
}

export function getDataTableComponents() {
  return {
    table: DataTable,
    thead: DataTableHead,
    tbody: DataTableBody,
    tr: DataTableRow,
    th: DataTableHeaderCell,
    td: DataTableCell,
  };
}
