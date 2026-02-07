import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Box,
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';

interface Field {
  name: string;
  type: string;
  isPrimaryKey?: boolean;
  dimension?: string | null;
}

interface Dataset {
  name: string;
  fields: Field[];
}

interface ModelViewerProps {
  model: {
    datasets?: Dataset[];
    relationships?: any[];
    metrics?: any[];
  };
}

export function ModelViewer({ model }: ModelViewerProps) {
  const datasets = model.datasets || [];
  const relationshipCount = model.relationships?.length || 0;
  const metricCount = model.metrics?.length || 0;

  if (datasets.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          No datasets available in this model.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ mb: 3, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
        <Typography variant="body2">
          Datasets: {datasets.length} | Relationships: {relationshipCount} | Metrics: {metricCount}
        </Typography>
      </Box>

      {datasets.map((dataset, index) => (
        <Accordion key={index} defaultExpanded={index === 0}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="subtitle1" fontWeight="medium">
                {dataset.name}
              </Typography>
              <Chip label={`${dataset.fields.length} fields`} size="small" />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Field Name</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Primary Key</TableCell>
                    <TableCell>Dimension</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {dataset.fields.map((field, fieldIndex) => (
                    <TableRow key={fieldIndex}>
                      <TableCell>{field.name}</TableCell>
                      <TableCell>
                        <Chip label={field.type} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>
                        {field.isPrimaryKey && <Chip label="PK" color="primary" size="small" />}
                      </TableCell>
                      <TableCell>
                        {field.dimension && <Typography variant="body2">{field.dimension}</Typography>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
}
