import {
  Controller,
  Post,
  Param,
  ParseUUIDPipe,
  Res,
  Logger,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { FastifyReply } from 'fastify';
import { Auth } from '../auth/decorators/auth.decorator';
import { PERMISSIONS } from '../common/constants/roles.constants';
import { SpreadsheetAgentService } from './spreadsheet-agent.service';
import { SpreadsheetAgentAgentService } from './agent/spreadsheet-agent-agent.service';
import { SpreadsheetAgentEvent } from './agent/types';

/**
 * Spreadsheet Agent Stream Controller
 *
 * Provides SSE streaming of spreadsheet agent execution progress.
 *
 * Event types emitted:
 * - run_start: Agent execution started
 * - phase_start: Phase execution started (ingest, analyze, design, extract, validate, persist)
 * - phase_complete: Phase execution completed
 * - file_start / file_complete / file_error: Per-file events during ingestion
 * - sheet_analysis: Sheet structure analysis result
 * - progress: General progress update
 * - extraction_plan: Extraction plan produced by the designer phase
 * - review_ready: Plan is ready for human review (review mode only)
 * - table_start / table_complete / table_error: Per-table events during extraction
 * - validation_result: Validation report produced by the validator phase
 * - token_update: Cumulative LLM token usage
 * - text: Free-form text from the agent
 * - run_complete: Agent execution completed successfully
 * - run_error: Agent execution failed
 */
@ApiTags('Spreadsheet Agent')
@Controller('spreadsheet-agent')
export class SpreadsheetAgentStreamController {
  private readonly logger = new Logger(SpreadsheetAgentStreamController.name);

  constructor(
    private readonly spreadsheetAgentService: SpreadsheetAgentService,
    private readonly agentService: SpreadsheetAgentAgentService,
  ) {}

  @Post('runs/:runId/stream')
  @Auth({ permissions: [PERMISSIONS.SPREADSHEET_AGENT_WRITE] })
  @ApiOperation({ summary: 'Stream agent execution progress via SSE' })
  @ApiParam({ name: 'runId', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'SSE stream of agent events' })
  @ApiResponse({ status: 404, description: 'Run not found' })
  @ApiResponse({ status: 409, description: 'Run already executing' })
  @ApiResponse({ status: 400, description: 'Run is in terminal state' })
  async streamRun(
    @Param('runId', ParseUUIDPipe) runId: string,
    @Res() reply: FastifyReply,
  ) {
    // 1. Verify run exists and is in a valid state.
    //    getRun() throws NotFoundException if the run does not exist — the
    //    exception propagates normally before we hijack the response.
    const run = await this.spreadsheetAgentService.getRun(runId);

    const terminalStatuses = ['completed', 'failed', 'cancelled'];
    if (terminalStatuses.includes(run.status)) {
      throw new BadRequestException(
        `Run ${runId} is in terminal state '${run.status}' and cannot be streamed`,
      );
    }

    // 2. Atomic claim — transitions pending → ingesting.
    //    Returns false if another process already claimed it.
    const claimed = await this.spreadsheetAgentService.claimRun(runId);
    if (!claimed) {
      throw new ConflictException(
        `Run ${runId} is already being executed by another process`,
      );
    }

    // 3. Hijack the Fastify response for SSE streaming.
    //    MUST call reply.hijack() before any writes — this sets kReplyHijacked
    //    which prevents Fastify from calling res.end() when the controller
    //    method returns.
    reply.hijack();

    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering for SSE
    });

    // 4. Helper: write a typed SSE frame.
    const sendEvent = (event: SpreadsheetAgentEvent) => {
      if (!res.writableEnded) {
        try {
          const data = JSON.stringify(event);
          res.write(`event: ${event.type}\ndata: ${data}\n\n`);
        } catch {
          // Ignore write errors (client already disconnected)
        }
      }
    };

    // 5. Keep-alive heartbeat every 30 seconds to prevent proxy timeouts.
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) {
        try {
          res.write(': keep-alive\n\n');
        } catch {
          clearInterval(heartbeat);
        }
      }
    }, 30_000);

    // 6. AbortController for graceful cancellation on client disconnect.
    const abortController = new AbortController();

    res.on('close', () => {
      this.logger.log(`Client disconnected from stream for run ${runId}`);
      abortController.abort();
      clearInterval(heartbeat);
    });

    try {
      this.logger.log(`Starting SSE stream for run ${runId}`);

      // 7. Execute the agent.
      //    executeAgent() emits run_start, phase_*, table_*, run_complete /
      //    run_error events via onEvent and also updates run status in the DB.
      await this.agentService.executeAgent(
        runId,
        (event) => sendEvent(event),
        abortController.signal,
      );

      this.logger.log(`SSE stream completed for run ${runId}`);
    } catch (error) {
      // Unexpected error outside of normal agent error handling
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `SSE stream error for run ${runId}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      sendEvent({ type: 'run_error', message: errorMessage });
    } finally {
      clearInterval(heartbeat);
      if (!res.writableEnded) {
        try {
          res.end();
        } catch {
          // Ignore if the socket is already closed
        }
      }
    }
  }
}
