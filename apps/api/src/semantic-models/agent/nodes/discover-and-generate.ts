import { AgentStateType } from '../state';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage } from '@langchain/core/messages';
import { DiscoveryService } from '../../../discovery/discovery.service';
import { SemanticModelsService } from '../../semantic-models.service';
import { ColumnInfo, ForeignKeyInfo, ColumnStatsResult } from '../../../connections/drivers/driver.interface';
import { OSIDataset, OSIMetric } from '../osi/types';
import { buildGenerateDatasetPrompt } from '../prompts/generate-dataset-prompt';
import { extractJson, extractTokenUsage } from '../utils';
import { injectFieldDataTypes } from '../utils/inject-field-data-types';
import { Logger } from '@nestjs/common';

const logger = new Logger('DiscoverAndGenerate');

interface TableStatusEntry {
  tableName: string;
  status: 'pending' | 'discovering' | 'generating' | 'completed' | 'failed';
  error?: string;
  startedAt?: string;
  completedAt?: string;
  tokensUsed?: number;
}

/**
 * Select which columns to run getColumnStats on.
 * Prioritizes PKs, FKs, then interesting columns. Max 10.
 */
function selectColumnsForStats(
  columns: ColumnInfo[],
  tableFKs: ForeignKeyInfo[],
  tableName: string,
): string[] {
  const selected = new Set<string>();

  // Always include PK columns
  for (const col of columns) {
    if (col.isPrimaryKey) {
      selected.add(col.name);
    }
  }

  // Always include FK columns involving this table
  for (const fk of tableFKs) {
    if (fk.fromTable === tableName) {
      for (const col of fk.fromColumns) {
        selected.add(col);
      }
    }
    if (fk.toTable === tableName) {
      for (const col of fk.toColumns) {
        selected.add(col);
      }
    }
  }

  // Add up to 5 more interesting columns
  const skipTypes = ['text', 'bytea', 'json', 'jsonb', 'xml', 'blob', 'clob', 'ntext', 'image'];
  const remaining = columns
    .filter(c => !selected.has(c.name) && !skipTypes.includes(c.dataType.toLowerCase()))
    .sort((a, b) => a.name.length - b.name.length) // Prefer shorter names
    .slice(0, 5);

  for (const col of remaining) {
    selected.add(col.name);
  }

  // Cap at 10
  return Array.from(selected).slice(0, 10);
}

