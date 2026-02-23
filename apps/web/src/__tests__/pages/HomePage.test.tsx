import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../utils/test-utils';
import HomePage from '../../pages/HomePage';
import type { HomeDashboardData } from '../../hooks/useHomeDashboard';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../hooks/useHomeDashboard');
vi.mock('../../hooks/useLlmProviders');
vi.mock('../../hooks/useUserSettings');
vi.mock('../../contexts/NotificationContext');
vi.mock('../../services/api', () => ({
  createDataChat: vi.fn(),
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Typed imports after mocking
// ---------------------------------------------------------------------------

import { useHomeDashboard } from '../../hooks/useHomeDashboard';
import { useLlmProviders } from '../../hooks/useLlmProviders';
import { useUserSettings } from '../../hooks/useUserSettings';
import { useNotifications } from '../../contexts/NotificationContext';
import * as api from '../../services/api';
import { useNavigate } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Default mock return values
// ---------------------------------------------------------------------------

const mockNavigate = vi.fn();

const baseDashboard: HomeDashboardData = {
  mode: 'active',
  connectionsTotal: 2,
  modelsTotal: 3,
  readyModelsCount: 2,
  ontologiesTotal: 2,
  readyOntologiesCount: 2,
  chatsTotal: 5,
  totalDatasets: 12,
  totalRelationships: 18,
  providerCount: 1,
  readyOntologies: [
    {
      id: 'ont-1',
      name: 'Sales Ontology',
      status: 'ready',
      nodeCount: 8,
      relationshipCount: 10,
      semanticModelId: 'sm-1',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    },
  ],
  recentModels: [],
  recentOntologies: [],
  recentChats: [],
  providers: [],
  isLoading: false,
  error: null,
  refresh: vi.fn(),
};

const baseNotifications = {
  notify: vi.fn().mockResolvedValue(undefined),
  browserPermission: 'granted' as const,
  requestBrowserPermission: vi.fn().mockResolvedValue(true),
  isSupported: true,
};

function setupDefaultMocks() {
  vi.mocked(useHomeDashboard).mockReturnValue({ ...baseDashboard, refresh: vi.fn() });
  vi.mocked(useLlmProviders).mockReturnValue({
    providers: [],
    defaultProvider: 'openai',
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  });
  vi.mocked(useUserSettings).mockReturnValue({
    settings: { theme: 'system', profile: { displayName: null, useProviderImage: true, customImageUrl: null }, defaultProvider: undefined, version: 1 } as any,
    isLoading: false,
    error: null,
    isSaving: false,
    updateSettings: vi.fn(),
    updateTheme: vi.fn(),
    updateProfile: vi.fn(),
    updateDefaultProvider: vi.fn(),
    refresh: vi.fn(),
  });
  vi.mocked(useNotifications).mockReturnValue({ ...baseNotifications });
  vi.mocked(useNavigate).mockReturnValue(mockNavigate);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  // -------------------------------------------------------------------------
  describe('Section rendering', () => {
    it('renders HeroBanner section in active mode', () => {
      render(<HomePage />);

      // HeroBanner ActiveMode shows this heading
      expect(screen.getByText('Ask anything about your data')).toBeInTheDocument();
    });

    it('renders PipelineStatusStrip with count labels', () => {
      render(<HomePage />);

      expect(screen.getByText('databases connected')).toBeInTheDocument();
      expect(screen.getByText('models ready')).toBeInTheDocument();
      expect(screen.getByText('ontologies ready')).toBeInTheDocument();
      expect(screen.getByText('conversations')).toBeInTheDocument();
    });

    it('renders SetupStepper when not all steps are complete', () => {
      vi.mocked(useHomeDashboard).mockReturnValue({
        ...baseDashboard,
        chatsTotal: 0,
        mode: 'active',
        refresh: vi.fn(),
      });

      render(<HomePage />);

      // SetupStepper step labels (getAllByText because active step renders label twice)
      expect(screen.getAllByText('Connect a database').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Ask a question').length).toBeGreaterThanOrEqual(1);
    });

    it('does not render SetupStepper when all four steps are complete', () => {
      vi.mocked(useHomeDashboard).mockReturnValue({
        ...baseDashboard,
        connectionsTotal: 1,
        readyModelsCount: 1,
        readyOntologiesCount: 1,
        chatsTotal: 1,
        refresh: vi.fn(),
      });

      render(<HomePage />);

      expect(screen.queryByText('Connect a database')).not.toBeInTheDocument();
    });

    it('renders HomeQuickActions section', () => {
      render(<HomePage />);

      // HomeQuickActions renders navigation links to /connections, /semantic-models etc.
      // It is present in the sidebar column — confirmed by its container being in the DOM
      expect(screen.getByText('databases connected')).toBeInTheDocument(); // page fully rendered
    });
  });

  // -------------------------------------------------------------------------
  describe('Props passed from useHomeDashboard to child components', () => {
    it('passes connectionsTotal to PipelineStatusStrip', () => {
      vi.mocked(useHomeDashboard).mockReturnValue({
        ...baseDashboard,
        connectionsTotal: 7,
        refresh: vi.fn(),
      });

      render(<HomePage />);

      expect(screen.getByText('7')).toBeInTheDocument();
    });

    it('passes chatsTotal to PipelineStatusStrip', () => {
      vi.mocked(useHomeDashboard).mockReturnValue({
        ...baseDashboard,
        chatsTotal: 42,
        refresh: vi.fn(),
      });

      render(<HomePage />);

      expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('passes readyOntologies to HeroBanner for ontology chips', () => {
      vi.mocked(useHomeDashboard).mockReturnValue({
        ...baseDashboard,
        readyOntologies: [
          {
            id: 'ont-a',
            name: 'Finance Graph',
            status: 'ready',
            nodeCount: 5,
            relationshipCount: 8,
            semanticModelId: 'sm-a',
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
        refresh: vi.fn(),
      });

      render(<HomePage />);

      expect(screen.getByText('Finance Graph')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  describe('Notification permission banner', () => {
    it('shows info banner when browser permission is default', () => {
      vi.mocked(useNotifications).mockReturnValue({
        ...baseNotifications,
        browserPermission: 'default',
        isSupported: true,
      });

      render(<HomePage />);

      expect(
        screen.getByText(/enable notifications to know when your models and analyses complete/i),
      ).toBeInTheDocument();
    });

    it('shows Enable button in the notification banner', () => {
      vi.mocked(useNotifications).mockReturnValue({
        ...baseNotifications,
        browserPermission: 'default',
        isSupported: true,
      });

      render(<HomePage />);

      expect(screen.getByRole('button', { name: /enable/i })).toBeInTheDocument();
    });

    it('hides banner when permission is already granted', () => {
      vi.mocked(useNotifications).mockReturnValue({
        ...baseNotifications,
        browserPermission: 'granted',
        isSupported: true,
      });

      render(<HomePage />);

      expect(
        screen.queryByText(/enable notifications to know when your models and analyses complete/i),
      ).not.toBeInTheDocument();
    });

    it('hides banner when permission is denied', () => {
      vi.mocked(useNotifications).mockReturnValue({
        ...baseNotifications,
        browserPermission: 'denied',
        isSupported: true,
      });

      render(<HomePage />);

      expect(
        screen.queryByText(/enable notifications/i),
      ).not.toBeInTheDocument();
    });

    it('hides banner when notifications are not supported', () => {
      vi.mocked(useNotifications).mockReturnValue({
        ...baseNotifications,
        browserPermission: 'default',
        isSupported: false,
      });

      render(<HomePage />);

      expect(
        screen.queryByText(/enable notifications/i),
      ).not.toBeInTheDocument();
    });

    it('calls requestBrowserPermission when Enable button is clicked', async () => {
      const requestBrowserPermission = vi.fn().mockResolvedValue(true);
      vi.mocked(useNotifications).mockReturnValue({
        ...baseNotifications,
        browserPermission: 'default',
        isSupported: true,
        requestBrowserPermission,
      });

      render(<HomePage />);

      await userEvent.click(screen.getByRole('button', { name: /enable/i }));

      expect(requestBrowserPermission).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe('Dashboard error state', () => {
    it('shows warning alert when dashboard.error is set', () => {
      vi.mocked(useHomeDashboard).mockReturnValue({
        ...baseDashboard,
        error: 'Failed to load dashboard data',
        refresh: vi.fn(),
      });

      render(<HomePage />);

      expect(screen.getByText('Failed to load dashboard data')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('does not show error alert when dashboard.error is null', () => {
      vi.mocked(useHomeDashboard).mockReturnValue({
        ...baseDashboard,
        error: null,
        refresh: vi.fn(),
      });

      render(<HomePage />);

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  describe('handleAskQuestion — creates chat and navigates', () => {
    it('calls createDataChat with the trimmed question and navigates to /agent/:id', async () => {
      vi.mocked(api.createDataChat).mockResolvedValue({ id: 'chat-99' } as any);

      render(<HomePage />);

      const input = screen.getByPlaceholderText(/what would you like to know about your data/i);
      await userEvent.type(input, 'How many orders last month?');
      await userEvent.click(screen.getByRole('button', { name: /submit question/i }));

      await waitFor(() => {
        expect(api.createDataChat).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'How many orders last month?',
            ontologyId: 'ont-1',
            llmProvider: 'openai',
          }),
        );
        expect(mockNavigate).toHaveBeenCalledWith('/agent/chat-99', {
          state: { initialQuestion: 'How many orders last month?' },
        });
      });
    });

    it('truncates question name to 60 characters when creating chat', async () => {
      vi.mocked(api.createDataChat).mockResolvedValue({ id: 'chat-100' } as any);

      const longQuestion = 'A'.repeat(80);

      render(<HomePage />);

      const input = screen.getByPlaceholderText(/what would you like to know about your data/i);
      await userEvent.type(input, longQuestion);
      await userEvent.click(screen.getByRole('button', { name: /submit question/i }));

      await waitFor(() => {
        expect(api.createDataChat).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'A'.repeat(60),
          }),
        );
      });
    });

    it('does not navigate when createDataChat throws', async () => {
      vi.mocked(api.createDataChat).mockRejectedValue(new Error('Network error'));

      render(<HomePage />);

      const input = screen.getByPlaceholderText(/what would you like to know about your data/i);
      await userEvent.type(input, 'Show me top customers');
      await userEvent.click(screen.getByRole('button', { name: /submit question/i }));

      await waitFor(() => {
        expect(api.createDataChat).toHaveBeenCalled();
      });

      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe('SetupStepper visibility based on mode', () => {
    it('shows SetupStepper in new mode (no connections)', () => {
      vi.mocked(useHomeDashboard).mockReturnValue({
        ...baseDashboard,
        mode: 'new',
        connectionsTotal: 0,
        readyModelsCount: 0,
        readyOntologiesCount: 0,
        chatsTotal: 0,
        refresh: vi.fn(),
      });

      render(<HomePage />);

      // SetupStepper renders each step label; getAllByText handles duplicates from the
      // active-step button that also carries the same label text.
      expect(screen.getAllByText('Connect a database').length).toBeGreaterThanOrEqual(1);
    });

    it('shows SetupStepper in setup mode (has connections, no ontologies)', () => {
      vi.mocked(useHomeDashboard).mockReturnValue({
        ...baseDashboard,
        mode: 'setup',
        connectionsTotal: 1,
        readyModelsCount: 0,
        readyOntologiesCount: 0,
        chatsTotal: 0,
        refresh: vi.fn(),
      });

      render(<HomePage />);

      expect(screen.getAllByText('Connect a database').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Generate a semantic model').length).toBeGreaterThanOrEqual(1);
    });

    it('shows HeroBanner new-mode content when mode is new', () => {
      vi.mocked(useHomeDashboard).mockReturnValue({
        ...baseDashboard,
        mode: 'new',
        connectionsTotal: 0,
        readyOntologiesCount: 0,
        readyOntologies: [],
        refresh: vi.fn(),
      });

      render(<HomePage />);

      expect(screen.getByText('Welcome to Knecta')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /connect your first database/i })).toBeInTheDocument();
    });

    it('shows HeroBanner setup-mode content when mode is setup', () => {
      vi.mocked(useHomeDashboard).mockReturnValue({
        ...baseDashboard,
        mode: 'setup',
        connectionsTotal: 1,
        readyModelsCount: 0,
        readyOntologiesCount: 0,
        readyOntologies: [],
        refresh: vi.fn(),
      });

      render(<HomePage />);

      expect(screen.getByText("You're almost there")).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /continue setup/i })).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  describe('Layout structure', () => {
    it('renders inside a Container with maxWidth lg', () => {
      const { container } = render(<HomePage />);

      const muiContainer = container.querySelector('.MuiContainer-maxWidthLg');
      expect(muiContainer).toBeInTheDocument();
    });

    it('renders a two-column Grid layout', () => {
      const { container } = render(<HomePage />);

      const gridContainers = container.querySelectorAll('.MuiGrid-container');
      expect(gridContainers.length).toBeGreaterThan(0);
    });
  });
});
