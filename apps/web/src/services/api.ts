const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}

class ApiService {
  private accessToken: string | null = null;
  private refreshPromise: Promise<boolean> | null = null;

  setAccessToken(token: string | null) {
    this.accessToken = token;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  private async request<T>(
    endpoint: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const { skipAuth = false, ...fetchOptions } = options;

    const headers: HeadersInit = {
      ...fetchOptions.headers,
    };

    // Only set Content-Type for requests with a body (Fastify 5 is strict about this)
    if (fetchOptions.body) {
      (headers as Record<string, string>)['Content-Type'] = 'application/json';
    }

    if (!skipAuth && this.accessToken) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...fetchOptions,
      headers,
      credentials: 'include', // Include cookies for refresh token
    });

    if (response.status === 401 && !skipAuth) {
      // Try to refresh token (only once, avoid infinite loops)
      const refreshed = await this.refreshToken();
      if (refreshed) {
        // Update authorization header with new token and retry ONCE
        const retryHeaders: HeadersInit = {
          'Content-Type': 'application/json',
          ...fetchOptions.headers,
          'Authorization': `Bearer ${this.accessToken}`,
        };

        const retryResponse = await fetch(`${API_BASE_URL}${endpoint}`, {
          ...fetchOptions,
          headers: retryHeaders,
          credentials: 'include',
        });

        if (!retryResponse.ok) {
          const error = await retryResponse.json().catch(() => ({}));
          throw new ApiError(
            error.message || 'Request failed',
            retryResponse.status,
            error.code,
            error.details,
          );
        }

        if (retryResponse.status === 204) {
          return undefined as T;
        }

        const data = await retryResponse.json();
        return data.data ?? data;
      }
      throw new ApiError('Unauthorized', 401);
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new ApiError(
        error.message || 'Request failed',
        response.status,
        error.code,
        error.details,
      );
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    const data = await response.json();
    return data.data ?? data;
  }

  async refreshToken(): Promise<boolean> {
    // If a refresh is already in progress, wait for it
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    // Start a new refresh
    this.refreshPromise = this.doRefreshToken();

    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async doRefreshToken(): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        this.accessToken = null;
        return false;
      }

      const responseData = await response.json();
      // Unwrap the { data: { accessToken } } structure from TransformInterceptor
      const tokenData = responseData.data ?? responseData;

      // Validate that we actually got a token
      if (!tokenData.accessToken || typeof tokenData.accessToken !== 'string') {
        this.accessToken = null;
        return false;
      }

