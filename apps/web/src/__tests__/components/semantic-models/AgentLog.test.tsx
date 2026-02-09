import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../../utils/test-utils';
import { AgentLog } from '../../../components/semantic-models/AgentLog';
import * as apiModule from '../../../services/api';

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Helper to create SSE stream
function createSSEStream(events: Array<Record<string, any>>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    },
  });
}

describe('AgentLog', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock api.getAccessToken()
    vi.spyOn(apiModule.api, 'getAccessToken').mockReturnValue('mock-token');

    // Mock scrollIntoView (not implemented in JSDOM)
    Element.prototype.scrollIntoView = vi.fn();
  });

  describe('Initial State', () => {
    it('should show connecting spinner initially', async () => {
      // Mock fetch to never resolve (stay in connecting state)
      global.fetch = vi.fn(() => new Promise(() => {}));

      render(<AgentLog runId="test-run-1" />);

      expect(screen.getByText('Connecting to agent...')).toBeInTheDocument();
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
  });

  describe('Progress Events', () => {
    it('should show progress bar when progress event received', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream([
          { type: 'run_start' },
          { type: 'step_start', step: 'discover_and_generate', label: 'Discovering & Generating Datasets' },
          { type: 'progress', currentTable: 1, totalTables: 5, tableName: 'public.orders', phase: 'discover', percentComplete: 20 },
        ]),
      } as Response);

      render(<AgentLog runId="test-run-1" />);

      await waitFor(() => {
        expect(screen.getByText('Overall Progress')).toBeInTheDocument();
      });

      // Check for progress percentage
      await waitFor(() => {
        expect(screen.getByText('20%')).toBeInTheDocument();
      });

      // LinearProgress should be rendered
      const progressBar = document.querySelector('.MuiLinearProgress-root');
      expect(progressBar).toBeInTheDocument();
    });

    it('should update progress percentage as events arrive', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream([
          { type: 'run_start' },
          { type: 'step_start', step: 'discover_and_generate', label: 'Discovering & Generating Datasets' },
          { type: 'progress', currentTable: 1, totalTables: 5, tableName: 'public.orders', phase: 'discover', percentComplete: 20 },
          { type: 'progress', currentTable: 2, totalTables: 5, tableName: 'public.customers', phase: 'discover', percentComplete: 40 },
          { type: 'progress', currentTable: 3, totalTables: 5, tableName: 'public.products', phase: 'generate', percentComplete: 60 },
        ]),
      } as Response);

      render(<AgentLog runId="test-run-1" />);


      // Should show final percentage
      await waitFor(() => {
        expect(screen.getByText('60%')).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe('Table Progress Events', () => {
    it('should show discovering table with spinner', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream([
          { type: 'run_start' },
          { type: 'step_start', step: 'discover_and_generate', label: 'Discovering & Generating Datasets' },
          { type: 'progress', currentTable: 1, totalTables: 2, tableName: 'public.orders', phase: 'discover', percentComplete: 25 },
        ]),
      } as Response);

      render(<AgentLog runId="test-run-1" />);

      await waitFor(() => {
        expect(screen.getByText('public.orders')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText('Discovering...')).toBeInTheDocument();
      });
    });

    it('should show generating table with spinner', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream([
          { type: 'run_start' },
          { type: 'step_start', step: 'discover_and_generate', label: 'Discovering & Generating Datasets' },
          { type: 'progress', currentTable: 1, totalTables: 2, tableName: 'public.orders', phase: 'discover', percentComplete: 25 },
          { type: 'progress', currentTable: 1, totalTables: 2, tableName: 'public.orders', phase: 'generate', percentComplete: 50 },
        ]),
      } as Response);

      render(<AgentLog runId="test-run-1" />);

      await waitFor(() => {
        expect(screen.getByText('Generating...')).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should show completed table with checkmark', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream([
          { type: 'run_start' },
          { type: 'step_start', step: 'discover_and_generate', label: 'Discovering & Generating Datasets' },
          { type: 'progress', currentTable: 1, totalTables: 2, tableName: 'public.orders', phase: 'discover', percentComplete: 25 },
          { type: 'progress', currentTable: 1, totalTables: 2, tableName: 'public.orders', phase: 'generate', percentComplete: 50 },
          { type: 'table_complete', tableName: 'public.orders', tableIndex: 0, totalTables: 2, datasetName: 'orders' },
        ]),
      } as Response);

      render(<AgentLog runId="test-run-1" />);

      await waitFor(() => {
        expect(screen.getByText('public.orders')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText('Complete')).toBeInTheDocument();
      }, { timeout: 3000 });

      // Check for success icon
      const checkIcons = document.querySelectorAll('[data-testid="CheckCircleIcon"]');
      expect(checkIcons.length).toBeGreaterThan(0);
    });

    it('should show failed table with error message', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream([
          { type: 'run_start' },
          { type: 'step_start', step: 'discover_and_generate', label: 'Discovering & Generating Datasets' },
          { type: 'progress', currentTable: 1, totalTables: 2, tableName: 'public.orders', phase: 'discover', percentComplete: 25 },
          { type: 'table_error', tableName: 'public.orders', error: 'Table not accessible' },
        ]),
      } as Response);

      render(<AgentLog runId="test-run-1" />);

      await waitFor(() => {
        expect(screen.getByText('public.orders')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText(/Failed: Table not accessible/)).toBeInTheDocument();
      }, { timeout: 3000 });

      // Check for error icon
      const errorIcons = document.querySelectorAll('[data-testid="ErrorIcon"]');
      expect(errorIcons.length).toBeGreaterThan(0);
    });

    it('should track multiple tables simultaneously', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream([
          { type: 'run_start' },
          { type: 'step_start', step: 'discover_and_generate', label: 'Discovering & Generating Datasets' },
          { type: 'progress', currentTable: 1, totalTables: 3, tableName: 'public.orders', phase: 'discover', percentComplete: 10 },
          { type: 'progress', currentTable: 2, totalTables: 3, tableName: 'public.customers', phase: 'discover', percentComplete: 20 },
          { type: 'table_complete', tableName: 'public.orders', tableIndex: 0, totalTables: 3, datasetName: 'orders' },
          { type: 'progress', currentTable: 3, totalTables: 3, tableName: 'public.products', phase: 'discover', percentComplete: 30 },
          { type: 'table_complete', tableName: 'public.customers', tableIndex: 1, totalTables: 3, datasetName: 'customers' },
          { type: 'table_error', tableName: 'public.products', error: 'Insufficient permissions' },
        ]),
      } as Response);

      render(<AgentLog runId="test-run-1" />);

      await waitFor(() => {
        expect(screen.getByText('public.orders')).toBeInTheDocument();
        expect(screen.getByText('public.customers')).toBeInTheDocument();
        expect(screen.getByText('public.products')).toBeInTheDocument();
      }, { timeout: 3000 });

      // Verify statuses
      await waitFor(() => {
        // Find all "Complete" texts and verify at least 2
        const completeTexts = screen.getAllByText('Complete');
        expect(completeTexts.length).toBeGreaterThanOrEqual(2);
        expect(screen.getByText(/Failed: Insufficient permissions/)).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe('Token Count Display', () => {
    it('should display token count from token_update events', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream([
          { type: 'run_start' },
          { type: 'step_start', step: 'discover_and_generate', label: 'Discovering & Generating Datasets' },
          { type: 'token_update', tokensUsed: { prompt: 100, completion: 50, total: 150 } },
        ]),
      } as Response);

      render(<AgentLog runId="test-run-1" />);

      await waitFor(() => {
        expect(screen.getByText('150 tokens')).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should update token count as more tokens are used', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream([
          { type: 'run_start' },
          { type: 'step_start', step: 'discover_and_generate', label: 'Discovering & Generating Datasets' },
          { type: 'token_update', tokensUsed: { prompt: 100, completion: 50, total: 150 } },
          { type: 'token_update', tokensUsed: { prompt: 250, completion: 120, total: 370 } },
        ]),
      } as Response);

      render(<AgentLog runId="test-run-1" />);


      // Should show updated total
      await waitFor(() => {
        expect(screen.getByText('370 tokens')).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should hide token chip when no tokens used', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream([
          { type: 'run_start' },
          { type: 'step_start', step: 'discover_and_generate', label: 'Discovering & Generating Datasets' },
        ]),
      } as Response);

      render(<AgentLog runId="test-run-1" />);

      await waitFor(() => {
        expect(screen.getByText('Discovering & Generating Datasets')).toBeInTheDocument();
      });

      // Token chip should not be present
      expect(screen.queryByText(/tokens/)).not.toBeInTheDocument();
    });
  });

  describe('Elapsed Timer', () => {
    it('should show elapsed time timer chip', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream([
          { type: 'run_start' },
          { type: 'step_start', step: 'discover_and_generate', label: 'Discovering & Generating Datasets' },
        ]),
      } as Response);

      render(<AgentLog runId="test-run-1" />);

      await waitFor(() => {
        expect(screen.getByText('Discovering & Generating Datasets')).toBeInTheDocument();
      });

      // Should show initial time (0:00)
      await waitFor(() => {
        expect(screen.getByText('0:00')).toBeInTheDocument();
      });
    });

    it('should show elapsed timer with time format', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream([
          { type: 'run_start' },
          { type: 'step_start', step: 'discover_and_generate', label: 'Discovering & Generating Datasets' },
        ]),
      } as Response);

      render(<AgentLog runId="test-run-1" />);

      await waitFor(() => {
        expect(screen.getByText('0:00')).toBeInTheDocument();
      });

      // Timer should be present (format: M:SS)
      const timer = screen.getByText(/^\d+:\d{2}$/);
      expect(timer).toBeInTheDocument();
    });

    it('should show timer icon', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream([
          { type: 'run_start' },
        ]),
      } as Response);

      render(<AgentLog runId="test-run-1" />);

      await waitFor(() => {
        const timerIcons = document.querySelectorAll('[data-testid="TimerIcon"]');
        expect(timerIcons.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Completion State', () => {
    it('should show success alert on successful completion', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream([
          { type: 'run_start' },
          { type: 'step_start', step: 'discover_and_generate', label: 'Discovering & Generating Datasets' },
          { type: 'progress', currentTable: 1, totalTables: 1, tableName: 'public.orders', phase: 'discover', percentComplete: 50 },
          { type: 'table_complete', tableName: 'public.orders', tableIndex: 0, totalTables: 1, datasetName: 'orders' },
          { type: 'run_complete', semanticModelId: 'model-123', tokensUsed: { prompt: 100, completion: 50, total: 150 }, failedTables: [], duration: 5000 },
        ]),
      } as Response);

      render(<AgentLog runId="test-run-1" />);

      await waitFor(() => {
        expect(screen.getByText('Model generated successfully in 5s')).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should show duration in success alert', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream([
          { type: 'run_start' },
          { type: 'run_complete', semanticModelId: 'model-123', tokensUsed: { prompt: 100, completion: 50, total: 150 }, failedTables: [], duration: 12500 },
        ]),
      } as Response);

      render(<AgentLog runId="test-run-1" />);

      await waitFor(() => {
        expect(screen.getByText('Model generated successfully in 12s')).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should show View Semantic Model button on successful completion', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream([
          { type: 'run_start' },
          { type: 'run_complete', semanticModelId: 'model-123', tokensUsed: { prompt: 100, completion: 50, total: 150 }, failedTables: [], duration: 5000 },
        ]),
      } as Response);

      render(<AgentLog runId="test-run-1" />);

      await waitFor(() => {
        expect(screen.getByText('View Semantic Model')).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should navigate to model detail on View button click', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream([
          { type: 'run_start' },
          { type: 'run_complete', semanticModelId: 'model-123', tokensUsed: { prompt: 100, completion: 50, total: 150 }, failedTables: [], duration: 5000 },
        ]),
      } as Response);

      render(<AgentLog runId="test-run-1" />);


      const viewButton = await screen.findByText('View Semantic Model', {}, { timeout: 3000 });
      await userEvent.click(viewButton);

      expect(mockNavigate).toHaveBeenCalledWith('/semantic-models/model-123');
    });

    it('should show warning for failed tables on completion', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream([
          { type: 'run_start' },
          { type: 'step_start', step: 'discover_and_generate', label: 'Discovering & Generating Datasets' },
          { type: 'progress', currentTable: 1, totalTables: 2, tableName: 'public.orders', phase: 'discover', percentComplete: 25 },
          { type: 'table_complete', tableName: 'public.orders', tableIndex: 0, totalTables: 2, datasetName: 'orders' },
          { type: 'progress', currentTable: 2, totalTables: 2, tableName: 'public.customers', phase: 'discover', percentComplete: 50 },
          { type: 'table_error', tableName: 'public.customers', error: 'Access denied' },
          { type: 'run_complete', semanticModelId: 'model-123', tokensUsed: { prompt: 100, completion: 50, total: 150 }, failedTables: ['public.customers'], duration: 5000 },
        ]),
      } as Response);

      render(<AgentLog runId="test-run-1" />);

      await waitFor(() => {
        expect(screen.getByText(/1 table\(s\) failed during generation and were skipped:/)).toBeInTheDocument();
      }, { timeout: 3000 });

      // Verify the failed table name appears in the warning message
      const warningAlert = screen.getByText(/1 table\(s\) failed/).closest('.MuiAlert-root');
      expect(warningAlert).toHaveTextContent('public.customers');
    });

    it('should show multiple failed tables in warning', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream([
          { type: 'run_start' },
          { type: 'run_complete', semanticModelId: 'model-123', tokensUsed: { prompt: 100, completion: 50, total: 150 }, failedTables: ['public.customers', 'public.products', 'public.inventory'], duration: 5000 },
        ]),
      } as Response);

      render(<AgentLog runId="test-run-1" />);

      await waitFor(() => {
        expect(screen.getByText(/3 table\(s\) failed during generation and were skipped:/)).toBeInTheDocument();
      }, { timeout: 3000 });

      // Verify all failed table names appear in the warning message
      const warningAlert = screen.getByText(/3 table\(s\) failed/).closest('.MuiAlert-root');
      expect(warningAlert).toHaveTextContent('public.customers');
      expect(warningAlert).toHaveTextContent('public.products');
      expect(warningAlert).toHaveTextContent('public.inventory');
    });

    it('should not show warning when no tables failed', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream([
          { type: 'run_start' },
          { type: 'run_complete', semanticModelId: 'model-123', tokensUsed: { prompt: 100, completion: 50, total: 150 }, failedTables: [], duration: 5000 },
        ]),
      } as Response);

      render(<AgentLog runId="test-run-1" />);

      await waitFor(() => {
        expect(screen.getByText('Model generated successfully in 5s')).toBeInTheDocument();
      });

      // No warning should be present
      expect(screen.queryByText(/table\(s\) failed/)).not.toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('should show error message on run_error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream([
          { type: 'run_start' },
          { type: 'step_start', step: 'discover_and_generate', label: 'Discovering & Generating Datasets' },
          { type: 'run_error', message: 'Connection to database failed' },
        ]),
      } as Response);

      render(<AgentLog runId="test-run-1" />);

      await waitFor(() => {
        expect(screen.getByText('Connection to database failed')).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should show retry button when onRetry callback provided', async () => {
      const mockRetry = vi.fn();

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream([
          { type: 'run_start' },
          { type: 'run_error', message: 'Connection to database failed' },
        ]),
      } as Response);

      render(<AgentLog runId="test-run-1" onRetry={mockRetry} />);


      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should call onRetry when retry button clicked', async () => {
      const mockRetry = vi.fn();

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream([
          { type: 'run_start' },
          { type: 'run_error', message: 'Connection to database failed' },
        ]),
      } as Response);

      render(<AgentLog runId="test-run-1" onRetry={mockRetry} />);


      const retryButton = await screen.findByText('Retry', {}, { timeout: 3000 });
      await userEvent.click(retryButton);

      expect(mockRetry).toHaveBeenCalled();
    });

    it('should show exit button when onExit callback provided', async () => {
      const mockExit = vi.fn();

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream([
          { type: 'run_start' },
          { type: 'run_error', message: 'Connection to database failed' },
        ]),
      } as Response);

      render(<AgentLog runId="test-run-1" onExit={mockExit} />);


      await waitFor(() => {
        expect(screen.getByText('Back to List')).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should call onExit when exit button clicked', async () => {
      const mockExit = vi.fn();

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream([
          { type: 'run_start' },
          { type: 'run_error', message: 'Connection to database failed' },
        ]),
      } as Response);

      render(<AgentLog runId="test-run-1" onExit={mockExit} />);


      const exitButton = await screen.findByText('Back to List', {}, { timeout: 3000 });
      await userEvent.click(exitButton);

      expect(mockExit).toHaveBeenCalled();
    });

    it('should show error on failed fetch connection', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      render(<AgentLog runId="test-run-1" />);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe('Step Sections', () => {
    it('should show step with active spinner', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream([
          { type: 'run_start' },
          { type: 'step_start', step: 'discover_and_generate', label: 'Discovering & Generating Datasets' },
        ]),
      } as Response);

      render(<AgentLog runId="test-run-1" />);

      await waitFor(() => {
        expect(screen.getByText('Discovering & Generating Datasets')).toBeInTheDocument();
      });

      // Active step should have spinner
      const progressBars = screen.getAllByRole('progressbar');
      expect(progressBars.length).toBeGreaterThan(0);
    });

    it('should show completed step with checkmark', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream([
          { type: 'run_start' },
          { type: 'step_start', step: 'discover_and_generate', label: 'Discovering & Generating Datasets' },
          { type: 'step_end', step: 'discover_and_generate' },
        ]),
      } as Response);

      render(<AgentLog runId="test-run-1" />);

      await waitFor(() => {
        expect(screen.getByText('Discovering & Generating Datasets')).toBeInTheDocument();
      });

      await waitFor(() => {
        const checkIcons = document.querySelectorAll('[data-testid="CheckCircleIcon"]');
        expect(checkIcons.length).toBeGreaterThan(0);
      }, { timeout: 3000 });
    });

    it('should show text entries in step', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream([
          { type: 'run_start' },
          { type: 'step_start', step: 'discover_and_generate', label: 'Discovering & Generating Datasets' },
          { type: 'text', content: 'Analyzing database schema...' },
          { type: 'text', content: 'Found 5 tables to process' },
        ]),
      } as Response);

      render(<AgentLog runId="test-run-1" />);

      await waitFor(() => {
        expect(screen.getByText('Analyzing database schema...')).toBeInTheDocument();
      }, { timeout: 3000 });

      await waitFor(() => {
        expect(screen.getByText('Found 5 tables to process')).toBeInTheDocument();
      });
    });

    it('should handle multiple sequential steps', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream([
          { type: 'run_start' },
          { type: 'step_start', step: 'initialize', label: 'Initializing' },
          { type: 'text', content: 'Setting up connection...' },
          { type: 'step_end', step: 'initialize' },
          { type: 'step_start', step: 'discover_and_generate', label: 'Discovering & Generating Datasets' },
          { type: 'text', content: 'Processing tables...' },
          { type: 'step_end', step: 'discover_and_generate' },
        ]),
      } as Response);

      render(<AgentLog runId="test-run-1" />);

      await waitFor(() => {
        expect(screen.getByText('Initializing')).toBeInTheDocument();
        expect(screen.getByText('Discovering & Generating Datasets')).toBeInTheDocument();
      }, { timeout: 3000 });

      await waitFor(() => {
        expect(screen.getByText('Setting up connection...')).toBeInTheDocument();
        expect(screen.getByText('Processing tables...')).toBeInTheDocument();
      });
    });
  });

  describe('Integration: Full Run Lifecycle', () => {
    it('should handle complete successful run lifecycle', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream([
          { type: 'run_start' },
          { type: 'step_start', step: 'discover_and_generate', label: 'Discovering & Generating Datasets' },
          { type: 'text', content: 'Starting discovery process...' },
          { type: 'progress', currentTable: 1, totalTables: 2, tableName: 'public.orders', phase: 'discover', percentComplete: 25 },
          { type: 'progress', currentTable: 1, totalTables: 2, tableName: 'public.orders', phase: 'generate', percentComplete: 37 },
          { type: 'table_complete', tableName: 'public.orders', tableIndex: 0, totalTables: 2, datasetName: 'orders' },
          { type: 'progress', currentTable: 2, totalTables: 2, tableName: 'public.customers', phase: 'discover', percentComplete: 62 },
          { type: 'progress', currentTable: 2, totalTables: 2, tableName: 'public.customers', phase: 'generate', percentComplete: 87 },
          { type: 'table_complete', tableName: 'public.customers', tableIndex: 1, totalTables: 2, datasetName: 'customers' },
          { type: 'token_update', tokensUsed: { prompt: 1500, completion: 800, total: 2300 } },
          { type: 'step_end', step: 'discover_and_generate' },
          { type: 'run_complete', semanticModelId: 'model-456', tokensUsed: { prompt: 1500, completion: 800, total: 2300 }, failedTables: [], duration: 8500 },
        ]),
      } as Response);

      render(<AgentLog runId="test-run-1" />);


      // Check step appears
      await waitFor(() => {
        expect(screen.getByText('Discovering & Generating Datasets')).toBeInTheDocument();
      });

      // Check text appears
      await waitFor(() => {
        expect(screen.getByText('Starting discovery process...')).toBeInTheDocument();
      });

      // Check tables appear and complete
      await waitFor(() => {
        expect(screen.getByText('public.orders')).toBeInTheDocument();
        expect(screen.getByText('public.customers')).toBeInTheDocument();
      }, { timeout: 3000 });

      // Check completion
      await waitFor(() => {
        expect(screen.getByText('Model generated successfully in 8s')).toBeInTheDocument();
        expect(screen.getByText('2,300 tokens')).toBeInTheDocument();
        expect(screen.getByText('View Semantic Model')).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should handle run with partial failures', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createSSEStream([
          { type: 'run_start' },
          { type: 'step_start', step: 'discover_and_generate', label: 'Discovering & Generating Datasets' },
          { type: 'progress', currentTable: 1, totalTables: 3, tableName: 'public.orders', phase: 'discover', percentComplete: 16 },
          { type: 'table_complete', tableName: 'public.orders', tableIndex: 0, totalTables: 3, datasetName: 'orders' },
          { type: 'progress', currentTable: 2, totalTables: 3, tableName: 'public.customers', phase: 'discover', percentComplete: 33 },
          { type: 'table_error', tableName: 'public.customers', error: 'Permission denied' },
          { type: 'progress', currentTable: 3, totalTables: 3, tableName: 'public.products', phase: 'discover', percentComplete: 50 },
          { type: 'table_complete', tableName: 'public.products', tableIndex: 2, totalTables: 3, datasetName: 'products' },
          { type: 'step_end', step: 'discover_and_generate' },
          { type: 'run_complete', semanticModelId: 'model-789', tokensUsed: { prompt: 1200, completion: 600, total: 1800 }, failedTables: ['public.customers'], duration: 6500 },
        ]),
      } as Response);

      render(<AgentLog runId="test-run-1" />);


      // Check all tables appear
      await waitFor(() => {
        expect(screen.getByText('public.orders')).toBeInTheDocument();
        expect(screen.getByText('public.customers')).toBeInTheDocument();
        expect(screen.getByText('public.products')).toBeInTheDocument();
      }, { timeout: 3000 });

      // Check completion with warning
      await waitFor(() => {
        expect(screen.getByText(/1 table\(s\) failed during generation and were skipped:/)).toBeInTheDocument();
        expect(screen.getByText('Model generated successfully in 6s')).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });
});
