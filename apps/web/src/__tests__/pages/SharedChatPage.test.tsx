import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '../utils/test-utils';
import SharedChatPage from '../../pages/SharedChatPage';
import * as api from '../../services/api';
import type { SharedChatData } from '../../types';

// Mock MUI X Charts (canvas-based, cannot render in jsdom)
vi.mock('@mui/x-charts', () => ({
  BarChart: () => <div data-testid="bar-chart" />,
  LineChart: () => <div data-testid="line-chart" />,
  PieChart: () => <div data-testid="pie-chart" />,
  ScatterChart: () => <div data-testid="scatter-chart" />,
}));

vi.mock('../../services/api', () => ({
  getSharedChat: vi.fn(),
  getChatShareStatus: vi.fn(),
  createChatShare: vi.fn(),
  revokeChatShare: vi.fn(),
}));

// Mock useParams to provide the shareToken without needing a matching route pattern
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useParams: vi.fn().mockReturnValue({ shareToken: 'abc123def456' }),
  };
});

const mockSharedChat: SharedChatData = {
  chatName: 'Test Chat',
  ontologyName: 'Test Ontology',
  sharedAt: '2026-02-22T12:00:00Z',
  messages: [
    {
      role: 'user',
      content: 'What is the total revenue?',
      status: 'complete',
      createdAt: '2026-02-22T12:01:00Z',
    },
    {
      role: 'assistant',
      content: 'The total revenue is $1,234,567.',
      status: 'complete',
      createdAt: '2026-02-22T12:02:00Z',
      metadata: {
        plan: { complexity: 'simple', intent: 'revenue query', steps: [] },
        dataLineage: {
          datasets: ['orders'],
          joins: [],
          grain: 'aggregate',
          rowCount: 1,
        },
      },
    },
  ],
};

describe('SharedChatPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Loading state', () => {
    it('should show loading spinner initially', () => {
      // Keep the promise pending so loading state persists
      vi.mocked(api.getSharedChat).mockReturnValue(new Promise(() => {}));

      render(<SharedChatPage />, { wrapperOptions: { route: '/share/abc123def456' } });

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
  });

  describe('Successful load', () => {
    beforeEach(() => {
      vi.mocked(api.getSharedChat).mockResolvedValue(mockSharedChat);
    });

    it('should render chat name after loading', async () => {
      render(<SharedChatPage />, { wrapperOptions: { route: '/share/abc123def456' } });

      await waitFor(() => {
        expect(screen.getByText('Test Chat')).toBeInTheDocument();
      });
    });

    it('should render ontology chip after loading', async () => {
      render(<SharedChatPage />, { wrapperOptions: { route: '/share/abc123def456' } });

      await waitFor(() => {
        expect(screen.getByText('Test Ontology')).toBeInTheDocument();
      });
    });

    it('should render user message', async () => {
      render(<SharedChatPage />, { wrapperOptions: { route: '/share/abc123def456' } });

      await waitFor(() => {
        expect(screen.getByText('What is the total revenue?')).toBeInTheDocument();
      });
    });

    it('should render assistant message', async () => {
      render(<SharedChatPage />, { wrapperOptions: { route: '/share/abc123def456' } });

      await waitFor(() => {
        expect(screen.getByText('The total revenue is $1,234,567.')).toBeInTheDocument();
      });
    });

    it('should show "Shared from Knecta Data Agent" footer', async () => {
      render(<SharedChatPage />, { wrapperOptions: { route: '/share/abc123def456' } });

      await waitFor(() => {
        expect(screen.getByText(/shared from knecta data agent/i)).toBeInTheDocument();
      });
    });

    it('should NOT render any input field or send button', async () => {
      render(<SharedChatPage />, { wrapperOptions: { route: '/share/abc123def456' } });

      await waitFor(() => {
        expect(screen.getByText('Test Chat')).toBeInTheDocument();
      });

      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /send/i })).not.toBeInTheDocument();
    });

    it('should NOT render sidebar or navigation', async () => {
      render(<SharedChatPage />, { wrapperOptions: { route: '/share/abc123def456' } });

      await waitFor(() => {
        expect(screen.getByText('Test Chat')).toBeInTheDocument();
      });

      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    });
  });

  describe('Error states', () => {
    it('should show "Link Expired" for 410 errors', async () => {
      const err: any = new Error('Gone');
      err.status = 410;
      vi.mocked(api.getSharedChat).mockRejectedValue(err);

      render(<SharedChatPage />, { wrapperOptions: { route: '/share/abc123def456' } });

      await waitFor(() => {
        expect(screen.getByText('Link Expired')).toBeInTheDocument();
        expect(screen.getByText(/expired or been revoked/i)).toBeInTheDocument();
      });
    });

    it('should show "Not Found" for 404 errors', async () => {
      const err: any = new Error('Not Found');
      err.status = 404;
      vi.mocked(api.getSharedChat).mockRejectedValue(err);

      render(<SharedChatPage />, { wrapperOptions: { route: '/share/abc123def456' } });

      await waitFor(() => {
        expect(screen.getByText('Not Found')).toBeInTheDocument();
        expect(screen.getByText(/was not found/i)).toBeInTheDocument();
      });
    });

    it('should show generic error for other failures', async () => {
      const err: any = new Error('Internal Server Error');
      err.status = 500;
      vi.mocked(api.getSharedChat).mockRejectedValue(err);

      render(<SharedChatPage />, { wrapperOptions: { route: '/share/abc123def456' } });

      await waitFor(() => {
        expect(screen.getByText('Error')).toBeInTheDocument();
        expect(screen.getByText(/failed to load shared conversation/i)).toBeInTheDocument();
      });
    });
  });
});
