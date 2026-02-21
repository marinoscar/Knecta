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
  s3: 443,
  azure_blob: 443,
};

/** Types that use cloud storage semantics (no port/DB/SSL fields) */
const CLOUD_STORAGE_TYPES: DatabaseType[] = ['s3', 'azure_blob'];

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

  // Type-specific options — standard DB types
  const [httpPath, setHttpPath] = useState('');
  const [account, setAccount] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [role, setRole] = useState('');
  const [schema, setSchema] = useState('');
  const [instanceName, setInstanceName] = useState('');
  const [encrypt, setEncrypt] = useState(false);
  const [trustServerCertificate, setTrustServerCertificate] = useState(true);

  // Type-specific options — S3
  const [region, setRegion] = useState('');
  const [bucket, setBucket] = useState('');
  const [pathPrefix, setPathPrefix] = useState('');
  const [endpointUrl, setEndpointUrl] = useState('');

  // Type-specific options — Azure Blob
  const [containerName, setContainerName] = useState('');
  const [authMethod, setAuthMethod] = useState<'key' | 'sas'>('key');

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
    setRegion('');
    setBucket('');
    setPathPrefix('');
    setEndpointUrl('');
    setContainerName('');
    setAuthMethod('key');
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

      // S3 options
      if (opts.region) setRegion(opts.region as string);
      if (opts.bucket) setBucket(opts.bucket as string);
      if (opts.pathPrefix) setPathPrefix(opts.pathPrefix as string);
      if (opts.endpointUrl) setEndpointUrl(opts.endpointUrl as string);

      // Azure Blob options
      if (opts.containerName) setContainerName(opts.containerName as string);
      if (opts.authMethod) setAuthMethod(opts.authMethod as 'key' | 'sas');
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
      case 's3':
        if (region) opts.region = region;
        if (bucket) opts.bucket = bucket;
        if (pathPrefix) opts.pathPrefix = pathPrefix;
        if (endpointUrl) opts.endpointUrl = endpointUrl;
        break;
      case 'azure_blob':
        if (containerName) opts.containerName = containerName;
        if (pathPrefix) opts.pathPrefix = pathPrefix;
        opts.authMethod = authMethod;
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
    if (dbType === 's3') {
      if (!region.trim()) return 'Region is required for S3 connections';
    } else {
      if (!host.trim()) return 'Host is required';
      if (!port || port < 1) return 'Valid port is required';
    }
    if (dbType === 'databricks' && !httpPath.trim()) return 'HTTP Path is required for Databricks';
    if (dbType === 'snowflake' && !account.trim()) return 'Account is required for Snowflake';
    return null;
  };

  // Derive the effective host for S3 (region doubles as host for backend validation)
  const effectiveHost = dbType === 's3' ? region : host;

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
        host: effectiveHost.trim(),
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
        host: effectiveHost.trim(),
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

  const isCloudStorage = CLOUD_STORAGE_TYPES.includes(dbType);

  // Dynamic labels
  const hostLabel = dbType === 's3' ? 'Region' : dbType === 'azure_blob' ? 'Account URL' : 'Host';
  const hostHelperText =
    dbType === 's3'
      ? 'e.g., us-east-1'
      : dbType === 'azure_blob'
        ? 'e.g., myaccount.blob.core.windows.net'
        : undefined;
  const usernameLabel = dbType === 's3' ? 'Access Key ID' : dbType === 'azure_blob' ? 'Account Name' : 'Username';
  const passwordLabel =
    dbType === 's3'
      ? 'Secret Access Key'
      : dbType === 'azure_blob'
        ? authMethod === 'sas'
          ? 'SAS Token'
          : 'Account Key'
        : dbType === 'databricks'
          ? 'Access Token'
          : 'Password';

  // Test button is disabled when the primary identifier is missing
  const testDisabled = isSubmitting || isTesting || (dbType === 's3' ? !region : !host);

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
              <MenuItem value="s3">Amazon S3</MenuItem>
              <MenuItem value="azure_blob">Azure Blob Storage</MenuItem>
            </Select>
          </FormControl>

          {/* Host / Region / Account URL — hidden for S3 (uses dedicated Region field below) */}
          {dbType !== 's3' && (
            <Box display="flex" gap={2}>
              <TextField
                label={hostLabel}
                required
                value={host}
                onChange={(e) => setHost(e.target.value)}
                sx={{ flex: 1 }}
                disabled={isSubmitting}
                helperText={hostHelperText}
              />
              {/* Port — hidden for cloud storage types */}
              {!isCloudStorage && (
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
              )}
            </Box>
          )}

          {/* Database Name — hidden for cloud storage types */}
          {!isCloudStorage && (
            <TextField
              label="Database Name"
              fullWidth
              value={databaseName}
              onChange={(e) => setDatabaseName(e.target.value)}
              disabled={isSubmitting}
            />
          )}

          <Box display="flex" gap={2}>
            <TextField
              label={usernameLabel}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              sx={{ flex: 1 }}
              disabled={isSubmitting}
            />
            <TextField
              label={passwordLabel}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              sx={{ flex: 1 }}
              disabled={isSubmitting}
              helperText={connection ? 'Leave blank to keep existing' : undefined}
            />
          </Box>

          {/* SSL switch — hidden for cloud storage types (always HTTPS) */}
          {!isCloudStorage && (
            <FormControlLabel
              control={<Switch checked={useSsl} onChange={(e) => setUseSsl(e.target.checked)} disabled={isSubmitting} />}
              label="Use SSL"
            />
          )}

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

          {/* S3-specific fields */}
          {dbType === 's3' && (
            <>
              <TextField
                label="Region"
                required
                fullWidth
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                disabled={isSubmitting}
                helperText="e.g., us-east-1"
              />
              <TextField
                label="Bucket"
                fullWidth
                value={bucket}
                onChange={(e) => setBucket(e.target.value)}
                disabled={isSubmitting}
                helperText="Leave blank to list all accessible buckets"
              />
              <TextField
                label="Path Prefix"
                fullWidth
                value={pathPrefix}
                onChange={(e) => setPathPrefix(e.target.value)}
                disabled={isSubmitting}
                helperText="Filter to a specific folder path"
              />
              <TextField
                label="Custom Endpoint URL"
                fullWidth
                value={endpointUrl}
                onChange={(e) => setEndpointUrl(e.target.value)}
                disabled={isSubmitting}
                helperText="For MinIO or S3-compatible services"
              />
            </>
          )}

          {/* Azure Blob-specific fields */}
          {dbType === 'azure_blob' && (
            <>
              <FormControl fullWidth disabled={isSubmitting}>
                <InputLabel>Authentication Method</InputLabel>
                <Select
                  value={authMethod}
                  onChange={(e) => setAuthMethod(e.target.value as 'key' | 'sas')}
                  label="Authentication Method"
                >
                  <MenuItem value="key">Account Key</MenuItem>
                  <MenuItem value="sas">SAS Token</MenuItem>
                </Select>
              </FormControl>
              <TextField
                label="Container"
                fullWidth
                value={containerName}
                onChange={(e) => setContainerName(e.target.value)}
                disabled={isSubmitting}
                helperText="Leave blank to list all containers"
              />
              <TextField
                label="Path Prefix"
                fullWidth
                value={pathPrefix}
                onChange={(e) => setPathPrefix(e.target.value)}
                disabled={isSubmitting}
                helperText="Filter to a specific folder path"
              />
            </>
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
        <Button onClick={handleTest} disabled={testDisabled}>
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