      this.accessToken = tokenData.accessToken;
      return true;
    } catch {
      this.accessToken = null;
      return false;
    }
  }

  // Generic methods
  get<T>(endpoint: string, options?: RequestOptions) {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  post<T>(endpoint: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  put<T>(endpoint: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  patch<T>(endpoint: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(endpoint: string, options?: RequestOptions) {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const api = new ApiService();

// Import types
import type {
  AllowlistResponse,
  AllowedEmailEntry,
  UsersResponse,
  UserListItem,
  DeviceActivationInfo,
  DeviceAuthorizationResponse,
  ConnectionsResponse,
  DataConnection,
  CreateConnectionPayload,
  UpdateConnectionPayload,
  TestConnectionPayload,
  ConnectionTestResult,
  SemanticModelsResponse,
  SemanticModel,
  SemanticModelRun,
  CreateRunPayload,
  DatabaseInfo,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  LLMProviderInfo,
  OntologiesResponse,
  Ontology,
  CreateOntologyPayload,
  OntologyGraph,
  DataChatsResponse,
  DataChat,
  LlmTraceRecord,
  ChatShareInfo,
  SharedChatData,
  SpreadsheetProjectsResponse,
  SpreadsheetProject,
  SpreadsheetFile,
  SpreadsheetTable,
  SpreadsheetTablesResponse,
  SpreadsheetRun,
  SpreadsheetPlanModification,
  TablePreviewData,
  DataImport,
  DataImportRun,
  DataImportsResponse,
  DataImportRunsResponse,
  SheetPreviewResult,
} from '../types';

// Allowlist API
export async function getAllowlist(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: 'all' | 'pending' | 'claimed';
}): Promise<AllowlistResponse> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
  if (params?.search) searchParams.set('search', params.search);
  if (params?.status) searchParams.set('status', params.status);

  return api.get<AllowlistResponse>(`/allowlist?${searchParams}`);
}

export async function addToAllowlist(
  email: string,
  notes?: string,
): Promise<AllowedEmailEntry> {
  return api.post<AllowedEmailEntry>('/allowlist', { email, notes });
}

export async function removeFromAllowlist(id: string): Promise<void> {
  await api.delete<void>(`/allowlist/${id}`);
}

// Users API
export async function getUsers(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: string;
  isActive?: boolean;
}): Promise<UsersResponse> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
  if (params?.search) searchParams.set('search', params.search);
  if (params?.role) searchParams.set('role', params.role);
  if (params?.isActive !== undefined)
    searchParams.set('isActive', String(params.isActive));

  return api.get<UsersResponse>(`/users?${searchParams}`);
}

export async function updateUser(
  id: string,
  data: { displayName?: string; isActive?: boolean },
): Promise<UserListItem> {
  return api.patch<UserListItem>(`/users/${id}`, data);
}

export async function updateUserRoles(
  id: string,
  roles: string[],
): Promise<UserListItem> {
  return api.put<UserListItem>(`/users/${id}/roles`, { roles });
}

// Device Activation API
export async function getDeviceActivationInfo(
  userCode: string,
): Promise<DeviceActivationInfo> {
  return api.get<DeviceActivationInfo>(`/auth/device/activate?code=${userCode}`);
}

export async function authorizeDevice(
  userCode: string,
  approve: boolean,
): Promise<DeviceAuthorizationResponse> {
  return api.post<DeviceAuthorizationResponse>('/auth/device/authorize', {
    userCode,
    approve,
  });
}

// Connections API
export async function getConnections(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  dbType?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}): Promise<ConnectionsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
  if (params?.search) searchParams.set('search', params.search);
  if (params?.dbType) searchParams.set('dbType', params.dbType);
  if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
  if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder);

  return api.get<ConnectionsResponse>(`/connections?${searchParams}`);
}

export async function getConnection(id: string): Promise<DataConnection> {
  return api.get<DataConnection>(`/connections/${id}`);
}

export async function createConnection(
  data: CreateConnectionPayload,
): Promise<DataConnection> {
  return api.post<DataConnection>('/connections', data);
}

export async function updateConnection(
  id: string,
  data: UpdateConnectionPayload,
): Promise<DataConnection> {
  return api.patch<DataConnection>(`/connections/${id}`, data);
}

export async function deleteConnection(id: string): Promise<void> {
  await api.delete<void>(`/connections/${id}`);
}

export async function testNewConnection(
  data: TestConnectionPayload,
): Promise<ConnectionTestResult> {
  return api.post<ConnectionTestResult>('/connections/test', data);
}

export async function testExistingConnection(
  id: string,
): Promise<ConnectionTestResult> {
  return api.post<ConnectionTestResult>(`/connections/${id}/test`);
}

// ==========================================
// Semantic Models API
// ==========================================

export async function getSemanticModels(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  connectionId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}): Promise<SemanticModelsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
  if (params?.search) searchParams.set('search', params.search);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.connectionId) searchParams.set('connectionId', params.connectionId);
  if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
  if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder);
  const query = searchParams.toString();
  return api.get<SemanticModelsResponse>(`/semantic-models${query ? `?${query}` : ''}`);
}

export async function getSemanticModel(id: string): Promise<SemanticModel> {
  return api.get<SemanticModel>(`/semantic-models/${id}`);
}

export async function updateSemanticModel(
  id: string,
  data: { name?: string; description?: string; model?: Record<string, unknown> },
): Promise<SemanticModel & { validation?: { fixedIssues: string[]; warnings: string[] } }> {
  return api.patch<SemanticModel & { validation?: { fixedIssues: string[]; warnings: string[] } }>(`/semantic-models/${id}`, data);
}

export async function deleteSemanticModel(id: string): Promise<void> {
  await api.delete<void>(`/semantic-models/${id}`);
}

export async function validateSemanticModel(
  model: Record<string, unknown>,
): Promise<{ isValid: boolean; fatalIssues: string[]; fixedIssues: string[]; warnings: string[] }> {
  return api.post<{ isValid: boolean; fatalIssues: string[]; fixedIssues: string[]; warnings: string[] }>('/semantic-models/validate', { model });
}

