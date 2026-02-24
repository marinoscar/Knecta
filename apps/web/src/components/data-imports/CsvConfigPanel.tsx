import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Paper,
  Divider,
} from '@mui/material';
import type { CsvParseResult } from '../../types';

const DELIMITER_OPTIONS = [
  { value: ',', label: 'Comma (,)' },
  { value: ';', label: 'Semicolon (;)' },
  { value: '\t', label: 'Tab (\\t)' },
  { value: '|', label: 'Pipe (|)' },
];

const ENCODING_OPTIONS = ['UTF-8', 'Latin-1', 'Windows-1252'];

interface CsvConfigPanelProps {
  parseResult: CsvParseResult;
  delimiter: string;
  hasHeader: boolean;
  encoding: string;
  onDelimiterChange: (value: string) => void;
  onHasHeaderChange: (value: boolean) => void;
  onEncodingChange: (value: string) => void;
}

export function CsvConfigPanel({
  parseResult,
  delimiter,
  hasHeader,
  encoding,
  onDelimiterChange,
  onHasHeaderChange,
  onEncodingChange,
}: CsvConfigPanelProps) {
  const displayColumns = hasHeader
    ? parseResult.columns.map((c) => (typeof c === 'string' ? c : c.name))
    : parseResult.columns.map((_, i) => `Column ${i + 1}`);
  const displayRows = parseResult.sampleRows.slice(0, 50);

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        CSV Configuration
      </Typography>

      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Delimiter</InputLabel>
          <Select
            value={delimiter}
            onChange={(e) => onDelimiterChange(e.target.value)}
            label="Delimiter"
          >
            {DELIMITER_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Encoding</InputLabel>
          <Select
            value={encoding}
            onChange={(e) => onEncodingChange(e.target.value)}
            label="Encoding"
          >
            {ENCODING_OPTIONS.map((enc) => (
              <MenuItem key={enc} value={enc}>
                {enc}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControlLabel
          control={
            <Checkbox
              checked={hasHeader}
              onChange={(e) => onHasHeaderChange(e.target.checked)}
            />
          }
          label="First row is header"
          sx={{ alignSelf: 'center' }}
        />
      </Box>

      <Box sx={{ mb: 1, display: 'flex', gap: 2 }}>
        <Typography variant="body2" color="text.secondary">
          <strong>Detected delimiter:</strong>{' '}
          {DELIMITER_OPTIONS.find((o) => o.value === parseResult.detectedDelimiter)?.label ||
            parseResult.detectedDelimiter}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          <strong>Detected encoding:</strong> {parseResult.detectedEncoding}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          <strong>Estimated rows:</strong> {parseResult.rowCountEstimate.toLocaleString()}
        </Typography>
      </Box>

      <Divider sx={{ mb: 2 }} />

      <Typography variant="subtitle2" gutterBottom>
        Data Preview ({displayRows.length} rows)
      </Typography>

      <TableContainer
        component={Paper}
        variant="outlined"
        sx={{ maxHeight: 400, overflow: 'auto' }}
      >
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              {displayColumns.map((col, i) => (
                <TableCell key={i} sx={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                  {col}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {displayRows.map((row, rowIdx) => (
              <TableRow key={rowIdx} hover>
                {(row as unknown[]).map((cell, cellIdx) => (
                  <TableCell key={cellIdx} sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {String(cell ?? '')}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
