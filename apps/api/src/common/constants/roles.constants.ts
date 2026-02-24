// =============================================================================
// Role Constants
// =============================================================================

export const ROLES = {
  ADMIN: 'admin',
  CONTRIBUTOR: 'contributor',
  VIEWER: 'viewer',
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

// =============================================================================
// Permission Constants
// =============================================================================

export const PERMISSIONS = {
  // System settings
  SYSTEM_SETTINGS_READ: 'system_settings:read',
  SYSTEM_SETTINGS_WRITE: 'system_settings:write',

  // User settings
  USER_SETTINGS_READ: 'user_settings:read',
  USER_SETTINGS_WRITE: 'user_settings:write',

  // Users
  USERS_READ: 'users:read',
  USERS_WRITE: 'users:write',

  // RBAC
  RBAC_MANAGE: 'rbac:manage',

  // Allowlist
  ALLOWLIST_READ: 'allowlist:read',
  ALLOWLIST_WRITE: 'allowlist:write',

  // Storage
  STORAGE_READ: 'storage:read',
  STORAGE_WRITE: 'storage:write',
  STORAGE_DELETE_ANY: 'storage:delete_any',

  // Connections
  CONNECTIONS_READ: 'connections:read',
  CONNECTIONS_WRITE: 'connections:write',
  CONNECTIONS_DELETE: 'connections:delete',
  CONNECTIONS_TEST: 'connections:test',

  // Semantic Models
  SEMANTIC_MODELS_READ: 'semantic_models:read',
  SEMANTIC_MODELS_WRITE: 'semantic_models:write',
  SEMANTIC_MODELS_DELETE: 'semantic_models:delete',
  SEMANTIC_MODELS_GENERATE: 'semantic_models:generate',

  // Ontologies
  ONTOLOGIES_READ: 'ontologies:read',
  ONTOLOGIES_WRITE: 'ontologies:write',
  ONTOLOGIES_DELETE: 'ontologies:delete',

  // Data Agent
  DATA_AGENT_READ: 'data_agent:read',
  DATA_AGENT_WRITE: 'data_agent:write',
  DATA_AGENT_DELETE: 'data_agent:delete',
} as const;

export type PermissionName = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// =============================================================================
// Default Role
// =============================================================================

export const DEFAULT_ROLE = ROLES.CONTRIBUTOR;