export async function exportSemanticModelYaml(id: string): Promise<{ yaml: string; name: string }> {
  return api.get<{ yaml: string; name: string }>(`/semantic-models/${id}/yaml`);
}

export async function getSemanticModelRuns(modelId: string): Promise<SemanticModelRun[]> {
  return api.get<SemanticModelRun[]>(`/semantic-models/${modelId}/runs`);
}

export async function createSemanticModelRun(data: CreateRunPayload): Promise<SemanticModelRun> {
  return api.post<SemanticModelRun>('/semantic-models/runs', data);
}

export async function getSemanticModelRun(runId: string): Promise<SemanticModelRun> {
  return api.get<SemanticModelRun>(`/semantic-models/runs/${runId}`);
}

export async function cancelSemanticModelRun(runId: string): Promise<SemanticModelRun> {
  return api.post<SemanticModelRun>(`/semantic-models/runs/${runId}/cancel`);
}

export async function listAllRuns(opts?: {
  page?: number;
  pageSize?: number;
  status?: string;
}): Promise<{ runs: SemanticModelRun[]; total: number; page: number; pageSize: number }> {
  const params = new URLSearchParams();
  if (opts?.page) params.set('page', String(opts.page));
  if (opts?.pageSize) params.set('pageSize', String(opts.pageSize));
  if (opts?.status) params.set('status', opts.status);
  const query = params.toString();
  return api.get(`/semantic-models/runs${query ? `?${query}` : ''}`);
}

export async function deleteSemanticModelRun(runId: string): Promise<void> {
  await api.delete<void>(`/semantic-models/runs/${runId}`);
}

// ==========================================
// Discovery API
// ==========================================

export async function getConnectionDatabases(connectionId: string): Promise<DatabaseInfo[]> {
  return api.get<DatabaseInfo[]>(`/connections/${connectionId}/databases`);
}

export async function getConnectionSchemas(connectionId: string, database: string): Promise<SchemaInfo[]> {
  return api.get<SchemaInfo[]>(`/connections/${connectionId}/databases/${encodeURIComponent(database)}/schemas`);
}

export async function getConnectionTables(connectionId: string, database: string, schema: string): Promise<TableInfo[]> {
  return api.get<TableInfo[]>(`/connections/${connectionId}/databases/${encodeURIComponent(database)}/schemas/${encodeURIComponent(schema)}/tables`);
}

export async function getConnectionColumns(connectionId: string, database: string, schema: string, table: string): Promise<ColumnInfo[]> {
  return api.get<ColumnInfo[]>(`/connections/${connectionId}/databases/${encodeURIComponent(database)}/schemas/${encodeURIComponent(schema)}/tables/${encodeURIComponent(table)}/columns`);
}

// ==========================================
// LLM Providers API
// ==========================================

export async function getLlmProviders(): Promise<{ providers: LLMProviderInfo[] }> {
  return api.get<{ providers: LLMProviderInfo[] }>('/llm/providers');
}

// ==========================================
// Ontologies API
// ==========================================

export async function getOntologies(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}): Promise<OntologiesResponse> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
  if (params?.search) searchParams.set('search', params.search);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
  if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder);
  const query = searchParams.toString();
  return api.get<OntologiesResponse>(`/ontologies${query ? `?${query}` : ''}`);
}

export async function getOntology(id: string): Promise<Ontology> {
  return api.get<Ontology>(`/ontologies/${id}`);
}

export async function createOntology(data: CreateOntologyPayload): Promise<Ontology> {
  return api.post<Ontology>('/ontologies', data);
}

export async function deleteOntology(id: string): Promise<void> {
  await api.delete<void>(`/ontologies/${id}`);
}

export async function getOntologyGraph(id: string): Promise<OntologyGraph> {
  return api.get<OntologyGraph>(`/ontologies/${id}/graph`);
}

export async function exportOntologyRdf(id: string): Promise<{ rdf: string; name: string }> {
  return api.get<{ rdf: string; name: string }>(`/ontologies/${id}/rdf`);
}

// ============================================================================
// Data Agent API
// ============================================================================

