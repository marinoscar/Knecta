export interface ConnectionParams {
  host: string;
  port: number;
  databaseName?: string;
  username?: string;
  password?: string;
  useSsl: boolean;
  options?: Record<string, unknown>;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  latencyMs: number;
}

export interface DatabaseDriver {
  testConnection(params: ConnectionParams): Promise<ConnectionTestResult>;
}
