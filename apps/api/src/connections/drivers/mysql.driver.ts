import * as mysql from 'mysql2/promise';
import { DatabaseDriver, ConnectionParams, ConnectionTestResult } from './driver.interface';

export class MySQLDriver implements DatabaseDriver {
  async testConnection(params: ConnectionParams): Promise<ConnectionTestResult> {
    const start = Date.now();
    let connection: mysql.Connection | null = null;

    try {
      connection = await mysql.createConnection({
        host: params.host,
        port: params.port,
        database: params.databaseName || undefined,
        user: params.username || undefined,
        password: params.password || undefined,
        ssl: params.useSsl ? { rejectUnauthorized: false } : undefined,
        connectTimeout: 10000,
      });

      await connection.query('SELECT 1');
      const latencyMs = Date.now() - start;
      return { success: true, message: 'Connection successful', latencyMs };
    } catch (error) {
      const latencyMs = Date.now() - start;
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message, latencyMs };
    } finally {
      if (connection) {
        try {
          await connection.end();
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }
}
