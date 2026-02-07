import * as mssql from 'mssql';
import { DatabaseDriver, ConnectionParams, ConnectionTestResult } from './driver.interface';

export class SQLServerDriver implements DatabaseDriver {
  async testConnection(params: ConnectionParams): Promise<ConnectionTestResult> {
    const start = Date.now();
    let pool: mssql.ConnectionPool | null = null;

    try {
      const config: mssql.config = {
        server: params.host,
        port: params.port,
        database: params.databaseName || undefined,
        user: params.username || undefined,
        password: params.password || undefined,
        connectionTimeout: 10000,
        requestTimeout: 10000,
        options: {
          encrypt: params.useSsl || (params.options?.encrypt as boolean) || false,
          trustServerCertificate: (params.options?.trustServerCertificate as boolean) ?? true,
          instanceName: (params.options?.instanceName as string) || undefined,
        },
      };

      pool = await mssql.connect(config);
      await pool.request().query('SELECT 1');
      const latencyMs = Date.now() - start;
      return { success: true, message: 'Connection successful', latencyMs };
    } catch (error) {
      const latencyMs = Date.now() - start;
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message, latencyMs };
    } finally {
      if (pool) {
        try {
          await pool.close();
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }
}
