import { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Switch,
  FormControlLabel,
  TextField,
  Alert,
  Divider,
} from '@mui/material';
import type { SpreadsheetExtractionPlan, SpreadsheetPlanModification } from '../../types';

/** Remove implementation-specific terms from user-facing descriptions. */
function cleanDescription(text: string): string {
  return text
    .replace(/\bfor\s+DuckDB\b/gi, '')
    .replace(/\bDuckDB\b/gi, '')
    .replace(/\bParquet\b/gi, '')
    .replace(/\binto\s+analytics-ready\s+Parquet\s+tables\b/gi, 'into clean tables')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

interface ExtractionPlanReviewProps {
  plan: SpreadsheetExtractionPlan;
  onApprove: (modifications: SpreadsheetPlanModification[]) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function ExtractionPlanReview({
  plan,
  onApprove,
  onCancel,
  isSubmitting = false,
}: ExtractionPlanReviewProps) {
  const [modifications, setModifications] = useState<Record<string, SpreadsheetPlanModification>>(
    () => {
      const initial: Record<string, SpreadsheetPlanModification> = {};
      plan.tables.forEach((t) => {
        initial[t.tableName] = { tableName: t.tableName, action: 'include' };
      });
      return initial;
    },
  );

  const handleToggleTable = useCallback((tableName: string, included: boolean) => {
    setModifications((prev) => ({
      ...prev,
      [tableName]: {
        ...prev[tableName],
        tableName,
        action: included ? 'include' : 'skip',
      },
    }));
  }, []);

  const handleRenameTable = useCallback((originalName: string, newName: string) => {
    setModifications((prev) => ({
      ...prev,
      [originalName]: {
        ...prev[originalName],
        overrides: {
          ...prev[originalName]?.overrides,
          tableName: newName || undefined,
        },
      },
    }));
  }, []);

  const handleApprove = useCallback(() => {
    const mods = Object.values(modifications);
    onApprove(mods);
  }, [modifications, onApprove]);

  const includedCount = Object.values(modifications).filter((m) => m.action === 'include').length;

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 3 }}>
        Review the extraction plan below. You can include/skip tables and optionally rename them
        before proceeding.
      </Alert>

      {plan.catalogMetadata && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" color="text.secondary">
            {cleanDescription(plan.catalogMetadata.projectDescription)}
          </Typography>
          {plan.catalogMetadata.dataQualityNotes?.map((note, i) => (
            <Typography key={i} variant="caption" color="text.secondary" display="block">
              {cleanDescription(note)}
            </Typography>
          ))}
        </Box>
      )}

      <Typography variant="subtitle1" sx={{ mb: 2 }}>
        Tables ({includedCount} of {plan.tables.length} included)
      </Typography>

      {plan.tables.map((table) => {
        const mod = modifications[table.tableName];
        const isSkipped = mod?.action === 'skip';

        return (
          <Card
            key={table.tableName}
            variant="outlined"
            sx={{ mb: 2, opacity: isSkipped ? 0.5 : 1 }}
          >
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1, flexWrap: 'wrap' }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={!isSkipped}
                      onChange={(e) => handleToggleTable(table.tableName, e.target.checked)}
                    />
                  }
                  label=""
                />
                <Typography variant="subtitle1">{table.tableName}</Typography>
                <Chip
                  label={`~${table.estimatedRows} rows`}
                  size="small"
                  variant="outlined"
                />
                <Chip
                  label={`${table.columns.length} columns`}
                  size="small"
                  variant="outlined"
                />
                <Chip
                  label={`${table.sourceFileName} / ${table.sourceSheetName}`}
                  size="small"
                  color="default"
                />
              </Box>

              {table.description && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {table.description}
                </Typography>
              )}

              {!isSkipped && (
                <>
                  <TextField
                    label="Output table name"
                    size="small"
                    defaultValue={table.tableName}
                    onChange={(e) => handleRenameTable(table.tableName, e.target.value)}
                    sx={{ mb: 2, mt: 1 }}
                    fullWidth
                  />

                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Source Column</TableCell>
                          <TableCell>Output Name</TableCell>
                          <TableCell>Type</TableCell>
                          <TableCell>Nullable</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {table.columns.map((col) => (
                          <TableRow key={col.outputName}>
                            <TableCell>{col.sourceName}</TableCell>
                            <TableCell>{col.outputName}</TableCell>
                            <TableCell>
                              <Chip label={col.outputType} size="small" />
                            </TableCell>
                            <TableCell>{col.nullable ? 'Yes' : 'No'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </>
              )}
            </CardContent>
          </Card>
        );
      })}

      {plan.relationships.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            Detected Relationships
          </Typography>
          {plan.relationships.map((rel, i) => (
            <Typography key={i} variant="body2" color="text.secondary">
              {rel.fromTable}.{rel.fromColumn} &rarr; {rel.toTable}.{rel.toColumn}{' '}
              <Chip label={rel.confidence} size="small" sx={{ ml: 1 }} />
            </Typography>
          ))}
        </Box>
      )}

      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 3 }}>
        <Button onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleApprove}
          disabled={isSubmitting || includedCount === 0}
        >
          {isSubmitting ? 'Approving...' : `Approve Plan (${includedCount} tables)`}
        </Button>
      </Box>
    </Box>
  );
}
