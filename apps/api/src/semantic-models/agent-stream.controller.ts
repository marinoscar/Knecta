import { Controller, Post, Param, Req, Res, Logger } from '@nestjs/common';
import { ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';
import { FastifyRequest, FastifyReply } from 'fastify';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PERMISSIONS } from '../common/constants/roles.constants';
import { AgentService } from './agent/agent.service';
import { SemanticModelsService } from './semantic-models.service';

/**
 * Step labels for UI display
 */
const STEP_LABELS: Record<string, string> = {
  discover_and_generate: 'Discovering & Generating Datasets',
  generate_relationships: 'Generating Relationships',
  assemble_model: 'Assembling Model',
  validate_model: 'Validating Model',
  persist_model: 'Saving Model',
};

/**
 * Step history entry
 */
interface StepHistoryEntry {
  step: string;
  label: string;
  startedAt: string;
  completedAt?: string;
  tokens: {
    prompt: number;
    completion: number;
    total: number;
  };
}

/**
 * Callback handler that tracks LLM invocations during agent execution.
 * Tracks node transitions, cumulative token usage, and step history.
 * Progress events (per-table progress, table_complete, table_error) are
 * emitted directly by the agent nodes via the emitProgress callback.
 */
class SSEStreamHandler extends BaseCallbackHandler {
  name = 'SSEStreamHandler';
  currentNode: string | null = null;

  // Token tracking
  promptTokens = 0;
  completionTokens = 0;
  totalTokens = 0;

  // Step history tracking
  steps: StepHistoryEntry[] = [];
  private stepTokensSnapshot = 0;

  constructor(
    private emit: (event: object) => void,
    private stepLabels: Record<string, string>,
    private semanticModelsService: SemanticModelsService,
    private runId: string,
  ) {
    super();
  }

  handleChatModelStart(
    _llm: any, _messages: any, _runId: string, _parentRunId?: string,
    _extraParams?: any, _tags?: string[], metadata?: Record<string, unknown>,
  ) {
    const nodeName = metadata?.langgraph_node as string | undefined;
    if (nodeName && nodeName !== this.currentNode) {
      this.closeCurrentStep();

      this.currentNode = nodeName;
      const label = this.stepLabels[nodeName] || nodeName;

      this.steps.push({
        step: nodeName,
        label,
        startedAt: new Date().toISOString(),
        tokens: { prompt: 0, completion: 0, total: 0 },
      });

      this.emit({
        type: 'step_start',
        step: nodeName,
        label,
      });

      this.updateProgress();
    }
  }

  async handleLLMEnd(output: any) {
    const tokenUsage = output?.llmOutput?.tokenUsage;
    if (tokenUsage) {
      this.promptTokens += tokenUsage.promptTokens || 0;
      this.completionTokens += tokenUsage.completionTokens || 0;
      this.totalTokens += tokenUsage.totalTokens || 0;
    }
    this.emit({
      type: 'token_update',
      tokensUsed: {
        prompt: this.promptTokens,
        completion: this.completionTokens,
        total: this.totalTokens,
      },
    });
  }

  startStep(nodeName: string) {
    if (nodeName !== this.currentNode) {
      this.closeCurrentStep();

      this.currentNode = nodeName;
      const label = this.stepLabels[nodeName] || nodeName;

      this.steps.push({
        step: nodeName,
        label,
        startedAt: new Date().toISOString(),
        tokens: { prompt: 0, completion: 0, total: 0 },
      });

      this.updateProgress();
    }
  }

  endStep() {
    this.closeCurrentStep();
    this.currentNode = null;
    this.updateProgress();
  }

  closeCurrentStep() {
    if (this.steps.length > 0) {
      const lastStep = this.steps[this.steps.length - 1];
      if (!lastStep.completedAt) {
        lastStep.completedAt = new Date().toISOString();
        const delta = this.totalTokens - this.stepTokensSnapshot;
        lastStep.tokens = {
          prompt: delta,
          completion: 0,
          total: delta,
        };
        this.stepTokensSnapshot = this.totalTokens;
      }
    }
  }

  private updateProgress() {
    const progress = {
      currentStep: this.currentNode,
      currentStepLabel: this.currentNode
        ? this.stepLabels[this.currentNode] || this.currentNode
        : null,
      tokensUsed: {
        prompt: this.promptTokens,
        completion: this.completionTokens,
        total: this.totalTokens,
      },
      steps: this.steps,
    };

    this.semanticModelsService
      .updateRunProgress(this.runId, progress)
      .catch(() => {});
  }
}

/**
 * Agent Stream Controller
 *
 * Provides direct SSE streaming of the table-by-table semantic model agent.
 *
 * Event types:
 * - run_start: Agent execution started
 * - step_start: Node execution started (with step name and label)
 * - step_end: Node execution completed
 * - progress: Per-table progress (currentTable, totalTables, tableName, phase, percentComplete)
 * - table_complete: A table was processed successfully
 * - table_error: A table failed to process
 * - token_update: Cumulative token usage update
 * - run_complete: Agent execution completed (with semanticModelId, tokensUsed, failedTables, duration)
 * - run_error: Agent execution failed (with error message)
 */
