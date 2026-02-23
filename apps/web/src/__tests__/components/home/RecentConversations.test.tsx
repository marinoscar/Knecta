import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../../utils/test-utils';
import { RecentConversations } from '../../../components/home/RecentConversations';
import type { DataChat } from '../../../types';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const now = new Date();
const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();

const mockChats: DataChat[] = [
  {
    id: 'chat-1',
    name: 'Revenue Analysis Q4',
    ontologyId: 'ont-1',
    ownerId: 'user-1',
    createdAt: oneHourAgo,
    updatedAt: oneHourAgo,
    ontology: {
      id: 'ont-1',
      name: 'Sales DB',
      status: 'ready',
      datasetCount: 5,
      semanticModelId: 'sm-1',
    },
  },
  {
    id: 'chat-2',
    name: 'Inventory Check',
    ontologyId: 'ont-2',
    ownerId: 'user-1',
    createdAt: twoDaysAgo,
    updatedAt: twoDaysAgo,
    ontology: {
      id: 'ont-2',
      name: 'Inventory DB',
      status: 'ready',
      datasetCount: 3,
      semanticModelId: 'sm-2',
    },
  },
  {
    id: 'chat-3',
    name: 'Quick Question',
    ontologyId: 'ont-1',
    ownerId: 'user-1',
    createdAt: twoDaysAgo,
    updatedAt: twoDaysAgo,
    // No ontology property on this one
  },
];

describe('RecentConversations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders the section heading', () => {
      render(<RecentConversations chats={mockChats} />);

      expect(screen.getByText('Recent Conversations')).toBeInTheDocument();
    });

    it('renders chat list items with names', () => {
      render(<RecentConversations chats={mockChats} />);

      expect(screen.getByText('Revenue Analysis Q4')).toBeInTheDocument();
      expect(screen.getByText('Inventory Check')).toBeInTheDocument();
      expect(screen.getByText('Quick Question')).toBeInTheDocument();
    });

    it('renders relative timestamps for each chat', () => {
      render(<RecentConversations chats={mockChats} />);

      // The formatted relative time should appear (e.g. "1h ago" or "2d ago")
      const timeElements = screen.getAllByText(/ago|just now/i);
      expect(timeElements.length).toBeGreaterThanOrEqual(2);
    });

    it('shows ontology chip when ontology is present', () => {
      render(<RecentConversations chats={mockChats} />);

      expect(screen.getByText('Sales DB')).toBeInTheDocument();
      expect(screen.getByText('Inventory DB')).toBeInTheDocument();
    });

    it('does not show an ontology chip when ontology is absent', () => {
      const chatsWithoutOntology: DataChat[] = [
        {
          id: 'chat-no-ont',
          name: 'No Ontology Chat',
          ontologyId: 'ont-1',
          ownerId: 'user-1',
          createdAt: oneHourAgo,
          updatedAt: oneHourAgo,
        },
      ];

      const { container } = render(<RecentConversations chats={chatsWithoutOntology} />);

      // Should render no Chips (there are no ontology chips)
      const chips = container.querySelectorAll('.MuiChip-root');
      expect(chips).toHaveLength(0);
    });

    it('renders the "View all conversations" button', () => {
      render(<RecentConversations chats={mockChats} />);

      expect(
        screen.getByRole('button', { name: /view all conversations/i }),
      ).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('shows loading skeletons when isLoading is true', () => {
      const { container } = render(
        <RecentConversations chats={[]} isLoading />,
      );

      const skeletons = container.querySelectorAll('.MuiSkeleton-root');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('does not show chat names when isLoading is true', () => {
      render(<RecentConversations chats={mockChats} isLoading />);

      expect(screen.queryByText('Revenue Analysis Q4')).not.toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows empty state message when there are no chats', () => {
      render(<RecentConversations chats={[]} />);

      expect(
        screen.getByText(/no conversations yet/i),
      ).toBeInTheDocument();
    });

    it('does not show "View all conversations" button in empty state', () => {
      render(<RecentConversations chats={[]} />);

      expect(
        screen.queryByRole('button', { name: /view all conversations/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe('navigation', () => {
    it('navigates to /agent/:id when a chat item is clicked', async () => {
      const user = userEvent.setup();

      render(<RecentConversations chats={mockChats} />);

      await user.click(screen.getByText('Revenue Analysis Q4'));

      expect(mockNavigate).toHaveBeenCalledWith('/agent/chat-1');
    });

    it('navigates to /agent when "View all conversations" is clicked', async () => {
      const user = userEvent.setup();

      render(<RecentConversations chats={mockChats} />);

      await user.click(screen.getByRole('button', { name: /view all conversations/i }));

      expect(mockNavigate).toHaveBeenCalledWith('/agent');
    });

    it('navigates to correct chat id when second item is clicked', async () => {
      const user = userEvent.setup();

      render(<RecentConversations chats={mockChats} />);

      await user.click(screen.getByText('Inventory Check'));

      expect(mockNavigate).toHaveBeenCalledWith('/agent/chat-2');
    });
  });
});
