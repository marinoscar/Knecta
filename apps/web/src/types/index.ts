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
  defaultProvider?: string;
  updatedAt: string;
  version: number;
}

export interface DataAgentProviderConfig {
  temperature?: number;
  model?: string;
  reasoningLevel?: string;
  customBudget?: number;
}

export interface SystemSettings {
  ui: {
    allowUserThemeOverride: boolean;
  };
  features: Record<string, boolean>;
  dataAgent?: {
    openai?: DataAgentProviderConfig;
    anthropic?: DataAgentProviderConfig;
    azure?: DataAgentProviderConfig;
  };
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

// ==========================================
// Semantic Models
// ==========================================

export type SemanticModelStatus = 'draft' | 'generating' | 'ready' | 'failed';

export type RunStatus = 'pending' | 'planning' | 'executing' | 'completed' | 'failed' | 'cancelled';

export interface SemanticModel {
  id: string;
  name: string;
  description: string | null;
  connectionId: string;
  databaseName: string;
  status: SemanticModelStatus;
  model: Record<string, unknown> | null;
  modelVersion: number;
  tableCount: number;
  fieldCount: number;
  relationshipCount: number;
  metricCount: number;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  connection?: {
    name: string;
    dbType: DatabaseType;
  };
}

export interface SemanticModelsResponse {
  items: SemanticModel[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SemanticModelRun {
  id: string;
  semanticModelId: string | null;
  connectionId: string;
  databaseName: string;
  selectedSchemas: string[];
  selectedTables: string[];
  name: string | null;
  instructions: string | null;
  status: RunStatus;
  plan: Record<string, unknown> | null;
  progress: RunProgress | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RunProgress {
  currentStep: number;
  totalSteps: number;
  currentTable: string;
  message: string;
}

export interface CreateRunPayload {
  connectionId: string;
  databaseName: string;
  selectedSchemas: string[];
  selectedTables: string[];
  name: string;
  instructions?: string;
}

// ==========================================
// Discovery
// ==========================================

export interface DatabaseInfo {
  name: string;
  catalog?: string;
}

export interface SchemaInfo {
  name: string;
  database: string;
}

export interface TableInfo {
  name: string;
  schema: string;
  database: string;
  type: 'TABLE' | 'VIEW';
  rowCountEstimate?: number;
}

export interface ColumnInfo {
  name: string;
  dataType: string;
  nativeType: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
  defaultValue?: string;
  maxLength?: number;
  numericPrecision?: number;
  numericScale?: number;
  comment?: string;
}

// ==========================================
// LLM Providers
// ==========================================

export interface LLMProviderInfo {
  name: string;
  enabled: boolean;
  model: string;
  isDefault: boolean;
}

// ==========================================
// Ontologies
// ==========================================

export type OntologyStatus = 'creating' | 'ready' | 'failed';

export interface Ontology {
  id: string;
  name: string;
  description: string | null;
  semanticModelId: string;
  semanticModel?: { name: string; status: string };
  status: OntologyStatus;
  nodeCount: number;
  relationshipCount: number;
  errorMessage: string | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface OntologiesResponse {
  items: Ontology[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CreateOntologyPayload {
  name: string;
  description?: string;
  semanticModelId: string;
}

export interface GraphNode {
  id: string;
  label: 'Dataset' | 'Field';
  name: string;
  properties: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  properties: Record<string, unknown>;
}

export interface OntologyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ==========================================
// Data Agent
// ==========================================

export interface DataChat {
  id: string;
  name: string;
  ontologyId: string;
  ontology?: {
    id: string;
    name: string;
    status: string;
    datasetCount: number;
    semanticModelId: string;
  };
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  messages?: DataChatMessage[];
}

export interface DataChatMessage {
  id: string;
  chatId: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: {
    toolCalls?: Array<{ phase?: string; stepId?: number; name: string; args: Record<string, unknown>; result?: string }>;
    tokensUsed?: { prompt: number; completion: number; total: number };
    datasetsUsed?: string[];
    error?: string;
    claimed?: boolean;
    plan?: {
      complexity: 'simple' | 'analytical';
      intent: string;
      steps: Array<{ id: number; description: string; strategy: string }>;
    };
    verificationReport?: {
      passed: boolean;
      checks: Array<{ name: string; passed: boolean; message: string }>;
    };
    dataLineage?: {
      datasets: string[];
      joins: Array<{ from: string; to: string; on: string }>;
      grain: string;
      rowCount: number | null;
    };
    revisionsUsed?: number;
    durationMs?: number;
    startedAt?: number;
    stepResults?: Array<{ stepId: number; description: string; strategy: string; sqlResult?: { rowCount: number; columns: string[]; data: string }; pythonResult?: { stdout: string; charts: string[] }; error?: string }>;
    joinPlan?: { relevantDatasets: Array<{ name: string; description: string; source: string; yaml?: string }>; joinPaths: Array<{ datasets: string[]; edges: Array<{ fromDataset: string; toDataset: string; fromColumns: string[]; toColumns: string[]; relationshipName: string }> }>; notes: string };
  };
  status: 'generating' | 'complete' | 'failed';
  createdAt: string;
}

export interface DataChatsResponse {
  items: DataChat[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface DataAgentStreamEvent {
  type:
    | 'message_start'
    | 'tool_call'
    | 'tool_result'
    | 'text'
    | 'token_update'
    | 'message_complete'
    | 'message_error'
    | 'phase_start'
    | 'phase_complete'
    | 'phase_artifact'
    | 'step_start'
    | 'step_complete'
    | 'tool_start'
    | 'tool_end'
    | 'tool_error';
  name?: string;
  args?: Record<string, unknown>;
  result?: string;
  content?: string;
  metadata?: Record<string, unknown>;
  message?: string;
  tokensUsed?: { prompt: number; completion: number; total: number };
  // New phase/step fields
  phase?: string;
  description?: string;
  artifact?: Record<string, unknown>;
  stepId?: number;
  strategy?: string;
  error?: string;
  startedAt?: number;
}
