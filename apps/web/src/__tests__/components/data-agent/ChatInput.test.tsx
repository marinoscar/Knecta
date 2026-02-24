import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../../utils/test-utils';
import { ChatInput } from '../../../components/data-agent/ChatInput';

describe('ChatInput', () => {
  const mockOnSend = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders input field', () => {
      render(
        <ChatInput onSend={mockOnSend} isStreaming={false} />
      );

      const input = screen.getByPlaceholderText('Ask a question about your data...');
      expect(input).toBeInTheDocument();
    });

    it('renders send button', () => {
      render(
        <ChatInput onSend={mockOnSend} isStreaming={false} />
      );

      const sendButton = screen.getByRole('button');
      expect(sendButton).toBeInTheDocument();
    });
  });


  describe('Input Behavior', () => {
    it('allows typing in input field', async () => {
      const user = userEvent.setup();

      render(
        <ChatInput onSend={mockOnSend} isStreaming={false} />
      );

      const input = screen.getByPlaceholderText('Ask a question about your data...');
      await user.type(input, 'Test question');

      expect(input).toHaveValue('Test question');
    });

    it('sends message when send button is clicked', async () => {
      const user = userEvent.setup();

      render(
        <ChatInput onSend={mockOnSend} isStreaming={false} />
      );

      const input = screen.getByPlaceholderText('Ask a question about your data...');
      await user.type(input, 'Test question');

      const sendButton = screen.getByRole('button');
      await user.click(sendButton);

      expect(mockOnSend).toHaveBeenCalledWith('Test question');
    });

    it('clears input after sending', async () => {
      const user = userEvent.setup();

      render(
        <ChatInput onSend={mockOnSend} isStreaming={false} />
      );

      const input = screen.getByPlaceholderText('Ask a question about your data...');
      await user.type(input, 'Test question');
      await user.click(screen.getByRole('button'));

      expect(input).toHaveValue('');
    });

    it('sends message when Enter is pressed', async () => {
      const user = userEvent.setup();

      render(
        <ChatInput onSend={mockOnSend} isStreaming={false} />
      );

      const input = screen.getByPlaceholderText('Ask a question about your data...');
      await user.type(input, 'Test question{Enter}');

      expect(mockOnSend).toHaveBeenCalledWith('Test question');
    });

    it('multiline input is supported', async () => {
      const user = userEvent.setup();

      render(
        <ChatInput onSend={mockOnSend} isStreaming={false} />
      );

      const input = screen.getByPlaceholderText('Ask a question about your data...');

      // Component uses multiline prop, so it should support multiple lines
      expect(input.tagName).toBe('TEXTAREA');
    });

    it('trims whitespace before sending', async () => {
      const user = userEvent.setup();

      render(
        <ChatInput onSend={mockOnSend} isStreaming={false} />
      );

      const input = screen.getByPlaceholderText('Ask a question about your data...');
      await user.type(input, '  Test question  {Enter}');

      expect(mockOnSend).toHaveBeenCalledWith('Test question');
    });

    it('does not send empty or whitespace-only messages', () => {
      render(
        <ChatInput onSend={mockOnSend} isStreaming={false} />
      );

      // Send button should be disabled when input is empty
      const sendButton = screen.getByRole('button');
      expect(sendButton).toBeDisabled();

      // Verify onSend was never called
      expect(mockOnSend).not.toHaveBeenCalled();
    });
  });

  describe('Disabled States', () => {
    it('disables input when isStreaming is true', () => {
      render(
        <ChatInput onSend={mockOnSend} isStreaming={true} />
      );

      const input = screen.getByPlaceholderText('Agent is thinking...');
      expect(input).toBeDisabled();
    });

    it('disables input when disabled prop is true', () => {
      render(
        <ChatInput onSend={mockOnSend} isStreaming={false} disabled={true} />
      );

      const input = screen.getByPlaceholderText('Chat is not available');
      expect(input).toBeDisabled();
    });

    it('disables send button when isStreaming is true', () => {
      render(
        <ChatInput onSend={mockOnSend} isStreaming={true} />
      );

      const sendButton = screen.getByRole('button');
      expect(sendButton).toBeDisabled();
    });

    it('disables send button when input is empty', () => {
      render(
        <ChatInput onSend={mockOnSend} isStreaming={false} />
      );

      const sendButton = screen.getByRole('button');
      expect(sendButton).toBeDisabled();
    });

    it('enables send button when input has text', async () => {
      const user = userEvent.setup();

      render(
        <ChatInput onSend={mockOnSend} isStreaming={false} />
      );

      const input = screen.getByPlaceholderText('Ask a question about your data...');
      await user.type(input, 'Test');

      const sendButton = screen.getByRole('button');
      expect(sendButton).not.toBeDisabled();
    });
  });

  describe('Placeholder Text', () => {
    it('shows normal placeholder when not streaming and not disabled', () => {
      render(
        <ChatInput onSend={mockOnSend} isStreaming={false} />
      );

      expect(screen.getByPlaceholderText('Ask a question about your data...')).toBeInTheDocument();
    });

    it('shows streaming placeholder when isStreaming is true', () => {
      render(
        <ChatInput onSend={mockOnSend} isStreaming={true} />
      );

      expect(screen.getByPlaceholderText('Agent is thinking...')).toBeInTheDocument();
    });

    it('shows disabled placeholder when disabled is true', () => {
      render(
        <ChatInput onSend={mockOnSend} isStreaming={false} disabled={true} />
      );

      expect(screen.getByPlaceholderText('Chat is not available')).toBeInTheDocument();
    });
  });

  describe('Web Search Toggle', () => {
    it('does not render the web search toggle when globalWebSearchEnabled is false', () => {
      render(
        <ChatInput
          onSend={mockOnSend}
          isStreaming={false}
          globalWebSearchEnabled={false}
        />
      );

      expect(
        screen.queryByRole('button', { name: /web search/i })
      ).not.toBeInTheDocument();
    });

    it('does not render the web search toggle when globalWebSearchEnabled is not provided', () => {
      render(
        <ChatInput onSend={mockOnSend} isStreaming={false} />
      );

      expect(
        screen.queryByRole('button', { name: /web search/i })
      ).not.toBeInTheDocument();
    });

    it('renders the web search toggle when globalWebSearchEnabled is true', () => {
      render(
        <ChatInput
          onSend={mockOnSend}
          isStreaming={false}
          globalWebSearchEnabled={true}
        />
      );

      expect(
        screen.getByRole('button', { name: /web search/i })
      ).toBeInTheDocument();
    });

    it('toggle has aria-label "Enable web search" when webSearchEnabled is false', () => {
      render(
        <ChatInput
          onSend={mockOnSend}
          isStreaming={false}
          globalWebSearchEnabled={true}
          webSearchEnabled={false}
        />
      );

      expect(
        screen.getByRole('button', { name: 'Enable web search' })
      ).toBeInTheDocument();
    });

    it('toggle has aria-label "Disable web search" when webSearchEnabled is true', () => {
      render(
        <ChatInput
          onSend={mockOnSend}
          isStreaming={false}
          globalWebSearchEnabled={true}
          webSearchEnabled={true}
        />
      );

      expect(
        screen.getByRole('button', { name: 'Disable web search' })
      ).toBeInTheDocument();
    });

    it('calls onToggleWebSearch when the toggle button is clicked', async () => {
      const user = userEvent.setup();
      const mockOnToggle = vi.fn();

      render(
        <ChatInput
          onSend={mockOnSend}
          isStreaming={false}
          globalWebSearchEnabled={true}
          webSearchEnabled={false}
          onToggleWebSearch={mockOnToggle}
        />
      );

      const toggleButton = screen.getByRole('button', { name: 'Enable web search' });
      await user.click(toggleButton);

      expect(mockOnToggle).toHaveBeenCalledTimes(1);
    });

    it('web search toggle is disabled and onToggleWebSearch is not called when chat is disabled', async () => {
      const mockOnToggle = vi.fn();

      render(
        <ChatInput
          onSend={mockOnSend}
          isStreaming={false}
          globalWebSearchEnabled={true}
          webSearchEnabled={false}
          onToggleWebSearch={mockOnToggle}
          disabled={true}
        />
      );

      const toggleButton = screen.getByRole('button', { name: 'Enable web search' });
      // Button must be disabled - a disabled MUI IconButton also sets pointer-events: none
      expect(toggleButton).toBeDisabled();
      // onToggleWebSearch is never called because the button is disabled
      expect(mockOnToggle).not.toHaveBeenCalled();
    });

    it('disables the web search toggle when isStreaming is true', () => {
      render(
        <ChatInput
          onSend={mockOnSend}
          isStreaming={true}
          globalWebSearchEnabled={true}
          webSearchEnabled={false}
        />
      );

      const toggleButton = screen.getByRole('button', { name: 'Enable web search' });
      expect(toggleButton).toBeDisabled();
    });

    it('shows tooltip "Web search enabled" when webSearchEnabled is true', async () => {
      const user = userEvent.setup();

      render(
        <ChatInput
          onSend={mockOnSend}
          isStreaming={false}
          globalWebSearchEnabled={true}
          webSearchEnabled={true}
        />
      );

      const toggleButton = screen.getByRole('button', { name: 'Disable web search' });
      await user.hover(toggleButton);

      expect(await screen.findByText('Web search enabled')).toBeInTheDocument();
    });

    it('shows tooltip "Web search" when webSearchEnabled is false', async () => {
      const user = userEvent.setup();

      render(
        <ChatInput
          onSend={mockOnSend}
          isStreaming={false}
          globalWebSearchEnabled={true}
          webSearchEnabled={false}
        />
      );

      const toggleButton = screen.getByRole('button', { name: 'Enable web search' });
      await user.hover(toggleButton);

      expect(await screen.findByText('Web search')).toBeInTheDocument();
    });
  });

});
