import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render, mockAdminUser } from '../../utils/test-utils';
import { AgentConfigSettings } from '../../../components/admin/AgentConfigSettings';
import type { LLMProviderInfo, SystemSettings } from '../../../types';
import * as api from '../../../services/api';

vi.mock('../../../services/api', () => ({
  getLlmProviders: vi.fn(),
}));

const mockProviders: LLMProviderInfo[] = [
  {
    id: 'provider-1',
    type: 'openai',
    name: 'OpenAI Production',
    enabled: true,
    isDefault: true,
    model: 'gpt-4o',
  },
  {
    id: 'provider-2',
    type: 'anthropic',
    name: 'Anthropic Claude',
    enabled: true,
    isDefault: false,
    model: 'claude-3-5-sonnet-20241022',
  },
];

const baseSettings: SystemSettings = {
  ui: { allowUserThemeOverride: true },
  features: {},
  agentConfigs: {
    dataAgent: {
      openai: { temperature: 0.0 },
      anthropic: { temperature: 0.0 },
    },
    semanticModel: {},
  },
  updatedAt: new Date().toISOString(),
  updatedBy: null,
  version: 1,
};

describe('AgentConfigSettings', () => {
  const mockOnSave = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSave.mockResolvedValue(undefined);
    vi.mocked(api.getLlmProviders).mockResolvedValue({ providers: mockProviders });
  });

  describe('Display Name', () => {
    it('renders "Data Agent Configuration" heading when agentKey is "dataAgent"', async () => {
      render(
        <AgentConfigSettings
          agentKey="dataAgent"
          agentDisplayName="Data Agent"
          settings={baseSettings}
          onSave={mockOnSave}
        />,
        { wrapperOptions: { user: mockAdminUser } },
      );

      await waitFor(() => {
        expect(screen.getByText('Data Agent Configuration')).toBeInTheDocument();
      });
    });

    it('renders "Semantic Model Agent Configuration" heading when agentKey is "semanticModel"', async () => {
      render(
        <AgentConfigSettings
          agentKey="semanticModel"
          agentDisplayName="Semantic Model Agent"
          settings={baseSettings}
          onSave={mockOnSave}
        />,
        { wrapperOptions: { user: mockAdminUser } },
      );

      await waitFor(() => {
        expect(screen.getByText('Semantic Model Agent Configuration')).toBeInTheDocument();
      });
    });
  });

  describe('Loading State', () => {
    it('renders loading text while fetching providers', () => {
      vi.mocked(api.getLlmProviders).mockImplementation(() => new Promise(() => {}));

      render(
        <AgentConfigSettings
          agentKey="dataAgent"
          agentDisplayName="Data Agent"
          settings={baseSettings}
          onSave={mockOnSave}
        />,
        { wrapperOptions: { user: mockAdminUser } },
      );

      expect(screen.getByText('Loading providers...')).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('displays error message when provider fetch fails', async () => {
      vi.mocked(api.getLlmProviders).mockRejectedValue(new Error('Network error'));

      render(
        <AgentConfigSettings
          agentKey="dataAgent"
          agentDisplayName="Data Agent"
          settings={baseSettings}
          onSave={mockOnSave}
        />,
        { wrapperOptions: { user: mockAdminUser } },
      );

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });

  describe('Empty State', () => {
    it('shows info message when no providers are configured', async () => {
      vi.mocked(api.getLlmProviders).mockResolvedValue({ providers: [] });

      render(
        <AgentConfigSettings
          agentKey="dataAgent"
          agentDisplayName="Data Agent"
          settings={baseSettings}
          onSave={mockOnSave}
        />,
        { wrapperOptions: { user: mockAdminUser } },
      );

      await waitFor(() => {
        expect(screen.getByText(/no llm providers are configured/i)).toBeInTheDocument();
      });
    });

    it('does not render provider sections when no providers exist', async () => {
      vi.mocked(api.getLlmProviders).mockResolvedValue({ providers: [] });

      render(
        <AgentConfigSettings
          agentKey="dataAgent"
          agentDisplayName="Data Agent"
          settings={baseSettings}
          onSave={mockOnSave}
        />,
        { wrapperOptions: { user: mockAdminUser } },
      );

      await waitFor(() => {
        expect(screen.queryByText('OpenAI')).not.toBeInTheDocument();
      });
    });
  });

  describe('Provider Sections', () => {
    it('renders a section for each enabled provider', async () => {
      render(
        <AgentConfigSettings
          agentKey="dataAgent"
          agentDisplayName="Data Agent"
          settings={baseSettings}
          onSave={mockOnSave}
        />,
        { wrapperOptions: { user: mockAdminUser } },
      );

      await waitFor(() => {
        expect(screen.getByText('OpenAI')).toBeInTheDocument();
        expect(screen.getByText('Anthropic')).toBeInTheDocument();
      });
    });

    it('only shows enabled providers (filters out disabled)', async () => {
      vi.mocked(api.getLlmProviders).mockResolvedValue({
        providers: [
          { ...mockProviders[0], enabled: true },
          { ...mockProviders[1], enabled: false },
        ],
      });

      render(
        <AgentConfigSettings
          agentKey="dataAgent"
          agentDisplayName="Data Agent"
          settings={baseSettings}
          onSave={mockOnSave}
        />,
        { wrapperOptions: { user: mockAdminUser } },
      );

      await waitFor(() => {
        expect(screen.getByText('OpenAI')).toBeInTheDocument();
        expect(screen.queryByText('Anthropic')).not.toBeInTheDocument();
      });
    });
  });

  describe('Temperature Slider', () => {
    it('displays temperature label with value from settings', async () => {
      const settingsWithTemp: SystemSettings = {
        ...baseSettings,
        agentConfigs: {
          dataAgent: { openai: { temperature: 1.5 } },
        },
      };

      render(
        <AgentConfigSettings
          agentKey="dataAgent"
          agentDisplayName="Data Agent"
          settings={settingsWithTemp}
          onSave={mockOnSave}
        />,
        { wrapperOptions: { user: mockAdminUser } },
      );

      await waitFor(() => {
        expect(screen.getByText(/Temperature: 1\.5/)).toBeInTheDocument();
      });
    });

    it('displays temperature 0.0 when not set in settings', async () => {
      const settingsNoTemp: SystemSettings = {
        ...baseSettings,
        agentConfigs: { dataAgent: {} },
      };

      render(
        <AgentConfigSettings
          agentKey="dataAgent"
          agentDisplayName="Data Agent"
          settings={settingsNoTemp}
          onSave={mockOnSave}
        />,
        { wrapperOptions: { user: mockAdminUser } },
      );

      await waitFor(() => {
        const tempLabels = screen.getAllByText(/Temperature: 0\.0/);
        expect(tempLabels.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Model Override Field', () => {
    it('renders model text field with placeholder from provider model', async () => {
      render(
        <AgentConfigSettings
          agentKey="dataAgent"
          agentDisplayName="Data Agent"
          settings={baseSettings}
          onSave={mockOnSave}
        />,
        { wrapperOptions: { user: mockAdminUser } },
      );

      await waitFor(() => {
        const modelInputs = screen.getAllByLabelText('Model');
        expect(modelInputs[0]).toHaveAttribute('placeholder', 'gpt-4o');
        expect(modelInputs[1]).toHaveAttribute('placeholder', 'claude-3-5-sonnet-20241022');
      });
    });

    it('shows current model value from settings when set', async () => {
      const settingsWithModel: SystemSettings = {
        ...baseSettings,
        agentConfigs: {
          dataAgent: { openai: { model: 'gpt-4-turbo', temperature: 0.0 } },
        },
      };

      render(
        <AgentConfigSettings
          agentKey="dataAgent"
          agentDisplayName="Data Agent"
          settings={settingsWithModel}
          onSave={mockOnSave}
        />,
        { wrapperOptions: { user: mockAdminUser } },
      );

      await waitFor(() => {
        const modelInput = screen.getAllByLabelText('Model')[0];
        expect(modelInput).toHaveValue('gpt-4-turbo');
      });
    });

    it('allows typing a custom model name', async () => {
      const user = userEvent.setup();

      render(
        <AgentConfigSettings
          agentKey="dataAgent"
          agentDisplayName="Data Agent"
          settings={baseSettings}
          onSave={mockOnSave}
        />,
        { wrapperOptions: { user: mockAdminUser } },
      );

      await waitFor(() => {
        expect(screen.getAllByLabelText('Model').length).toBeGreaterThan(0);
      });

      const modelInput = screen.getAllByLabelText('Model')[0];
      await user.clear(modelInput);
      await user.type(modelInput, 'gpt-4-turbo');

      expect(modelInput).toHaveValue('gpt-4-turbo');
    });
  });

  describe('Reasoning Level Control', () => {
    it('renders reasoning level label for each enabled provider', async () => {
      render(
        <AgentConfigSettings
          agentKey="dataAgent"
          agentDisplayName="Data Agent"
          settings={baseSettings}
          onSave={mockOnSave}
        />,
        { wrapperOptions: { user: mockAdminUser } },
      );

      await waitFor(() => {
        const reasoningLabels = screen.getAllByText('Reasoning Level');
        expect(reasoningLabels.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('shows custom budget field when Anthropic reasoning level is "custom"', async () => {
      const settingsWithCustom: SystemSettings = {
        ...baseSettings,
        agentConfigs: {
          dataAgent: { anthropic: { reasoningLevel: 'custom', customBudget: 2048 } },
        },
      };

      render(
        <AgentConfigSettings
          agentKey="dataAgent"
          agentDisplayName="Data Agent"
          settings={settingsWithCustom}
          onSave={mockOnSave}
        />,
        { wrapperOptions: { user: mockAdminUser } },
      );

      await waitFor(() => {
        expect(screen.getByLabelText('Custom Token Budget')).toBeInTheDocument();
        expect(screen.getByLabelText('Custom Token Budget')).toHaveValue(2048);
      });
    });

    it('does not show custom budget field for OpenAI reasoning', async () => {
      const settingsWithOpenAIReasoning: SystemSettings = {
        ...baseSettings,
        agentConfigs: {
          dataAgent: { openai: { reasoningLevel: 'high' } },
        },
      };

      render(
        <AgentConfigSettings
          agentKey="dataAgent"
          agentDisplayName="Data Agent"
          settings={settingsWithOpenAIReasoning}
          onSave={mockOnSave}
        />,
        { wrapperOptions: { user: mockAdminUser } },
      );

      await waitFor(() => {
        expect(screen.getByText('OpenAI')).toBeInTheDocument();
      });

      expect(screen.queryByLabelText('Custom Token Budget')).not.toBeInTheDocument();
    });
  });

  describe('Save Functionality', () => {
    it('save button is disabled when no changes are made', async () => {
      render(
        <AgentConfigSettings
          agentKey="dataAgent"
          agentDisplayName="Data Agent"
          settings={baseSettings}
          onSave={mockOnSave}
        />,
        { wrapperOptions: { user: mockAdminUser } },
      );

      await waitFor(() => {
        expect(screen.getByText('OpenAI')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
    });

    it('save button is enabled after making changes', async () => {
      const user = userEvent.setup();

      render(
        <AgentConfigSettings
          agentKey="dataAgent"
          agentDisplayName="Data Agent"
          settings={baseSettings}
          onSave={mockOnSave}
        />,
        { wrapperOptions: { user: mockAdminUser } },
      );

      await waitFor(() => {
        expect(screen.getAllByLabelText('Model').length).toBeGreaterThan(0);
      });

      const modelInput = screen.getAllByLabelText('Model')[0];
      await user.type(modelInput, 'gpt-4-turbo');

      expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled();
    });

    it('calls onSave with the agentKey section data when Save is clicked', async () => {
      const user = userEvent.setup();

      render(
        <AgentConfigSettings
          agentKey="dataAgent"
          agentDisplayName="Data Agent"
          settings={baseSettings}
          onSave={mockOnSave}
        />,
        { wrapperOptions: { user: mockAdminUser } },
      );

      await waitFor(() => {
        expect(screen.getAllByLabelText('Model').length).toBeGreaterThan(0);
      });

      const modelInput = screen.getAllByLabelText('Model')[0];
      await user.clear(modelInput);
      await user.type(modelInput, 'gpt-4-turbo');

      const saveButton = screen.getByRole('button', { name: /save changes/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith(
          expect.objectContaining({
            openai: expect.objectContaining({ model: 'gpt-4-turbo' }),
          }),
        );
      });
    });

    it('shows "Saving..." state when save is in progress', async () => {
      const user = userEvent.setup();
      const slowSave = vi.fn(() => new Promise<void>((resolve) => setTimeout(resolve, 200)));

      render(
        <AgentConfigSettings
          agentKey="dataAgent"
          agentDisplayName="Data Agent"
          settings={baseSettings}
          onSave={slowSave}
        />,
        { wrapperOptions: { user: mockAdminUser } },
      );

      await waitFor(() => {
        expect(screen.getAllByLabelText('Model').length).toBeGreaterThan(0);
      });

      const modelInput = screen.getAllByLabelText('Model')[0];
      await user.type(modelInput, 'test-model');

      const saveButton = screen.getByRole('button', { name: /save changes/i });
      await user.click(saveButton);

      expect(screen.getByRole('button', { name: /saving\.\.\./i })).toBeInTheDocument();
    });

    it('only saves configs for enabled providers', async () => {
      const user = userEvent.setup();

      // Only openai is enabled in this test
      vi.mocked(api.getLlmProviders).mockResolvedValue({
        providers: [{ ...mockProviders[0], enabled: true }],
      });

      render(
        <AgentConfigSettings
          agentKey="dataAgent"
          agentDisplayName="Data Agent"
          settings={baseSettings}
          onSave={mockOnSave}
        />,
        { wrapperOptions: { user: mockAdminUser } },
      );

      await waitFor(() => {
        expect(screen.getByText('OpenAI')).toBeInTheDocument();
      });

      const modelInput = screen.getByLabelText('Model');
      await user.type(modelInput, 'gpt-4-turbo');

      const saveButton = screen.getByRole('button', { name: /save changes/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith(
          expect.objectContaining({
            openai: expect.objectContaining({ model: 'gpt-4-turbo' }),
          }),
        );
        // anthropic should not be included since it's not in the enabled providers
        const callArg = vi.mocked(mockOnSave).mock.calls[0][0];
        expect(callArg).not.toHaveProperty('anthropic');
      });
    });
  });

  describe('Disabled State', () => {
    it('disables model inputs when disabled prop is true', async () => {
      render(
        <AgentConfigSettings
          agentKey="dataAgent"
          agentDisplayName="Data Agent"
          settings={baseSettings}
          onSave={mockOnSave}
          disabled={true}
        />,
        { wrapperOptions: { user: mockAdminUser } },
      );

      await waitFor(() => {
        const modelInputs = screen.getAllByLabelText('Model');
        expect(modelInputs[0]).toBeDisabled();
      });
    });

    it('disables save button when disabled prop is true', async () => {
      render(
        <AgentConfigSettings
          agentKey="dataAgent"
          agentDisplayName="Data Agent"
          settings={baseSettings}
          onSave={mockOnSave}
          disabled={true}
        />,
        { wrapperOptions: { user: mockAdminUser } },
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
      });
    });
  });

  describe('Semantic Model Agent Key', () => {
    it('reads from agentConfigs.semanticModel when agentKey is "semanticModel"', async () => {
      const settingsWithSemanticModel: SystemSettings = {
        ...baseSettings,
        agentConfigs: {
          semanticModel: { openai: { model: 'gpt-4o-mini', temperature: 0.5 } },
        },
      };

      render(
        <AgentConfigSettings
          agentKey="semanticModel"
          agentDisplayName="Semantic Model Agent"
          settings={settingsWithSemanticModel}
          onSave={mockOnSave}
        />,
        { wrapperOptions: { user: mockAdminUser } },
      );

      await waitFor(() => {
        const modelInput = screen.getAllByLabelText('Model')[0];
        expect(modelInput).toHaveValue('gpt-4o-mini');
        expect(screen.getByText(/Temperature: 0\.5/)).toBeInTheDocument();
      });
    });
  });
});
