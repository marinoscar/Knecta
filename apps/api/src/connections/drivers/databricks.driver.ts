import { DatabaseDriver, ConnectionParams, ConnectionTestResult } from './driver.interface';

export class DatabricksDriver implements DatabaseDriver {
  async testConnection(params: ConnectionParams): Promise<ConnectionTestResult> {
    const start = Date.now();

    try {
      // Dynamic import to handle cases where the package might not be available
      const { DBSQLClient } = await import('@databricks/sql');

      const httpPath = params.options?.httpPath as string;
      if (!httpPath) {
        return { success: false, message: 'HTTP Path is required for Databricks connections', latencyMs: Date.now() - start };
      }

      const client = new DBSQLClient();

      await client.connect({
        host: params.host,
        path: httpPath,
        token: params.password || '',
      });

      const session = await client.openSession();
      const queryOperation = await session.executeStatement('SELECT 1');
      await queryOperation.close();
      await session.close();
      await client.close();

      const latencyMs = Date.now() - start;
      return { success: true, message: 'Connection successful', latencyMs };
    } catch (error) {
      const latencyMs = Date.now() - start;
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message, latencyMs };
    }
  }
}