export function createDiscoverAndGenerateNode(
  llm: BaseChatModel,
  discoveryService: DiscoveryService,
  semanticModelsService: SemanticModelsService,
  connectionId: string,
  userId: string,
  databaseName: string,
  runId: string,
  emitProgress: (event: object) => void,
) {
  return async (state: AgentStateType) => {
    const datasets: OSIDataset[] = [];
    const allMetrics: OSIMetric[][] = [];
    const failedTables: string[] = [];
    let tokensUsed = { prompt: 0, completion: 0, total: 0 };
    const startTimeMs = Date.now();
    const startTime = new Date().toISOString();

    // FK cache per schema
    const fkCache = new Map<string, ForeignKeyInfo[]>();

    // Initialize table status
    const tableStatus: TableStatusEntry[] = state.selectedTables.map(t => ({
      tableName: t,
      status: 'pending' as const,
    }));

    const modelName = state.modelName || `Model for ${databaseName}`;

    for (let i = 0; i < state.selectedTables.length; i++) {
      const tableFQN = state.selectedTables[i]; // "schema.table"
      const dotIdx = tableFQN.indexOf('.');
      const schemaName = tableFQN.substring(0, dotIdx);
      const tableName = tableFQN.substring(dotIdx + 1);

      const tableStartTime = new Date().toISOString();
      tableStatus[i].startedAt = tableStartTime;

      // --- Phase: Discover ---
      tableStatus[i].status = 'discovering';
      emitProgress({
        type: 'progress',
        currentTable: i + 1,
        totalTables: state.selectedTables.length,
        tableName: tableFQN,
        phase: 'discover',
        percentComplete: Math.round((i / state.selectedTables.length) * 80),
      });

      try {
        // 1. List columns
        const columnsResult = await discoveryService.listColumns(connectionId, databaseName, schemaName, tableName, userId);
        const columns = columnsResult.data;

        // 2. Get foreign keys (cached per schema)
        if (!fkCache.has(schemaName)) {
          const fkResult = await discoveryService.getForeignKeys(connectionId, databaseName, schemaName, userId);
          fkCache.set(schemaName, fkResult.data);
        }
        const schemaFKs = fkCache.get(schemaName)!;
        const tableFKs = schemaFKs.filter(
          fk => fk.fromTable === tableName || fk.toTable === tableName,
        );

        // 3. Get sample data
        const sampleResult = await discoveryService.getSampleData(connectionId, databaseName, schemaName, tableName, 5, userId);

        // 4. Get column stats for selected columns
        const statsColumns = selectColumnsForStats(columns, tableFKs, tableName);
        const columnStats = new Map<string, ColumnStatsResult>();
        for (const colName of statsColumns) {
          try {
            const statsResult = await discoveryService.getColumnStats(connectionId, databaseName, schemaName, tableName, colName, userId);
            columnStats.set(colName, statsResult.data);
          } catch (err) {
            logger.warn(`Failed to get stats for ${tableFQN}.${colName}: ${err}`);
          }
        }

        // --- Phase: Generate ---
        tableStatus[i].status = 'generating';
        emitProgress({
          type: 'progress',
          currentTable: i + 1,
          totalTables: state.selectedTables.length,
          tableName: tableFQN,
          phase: 'generate',
          percentComplete: Math.round((i / state.selectedTables.length) * 80),
        });

        // Persist progress to DB
        await semanticModelsService.updateRunProgress(runId, {
          currentStep: 'discover_and_generate',
          currentStepLabel: 'Discovering & Generating Datasets',
          completedTables: i,
          totalTables: state.selectedTables.length,
          failedTables: [...failedTables],
          percentComplete: Math.round((i / state.selectedTables.length) * 80),
          tokensUsed,
          startedAt: startTime,
          elapsedMs: Date.now() - startTimeMs,
          partialModel: { datasets: [...datasets], foreignKeys: Array.from(fkCache.values()).flat(), tableMetrics: [...allMetrics] },
          tableStatus: [...tableStatus],
          steps: [],
        }).catch(() => {}); // fire-and-forget

        // 5. Build prompt and call LLM
        const prompt = buildGenerateDatasetPrompt({
          tableName: tableFQN,
          databaseName,
          columns,
          sampleData: sampleResult.data,
          foreignKeys: tableFKs,
          columnStats,
          modelName,
          instructions: state.instructions || undefined,
          osiSpecText: state.osiSpecText || undefined,
        });

        const response = await llm.invoke([new HumanMessage(prompt)]);

        // Track tokens
        const tableTokens = extractTokenUsage(response);
        tokensUsed = {
          prompt: tokensUsed.prompt + tableTokens.prompt,
          completion: tokensUsed.completion + tableTokens.completion,
          total: tokensUsed.total + tableTokens.total,
        };
        tableStatus[i].tokensUsed = tableTokens.total;

        // Emit token update
        emitProgress({ type: 'token_update', tokensUsed });

        // 6. Parse JSON response
        const content = typeof response.content === 'string'
          ? response.content
          : JSON.stringify(response.content);

        const parsed = extractJson(content);
        if (!parsed || !parsed.dataset) {
          throw new Error('LLM response did not contain valid JSON with a "dataset" field');
        }

        const dataset = parsed.dataset as OSIDataset;
        const metrics = (parsed.metrics || []) as OSIMetric[];

        // Programmatically inject data types from discovery (source of truth)
        injectFieldDataTypes(dataset, columns);

        datasets.push(dataset);
        allMetrics.push(metrics);

        // Mark table complete
        tableStatus[i].status = 'completed';
        tableStatus[i].completedAt = new Date().toISOString();

        const completedCount = datasets.length;

        // Persist progress with partial model
        await semanticModelsService.updateRunProgress(runId, {
          currentStep: 'discover_and_generate',
          currentStepLabel: 'Discovering & Generating Datasets',
          completedTables: completedCount,
          totalTables: state.selectedTables.length,
          failedTables: [...failedTables],
          percentComplete: Math.round((completedCount / state.selectedTables.length) * 80),
          tokensUsed,
          startedAt: startTime,
          elapsedMs: Date.now() - startTimeMs,
          partialModel: { datasets: [...datasets], foreignKeys: Array.from(fkCache.values()).flat(), tableMetrics: [...allMetrics] },
          tableStatus: [...tableStatus],
          steps: [],
        }).catch(() => {}); // fire-and-forget

        emitProgress({
          type: 'table_complete',
          tableName: tableFQN,
          tableIndex: i + 1,
          totalTables: state.selectedTables.length,
          datasetName: dataset.name,
        });

        logger.log(`Completed table ${i + 1}/${state.selectedTables.length}: ${tableFQN} (${tableTokens.total} tokens)`);

      } catch (error: any) {
        // Table failed — log and continue
        failedTables.push(tableFQN);
        tableStatus[i].status = 'failed';
        tableStatus[i].error = error.message || 'Unknown error';
        tableStatus[i].completedAt = new Date().toISOString();

        // Persist progress
        await semanticModelsService.updateRunProgress(runId, {
          currentStep: 'discover_and_generate',
          currentStepLabel: 'Discovering & Generating Datasets',
          completedTables: datasets.length,
          totalTables: state.selectedTables.length,
          failedTables: [...failedTables],
          percentComplete: Math.round((datasets.length / state.selectedTables.length) * 80),
          tokensUsed,
          startedAt: startTime,
          elapsedMs: Date.now() - startTimeMs,
          partialModel: { datasets: [...datasets], foreignKeys: Array.from(fkCache.values()).flat(), tableMetrics: [...allMetrics] },
          tableStatus: [...tableStatus],
          steps: [],
        }).catch(() => {}); // fire-and-forget

        emitProgress({
          type: 'table_error',
          tableName: tableFQN,
          error: error.message || 'Unknown error',
        });

        logger.warn(`Failed table ${i + 1}/${state.selectedTables.length}: ${tableFQN}: ${error.message}`);
      }
    }

    // Collect all foreign keys from cache
    const allForeignKeys: ForeignKeyInfo[] = [];
    for (const fks of fkCache.values()) {
      allForeignKeys.push(...fks);
    }

    return {
      datasets,
      foreignKeys: allForeignKeys,
      tableMetrics: allMetrics,
      failedTables,
      tokensUsed,
    };
  };
}
