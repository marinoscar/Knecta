import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../../utils/test-utils';
import { LlmProviderDialog } from '../../../components/admin/LlmProviderDialog';
import type { LLMProviderDetail, CreateLlmProviderRequest, UpdateLlmProviderRequest } from '../../../types';

describe('LlmProviderDialog', () => {
  const mockOnClose = vi.fn();
  const mockOnSave = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSave.mockResolvedValue(undefined);
  });

  // Helper to render the dialog in create mode
  function renderCreateMode(overrides: Partial<React.ComponentProps<typeof LlmProviderDialog>> = {}) {
    return render(
      <LlmProviderDialog
        open={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        provider={null}
        existingTypes={[]}
        {...overrides}
      />,
    );
  }

  // Helper to render in edit mode
  function renderEditMode(provider: LLMProviderDetail, overrides: Partial<React.ComponentProps<typeof LlmProviderDialog>> = {}) {
    return render(
      <LlmProviderDialog
        open={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        provider={provider}
        existingTypes={[provider.type]}
        {...overrides}
      />,
    );
  }

  const mockOpenAiProvider: LLMProviderDetail = {
    id: 'provider-1',
    type: 'openai',
    name: 'My OpenAI',
    enabled: true,
    isDefault: false,
    model: 'gpt-4o',
    config: { model: 'gpt-4o' },
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  describe('Create Mode', () => {
    it('renders "Add LLM Provider" title in create mode', () => {
      renderCreateMode();
      expect(screen.getByText('Add LLM Provider')).toBeInTheDocument();
    });

    it('renders "Create" submit button in create mode', () => {
      renderCreateMode();
      expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument();
    });

    it('enables the provider type selector in create mode', () => {
      renderCreateMode();
      // MUI Select renders as a combobox role
      // In create mode the FormControl is not disabled
      const typeFormControl = screen.getByText('Provider Type').closest('.MuiFormControl-root');
      expect(typeFormControl).not.toHaveClass('Mui-disabled');
    });

    it('auto-fills name field on initial render with OpenAI default', () => {
      renderCreateMode();
      const nameInput = screen.getByLabelText(/provider name/i);
      expect(nameInput).toHaveValue('OpenAI');
    });

    it('shows OpenAI fields (API key, Default Model) for openai type', () => {
      renderCreateMode();
      expect(screen.getByLabelText(/api key/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/default model/i)).toBeInTheDocument();
    });
  });

  describe('Edit Mode', () => {
    it('renders "Edit LLM Provider" title in edit mode', () => {
      renderEditMode(mockOpenAiProvider);
      expect(screen.getByText('Edit LLM Provider')).toBeInTheDocument();
    });

    it('renders "Save Changes" submit button in edit mode', () => {
      renderEditMode(mockOpenAiProvider);
      expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
    });

    it('disables the provider type selector in edit mode', () => {
      renderEditMode(mockOpenAiProvider);
      // In edit mode the FormControl has disabled=true; MUI propagates Mui-disabled to the Select
      // The Select's inner div (role=combobox) has aria-disabled or MuiSelect-select class with Mui-disabled
      const typeFormControl = screen.getByText('Provider Type').closest('.MuiFormControl-root');
      // Check that the Select inside is disabled by looking for aria-disabled on the combobox
      const selectEl = typeFormControl?.querySelector('[role="combobox"]');
      expect(selectEl).toHaveAttribute('aria-disabled', 'true');
    });

    it('pre-fills the name field with the existing provider name', () => {
      renderEditMode(mockOpenAiProvider);
      const nameInput = screen.getByLabelText(/provider name/i);
      expect(nameInput).toHaveValue('My OpenAI');
    });

    it('pre-fills non-sensitive config fields from existing provider', () => {
      const azureProvider: LLMProviderDetail = {
        id: 'provider-2',
        type: 'azure_openai',
        name: 'Azure Prod',
        enabled: true,
        isDefault: false,
        model: 'gpt-4',
        config: {
          endpoint: 'https://myresource.openai.azure.com',
          deployment: 'my-deployment',
          apiVersion: '2024-02-01',
          model: 'gpt-4',
        },
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      renderEditMode(azureProvider);

      expect(screen.getByLabelText(/endpoint url/i)).toHaveValue(
        'https://myresource.openai.azure.com',
      );
      expect(screen.getByLabelText(/deployment name/i)).toHaveValue('my-deployment');
    });

    it('leaves password fields empty in edit mode with placeholder "(unchanged)"', () => {
      renderEditMode(mockOpenAiProvider);

      const apiKeyInput = screen.getByLabelText(/api key/i);
      expect(apiKeyInput).toHaveValue('');
      expect(apiKeyInput).toHaveAttribute('placeholder', '(unchanged)');
    });
  });

  describe('Type Selection', () => {
    // Helper: open the Provider Type MUI Select dropdown
    async function openTypeSelect(user: ReturnType<typeof userEvent.setup>) {
      // MUI Select has a [role="combobox"] or we can click the visible Select div
      // The Provider Type label text is in the FormControl; click the Select's displayed value
      const selectDisplayDiv = screen
        .getByText('Provider Type')
        .closest('.MuiFormControl-root')
        ?.querySelector('[role="combobox"]');
      if (selectDisplayDiv) {
        await user.click(selectDisplayDiv as HTMLElement);
      } else {
        // Fallback: click the first combobox in the dialog
        await user.click(screen.getAllByRole('combobox')[0]);
      }
    }

    it('changes visible fields when type is changed to Anthropic', async () => {
      const user = userEvent.setup();
      renderCreateMode();

      await openTypeSelect(user);

      await waitFor(() => {
        expect(screen.getByRole('option', { name: /^anthropic$/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('option', { name: /^anthropic$/i }));

      await waitFor(() => {
        // Anthropic API key placeholder is sk-ant-...
        const apiKeyInput = screen.getByLabelText(/api key/i);
        expect(apiKeyInput).toHaveAttribute('placeholder', 'sk-ant-...');
      });
    });

    it('auto-fills name when type changes in create mode', async () => {
      const user = userEvent.setup();
      renderCreateMode();

      await openTypeSelect(user);

      await waitFor(() => {
        expect(screen.getByRole('option', { name: /^anthropic$/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('option', { name: /^anthropic$/i }));

      await waitFor(() => {
        const nameInput = screen.getByLabelText(/provider name/i);
        expect(nameInput).toHaveValue('Anthropic');
      });
    });

    it('shows Azure fields (endpoint, deployment, apiVersion) for azure_openai type', async () => {
      const user = userEvent.setup();
      renderCreateMode();

      await openTypeSelect(user);

      await waitFor(() => {
        expect(screen.getByRole('option', { name: /azure openai/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('option', { name: /azure openai/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/endpoint url/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/deployment name/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/api version/i)).toBeInTheDocument();
      });
    });

    it('shows Snowflake fields (account, personal access token) for snowflake_cortex type', async () => {
      const user = userEvent.setup();
      renderCreateMode();

      await openTypeSelect(user);

      await waitFor(() => {
        expect(screen.getByRole('option', { name: /snowflake cortex/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('option', { name: /snowflake cortex/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/account identifier/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/personal access token/i)).toBeInTheDocument();
      });
    });

    it('shows "(already configured)" for existing types in create mode', async () => {
      const user = userEvent.setup();
      renderCreateMode({ existingTypes: ['anthropic'] });

      await openTypeSelect(user);

      await waitFor(() => {
        expect(screen.getByText('(already configured)')).toBeInTheDocument();
      });
    });
  });

  describe('Password Field Toggle', () => {
    it('password field is hidden by default (type=password)', () => {
      renderCreateMode();
      const apiKeyInput = screen.getByLabelText(/api key/i);
      expect(apiKeyInput).toHaveAttribute('type', 'password');
    });

    it('shows password when show/hide button is clicked', async () => {
      const user = userEvent.setup();
      renderCreateMode();

      const toggleButton = screen.getByRole('button', { name: /show field value/i });
      await user.click(toggleButton);

      await waitFor(() => {
        const apiKeyInput = screen.getByLabelText(/api key/i);
        expect(apiKeyInput).toHaveAttribute('type', 'text');
      });
    });

    it('hides password again when toggle is clicked a second time', async () => {
      const user = userEvent.setup();
      renderCreateMode();

      const toggleButton = screen.getByRole('button', { name: /show field value/i });
      await user.click(toggleButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /hide field value/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /hide field value/i }));

      await waitFor(() => {
        const apiKeyInput = screen.getByLabelText(/api key/i);
        expect(apiKeyInput).toHaveAttribute('type', 'password');
      });
    });
  });

  describe('Validation', () => {
    it('shows error when name is empty on submit', async () => {
      const user = userEvent.setup();
      renderCreateMode();

      const nameInput = screen.getByLabelText(/provider name/i);
      await user.clear(nameInput);

      await user.click(screen.getByRole('button', { name: /create/i }));

      await waitFor(() => {
        expect(screen.getByText(/provider name is required/i)).toBeInTheDocument();
      });

      expect(mockOnSave).not.toHaveBeenCalled();
    });

    it('shows error when required API key is missing on create', async () => {
      const user = userEvent.setup();
      renderCreateMode();

      // Name is pre-filled as "OpenAI"; leave API key empty
      await user.click(screen.getByRole('button', { name: /create/i }));

      await waitFor(() => {
        expect(screen.getByText(/api key is required/i)).toBeInTheDocument();
      });

      expect(mockOnSave).not.toHaveBeenCalled();
    });

    it('does not require API key when in edit mode (keep existing)', async () => {
      const user = userEvent.setup();
      renderEditMode(mockOpenAiProvider);

      // Leave API key empty and submit
      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalled();
      });
    });
  });

  describe('Submit in Create Mode', () => {
    it('calls onSave with all fields in create mode', async () => {
      const user = userEvent.setup();
      renderCreateMode();

      const apiKeyInput = screen.getByLabelText(/api key/i);
      await user.type(apiKeyInput, 'sk-test-key');

      await user.click(screen.getByRole('button', { name: /create/i }));

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith(
          expect.objectContaining<Partial<CreateLlmProviderRequest>>({
            type: 'openai',
            name: 'OpenAI',
            enabled: true,
            isDefault: false,
            config: expect.objectContaining({ apiKey: 'sk-test-key' }),
          }),
        );
      });
    });

    it('closes dialog after successful save', async () => {
      const user = userEvent.setup();
      renderCreateMode();

      const apiKeyInput = screen.getByLabelText(/api key/i);
      await user.type(apiKeyInput, 'sk-test-key');

      await user.click(screen.getByRole('button', { name: /create/i }));

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled();
      });
    });
  });

  describe('Submit in Edit Mode', () => {
    it('calls onSave with partial update (name + enabled/isDefault)', async () => {
      const user = userEvent.setup();
      renderEditMode(mockOpenAiProvider);

      // Change only the name
      const nameInput = screen.getByLabelText(/provider name/i);
      await user.clear(nameInput);
      await user.type(nameInput, 'Updated OpenAI');

      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith(
          expect.objectContaining<Partial<UpdateLlmProviderRequest>>({
            name: 'Updated OpenAI',
            enabled: true,
            isDefault: false,
          }),
        );
      });
    });

    it('includes config only when a password field is changed in edit mode', async () => {
      const user = userEvent.setup();
      renderEditMode(mockOpenAiProvider);

      const apiKeyInput = screen.getByLabelText(/api key/i);
      await user.type(apiKeyInput, 'sk-new-key');

      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith(
          expect.objectContaining({
            config: expect.objectContaining({ apiKey: 'sk-new-key' }),
          }),
        );
      });
    });
  });

  describe('Cancel Button', () => {
    it('calls onClose when Cancel is clicked', async () => {
      const user = userEvent.setup();
      renderCreateMode();

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('does not call onSave when Cancel is clicked', async () => {
      const user = userEvent.setup();
      renderCreateMode();

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(mockOnSave).not.toHaveBeenCalled();
    });
  });

  describe('Save Error Handling', () => {
    it('shows error message when onSave throws', async () => {
      mockOnSave.mockRejectedValue(new Error('Network failure'));
      const user = userEvent.setup();
      renderCreateMode();

      const apiKeyInput = screen.getByLabelText(/api key/i);
      await user.type(apiKeyInput, 'sk-test-key');

      await user.click(screen.getByRole('button', { name: /create/i }));

      await waitFor(() => {
        expect(screen.getByText('Network failure')).toBeInTheDocument();
      });

      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('Closed State', () => {
    it('does not render dialog content when open=false', () => {
      render(
        <LlmProviderDialog
          open={false}
          onClose={mockOnClose}
          onSave={mockOnSave}
          provider={null}
        />,
      );

      expect(screen.queryByText('Add LLM Provider')).not.toBeInTheDocument();
    });
  });
});