export async function getDataChats(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  ontologyId?: string;
  sortBy?: string;
  sortOrder?: string;
}): Promise<DataChatsResponse> {
  const queryParams = new URLSearchParams();
  if (params?.page) queryParams.set('page', String(params.page));
  if (params?.pageSize) queryParams.set('pageSize', String(params.pageSize));
  if (params?.search) queryParams.set('search', params.search);
  if (params?.ontologyId) queryParams.set('ontologyId', params.ontologyId);
  if (params?.sortBy) queryParams.set('sortBy', params.sortBy);
  if (params?.sortOrder) queryParams.set('sortOrder', params.sortOrder);
  const qs = queryParams.toString();
  return api.get<DataChatsResponse>(`/data-agent/chats${qs ? `?${qs}` : ''}`);
}

export async function createDataChat(data: {
  name: string;
  ontologyId: string;
  llmProvider?: string | null;
}): Promise<DataChat> {
  return api.post<DataChat>('/data-agent/chats', data);
}

export async function getDataChat(id: string): Promise<DataChat> {
  return api.get<DataChat>(`/data-agent/chats/${id}`);
}

export async function updateDataChat(
  id: string,
  data: { name?: string; llmProvider?: string | null },
): Promise<DataChat> {
  return api.patch<DataChat>(`/data-agent/chats/${id}`, data);
}

export async function deleteDataChat(id: string): Promise<void> {
  return api.delete<void>(`/data-agent/chats/${id}`);
}

export async function sendDataAgentMessage(
  chatId: string,
  content: string,
): Promise<{ userMessage: { id: string }; assistantMessage: { id: string } }> {
  return api.post(`/data-agent/chats/${chatId}/messages`, { content });
}

export async function getMessageTraces(
  chatId: string,
  messageId: string,
): Promise<LlmTraceRecord[]> {
  return api.get<LlmTraceRecord[]>(`/data-agent/chats/${chatId}/messages/${messageId}/traces`);
}

// ============================================================================
// Data Agent Preferences API
// ============================================================================

export interface AgentPreference {
  id: string;
  userId: string;
  ontologyId: string | null;
  key: string;
  value: string;
  source: 'manual' | 'auto_captured';
  createdAt: string;
  updatedAt: string;
}

export async function getAgentPreferences(
  ontologyId?: string,
  scope?: 'global' | 'ontology' | 'all',
): Promise<AgentPreference[]> {
  const params = new URLSearchParams();
  if (ontologyId) params.set('ontologyId', ontologyId);
  if (scope) params.set('scope', scope);
  const qs = params.toString();
  // api.get already unwraps { data: ... } via the TransformInterceptor handling in request()
  return api.get<AgentPreference[]>(`/data-agent/preferences${qs ? `?${qs}` : ''}`);
}

export async function createAgentPreference(data: {
  ontologyId?: string | null;
  key: string;
  value: string;
  source?: 'manual' | 'auto_captured';
}): Promise<AgentPreference> {
  return api.post<AgentPreference>('/data-agent/preferences', data);
}

export async function updateAgentPreference(
  id: string,
  data: { value: string },
): Promise<AgentPreference> {
  return api.patch<AgentPreference>(`/data-agent/preferences/${id}`, data);
}

export async function deleteAgentPreference(id: string): Promise<void> {
  return api.delete<void>(`/data-agent/preferences/${id}`);
}

export async function clearAgentPreferences(ontologyId?: string): Promise<void> {
  const params = ontologyId ? `?ontologyId=${ontologyId}` : '';
  return api.delete<void>(`/data-agent/preferences${params}`);
}

// ============================================================================
// Chat Sharing API
// ============================================================================

export async function createChatShare(
  chatId: string,
  expiresInDays?: number,
): Promise<ChatShareInfo> {
  return api.post<ChatShareInfo>(
    `/data-agent/chats/${chatId}/share`,
    expiresInDays !== undefined ? { expiresInDays } : {},
  );
}

export async function getChatShareStatus(chatId: string): Promise<ChatShareInfo> {
  return api.get<ChatShareInfo>(`/data-agent/chats/${chatId}/share`);
}

export async function revokeChatShare(chatId: string): Promise<void> {
  return api.delete<void>(`/data-agent/chats/${chatId}/share`);
}

export async function getSharedChat(shareToken: string): Promise<SharedChatData> {
  return api.get<SharedChatData>(`/data-agent/share/${shareToken}`, { skipAuth: true });
}

// ============================================================================
// Spreadsheet Agent API
// ============================================================================

export async function getSpreadsheetProjects(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}): Promise<SpreadsheetProjectsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
  if (params?.search) searchParams.set('search', params.search);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
  if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder);
  const query = searchParams.toString();
  return api.get<SpreadsheetProjectsResponse>(`/spreadsheet-agent/projects${query ? `?${query}` : ''}`);
}

