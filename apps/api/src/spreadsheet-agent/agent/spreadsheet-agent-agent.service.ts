import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LlmService } from '../../llm/llm.service';
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
    private readonly llmService: LlmService,
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

      if (event.type === 'file_complete') {
        this.prisma.spreadsheetFile
          .update({
            where: { id: event.fileId as string },
            data: {
              status: 'analyzing',
              sheetCount: (event.sheetCount as number) || 0,
            },
          })
          .catch((err: Error) =>
            this.logger.error(`Failed to update file status: ${err.message}`),
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
      const llm = this.llmService.getChatModel();
      const graph = buildSpreadsheetAgentGraph({ llm, prisma: this.prisma }, emit);

      // 7. Set initial state
      const initialState: Partial<SpreadsheetAgentStateType> = {
        runId,
        projectId: run.projectId,
        userId: run.createdByUserId ?? '',
        files: projectFiles,
        config,
      };

      // If resuming after review, inject the plan and modifications, and
      // populate minimal fileInventory/sheetAnalyses so the extract node's
      // progress events have correct counts without re-running ingest/analyze.
      if (isResumeAfterReview) {
        initialState.extractionPlan = run.extractionPlan as any;
        initialState.planModifications = run.extractionPlanModified as any;

        const plan = run.extractionPlan as any;
        if (plan?.tables) {
          // Collect unique files and their sheets from the extraction plan.
          const uniqueFiles = new Map<
            string,
            { fileId: string; fileName: string; sheets: Set<string> }
          >();
          for (const t of plan.tables) {
            const existing = uniqueFiles.get(t.sourceFileId);
            if (existing) {
              existing.sheets.add(t.sourceSheetName);
            } else {
              uniqueFiles.set(t.sourceFileId, {
                fileId: t.sourceFileId,
                fileName: t.sourceFileName,
                sheets: new Set([t.sourceSheetName]),
              });
            }
          }

          // Minimal FileInventory — only `.length` is used in progress events.
          initialState.fileInventory = Array.from(uniqueFiles.values()).map((f) => ({
            fileId: f.fileId,
            fileName: f.fileName,
            fileType: '',
            fileSizeBytes: 0,
            fileHash: '',
            sheets: Array.from(f.sheets).map((name) => ({
              name,
              rowCount: 0,
              colCount: 0,
              hasMergedCells: false,
              hasFormulas: false,
              dataDensity: 0,
              sampleGrid: [],
              lastRows: [],
              mergedCellRanges: [],
            })),
          }));

          // Minimal SheetAnalysis — one entry per unique file+sheet pair.
          const sheetSet = new Set<string>();
          for (const t of plan.tables) {
            sheetSet.add(`${t.sourceFileId}:${t.sourceSheetName}`);
          }
          initialState.sheetAnalyses = Array.from(sheetSet).map((key) => {
            const colonIdx = key.indexOf(':');
            const fileId = key.slice(0, colonIdx);
            const sheetName = key.slice(colonIdx + 1);
            const table = plan.tables.find(
              (t: any) => t.sourceFileId === fileId && t.sourceSheetName === sheetName,
            );
            return {
              fileId,
              fileName: table?.sourceFileName ?? '',
              sheetName,
              logicalTables: [],
              crossFileHints: [],
            };
          });
        }
      }

      onEvent({ type: 'run_start' });

      // 8. Execute graph
      const result = await graph.invoke(initialState, { signal });
      const finalState = result as SpreadsheetAgentStateType;

      // 9. Check for errors in the final state (defense-in-depth)
      if (finalState.error) {
        this.logger.error(`Agent completed with error for run ${runId}: ${finalState.error}`);

        await this.spreadsheetAgentService.updateRunStatus(runId, 'failed', {
          errorMessage: finalState.error,
          completedAt: new Date(),
          stats: {
            tablesExtracted: finalState.extractionResults?.length ?? 0,
            totalRows: 0,
            totalSizeBytes: 0,
            tokensUsed: finalState.tokensUsed,
            revisionCycles: finalState.revisionCount,
          },
        });

        // Also update project status to 'failed'
        await this.prisma.spreadsheetProject
          .update({
            where: { id: run.projectId },
            data: { status: 'failed' },
          })
          .catch((err: Error) =>
            this.logger.error(`Failed to update project status: ${err.message}`),
          );

        onEvent({ type: 'run_error', message: finalState.error });
        return;
      }

      // 10. Determine final status
      const isReviewPause =
        config.reviewMode === 'review' &&
        finalState.extractionPlan != null &&
        !finalState.extractionResults?.length;

      if (isReviewPause) {
        // Review mode: save plan and pause for user approval
        await this.spreadsheetAgentService.updateRunStatus(runId, 'review_pending', {
          extractionPlan: finalState.extractionPlan,
          stats: {
            tablesExtracted: 0,
            totalRows: 0,
            totalSizeBytes: 0,
            tokensUsed: finalState.tokensUsed,
            revisionCycles: 0,
          },
        });

        // Also update the project status to 'review_pending'
        await this.prisma.spreadsheetProject
          .update({
            where: { id: run.projectId },
            data: { status: 'review_pending' },
          })
          .catch((err: Error) =>
            this.logger.error(`Failed to update project status: ${err.message}`),
          );

        onEvent({
          type: 'review_ready',
          projectId: run.projectId,
          extractionPlan: finalState.extractionPlan,
          tokensUsed: finalState.tokensUsed,
        });
      } else {
        // Full completion (auto mode or after extraction)
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
      }

      this.logger.log(`Agent execution ${isReviewPause ? 'paused for review' : 'completed'} for run ${runId}`);
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

      // Also update the project status to 'failed'
      await this.prisma.spreadsheetProject
        .update({
          where: { id: run.projectId },
          data: { status: 'failed' },
        })
        .catch((err: Error) =>
          this.logger.error(`Failed to update project status to failed: ${err.message}`),
        );

      onEvent({ type: 'run_error', message: errorMessage });
    }
  }
}
