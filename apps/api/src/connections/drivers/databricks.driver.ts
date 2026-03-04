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

      const authMethod = (params.options?.authMethod as string) || 'token';
      const client = new DBSQLClient();

      if (authMethod === 'oauth_m2m') {
        const oauthClientId = params.options?.oauthClientId as string | undefined;
        if (!oauthClientId) {
          return {
            success: false,
            message: 'OAuth Client ID is required for OAuth M2M authentication',
            latencyMs: Date.now() - start,
          };
        }
        await client.connect({
          authType: 'databricks-oauth',
          host: params.host,
          path: httpPath,
          oauthClientId,
          oauthClientSecret: params.password || '',
        } as Parameters<typeof client.connect>[0]);
      } else {
        await client.connect({
          host: params.host,
          path: httpPath,
          token: params.password || '',
        });
      }

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
