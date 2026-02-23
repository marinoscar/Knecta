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
  notifications?: {
    browser?: boolean;
    email?: boolean;
    sms?: boolean;
  };
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
  notifications?: {
    email?: { enabled: boolean };
    sms?: { enabled: boolean };
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

export type DatabaseType = 'postgresql' | 'mysql' | 'sqlserver' | 'databricks' | 'snowflake' | 's3' | 'azure_blob';

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
  createdByUserId: string | null;
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
  createdByUserId: string | null;
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
  createdByUserId: string | null;
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
// Chart Specification Types
// ==========================================

export interface ChartSeries {
  label: string;
  data: number[];
}

export interface ChartSlice {
  label: string;
  value: number;
}

export interface ChartPoint {
  x: number;
  y: number;
  label?: string;
}

export interface ChartSpec {
  type: 'bar' | 'line' | 'pie' | 'scatter';
  title: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  categories?: string[];
  series?: ChartSeries[];
  slices?: ChartSlice[];
  points?: ChartPoint[];
  layout?: 'vertical' | 'horizontal';
}

// ==========================================
// Data Agent
// ==========================================

export interface LlmTraceRecord {
  id: string;
  messageId: string;
  phase: string;
  callIndex: number;
  stepId: number | null;
  purpose: string;
  provider: string;
  model: string;
  temperature: number | null;
  structuredOutput: boolean;
  promptMessages: Array<{ role: string; content: string }>;
  responseContent: string;
  toolCalls: Array<{ name: string; args: Record<string, unknown> }> | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  error: string | null;
}

export interface DataChat {
  id: string;
  name: string;
  ontologyId: string;
  llmProvider?: string | null;
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
      complexity: 'simple' | 'analytical' | 'conversational';
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
      filters?: string[];
      timeWindow?: string;
    };
    revisionsUsed?: number;
    durationMs?: number;
    startedAt?: number;
    stepResults?: Array<{ stepId: number; description: string; strategy: string; sqlResult?: { rowCount: number; columns: string[]; data: string }; pythonResult?: { stdout: string; charts: string[] }; chartSpec?: ChartSpec; error?: string }>;
    joinPlan?: { relevantDatasets: Array<{ name: string; description: string; source: string; yaml?: string }>; joinPaths: Array<{ datasets: string[]; edges: Array<{ fromDataset: string; toDataset: string; fromColumns: string[]; toColumns: string[]; relationshipName: string }> }>; notes: string };
    clarificationQuestions?: Array<{ question: string; assumption: string }>;
    cannotAnswer?: {
      reason: string;
      missingDatasets?: string[];
      missingJoins?: string[];
      availableDatasets?: string[];
    };
    discovery?: {
      embeddingDurationMs: number;
      vectorSearchDurationMs: number;
      yamlFetchDurationMs: number;
      matchedDatasets: Array<{ name: string; score: number }>;
      datasetsWithYaml: number;
      preferencesLoaded: number;
    };
  };
  status: 'generating' | 'complete' | 'failed' | 'clarification_needed';
  createdAt: string;
}

