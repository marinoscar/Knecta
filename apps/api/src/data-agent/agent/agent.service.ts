import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LlmService, LlmModelConfig } from '../../llm/llm.service';
import { EmbeddingService } from '../../embedding/embedding.service';
import { NeoVectorService } from '../../neo-graph/neo-vector.service';
import { NeoOntologyService } from '../../ontologies/neo-ontology.service';
import { DiscoveryService } from '../../discovery/discovery.service';
import { SandboxService } from '../../sandbox/sandbox.service';
import { DataAgentService } from '../data-agent.service';
import { buildDataAgentGraph } from './graph';
import { DataAgentMessageMetadata } from './types';

export interface AgentStreamEvent {
  type: string;
  [key: string]: any;
}

@Injectable()
export class DataAgentAgentService {
  private readonly logger = new Logger(DataAgentAgentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LlmService,
    private readonly embeddingService: EmbeddingService,
    private readonly neoVectorService: NeoVectorService,
    private readonly neoOntologyService: NeoOntologyService,
    private readonly discoveryService: DiscoveryService,
    private readonly sandboxService: SandboxService,
    private readonly dataAgentService: DataAgentService,
  ) {}

  /**
   * Execute the multi-phase data agent for a given message.
   * Streams events via the onEvent callback.
   */
  async executeAgent(
    chatId: string,
    messageId: string,
    userQuestion: string,
    userId: string,
    onEvent: (event: AgentStreamEvent) => void,
    provider?: string,
    providerConfig?: LlmModelConfig,
  ): Promise<void> {
    // ── Step 1: Load the chat and related data ──
    const chat = await this.prisma.dataChat.findFirst({
      where: { id: chatId, ownerId: userId },
      include: {
        ontology: {
          include: {
            semanticModel: {
              select: {
                id: true,
                connectionId: true,
                connection: {
                  select: {
                    id: true,
                    dbType: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!chat) throw new NotFoundException('Chat not found');

    const ontology = chat.ontology;
    if (!ontology) throw new NotFoundException('Ontology not found');
    if (ontology.status !== 'ready') throw new Error('Ontology is not ready');

    const semanticModel = ontology.semanticModel;
    if (!semanticModel) throw new NotFoundException('Semantic model not found');

    const connectionId = semanticModel.connectionId;
    const databaseType = semanticModel.connection.dbType;
    if (!connectionId) throw new Error('No connection associated with this semantic model');

    const startedAt = Date.now();
    onEvent({ type: 'message_start', startedAt });

    // ── Step 2: Generate embedding for user question ──
    this.logger.log('Generating embedding for user question');
    const provider = this.embeddingService.getProvider();
    const queryEmbedding = await provider.generateEmbedding(userQuestion);

    // ── Step 3: Vector search for relevant datasets ──
    this.logger.log('Searching for relevant datasets');
    const relevantDatasets = await this.neoVectorService.searchSimilar(
      'dataset_embedding',
      ontology.id,
      queryEmbedding,
      10,
    );

    if (relevantDatasets.length === 0) {
      this.logger.warn('No vector search results, checking if ontology has datasets');
      const allDatasets = await this.neoOntologyService.listDatasets(ontology.id);
      if (allDatasets.length === 0) {
        const errorMsg = 'No datasets found in the ontology. Please check that the ontology has been created correctly.';
        await this.dataAgentService.updateAssistantMessage(
          messageId,
          errorMsg,
          { error: 'no_datasets' },
          'complete',
        );
        onEvent({ type: 'text', content: errorMsg });
        onEvent({ type: 'message_complete', content: errorMsg, metadata: { error: 'no_datasets' } });
        return;
      }
      this.logger.log(`No vector matches but ontology has ${allDatasets.length} datasets, proceeding with discovery tools`);
    } else {
      this.logger.log(`Found ${relevantDatasets.length} relevant datasets`);
    }

    // ── Step 3b: Pre-fetch YAML schemas for vector-matched datasets ──
    const datasetNames = relevantDatasets.map((ds) => ds.name);
    const relevantDatasetDetails = datasetNames.length > 0
      ? await this.neoOntologyService.getDatasetsByNames(ontology.id, datasetNames)
      : [];

    // ── Step 4: Load conversation history (last 10 messages) ──
    const previousMessages = await this.prisma.dataChatMessage.findMany({
      where: { chatId, status: 'complete' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    previousMessages.reverse();

    const conversationContext = previousMessages
      .map((m) => {
        const role = m.role === 'user' ? 'User' : 'Assistant';
        const contentPreview = m.content.substring(0, 500);

        let toolSummary = '';
        if (m.metadata && typeof m.metadata === 'object') {
          const meta = m.metadata as any;
          if (meta.toolCalls && Array.isArray(meta.toolCalls)) {
            const summaries = meta.toolCalls.map((tc: any) => {
              const argsStr = tc.args ? JSON.stringify(tc.args).substring(0, 200) : '';
              const resultStr = tc.result ? tc.result.substring(0, 200) : 'no result';
              return `  - Tool: ${tc.name}(${argsStr}) → ${resultStr}`;
            });
            toolSummary = '\n' + summaries.join('\n');
          }
        }

        return `${role}: ${contentPreview}${toolSummary}`;
      })
      .join('\n\n');

    // ── Step 5: Build and invoke multi-phase graph ──
    const llm = this.llmService.getChatModel(provider, providerConfig);

    const graph = buildDataAgentGraph({
      llm,
      neoOntologyService: this.neoOntologyService,
      discoveryService: this.discoveryService,
      sandboxService: this.sandboxService,
      ontologyId: ontology.id,
      connectionId,
      databaseType,
      emit: onEvent,
    });

    try {
      const finalState = await graph.invoke({
        userQuestion,
        chatId,
        messageId,
        userId,
        ontologyId: ontology.id,
        connectionId,
        databaseType,
        conversationContext,
        relevantDatasets: datasetNames,
        relevantDatasetDetails,
      });

      // ── Step 6: Persist final response ──
      const explainerOutput = finalState.explainerOutput;
      const finalContent = explainerOutput?.narrative || 'I was unable to generate a response. Please try again.';

      const metadata: DataAgentMessageMetadata = {
        toolCalls: finalState.toolCalls || [],
        tokensUsed: finalState.tokensUsed || { prompt: 0, completion: 0, total: 0 },
        datasetsUsed: datasetNames,
        plan: finalState.plan || undefined,
        joinPlan: finalState.joinPlan || undefined,
        stepResults: finalState.stepResults || undefined,
        verificationReport: finalState.verificationReport
          ? { passed: finalState.verificationReport.passed, checks: finalState.verificationReport.checks }
          : undefined,
        dataLineage: explainerOutput?.dataLineage || undefined,
        revisionsUsed: finalState.revisionCount || 0,
        durationMs: Date.now() - startedAt,
        startedAt,
      };

      await this.dataAgentService.updateAssistantMessage(
        messageId,
        finalContent,
        metadata,
        'complete',
      );

      onEvent({
        type: 'message_complete',
        content: finalContent,
        metadata,
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Agent execution failed';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Agent execution failed: ${errorMessage}`, errorStack);

      await this.dataAgentService.updateAssistantMessage(
        messageId,
        '',
        { error: errorMessage },
        'failed',
      );

      onEvent({
        type: 'message_error',
        message: errorMessage,
      });
    }
  }
}