export async function getSpreadsheetProject(id: string): Promise<SpreadsheetProject> {
  return api.get<SpreadsheetProject>(`/spreadsheet-agent/projects/${id}`);
}

export async function createSpreadsheetProject(data: {
  name: string;
  description?: string;
  storageProvider?: string;
  reviewMode?: 'auto' | 'review';
}): Promise<SpreadsheetProject> {
  return api.post<SpreadsheetProject>('/spreadsheet-agent/projects', data);
}

export async function updateSpreadsheetProject(
  id: string,
  data: { name?: string; description?: string; reviewMode?: 'auto' | 'review' },
): Promise<SpreadsheetProject> {
  return api.patch<SpreadsheetProject>(`/spreadsheet-agent/projects/${id}`, data);
}

export async function deleteSpreadsheetProject(id: string): Promise<void> {
  await api.delete<void>(`/spreadsheet-agent/projects/${id}`);
}

export async function getSpreadsheetFiles(projectId: string): Promise<SpreadsheetFile[]> {
  const result = await api.get<{ items: SpreadsheetFile[]; total: number }>(`/spreadsheet-agent/projects/${projectId}/files`);
  return result.items;
}

export async function getSpreadsheetFile(projectId: string, fileId: string): Promise<SpreadsheetFile> {
  return api.get<SpreadsheetFile>(`/spreadsheet-agent/projects/${projectId}/files/${fileId}`);
}

export async function deleteSpreadsheetFile(projectId: string, fileId: string): Promise<void> {
  await api.delete<void>(`/spreadsheet-agent/projects/${projectId}/files/${fileId}`);
}

export async function getSpreadsheetTables(
  projectId: string,
  params?: { page?: number; pageSize?: number; fileId?: string; status?: string },
): Promise<SpreadsheetTablesResponse> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
  if (params?.fileId) searchParams.set('fileId', params.fileId);
  if (params?.status) searchParams.set('status', params.status);
  const query = searchParams.toString();
  return api.get<SpreadsheetTablesResponse>(`/spreadsheet-agent/projects/${projectId}/tables${query ? `?${query}` : ''}`);
}

export async function getSpreadsheetTable(projectId: string, tableId: string): Promise<SpreadsheetTable> {
  return api.get<SpreadsheetTable>(`/spreadsheet-agent/projects/${projectId}/tables/${tableId}`);
}

export async function getSpreadsheetTablePreview(
  projectId: string,
  tableId: string,
  limit?: number,
): Promise<TablePreviewData> {
  const params = limit ? `?limit=${limit}` : '';
  return api.get<TablePreviewData>(`/spreadsheet-agent/projects/${projectId}/tables/${tableId}/preview${params}`);
}

export async function getSpreadsheetTableDownloadUrl(
  projectId: string,
  tableId: string,
): Promise<{ url: string; expiresIn: number }> {
  return api.get<{ url: string; expiresIn: number }>(`/spreadsheet-agent/projects/${projectId}/tables/${tableId}/download`);
}

export async function deleteSpreadsheetTable(projectId: string, tableId: string): Promise<void> {
  await api.delete<void>(`/spreadsheet-agent/projects/${projectId}/tables/${tableId}`);
}

export async function createSpreadsheetRun(data: {
  projectId: string;
  config?: { reviewMode?: 'auto' | 'review'; concurrency?: number };
}): Promise<SpreadsheetRun> {
  return api.post<SpreadsheetRun>('/spreadsheet-agent/runs', data);
}

export async function getSpreadsheetRun(runId: string): Promise<SpreadsheetRun> {
  return api.get<SpreadsheetRun>(`/spreadsheet-agent/runs/${runId}`);
}

export async function cancelSpreadsheetRun(runId: string): Promise<SpreadsheetRun> {
  return api.post<SpreadsheetRun>(`/spreadsheet-agent/runs/${runId}/cancel`);
}

export async function approveSpreadsheetPlan(
  runId: string,
  modifications?: SpreadsheetPlanModification[],
): Promise<SpreadsheetRun> {
  return api.post<SpreadsheetRun>(`/spreadsheet-agent/runs/${runId}/approve`, { modifications });
}

