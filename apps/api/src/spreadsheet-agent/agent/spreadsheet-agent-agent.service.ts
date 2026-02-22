import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SpreadsheetAgentService } from '../spreadsheet-agent.service';
import { buildSpreadsheetAgentGraph, EmitFn } from './graph';
import { SpreadsheetAgentStateType } from './state';
import { ProjectFile, RunConfig, SpreadsheetAgentEvent } from './types';

@Injectable()
export class SpreadsheetAgentAgentService {
  private readonly logger = new Logger(SpreadsheetAgentAgentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly spreadsheetAgentService: SpreadsheetAgentService,
  ) {}

  async executeAgent(
    runId: string,
    onEvent: (event: SpreadsheetAgentEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    this.logger.log(`Starting agent execution for run ${runId}`);

    // 1. Load run details
    const run = await this.prisma.spreadsheetRun.findUnique({
      where: { id: runId },
      include: { project: true },
    });

    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }

    // 2. Load project files
    const files = await this.prisma.spreadsheetFile.findMany({
      where: { projectId: run.projectId },
    });

    const projectFiles: ProjectFile[] = files.map((f) => ({
      fileId: f.id,
      fileName: f.fileName,
      fileType: f.fileType,
      fileSizeBytes: Number(f.fileSizeBytes),
      storagePath: f.storagePath,
      fileHash: f.fileHash,
    }));

    // 3. Build run config
    const runConfig = run.config as Record<string, unknown> | null;
    const config: RunConfig = {
      reviewMode: (runConfig?.reviewMode as string) === 'auto' ? 'auto' : 'review',
      concurrency: (runConfig?.concurrency as number) || 5,
    };

    // 4. Determine if this is a resume after review approval
    const isResumeAfterReview =
      run.extractionPlan != null && run.extractionPlanModified != null;

    // 5. Emit callback wrapping — also update run progress in DB
    const emit: EmitFn = (event) => {
      onEvent(event);

      // Update DB progress on key events
      if (event.type === 'progress') {
        this.spreadsheetAgentService
          .updateRunProgress(runId, event)
          .catch((err: Error) =>
            this.logger.error(`Failed to update progress: ${err.message}`),
          );
      }

      if (event.type === 'phase_start') {
        const phaseToStatus: Record<string, string> = {
          ingest: 'ingesting',
          analyze: 'analyzing',
          design: 'designing',
          extract: 'extracting',
          validate: 'validating',
          persist: 'persisting',
        };
        const status = phaseToStatus[event.phase as string];
        if (status) {
          this.spreadsheetAgentService
            .updateRunStatus(runId, status, { currentPhase: event.phase as string })
            .catch((err: Error) =>
              this.logger.error(`Failed to update status: ${err.message}`),
            );
        }
      }
    };

    try {
      // 6. Build and compile graph
      const graph = buildSpreadsheetAgentGraph(emit);

      // 7. Set initial state
      const initialState: Partial<SpreadsheetAgentStateType> = {
        runId,
        projectId: run.projectId,
        userId: run.createdByUserId ?? '',
        files: projectFiles,
        config,
      };

      // If resuming after review, inject the plan and modifications
      if (isResumeAfterReview) {
        initialState.extractionPlan = run.extractionPlan as any;
        initialState.planModifications = run.extractionPlanModified as any;
        // TODO: When resume support is added, invoke from 'extract' node
      }

      onEvent({ type: 'run_start' });

      // 8. Execute graph
      const result = await graph.invoke(initialState, { signal });

      // 9. Update run as completed
      const finalState = result as SpreadsheetAgentStateType;
      await this.spreadsheetAgentService.updateRunStatus(runId, 'completed', {
        completedAt: new Date(),
        stats: {
          tablesExtracted: finalState.extractionResults?.length ?? 0,
          totalRows:
            finalState.extractionResults?.reduce((sum, r) => sum + r.rowCount, 0) ?? 0,
          totalSizeBytes:
            finalState.extractionResults?.reduce((sum, r) => sum + r.sizeBytes, 0) ?? 0,
          tokensUsed: finalState.tokensUsed,
          revisionCycles: finalState.revisionCount,
        },
      });

      onEvent({
        type: 'run_complete',
        projectId: run.projectId,
        tablesExtracted: finalState.extractionResults?.length ?? 0,
        totalRows:
          finalState.extractionResults?.reduce((sum, r) => sum + r.rowCount, 0) ?? 0,
        tokensUsed: finalState.tokensUsed,
      });

      this.logger.log(`Agent execution completed for run ${runId}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Agent execution failed for run ${runId}: ${errorMessage}`,
      );

      await this.spreadsheetAgentService.updateRunStatus(runId, 'failed', {
        errorMessage,
        completedAt: new Date(),
      });

      onEvent({ type: 'run_error', message: errorMessage });
    }
  }
}
