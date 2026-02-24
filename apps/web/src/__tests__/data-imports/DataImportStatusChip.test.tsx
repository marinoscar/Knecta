import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '../utils/test-utils';
import {
  DataImportStatusChip,
  DATA_IMPORT_STATUS_CONFIG,
} from '../../components/data-imports/DataImportStatusChip';
import type { DataImportStatus } from '../../types';

describe('DataImportStatusChip', () => {
  describe('Label rendering', () => {
    it('renders "Draft" label for draft status', () => {
      render(<DataImportStatusChip status="draft" />);

      expect(screen.getByText('Draft')).toBeInTheDocument();
    });

    it('renders "Pending" label for pending status', () => {
      render(<DataImportStatusChip status="pending" />);

      expect(screen.getByText('Pending')).toBeInTheDocument();
    });

    it('renders "Importing" label for importing status', () => {
      render(<DataImportStatusChip status="importing" />);

      expect(screen.getByText('Importing')).toBeInTheDocument();
    });

    it('renders "Ready" label for ready status', () => {
      render(<DataImportStatusChip status="ready" />);

      expect(screen.getByText('Ready')).toBeInTheDocument();
    });

    it('renders "Partial" label for partial status', () => {
      render(<DataImportStatusChip status="partial" />);

      expect(screen.getByText('Partial')).toBeInTheDocument();
    });

    it('renders "Failed" label for failed status', () => {
      render(<DataImportStatusChip status="failed" />);

      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  describe('Color configuration', () => {
    it('uses "default" color for draft status', () => {
      expect(DATA_IMPORT_STATUS_CONFIG['draft'].color).toBe('default');
    });

    it('uses "info" color for pending status', () => {
      expect(DATA_IMPORT_STATUS_CONFIG['pending'].color).toBe('info');
    });

    it('uses "primary" color for importing status', () => {
      expect(DATA_IMPORT_STATUS_CONFIG['importing'].color).toBe('primary');
    });

    it('uses "success" color for ready status', () => {
      expect(DATA_IMPORT_STATUS_CONFIG['ready'].color).toBe('success');
    });

    it('uses "warning" color for partial status', () => {
      expect(DATA_IMPORT_STATUS_CONFIG['partial'].color).toBe('warning');
    });

    it('uses "error" color for failed status', () => {
      expect(DATA_IMPORT_STATUS_CONFIG['failed'].color).toBe('error');
    });
  });

  describe('Chip rendering', () => {
    it('renders a MUI Chip element (with role="button" or as presentation)', () => {
      const { container } = render(<DataImportStatusChip status="ready" />);

      // MUI Chip renders as a div with class MuiChip-root
      const chip = container.querySelector('.MuiChip-root');
      expect(chip).toBeInTheDocument();
    });

    it('renders with small size by default', () => {
      const { container } = render(<DataImportStatusChip status="ready" />);

      const chip = container.querySelector('.MuiChip-sizeSmall');
      expect(chip).toBeInTheDocument();
    });

    it('renders with medium size when size="medium" is passed', () => {
      const { container } = render(<DataImportStatusChip status="ready" size="medium" />);

      const chip = container.querySelector('.MuiChip-sizeMedium');
      expect(chip).toBeInTheDocument();
    });
  });

  describe('All statuses render without error', () => {
    const ALL_STATUSES: DataImportStatus[] = [
      'draft',
      'pending',
      'importing',
      'ready',
      'partial',
      'failed',
    ];

    ALL_STATUSES.forEach((status) => {
      it(`renders without throwing for status: ${status}`, () => {
        expect(() => render(<DataImportStatusChip status={status} />)).not.toThrow();
      });
    });
  });

  describe('STATUS_CONFIG export', () => {
    it('exports STATUS_CONFIG with all six statuses', () => {
      const statuses = Object.keys(DATA_IMPORT_STATUS_CONFIG);
      expect(statuses).toContain('draft');
      expect(statuses).toContain('pending');
      expect(statuses).toContain('importing');
      expect(statuses).toContain('ready');
      expect(statuses).toContain('partial');
      expect(statuses).toContain('failed');
    });

    it('each config entry has a label and color field', () => {
      Object.values(DATA_IMPORT_STATUS_CONFIG).forEach((config) => {
        expect(config).toHaveProperty('label');
        expect(config).toHaveProperty('color');
        expect(typeof config.label).toBe('string');
        expect(typeof config.color).toBe('string');
      });
    });
  });
});
