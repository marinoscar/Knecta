import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../../utils/test-utils';
import { PreferencesDialog } from '../../../components/data-agent/PreferencesDialog';
import type { AgentPreference } from '../../../services/api';

describe('PreferencesDialog', () => {
  const mockOnClose = vi.fn();
  const mockOnAdd = vi.fn().mockResolvedValue(undefined);
  const mockOnEdit = vi.fn().mockResolvedValue(undefined);
  const mockOnDelete = vi.fn().mockResolvedValue(undefined);
  const mockOnClearAll = vi.fn().mockResolvedValue(undefined);

  const mockGlobalPrefs: AgentPreference[] = [
    {
      id: 'pref-1',
      userId: 'user-1',
      ontologyId: null,
      key: 'date_format',
      value: 'YYYY-MM-DD',
      source: 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'pref-2',
      userId: 'user-1',
      ontologyId: null,
      key: 'currency',
      value: 'USD',
      source: 'auto_captured',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const mockOntologyPrefs: AgentPreference[] = [
    {
      id: 'pref-3',
      userId: 'user-1',
      ontologyId: 'ont-1',
      key: 'default_region',
      value: 'North America',
      source: 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const allPreferences = [...mockGlobalPrefs, ...mockOntologyPrefs];

  const defaultProps = {
    open: true,
    onClose: mockOnClose,
    ontologyId: 'ont-1',
    ontologyName: 'Sales DB',
    preferences: allPreferences,
    onAdd: mockOnAdd,
    onEdit: mockOnEdit,
    onDelete: mockOnDelete,
    onClearAll: mockOnClearAll,
    isLoading: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure mocks always return resolved promises
    mockOnAdd.mockResolvedValue(undefined);
    mockOnEdit.mockResolvedValue(undefined);
    mockOnDelete.mockResolvedValue(undefined);
    mockOnClearAll.mockResolvedValue(undefined);
  });

  describe('Visibility', () => {
    it('renders dialog when open is true', () => {
      render(<PreferencesDialog {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Agent Preferences')).toBeInTheDocument();
    });

    it('does not render dialog content when open is false', () => {
      render(<PreferencesDialog {...defaultProps} open={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('Tabs', () => {
    it('shows two tabs: Global and ontology name', () => {
      render(<PreferencesDialog {...defaultProps} />);

      expect(screen.getByRole('tab', { name: /global/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /sales db/i })).toBeInTheDocument();
    });

    it('shows fallback "Ontology" tab label when ontologyName is not provided', () => {
      render(<PreferencesDialog {...defaultProps} ontologyName={undefined} />);

      expect(screen.getByRole('tab', { name: /ontology/i })).toBeInTheDocument();
    });

    it('shows preference counts in tab labels', () => {
      render(<PreferencesDialog {...defaultProps} />);

      // Global tab: 2 prefs (excluding auto_capture_mode)
      expect(screen.getByRole('tab', { name: /global \(2\)/i })).toBeInTheDocument();
      // Ontology tab: 1 pref
      expect(screen.getByRole('tab', { name: /sales db \(1\)/i })).toBeInTheDocument();
    });

    it('shows global preferences by default (first tab active)', () => {
      render(<PreferencesDialog {...defaultProps} />);

      expect(screen.getByText('date_format')).toBeInTheDocument();
      expect(screen.getByText('YYYY-MM-DD')).toBeInTheDocument();
    });

    it('shows ontology preferences when ontology tab is clicked', async () => {
      const user = userEvent.setup();

      render(<PreferencesDialog {...defaultProps} />);

      await user.click(screen.getByRole('tab', { name: /sales db/i }));

      await waitFor(() => {
        expect(screen.getByText('default_region')).toBeInTheDocument();
      });
      expect(screen.getByText('North America')).toBeInTheDocument();
    });

    it('global preferences are not shown when ontology tab is active', async () => {
      const user = userEvent.setup();

      render(<PreferencesDialog {...defaultProps} />);

      await user.click(screen.getByRole('tab', { name: /sales db/i }));

      await waitFor(() => {
        expect(screen.queryByText('date_format')).not.toBeInTheDocument();
      });
    });
  });

  describe('Auto-captured Badge', () => {
    it('shows "auto" badge for auto_captured preferences', () => {
      render(<PreferencesDialog {...defaultProps} />);

      // The "currency" pref has source: 'auto_captured'
      expect(screen.getByText('auto')).toBeInTheDocument();
    });

    it('does not show "auto" badge for manually created preferences', () => {
      render(
        <PreferencesDialog
          {...defaultProps}
          preferences={[mockGlobalPrefs[0]]} // Only manual pref
        />,
      );

      expect(screen.queryByText('auto')).not.toBeInTheDocument();
    });
  });

  // Helper: find the Add icon button in the add form row (it shares a parent Box
  // with the two text inputs; it has an AddIcon child SVG)
  function getAddButton() {
    const addIcon = screen.getByTestId('AddIcon');
    return addIcon.closest('button') as HTMLElement;
  }

  describe('Add Form', () => {
    it('calls onAdd with correct data on global tab (ontologyId: null)', async () => {
      const user = userEvent.setup();

      render(<PreferencesDialog {...defaultProps} />);

      const keyInput = screen.getByPlaceholderText('Preference name');
      const valueInput = screen.getByPlaceholderText('Value');

      await user.type(keyInput, 'new_key');
      await user.type(valueInput, 'new_value');
      await user.click(getAddButton());

      await waitFor(() => {
        expect(mockOnAdd).toHaveBeenCalledWith({
          ontologyId: null,
          key: 'new_key',
          value: 'new_value',
        });
      });
    });

    it('calls onAdd with ontologyId set when on ontology tab', async () => {
      const user = userEvent.setup();

      render(<PreferencesDialog {...defaultProps} />);

      // Switch to ontology tab
      await user.click(screen.getByRole('tab', { name: /sales db/i }));

      // Fill form
      const keyInput = screen.getByPlaceholderText('Preference name');
      const valueInput = screen.getByPlaceholderText('Value');

      await user.type(keyInput, 'region_filter');
      await user.type(valueInput, 'EMEA');
      await user.click(getAddButton());

      await waitFor(() => {
        expect(mockOnAdd).toHaveBeenCalledWith({
          ontologyId: 'ont-1',
          key: 'region_filter',
          value: 'EMEA',
        });
      });
    });

    it('clears form fields after successful add', async () => {
      const user = userEvent.setup();

      render(<PreferencesDialog {...defaultProps} />);

      const keyInput = screen.getByPlaceholderText('Preference name');
      const valueInput = screen.getByPlaceholderText('Value');

      await user.type(keyInput, 'test_key');
      await user.type(valueInput, 'test_value');
      await user.click(getAddButton());

      await waitFor(() => {
        expect(keyInput).toHaveValue('');
        expect(valueInput).toHaveValue('');
      });
    });

    it('does not call onAdd when key is empty', async () => {
      const user = userEvent.setup();

      render(<PreferencesDialog {...defaultProps} />);

      const valueInput = screen.getByPlaceholderText('Value');
      await user.type(valueInput, 'some_value');

      // Add button is disabled when key is empty - verify and skip click
      expect(getAddButton()).toBeDisabled();
      expect(mockOnAdd).not.toHaveBeenCalled();
    });

    it('does not call onAdd when value is empty', async () => {
      const user = userEvent.setup();

      render(<PreferencesDialog {...defaultProps} />);

      const keyInput = screen.getByPlaceholderText('Preference name');
      await user.type(keyInput, 'some_key');

      // Add button is disabled when value is empty - verify and skip click
      expect(getAddButton()).toBeDisabled();
      expect(mockOnAdd).not.toHaveBeenCalled();
    });

    it('submits form when Enter is pressed in value input', async () => {
      const user = userEvent.setup();

      render(<PreferencesDialog {...defaultProps} />);

      const keyInput = screen.getByPlaceholderText('Preference name');
      const valueInput = screen.getByPlaceholderText('Value');

      await user.type(keyInput, 'my_key');
      await user.type(valueInput, 'my_value{Enter}');

      await waitFor(() => {
        expect(mockOnAdd).toHaveBeenCalledWith({
          ontologyId: null,
          key: 'my_key',
          value: 'my_value',
        });
      });
    });
  });

  describe('Edit Inline', () => {
    it('shows edit input when edit icon is clicked', async () => {
      const user = userEvent.setup();

      render(<PreferencesDialog {...defaultProps} />);

      // Find and click the edit button for the first preference
      const editButtons = screen.getAllByTestId('EditIcon');
      await user.click(editButtons[0].closest('button')!);

      // Edit input should appear with the current value
      await waitFor(() => {
        const editInputs = screen.getAllByRole('textbox');
        // One of the inputs should have the current preference value
        const hasValueInput = editInputs.some((input) =>
          input.getAttribute('value') === 'YYYY-MM-DD',
        );
        expect(hasValueInput).toBe(true);
      });
    });

    it('calls onEdit with correct id and value when Save is clicked', async () => {
      const user = userEvent.setup();

      render(<PreferencesDialog {...defaultProps} />);

      // Click edit icon for first preference (date_format)
      const editButtons = screen.getAllByTestId('EditIcon');
      await user.click(editButtons[0].closest('button')!);

      // Find edit input (it gets autoFocus and has the current value)
      await waitFor(() => {
        expect(screen.getByDisplayValue('YYYY-MM-DD')).toBeInTheDocument();
      });

      const editInput = screen.getByDisplayValue('YYYY-MM-DD');
      await user.clear(editInput);
      await user.type(editInput, 'MM/DD/YYYY');

      await user.click(screen.getByRole('button', { name: /^save$/i }));

      await waitFor(() => {
        expect(mockOnEdit).toHaveBeenCalledWith('pref-1', 'MM/DD/YYYY');
      });
    });

    it('hides edit input after successful save', async () => {
      const user = userEvent.setup();

      render(<PreferencesDialog {...defaultProps} />);

      const editButtons = screen.getAllByTestId('EditIcon');
      await user.click(editButtons[0].closest('button')!);

      await waitFor(() => {
        expect(screen.getByDisplayValue('YYYY-MM-DD')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^save$/i }));

      await waitFor(() => {
        expect(screen.queryByDisplayValue('YYYY-MM-DD')).not.toBeInTheDocument();
      });
    });

    it('cancels edit when Cancel button is clicked', async () => {
      const user = userEvent.setup();

      render(<PreferencesDialog {...defaultProps} />);

      const editButtons = screen.getAllByTestId('EditIcon');
      await user.click(editButtons[0].closest('button')!);

      await waitFor(() => {
        expect(screen.getByDisplayValue('YYYY-MM-DD')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^cancel$/i }));

      await waitFor(() => {
        expect(screen.queryByDisplayValue('YYYY-MM-DD')).not.toBeInTheDocument();
      });

      expect(mockOnEdit).not.toHaveBeenCalled();
    });

    it('saves edit when Enter is pressed in edit input', async () => {
      const user = userEvent.setup();

      render(<PreferencesDialog {...defaultProps} />);

      const editButtons = screen.getAllByTestId('EditIcon');
      await user.click(editButtons[0].closest('button')!);

      await waitFor(() => {
        expect(screen.getByDisplayValue('YYYY-MM-DD')).toBeInTheDocument();
      });

      const editInput = screen.getByDisplayValue('YYYY-MM-DD');
      await user.clear(editInput);
      await user.type(editInput, 'DD/MM/YYYY{Enter}');

      await waitFor(() => {
        expect(mockOnEdit).toHaveBeenCalledWith('pref-1', 'DD/MM/YYYY');
      });
    });

    it('cancels edit when Escape is pressed in edit input', async () => {
      const user = userEvent.setup();

      render(<PreferencesDialog {...defaultProps} />);

      const editButtons = screen.getAllByTestId('EditIcon');
      await user.click(editButtons[0].closest('button')!);

      await waitFor(() => {
        expect(screen.getByDisplayValue('YYYY-MM-DD')).toBeInTheDocument();
      });

      await user.keyboard('{Escape}');

      await waitFor(() => {
        expect(screen.queryByDisplayValue('YYYY-MM-DD')).not.toBeInTheDocument();
      });

      expect(mockOnEdit).not.toHaveBeenCalled();
    });
  });

  describe('Delete', () => {
    it('calls onDelete with preference id when delete icon is clicked', async () => {
      const user = userEvent.setup();

      render(<PreferencesDialog {...defaultProps} />);

      const deleteButtons = screen.getAllByTestId('DeleteIcon');
      await user.click(deleteButtons[0].closest('button')!);

      expect(mockOnDelete).toHaveBeenCalledWith('pref-1');
    });

    it('calls onDelete for the correct preference when multiple exist', async () => {
      const user = userEvent.setup();

      render(<PreferencesDialog {...defaultProps} />);

      const deleteButtons = screen.getAllByTestId('DeleteIcon');
      // Click the second delete button (currency pref)
      await user.click(deleteButtons[1].closest('button')!);

      expect(mockOnDelete).toHaveBeenCalledWith('pref-2');
    });
  });

  describe('Clear All', () => {
    it('shows confirmation dialog when Clear All is clicked', async () => {
      const user = userEvent.setup();

      render(<PreferencesDialog {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /clear all/i }));

      await waitFor(() => {
        expect(screen.getByText(/clear all global preferences\?/i)).toBeInTheDocument();
      });
    });

    it('calls onClearAll with undefined when confirmed on global tab', async () => {
      const user = userEvent.setup();

      render(<PreferencesDialog {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /clear all/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /confirm/i }));

      await waitFor(() => {
        expect(mockOnClearAll).toHaveBeenCalledWith(undefined);
      });
    });

    it('calls onClearAll with ontologyId when confirmed on ontology tab', async () => {
      const user = userEvent.setup();

      render(<PreferencesDialog {...defaultProps} />);

      // Switch to ontology tab
      await user.click(screen.getByRole('tab', { name: /sales db/i }));

      await waitFor(() => {
        expect(screen.getByText('default_region')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /clear all/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /confirm/i }));

      await waitFor(() => {
        expect(mockOnClearAll).toHaveBeenCalledWith('ont-1');
      });
    });

    it('does not call onClearAll when cancel is clicked in confirmation', async () => {
      const user = userEvent.setup();

      render(<PreferencesDialog {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /clear all/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^cancel$/i }));

      expect(mockOnClearAll).not.toHaveBeenCalled();
    });

    it('Clear All button is disabled when there are no preferences for current tab', async () => {
      const user = userEvent.setup();

      render(
        <PreferencesDialog
          {...defaultProps}
          preferences={mockOntologyPrefs} // No global prefs
        />,
      );

      // Global tab (default) should have 0 prefs
      const clearAllButton = screen.getByRole('button', { name: /clear all/i });
      expect(clearAllButton).toBeDisabled();
    });
  });

  describe('Auto-capture Mode Toggle', () => {
    it('shows Off, Auto, and Ask toggle buttons', () => {
      render(<PreferencesDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'Off' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Auto' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Ask' })).toBeInTheDocument();
    });

    it('defaults to "auto" mode when no auto_capture_mode preference exists', () => {
      render(
        <PreferencesDialog
          {...defaultProps}
          preferences={mockGlobalPrefs} // No auto_capture_mode pref
        />,
      );

      const autoButton = screen.getByRole('button', { name: 'Auto' });
      expect(autoButton).toHaveClass('Mui-selected');
    });

    it('reflects existing auto_capture_mode preference value', () => {
      const prefsWithCapture: AgentPreference[] = [
        ...mockGlobalPrefs,
        {
          id: 'pref-capture',
          userId: 'user-1',
          ontologyId: null,
          key: 'auto_capture_mode',
          value: 'ask',
          source: 'manual',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      render(
        <PreferencesDialog
          {...defaultProps}
          preferences={prefsWithCapture}
        />,
      );

      const askButton = screen.getByRole('button', { name: 'Ask' });
      expect(askButton).toHaveClass('Mui-selected');
    });

    it('calls onAdd with auto_capture_mode key when toggle is changed', async () => {
      const user = userEvent.setup();

      render(<PreferencesDialog {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'Off' }));

      await waitFor(() => {
        expect(mockOnAdd).toHaveBeenCalledWith({
          ontologyId: null,
          key: 'auto_capture_mode',
          value: 'off',
        });
      });
    });

    it('shows correct description text for each mode', async () => {
      const user = userEvent.setup();

      render(
        <PreferencesDialog
          {...defaultProps}
          preferences={mockGlobalPrefs} // No auto_capture_mode, defaults to 'auto'
        />,
      );

      // Default is 'auto'
      expect(
        screen.getByText(/clarification answers are automatically saved as preferences/i),
      ).toBeInTheDocument();

      // Switch to 'off'
      await user.click(screen.getByRole('button', { name: 'Off' }));

      await waitFor(() => {
        expect(
          screen.getByText(/clarification answers are not saved as preferences/i),
        ).toBeInTheDocument();
      });

      // Switch to 'ask'
      await user.click(screen.getByRole('button', { name: 'Ask' }));

      await waitFor(() => {
        expect(
          screen.getByText(/you will be asked before saving clarification answers/i),
        ).toBeInTheDocument();
      });
    });
  });

  describe('Empty State', () => {
    it('shows empty state message when no global preferences exist', () => {
      render(
        <PreferencesDialog
          {...defaultProps}
          preferences={mockOntologyPrefs} // Only ontology prefs, no global
        />,
      );

      expect(
        screen.getByText(/no global preferences yet/i),
      ).toBeInTheDocument();
    });

    it('shows empty state message when no ontology preferences exist', async () => {
      const user = userEvent.setup();

      render(
        <PreferencesDialog
          {...defaultProps}
          preferences={mockGlobalPrefs} // Only global prefs, no ontology
        />,
      );

      await user.click(screen.getByRole('tab', { name: /sales db/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/no ontology preferences yet/i),
        ).toBeInTheDocument();
      });
    });

    it('shows preference list when preferences exist', () => {
      render(<PreferencesDialog {...defaultProps} />);

      // date_format and currency are global prefs
      expect(screen.getByText('date_format')).toBeInTheDocument();
      expect(screen.getByText('currency')).toBeInTheDocument();
    });
  });

  describe('Dialog Actions', () => {
    it('closes dialog when the close icon button is clicked', async () => {
      const user = userEvent.setup();

      render(<PreferencesDialog {...defaultProps} />);

      // Find the close button in the dialog title area
      const dialog = screen.getByRole('dialog');
      const closeButton = within(dialog).getByTestId('CloseIcon').closest('button')!;
      await user.click(closeButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Loading State', () => {
    it('disables add form inputs when isLoading is true', () => {
      render(<PreferencesDialog {...defaultProps} isLoading={true} />);

      expect(screen.getByPlaceholderText('Preference name')).toBeDisabled();
      expect(screen.getByPlaceholderText('Value')).toBeDisabled();
    });
  });
});
