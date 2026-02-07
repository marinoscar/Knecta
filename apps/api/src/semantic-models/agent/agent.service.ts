import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '../../discovery/discovery.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LlmService } from '../../llm/llm.service';
import { buildAgentGraph } from './graph';
import { buildSystemPrompt } from './prompts/system-prompt';
import { SystemMessage } from '@langchain/core/messages';

@Injectable()
export class AgentService {
  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly prisma: PrismaService,
    private readonly llmService: LlmService,
  ) {}

  async createAgentGraph(
    connectionId: string,
    userId: string,
    databaseName: string,
    selectedSchemas: string[],
    selectedTables: string[],
    runId: string,
    llmProvider?: string,
  ) {
    const llm = this.llmService.getChatModel(llmProvider);

    const graph = buildAgentGraph(
      llm,
      this.discoveryService,
      this.prisma,
      connectionId,
      userId,
      databaseName,
      selectedSchemas,
      selectedTables,
    );

    const systemPrompt = buildSystemPrompt({
      databaseName,
      selectedSchemas,
      selectedTables,
    });

    // Initial state
    const initialState = {
      messages: [new SystemMessage(systemPrompt)],
      connectionId,
      userId,
      databaseName,
      selectedSchemas,
      selectedTables,
      runId,
      plan: null,
      planApproved: false,
      semanticModel: null,
      semanticModelId: null,
      error: null,
    };

    return { graph, initialState };
  }
}
