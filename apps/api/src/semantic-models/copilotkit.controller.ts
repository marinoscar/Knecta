import { Controller, Post, Req, Res, Logger } from '@nestjs/common';
import { ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';
import { FastifyRequest, FastifyReply } from 'fastify';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PERMISSIONS } from '../common/constants/roles.constants';
import { AgentService } from './agent/agent.service';
import { SemanticModelsService } from './semantic-models.service';

/**
 * CopilotKit runtime endpoint for semantic model agent
 *
 * Handles AG-UI protocol communication (SSE) between the frontend CopilotKit
 * sidebar and the LangGraph agent. Implements the JSON-RPC envelope format
 * with methods: info, agent/connect, agent/run.
 *
 * NOTE: This bypasses CopilotKit's CopilotRuntime to avoid the InMemoryAgentRunner's
 * global thread tracking (globalThis GLOBAL_STORE) which causes "Thread already running"
 * errors when previous SSE streams drop without cleanup.
 */
@ApiTags('CopilotKit')
@Controller('copilotkit')
export class CopilotKitController {
  private readonly logger = new Logger(CopilotKitController.name);

  constructor(
    private readonly agentService: AgentService,
    private readonly semanticModelsService: SemanticModelsService,
  ) {}

  /**
   * CopilotKit runtime endpoint — handles AG-UI protocol via SSE
   *
   * JSON-RPC envelope: { method, params: { agentId }, body: { threadId, messages, state } }
   * Methods:
   * - info: returns agent metadata
   * - agent/connect: returns empty SSE (no history to replay)
   * - agent/run: streams AG-UI events from our LangGraph agent
   */
  @Post()
  @Auth({ permissions: [PERMISSIONS.SEMANTIC_MODELS_GENERATE] })
  @ApiExcludeEndpoint()
  async handleCopilotRequest(
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
    @CurrentUser('id') userId: string,
  ) {
    const body = req.body as any;
    const method = body?.method;
    const runId = req.headers['x-run-id'] as string;

    console.log('[CopilotKit] method:', method, 'runId:', runId || '(none)');

    // --- Handle "info" method (no X-Run-Id needed) ---
    if (method === 'info') {
      res.send({
        agents: {
          default: {
            name: 'default',
            description: 'Analyzes database schemas and generates semantic models using AI',
            className: 'SemanticModelAgent',
          },
        },
        audioFileTranscriptionEnabled: false,
      });
      return;
    }

    if (!runId) {
      this.logger.warn('CopilotKit request without X-Run-Id header');
      res.status(400).send({
        code: 'MISSING_RUN_ID',
        message: 'X-Run-Id header is required',
      });
      return;
    }

    // --- Handle "agent/connect" method ---
    // Returns empty SSE stream — no history to replay for our use case
    if (method === 'agent/connect') {
      res.hijack();
      const rawRes = res.raw;
      rawRes.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      rawRes.end();
      return;
    }

    // --- Handle "agent/run" method ---
    if (method === 'agent/run') {
      try {
        // Fetch run data to get connection context
        const run = await this.semanticModelsService.getRun(runId, userId);

        // Import agent factory (dynamic for ESM compat)
        const { createSemanticModelAgent } = await import('./agent/copilotkit-agent');

        // Create agent with full context
        const agent = await createSemanticModelAgent({
          agentService: this.agentService,
          semanticModelsService: this.semanticModelsService,
          runId,
          userId,
          connectionId: run.connectionId,
          databaseName: run.databaseName,
          selectedSchemas: run.selectedSchemas as string[],
          selectedTables: run.selectedTables as string[],
        });

        // Hijack Fastify response for SSE streaming
        res.hijack();
        const rawRes = res.raw;
        rawRes.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        });

        // Extract inner body from JSON-RPC envelope
        const input = body.body || {};

        // Call agent.run() which returns an RxJS Observable of AG-UI events
        const observable = agent.run({
          threadId: input.threadId || `thread-${Date.now()}`,
          runId: input.runId || runId,
          messages: input.messages || [],
          state: input.state || {},
        });

        // Subscribe to the Observable and write SSE events
        observable.subscribe({
          next: (event: any) => {
            if (!rawRes.writableEnded) {
              // AG-UI SSE format: data: <json>\n\n
              rawRes.write(`data: ${JSON.stringify(event)}\n\n`);
            }
          },
          error: (err: any) => {
            this.logger.error('Agent stream error', err);
            if (!rawRes.writableEnded) {
              rawRes.write(`data: ${JSON.stringify({ type: 'RUN_ERROR', message: err.message || 'Agent execution failed' })}\n\n`);
              rawRes.end();
            }
          },
          complete: () => {
            console.log('[CopilotKit] agent/run SSE stream complete');
            if (!rawRes.writableEnded) {
              rawRes.end();
            }
          },
        });
      } catch (error) {
        this.logger.error('Agent run setup failed', error);
        // If hijacked, use raw response; otherwise use res
        if (!res.raw.writableEnded) {
          res.raw.statusCode = 500;
          res.raw.setHeader('Content-Type', 'application/json');
          res.raw.end(
            JSON.stringify({
              code: 'COPILOTKIT_RUNTIME_ERROR',
              message: 'Failed to start agent run',
            }),
          );
        }
      }
      return;
    }

    // --- Handle "agent/stop" method ---
    if (method === 'agent/stop') {
      res.send({ success: true });
      return;
    }

    // Unknown method
    res.status(400).send({
      code: 'UNKNOWN_METHOD',
      message: `Unknown method: ${method}`,
    });
  }
}