export interface DataChatsResponse {
  items: DataChat[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ==========================================
// Chat Sharing
// ==========================================

export interface ChatShareInfo {
  id: string;
  shareToken: string;
  shareUrl: string;
  expiresAt: string | null;
  isActive: boolean;
  viewCount: number;
  createdAt: string;
}

export interface SharedChatData {
  chatName: string;
  ontologyName: string;
  messages: SharedChatMessage[];
  sharedAt: string;
}

export interface SharedLlmTrace {
  phase: string;
  callIndex: number;
  stepId: number | null;
  purpose: string;
  provider: string;
  model: string;
  temperature: number | null;
  structuredOutput: boolean;
  promptMessages: Array<{ role: string; content: string }>;
  responseContent: string;
  toolCalls: Array<{ name: string; args: Record<string, unknown> }> | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  error: string | null;
}

export interface SharedChatMessage {
  role: 'user' | 'assistant';
  content: string;
  status: string;
  createdAt: string;
  metadata?: {
    plan?: {
      complexity?: string;
      intent?: string;
      steps?: Array<{ id: number; description: string; strategy: string }>;
    };
    stepResults?: Array<{
      stepId: number;
      description?: string;
      strategy?: string;
      sqlResult?: { rowCount: number; columns: string[]; data: string };
      pythonResult?: { stdout: string; charts?: string[] };
      chartSpec?: unknown;
      error?: string;
    }>;
    verificationReport?: {
      passed: boolean;
      checks: Array<{ name: string; passed: boolean; message: string }>;
    };
    dataLineage?: {
      datasets: string[];
      joins: Array<{ from: string; to: string; on: string }>;
      grain: string;
      rowCount: number | null;
      filters?: string[];
      timeWindow?: string;
    };
    joinPlan?: {
      relevantDatasets: Array<{ name: string; description: string }>;
      joinPaths: Array<{
        datasets: string[];
        edges: Array<{
          fromDataset: string;
          toDataset: string;
          fromColumns: string[];
          toColumns: string[];
          relationshipName: string;
        }>;
      }>;
    };
    cannotAnswer?: {
      reason: string;
      missingDatasets?: string[];
      availableDatasets?: string[];
    };
    durationMs?: number;
    revisionsUsed?: number;
  };
  traces?: SharedLlmTrace[];
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
    | 'tool_error'
    | 'llm_call_start'
    | 'llm_call_end'
    | 'clarification_requested'
    | 'preference_suggested'
    | 'preference_auto_saved'
    | 'discovery_start'
    | 'discovery_complete';
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
  // LLM trace fields
  callIndex?: number;
  purpose?: string;
  provider?: string;
  model?: string;
  structuredOutput?: boolean;
  promptSummary?: { messageCount: number; totalChars: number };
  responsePreview?: string;
  toolCallCount?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  durationMs?: number;
  // Clarification / preference fields
  questions?: Array<{ question: string; assumption: string }>;
  suggestions?: Array<{ key: string; value: string; question: string }>;
  preferences?: Array<{ key: string; value: string }>;
  status?: string;
  // Discovery fields
  embeddingDurationMs?: number;
  vectorSearchDurationMs?: number;
  yamlFetchDurationMs?: number;
  matchedDatasets?: Array<{ name: string; score: number }>;
  datasetsWithYaml?: number;
  preferencesLoaded?: number;
}

// ==========================================
// Notifications
// ==========================================

export type NotificationModule = 'semantic-models' | 'data-agent' | 'ontologies';
export type NotificationSeverity = 'success' | 'error' | 'info' | 'warning';
export type BrowserNotificationPermission = 'default' | 'granted' | 'denied';

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  module: NotificationModule;
  severity: NotificationSeverity;
  clickUrl?: string;
  timestamp: number;
}

// ==========================================
// Spreadsheet Agent
// ==========================================

export type SpreadsheetProjectStatus = 'draft' | 'processing' | 'review_pending' | 'ready' | 'failed' | 'partial';
export type SpreadsheetFileStatus = 'pending' | 'uploading' | 'uploaded' | 'ingested' | 'failed' | 'deleted';
export type SpreadsheetTableStatus = 'pending' | 'extracting' | 'ready' | 'failed';
export type SpreadsheetRunStatus =
  | 'pending'
  | 'ingesting'
  | 'analyzing'
  | 'designing'
  | 'review_pending'
  | 'extracting'
  | 'validating'
  | 'persisting'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface SpreadsheetProject {
  id: string;
  name: string;
  description: string | null;
  storageProvider: string;
  outputBucket: string;
  outputPrefix: string;
  reviewMode: 'auto' | 'review';
  status: SpreadsheetProjectStatus;
  fileCount: number;
  tableCount: number;
  totalRows: number;
  totalSizeBytes: number;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SpreadsheetFile {
  id: string;
  projectId: string;
  originalName: string;
  fileType: string;
  fileSizeBytes: number;
  storageObjectId: string | null;
  storagePath: string | null;
  fileHash: string | null;
  sheetCount: number;
  status: SpreadsheetFileStatus;
  errorMessage: string | null;
  uploadedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SpreadsheetTable {
  id: string;
  projectId: string;
  fileId: string;
  tableName: string;
  description: string | null;
  sourceSheetName: string;
  outputPath: string | null;
  outputStorageObjectId: string | null;
  outputFormat: string;
  rowCount: number;
  columnCount: number;
  outputSizeBytes: number;
  columns: Record<string, unknown> | null;
  status: SpreadsheetTableStatus;
  extractionNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SpreadsheetRun {
  id: string;
  projectId: string;
  status: SpreadsheetRunStatus;
  config: Record<string, unknown> | null;
  extractionPlan: Record<string, unknown> | null;
  extractionPlanModified: Record<string, unknown> | null;
  validationReport: Record<string, unknown> | null;
  progress: SpreadsheetRunProgress | null;
  errorMessage: string | null;
  tokensUsed: number;
  startedAt: string | null;
  completedAt: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SpreadsheetRunProgress {
  phase: string;
  percentComplete: number;
  message: string;
  fileStatus?: Record<string, string>;
  tableStatus?: Record<string, string>;
}

export interface SpreadsheetProjectsResponse {
  items: SpreadsheetProject[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SpreadsheetTablesResponse {
  items: SpreadsheetTable[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SpreadsheetExtractionPlan {
  tables: Array<{
    tableName: string;
    description: string;
    sourceFileId: string;
    sourceFileName: string;
    sourceSheetName: string;
    headerRow: number;
    dataStartRow: number;
    dataEndRow: number | null;
    columns: Array<{
      sourceName: string;
      outputName: string;
      outputType: string;
      nullable: boolean;
      transformation: string | null;
      description: string;
    }>;
    skipRows: number[];
    needsTranspose: boolean;
    estimatedRows: number;
    outputPath: string;
    notes: string;
  }>;
  relationships: Array<{
    fromTable: string;
    fromColumn: string;
    toTable: string;
    toColumn: string;
    confidence: 'high' | 'medium' | 'low';
    notes: string;
  }>;
  catalogMetadata: {
    projectDescription: string;
    domainNotes: string;
    dataQualityNotes: string[];
  };
}

export interface SpreadsheetPlanModification {
  tableName: string;
  action: 'include' | 'skip';
  overrides?: {
    tableName?: string;
    columns?: Array<{
      outputName: string;
      outputType: string;
    }>;
  };
}

export interface TablePreviewData {
  columns: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
}

export type SpreadsheetStreamEventType =
  | 'run_start'
  | 'phase_start'
  | 'phase_complete'
  | 'file_start'
  | 'file_complete'
  | 'file_error'
  | 'sheet_analysis'
  | 'progress'
  | 'extraction_plan'
  | 'review_ready'
  | 'table_start'
  | 'table_complete'
  | 'table_error'
  | 'validation_result'
  | 'token_update'
  | 'text'
  | 'run_complete'
  | 'run_error';

export interface SpreadsheetStreamEvent {
  type: SpreadsheetStreamEventType;
  phase?: string;
  message?: string;
  fileId?: string;
  fileName?: string;
  tableName?: string;
  plan?: SpreadsheetExtractionPlan;
  progress?: SpreadsheetRunProgress;
  error?: string;
  tokensUsed?: { prompt: number; completion: number; total: number };
  [key: string]: unknown;
}
