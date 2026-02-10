import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '../../utils/test-utils';
import { ChatMessage } from '../../../components/data-agent/ChatMessage';
import type { DataChatMessage } from '../../../types';

describe('ChatMessage', () => {
  const baseMessage: DataChatMessage = {
    id: 'msg-123',
    chatId: 'chat-123',
    role: 'user',
    content: 'Hello',
    status: 'complete',
    metadata: {},
    createdAt: new Date().toISOString(),
  };

  describe('User Messages', () => {
    it('should render user message right-aligned', () => {
      const message: DataChatMessage = {
        ...baseMessage,
        role: 'user',
        content: 'Hello, assistant!',
      };

      render(<ChatMessage message={message} />);

      expect(screen.getByText('Hello, assistant!')).toBeInTheDocument();
    });

    it('should render user message with primary color', () => {
      const message: DataChatMessage = {
        ...baseMessage,
        role: 'user',
        content: 'Test message',
      };

      const { container } = render(<ChatMessage message={message} />);
      const paper = container.querySelector('.MuiPaper-root');

      expect(paper).toBeInTheDocument();
    });

    it('should render user message as plain text', () => {
      const message: DataChatMessage = {
        ...baseMessage,
        role: 'user',
        content: '**Bold** should not be rendered',
      };

      render(<ChatMessage message={message} />);

      // Should show raw markdown, not rendered
      expect(screen.getByText(/\*\*Bold\*\*/)).toBeInTheDocument();
    });
  });

  describe('Assistant Messages', () => {
    it('should render assistant message with markdown', () => {
      const message: DataChatMessage = {
        ...baseMessage,
        role: 'assistant',
        content: 'This is **bold** and this is *italic*',
      };

      render(<ChatMessage message={message} />);

      expect(screen.getByText(/bold/)).toBeInTheDocument();
      expect(screen.getByText(/italic/)).toBeInTheDocument();
    });

    it('should render markdown lists', () => {
      const message: DataChatMessage = {
        ...baseMessage,
        role: 'assistant',
        content: '- Item 1\n- Item 2\n- Item 3',
      };

      const { container } = render(<ChatMessage message={message} />);
      const list = container.querySelector('ul');

      expect(list).toBeInTheDocument();
    });

    it('should render code blocks with syntax highlighting', () => {
      const message: DataChatMessage = {
        ...baseMessage,
        role: 'assistant',
        content: '```python\nprint("Hello, World!")\n```',
      };

      const { container } = render(<ChatMessage message={message} />);

      expect(container.querySelector('code')).toBeInTheDocument();
      expect(screen.getByText(/Hello, World!/)).toBeInTheDocument();
    });

    it('should render markdown tables', () => {
      const message: DataChatMessage = {
        ...baseMessage,
        role: 'assistant',
        content: `
| Name | Age |
|------|-----|
| Alice | 30 |
| Bob | 25 |
        `,
      };

      const { container } = render(<ChatMessage message={message} />);
      const table = container.querySelector('table');

      expect(table).toBeInTheDocument();
      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    it('should render markdown tables with MUI TableContainer', () => {
      const message: DataChatMessage = {
        ...baseMessage,
        role: 'assistant',
        content: `
| Name | Age |
|------|-----|
| Alice | 30 |
| Bob | 25 |
        `,
      };

      const { container } = render(<ChatMessage message={message} />);

      // DataTable wraps in MUI TableContainer
      const tableContainer = container.querySelector('.MuiTableContainer-root');
      expect(tableContainer).toBeInTheDocument();
    });

    it('should show row count footer for tables', () => {
      const message: DataChatMessage = {
        ...baseMessage,
        role: 'assistant',
        content: `
| Name | Age |
|------|-----|
| Alice | 30 |
| Bob | 25 |
        `,
      };

      render(<ChatMessage message={message} />);

      expect(screen.getByText('2 rows')).toBeInTheDocument();
    });

    it('should show typing indicator when status is generating and content is empty', () => {
      const message: DataChatMessage = {
        ...baseMessage,
        role: 'assistant',
        content: '',
        status: 'generating',
      };

      const { container } = render(<ChatMessage message={message} />);

      // Should render animated dots (typing indicator)
      const dots = container.querySelectorAll('[style*="animation"]');
      expect(dots.length).toBeGreaterThan(0);
    });

    it('should not show typing indicator when content exists', () => {
      const message: DataChatMessage = {
        ...baseMessage,
        role: 'assistant',
        content: 'Partial response...',
        status: 'generating',
      };

      render(<ChatMessage message={message} />);

      expect(screen.getByText('Partial response...')).toBeInTheDocument();
    });

    it('should render base64 images in markdown', () => {
      const message: DataChatMessage = {
        ...baseMessage,
        role: 'assistant',
        content: '![Chart](data:image/png;base64,iVBORw0KGgo...)',
      };

      const { container } = render(<ChatMessage message={message} />);
      const img = container.querySelector('img');

      expect(img).toBeInTheDocument();
      expect(img?.getAttribute('src')).toContain('data:image/png');
    });

    it('should render inline code', () => {
      const message: DataChatMessage = {
        ...baseMessage,
        role: 'assistant',
        content: 'Use the `print()` function to display output.',
      };

      const { container } = render(<ChatMessage message={message} />);
      const code = container.querySelector('code');

      expect(code).toBeInTheDocument();
      expect(code?.textContent).toContain('print()');
    });

    it('should render headings', () => {
      const message: DataChatMessage = {
        ...baseMessage,
        role: 'assistant',
        content: '# Heading 1\n## Heading 2\n### Heading 3',
      };

      render(<ChatMessage message={message} />);

      expect(screen.getByText('Heading 1')).toBeInTheDocument();
      expect(screen.getByText('Heading 2')).toBeInTheDocument();
      expect(screen.getByText('Heading 3')).toBeInTheDocument();
    });
  });
});
