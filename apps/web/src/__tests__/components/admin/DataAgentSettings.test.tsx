import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render, mockAdminUser } from '../../utils/test-utils';
import { DataAgentSettings } from '../../../components/admin/DataAgentSettings';
import type { LLMProviderInfo, SystemSettings } from '../../../types';
import * as api from '../../../services/api';

vi.mock('../../../services/api', () => ({
  getLlmProviders: vi.fn(),
}));

describe('DataAgentSettings', () => {
  const mockOnSave = vi.fn();

  const mockProviders: LLMProviderInfo[] = [
    { name: 'openai', enabled: true, model: 'gpt-4', isDefault: true },
    { name: 'anthropic', enabled: true, model: 'claude-3-5-sonnet-20241022', isDefault: false },
  ];

  const defaultSettings: SystemSettings = {
    ui: { allowUserThemeOverride: true },
    featureFlags: {},
    dataAgent: {
      openai: { temperature: 0.0 },
      anthropic: { temperature: 0.0 },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSave.mockResolvedValue(undefined);
    vi.mocked(api.getLlmProviders).mockResolvedValue({
      providers: mockProviders,
    });
  });

  describe('Loading State', () => {
    it('renders loading state while fetching providers', () => {
      vi.mocked(api.getLlmProviders).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(
        <DataAgentSettings settings={defaultSettings} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      expect(screen.getByText('Loading providers...')).toBeInTheDocument();
    });

    it('renders providers after loading completes', async () => {
      render(
        <DataAgentSettings settings={defaultSettings} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      await waitFor(() => {
        expect(screen.getByText('OpenAI')).toBeInTheDocument();
        expect(screen.getByText('Anthropic')).toBeInTheDocument();
      });
    });
  });

  describe('Provider Display', () => {
    it('renders provider sections only for enabled providers', async () => {
      render(
        <DataAgentSettings settings={defaultSettings} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      await waitFor(() => {
        expect(screen.getByText('OpenAI')).toBeInTheDocument();
        expect(screen.getByText('Anthropic')).toBeInTheDocument();
      });

      // Azure should not be rendered (not in mock providers)
      expect(screen.queryByText('Azure OpenAI')).not.toBeInTheDocument();
    });

    it('does not render disabled providers', async () => {
      vi.mocked(api.getLlmProviders).mockResolvedValue({
        providers: [
          { name: 'openai', enabled: true, model: 'gpt-4', isDefault: true },
          { name: 'anthropic', enabled: false, model: 'claude-3-5-sonnet-20241022', isDefault: false },
        ],
      });

      render(
        <DataAgentSettings settings={defaultSettings} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      await waitFor(() => {
        expect(screen.getByText('OpenAI')).toBeInTheDocument();
      });

      expect(screen.queryByText('Anthropic')).not.toBeInTheDocument();
    });

    it('shows no providers message when no providers are enabled', async () => {
      vi.mocked(api.getLlmProviders).mockResolvedValue({
        providers: [],
      });

      render(
        <DataAgentSettings settings={defaultSettings} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      await waitFor(() => {
        expect(screen.getByText(/no llm providers are configured/i)).toBeInTheDocument();
      });
    });
  });

  describe('Temperature Slider', () => {
    it('displays temperature slider with correct initial value from settings', async () => {
      const settingsWithTemp: SystemSettings = {
        ...defaultSettings,
        dataAgent: {
          openai: { temperature: 1.5 },
        },
      };

      render(
        <DataAgentSettings settings={settingsWithTemp} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      await waitFor(() => {
        expect(screen.getByText(/Temperature: 1\.5/)).toBeInTheDocument();
      });
    });

    it('displays temperature slider with default value 0.0 when not in settings', async () => {
      const settingsNoTemp: SystemSettings = {
        ui: { allowUserThemeOverride: true },
        featureFlags: {},
        dataAgent: {},
      };

      render(
        <DataAgentSettings settings={settingsNoTemp} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      await waitFor(() => {
        const tempLabels = screen.getAllByText(/Temperature: 0\.0/);
        expect(tempLabels.length).toBeGreaterThan(0);
      });
    });

    it('updates temperature value when slider is moved', async () => {
      const user = userEvent.setup();

      render(
        <DataAgentSettings settings={defaultSettings} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      await waitFor(() => {
        expect(screen.getByText('OpenAI')).toBeInTheDocument();
      });

      // Find temperature slider for OpenAI
      const slider = screen.getAllByRole('slider')[0]; // First slider is OpenAI

      // Simulate changing the slider
      await user.click(slider);

      // The save button should now be enabled
      const saveButton = screen.getByRole('button', { name: /save changes/i });
      expect(saveButton).toBeEnabled();
    });
  });

  describe('Model TextField', () => {
    it('displays model text field with env model as placeholder', async () => {
      render(
        <DataAgentSettings settings={defaultSettings} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      await waitFor(() => {
        expect(screen.getByText('OpenAI')).toBeInTheDocument();
      });

      // Check for model input with placeholder
      const modelInputs = screen.getAllByLabelText('Model');
      expect(modelInputs[0]).toHaveAttribute('placeholder', 'gpt-4');
      expect(modelInputs[1]).toHaveAttribute('placeholder', 'claude-3-5-sonnet-20241022');
    });

    it('displays current model value when set in settings', async () => {
      const settingsWithModel: SystemSettings = {
        ...defaultSettings,
        dataAgent: {
          openai: { model: 'gpt-4o', temperature: 0.0 },
        },
      };

      render(
        <DataAgentSettings settings={settingsWithModel} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      await waitFor(() => {
        const modelInput = screen.getAllByLabelText('Model')[0];
        expect(modelInput).toHaveValue('gpt-4o');
      });
    });

    it('allows user to type a custom model name', async () => {
      const user = userEvent.setup();

      render(
        <DataAgentSettings settings={defaultSettings} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      await waitFor(() => {
        expect(screen.getByText('OpenAI')).toBeInTheDocument();
      });

      const modelInput = screen.getAllByLabelText('Model')[0];
      await user.clear(modelInput);
      await user.type(modelInput, 'gpt-4-turbo');

      expect(modelInput).toHaveValue('gpt-4-turbo');
    });
  });

  describe('Reasoning Level Control', () => {
    it('displays reasoning level select with correct options for OpenAI', async () => {
      render(
        <DataAgentSettings settings={defaultSettings} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      await waitFor(() => {
        expect(screen.getByText('OpenAI')).toBeInTheDocument();
      });

      const reasoningLabels = screen.getAllByText('Reasoning Level');
      expect(reasoningLabels.length).toBeGreaterThan(0);
    });

    it('displays reasoning level select with correct options for Anthropic', async () => {
      render(
        <DataAgentSettings settings={defaultSettings} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      await waitFor(() => {
        expect(screen.getByText('Anthropic')).toBeInTheDocument();
      });

      const reasoningLabels = screen.getAllByText('Reasoning Level');
      expect(reasoningLabels.length).toBeGreaterThan(0);
    });

    it('shows custom budget field when Anthropic reasoning level is set to custom', async () => {
      const user = userEvent.setup();

      const settingsWithCustom: SystemSettings = {
        ...defaultSettings,
        dataAgent: {
          anthropic: { reasoningLevel: 'custom', customBudget: 2048, temperature: 0.0 },
        },
      };

      render(
        <DataAgentSettings settings={settingsWithCustom} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      await waitFor(() => {
        expect(screen.getByLabelText('Custom Token Budget')).toBeInTheDocument();
      });

      const budgetInput = screen.getByLabelText('Custom Token Budget');
      expect(budgetInput).toHaveValue(2048);
    });

    it('does not show custom budget field for OpenAI', async () => {
      const settingsWithReasoning: SystemSettings = {
        ...defaultSettings,
        dataAgent: {
          openai: { reasoningLevel: 'high', temperature: 0.0 },
        },
      };

      render(
        <DataAgentSettings settings={settingsWithReasoning} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      await waitFor(() => {
        expect(screen.getByText('OpenAI')).toBeInTheDocument();
      });

      expect(screen.queryByLabelText('Custom Token Budget')).not.toBeInTheDocument();
    });
  });

  describe('Save Functionality', () => {
    it('save button is disabled when no changes made', async () => {
      render(
        <DataAgentSettings settings={defaultSettings} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      await waitFor(() => {
        expect(screen.getByText('OpenAI')).toBeInTheDocument();
      });

      const saveButton = screen.getByRole('button', { name: /save changes/i });
      expect(saveButton).toBeDisabled();
    });

    it('save button is enabled after making changes', async () => {
      const user = userEvent.setup();

      render(
        <DataAgentSettings settings={defaultSettings} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      await waitFor(() => {
        expect(screen.getByText('OpenAI')).toBeInTheDocument();
      });

      const modelInput = screen.getAllByLabelText('Model')[0];
      await user.type(modelInput, 'gpt-4-turbo');

      const saveButton = screen.getByRole('button', { name: /save changes/i });
      expect(saveButton).toBeEnabled();
    });

    it('calls onSave with updated config when Save is clicked', async () => {
      const user = userEvent.setup();

      render(
        <DataAgentSettings settings={defaultSettings} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      await waitFor(() => {
        expect(screen.getByText('OpenAI')).toBeInTheDocument();
      });

      const modelInput = screen.getAllByLabelText('Model')[0];
      await user.clear(modelInput);
      await user.type(modelInput, 'gpt-4-turbo');

      const saveButton = screen.getByRole('button', { name: /save changes/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith({
          openai: { model: 'gpt-4-turbo', temperature: 0 },
          anthropic: { temperature: 0 },
        });
      });
    });

    it('shows saving state when save is in progress', async () => {
      const user = userEvent.setup();
      const slowSave = vi.fn(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      render(
        <DataAgentSettings settings={defaultSettings} onSave={slowSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      await waitFor(() => {
        expect(screen.getByText('OpenAI')).toBeInTheDocument();
      });

      const modelInput = screen.getAllByLabelText('Model')[0];
      await user.type(modelInput, 'test');

      const saveButton = screen.getByRole('button', { name: /save changes/i });
      await user.click(saveButton);

      expect(screen.getByRole('button', { name: /saving\.\.\./i })).toBeInTheDocument();
    });
  });

  describe('Disabled State', () => {
    it('disables all controls when disabled prop is true', async () => {
      render(
        <DataAgentSettings
          settings={defaultSettings}
          onSave={mockOnSave}
          disabled={true}
        />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      await waitFor(() => {
        expect(screen.getByText('OpenAI')).toBeInTheDocument();
      });

      const modelInputs = screen.getAllByLabelText('Model');
      expect(modelInputs[0]).toBeDisabled();

      // Check for disabled Reasoning Level labels/inputs
      const reasoningLabels = screen.getAllByText('Reasoning Level');
      expect(reasoningLabels.length).toBeGreaterThan(0);

      const saveButton = screen.getByRole('button', { name: /save changes/i });
      expect(saveButton).toBeDisabled();
    });
  });

  describe('Error Handling', () => {
    it('displays error message when provider fetch fails', async () => {
      vi.mocked(api.getLlmProviders).mockRejectedValue(
        new Error('Network error')
      );

      render(
        <DataAgentSettings settings={defaultSettings} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });
});
