import { Client } from 'pg';
import { DatabaseDriver, ConnectionParams, ConnectionTestResult } from './driver.interface';

export class PostgreSQLDriver implements DatabaseDriver {
  async testConnection(params: ConnectionParams): Promise<ConnectionTestResult> {
    const start = Date.now();
    const client = new Client({
      host: params.host,
      port: params.port,
      database: params.databaseName || undefined,
      user: params.username || undefined,
      password: params.password || undefined,
      ssl: params.useSsl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 10000,
      query_timeout: 10000,
    });

    try {
      await client.connect();
      await client.query('SELECT 1');
      const latencyMs = Date.now() - start;
      return { success: true, message: 'Connection successful', latencyMs };
    } catch (error) {
      const latencyMs = Date.now() - start;
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message, latencyMs };
    } finally {
      try {
        await client.end();
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
