import { Chip } from '@mui/material';
import type { DataImportStatus } from '../../types';

const STATUS_CONFIG: Record<
  DataImportStatus,
  { label: string; color: 'default' | 'info' | 'primary' | 'warning' | 'success' | 'error' }
> = {
  draft: { label: 'Draft', color: 'default' },
  pending: { label: 'Pending', color: 'info' },
  importing: { label: 'Importing', color: 'primary' },
  ready: { label: 'Ready', color: 'success' },
  partial: { label: 'Partial', color: 'warning' },
  failed: { label: 'Failed', color: 'error' },
};

interface DataImportStatusChipProps {
  status: DataImportStatus;
  size?: 'small' | 'medium';
}

export function DataImportStatusChip({ status, size = 'small' }: DataImportStatusChipProps) {
  const config = STATUS_CONFIG[status] ?? { label: status, color: 'default' as const };
  return (
    <Chip
      label={config.label}
      color={config.color}
      size={size}
    />
  );
}

export { STATUS_CONFIG as DATA_IMPORT_STATUS_CONFIG };
