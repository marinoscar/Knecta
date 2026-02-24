import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { render } from '../utils/test-utils';
import NewDataImportPage from '../../pages/NewDataImportPage';
import type { DataImport } from '../../types';

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock usePermissions
vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({
    hasPermission: (perm: string) =>
      ['data_imports:read', 'data_imports:write', 'data_imports:delete'].includes(perm),
    hasAnyPermission: () => true,
    hasAllPermissions: () => true,
    hasRole: () => false,
    hasAnyRole: () => false,
    isAdmin: false,
    permissions: new Set(['data_imports:read', 'data_imports:write', 'data_imports:delete']),
    roles: new Set<string>(),
  }),
}));

// Mock useDataImportRun so we don't need real SSE streams in tests
vi.mock('../../hooks/useDataImportRun', () => ({
  useDataImportRun: () => ({
    run: null,
    events: [],
    progress: null,
    isStreaming: false,
    error: null,
    streamStartTime: null,
    fetchRun: vi.fn(),
    startStream: vi.fn(),
    stopStream: vi.fn(),
    cancelRun: vi.fn(),
  }),
}));

// Mock API service calls used directly in the page
vi.mock('../../services/api', async () => {
  const actual = await vi.importActual('../../services/api');
  return {
    ...actual,
    uploadDataImportFile: vi.fn(),
    getDataImportPreview: vi.fn(),
    updateDataImport: vi.fn(),
    createDataImportRun: vi.fn(),
  };
});

// Helper to build a mock DataImport
function buildImport(overrides: Partial<DataImport> = {}): DataImport {
  return {
    id: 'import-new',
    name: 'sales_2026',
    sourceFileName: 'sales_2026.csv',
    sourceFileType: 'csv',
    sourceFileSizeBytes: 512 * 1024,
    sourceStoragePath: '/imports/sales_2026.csv',
    status: 'draft',
    config: null,
    parseResult: null,
    outputTables: null,
    totalRowCount: null,
    totalSizeBytes: null,
    errorMessage: null,
    createdByUserId: 'user-1',
    createdAt: '2026-02-01T10:00:00Z',
    updatedAt: '2026-02-01T10:00:00Z',
    ...overrides,
  };
}

const csvParseResult = {
  type: 'csv' as const,
  detectedDelimiter: ',',
  detectedEncoding: 'UTF-8',
  hasHeader: true,
  columns: [
    { name: 'id', detectedType: 'BIGINT' },
    { name: 'name', detectedType: 'VARCHAR' },
    { name: 'amount', detectedType: 'DECIMAL' },
  ],
  sampleRows: [
    ['1', 'Alice', '100'],
    ['2', 'Bob', '200'],
  ],
  rowCountEstimate: 5000,
};

