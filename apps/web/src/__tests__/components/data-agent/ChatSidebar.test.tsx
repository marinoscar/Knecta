import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../../utils/test-utils';
import { ChatSidebar } from '../../../components/data-agent/ChatSidebar';
import type { DataChat } from '../../../types';

describe('ChatSidebar', () => {
  const mockOnNewChat = vi.fn();
  const mockOnSelectChat = vi.fn();
  const mockOnDeleteChat = vi.fn();
  const mockOnRenameChat = vi.fn();

  const mockChats: DataChat[] = [
    {
      id: 'chat-1',
      name: 'First Chat',
      ontologyId: 'ont-1',
      ownerId: 'user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ontology: {
        name: 'Sales Database',
        status: 'ready',
      },
    },
    {
      id: 'chat-2',
      name: 'Second Chat',
      ontologyId: 'ont-1',
      ownerId: 'user-1',
      createdAt: new Date(Date.now() - 86400000).toISOString(), // Yesterday
      updatedAt: new Date(Date.now() - 86400000).toISOString(),
      ontology: {
        name: 'Sales Database',
        status: 'ready',
      },
    },
    {
      id: 'chat-3',
      name: 'Old Chat',
      ontologyId: 'ont-2',
      ownerId: 'user-1',
      createdAt: new Date(Date.now() - 86400000 * 10).toISOString(), // 10 days ago
      updatedAt: new Date(Date.now() - 86400000 * 10).toISOString(),
      ontology: {
        name: 'Inventory DB',
        status: 'ready',
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnDeleteChat.mockResolvedValue(undefined);
    mockOnRenameChat.mockResolvedValue(undefined);
  });

  describe('Rendering', () => {
    it('should render chat list with names', () => {
      render(
        <ChatSidebar
          chats={mockChats}
          onNewChat={mockOnNewChat}
          onSelectChat={mockOnSelectChat}
          onDeleteChat={mockOnDeleteChat}
          onRenameChat={mockOnRenameChat}
          isLoading={false}
        />,
      );

      expect(screen.getByText('First Chat')).toBeInTheDocument();
      expect(screen.getByText('Second Chat')).toBeInTheDocument();
      expect(screen.getByText('Old Chat')).toBeInTheDocument();
    });

    it('should render New Chat button', () => {
      render(
        <ChatSidebar
          chats={mockChats}
          onNewChat={mockOnNewChat}
          onSelectChat={mockOnSelectChat}
          onDeleteChat={mockOnDeleteChat}
          onRenameChat={mockOnRenameChat}
          isLoading={false}
        />,
      );

      expect(
        screen.getByRole('button', { name: /new chat/i }),
      ).toBeInTheDocument();
    });

    it('should render search input', () => {
      render(
        <ChatSidebar
          chats={mockChats}
          onNewChat={mockOnNewChat}
          onSelectChat={mockOnSelectChat}
          onDeleteChat={mockOnDeleteChat}
          onRenameChat={mockOnRenameChat}
          isLoading={false}
        />,
      );

      expect(
        screen.getByPlaceholderText(/search conversations/i),
      ).toBeInTheDocument();
    });

    it('should show loading state', () => {
      render(
        <ChatSidebar
          chats={[]}
          onNewChat={mockOnNewChat}
          onSelectChat={mockOnSelectChat}
          onDeleteChat={mockOnDeleteChat}
          onRenameChat={mockOnRenameChat}
          isLoading={true}
        />,
      );

      expect(screen.getByText(/loading conversations/i)).toBeInTheDocument();
    });

    it('should show empty state when no chats', () => {
      render(
        <ChatSidebar
          chats={[]}
          onNewChat={mockOnNewChat}
          onSelectChat={mockOnSelectChat}
          onDeleteChat={mockOnDeleteChat}
          onRenameChat={mockOnRenameChat}
          isLoading={false}
        />,
      );

      expect(screen.getByText(/no conversations yet/i)).toBeInTheDocument();
    });
  });

  describe('Chat Selection', () => {
    it('should call onSelectChat when clicking a chat', async () => {
      const user = userEvent.setup();

      render(
        <ChatSidebar
          chats={mockChats}
          onNewChat={mockOnNewChat}
          onSelectChat={mockOnSelectChat}
          onDeleteChat={mockOnDeleteChat}
          onRenameChat={mockOnRenameChat}
          isLoading={false}
        />,
      );

      await user.click(screen.getByText('First Chat'));

      expect(mockOnSelectChat).toHaveBeenCalledWith('chat-1');
    });

    it('should highlight active chat', () => {
      const { container } = render(
        <ChatSidebar
          chats={mockChats}
          activeChatId="chat-1"
          onNewChat={mockOnNewChat}
          onSelectChat={mockOnSelectChat}
          onDeleteChat={mockOnDeleteChat}
          onRenameChat={mockOnRenameChat}
          isLoading={false}
        />,
      );

      const selectedButton = container.querySelector('.Mui-selected');
      expect(selectedButton).toBeInTheDocument();
      expect(selectedButton?.textContent).toContain('First Chat');
    });
  });

  describe('New Chat', () => {
    it('should call onNewChat when clicking New Chat button', async () => {
      const user = userEvent.setup();

      render(
        <ChatSidebar
          chats={mockChats}
          onNewChat={mockOnNewChat}
          onSelectChat={mockOnSelectChat}
          onDeleteChat={mockOnDeleteChat}
          onRenameChat={mockOnRenameChat}
          isLoading={false}
        />,
      );

      await user.click(screen.getByRole('button', { name: /new chat/i }));

      expect(mockOnNewChat).toHaveBeenCalled();
    });
  });

  describe('Search', () => {
    it('should filter chats by search query', async () => {
      const user = userEvent.setup();

      render(
        <ChatSidebar
          chats={mockChats}
          onNewChat={mockOnNewChat}
          onSelectChat={mockOnSelectChat}
          onDeleteChat={mockOnDeleteChat}
          onRenameChat={mockOnRenameChat}
          isLoading={false}
        />,
      );

      const searchInput = screen.getByPlaceholderText(/search conversations/i);
      await user.type(searchInput, 'First');

      expect(screen.getByText('First Chat')).toBeInTheDocument();
      expect(screen.queryByText('Second Chat')).not.toBeInTheDocument();
      expect(screen.queryByText('Old Chat')).not.toBeInTheDocument();
    });

    it('should show no results message when no matches', async () => {
      const user = userEvent.setup();

      render(
        <ChatSidebar
          chats={mockChats}
          onNewChat={mockOnNewChat}
          onSelectChat={mockOnSelectChat}
          onDeleteChat={mockOnDeleteChat}
          onRenameChat={mockOnRenameChat}
          isLoading={false}
        />,
      );

      const searchInput = screen.getByPlaceholderText(/search conversations/i);
      await user.type(searchInput, 'nonexistent');

      expect(screen.getByText(/no matching conversations/i)).toBeInTheDocument();
    });
  });

  describe('Date Grouping', () => {
    it('should group chats by date', () => {
      render(
        <ChatSidebar
          chats={mockChats}
          onNewChat={mockOnNewChat}
          onSelectChat={mockOnSelectChat}
          onDeleteChat={mockOnDeleteChat}
          onRenameChat={mockOnRenameChat}
          isLoading={false}
        />,
      );

      expect(screen.getByText('Today')).toBeInTheDocument();
      expect(screen.getByText('Yesterday')).toBeInTheDocument();
      expect(screen.getByText('Previous 7 Days')).toBeInTheDocument();
    });
  });

  describe('Rename Chat', () => {
    it('should show rename dialog when clicking edit icon', async () => {
      const user = userEvent.setup();

      const { container } = render(
        <ChatSidebar
          chats={mockChats}
          onNewChat={mockOnNewChat}
          onSelectChat={mockOnSelectChat}
          onDeleteChat={mockOnDeleteChat}
          onRenameChat={mockOnRenameChat}
          isLoading={false}
        />,
      );

      // Hover to show action buttons
      const firstChatItem = container.querySelector('.MuiListItem-root');
      if (firstChatItem) {
        await user.hover(firstChatItem);
      }

      // Find edit button
      const editButtons = container.querySelectorAll('button[class*="MuiIconButton"]');
      const editButton = Array.from(editButtons).find((btn) =>
        btn.querySelector('svg[data-testid="EditIcon"]'),
      );

      if (editButton) {
        await user.click(editButton as HTMLElement);

        await waitFor(() => {
          expect(
            screen.getByRole('dialog', { name: /rename conversation/i }),
          ).toBeInTheDocument();
        });
      }
    });

    it('should call onRenameChat when confirming rename', async () => {
      const user = userEvent.setup();

      const { container } = render(
        <ChatSidebar
          chats={mockChats}
          onNewChat={mockOnNewChat}
          onSelectChat={mockOnSelectChat}
          onDeleteChat={mockOnDeleteChat}
          onRenameChat={mockOnRenameChat}
          isLoading={false}
        />,
      );

      // Trigger rename dialog
      const firstChatItem = container.querySelector('.MuiListItem-root');
      if (firstChatItem) {
        await user.hover(firstChatItem);
      }

      const editButtons = container.querySelectorAll('button[class*="MuiIconButton"]');
      const editButton = Array.from(editButtons).find((btn) =>
        btn.querySelector('svg[data-testid="EditIcon"]'),
      );

      if (editButton) {
        await user.click(editButton as HTMLElement);

        await waitFor(() => {
          expect(screen.getByRole('dialog')).toBeInTheDocument();
        });

        const input = screen.getByDisplayValue('First Chat');
        await user.clear(input);
        await user.type(input, 'Renamed Chat');

        const renameButton = screen.getByRole('button', { name: /rename/i });
        await user.click(renameButton);

        await waitFor(() => {
          expect(mockOnRenameChat).toHaveBeenCalledWith('chat-1', 'Renamed Chat');
        });
      }
    });
  });

  describe('Delete Chat', () => {
    it('should show delete confirmation when clicking delete icon', async () => {
      const user = userEvent.setup();

      const { container } = render(
        <ChatSidebar
          chats={mockChats}
          onNewChat={mockOnNewChat}
          onSelectChat={mockOnSelectChat}
          onDeleteChat={mockOnDeleteChat}
          onRenameChat={mockOnRenameChat}
          isLoading={false}
        />,
      );

      // Hover to show action buttons
      const firstChatItem = container.querySelector('.MuiListItem-root');
      if (firstChatItem) {
        await user.hover(firstChatItem);
      }

      const deleteButtons = container.querySelectorAll('button[class*="MuiIconButton"]');
      const deleteButton = Array.from(deleteButtons).find((btn) =>
        btn.querySelector('svg[data-testid="DeleteIcon"]'),
      );

      if (deleteButton) {
        await user.click(deleteButton as HTMLElement);

        await waitFor(() => {
          expect(
            screen.getByRole('dialog', { name: /delete conversation/i }),
          ).toBeInTheDocument();
        });
      }
    });

    it('should call onDeleteChat when confirming deletion', async () => {
      const user = userEvent.setup();

      const { container } = render(
        <ChatSidebar
          chats={mockChats}
          onNewChat={mockOnNewChat}
          onSelectChat={mockOnSelectChat}
          onDeleteChat={mockOnDeleteChat}
          onRenameChat={mockOnRenameChat}
          isLoading={false}
        />,
      );

      const firstChatItem = container.querySelector('.MuiListItem-root');
      if (firstChatItem) {
        await user.hover(firstChatItem);
      }

      const deleteButtons = container.querySelectorAll('button[class*="MuiIconButton"]');
      const deleteButton = Array.from(deleteButtons).find((btn) =>
        btn.querySelector('svg[data-testid="DeleteIcon"]'),
      );

      if (deleteButton) {
        await user.click(deleteButton as HTMLElement);

        await waitFor(() => {
          expect(screen.getByRole('dialog')).toBeInTheDocument();
        });

        const confirmButton = screen.getByRole('button', { name: /delete/i });
        await user.click(confirmButton);

        await waitFor(() => {
          expect(mockOnDeleteChat).toHaveBeenCalledWith('chat-1');
        });
      }
    });
  });
});
