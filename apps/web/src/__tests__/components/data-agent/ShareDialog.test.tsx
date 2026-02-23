import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../../utils/test-utils';
import { ShareDialog } from '../../../components/data-agent/ShareDialog';
import * as api from '../../../services/api';
import type { ChatShareInfo } from '../../../types';

vi.mock('../../../hooks/useChatShare', async () => {
  const actual = await vi.importActual('../../../hooks/useChatShare');
  return actual;
});

vi.mock('../../../services/api', () => ({
  getChatShareStatus: vi.fn(),
  createChatShare: vi.fn(),
  revokeChatShare: vi.fn(),
  getSharedChat: vi.fn(),
}));

const mockShareInfo: ChatShareInfo = {
  id: 'share-1',
  shareToken: 'abc123def456ghi789jkl012mno345pqr678stu9',
  shareUrl: 'http://localhost:8319/share/abc123def456ghi789jkl012mno345pqr678stu9',
  expiresAt: null,
  isActive: true,
  viewCount: 5,
  createdAt: '2026-02-22T12:00:00Z',
};

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  chatId: 'chat-123',
  chatName: 'Test Chat',
};

describe('ShareDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Provide a base clipboard object so vi.spyOn can attach to it
    if (!navigator.clipboard) {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: async () => {} },
        writable: true,
        configurable: true,
      });
    }
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
  });

  describe('Loading state', () => {
    it('should render loading state initially', async () => {
      // Never resolving promise keeps the spinner visible
      vi.mocked(api.getChatShareStatus).mockReturnValue(new Promise(() => {}));

      render(<ShareDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
      });
    });
  });

  describe('No active share', () => {
    beforeEach(() => {
      const err: any = new Error('Not Found');
      err.status = 404;
      vi.mocked(api.getChatShareStatus).mockRejectedValue(err);
    });

    it('should show Generate Link form when no active share exists', async () => {
      render(<ShareDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /generate link/i })).toBeInTheDocument();
      });
    });

    it('should show expiry selector with options: 7 days, 30 days, Never expires', async () => {
      const user = userEvent.setup();

      render(<ShareDialog {...defaultProps} />);

      await waitFor(() => {
        // Use getAllByText since MUI renders the label text twice (label + fieldset legend span)
        expect(screen.getAllByText(/link expiration/i).length).toBeGreaterThan(0);
      });

      // Open the select dropdown
      const select = screen.getByRole('combobox');
      await user.click(select);

      await waitFor(() => {
        expect(screen.getByRole('option', { name: /7 days/i })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: /30 days/i })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: /never expires/i })).toBeInTheDocument();
      });
    });

    it('should call create API and display share URL after generating', async () => {
      vi.mocked(api.createChatShare).mockResolvedValue(mockShareInfo);
      const user = userEvent.setup();

      render(<ShareDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /generate link/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /generate link/i }));

      await waitFor(() => {
        expect(api.createChatShare).toHaveBeenCalledWith('chat-123', undefined);
        expect(screen.getByDisplayValue(mockShareInfo.shareUrl)).toBeInTheDocument();
      });
    });
  });

  describe('Active share exists', () => {
    beforeEach(() => {
      vi.mocked(api.getChatShareStatus).mockResolvedValue(mockShareInfo);
    });

    it('should show active share info when one exists', async () => {
      render(<ShareDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByDisplayValue(mockShareInfo.shareUrl)).toBeInTheDocument();
        expect(screen.getByText(/viewed 5 times/i)).toBeInTheDocument();
        expect(screen.getByText(/never expires/i)).toBeInTheDocument();
      });
    });

    it('should copy URL to clipboard when copy button clicked', async () => {
      const user = userEvent.setup();

      render(<ShareDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByDisplayValue(mockShareInfo.shareUrl)).toBeInTheDocument();
      });

      const copyButton = screen.getByRole('button', { name: /copy link/i });
      await user.click(copyButton);

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mockShareInfo.shareUrl);
    });

    it('should show revoke confirmation when Revoke Link clicked', async () => {
      const user = userEvent.setup();

      render(<ShareDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /revoke link/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /revoke link/i }));

      await waitFor(() => {
        expect(screen.getByText(/revoke this share link/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^revoke$/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });
    });

    it('should call revoke API and clear share after confirming revoke', async () => {
      vi.mocked(api.revokeChatShare).mockResolvedValue(undefined);
      const user = userEvent.setup();

      render(<ShareDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /revoke link/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /revoke link/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^revoke$/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^revoke$/i }));

      await waitFor(() => {
        expect(api.revokeChatShare).toHaveBeenCalledWith('chat-123');
        expect(screen.getByRole('button', { name: /generate link/i })).toBeInTheDocument();
      });
    });

    it('should cancel revoke when Cancel clicked', async () => {
      const user = userEvent.setup();

      render(<ShareDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /revoke link/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /revoke link/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /revoke link/i })).toBeInTheDocument();
        expect(screen.queryByText(/revoke this share link/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Error handling', () => {
    it('should display error alert on API failure during status fetch', async () => {
      const err: any = new Error('Server error');
      err.status = 500;
      vi.mocked(api.getChatShareStatus).mockRejectedValue(err);

      render(<ShareDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/server error/i)).toBeInTheDocument();
      });
    });

    it('should display error alert when create API fails', async () => {
      const notFoundErr: any = new Error('Not Found');
      notFoundErr.status = 404;
      vi.mocked(api.getChatShareStatus).mockRejectedValue(notFoundErr);

      const createErr: any = new Error('Failed to generate link');
      vi.mocked(api.createChatShare).mockRejectedValue(createErr);

      const user = userEvent.setup();

      render(<ShareDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /generate link/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /generate link/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/failed to generate link/i)).toBeInTheDocument();
      });
    });
  });

  describe('Close behavior', () => {
    it('should call onClose when Close button clicked', async () => {
      const onClose = vi.fn();
      vi.mocked(api.getChatShareStatus).mockResolvedValue(mockShareInfo);
      const user = userEvent.setup();

      render(<ShareDialog {...defaultProps} onClose={onClose} />);

      await waitFor(() => {
        expect(screen.getByDisplayValue(mockShareInfo.shareUrl)).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^close$/i }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
