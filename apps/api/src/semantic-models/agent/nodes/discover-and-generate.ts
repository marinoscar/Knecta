import { AgentStateType } from '../state';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage } from '@langchain/core/messages';
import { DiscoveryService } from '../../../discovery/discovery.service';
import { SemanticModelsService } from '../../semantic-models.service';
import { ColumnInfo, ForeignKeyInfo, ColumnStatsResult } from '../../../connections/drivers/driver.interface';
import { OSIDataset, OSIMetric } from '../osi/types';
import { buildGenerateDatasetPrompt } from '../prompts/generate-dataset-prompt';
import { extractJson, extractTokenUsage } from '../utils';
import { injectFieldDataTypes, isEligibleForSampleData } from '../utils/inject-field-data-types';
import { Logger } from '@nestjs/common';
import { createConcurrencyLimiter } from '../utils/concurrency';

const logger = new Logger('DiscoverAndGenerate');

export const DEFAULT_TABLE_CONCURRENCY = 5;

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

/**
 * Detect a recency column (updated_at, created_at, etc.) for ordering sample data.
 * Returns the column name if found, undefined otherwise.
 */
function detectRecencyColumn(columns: ColumnInfo[]): string | undefined {
  const RECENCY_PATTERNS = [
    'updated_at', 'modified_at', 'last_modified', 'updated_date',
    'created_at', 'created_date', 'createdat', 'updatedat',
  ];
  const DATE_TYPES = new Set([
    'date', 'timestamp', 'timestamp without time zone',
    'timestamp with time zone', 'datetime', 'datetime2',
    'smalldatetime', 'timestamp_ntz', 'timestamp_ltz', 'timestamp_tz',
  ]);

  for (const pattern of RECENCY_PATTERNS) {
    const match = columns.find(
      c => c.name.toLowerCase() === pattern
        && DATE_TYPES.has(c.dataType.toLowerCase()),
    );
    if (match) return match.name;
  }
  // Fallback: check for integer 'version' column
  const versionCol = columns.find(
    c => c.name.toLowerCase() === 'version'
      && ['integer', 'int', 'bigint', 'smallint', 'number'].includes(c.dataType.toLowerCase()),
  );
  return versionCol?.name;
}

/**
 * Pre-fetch foreign keys for all unique schemas.
 * This prevents duplicate fetches when processing tables in parallel.
 */
async function prefetchForeignKeys(
  discoveryService: DiscoveryService,
  connectionId: string,
  databaseName: string,
  tableFQNs: string[],
): Promise<Map<string, ForeignKeyInfo[]>> {
  const fkCache = new Map<string, ForeignKeyInfo[]>();
  const uniqueSchemas = new Set<string>();

  for (const tableFQN of tableFQNs) {
    const dotIdx = tableFQN.indexOf('.');
    const schemaName = tableFQN.substring(0, dotIdx);
    uniqueSchemas.add(schemaName);
  }

  for (const schemaName of uniqueSchemas) {
    try {
      const fkResult = await discoveryService.getForeignKeys(connectionId, databaseName, schemaName);
      fkCache.set(schemaName, fkResult.data);
    } catch (err) {
      logger.warn(`Failed to fetch foreign keys for schema ${schemaName}: ${err}`);
      fkCache.set(schemaName, []);
    }
  }

  return fkCache;
}

/**
 * Process a single table: discovery + LLM generation.
 * This function is designed to be called in parallel for multiple tables.
 */