@ApiTags('Semantic Models')
@Controller('semantic-models')
export class AgentStreamController {
  private readonly logger = new Logger(AgentStreamController.name);

  constructor(
    private readonly agentService: AgentService,
    private readonly semanticModelsService: SemanticModelsService,
  ) {}

  @Post('runs/:runId/stream')
  @Auth({ permissions: [PERMISSIONS.SEMANTIC_MODELS_GENERATE] })
  @ApiExcludeEndpoint()
  async streamAgentRun(
    @Param('runId') runId: string,
    @CurrentUser('id') userId: string,
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ) {
    const startTime = Date.now();

    try {
      // 1. Validate run exists and user has access
      const run = await this.semanticModelsService.getRun(runId, userId);

      // Atomically claim the run
      const claimed = await this.semanticModelsService.claimRun(runId, userId);
      if (!claimed) {
        throw { status: 409, code: 'RUN_ALREADY_EXECUTING', message: 'This run is already being executed' };
      }

      // 2. Hijack response for SSE streaming
      res.hijack();
      const raw = res.raw;

      // 3. Write SSE headers
      raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      // 4. Create emit helper
      const emit = (event: object) => {
        if (!raw.writableEnded) {
          raw.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      };

      let keepAlive: ReturnType<typeof setInterval> | null = null;

      try {
        // 5. Create agent graph — pass semanticModelsService and emit for per-table progress
        const { graph, initialState } = await this.agentService.createAgentGraph(
          run.connectionId,
          userId,
          run.databaseName,
          run.selectedSchemas as string[],
          run.selectedTables as string[],
          runId,
          this.semanticModelsService,
          emit,
          undefined, // llmProvider
          run.name || undefined,
          run.instructions || undefined,
        );

        // 6. Start keep-alive heartbeat
        keepAlive = setInterval(() => {
          if (!raw.writableEnded) {
            raw.write(': keep-alive\n\n');
          }
        }, 30_000);

        // 7. Emit run_start
        emit({ type: 'run_start' });

        // 8. Stream graph execution
        const sseHandler = new SSEStreamHandler(
          emit,
          STEP_LABELS,
          this.semanticModelsService,
          runId,
        );

        const stream = await graph.stream(initialState, {
          streamMode: 'updates',
          callbacks: [sseHandler],
        });

        // Track the last node output for failedTables
        let lastOutput: Record<string, any> = {};

        // 9. Process updates for step tracking
        for await (const data of stream) {
          const update = data as Record<string, any>;
          const nodeName = Object.keys(update)[0];
          const output = update[nodeName];
          lastOutput = output || {};

          // Track step transitions for non-LLM nodes
          if (nodeName !== sseHandler.currentNode) {
            if (sseHandler.currentNode) {
              emit({ type: 'step_end', step: sseHandler.currentNode });
              sseHandler.endStep();
            }
            sseHandler.startStep(nodeName);
            emit({
              type: 'step_start',
              step: nodeName,
              label: STEP_LABELS[nodeName] || nodeName,
            });
          }

          // Emit step_end for this node
          emit({ type: 'step_end', step: nodeName });
          sseHandler.endStep();
        }

        // Close final step
        sseHandler.closeCurrentStep();

        // 10. Fetch updated run
        const updatedRun = await this.semanticModelsService.getRun(runId, userId);
        const duration = Date.now() - startTime;

        // 11. Final progress update
        await this.semanticModelsService.updateRunProgress(runId, {
          currentStep: null,
          currentStepLabel: null,
          percentComplete: 100,
          tokensUsed: {
            prompt: sseHandler.promptTokens,
            completion: sseHandler.completionTokens,
            total: sseHandler.totalTokens,
          },
          steps: sseHandler.steps,
          duration,
        });

        // 12. Emit run_complete with failedTables and duration
        emit({
          type: 'run_complete',
          semanticModelId: updatedRun.semanticModelId,
          tokensUsed: {
            prompt: sseHandler.promptTokens,
            completion: sseHandler.completionTokens,
            total: sseHandler.totalTokens,
          },
          failedTables: lastOutput.failedTables || [],
          duration,
        });

        if (keepAlive) clearInterval(keepAlive);
        raw.end();
      } catch (error: any) {
        if (keepAlive) clearInterval(keepAlive);

        this.logger.error(`Agent execution failed for run ${runId}`, error.stack);

        try {
          await this.semanticModelsService.updateRunStatus(
            runId,
            userId,
            'failed',
            error.message || 'Agent execution failed',
          );
        } catch (updateError: any) {
          this.logger.error(`Failed to update run status to 'failed'`, updateError.stack);
        }

        emit({
          type: 'run_error',
          message: error.message || 'Agent execution failed',
        });

        raw.end();
      }
    } catch (error: any) {
      this.logger.error(`Agent stream setup failed for run ${runId}`, error.stack);

      if (!res.raw.writableEnded) {
        res.raw.statusCode = error.status || 500;
        res.raw.setHeader('Content-Type', 'application/json');
        res.raw.end(
          JSON.stringify({
            code: error.code || 'AGENT_STREAM_ERROR',
            message: error.message || 'Failed to start agent stream',
          }),
        );
      }
    }
  }
}