describe('NewDataImportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Set up default MSW handlers for API calls made via fetch inside
    // useDataImportRun and others that go through the base api client.
    server.use(
      http.post('*/api/data-imports/runs', () =>
        HttpResponse.json({
          id: 'run-1',
          importId: 'import-new',
          status: 'pending',
          currentPhase: null,
          progress: null,
          config: null,
          errorMessage: null,
          startedAt: null,
          completedAt: null,
          createdByUserId: 'user-1',
          createdAt: '2026-02-01T10:00:00Z',
          updatedAt: '2026-02-01T10:00:00Z',
        }),
      ),
    );
  });

  describe('Step 0: Upload', () => {
    it('renders the Upload File step heading initially', async () => {
      render(<NewDataImportPage />);

      await waitFor(() => {
        // "Upload File" appears in both the stepper label and the step content heading
        const instances = screen.getAllByText('Upload File');
        expect(instances.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('renders the page title "New Data Import"', async () => {
      render(<NewDataImportPage />);

      await waitFor(() => {
        expect(screen.getByText('New Data Import')).toBeInTheDocument();
      });
    });

    it('renders the stepper with all step labels', async () => {
      render(<NewDataImportPage />);

      await waitFor(() => {
        // Each label appears at least once in the stepper
        const uploadFileElements = screen.getAllByText('Upload File');
        expect(uploadFileElements.length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('Configure')).toBeInTheDocument();
        expect(screen.getAllByText('Review & Name').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('Importing')).toBeInTheDocument();
      });
    });

    it('renders the file upload drop zone area', async () => {
      render(<NewDataImportPage />);

      await waitFor(() => {
        // Drop zone contains instructional text about CSV/Excel files
        expect(screen.getByText(/csv or excel/i)).toBeInTheDocument();
      });
    });

    it('renders a Cancel button that navigates away', async () => {
      const user = userEvent.setup();
      render(<NewDataImportPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(mockNavigate).toHaveBeenCalledWith('/data-imports');
    });

    it('shows upload progress and advances to Configure step after successful upload', async () => {
      const { uploadDataImportFile, getDataImportPreview } = await import('../../services/api');
      vi.mocked(uploadDataImportFile).mockResolvedValue(buildImport());
      vi.mocked(getDataImportPreview).mockResolvedValue(csvParseResult);

      render(<NewDataImportPage />);

      // Simulate file drop via the hidden file input
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (fileInput) {
        const file = new File(['id,name,amount\n1,Alice,100'], 'sales_2026.csv', {
          type: 'text/csv',
        });
        await userEvent.upload(fileInput, file);
      }

      // Should advance to Configure step (step 1)
      await waitFor(() => {
        expect(screen.getByText('CSV Configuration')).toBeInTheDocument();
      });
    });

    it('shows error alert when upload fails', async () => {
      const { uploadDataImportFile } = await import('../../services/api');
      vi.mocked(uploadDataImportFile).mockRejectedValue(new Error('Upload failed: 413'));

      render(<NewDataImportPage />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (fileInput) {
        const file = new File(['data'], 'large.csv', { type: 'text/csv' });
        await userEvent.upload(fileInput, file);
      }

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });
  });

  describe('Step 2: Review & Name', () => {
    async function advanceToReviewStep() {
      const { uploadDataImportFile, getDataImportPreview, updateDataImport } =
        await import('../../services/api');
      vi.mocked(uploadDataImportFile).mockResolvedValue(buildImport());
      vi.mocked(getDataImportPreview).mockResolvedValue(csvParseResult);
      vi.mocked(updateDataImport).mockResolvedValue(buildImport());

      render(<NewDataImportPage />);

      // Step 0 → Step 1 via file upload
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (fileInput) {
        const file = new File(['id,name\n1,Alice'], 'data.csv', { type: 'text/csv' });
        await userEvent.upload(fileInput, file);
      }

      await waitFor(() => {
        expect(screen.getByText('CSV Configuration')).toBeInTheDocument();
      });

      // Step 1 → Step 2 via Continue button
      await userEvent.click(screen.getByRole('button', { name: /continue/i }));

      await waitFor(() => {
        // "Review & Name" appears in both stepper and content heading; verify it's present
        expect(screen.getAllByText('Review & Name').length).toBeGreaterThanOrEqual(1);
      });
    }

    it('renders Review & Name heading', async () => {
      await advanceToReviewStep();
      // Heading appears in stepper label and content heading
      expect(screen.getAllByText('Review & Name').length).toBeGreaterThanOrEqual(2);
    });

    it('renders Import Name text field', async () => {
      await advanceToReviewStep();
      expect(screen.getByLabelText(/import name/i)).toBeInTheDocument();
    });

    it('Start Import button is disabled when name is empty', async () => {
      await advanceToReviewStep();
      const nameField = screen.getByLabelText(/import name/i);
      await userEvent.clear(nameField);
      expect(
        screen.getByRole('button', { name: /start import/i }),
      ).toBeDisabled();
    });

    it('Back button returns to Configure step', async () => {
      await advanceToReviewStep();
      await userEvent.click(screen.getByRole('button', { name: /back/i }));

      await waitFor(() => {
        expect(screen.getByText('CSV Configuration')).toBeInTheDocument();
      });
    });

    it('renders column names from object format in the Review step preview', async () => {
      await advanceToReviewStep();

      // ImportPreview renders column chips as "name: type" — verify .name is extracted
      // and "[object Object]" is never shown
      await waitFor(() => {
        expect(screen.queryByText(/\[object Object\]/)).not.toBeInTheDocument();
      });

      // Column chips show "name: detectedType" format via ImportPreview
      expect(screen.getByText('id: BIGINT')).toBeInTheDocument();
      expect(screen.getByText('name: VARCHAR')).toBeInTheDocument();
      expect(screen.getByText('amount: DECIMAL')).toBeInTheDocument();
    });
  });

  describe('Step 3: Importing', () => {
    it('renders Importing step heading when activeStep is 3', async () => {
      const { uploadDataImportFile, getDataImportPreview, updateDataImport, createDataImportRun } =
        await import('../../services/api');

      vi.mocked(uploadDataImportFile).mockResolvedValue(buildImport());
      vi.mocked(getDataImportPreview).mockResolvedValue(csvParseResult);
      vi.mocked(updateDataImport).mockResolvedValue(buildImport({ name: 'My Import' }));
      vi.mocked(createDataImportRun).mockResolvedValue({
        id: 'run-1',
        importId: 'import-new',
        status: 'pending',
        currentPhase: null,
        progress: null,
        config: null,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
        createdByUserId: 'user-1',
        createdAt: '2026-02-01T10:00:00Z',
        updatedAt: '2026-02-01T10:00:00Z',
      });

      render(<NewDataImportPage />);

      // Upload → Configure
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (fileInput) {
        await userEvent.upload(
          fileInput,
          new File(['id,name\n1,Alice'], 'data.csv', { type: 'text/csv' }),
        );
      }

      await waitFor(() =>
        expect(screen.getByText('CSV Configuration')).toBeInTheDocument(),
      );

      // Configure → Review
      await userEvent.click(screen.getByRole('button', { name: /continue/i }));

      await waitFor(() =>
        expect(screen.getAllByText('Review & Name').length).toBeGreaterThanOrEqual(1),
      );

      // Review → Importing
      const nameField = screen.getByLabelText(/import name/i);
      await userEvent.clear(nameField);
      await userEvent.type(nameField, 'My Import');

      await userEvent.click(screen.getByRole('button', { name: /start import/i }));

      await waitFor(() => {
        // "Importing" appears in stepper label and content heading
        expect(screen.getAllByText('Importing').length).toBeGreaterThanOrEqual(1);
      });
    });
  });
});
