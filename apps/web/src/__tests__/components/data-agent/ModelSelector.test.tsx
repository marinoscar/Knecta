import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../../utils/test-utils';
import { ModelSelector } from '../../../components/data-agent/ModelSelector';
import type { LLMProviderInfo } from '../../../types';

describe('ModelSelector', () => {
  const mockProviders: LLMProviderInfo[] = [
    { name: 'openai', enabled: true, model: 'gpt-4', isDefault: true },
    { name: 'anthropic', enabled: true, model: 'claude-3-5-sonnet-20241022', isDefault: false },
    { name: 'azure', enabled: true, model: 'gpt-4', isDefault: false },
  ];

  const mockOnChange = vi.fn();

  describe('Rendering', () => {
    it('renders all provided providers', async () => {
      render(
        <ModelSelector
          providers={mockProviders}
          selectedProvider="openai"
          onChange={mockOnChange}
        />
      );

      // Click to open the dropdown
      const select = screen.getByRole('combobox');
      await userEvent.click(select);

      // Check all providers are rendered (use getAllByText since text appears in both menu and select)
      const openaiElements = screen.getAllByText('OpenAI');
      expect(openaiElements.length).toBeGreaterThan(0);

      expect(screen.getAllByText('Anthropic').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Azure OpenAI').length).toBeGreaterThan(0);
    });

    it('shows display names (OpenAI, Anthropic, Azure OpenAI)', async () => {
      render(
        <ModelSelector
          providers={mockProviders}
          selectedProvider="openai"
          onChange={mockOnChange}
        />
      );

      const select = screen.getByRole('combobox');
      await userEvent.click(select);

      // Verify display names are used, not raw provider names
      expect(screen.getAllByText('OpenAI').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Anthropic').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Azure OpenAI').length).toBeGreaterThan(0);
    });

    it('renders with small size by default', () => {
      const { container } = render(
        <ModelSelector
          providers={mockProviders}
          selectedProvider="openai"
          onChange={mockOnChange}
        />
      );

      // Check that FormControl exists and size prop is set
      const formControl = container.querySelector('.MuiFormControl-root');
      expect(formControl).toBeInTheDocument();

      // Check that the select has the correct size class
      const select = container.querySelector('.MuiInputBase-sizeSmall');
      expect(select).toBeInTheDocument();
    });

    it('renders with medium size when specified', () => {
      const { container } = render(
        <ModelSelector
          providers={mockProviders}
          selectedProvider="openai"
          onChange={mockOnChange}
          size="medium"
        />
      );

      const formControl = container.querySelector('.MuiFormControl-root');
      expect(formControl).not.toHaveClass('MuiFormControl-sizeSmall');
    });
  });

  describe('Selected Provider', () => {
    it('shows selected provider', () => {
      render(
        <ModelSelector
          providers={mockProviders}
          selectedProvider="anthropic"
          onChange={mockOnChange}
        />
      );

      const select = screen.getByRole('combobox');
      expect(select).toHaveTextContent('Anthropic');
    });

    it('defaults to first provider when selectedProvider is null', () => {
      render(
        <ModelSelector
          providers={mockProviders}
          selectedProvider={null}
          onChange={mockOnChange}
        />
      );

      const select = screen.getByRole('combobox');
      expect(select).toHaveTextContent('OpenAI'); // First provider
    });

    it('defaults to first provider when selectedProvider is invalid', () => {
      render(
        <ModelSelector
          providers={mockProviders}
          selectedProvider="nonexistent"
          onChange={mockOnChange}
        />
      );

      const select = screen.getByRole('combobox');
      expect(select).toHaveTextContent('OpenAI'); // First provider
    });
  });

  describe('Provider Selection', () => {
    it('calls onChange when a provider is selected', async () => {
      const user = userEvent.setup();

      render(
        <ModelSelector
          providers={mockProviders}
          selectedProvider="openai"
          onChange={mockOnChange}
        />
      );

      // Open dropdown
      const select = screen.getByRole('combobox');
      await user.click(select);

      // Select Anthropic
      const anthropicOption = screen.getByText('Anthropic');
      await user.click(anthropicOption);

      expect(mockOnChange).toHaveBeenCalledWith('anthropic');
    });

    it('calls onChange with correct provider name for Azure', async () => {
      const user = userEvent.setup();

      render(
        <ModelSelector
          providers={mockProviders}
          selectedProvider="openai"
          onChange={mockOnChange}
        />
      );

      // Open dropdown
      const select = screen.getByRole('combobox');
      await user.click(select);

      // Select Azure
      const azureOption = screen.getByText('Azure OpenAI');
      await user.click(azureOption);

      expect(mockOnChange).toHaveBeenCalledWith('azure');
    });
  });

  describe('Disabled State', () => {
    it('disables select when disabled prop is true', () => {
      render(
        <ModelSelector
          providers={mockProviders}
          selectedProvider="openai"
          onChange={mockOnChange}
          disabled={true}
        />
      );

      const select = screen.getByRole('combobox');
      expect(select).toHaveAttribute('aria-disabled', 'true');
    });

    it('is correctly disabled', () => {
      render(
        <ModelSelector
          providers={mockProviders}
          selectedProvider="openai"
          onChange={mockOnChange}
          disabled={true}
        />
      );

      const select = screen.getByRole('combobox');
      // Verify it has the disabled attribute
      expect(select).toHaveAttribute('aria-disabled', 'true');
    });

    it('is enabled when disabled prop is false', () => {
      render(
        <ModelSelector
          providers={mockProviders}
          selectedProvider="openai"
          onChange={mockOnChange}
          disabled={false}
        />
      );

      const select = screen.getByRole('combobox');
      expect(select).not.toHaveAttribute('aria-disabled', 'true');
    });

    it('is enabled when disabled prop is omitted', () => {
      render(
        <ModelSelector
          providers={mockProviders}
          selectedProvider="openai"
          onChange={mockOnChange}
        />
      );

      const select = screen.getByRole('combobox');
      expect(select).not.toHaveAttribute('aria-disabled', 'true');
    });
  });

  describe('Edge Cases', () => {
    it('handles empty providers array', () => {
      render(
        <ModelSelector
          providers={[]}
          selectedProvider={null}
          onChange={mockOnChange}
        />
      );

      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();
      // With empty providers, the select should exist but have no valid selection
    });

    it('handles single provider', async () => {
      const singleProvider: LLMProviderInfo[] = [
        { name: 'openai', enabled: true, model: 'gpt-4', isDefault: true },
      ];

      render(
        <ModelSelector
          providers={singleProvider}
          selectedProvider="openai"
          onChange={mockOnChange}
        />
      );

      const select = screen.getByRole('combobox');
      await userEvent.click(select);

      // Only one option should be available
      expect(screen.getAllByText('OpenAI').length).toBeGreaterThan(0);
      expect(screen.queryByText('Anthropic')).not.toBeInTheDocument();
    });

    it('handles provider with unknown name', async () => {
      const providersWithUnknown: LLMProviderInfo[] = [
        ...mockProviders,
        { name: 'unknown', enabled: true, model: 'unknown-model', isDefault: false },
      ];

      render(
        <ModelSelector
          providers={providersWithUnknown}
          selectedProvider="openai"
          onChange={mockOnChange}
        />
      );

      const select = screen.getByRole('combobox');
      await userEvent.click(select);

      // Unknown provider should show its raw name
      expect(screen.getByText('unknown')).toBeInTheDocument();
    });
  });
});
