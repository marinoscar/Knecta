import { SpreadsheetAgentStateType } from '../state';
import { SpreadsheetAgentService } from '../../spreadsheet-agent.service';
import { Logger } from '@nestjs/common';

const logger = new Logger('PersistResults');

export function createPersistResultsNode(
  spreadsheetService: SpreadsheetAgentService,
  runId: string,
  emitProgress: (event: object) => void,
) {
  return async (state: SpreadsheetAgentStateType) => {
    emitProgress({
      type: 'step_start',
      step: 'persist_results',
      label: 'Saving Results',
    });

    const uploadedTables = state.uploadedTables || [];

    // Create SpreadsheetTable records for each uploaded table
    for (const table of uploadedTables) {
      try {
        await spreadsheetService.createTable({
          runId,
          sourceFile: table.sourceFile,
          sourceSheet: table.sourceSheet,
          tableName: table.tableName,
          schema: table.columns,
          rowCount: BigInt(table.rowCount),
          sizeBytes: BigInt(table.sizeBytes),
          storageKey: table.storageKey || '',
          status: table.status,
          errorMessage: table.errorMessage,
          metadata: {
            columnCount: table.columns.length,
          },
        });

        logger.log(`Persisted table record: ${table.tableName}`);
      } catch (error: any) {
        logger.error(`Failed to persist table ${table.tableName}: ${error.message}`);
      }
    }

    // Calculate totals
    const readyTables = uploadedTables.filter(t => t.status === 'ready');
    const totalRows = readyTables.reduce((sum, t) => sum + BigInt(t.rowCount), BigInt(0));
    const totalSizeBytes = readyTables.reduce((sum, t) => sum + BigInt(t.sizeBytes), BigInt(0));

    // Update run stats
    await spreadsheetService.updateRunStats(runId, {
      tableCount: readyTables.length,
      totalRows,
      totalSizeBytes,
      s3OutputPrefix: state.s3OutputPrefix,
    });

    // Mark run as completed or failed
    const allFailed = readyTables.length === 0 && uploadedTables.length > 0;
    if (allFailed) {
      await spreadsheetService.updateRunStatus(runId, 'failed', 'All tables failed to process');
    } else {
      await spreadsheetService.updateRunStatus(runId, 'completed');
    }

    // Final progress update
    await spreadsheetService.updateRunProgress(runId, {
      currentStep: null,
      currentStepLabel: null,
      percentComplete: 100,
      tokensUsed: state.tokensUsed,
      tablesReady: readyTables.length,
      tablesFailed: uploadedTables.length - readyTables.length,
      totalRows: totalRows.toString(),
      totalSizeBytes: totalSizeBytes.toString(),
    }).catch(() => {});

    emitProgress({
      type: 'step_end',
      step: 'persist_results',
    });

    logger.log(`Persisted ${readyTables.length} tables, ${uploadedTables.length - readyTables.length} failed`);

    return {};
  };
}
