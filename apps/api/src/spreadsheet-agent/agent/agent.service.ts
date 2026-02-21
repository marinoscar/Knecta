import { Injectable, Inject } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { ObjectsService } from '../../storage/objects/objects.service';
import { STORAGE_PROVIDER, StorageProvider } from '../../storage/providers/storage-provider.interface';
import { SpreadsheetAgentService } from '../spreadsheet-agent.service';
import { buildSpreadsheetAgentGraph } from './graph';

@Injectable()
export class SpreadsheetAgentAgentService {
  constructor(
    private readonly llmService: LlmService,
    private readonly objectsService: ObjectsService,
    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider: StorageProvider,
  ) {}

  async createAgentGraph(
    runId: string,
    userId: string,
    storageObjectIds: string[],
    spreadsheetService: SpreadsheetAgentService,
    emitProgress: (event: object) => void,
    instructions?: string,
    llmProvider?: string,
  ) {
    const llm = this.llmService.getChatModel(llmProvider);

    const graph = buildSpreadsheetAgentGraph(
      llm,
      this.objectsService,
      this.storageProvider,
      spreadsheetService,
      runId,
      emitProgress,
    );

    const initialState = {
      runId,
      userId,
      storageObjectIds,
      instructions: instructions || null,
      sheets: [],
      parseErrors: [],
      tables: [],
      uploadedTables: [],
      s3OutputPrefix: '',
      tokensUsed: { prompt: 0, completion: 0, total: 0 },
      error: null,
    };

    return { graph, initialState };
  }
}