export async function listAllSpreadsheetRuns(opts?: {
  page?: number;
  pageSize?: number;
  status?: string;
}): Promise<{ runs: SpreadsheetRun[]; total: number; page: number; pageSize: number }> {
  const params = new URLSearchParams();
  if (opts?.page) params.set('page', String(opts.page));
  if (opts?.pageSize) params.set('pageSize', String(opts.pageSize));
  if (opts?.status) params.set('status', opts.status);
  const query = params.toString();
  return api.get(`/spreadsheet-agent/runs${query ? `?${query}` : ''}`);
}

export async function listProjectSpreadsheetRuns(
  projectId: string,
  opts?: { page?: number; pageSize?: number; status?: string },
): Promise<{ runs: SpreadsheetRun[]; total: number; page: number; pageSize: number }> {
  const params = new URLSearchParams();
  if (opts?.page) params.set('page', String(opts.page));
  if (opts?.pageSize) params.set('pageSize', String(opts.pageSize));
  if (opts?.status) params.set('status', opts.status);
  const query = params.toString();
  return api.get(`/spreadsheet-agent/projects/${projectId}/runs${query ? `?${query}` : ''}`);
}

export async function deleteSpreadsheetRun(runId: string): Promise<void> {
  await api.delete<void>(`/spreadsheet-agent/runs/${runId}`);
}

// ============================================================================
// Data Imports API
// ============================================================================

export async function getDataImports(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}): Promise<DataImportsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
  if (params?.search) searchParams.set('search', params.search);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
  if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder);
  const query = searchParams.toString();
  return api.get<DataImportsResponse>(`/data-imports${query ? `?${query}` : ''}`);
}

export async function getDataImport(id: string): Promise<DataImport> {
  return api.get<DataImport>(`/data-imports/${id}`);
}

export async function uploadDataImportFile(file: File, name?: string): Promise<DataImport> {
  const formData = new FormData();
  formData.append('file', file);
  if (name) formData.append('name', name);

  const token = api.getAccessToken();
  const response = await fetch(`${API_BASE_URL}/data-imports/upload`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'include',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error((error as { message?: string }).message || `Upload failed: ${response.status}`);
  }

  const data = await response.json();
  return data.data ?? data;
}

export async function getDataImportPreview(id: string): Promise<unknown> {
  return api.get(`/data-imports/${id}/preview`);
}

export async function getExcelSheetPreview(
  id: string,
  body: { sheetName: string; range?: object; hasHeader?: boolean; limit?: number },
): Promise<SheetPreviewResult> {
  return api.post<SheetPreviewResult>(`/data-imports/${id}/preview`, body);
}

export async function updateDataImport(id: string, data: object): Promise<DataImport> {
  return api.patch<DataImport>(`/data-imports/${id}`, data);
}

export async function deleteDataImport(id: string): Promise<void> {
  await api.delete<void>(`/data-imports/${id}`);
}

export async function createDataImportRun(importId: string): Promise<DataImportRun> {
  return api.post<DataImportRun>('/data-imports/runs', { importId });
}

export async function getDataImportRuns(
  importId: string,
  params?: { page?: number; pageSize?: number; status?: string },
): Promise<DataImportRunsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
  if (params?.status) searchParams.set('status', params.status);
  const query = searchParams.toString();
  return api.get<DataImportRunsResponse>(`/data-imports/${importId}/runs${query ? `?${query}` : ''}`);
}

export async function listAllDataImportRuns(opts?: {
  page?: number;
  pageSize?: number;
  status?: string;
}): Promise<DataImportRunsResponse> {
  const params = new URLSearchParams();
  if (opts?.page) params.set('page', String(opts.page));
  if (opts?.pageSize) params.set('pageSize', String(opts.pageSize));
  if (opts?.status) params.set('status', opts.status);
  const query = params.toString();
  return api.get<DataImportRunsResponse>(`/data-imports/runs${query ? `?${query}` : ''}`);
}

export async function getDataImportRun(runId: string): Promise<DataImportRun> {
  return api.get<DataImportRun>(`/data-imports/runs/${runId}`);
}

export async function cancelDataImportRun(runId: string): Promise<DataImportRun> {
  return api.post<DataImportRun>(`/data-imports/runs/${runId}/cancel`);
}

export async function deleteDataImportRun(runId: string): Promise<void> {
  await api.delete<void>(`/data-imports/runs/${runId}`);
}
