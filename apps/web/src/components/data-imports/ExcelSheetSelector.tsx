import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Checkbox,
  FormControlLabel,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  TextField,
  Grid,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Paper,
  CircularProgress,
  Alert,
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import type { ExcelParseResult, ExcelSheetInfo, SheetPreviewResult, SheetConfig } from '../../types';
import { getExcelSheetPreview } from '../../services/api';
import { colToLetter, letterToCol, isValidColLetter } from '../../utils/excelColumns';

interface ExcelSheetSelectorProps {
  importId: string;
  parseResult: ExcelParseResult;
  sheetConfigs: SheetConfig[];
  onSheetConfigsChange: (configs: SheetConfig[]) => void;
}

interface SheetPreviewState {
  data: SheetPreviewResult | null;
  isLoading: boolean;
  error: string | null;
}

export function ExcelSheetSelector({
  importId,
  parseResult,
  sheetConfigs,
  onSheetConfigsChange,
}: ExcelSheetSelectorProps) {
  const [previews, setPreviews] = useState<Record<string, SheetPreviewState>>({});
  // Track debounce timers per sheet
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const isSheetSelected = (sheetName: string): boolean => {
    return sheetConfigs.some((c) => c.sheetName === sheetName);
  };

  const getSheetConfig = (sheetName: string): SheetConfig => {
    return (
      sheetConfigs.find((c) => c.sheetName === sheetName) ?? {
        sheetName,
        hasHeader: true,
      }
    );
  };

  const toggleSheet = (sheet: ExcelSheetInfo) => {
    if (isSheetSelected(sheet.name)) {
      onSheetConfigsChange(sheetConfigs.filter((c) => c.sheetName !== sheet.name));
    } else {
      onSheetConfigsChange([
        ...sheetConfigs,
        { sheetName: sheet.name, hasHeader: true },
      ]);
    }
  };

  const updateSheetConfig = (sheetName: string, updates: Partial<SheetConfig>) => {
    onSheetConfigsChange(
      sheetConfigs.map((c) =>
        c.sheetName === sheetName ? { ...c, ...updates } : c,
      ),
    );
  };

  const loadPreview = useCallback(
    async (sheetName: string, config: SheetConfig) => {
      setPreviews((prev) => ({
        ...prev,
        [sheetName]: { data: null, isLoading: true, error: null },
      }));
      try {
        const apiRange = config.range ? {
          startRow: config.range.startRow - 1,
          endRow: config.range.endRow != null ? config.range.endRow - 1 : undefined,
          startCol: config.range.startCol - 1,
          endCol: config.range.endCol != null ? config.range.endCol - 1 : undefined,
        } : undefined;
        const result = await getExcelSheetPreview(importId, {
          sheetName,
          range: apiRange,
          hasHeader: config.hasHeader ?? true,
          limit: 20,
        });
        setPreviews((prev) => ({
          ...prev,
          [sheetName]: { data: result, isLoading: false, error: null },
        }));
      } catch (err) {
        setPreviews((prev) => ({
          ...prev,
          [sheetName]: {
            data: null,
            isLoading: false,
            error: err instanceof Error ? err.message : 'Preview failed',
          },
        }));
      }
    },
    [importId],
  );

  const debouncedLoadPreview = useCallback(
    (sheetName: string, config: SheetConfig) => {
      if (debounceTimers.current[sheetName]) {
        clearTimeout(debounceTimers.current[sheetName]);
      }
      debounceTimers.current[sheetName] = setTimeout(() => {
        loadPreview(sheetName, config);
      }, 500);
    },
    [loadPreview],
  );

  // Auto-load preview when a sheet is selected
  useEffect(() => {
    for (const config of sheetConfigs) {
      if (!previews[config.sheetName]) {
        loadPreview(config.sheetName, config);
      }
    }
  }, [sheetConfigs, previews, loadPreview]);

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Select Sheets to Import
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Select one or more sheets. Configure the range and header settings for each sheet.
      </Typography>

      {parseResult.sheets.map((sheet) => {
        const selected = isSheetSelected(sheet.name);
        const config = getSheetConfig(sheet.name);
        const preview = previews[sheet.name];

        // Offsets for display purposes (1-based in state, so subtract 1 for 0-based index math)
        const colOffset = (config.range?.startCol ?? 1) - 1;
        const baseRow =
          (config.range?.startRow ?? 1) - 1 + (config.hasHeader !== false ? 1 : 0);

        return (
          <Accordion
            key={sheet.name}
            expanded={selected}
            onChange={() => toggleSheet(sheet)}
            sx={{ mb: 1 }}
          >
            <AccordionSummary expandIcon={selected ? <ExpandMoreIcon /> : null}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                <Checkbox
                  checked={selected}
                  onChange={(e) => {
                    e.stopPropagation();
                    toggleSheet(sheet);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  size="small"
                />
                <Box sx={{ flexGrow: 1 }}>
                  <Typography variant="body1" fontWeight="medium">
                    {sheet.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {sheet.rowCount.toLocaleString()} rows &times; {sheet.colCount} columns
                    {sheet.hasMergedCells ? ' (has merged cells)' : ''}
                  </Typography>
                </Box>
              </Box>
            </AccordionSummary>

            {selected && (
              <AccordionDetails>
                <Box sx={{ mb: 2 }}>
                  <TextField
                    label="Table Name"
                    type="text"
                    size="small"
                    fullWidth
                    value={config.tableName ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
                      updateSheetConfig(sheet.name, { tableName: raw || undefined });
                    }}
                    placeholder={sheet.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/^_+|_+$/g, '').slice(0, 63)}
                    helperText="Override the output table name (lowercase, letters/numbers/underscores). Leave blank to auto-derive from sheet name."
                    inputProps={{ maxLength: 63 }}
                    sx={{ mb: 2 }}
                  />
                  <Typography variant="subtitle2" gutterBottom>
                    Range (optional — leave blank to use entire sheet)
                  </Typography>
                  <Grid container spacing={2} sx={{ mb: 2 }}>
                    <Grid item xs={6} sm={3}>
                      <TextField
                        label="Start Row"
                        type="number"
                        size="small"
                        fullWidth
                        value={config.range?.startRow ?? ''}
                        onChange={(e) => {
                          const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                          const newConfig = {
                            ...config,
                            range: val != null
                              ? {
                                  startRow: val,
                                  endRow: config.range?.endRow,
                                  startCol: config.range?.startCol ?? 1,
                                  endCol: config.range?.endCol,
                                }
                              : undefined,
                          };
                          updateSheetConfig(sheet.name, newConfig);
                          debouncedLoadPreview(sheet.name, newConfig);
                        }}
                        inputProps={{ min: 1 }}
                      />
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <TextField
                        label="End Row"
                        type="number"
                        size="small"
                        fullWidth
                        value={config.range?.endRow ?? ''}
                        onChange={(e) => {
                          const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                          const newConfig = {
                            ...config,
                            range: config.range
                              ? { ...config.range, endRow: val }
                              : undefined,
                          };
                          updateSheetConfig(sheet.name, newConfig);
                          debouncedLoadPreview(sheet.name, newConfig);
                        }}
                        inputProps={{ min: 1 }}
                        placeholder="(to end)"
                      />
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <TextField
                        label="Start Col (e.g. A)"
                        type="text"
                        size="small"
                        fullWidth
                        value={config.range?.startCol ? colToLetter(config.range.startCol) : ''}
                        onChange={(e) => {
                          const raw = e.target.value.toUpperCase();
                          const val = raw && isValidColLetter(raw) ? letterToCol(raw) : undefined;
                          const newConfig = {
                            ...config,
                            range: val != null
                              ? {
                                  startRow: config.range?.startRow ?? 1,
                                  endRow: config.range?.endRow,
                                  startCol: val,
                                  endCol: config.range?.endCol,
                                }
                              : undefined,
                          };
                          updateSheetConfig(sheet.name, newConfig);
                          debouncedLoadPreview(sheet.name, newConfig);
                        }}
                        inputProps={{ style: { textTransform: 'uppercase' }, maxLength: 3 }}
                      />
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <TextField
                        label="End Col (e.g. Z)"
                        type="text"
                        size="small"
                        fullWidth
                        value={config.range?.endCol ? colToLetter(config.range.endCol) : ''}
                        onChange={(e) => {
                          const raw = e.target.value.toUpperCase();
                          const val = raw && isValidColLetter(raw) ? letterToCol(raw) : undefined;
                          const newConfig = {
                            ...config,
                            range: config.range
                              ? { ...config.range, endCol: val }
                              : undefined,
                          };
                          updateSheetConfig(sheet.name, newConfig);
                          debouncedLoadPreview(sheet.name, newConfig);
                        }}
                        inputProps={{ style: { textTransform: 'uppercase' }, maxLength: 3 }}
                        placeholder="(to end)"
                      />
                    </Grid>
                  </Grid>

                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={config.hasHeader ?? true}
                        onChange={(e) => {
                          const newConfig = { ...config, hasHeader: e.target.checked };
                          updateSheetConfig(sheet.name, newConfig);
                          debouncedLoadPreview(sheet.name, newConfig);
                        }}
                        size="small"
                      />
                    }
                    label="First row is header"
                  />
                </Box>

                {/* Preview */}
                {preview?.isLoading && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
                    <CircularProgress size={20} />
                    <Typography variant="body2" color="text.secondary">
                      Loading preview...
                    </Typography>
                  </Box>
                )}
                {preview?.error && (
                  <Alert severity="warning" sx={{ mb: 1 }}>
                    Preview failed: {preview.error}
                  </Alert>
                )}
                {preview?.data && !preview.isLoading && (
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                      Preview ({preview.data.rows.length} of {preview.data.totalRows.toLocaleString()} rows)
                    </Typography>
                    <TableContainer
                      component={Paper}
                      variant="outlined"
                      sx={{ maxHeight: 300, overflow: 'auto' }}
                    >
                      <Table size="small" stickyHeader>
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 'bold', whiteSpace: 'nowrap', width: 50 }}>#</TableCell>
                            {preview.data.columns.map((col, i) => (
                              <TableCell key={i} sx={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                {typeof col === 'string' ? col : col.name}
                                <Typography variant="caption" display="block" sx={{ color: 'text.secondary', fontWeight: 'normal' }}>
                                  {colToLetter(colOffset + i + 1)}
                                </Typography>
                              </TableCell>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {preview.data.rows.map((row, rowIdx) => (
                            <TableRow key={rowIdx} hover>
                              <TableCell sx={{ color: 'text.secondary', width: 50 }}>{baseRow + rowIdx + 1}</TableCell>
                              {(row as unknown[]).map((cell, cellIdx) => (
                                <TableCell
                                  key={cellIdx}
                                  sx={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                >
                                  {String(cell ?? '')}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Box>
                )}
              </AccordionDetails>
            )}
          </Accordion>
        );
      })}

      {sheetConfigs.length === 0 && (
        <Alert severity="info" sx={{ mt: 1 }}>
          Select at least one sheet to continue.
        </Alert>
      )}
    </Box>
  );
}
