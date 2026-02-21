import { Controller, Post, Param, Req, Res, Logger } from '@nestjs/common';
import { ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';
import { FastifyRequest, FastifyReply } from 'fastify';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PERMISSIONS } from '../common/constants/roles.constants';
import { SpreadsheetAgentAgentService } from './agent/agent.service';
import { SpreadsheetAgentService } from './spreadsheet-agent.service';

/**
 * Step labels for UI display
 */
const STEP_LABELS: Record<string, string> = {
  parse_sheets: 'Parsing Spreadsheets',
  infer_schema: 'Inferring Table Schemas',
  convert_and_upload: 'Converting & Uploading to S3',
  persist_results: 'Saving Results',
};

/**
 * Spreadsheet Agent Stream Controller
 *
 * Provides direct SSE streaming of the spreadsheet processing agent.
 *
 * Event types:
 * - run_start: Agent execution started
 * - step_start: Node execution started
 * - step_end: Node execution completed
 * - progress: Processing progress (file/table level)
 * - file_parsed: A file was successfully parsed
 * - table_schema_inferred: Schema inferred for a table
 * - table_uploaded: A table was uploaded to S3
 * - table_error: A table failed to process
 * - token_update: Cumulative token usage
 * - run_complete: Agent execution completed
 * - run_error: Agent execution failed
 */
@ApiTags('Spreadsheet Agent')
@Controller('spreadsheet-agent')
export class AgentStreamController {
  private readonly logger = new Logger(AgentStreamController.name);

  constructor(
    private readonly agentService: SpreadsheetAgentAgentService,
    private readonly spreadsheetService: SpreadsheetAgentService,
  ) {}

  @Post('runs/:runId/stream')
  @Auth({ permissions: [PERMISSIONS.SPREADSHEET_AGENT_WRITE] })
  @ApiExcludeEndpoint()
  async streamAgentRun(
    @Param('runId') runId: string,
    @CurrentUser('id') userId: string,
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ) {
    const startTime = Date.now();

    try {
      // 1. Validate run exists
      const run = await this.spreadsheetService.getRun(runId);

      // Atomically claim the run
      const claimed = await this.spreadsheetService.claimRun(runId);
      if (!claimed) {
        throw {
          status: 409,
          code: 'RUN_ALREADY_EXECUTING',
          message: 'This run is already being executed',
        };
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
        // 5. Create agent graph
        const { graph, initialState } = await this.agentService.createAgentGraph(
          runId,
          userId,
          run.storageObjectIds,
          this.spreadsheetService,
          emit,
          run.instructions || undefined,
        );

        // 6. Start keep-alive heartbeat
        keepAlive = setInterval(() => {
          if (!raw.writableEnded) {
            raw.write(': keep-alive\n\n');
          }
        }, 30_000);

        // 7. Emit run_start
        emit({ type: 'run_start', runId });

        // 8. Stream graph execution
        const stream = await graph.stream(initialState, {
          streamMode: 'updates',
        });

        let currentStep: string | null = null;

        // 9. Process updates
        for await (const data of stream) {
          const update = data as Record<string, any>;
          const nodeName = Object.keys(update)[0];

          // Track step transitions
          if (nodeName !== currentStep) {
            if (currentStep) {
              emit({ type: 'step_end', step: currentStep });
            }
            currentStep = nodeName;
            emit({
              type: 'step_start',
              step: nodeName,
              label: STEP_LABELS[nodeName] || nodeName,
            });
          }

          emit({ type: 'step_end', step: nodeName });
          currentStep = null;
        }

        // 10. Fetch updated run
        const updatedRun = await this.spreadsheetService.getRun(runId);
        const duration = Date.now() - startTime;

        // 11. Final progress update
        await this.spreadsheetService.updateRunProgress(runId, {
          currentStep: null,
          currentStepLabel: null,
          percentComplete: 100,
          duration,
        }).catch(() => {});

        // 12. Emit run_complete
        emit({
          type: 'run_complete',
          runId,
          tableCount: updatedRun.tableCount,
          totalRows: updatedRun.totalRows,
          totalSizeBytes: updatedRun.totalSizeBytes,
          s3OutputPrefix: updatedRun.s3OutputPrefix,
          duration,
        });

        if (keepAlive) clearInterval(keepAlive);
        raw.end();
      } catch (error: any) {
        if (keepAlive) clearInterval(keepAlive);

        this.logger.error(`Agent execution failed for run ${runId}`, error.stack);

        try {
          await this.spreadsheetService.updateRunStatus(
            runId,
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
