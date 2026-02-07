import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Alert,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  CircularProgress,
} from '@mui/material';
import type {
  DataConnection,
  CreateConnectionPayload,
  UpdateConnectionPayload,
  TestConnectionPayload,
  ConnectionTestResult,
  DatabaseType,
} from '../../types';

interface ConnectionDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: CreateConnectionPayload | UpdateConnectionPayload) => Promise<void>;
  onTestNew: (data: TestConnectionPayload) => Promise<ConnectionTestResult>;
  connection?: DataConnection | null;
}

const DEFAULT_PORTS: Record<DatabaseType, number> = {
  postgresql: 5432,
  mysql: 3306,
  sqlserver: 1433,
  databricks: 443,
  snowflake: 443,
};

export function ConnectionDialog({ open, onClose, onSave, onTestNew, connection }: ConnectionDialogProps) {
  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dbType, setDbType] = useState<DatabaseType>('postgresql');
  const [host, setHost] = useState('');
  const [port, setPort] = useState(5432);
  const [databaseName, setDatabaseName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [useSsl, setUseSsl] = useState(false);

  // Type-specific options
  const [httpPath, setHttpPath] = useState('');
  const [account, setAccount] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [role, setRole] = useState('');
  const [schema, setSchema] = useState('');
  const [instanceName, setInstanceName] = useState('');
  const [encrypt, setEncrypt] = useState(false);
  const [trustServerCertificate, setTrustServerCertificate] = useState(true);

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [portManuallySet, setPortManuallySet] = useState(false);

  // Reset form to defaults
  const resetForm = () => {
    setName('');
    setDescription('');
    setDbType('postgresql');
    setHost('');
    setPort(5432);
    setDatabaseName('');
    setUsername('');
    setPassword('');
    setUseSsl(false);
    setHttpPath('');
    setAccount('');
    setWarehouse('');
    setRole('');
    setSchema('');
    setInstanceName('');
    setEncrypt(false);
    setTrustServerCertificate(true);
    setPortManuallySet(false);
  };

  // Initialize from connection prop (edit mode)
  useEffect(() => {
    if (connection) {
      setName(connection.name);
      setDescription(connection.description || '');
      setDbType(connection.dbType);
      setHost(connection.host);
      setPort(connection.port);
      setDatabaseName(connection.databaseName || '');
      setUsername(connection.username || '');
      setPassword('');
      setUseSsl(connection.useSsl);

      const opts = (connection.options as Record<string, unknown>) || {};
      setHttpPath((opts.httpPath as string) || '');
      setAccount((opts.account as string) || '');
      setWarehouse((opts.warehouse as string) || '');
      setRole((opts.role as string) || '');
      setSchema((opts.schema as string) || '');
      setInstanceName((opts.instanceName as string) || '');
      setEncrypt((opts.encrypt as boolean) || false);
      setTrustServerCertificate((opts.trustServerCertificate as boolean) ?? true);
    } else {
      resetForm();
    }
    setTestResult(null);
    setError(null);
  }, [connection, open]);

  // Build options object from type-specific fields
  const buildOptions = (): Record<string, unknown> | undefined => {
    const opts: Record<string, unknown> = {};

    switch (dbType) {
      case 'databricks':
        if (httpPath) opts.httpPath = httpPath;
        break;
      case 'snowflake':
        if (account) opts.account = account;
        if (warehouse) opts.warehouse = warehouse;
        if (role) opts.role = role;
        if (schema) opts.schema = schema;
        break;
      case 'sqlserver':
        if (instanceName) opts.instanceName = instanceName;
        opts.encrypt = encrypt;
        opts.trustServerCertificate = trustServerCertificate;
        break;
      case 'postgresql':
      case 'mysql':
        if (schema) opts.schema = schema;
        break;
    }

    return Object.keys(opts).length > 0 ? opts : undefined;
  };

  // Handle database type change
  const handleDbTypeChange = (newType: DatabaseType) => {
    setDbType(newType);
    if (!portManuallySet) {
      setPort(DEFAULT_PORTS[newType]);
    }
    setTestResult(null);
  };

  // Validate form
  const validateForm = (): string | null => {
    if (!name.trim()) return 'Name is required';
    if (!host.trim()) return 'Host is required';
    if (!port || port < 1) return 'Valid port is required';
    if (dbType === 'databricks' && !httpPath.trim()) return 'HTTP Path is required for Databricks';
    if (dbType === 'snowflake' && !account.trim()) return 'Account is required for Snowflake';
    return null;
  };

  // Handle submit
  const handleSubmit = async () => {
    setError(null);

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      const data: any = {
        name: name.trim(),
        description: description.trim() || undefined,
        dbType,
        host: host.trim(),
        port,
        databaseName: databaseName.trim() || undefined,
        username: username.trim() || undefined,
        useSsl,
        options: buildOptions(),
      };

      // Only include password if provided
      if (password) {
        data.password = password;
      }

      await onSave(data);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save connection');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle test connection
  const handleTest = async () => {
    setTestResult(null);
    setIsTesting(true);
    try {
      const data: TestConnectionPayload = {
        dbType,
        host: host.trim(),
        port,
        databaseName: databaseName.trim() || undefined,
        username: username.trim() || undefined,
        password: password || undefined,
        useSsl,
        options: buildOptions(),
      };
      const result = await onTestNew(data);
      setTestResult(result);
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Test failed',
        latencyMs: 0,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{connection ? 'Edit Connection' : 'Add Connection'}</DialogTitle>
      <DialogContent>
        <Box display="flex" flexDirection="column" gap={2} mt={1}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label="Connection Name"
            required
            fullWidth
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSubmitting}
          />

          <TextField
            label="Description"
            fullWidth
            multiline
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isSubmitting}
          />

          <FormControl required fullWidth>
            <InputLabel>Database Type</InputLabel>
            <Select
              value={dbType}
              onChange={(e) => handleDbTypeChange(e.target.value as DatabaseType)}
              disabled={isSubmitting}
              label="Database Type"
            >
              <MenuItem value="postgresql">PostgreSQL</MenuItem>
              <MenuItem value="mysql">MySQL</MenuItem>
              <MenuItem value="sqlserver">SQL Server</MenuItem>
              <MenuItem value="databricks">Databricks</MenuItem>
              <MenuItem value="snowflake">Snowflake</MenuItem>
            </Select>
          </FormControl>

          <Box display="flex" gap={2}>
            <TextField
              label="Host"
              required
              value={host}
              onChange={(e) => setHost(e.target.value)}
              sx={{ flex: 1 }}
              disabled={isSubmitting}
            />
            <TextField
              label="Port"
              required
              type="number"
              value={port}
              onChange={(e) => setPort(parseInt(e.target.value, 10))}
              onFocus={() => setPortManuallySet(true)}
              sx={{ width: 120 }}
              disabled={isSubmitting}
            />
          </Box>

          <TextField
            label="Database Name"
            fullWidth
            value={databaseName}
            onChange={(e) => setDatabaseName(e.target.value)}
            disabled={isSubmitting}
          />

          <Box display="flex" gap={2}>
            <TextField
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              sx={{ flex: 1 }}
              disabled={isSubmitting}
            />
            <TextField
              label={dbType === 'databricks' ? 'Access Token' : 'Password'}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              sx={{ flex: 1 }}
              disabled={isSubmitting}
              helperText={connection ? 'Leave blank to keep existing' : undefined}
            />
          </Box>

          <FormControlLabel
            control={<Switch checked={useSsl} onChange={(e) => setUseSsl(e.target.checked)} disabled={isSubmitting} />}
            label="Use SSL"
          />

          {dbType === 'databricks' && (
            <TextField
              label="HTTP Path"
              required
              fullWidth
              value={httpPath}
              onChange={(e) => setHttpPath(e.target.value)}
              disabled={isSubmitting}
              helperText="e.g., /sql/1.0/warehouses/abc123"
            />
          )}

          {dbType === 'snowflake' && (
            <>
              <TextField
                label="Account"
                required
                fullWidth
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                disabled={isSubmitting}
                helperText="e.g., xy12345.us-east-1"
              />
              <Box display="flex" gap={2}>
                <TextField
                  label="Warehouse"
                  value={warehouse}
                  onChange={(e) => setWarehouse(e.target.value)}
                  sx={{ flex: 1 }}
                  disabled={isSubmitting}
                />
                <TextField
                  label="Role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  sx={{ flex: 1 }}
                  disabled={isSubmitting}
                />
              </Box>
              <TextField
                label="Schema"
                fullWidth
                value={schema}
                onChange={(e) => setSchema(e.target.value)}
                disabled={isSubmitting}
              />
            </>
          )}

          {dbType === 'sqlserver' && (
            <>
              <TextField
                label="Instance Name"
                fullWidth
                value={instanceName}
                onChange={(e) => setInstanceName(e.target.value)}
                disabled={isSubmitting}
              />
              <FormControlLabel
                control={
                  <Switch checked={encrypt} onChange={(e) => setEncrypt(e.target.checked)} disabled={isSubmitting} />
                }
                label="Encrypt Connection"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={trustServerCertificate}
                    onChange={(e) => setTrustServerCertificate(e.target.checked)}
                    disabled={isSubmitting}
                  />
                }
                label="Trust Server Certificate"
              />
            </>
          )}

          {(dbType === 'postgresql' || dbType === 'mysql') && (
            <TextField
              label="Schema"
              fullWidth
              value={schema}
              onChange={(e) => setSchema(e.target.value)}
              disabled={isSubmitting}
            />
          )}

          {testResult && (
            <Alert severity={testResult.success ? 'success' : 'error'}>
              {testResult.message}
              {testResult.success && ` (${testResult.latencyMs}ms)`}
            </Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleTest} disabled={isSubmitting || isTesting || !host}>
          {isTesting ? <CircularProgress size={20} /> : 'Test Connection'}
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={handleClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? <CircularProgress size={20} /> : connection ? 'Save Changes' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
