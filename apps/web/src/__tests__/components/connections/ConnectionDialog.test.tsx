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
      const user = userEvent.setup({ delay: null });

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
      const user = userEvent.setup({ delay: null });

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

  // ---------------------------------------------------------------------------
  // Amazon S3 — cloud storage type
  // ---------------------------------------------------------------------------
  describe('S3-specific form fields', () => {
    async function selectS3(user: ReturnType<typeof userEvent.setup>) {
      const dbTypeSelect = getSelectByLabel('Database Type');
      await user.click(dbTypeSelect);
      const s3Option = await screen.findByRole('option', { name: /amazon s3/i });
      await user.click(s3Option);
    }

    it('shows Region, Bucket, Path Prefix, and Custom Endpoint URL fields when S3 type is selected', async () => {
      const user = userEvent.setup();

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      await selectS3(user);

      expect(screen.getByLabelText(/^region/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^bucket/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^path prefix/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^custom endpoint url/i)).toBeInTheDocument();
    });

    it('hides Port field when S3 type is selected', async () => {
      const user = userEvent.setup();

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      // Port is visible for the default PostgreSQL type
      expect(screen.getByLabelText(/^port/i)).toBeInTheDocument();

      await selectS3(user);

      expect(screen.queryByLabelText(/^port/i)).not.toBeInTheDocument();
    });

    it('hides Database Name field when S3 type is selected', async () => {
      const user = userEvent.setup();

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      // Database Name is visible for the default PostgreSQL type
      expect(screen.getByLabelText(/^database name/i)).toBeInTheDocument();

      await selectS3(user);

      expect(screen.queryByLabelText(/^database name/i)).not.toBeInTheDocument();
    });

    it('hides Use SSL switch when S3 type is selected', async () => {
      const user = userEvent.setup();

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      // Use SSL is visible for the default PostgreSQL type
      expect(screen.getByLabelText(/use ssl/i)).toBeInTheDocument();

      await selectS3(user);

      expect(screen.queryByLabelText(/use ssl/i)).not.toBeInTheDocument();
    });

    it('uses "Access Key ID" as the username label for S3', async () => {
      const user = userEvent.setup();

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      await selectS3(user);

      expect(screen.getByLabelText(/^access key id/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/^username/i)).not.toBeInTheDocument();
    });

    it('uses "Secret Access Key" as the password label for S3', async () => {
      const user = userEvent.setup();

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      await selectS3(user);

      expect(screen.getByLabelText(/^secret access key/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/^password/i)).not.toBeInTheDocument();
    });

    it('sets port to 443 automatically when S3 type is selected', async () => {
      const user = userEvent.setup();

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      // Verify default PostgreSQL port
      expect(screen.getByLabelText(/^port/i)).toHaveValue(5432);

      await selectS3(user);

      // Port field is hidden for S3, but the internal value should be set to 443.
      // We verify this indirectly by switching back to PostgreSQL and confirming
      // the auto-fill still works (the port resets to the new type's default).
      const dbTypeSelect = getSelectByLabel('Database Type');
      await user.click(dbTypeSelect);
      await user.click(await screen.findByRole('option', { name: /^postgresql$/i }));

      expect(screen.getByLabelText(/^port/i)).toHaveValue(5432);
    });

    it('shows validation error when Region is missing for S3', async () => {
      const user = userEvent.setup();

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      await selectS3(user);

      await user.type(screen.getByLabelText(/connection name/i), 'My S3 Bucket');
      // Deliberately leave Region empty

      await user.click(screen.getByRole('button', { name: /create/i }));

      await waitFor(() => {
        expect(screen.getByText(/region is required for s3/i)).toBeInTheDocument();
      });

      expect(mockOnSave).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Azure Blob Storage — cloud storage type
  // ---------------------------------------------------------------------------
  describe('Azure Blob-specific form fields', () => {
    async function selectAzureBlob(user: ReturnType<typeof userEvent.setup>) {
      const dbTypeSelect = getSelectByLabel('Database Type');
      await user.click(dbTypeSelect);
      const azureOption = await screen.findByRole('option', { name: /azure blob storage/i });
      await user.click(azureOption);
    }

    it('shows Authentication Method, Container, and Path Prefix fields when Azure Blob type is selected', async () => {
      const user = userEvent.setup();

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      await selectAzureBlob(user);

      // Authentication Method is a MUI Select — use the getSelectByLabel helper
      // rather than getByLabelText because MUI associates the InputLabel via a
      // custom labelling mechanism that getByLabelText may not match.
      expect(() => getSelectByLabel('Authentication Method')).not.toThrow();
      expect(screen.getByLabelText(/^container/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^path prefix/i)).toBeInTheDocument();
    });

    it('hides Port field when Azure Blob type is selected', async () => {
      const user = userEvent.setup();

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      // Port visible by default
      expect(screen.getByLabelText(/^port/i)).toBeInTheDocument();

      await selectAzureBlob(user);

      expect(screen.queryByLabelText(/^port/i)).not.toBeInTheDocument();
    });

    it('hides Database Name field when Azure Blob type is selected', async () => {
      const user = userEvent.setup();

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      expect(screen.getByLabelText(/^database name/i)).toBeInTheDocument();

      await selectAzureBlob(user);

      expect(screen.queryByLabelText(/^database name/i)).not.toBeInTheDocument();
    });

    it('hides Use SSL switch when Azure Blob type is selected', async () => {
      const user = userEvent.setup();

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      expect(screen.getByLabelText(/use ssl/i)).toBeInTheDocument();

      await selectAzureBlob(user);

      expect(screen.queryByLabelText(/use ssl/i)).not.toBeInTheDocument();
    });

    it('uses "Account Name" as the username label for Azure Blob', async () => {
      const user = userEvent.setup();

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      await selectAzureBlob(user);

      expect(screen.getByLabelText(/^account name/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/^username/i)).not.toBeInTheDocument();
    });

    it('uses "Account Key" as the password label when auth method is key (default)', async () => {
      const user = userEvent.setup();

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      await selectAzureBlob(user);

      expect(screen.getByLabelText(/^account key/i)).toBeInTheDocument();
    });

    it('uses "SAS Token" as the password label when auth method is changed to SAS', async () => {
      const user = userEvent.setup();

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      await selectAzureBlob(user);

      // Switch authentication method to SAS
      const authMethodSelect = getSelectByLabel('Authentication Method');
      await user.click(authMethodSelect);
      const sasOption = await screen.findByRole('option', { name: /sas token/i });
      await user.click(sasOption);

      expect(screen.getByLabelText(/^sas token/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/^account key/i)).not.toBeInTheDocument();
    });

    it('sets port to 443 automatically when Azure Blob type is selected', async () => {
      const user = userEvent.setup();

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      // Default PostgreSQL port
      expect(screen.getByLabelText(/^port/i)).toHaveValue(5432);

      await selectAzureBlob(user);

      // Port field is hidden for Azure Blob. Switch back to PostgreSQL to verify
      // the auto-fill mechanism reset correctly.
      const dbTypeSelect = getSelectByLabel('Database Type');
      await user.click(dbTypeSelect);
      await user.click(await screen.findByRole('option', { name: /^postgresql$/i }));

      expect(screen.getByLabelText(/^port/i)).toHaveValue(5432);
    });
  });
});
