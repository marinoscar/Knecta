import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '../../discovery/discovery.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LlmService } from '../../llm/llm.service';
import { SemanticModelsService } from '../semantic-models.service';
import { buildAgentGraph } from './graph';
import { OsiSpecService } from './osi/osi-spec.service';

@Injectable()
export class AgentService {
  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly prisma: PrismaService,
    private readonly llmService: LlmService,
    private readonly osiSpecService: OsiSpecService,
  ) {}

  async createAgentGraph(
    connectionId: string,
    userId: string,
    databaseName: string,
    selectedSchemas: string[],
    selectedTables: string[],
    runId: string,
    semanticModelsService: SemanticModelsService,
    emitProgress: (event: object) => void,
    llmProvider?: string,
    modelName?: string,
    instructions?: string,
  ) {
    const llm = this.llmService.getChatModel(llmProvider);

    // Fetch OSI spec text before building graph
    const osiSpecText = await this.osiSpecService.getSpecText();

    const graph = buildAgentGraph(
      llm,
      this.discoveryService,
      this.prisma,
      semanticModelsService,
      connectionId,
      userId,
      databaseName,
      selectedSchemas,
      selectedTables,
      runId,
      emitProgress,
    );

    const initialState = {
      connectionId,
      userId,
      databaseName,
      selectedSchemas,
      selectedTables,
      runId,
      modelName: modelName || null,
      instructions: instructions || null,
      osiSpecText,
      datasets: [],
      foreignKeys: [],
      tableMetrics: [],
      failedTables: [],
      relationships: [],
      modelMetrics: [],
      modelAiContext: null,
      semanticModel: null,
      tokensUsed: { prompt: 0, completion: 0, total: 0 },
      semanticModelId: null,
      error: null,
    };

    return { graph, initialState };
  }
}
