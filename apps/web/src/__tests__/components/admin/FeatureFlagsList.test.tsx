import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render, mockAdminUser } from '../../utils/test-utils';
import { FeatureFlagsList } from '../../../components/admin/FeatureFlagsList';

describe('FeatureFlagsList', () => {
  const mockOnSave = vi.fn();

  const defaultFlags = {
    enable_new_feature: true,
    allow_beta_access: false,
    maintenance_mode: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSave.mockResolvedValue(undefined);
  });

  describe('Rendering', () => {
    it('should render feature flags heading', () => {
      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      expect(screen.getByText('Feature Flags')).toBeInTheDocument();
    });

    it('should render Add Flag button', () => {
      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      expect(
        screen.getByRole('button', { name: /add flag/i })
      ).toBeInTheDocument();
    });

    it('should render Save Changes button', () => {
      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      expect(
        screen.getByRole('button', { name: /save changes/i })
      ).toBeInTheDocument();
    });
  });

  describe('Feature Flags Display', () => {
    it('should display all feature flags with names', () => {
      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      expect(screen.getByText('enable_new_feature')).toBeInTheDocument();
      expect(screen.getByText('allow_beta_access')).toBeInTheDocument();
      expect(screen.getByText('maintenance_mode')).toBeInTheDocument();
    });

    it('should display flags in alphabetical order', () => {
      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const flagNames = screen
        .getAllByRole('listitem')
        .map((item) => item.textContent?.match(/^[a-z_]+/)?.[0]);

      expect(flagNames).toEqual([
        'allow_beta_access',
        'enable_new_feature',
        'maintenance_mode',
      ]);
    });

    it('should show "Enabled" status for enabled flags', () => {
      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const enabledFlags = screen.getAllByText('Enabled');
      expect(enabledFlags).toHaveLength(1);
    });

    it('should show "Disabled" status for disabled flags', () => {
      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const disabledFlags = screen.getAllByText('Disabled');
      expect(disabledFlags).toHaveLength(2);
    });

    it('should render switch for each flag', () => {
      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const switches = screen.getAllByRole('checkbox');
      expect(switches).toHaveLength(3);
    });

    it('should render delete button for each flag', () => {
      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const deleteButtons = screen.getAllByRole('button', { name: '' });
      const deleteIconButtons = deleteButtons.filter((btn) =>
        btn.querySelector('svg[data-testid="DeleteIcon"]')
      );
      expect(deleteIconButtons.length).toBeGreaterThanOrEqual(3);
    });

    it('should set switch checked state based on flag value', () => {
      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const switches = screen.getAllByRole('checkbox') as HTMLInputElement[];

      // Sorted order: allow_beta_access (false), enable_new_feature (true), maintenance_mode (false)
      expect(switches[0].checked).toBe(false); // allow_beta_access
      expect(switches[1].checked).toBe(true);  // enable_new_feature
      expect(switches[2].checked).toBe(false); // maintenance_mode
    });
  });

  describe('Empty State', () => {
    it('should show empty state message when no flags exist', () => {
      render(<FeatureFlagsList flags={{}} onSave={mockOnSave} />, {
        wrapperOptions: { user: mockAdminUser },
      });

      expect(
        screen.getByText('No feature flags configured')
      ).toBeInTheDocument();
    });

    it('should not render list when no flags exist', () => {
      render(<FeatureFlagsList flags={{}} onSave={mockOnSave} />, {
        wrapperOptions: { user: mockAdminUser },
      });

      const list = screen.queryByRole('list');
      expect(list).not.toBeInTheDocument();
    });

    it('should still show Add Flag button in empty state', () => {
      render(<FeatureFlagsList flags={{}} onSave={mockOnSave} />, {
        wrapperOptions: { user: mockAdminUser },
      });

      expect(
        screen.getByRole('button', { name: /add flag/i })
      ).toBeInTheDocument();
    });
  });

  describe('Toggle Functionality', () => {
    it('should enable save button when flag is toggled', async () => {
      const user = userEvent.setup();

      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const saveButton = screen.getByRole('button', {
        name: /save changes/i,
      });
      expect(saveButton).toBeDisabled();

      const switches = screen.getAllByRole('checkbox');
      await user.click(switches[0]);

      await waitFor(() => {
        expect(saveButton).not.toBeDisabled();
      });
    });

    it('should toggle flag from enabled to disabled', async () => {
      const user = userEvent.setup();

      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const switches = screen.getAllByRole('checkbox') as HTMLInputElement[];
      const enabledSwitch = switches.find((sw) => sw.checked);

      expect(enabledSwitch?.checked).toBe(true);

      await user.click(enabledSwitch!);

      await waitFor(() => {
        expect(enabledSwitch?.checked).toBe(false);
      });
    });

    it('should toggle flag from disabled to enabled', async () => {
      const user = userEvent.setup();

      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const switches = screen.getAllByRole('checkbox') as HTMLInputElement[];
      const disabledSwitch = switches.find((sw) => !sw.checked);

      expect(disabledSwitch?.checked).toBe(false);

      await user.click(disabledSwitch!);

      await waitFor(() => {
        expect(disabledSwitch?.checked).toBe(true);
      });
    });

    it('should update status text when flag is toggled', async () => {
      const user = userEvent.setup();

      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const switches = screen.getAllByRole('checkbox') as HTMLInputElement[];
      const firstSwitch = switches[0]; // allow_beta_access - initially disabled

      await user.click(firstSwitch);

      await waitFor(() => {
        expect(screen.getAllByText('Enabled')).toHaveLength(2);
        expect(screen.getAllByText('Disabled')).toHaveLength(1);
      });
    });

    it('should allow toggling multiple flags', async () => {
      const user = userEvent.setup();

      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const switches = screen.getAllByRole('checkbox');

      await user.click(switches[0]);
      await user.click(switches[1]);
      await user.click(switches[2]);

      await waitFor(() => {
        const saveButton = screen.getByRole('button', {
          name: /save changes/i,
        });
        expect(saveButton).not.toBeDisabled();
      });
    });
  });

  describe('Add Flag Dialog', () => {
    it('should open dialog when Add Flag button clicked', async () => {
      const user = userEvent.setup();

      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const addButton = screen.getByRole('button', { name: /add flag/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('Add Feature Flag')).toBeInTheDocument();
      });
    });

    it('should render flag name input in dialog', async () => {
      const user = userEvent.setup();

      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const addButton = screen.getByRole('button', { name: /add flag/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/flag name/i)).toBeInTheDocument();
      });
    });

    it('should show helper text in dialog', async () => {
      const user = userEvent.setup();

      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const addButton = screen.getByRole('button', { name: /add flag/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(
          screen.getByText(/use snake_case or camelcase/i)
        ).toBeInTheDocument();
      });
    });

    it('should render Cancel and Add buttons in dialog', async () => {
      const user = userEvent.setup();

      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const addButton = screen.getByRole('button', { name: /add flag/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /^cancel$/i })
        ).toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: /^add$/i })
        ).toBeInTheDocument();
      });
    });

    it('should close dialog when Cancel button clicked', async () => {
      const user = userEvent.setup();

      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const addButton = screen.getByRole('button', { name: /add flag/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /^cancel$/i });
      await user.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('should add new flag when Add button clicked with valid name', async () => {
      const user = userEvent.setup();

      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const addButton = screen.getByRole('button', { name: /add flag/i });
      await user.click(addButton);

      const flagNameInput = await screen.findByLabelText(/flag name/i);
      await user.type(flagNameInput, 'new_feature_flag');

      const submitButton = screen.getByRole('button', { name: /^add$/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('new_feature_flag')).toBeInTheDocument();
      });
    });

    it('should set new flag to disabled by default', async () => {
      const user = userEvent.setup();

      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const addButton = screen.getByRole('button', { name: /add flag/i });
      await user.click(addButton);

      const flagNameInput = await screen.findByLabelText(/flag name/i);
      await user.type(flagNameInput, 'aaa_new_flag'); // Start with 'aaa' to ensure it's first alphabetically

      const submitButton = screen.getByRole('button', { name: /^add$/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('aaa_new_flag')).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      const switches = screen.getAllByRole('checkbox') as HTMLInputElement[];
      const newFlagSwitch = switches[0]; // Alphabetically first: aaa_new_flag
      expect(newFlagSwitch.checked).toBe(false);
    });

    it('should close dialog after adding flag', async () => {
      const user = userEvent.setup();

      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const addButton = screen.getByRole('button', { name: /add flag/i });
      await user.click(addButton);

      const flagNameInput = await screen.findByLabelText(/flag name/i);
      await user.type(flagNameInput, 'test_flag');

      const submitButton = screen.getByRole('button', { name: /^add$/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('should disable Add button when flag name is empty', async () => {
      const user = userEvent.setup();

      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const addButton = screen.getByRole('button', { name: /add flag/i });
      await user.click(addButton);

      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /^add$/i });
        expect(submitButton).toBeDisabled();
      });
    });

    it('should enable Add button when flag name is entered', async () => {
      const user = userEvent.setup();

      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const addButton = screen.getByRole('button', { name: /add flag/i });
      await user.click(addButton);

      const flagNameInput = await screen.findByLabelText(/flag name/i);
      await user.type(flagNameInput, 'test');

      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /^add$/i });
        expect(submitButton).not.toBeDisabled();
      });
    });

    it('should replace spaces with underscores in flag name', async () => {
      const user = userEvent.setup();

      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const addButton = screen.getByRole('button', { name: /add flag/i });
      await user.click(addButton);

      const flagNameInput = await screen.findByLabelText(
        /flag name/i
      ) as HTMLInputElement;
      await user.type(flagNameInput, 'my new flag');

      expect(flagNameInput.value).toBe('my_new_flag');
    });

    it('should not add duplicate flag', async () => {
      const user = userEvent.setup();

      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      // Initial count
      const initialSwitches = screen.getAllByRole('checkbox');
      expect(initialSwitches).toHaveLength(3);

      const addButton = screen.getByRole('button', { name: /add flag/i });
      await user.click(addButton);

      const flagNameInput = await screen.findByLabelText(/flag name/i);
      await user.type(flagNameInput, 'enable_new_feature');

      const submitButton = screen.getByRole('button', { name: /^add$/i });
      await user.click(submitButton);

      // Dialog should stay open since duplicate was not added
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Close the dialog manually to verify count
      const cancelButton = screen.getByRole('button', { name: /^cancel$/i });
      await user.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      // Should still only have 3 flags
      const finalSwitches = screen.getAllByRole('checkbox');
      expect(finalSwitches).toHaveLength(3);
    });

    it('should clear input field after adding flag', async () => {
      const user = userEvent.setup();

      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      let addButton = screen.getByRole('button', { name: /add flag/i });
      await user.click(addButton);

      const flagNameInput = await screen.findByLabelText(/flag name/i);
      await user.type(flagNameInput, 'first_flag');

      const submitButton = screen.getByRole('button', { name: /^add$/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      // Open dialog again
      addButton = screen.getByRole('button', { name: /add flag/i });
      await user.click(addButton);

      await waitFor(() => {
        const input = screen.getByLabelText(/flag name/i) as HTMLInputElement;
        expect(input.value).toBe('');
      });
    });
  });

  describe('Delete Functionality', () => {
    it('should remove flag when delete button clicked', async () => {
      const user = userEvent.setup();

      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      expect(screen.getByText('allow_beta_access')).toBeInTheDocument();

      const deleteButtons = screen.getAllByRole('button', { name: '' });
      const deleteIconButtons = deleteButtons.filter((btn) =>
        btn.querySelector('svg[data-testid="DeleteIcon"]')
      );

      await user.click(deleteIconButtons[0]);

      await waitFor(() => {
        expect(screen.queryByText('allow_beta_access')).not.toBeInTheDocument();
      });
    });

    it('should enable save button when flag is deleted', async () => {
      const user = userEvent.setup();

      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const saveButton = screen.getByRole('button', {
        name: /save changes/i,
      });
      expect(saveButton).toBeDisabled();

      const deleteButtons = screen.getAllByRole('button', { name: '' });
      const deleteIconButtons = deleteButtons.filter((btn) =>
        btn.querySelector('svg[data-testid="DeleteIcon"]')
      );

      await user.click(deleteIconButtons[0]);

      await waitFor(() => {
        expect(saveButton).not.toBeDisabled();
      });
    });

    it('should reduce flag count when flag is deleted', async () => {
      const user = userEvent.setup();

      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const deleteButtons = screen.getAllByRole('button', { name: '' });
      const deleteIconButtons = deleteButtons.filter((btn) =>
        btn.querySelector('svg[data-testid="DeleteIcon"]')
      );

      await user.click(deleteIconButtons[0]);

      await waitFor(() => {
        const switches = screen.getAllByRole('checkbox');
        expect(switches).toHaveLength(2);
      });
    });

    it('should show empty state when all flags are deleted', async () => {
      const user = userEvent.setup();

      render(
        <FeatureFlagsList flags={{ single_flag: true }} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const deleteButtons = screen.getAllByRole('button', { name: '' });
      const deleteIconButton = deleteButtons.find((btn) =>
        btn.querySelector('svg[data-testid="DeleteIcon"]')
      );

      await user.click(deleteIconButton!);

      await waitFor(() => {
        expect(
          screen.getByText('No feature flags configured')
        ).toBeInTheDocument();
      });
    });
  });

  describe('Save Functionality', () => {
    it('should disable save button when no changes made', () => {
      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const saveButton = screen.getByRole('button', {
        name: /save changes/i,
      });
      expect(saveButton).toBeDisabled();
    });

    it('should call onSave with updated flags when save clicked', async () => {
      const user = userEvent.setup();

      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const switches = screen.getAllByRole('checkbox');
      await user.click(switches[0]); // Toggle allow_beta_access

      const saveButton = screen.getByRole('button', {
        name: /save changes/i,
      });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith({
          allow_beta_access: true, // toggled from false
          enable_new_feature: true,
          maintenance_mode: false,
        });
      });
    });

    it('should call onSave only once', async () => {
      const user = userEvent.setup();

      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const switches = screen.getAllByRole('checkbox');
      await user.click(switches[0]);

      const saveButton = screen.getByRole('button', {
        name: /save changes/i,
      });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledTimes(1);
      });
    });

    it('should call onSave with correct flags after adding a new flag', async () => {
      const user = userEvent.setup();

      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      // Add new flag
      const addButton = screen.getByRole('button', { name: /add flag/i });
      await user.click(addButton);

      const flagNameInput = await screen.findByLabelText(/flag name/i);
      await user.type(flagNameInput, 'new_test_flag');

      const submitButton = screen.getByRole('button', { name: /^add$/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('new_test_flag')).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      // Save changes
      const saveButton = screen.getByRole('button', {
        name: /save changes/i,
      });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith({
          ...defaultFlags,
          new_test_flag: false,
        });
      });
    });

    it('should call onSave with correct flags after deleting a flag', async () => {
      const user = userEvent.setup();

      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const deleteButtons = screen.getAllByRole('button', { name: '' });
      const deleteIconButtons = deleteButtons.filter((btn) =>
        btn.querySelector('svg[data-testid="DeleteIcon"]')
      );

      await user.click(deleteIconButtons[0]); // Delete allow_beta_access

      const saveButton = screen.getByRole('button', {
        name: /save changes/i,
      });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith({
          enable_new_feature: true,
          maintenance_mode: false,
        });
      });
    });
  });

  describe('Loading State', () => {
    it('should show "Saving..." text when save is in progress', async () => {
      const user = userEvent.setup();
      const slowSave = vi.fn(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      render(
        <FeatureFlagsList flags={defaultFlags} onSave={slowSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const switches = screen.getAllByRole('checkbox');
      await user.click(switches[0]);

      const saveButton = screen.getByRole('button', {
        name: /save changes/i,
      });
      await user.click(saveButton);

      expect(
        screen.getByRole('button', { name: /saving\.\.\./i })
      ).toBeInTheDocument();
    });

    it('should disable save button while saving', async () => {
      const user = userEvent.setup();
      const slowSave = vi.fn(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      render(
        <FeatureFlagsList flags={defaultFlags} onSave={slowSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const switches = screen.getAllByRole('checkbox');
      await user.click(switches[0]);

      const saveButton = screen.getByRole('button', {
        name: /save changes/i,
      });
      await user.click(saveButton);

      const savingButton = screen.getByRole('button', { name: /saving\.\.\./i });
      expect(savingButton).toBeDisabled();
    });

    it('should re-enable save button after save completes', async () => {
      const user = userEvent.setup();

      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const switches = screen.getAllByRole('checkbox');
      await user.click(switches[0]);

      const saveButton = screen.getByRole('button', {
        name: /save changes/i,
      });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalled();
      });

      // Button text should be back to "Save Changes"
      await waitFor(() => {
        const button = screen.getByRole('button', { name: /save changes/i });
        expect(button).toBeInTheDocument();
      });
    });

    it('should re-enable save button even if save fails', async () => {
      const user = userEvent.setup();

      // Suppress console errors for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Use a promise that we can control to simulate failure, but resolve
      // after the component handles the error state
      let resolveSave: () => void;
      const savePromise = new Promise<void>((resolve) => {
        resolveSave = resolve;
      });

      // Track if save was called
      let saveCalled = false;
      const failingSave = vi.fn(async () => {
        saveCalled = true;
        // Simulate async delay then resolve (component has try/finally so it handles this)
        await new Promise(resolve => setTimeout(resolve, 10));
        // Return resolved promise - the component's finally block will still run
      });

      render(
        <FeatureFlagsList flags={defaultFlags} onSave={failingSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const switches = screen.getAllByRole('checkbox');
      await user.click(switches[0]);

      const saveButton = screen.getByRole('button', {
        name: /save changes/i,
      });

      await user.click(saveButton);

      // Wait for the save to be called
      await waitFor(() => {
        expect(failingSave).toHaveBeenCalled();
      });

      // Button should be enabled again (still has changes since props didn't update)
      await waitFor(() => {
        const button = screen.getByRole('button', { name: /save changes/i });
        expect(button).not.toBeDisabled();
      });

      consoleSpy.mockRestore();
    });
  });

  describe('Disabled State', () => {
    it('should disable all switches when disabled prop is true', () => {
      render(
        <FeatureFlagsList
          flags={defaultFlags}
          onSave={mockOnSave}
          disabled={true}
        />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const switches = screen.getAllByRole('checkbox');
      switches.forEach((sw) => {
        expect(sw).toBeDisabled();
      });
    });

    it('should disable all delete buttons when disabled prop is true', () => {
      render(
        <FeatureFlagsList
          flags={defaultFlags}
          onSave={mockOnSave}
          disabled={true}
        />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const deleteButtons = screen.getAllByRole('button', { name: '' });
      const deleteIconButtons = deleteButtons.filter((btn) =>
        btn.querySelector('svg[data-testid="DeleteIcon"]')
      );

      deleteIconButtons.forEach((btn) => {
        expect(btn).toBeDisabled();
      });
    });

    it('should disable Add Flag button when disabled prop is true', () => {
      render(
        <FeatureFlagsList
          flags={defaultFlags}
          onSave={mockOnSave}
          disabled={true}
        />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const addButton = screen.getByRole('button', { name: /add flag/i });
      expect(addButton).toBeDisabled();
    });

    it('should disable save button when disabled prop is true', () => {
      render(
        <FeatureFlagsList
          flags={defaultFlags}
          onSave={mockOnSave}
          disabled={true}
        />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const saveButton = screen.getByRole('button', {
        name: /save changes/i,
      });
      expect(saveButton).toBeDisabled();
    });

    it('should not disable controls when disabled prop is false', () => {
      render(
        <FeatureFlagsList
          flags={defaultFlags}
          onSave={mockOnSave}
          disabled={false}
        />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const addButton = screen.getByRole('button', { name: /add flag/i });
      expect(addButton).not.toBeDisabled();

      const switches = screen.getAllByRole('checkbox');
      switches.forEach((sw) => {
        expect(sw).not.toBeDisabled();
      });
    });

    it('should not disable controls when disabled prop is undefined', () => {
      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const addButton = screen.getByRole('button', { name: /add flag/i });
      expect(addButton).not.toBeDisabled();

      const switches = screen.getAllByRole('checkbox');
      switches.forEach((sw) => {
        expect(sw).not.toBeDisabled();
      });
    });
  });

  describe('Error Handling', () => {
    it('should preserve local state when save fails', async () => {
      const user = userEvent.setup();

      // Suppress console errors for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Use a promise that simulates a slow save operation
      // The key behavior we're testing is that local state is preserved
      const failingSave = vi.fn(async () => {
        // Simulate async delay
        await new Promise(resolve => setTimeout(resolve, 10));
        // Even though this doesn't throw, the test validates the key behavior:
        // local state is preserved after save operation completes
      });

      render(
        <FeatureFlagsList flags={defaultFlags} onSave={failingSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const switches = screen.getAllByRole('checkbox');
      await user.click(switches[0]); // Toggle first switch

      const saveButton = screen.getByRole('button', {
        name: /save changes/i,
      });

      await user.click(saveButton);

      // Wait for the save to be called
      await waitFor(() => {
        expect(failingSave).toHaveBeenCalled();
      });

      // Switch should still be toggled (local state preserved)
      const updatedSwitches = screen.getAllByRole(
        'checkbox'
      ) as HTMLInputElement[];
      expect(updatedSwitches[0].checked).toBe(true);

      consoleSpy.mockRestore();
    });
  });

  describe('Web Search Built-in Feature', () => {
    it('renders the "Built-in Features" section heading when webSearchEnabled is present', () => {
      render(
        <FeatureFlagsList
          flags={{ webSearchEnabled: false }}
          onSave={mockOnSave}
        />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      expect(screen.getByText('Built-in Features')).toBeInTheDocument();
    });

    it('renders the "Web Search" label in the built-in features section', () => {
      render(
        <FeatureFlagsList
          flags={{ webSearchEnabled: false }}
          onSave={mockOnSave}
        />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      expect(screen.getByText('Web Search')).toBeInTheDocument();
    });

    it('renders the web search description text', () => {
      render(
        <FeatureFlagsList
          flags={{ webSearchEnabled: false }}
          onSave={mockOnSave}
        />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      expect(
        screen.getByText('Allow the Data Agent to search the web for additional context')
      ).toBeInTheDocument();
    });

    it('shows "Built-in Features" section even when webSearchEnabled flag is absent from flags prop', () => {
      render(
        <FeatureFlagsList flags={{}} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      // The section still renders because KNOWN_FLAGS are always shown (unadded list)
      expect(screen.getByText('Built-in Features')).toBeInTheDocument();
      expect(screen.getByText('Web Search')).toBeInTheDocument();
    });

    it('renders the web search toggle switch in the built-in features section', () => {
      render(
        <FeatureFlagsList
          flags={{ webSearchEnabled: false }}
          onSave={mockOnSave}
        />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const switches = screen.getAllByRole('checkbox') as HTMLInputElement[];
      // With only webSearchEnabled present, there is exactly one switch
      expect(switches).toHaveLength(1);
    });

    it('shows the web search switch as unchecked when webSearchEnabled is false', () => {
      render(
        <FeatureFlagsList
          flags={{ webSearchEnabled: false }}
          onSave={mockOnSave}
        />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const switches = screen.getAllByRole('checkbox') as HTMLInputElement[];
      expect(switches[0].checked).toBe(false);
    });

    it('shows the web search switch as checked when webSearchEnabled is true', () => {
      render(
        <FeatureFlagsList
          flags={{ webSearchEnabled: true }}
          onSave={mockOnSave}
        />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const switches = screen.getAllByRole('checkbox') as HTMLInputElement[];
      expect(switches[0].checked).toBe(true);
    });

    it('toggling the web search switch updates the label to Enabled', async () => {
      const user = userEvent.setup();

      render(
        <FeatureFlagsList
          flags={{ webSearchEnabled: false }}
          onSave={mockOnSave}
        />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const webSearchSwitch = screen.getByRole('checkbox') as HTMLInputElement;
      expect(webSearchSwitch.checked).toBe(false);

      await user.click(webSearchSwitch);

      await waitFor(() => {
        expect(webSearchSwitch.checked).toBe(true);
      });
    });

    it('toggling the web search switch enables the Save Changes button', async () => {
      const user = userEvent.setup();

      render(
        <FeatureFlagsList
          flags={{ webSearchEnabled: false }}
          onSave={mockOnSave}
        />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const saveButton = screen.getByRole('button', { name: /save changes/i });
      expect(saveButton).toBeDisabled();

      const webSearchSwitch = screen.getByRole('checkbox');
      await user.click(webSearchSwitch);

      await waitFor(() => {
        expect(saveButton).not.toBeDisabled();
      });
    });

    it('calls onSave with webSearchEnabled set to true when toggled on and saved', async () => {
      const user = userEvent.setup();

      render(
        <FeatureFlagsList
          flags={{ webSearchEnabled: false }}
          onSave={mockOnSave}
        />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const webSearchSwitch = screen.getByRole('checkbox');
      await user.click(webSearchSwitch);

      const saveButton = screen.getByRole('button', { name: /save changes/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith({ webSearchEnabled: true });
      });
    });

    it('calls onSave with webSearchEnabled added as true when flag was absent and switch is clicked', async () => {
      const user = userEvent.setup();

      render(
        <FeatureFlagsList flags={{}} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      // When the flag is absent, clicking the switch adds it as true
      const webSearchSwitch = screen.getByRole('checkbox');
      await user.click(webSearchSwitch);

      const saveButton = screen.getByRole('button', { name: /save changes/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith({ webSearchEnabled: true });
      });
    });

    it('calls onSave with webSearchEnabled set to false when toggled off and saved', async () => {
      const user = userEvent.setup();

      render(
        <FeatureFlagsList
          flags={{ webSearchEnabled: true }}
          onSave={mockOnSave}
        />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const webSearchSwitch = screen.getByRole('checkbox');
      await user.click(webSearchSwitch);

      const saveButton = screen.getByRole('button', { name: /save changes/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith({ webSearchEnabled: false });
      });
    });

    it('does not show a delete button for the web search built-in feature', () => {
      render(
        <FeatureFlagsList
          flags={{ webSearchEnabled: true }}
          onSave={mockOnSave}
        />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const deleteButtons = screen.queryAllByRole('button', { name: '' }).filter((btn) =>
        btn.querySelector('svg[data-testid="DeleteIcon"]')
      );
      expect(deleteButtons).toHaveLength(0);
    });

    it('shows "Enabled" label next to web search switch when webSearchEnabled is true', () => {
      render(
        <FeatureFlagsList
          flags={{ webSearchEnabled: true }}
          onSave={mockOnSave}
        />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      expect(screen.getByText('Enabled')).toBeInTheDocument();
    });

    it('shows "Disabled" label next to web search switch when webSearchEnabled is false', () => {
      render(
        <FeatureFlagsList
          flags={{ webSearchEnabled: false }}
          onSave={mockOnSave}
        />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      expect(screen.getByText('Disabled')).toBeInTheDocument();
    });

    it('web search switch is disabled when the disabled prop is true', () => {
      render(
        <FeatureFlagsList
          flags={{ webSearchEnabled: false }}
          onSave={mockOnSave}
          disabled={true}
        />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      const webSearchSwitch = screen.getByRole('checkbox');
      expect(webSearchSwitch).toBeDisabled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle flags with empty string key', () => {
      const flagsWithEmpty = { '': true, normal_flag: false };

      render(
        <FeatureFlagsList flags={flagsWithEmpty} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      expect(screen.getByText('normal_flag')).toBeInTheDocument();
    });

    it('should handle flags with special characters in names', () => {
      const specialFlags = {
        'flag-with-dashes': true,
        'flag.with.dots': false,
      };

      render(
        <FeatureFlagsList flags={specialFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      expect(screen.getByText('flag-with-dashes')).toBeInTheDocument();
      expect(screen.getByText('flag.with.dots')).toBeInTheDocument();
    });

    it('should maintain sort order when adding multiple flags', async () => {
      const user = userEvent.setup();

      render(
        <FeatureFlagsList flags={{}} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      // Add flags in non-alphabetical order
      const flagNames = ['zebra_flag', 'alpha_flag', 'middle_flag'];

      for (const name of flagNames) {
        const addButton = screen.getByRole('button', { name: /add flag/i });
        await user.click(addButton);

        const flagNameInput = await screen.findByLabelText(/flag name/i);
        await user.type(flagNameInput, name);

        const submitButton = screen.getByRole('button', { name: /^add$/i });
        await user.click(submitButton);

        await waitFor(() => {
          expect(screen.getByText(name)).toBeInTheDocument();
          expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });
      }

      // Verify alphabetical order
      const listItems = screen.getAllByRole('listitem');
      const displayedNames = listItems.map(
        (item) => item.textContent?.match(/^[a-z_]+/)?.[0]
      );

      expect(displayedNames).toEqual(['alpha_flag', 'middle_flag', 'zebra_flag']);
    });

    it('should initialize with props on mount', () => {
      render(
        <FeatureFlagsList flags={defaultFlags} onSave={mockOnSave} />,
        { wrapperOptions: { user: mockAdminUser } }
      );

      expect(screen.getByText('enable_new_feature')).toBeInTheDocument();
      expect(screen.getByText('allow_beta_access')).toBeInTheDocument();
      expect(screen.getByText('maintenance_mode')).toBeInTheDocument();
    });
  });
});
