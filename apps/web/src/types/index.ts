export interface Role {
  name: string;
}

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  profileImageUrl: string | null;
  roles: Role[];
  permissions: string[];
  isActive: boolean;
  createdAt: string;
}

export interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  profile: {
    displayName?: string;
    useProviderImage: boolean;
    customImageUrl?: string | null;
  };
  updatedAt: string;
  version: number;
}

export interface SystemSettings {
  ui: {
    allowUserThemeOverride: boolean;
  };
  features: Record<string, boolean>;
  updatedAt: string;
  updatedBy: { id: string; email: string } | null;
  version: number;
}

export interface AuthProvider {
  name: string;
  authUrl: string;
}

export interface AllowedEmailEntry {
  id: string;
  email: string;
  addedBy: { id: string; email: string } | null;
  addedAt: string;
  claimedBy: { id: string; email: string } | null;
  claimedAt: string | null;
  notes: string | null;
}

export interface AllowlistResponse {
  items: AllowedEmailEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface UserListItem {
  id: string;
  email: string;
  displayName: string | null;
  providerDisplayName: string | null;
  profileImageUrl: string | null;
  providerProfileImageUrl?: string | null;
  isActive: boolean;
  roles: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UsersResponse {
  items: UserListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface DeviceActivationInfo {
  userCode: string;
  clientInfo: {
    deviceName?: string;
    userAgent?: string;
    ipAddress?: string;
  };
  expiresAt: string;
}

export interface DeviceAuthorizationResponse {
  success: boolean;
  message: string;
}

// =============================================================================
// Database Connections
// =============================================================================

export type DatabaseType = 'postgresql' | 'mysql' | 'sqlserver' | 'databricks' | 'snowflake';

export interface DataConnection {
  id: string;
  name: string;
  description: string | null;
  dbType: DatabaseType;
  host: string;
  port: number;
  databaseName: string | null;
  username: string | null;
  hasCredential: boolean;
  useSsl: boolean;
  options: Record<string, unknown> | null;
  lastTestedAt: string | null;
  lastTestResult: boolean | null;
  lastTestMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateConnectionPayload {
  name: string;
  description?: string;
  dbType: DatabaseType;
  host: string;
  port: number;
  databaseName?: string;
  username?: string;
  password?: string;
  useSsl?: boolean;
  options?: Record<string, unknown>;
}

export interface UpdateConnectionPayload {
  name?: string;
  description?: string;
  dbType?: DatabaseType;
  host?: string;
  port?: number;
  databaseName?: string;
  username?: string;
  password?: string;
  useSsl?: boolean;
  options?: Record<string, unknown>;
}

export interface TestConnectionPayload {
  dbType: DatabaseType;
  host: string;
  port: number;
  databaseName?: string;
  username?: string;
  password?: string;
  useSsl?: boolean;
  options?: Record<string, unknown>;
}

export interface ConnectionsResponse {
  items: DataConnection[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  latencyMs: number;
}
