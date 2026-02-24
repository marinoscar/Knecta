import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { StorageProvider } from '../../../storage/providers/storage-provider.interface';
import { SpreadsheetAgentStateType } from '../state';
import { EmitFn } from '../graph';

const logger = new Logger('PersistNode');

export interface PersistNodeDeps {
  prisma: PrismaService;
  emit: EmitFn;
  storageProvider: StorageProvider;
}

export function createPersistNode(deps: PersistNodeDeps) {
  const { prisma, emit } = deps;

  return async (state: SpreadsheetAgentStateType): Promise<Partial<SpreadsheetAgentStateType>> => {
    emit({ type: 'phase_start', phase: 'persist', label: 'Persisting results' });

    const { projectId, extractionResults, extractionPlan, validationReport } = state;

    try {
      const successfulResults = extractionResults.filter((r) => r.status === 'success');

      // 1. Create SpreadsheetTable records for each successful extraction
      for (const result of successfulResults) {
        const planTable = extractionPlan?.tables.find((t) => t.tableName === result.tableName);

        await prisma.spreadsheetTable.create({
          data: {
            projectId,
            fileId: planTable?.sourceFileId || '',
            sheetName: planTable?.sourceSheetName || '',
            tableName: result.tableName,
            description: planTable?.description || '',
            columns: result.columns as any,
            rowCount: BigInt(result.rowCount),
            outputPath: result.outputPath,
            outputSizeBytes: BigInt(result.sizeBytes),
            status: 'ready',
            extractionNotes: getExtractionNotes(result, validationReport),
          },
        });
      }

      // 2. Update project aggregate stats
      const totalRows = successfulResults.reduce((sum, r) => sum + r.rowCount, 0);
      const totalSizeBytes = successfulResults.reduce((sum, r) => sum + r.sizeBytes, 0);
      const allPassed = !validationReport || validationReport.passed;
      const hasFailures = extractionResults.some((r) => r.status === 'failed');

      let projectStatus: string;
      if (successfulResults.length === 0) {
        projectStatus = 'failed';
      } else if (hasFailures || !allPassed) {
        projectStatus = 'partial';
      } else {
        projectStatus = 'ready';
      }

      await prisma.spreadsheetProject.update({
        where: { id: projectId },
        data: {
          status: projectStatus as any,
          tableCount: successfulResults.length,
          totalRows: BigInt(totalRows),
          totalSizeBytes: BigInt(totalSizeBytes),
        },
      });

      // 3. Generate catalog.json (as JSON — actual cloud upload is TODO)
      const catalog = {
        projectId,
        generatedAt: new Date().toISOString(),
        tables: successfulResults.map((r) => {
          const planTable = extractionPlan?.tables.find((t) => t.tableName === r.tableName);
          return {
            name: r.tableName,
            description: planTable?.description || '',
            parquetPath: r.outputPath,
            rowCount: r.rowCount,
            sizeBytes: r.sizeBytes,
            columns: r.columns.map((c) => ({
              name: c.name,
              type: c.type,
              nullCount: c.nullCount,
            })),
            sourceFile: planTable?.sourceFileName || '',
            sourceSheet: planTable?.sourceSheetName || '',
            extractionNotes: getExtractionNotes(r, validationReport) || '',
          };
        }),
        relationships: extractionPlan?.relationships || [],
        dataQualityNotes: extractionPlan?.catalogMetadata?.dataQualityNotes || [],
        revisionCycles: state.revisionCount,
        tokensUsed: state.tokensUsed,
      };

      // TODO: Upload catalog.json to cloud storage at <outputPrefix>/catalog.json
      logger.log(
        `Catalog generated for project ${projectId}: ${JSON.stringify(catalog).length} bytes`,
      );

      emit({
        type: 'progress',
        completedFiles: state.fileInventory.length,
        totalFiles: state.fileInventory.length,
        completedSheets: state.sheetAnalyses.length,
        totalSheets: state.sheetAnalyses.length,
        completedTables: successfulResults.length,
        totalTables: extractionResults.length,
        percentComplete: 100,
      });

      emit({ type: 'phase_complete', phase: 'persist' });

      return { currentPhase: 'persist' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Persist node failed: ${errorMessage}`);
      emit({ type: 'phase_complete', phase: 'persist' });

      // Throw so the error propagates to the agent service — a persist failure
      // means 0 tables were saved and must be surfaced as a run failure.
      throw new Error(`Persist failed: ${errorMessage}`);
    }
  };
}

function getExtractionNotes(
  result: SpreadsheetAgentStateType['extractionResults'][0],
  validationReport: SpreadsheetAgentStateType['validationReport'],
): string | null {
  if (!validationReport) return null;

  const tableReport = validationReport.tables.find((t) => t.tableName === result.tableName);
  if (!tableReport || tableReport.passed) return null;

  const failedChecks = tableReport.checks.filter((c) => !c.passed);
  if (failedChecks.length === 0) return null;

  return `Validation caveats: ${failedChecks.map((c) => c.message).join('; ')}`;
}
