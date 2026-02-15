import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render, mockUser } from '../../utils/test-utils';
import { DefaultProviderSettings } from '../../../components/settings/DefaultProviderSettings';
import type { LLMProviderInfo } from '../../../types';
import * as api from '../../../services/api';

vi.mock('../../../services/api', () => ({
  getLlmProviders: vi.fn(),
}));

describe('DefaultProviderSettings', () => {
  const mockOnProviderChange = vi.fn();

  const mockProviders: LLMProviderInfo[] = [
    { name: 'openai', enabled: true, model: 'gpt-4', isDefault: true },
    { name: 'anthropic', enabled: true, model: 'claude-3-5-sonnet-20241022', isDefault: false },
    { name: 'azure', enabled: true, model: 'gpt-4', isDefault: false },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnProviderChange.mockResolvedValue(undefined);
    vi.mocked(api.getLlmProviders).mockResolvedValue({
      providers: mockProviders,
    });
  });

  describe('Rendering', () => {
    it('renders "System Default" option', async () => {
      render(
        <DefaultProviderSettings
          currentProvider={undefined}
          onProviderChange={mockOnProviderChange}
        />,
        { wrapperOptions: { user: mockUser } }
      );

      await waitFor(() => {
        expect(screen.getByText('System Default')).toBeInTheDocument();
      });
    });

    it('renders enabled providers with display names', async () => {
      render(
        <DefaultProviderSettings
          currentProvider={undefined}
          onProviderChange={mockOnProviderChange}
        />,
        { wrapperOptions: { user: mockUser } }
      );

      await waitFor(() => {
        expect(screen.getByText('Default AI Provider')).toBeInTheDocument();
      });

      // Click the select to open the dropdown
      const select = screen.getByRole('combobox');
      await userEvent.click(select);

      // Check that all providers are shown
      await waitFor(() => {
        expect(screen.getByText('OpenAI')).toBeInTheDocument();
        expect(screen.getByText('Anthropic')).toBeInTheDocument();
        expect(screen.getByText('Azure OpenAI')).toBeInTheDocument();
      });
    });

    it('shows provider model names in dropdown', async () => {
      render(
        <DefaultProviderSettings
          currentProvider={undefined}
          onProviderChange={mockOnProviderChange}
        />,
        { wrapperOptions: { user: mockUser } }
      );

      await waitFor(() => {
        expect(screen.getByText('Default AI Provider')).toBeInTheDocument();
      });

      // Click the select to open the dropdown
      const select = screen.getByRole('combobox');
      await userEvent.click(select);

      // Check that model names are shown (using getAllByText for duplicates)
      await waitFor(() => {
        const gpt4Elements = screen.getAllByText('gpt-4');
        expect(gpt4Elements.length).toBeGreaterThan(0);

        const claudeElements = screen.getAllByText('claude-3-5-sonnet-20241022');
        expect(claudeElements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Current Provider Selection', () => {
    it('shows current provider as selected', async () => {
      render(
        <DefaultProviderSettings
          currentProvider="anthropic"
          onProviderChange={mockOnProviderChange}
        />,
        { wrapperOptions: { user: mockUser } }
      );

      await waitFor(() => {
        const select = screen.getByRole('combobox');
        expect(select).toHaveTextContent('Anthropic');
      });
    });

    it('shows System Default when currentProvider is undefined', async () => {
      render(
        <DefaultProviderSettings
          currentProvider={undefined}
          onProviderChange={mockOnProviderChange}
        />,
        { wrapperOptions: { user: mockUser } }
      );

      await waitFor(() => {
        const select = screen.getByRole('combobox');
        expect(select).toHaveTextContent('System Default');
      });
    });
  });

  describe('Provider Change', () => {
    it('calls onProviderChange when selection changes', async () => {
      const user = userEvent.setup();

      render(
        <DefaultProviderSettings
          currentProvider={undefined}
          onProviderChange={mockOnProviderChange}
        />,
        { wrapperOptions: { user: mockUser } }
      );

      await waitFor(() => {
        expect(screen.getByText('Default AI Provider')).toBeInTheDocument();
      });

      // Click the select to open the dropdown
      const select = screen.getByRole('combobox');
      await user.click(select);

      // Select OpenAI
      const openaiOption = screen.getByText('OpenAI');
      await user.click(openaiOption);

      await waitFor(() => {
        expect(mockOnProviderChange).toHaveBeenCalledWith('openai');
      });
    });

    it('calls onProviderChange with undefined when System Default is selected', async () => {
      const user = userEvent.setup();

      render(
        <DefaultProviderSettings
          currentProvider="openai"
          onProviderChange={mockOnProviderChange}
        />,
        { wrapperOptions: { user: mockUser } }
      );

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toHaveTextContent('OpenAI');
      });

      // Click the select to open the dropdown
      const select = screen.getByRole('combobox');
      await user.click(select);

      // Select System Default
      const systemDefaultOption = screen.getByText('System Default');
      await user.click(systemDefaultOption);

      await waitFor(() => {
        expect(mockOnProviderChange).toHaveBeenCalledWith(undefined);
      });
    });
  });

  describe('Loading State', () => {
    it('shows loading spinner while fetching providers', () => {
      vi.mocked(api.getLlmProviders).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(
        <DefaultProviderSettings
          currentProvider={undefined}
          onProviderChange={mockOnProviderChange}
        />,
        { wrapperOptions: { user: mockUser } }
      );

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('hides loading spinner after providers load', async () => {
      render(
        <DefaultProviderSettings
          currentProvider={undefined}
          onProviderChange={mockOnProviderChange}
        />,
        { wrapperOptions: { user: mockUser } }
      );

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });
    });
  });

  describe('Disabled State', () => {
    it('disables select when disabled prop is true', async () => {
      render(
        <DefaultProviderSettings
          currentProvider={undefined}
          onProviderChange={mockOnProviderChange}
          disabled={true}
        />,
        { wrapperOptions: { user: mockUser } }
      );

      await waitFor(() => {
        expect(screen.getByText('Default AI Provider')).toBeInTheDocument();
      });

      const select = screen.getByRole('combobox');
      expect(select).toHaveAttribute('aria-disabled', 'true');
    });
  });

  describe('Error Handling', () => {
    it('displays error message when provider fetch fails', async () => {
      vi.mocked(api.getLlmProviders).mockRejectedValue(
        new Error('Failed to load providers')
      );

      render(
        <DefaultProviderSettings
          currentProvider={undefined}
          onProviderChange={mockOnProviderChange}
        />,
        { wrapperOptions: { user: mockUser } }
      );

      await waitFor(() => {
        expect(screen.getByText('Failed to load providers')).toBeInTheDocument();
      });
    });

    it('displays error message when onProviderChange fails', async () => {
      const user = userEvent.setup();
      mockOnProviderChange.mockRejectedValue(new Error('Failed to update provider'));

      render(
        <DefaultProviderSettings
          currentProvider={undefined}
          onProviderChange={mockOnProviderChange}
        />,
        { wrapperOptions: { user: mockUser } }
      );

      await waitFor(() => {
        expect(screen.getByText('Default AI Provider')).toBeInTheDocument();
      });

      // Click the select to open the dropdown
      const select = screen.getByRole('combobox');
      await user.click(select);

      // Select OpenAI
      const openaiOption = screen.getByText('OpenAI');
      await user.click(openaiOption);

      await waitFor(() => {
        expect(screen.getByText('Failed to update provider')).toBeInTheDocument();
      });
    });
  });

  describe('Filtered Providers', () => {
    it('only shows enabled providers', async () => {
      vi.mocked(api.getLlmProviders).mockResolvedValue({
        providers: [
          { name: 'openai', enabled: true, model: 'gpt-4', isDefault: true },
          { name: 'anthropic', enabled: false, model: 'claude-3-5-sonnet-20241022', isDefault: false },
        ],
      });

      render(
        <DefaultProviderSettings
          currentProvider={undefined}
          onProviderChange={mockOnProviderChange}
        />,
        { wrapperOptions: { user: mockUser } }
      );

      await waitFor(() => {
        expect(screen.getByText('Default AI Provider')).toBeInTheDocument();
      });

      // Click the select to open the dropdown
      const select = screen.getByRole('combobox');
      await userEvent.click(select);

      // OpenAI should be shown
      await waitFor(() => {
        expect(screen.getByText('OpenAI')).toBeInTheDocument();
      });

      // Anthropic should not be shown (disabled)
      expect(screen.queryByText('Anthropic')).not.toBeInTheDocument();
    });
  });
});
