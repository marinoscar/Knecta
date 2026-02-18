import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../../utils/test-utils';
import { ConnectionDialog } from '../../../components/connections/ConnectionDialog';

// Helper: find the MUI Select combobox whose label contains the given text.
// MUI renders required field labels with a thin space (U+2009) before the asterisk,
// so we use includes() rather than strict equality for robustness.
function getSelectByLabel(labelText: string): HTMLElement {
  const comboboxes = screen.getAllByRole('combobox');
  const match = comboboxes.find((cb) => {
    const label = cb
      .closest('.MuiFormControl-root')
      ?.querySelector('[class*="MuiInputLabel"]');
    return label?.textContent?.includes(labelText);
  });
  if (!match) {
    throw new Error(`Could not find combobox with label containing "${labelText}"`);
  }
  return match;
}

describe('ConnectionDialog', () => {
  const mockOnClose = vi.fn();
  const mockOnSave = vi.fn();
  const mockOnTestNew = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSave.mockResolvedValue(undefined);
    mockOnTestNew.mockResolvedValue({ success: true, message: 'Connection successful', latencyMs: 42 });
  });

  describe('Snowflake-specific form fields', () => {
    it('shows Account, Warehouse, Role, and Schema fields when Snowflake type is selected', async () => {
      const user = userEvent.setup();

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      // Open the Database Type select and choose Snowflake
      const dbTypeSelect = getSelectByLabel('Database Type');
      await user.click(dbTypeSelect);

      const snowflakeOption = await screen.findByRole('option', { name: /snowflake/i });
      await user.click(snowflakeOption);

      // Snowflake-specific fields should now be visible
      expect(screen.getByLabelText(/^account/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^warehouse/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^role/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^schema/i)).toBeInTheDocument();
    });

    it('does not show Snowflake-specific fields when PostgreSQL type is selected', () => {
      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      // Default type is PostgreSQL — Snowflake-only fields should not be present
      expect(screen.queryByLabelText(/^account/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/^warehouse/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/^role/i)).not.toBeInTheDocument();
    });
  });

  describe('Snowflake Account validation', () => {
    it('shows an error when submitting a Snowflake connection without an Account value', async () => {
      const user = userEvent.setup();

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      // Select Snowflake as database type
      const dbTypeSelect = getSelectByLabel('Database Type');
      await user.click(dbTypeSelect);

      const snowflakeOption = await screen.findByRole('option', { name: /snowflake/i });
      await user.click(snowflakeOption);

      // Fill in required Name and Host but leave Account empty
      await user.type(screen.getByLabelText(/connection name/i), 'My Snowflake');
      await user.type(screen.getByLabelText(/^host/i), 'xy12345.us-east-1.snowflakecomputing.com');

      // Submit without filling in Account
      await user.click(screen.getByRole('button', { name: /create/i }));

      await waitFor(() => {
        expect(screen.getByText(/account is required for snowflake/i)).toBeInTheDocument();
      });

      expect(mockOnSave).not.toHaveBeenCalled();
    });

    it('does not show Account validation error when Account is provided', async () => {
      const user = userEvent.setup();

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      // Select Snowflake
      const dbTypeSelect = getSelectByLabel('Database Type');
      await user.click(dbTypeSelect);

      const snowflakeOption = await screen.findByRole('option', { name: /snowflake/i });
      await user.click(snowflakeOption);

      // Fill in all required fields including Account
      await user.type(screen.getByLabelText(/connection name/i), 'My Snowflake');
      await user.type(screen.getByLabelText(/^host/i), 'xy12345.us-east-1.snowflakecomputing.com');
      await user.type(screen.getByLabelText(/^account/i), 'xy12345.us-east-1');

      await user.click(screen.getByRole('button', { name: /create/i }));

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalled();
      });

      expect(screen.queryByText(/account is required for snowflake/i)).not.toBeInTheDocument();
    });
  });
});
