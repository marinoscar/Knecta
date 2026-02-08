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
  plan_discovery: 'Planning Discovery',
  await_approval: 'Awaiting Approval',
  agent: 'Analyzing Database',
  tools: 'Running Discovery Tools',
  generate_model: 'Generating Semantic Model',
  persist_model: 'Saving Model',
};

/**
 * Callback handler that emits SSE events during LLM execution.
 * Used alongside streamMode: 'updates' to provide token-level streaming
 * without the state corruption caused by streamMode: ['messages', 'updates'].
 */
class SSEStreamHandler extends BaseCallbackHandler {
  name = 'SSEStreamHandler';
  currentNode: string | null = null;

  constructor(
    private emit: (event: object) => void,
    private stepLabels: Record<string, string>,
  ) {
    super();
  }

  handleChatModelStart(
    _llm: any, _messages: any, _runId: string, _parentRunId?: string,
    _extraParams?: any, _tags?: string[], metadata?: Record<string, unknown>,
  ) {
    const nodeName = metadata?.langgraph_node as string | undefined;
    if (nodeName && nodeName !== this.currentNode) {
      if (this.currentNode) {
        this.emit({ type: 'step_end', step: this.currentNode });
      }
      this.currentNode = nodeName;
      this.emit({
        type: 'step_start',
        step: nodeName,
        label: this.stepLabels[nodeName] || nodeName,
      });
    }
  }

  handleLLMNewToken(token: string) {
    if (token && token.length > 0) {
      this.emit({ type: 'text_delta', content: token });
    }
  }
}

/**
 * Agent Stream Controller
 *
 * Provides direct SSE streaming of LangGraph agent execution for semantic model generation.
 * This replaces the previous CopilotKit integration with a simpler, direct streaming approach.
 */
@ApiTags('Semantic Models')
@Controller('semantic-models')
export class AgentStreamController {
  private readonly logger = new Logger(AgentStreamController.name);

  constructor(
    private readonly agentService: AgentService,
    private readonly semanticModelsService: SemanticModelsService,
  ) {}

  /**
   * Stream agent execution via SSE
   *
   * @param runId - Semantic model run ID
   * @param userId - Current user ID (from JWT)
   * @returns SSE stream of agent execution events
   *
   * Event types:
   * - run_start: Agent execution started
   * - step_start: Node execution started (with step name and label)
   * - text: AI assistant text message
   * - tool_start: Tool invocation started (with tool name and args)
   * - tool_result: Tool execution completed (with result)
   * - step_end: Node execution completed
   * - run_complete: Agent execution completed successfully (with semanticModelId)
   * - run_error: Agent execution failed (with error message)
   */
  @Post('runs/:runId/stream')
  @Auth({ permissions: [PERMISSIONS.SEMANTIC_MODELS_GENERATE] })
  @ApiExcludeEndpoint()
  async streamAgentRun(
    @Param('runId') runId: string,
    @CurrentUser('id') userId: string,
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ) {
    try {
      // 1. Validate run exists and user has access
      const run = await this.semanticModelsService.getRun(runId, userId);

      // 2. Hijack response for SSE streaming (CRITICAL: prevents Fastify from closing the response)
      res.hijack();
      const raw = res.raw;

      // 3. Write SSE headers
      raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      // 4. Create emit helper for SSE events
      const emit = (event: object) => {
        if (!raw.writableEnded) {
          raw.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      };

      try {
        // 5. Create agent graph
        const { graph, initialState } = await this.agentService.createAgentGraph(
          run.connectionId,
          userId,
          run.databaseName,
          run.selectedSchemas as string[],
          run.selectedTables as string[],
          runId,
          undefined, // llmProvider (use default)
          { skipApproval: true },
        );

        // 6. Update run status to 'executing'
        await this.semanticModelsService.updateRunStatus(runId, userId, 'executing');

        // 7. Emit run_start event
        emit({ type: 'run_start' });

        // 8. Stream graph execution with 'updates' mode + callbacks for token streaming
        const sseHandler = new SSEStreamHandler(emit, STEP_LABELS);

        const stream = await graph.stream(initialState, {
          streamMode: 'updates',
          configurable: { thread_id: runId },
          callbacks: [sseHandler],
        });

        // 9. Process updates for node-level events (tool_start, tool_result, step tracking)
        for await (const data of stream) {
          const nodeName = Object.keys(data)[0];
          const output = data[nodeName];

          // For non-LLM nodes (tools, await_approval, persist_model),
          // the callback didn't fire — emit step_start from updates mode
          if (nodeName !== sseHandler.currentNode) {
            if (sseHandler.currentNode) {
              emit({ type: 'step_end', step: sseHandler.currentNode });
            }
            sseHandler.currentNode = nodeName;
            emit({
              type: 'step_start',
              step: nodeName,
              label: STEP_LABELS[nodeName] || nodeName,
            });
          }

          // Extract tool_start and tool_result from node output messages
          if (output?.messages && Array.isArray(output.messages)) {
            for (const msg of output.messages) {
              const msgType = msg._getType?.();
              // AI message with tool_calls → emit tool_start for each
              if (msgType === 'ai' && msg.tool_calls?.length > 0) {
                for (const tc of msg.tool_calls) {
                  emit({ type: 'tool_start', tool: tc.name, args: tc.args });
                }
              }
              // ToolMessage → emit tool_result
              if (msgType === 'tool') {
                emit({
                  type: 'tool_result',
                  tool: msg.name,
                  content: typeof msg.content === 'string'
                    ? msg.content
                    : JSON.stringify(msg.content),
                });
              }
            }
          }

          // Emit step_end for this node
          emit({ type: 'step_end', step: nodeName });
          sseHandler.currentNode = null;
        }

        // Close final step if still open from callback
        if (sseHandler.currentNode) {
          emit({ type: 'step_end', step: sseHandler.currentNode });
        }

        // 10. Fetch updated run to get semanticModelId
        const updatedRun = await this.semanticModelsService.getRun(runId, userId);

        // 11. Emit run_complete
        emit({
          type: 'run_complete',
          semanticModelId: updatedRun.semanticModelId,
        });

        // 12. End SSE stream
        raw.end();
      } catch (error: any) {
        // Error during agent execution
        this.logger.error(`Agent execution failed for run ${runId}`, error.stack);

        // Update run status to 'failed'
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

        // Emit error event
        emit({
          type: 'run_error',
          message: error.message || 'Agent execution failed',
        });

        // End SSE stream
        raw.end();
      }
    } catch (error: any) {
      // Error during setup (e.g., run not found, permission denied)
      this.logger.error(`Agent stream setup failed for run ${runId}`, error.stack);

      // Send error response (stream not started yet, so we can use normal response)
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