async function processOneTable(
  tableFQN: string,
  tableIndex: number,
  deps: {
    llm: BaseChatModel;
    discoveryService: DiscoveryService;
    semanticModelsService: SemanticModelsService;
    connectionId: string;
    databaseName: string;
    runId: string;
    modelName: string;
    instructions?: string;
    osiSpecText?: string;
    emitProgress: (event: object) => void;
  },
  sharedState: {
    datasets: OSIDataset[];
    allMetrics: OSIMetric[][];
    failedTables: string[];
    tableStatus: TableStatusEntry[];
    tokensUsed: { prompt: number; completion: number; total: number };
    fkCache: Map<string, ForeignKeyInfo[]>;
    startTimeMs: number;
    startTime: string;
    totalTables: number;
    completedCount: { value: number };
  },
): Promise<void> {
  const { llm, discoveryService, connectionId, databaseName, modelName, instructions, osiSpecText, emitProgress } = deps;
  const { datasets, allMetrics, failedTables, tableStatus, tokensUsed, fkCache, startTimeMs, startTime, totalTables, completedCount } = sharedState;

  const dotIdx = tableFQN.indexOf('.');
  const schemaName = tableFQN.substring(0, dotIdx);
  const tableName = tableFQN.substring(dotIdx + 1);

  const tableStartTime = new Date().toISOString();
  tableStatus[tableIndex].startedAt = tableStartTime;

  try {
    // --- Phase: Discover ---
    tableStatus[tableIndex].status = 'discovering';
    emitProgress({
      type: 'progress',
      currentTable: tableIndex + 1,
      totalTables,
      tableName: tableFQN,
      phase: 'discover',
      percentComplete: Math.round((completedCount.value / totalTables) * 65),
    });

    // 1. List columns
    const columnsResult = await discoveryService.listColumns(connectionId, databaseName, schemaName, tableName);
    const columns = columnsResult.data;

    // 2. Get foreign keys from cache
    const schemaFKs = fkCache.get(schemaName) || [];
    const tableFKs = schemaFKs.filter(
      fk => fk.fromTable === tableName || fk.toTable === tableName,
    );

    // 3. Get sample data
    const sampleResult = await discoveryService.getSampleData(connectionId, databaseName, schemaName, tableName, 5);

    // 4. Get column stats for selected columns
    const statsColumns = selectColumnsForStats(columns, tableFKs, tableName);
    const columnStats = new Map<string, ColumnStatsResult>();
    for (const colName of statsColumns) {
      try {
        const statsResult = await discoveryService.getColumnStats(connectionId, databaseName, schemaName, tableName, colName);
        columnStats.set(colName, statsResult.data);
      } catch (err) {
        logger.warn(`Failed to get stats for ${tableFQN}.${colName}: ${err}`);
      }
    }

    // 5. Collect sample data for eligible text columns
    const eligibleCols = columns
      .filter(c => isEligibleForSampleData(c))
      .slice(0, 30);

    const recencyColumn = detectRecencyColumn(columns);

    const sampleDataMap = new Map<string, string[]>();
    for (const col of eligibleCols) {
      // Reuse from columnStats if already fetched
      if (columnStats.has(col.name)) {
        sampleDataMap.set(
          col.name.toLowerCase(),
          columnStats.get(col.name)!.sampleValues.map(v => String(v)),
        );
        continue;
      }
      try {
        const values = await discoveryService.getDistinctColumnValues(
          connectionId, databaseName, schemaName, tableName,
          col.name, recencyColumn, 5,
        );
        sampleDataMap.set(col.name.toLowerCase(), values);
      } catch (err) {
        logger.warn(`Failed to get sample values for ${tableFQN}.${col.name}: ${err}`);
        sampleDataMap.set(col.name.toLowerCase(), []);
      }
    }

    // --- Phase: Generate ---
    tableStatus[tableIndex].status = 'generating';
    emitProgress({
      type: 'progress',
      currentTable: tableIndex + 1,
      totalTables,
      tableName: tableFQN,
      phase: 'generate',
      percentComplete: Math.round((completedCount.value / totalTables) * 65),
    });

    // Build prompt and call LLM
    const prompt = buildGenerateDatasetPrompt({
      tableName: tableFQN,
      databaseName,
      columns,
      sampleData: sampleResult.data,
      foreignKeys: tableFKs,
      columnStats,
      modelName,
      instructions: instructions || undefined,
      osiSpecText: osiSpecText || undefined,
    });

    const response = await llm.invoke([new HumanMessage(prompt)]);

    // Track tokens (synchronous accumulation is safe in Node.js)
    const tableTokens = extractTokenUsage(response);
    tokensUsed.prompt += tableTokens.prompt;
    tokensUsed.completion += tableTokens.completion;
    tokensUsed.total += tableTokens.total;
    tableStatus[tableIndex].tokensUsed = tableTokens.total;

    // Emit token update
    emitProgress({ type: 'token_update', tokensUsed: { ...tokensUsed } });

    // Parse JSON response
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
    injectFieldDataTypes(dataset, columns, sampleDataMap);

    // Synchronously push to shared arrays (safe in Node.js)
    datasets.push(dataset);
    allMetrics.push(metrics);

    // Mark table complete
    tableStatus[tableIndex].status = 'completed';
    tableStatus[tableIndex].completedAt = new Date().toISOString();

    // Increment completed count
    completedCount.value++;

    // Persist progress with partial model (fire-and-forget)
    await deps.semanticModelsService.updateRunProgress(deps.runId, {
      currentStep: 'discover_and_generate',
      currentStepLabel: 'Discovering & Generating Datasets',
      completedTables: completedCount.value,
      totalTables,
      failedTables: [...failedTables],
      percentComplete: Math.round((completedCount.value / totalTables) * 65),
      tokensUsed: { ...tokensUsed },
      startedAt: startTime,
      elapsedMs: Date.now() - startTimeMs,
      partialModel: { datasets: [...datasets], foreignKeys: Array.from(fkCache.values()).flat(), tableMetrics: [...allMetrics] },
      tableStatus: [...tableStatus],
      steps: [],
    }).catch(() => {}); // fire-and-forget

    emitProgress({
      type: 'table_complete',
      tableName: tableFQN,
      tableIndex: tableIndex + 1,
      totalTables,
      datasetName: dataset.name,
    });

    logger.log(`Completed table ${tableIndex + 1}/${totalTables}: ${tableFQN} (${tableTokens.total} tokens)`);

  } catch (error: any) {
    // Table failed — log and continue
    failedTables.push(tableFQN);
    tableStatus[tableIndex].status = 'failed';
    tableStatus[tableIndex].error = error.message || 'Unknown error';
    tableStatus[tableIndex].completedAt = new Date().toISOString();

    // Increment completed count (failed still counts as processed)
    completedCount.value++;

    // Persist progress (fire-and-forget)
    await deps.semanticModelsService.updateRunProgress(deps.runId, {
      currentStep: 'discover_and_generate',
      currentStepLabel: 'Discovering & Generating Datasets',
      completedTables: completedCount.value,
      totalTables,
      failedTables: [...failedTables],
      percentComplete: Math.round((completedCount.value / totalTables) * 65),
      tokensUsed: { ...tokensUsed },
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

    logger.warn(`Failed table ${tableIndex + 1}/${totalTables}: ${tableFQN}: ${error.message}`);
  }
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
    const tokensUsed = { prompt: 0, completion: 0, total: 0 };
    const startTimeMs = Date.now();
    const startTime = new Date().toISOString();
    const completedCount = { value: 0 };

    // Initialize table status
    const tableStatus: TableStatusEntry[] = state.selectedTables.map(t => ({
      tableName: t,
      status: 'pending' as const,
    }));

    const modelName = state.modelName || `Model for ${databaseName}`;

    // Pre-fetch foreign keys for all schemas
    logger.log(`Pre-fetching foreign keys for ${state.selectedTables.length} tables...`);
    const fkCache = await prefetchForeignKeys(discoveryService, connectionId, databaseName, state.selectedTables);
    logger.log(`Foreign keys fetched for ${fkCache.size} schemas`);

    // Get concurrency limit from environment (default: 5, clamp to 1-20)
    const rawConcurrency = parseInt(process.env.SEMANTIC_MODEL_CONCURRENCY || String(DEFAULT_TABLE_CONCURRENCY), 10);
    const concurrency = Math.max(1, Math.min(20, isNaN(rawConcurrency) ? DEFAULT_TABLE_CONCURRENCY : rawConcurrency));
    logger.log(`Processing ${state.selectedTables.length} tables with concurrency=${concurrency}`);

    // Create concurrency limiter
    const limit = createConcurrencyLimiter(concurrency);

    // Shared dependencies for all workers
    const deps = {
      llm,
      discoveryService,
      semanticModelsService,
      connectionId,
      databaseName,
      runId,
      modelName,
      instructions: state.instructions ?? undefined,
      osiSpecText: state.osiSpecText,
      emitProgress,
    };

    // Shared state (mutable, but safe due to Node.js single-threaded model)
    const sharedState = {
      datasets,
      allMetrics,
      failedTables,
      tableStatus,
      tokensUsed,
      fkCache,
      startTimeMs,
      startTime,
      totalTables: state.selectedTables.length,
      completedCount,
    };

    // Process all tables in parallel
    const results = await Promise.allSettled(
      state.selectedTables.map((tableFQN, i) =>
        limit(() => processOneTable(tableFQN, i, deps, sharedState))
      )
    );

    // Log any unexpected rejections (shouldn't happen since processOneTable handles errors internally)
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        logger.error(`Unexpected rejection for table ${state.selectedTables[i]}: ${result.reason}`);
      }
    });

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
