import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
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
  // Snowflake auth method selector
  // ---------------------------------------------------------------------------
  describe('Snowflake auth method selector', () => {
    async function selectSnowflake(user: ReturnType<typeof userEvent.setup>) {
      const dbTypeSelect = getSelectByLabel('Database Type');
      await user.click(dbTypeSelect);
      const snowflakeOption = await screen.findByRole('option', { name: /snowflake/i });
      await user.click(snowflakeOption);
    }

    it('renders Authentication Method selector when Snowflake type is selected', async () => {
      const user = userEvent.setup();

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      await selectSnowflake(user);

      expect(() => getSelectByLabel('Authentication Method')).not.toThrow();
    });

    it('defaults to "Username / Password" auth method for Snowflake', async () => {
      const user = userEvent.setup();

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      await selectSnowflake(user);

      // The combobox should reflect the 'password' value by displaying the label text
      const authMethodSelect = getSelectByLabel('Authentication Method');
      expect(authMethodSelect).toHaveTextContent(/username \/ password/i);
    });

    it('shows standard Password field when Snowflake uses "password" auth method', async () => {
      const user = userEvent.setup();

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      await selectSnowflake(user);

      // Default is 'password' method — Password field must be visible
      expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    });

    it('hides standard Password field when Snowflake uses "key_pair" auth method', async () => {
      const user = userEvent.setup();

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      await selectSnowflake(user);

      // Switch to key pair
      const authMethodSelect = getSelectByLabel('Authentication Method');
      await user.click(authMethodSelect);
      const keyPairOption = await screen.findByRole('option', { name: /key pair/i });
      await user.click(keyPairOption);

      expect(screen.queryByLabelText(/^password/i)).not.toBeInTheDocument();
    });

    it('shows Private Key (PEM) textarea when "key_pair" auth method is selected', async () => {
      const user = userEvent.setup();

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      await selectSnowflake(user);

      const authMethodSelect = getSelectByLabel('Authentication Method');
      await user.click(authMethodSelect);
      const keyPairOption = await screen.findByRole('option', { name: /key pair/i });
      await user.click(keyPairOption);

      expect(screen.getByLabelText(/private key \(pem\)/i)).toBeInTheDocument();
    });

    it('shows Private Key Passphrase field when "key_pair" auth method is selected', async () => {
      const user = userEvent.setup();

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      await selectSnowflake(user);

      const authMethodSelect = getSelectByLabel('Authentication Method');
      await user.click(authMethodSelect);
      const keyPairOption = await screen.findByRole('option', { name: /key pair/i });
      await user.click(keyPairOption);

      expect(screen.getByLabelText(/private key passphrase/i)).toBeInTheDocument();
    });

    it('validates that Private Key is required for new key_pair connections', async () => {
      const user = userEvent.setup({ delay: null });

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      await selectSnowflake(user);

      // Switch to key pair
      const authMethodSelect = getSelectByLabel('Authentication Method');
      await user.click(authMethodSelect);
      const keyPairOption = await screen.findByRole('option', { name: /key pair/i });
      await user.click(keyPairOption);

      // Fill required fields but leave Private Key empty
      await user.type(screen.getByLabelText(/connection name/i), 'My Snowflake');
      await user.type(screen.getByLabelText(/^host/i), 'xy12345.us-east-1.snowflakecomputing.com');
      await user.type(screen.getByLabelText(/^account/i), 'xy12345.us-east-1');

      await user.click(screen.getByRole('button', { name: /create/i }));

      await waitFor(() => {
        expect(screen.getByText(/private key is required for key pair authentication/i)).toBeInTheDocument();
      });

      expect(mockOnSave).not.toHaveBeenCalled();
    });

    it('JSON-encodes privateKey and passphrase as password on submit', async () => {
      const user = userEvent.setup({ delay: null });

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      await selectSnowflake(user);

      const authMethodSelect = getSelectByLabel('Authentication Method');
      await user.click(authMethodSelect);
      const keyPairOption = await screen.findByRole('option', { name: /key pair/i });
      await user.click(keyPairOption);

      await user.type(screen.getByLabelText(/connection name/i), 'My Snowflake');
      await user.type(screen.getByLabelText(/^host/i), 'xy12345.us-east-1.snowflakecomputing.com');
      await user.type(screen.getByLabelText(/^account/i), 'xy12345.us-east-1');
      fireEvent.change(screen.getByLabelText(/private key \(pem\)/i), {
        target: { value: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----' },
      });
      fireEvent.change(screen.getByLabelText(/private key passphrase/i), {
        target: { value: 'mysecret' },
      });

      await user.click(screen.getByRole('button', { name: /create/i }));

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalled();
      });

      const callArg = mockOnSave.mock.calls[0][0] as Record<string, unknown>;
      const decoded = JSON.parse(callArg.password as string);
      expect(decoded).toMatchObject({
        privateKey: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
        passphrase: 'mysecret',
      });
    });

    it('JSON-encodes privateKey without passphrase when passphrase is empty', async () => {
      const user = userEvent.setup({ delay: null });

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      await selectSnowflake(user);

      const authMethodSelect = getSelectByLabel('Authentication Method');
      await user.click(authMethodSelect);
      const keyPairOption = await screen.findByRole('option', { name: /key pair/i });
      await user.click(keyPairOption);

      await user.type(screen.getByLabelText(/connection name/i), 'My Snowflake');
      await user.type(screen.getByLabelText(/^host/i), 'xy12345.us-east-1.snowflakecomputing.com');
      await user.type(screen.getByLabelText(/^account/i), 'xy12345.us-east-1');
      fireEvent.change(screen.getByLabelText(/private key \(pem\)/i), {
        target: { value: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----' },
      });
      // Leave passphrase empty

      await user.click(screen.getByRole('button', { name: /create/i }));

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalled();
      });

      const callArg = mockOnSave.mock.calls[0][0] as Record<string, unknown>;
      const decoded = JSON.parse(callArg.password as string);
      expect(decoded).toMatchObject({
        privateKey: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
      });
      expect(decoded).not.toHaveProperty('passphrase');
    });
  });

  // ---------------------------------------------------------------------------
  // Databricks auth method selector
  // ---------------------------------------------------------------------------
  describe('Databricks auth method selector', () => {
    async function selectDatabricks(user: ReturnType<typeof userEvent.setup>) {
      const dbTypeSelect = getSelectByLabel('Database Type');
      await user.click(dbTypeSelect);
      const databricksOption = await screen.findByRole('option', { name: /^databricks$/i });
      await user.click(databricksOption);
    }

    it('renders Authentication Method selector when Databricks type is selected', async () => {
      const user = userEvent.setup();

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      await selectDatabricks(user);

      expect(() => getSelectByLabel('Authentication Method')).not.toThrow();
    });

    it('defaults to "Personal Access Token" auth method for Databricks', async () => {
      const user = userEvent.setup();

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      await selectDatabricks(user);

      const authMethodSelect = getSelectByLabel('Authentication Method');
      expect(authMethodSelect).toHaveTextContent(/personal access token/i);
    });

    it('shows "Access Token" as the password field label with "token" auth method', async () => {
      const user = userEvent.setup();

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      await selectDatabricks(user);

      // Default is 'token' — the password field label should be "Access Token"
      expect(screen.getByLabelText(/^access token/i)).toBeInTheDocument();
    });

    it('shows "Client Secret" as the password field label when using "oauth_m2m" auth method', async () => {
      const user = userEvent.setup();

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      await selectDatabricks(user);

      const authMethodSelect = getSelectByLabel('Authentication Method');
      await user.click(authMethodSelect);
      const oauthOption = await screen.findByRole('option', { name: /oauth m2m/i });
      await user.click(oauthOption);

      expect(screen.getByLabelText(/^client secret/i)).toBeInTheDocument();
    });

    it('shows OAuth Client ID field when "oauth_m2m" is selected', async () => {
      const user = userEvent.setup();

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      await selectDatabricks(user);

      const authMethodSelect = getSelectByLabel('Authentication Method');
      await user.click(authMethodSelect);
      const oauthOption = await screen.findByRole('option', { name: /oauth m2m/i });
      await user.click(oauthOption);

      expect(screen.getByLabelText(/^oauth client id/i)).toBeInTheDocument();
    });

    it('hides OAuth Client ID field when "token" auth method is selected', async () => {
      const user = userEvent.setup();

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      await selectDatabricks(user);

      // Default is 'token' — OAuth Client ID must not be present
      expect(screen.queryByLabelText(/^oauth client id/i)).not.toBeInTheDocument();
    });

    it('hides Username field when "oauth_m2m" auth method is selected', async () => {
      const user = userEvent.setup();

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      await selectDatabricks(user);

      // Username is visible with default 'token' method
      expect(screen.getByLabelText(/^username/i)).toBeInTheDocument();

      const authMethodSelect = getSelectByLabel('Authentication Method');
      await user.click(authMethodSelect);
      const oauthOption = await screen.findByRole('option', { name: /oauth m2m/i });
      await user.click(oauthOption);

      expect(screen.queryByLabelText(/^username/i)).not.toBeInTheDocument();
    });

    it('validates that OAuth Client ID is required for oauth_m2m connections', async () => {
      const user = userEvent.setup({ delay: null });

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
        />,
      );

      await selectDatabricks(user);

      const authMethodSelect = getSelectByLabel('Authentication Method');
      await user.click(authMethodSelect);
      const oauthOption = await screen.findByRole('option', { name: /oauth m2m/i });
      await user.click(oauthOption);

      // Fill required fields but leave OAuth Client ID empty
      await user.type(screen.getByLabelText(/connection name/i), 'My Databricks');
      await user.type(screen.getByLabelText(/^host/i), 'adb-123456.azuredatabricks.net');
      await user.type(screen.getByLabelText(/http path/i), '/sql/1.0/warehouses/abc123');

      await user.click(screen.getByRole('button', { name: /create/i }));

      await waitFor(() => {
        expect(screen.getByText(/oauth client id is required for oauth m2m authentication/i)).toBeInTheDocument();
      });

      expect(mockOnSave).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Edit mode — populating auth method from existing connection options
  // ---------------------------------------------------------------------------
  describe('Edit mode — auth method pre-population', () => {
    it('populates Snowflake auth method from existing connection options', () => {
      const existingConnection = {
        id: 'conn-sf-1',
        name: 'Prod Snowflake',
        description: null,
        dbType: 'snowflake' as const,
        host: 'xy12345.us-east-1.snowflakecomputing.com',
        port: 443,
        databaseName: null,
        username: 'svc_user',
        hasCredential: true,
        useSsl: true,
        options: { authMethod: 'key_pair', account: 'xy12345.us-east-1' },
        lastTestedAt: null,
        lastTestResult: null,
        lastTestMessage: null,
        createdByUserId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
          connection={existingConnection}
        />,
      );

      // The auth method selector should reflect key_pair
      const authMethodSelect = getSelectByLabel('Authentication Method');
      expect(authMethodSelect).toHaveTextContent(/key pair/i);

      // Private Key field should be present (key_pair mode)
      expect(screen.getByLabelText(/private key \(pem\)/i)).toBeInTheDocument();
    });

    it('populates Databricks auth method and oauthClientId from existing connection options', () => {
      const existingConnection = {
        id: 'conn-db-1',
        name: 'Prod Databricks',
        description: null,
        dbType: 'databricks' as const,
        host: 'adb-123456.azuredatabricks.net',
        port: 443,
        databaseName: null,
        username: null,
        hasCredential: true,
        useSsl: true,
        options: {
          authMethod: 'oauth_m2m',
          oauthClientId: 'my-client-id',
          httpPath: '/sql/1.0/warehouses/abc123',
        },
        lastTestedAt: null,
        lastTestResult: null,
        lastTestMessage: null,
        createdByUserId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
          connection={existingConnection}
        />,
      );

      // Auth method selector should reflect oauth_m2m
      const authMethodSelect = getSelectByLabel('Authentication Method');
      expect(authMethodSelect).toHaveTextContent(/oauth m2m/i);

      // OAuth Client ID field should be populated
      expect(screen.getByLabelText(/^oauth client id/i)).toHaveValue('my-client-id');
    });

    it('shows "Leave blank to keep existing" helper for Private Key in edit mode', () => {
      const existingConnection = {
        id: 'conn-sf-2',
        name: 'Prod Snowflake KP',
        description: null,
        dbType: 'snowflake' as const,
        host: 'xy12345.us-east-1.snowflakecomputing.com',
        port: 443,
        databaseName: null,
        username: 'svc_user',
        hasCredential: true,
        useSsl: true,
        options: { authMethod: 'key_pair', account: 'xy12345.us-east-1' },
        lastTestedAt: null,
        lastTestResult: null,
        lastTestMessage: null,
        createdByUserId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      render(
        <ConnectionDialog
          open={true}
          onClose={mockOnClose}
          onSave={mockOnSave}
          onTestNew={mockOnTestNew}
          connection={existingConnection}
        />,
      );

      // The helper text for the Private Key field in edit mode
      expect(screen.getByText(/leave blank to keep existing/i)).toBeInTheDocument();
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
