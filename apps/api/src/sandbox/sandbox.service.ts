import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  returnCode: number;
  files: Array<{ name: string; base64: string; mimeType: string }>;
  executionTimeMs: number;
}

@Injectable()
export class SandboxService {
  private readonly logger = new Logger(SandboxService.name);
  private readonly sandboxUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.sandboxUrl = this.configService.get<string>('sandbox.url') || 'http://sandbox:8000';
  }

  /**
   * Execute Python code in the sandbox container.
   * Returns stdout, stderr, generated files, and execution time.
   */
  async executeCode(code: string, timeout: number = 30): Promise<ExecutionResult> {
    this.logger.debug(`Executing code in sandbox (timeout: ${timeout}s)`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), (timeout + 5) * 1000);

    try {
      const response = await fetch(`${this.sandboxUrl}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, timeout }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Sandbox execution failed (${response.status}): ${error}`);
      }

      const result: ExecutionResult = await response.json();
      this.logger.debug(`Code executed in ${result.executionTimeMs}ms (returnCode: ${result.returnCode})`);
      return result;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Sandbox execution timed out after ${timeout + 5} seconds`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Check if the sandbox is healthy.
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.sandboxUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
