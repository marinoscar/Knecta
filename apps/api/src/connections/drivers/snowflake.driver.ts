import { DatabaseDriver, ConnectionParams, ConnectionTestResult } from './driver.interface';

export class SnowflakeDriver implements DatabaseDriver {
  async testConnection(params: ConnectionParams): Promise<ConnectionTestResult> {
    const start = Date.now();

    try {
      // Dynamic import to handle cases where the package might not be available
      const snowflake = await import('snowflake-sdk');

      const account = params.options?.account as string;
      if (!account) {
        return { success: false, message: 'Account identifier is required for Snowflake connections', latencyMs: Date.now() - start };
      }

      return await new Promise<ConnectionTestResult>((resolve) => {
        const connection = snowflake.createConnection({
          account,
          username: params.username || '',
          password: params.password || '',
          database: params.databaseName || undefined,
          warehouse: (params.options?.warehouse as string) || undefined,
          role: (params.options?.role as string) || undefined,
          schema: (params.options?.schema as string) || undefined,
          timeout: 10000,
        });

        connection.connect((err) => {
          if (err) {
            const latencyMs = Date.now() - start;
            resolve({ success: false, message: err.message, latencyMs });
            return;
          }

          connection.execute({
            sqlText: 'SELECT 1',
            complete: (execErr) => {
              const latencyMs = Date.now() - start;
              connection.destroy((destroyErr) => {
                // Ignore destroy errors
              });

              if (execErr) {
                resolve({ success: false, message: execErr.message, latencyMs });
              } else {
                resolve({ success: true, message: 'Connection successful', latencyMs });
              }
            },
          });
        });

        // Timeout safety
        setTimeout(() => {
          const latencyMs = Date.now() - start;
          try {
            connection.destroy(() => {});
          } catch {
            // Ignore
          }
          resolve({ success: false, message: 'Connection timed out', latencyMs });
        }, 15000);
      });
    } catch (error) {
      const latencyMs = Date.now() - start;
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message, latencyMs };
    }
  }
}
