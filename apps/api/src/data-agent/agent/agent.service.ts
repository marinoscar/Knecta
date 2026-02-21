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
import { DataAgentMessageMetadata, DiscoveryResult } from './types';
import { DataAgentTracer } from './utils/data-agent-tracer';

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
                databaseName: true,
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
    const databaseName = semanticModel.databaseName;
    const databaseType = semanticModel.connection.dbType;
    if (!connectionId) throw new Error('No connection associated with this semantic model');

    const startedAt = Date.now();
    onEvent({ type: 'message_start', startedAt });
    onEvent({ type: 'discovery_start' });

    // ── Step 2: Generate embedding for user question ──
    this.logger.log('Generating embedding for user question');
    const embeddingStart = Date.now();
    const embeddingProvider = this.embeddingService.getProvider();
    const queryEmbedding = await embeddingProvider.generateEmbedding(userQuestion);
    const embeddingDurationMs = Date.now() - embeddingStart;

    // ── Step 3: Vector search for relevant datasets ──
    this.logger.log('Searching for relevant datasets');
    const vectorSearchStart = Date.now();
    const relevantDatasets = await this.neoVectorService.searchSimilar(
      'dataset_embedding',
      ontology.id,
      queryEmbedding,
      10,
    );
    const vectorSearchDurationMs = Date.now() - vectorSearchStart;

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
    const yamlFetchStart = Date.now();
    const relevantDatasetDetails = datasetNames.length > 0
      ? await this.neoOntologyService.getDatasetsByNames(ontology.id, datasetNames)
      : [];
    const yamlFetchDurationMs = Date.now() - yamlFetchStart;

    // ── Step 4b: Load user preferences for this ontology ──
    const effectivePreferences = await this.dataAgentService.getEffectivePreferences(
      userId,
      ontology.id,
    );
    this.logger.log(`Loaded ${effectivePreferences.length} user preferences`);

    const discoveryResult: DiscoveryResult = {
      embeddingDurationMs,
      vectorSearchDurationMs,
      yamlFetchDurationMs,
      matchedDatasets: relevantDatasets.map((ds) => ({ name: ds.name, score: ds.score })),
      datasetsWithYaml: relevantDatasetDetails.length,
      preferencesLoaded: effectivePreferences.length,
    };
    onEvent({ type: 'discovery_complete', ...discoveryResult });

    // ── Step 4: Load conversation history (last 10 messages) ──
    const previousMessages = await this.prisma.dataChatMessage.findMany({
      where: { chatId, status: { in: ['complete', 'clarification_needed'] } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    previousMessages.reverse();

    // Count clarification rounds in this conversation
    const clarificationRound = previousMessages.filter(
      (m) => m.status === 'clarification_needed'
    ).length;

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

    // Create a version without reasoning for structured output phases
    // (Anthropic thinking mode is incompatible with withStructuredOutput/forced tool calling)
    const structuredLlm = this.llmService.getChatModel(provider, {
      temperature: providerConfig?.temperature,
      model: providerConfig?.model,
      // Explicitly no reasoningLevel
    });

    // Create tracer for LLM interaction diagnostics
    const providerName = provider || 'default';
    const modelName = providerConfig?.model || '';
    const tracer = new DataAgentTracer(messageId, providerName, modelName, providerConfig?.temperature, onEvent);

    const graph = buildDataAgentGraph({
      llm,
      structuredLlm,
      neoOntologyService: this.neoOntologyService,
      discoveryService: this.discoveryService,
      sandboxService: this.sandboxService,
      ontologyId: ontology.id,
      connectionId,
      databaseName,
      databaseType,
      emit: onEvent,
      tracer,
    });

    try {
      const finalState = await graph.invoke({
        userQuestion,
        chatId,
        messageId,
        userId,
        ontologyId: ontology.id,
        connectionId,
        databaseName,
        databaseType,
        conversationContext,
        relevantDatasets: datasetNames,
        relevantDatasetDetails,
        userPreferences: effectivePreferences,
        clarificationRound,
      });

      // ── Check if clarification was requested (graph terminated early at planner) ──
      if (finalState.plan?.shouldClarify && finalState.plan.clarificationQuestions?.length > 0) {
        const questions = finalState.plan.clarificationQuestions;

        // Build human-readable content
        const clarificationContent =
          'I have a few questions before I can answer accurately:\n\n' +
          questions.map((q: { question: string; assumption: string }, i: number) => `${i + 1}. **${q.question}**\n   *If not specified, I\u2019ll assume: ${q.assumption}*`).join('\n\n');

        // Persist traces
        const traces = tracer.getTraces();
        if (traces.length > 0) {
          this.dataAgentService.persistTraces(messageId, traces)
            .catch((err) => this.logger.error(`Failed to persist LLM traces: ${err.message}`));
        }

        const metadata: DataAgentMessageMetadata = {
          toolCalls: finalState.toolCalls || [],
          tokensUsed: finalState.tokensUsed || { prompt: 0, completion: 0, total: 0 },
          datasetsUsed: datasetNames,
          plan: finalState.plan,
          clarificationQuestions: questions,
          revisionsUsed: 0,
          durationMs: Date.now() - startedAt,
          startedAt,
          llmCallCount: traces.length,
          discovery: discoveryResult,
        };

        await this.dataAgentService.updateAssistantMessage(
          messageId,
          clarificationContent,
          metadata,
          'clarification_needed',
        );

        onEvent({ type: 'clarification_requested', questions });
        onEvent({
          type: 'message_complete',
          content: clarificationContent,
          metadata,
          status: 'clarification_needed',
        });

        return;  // Early exit — don't process explainer output
      }

      // ── Step 6: Persist final response ──
      const explainerOutput = finalState.explainerOutput;
      const finalContent = explainerOutput?.narrative || 'I was unable to generate a response. Please try again.';

      // Persist LLM traces (fire-and-forget, don't block SSE response)
      const traces = tracer.getTraces();
      if (traces.length > 0) {
        this.dataAgentService.persistTraces(messageId, traces)
          .catch((err) => this.logger.error(`Failed to persist LLM traces: ${err.message}`));
      }

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
        cannotAnswer: finalState.cannotAnswer || undefined,
        revisionsUsed: finalState.revisionCount || 0,
        durationMs: Date.now() - startedAt,
        startedAt,
        llmCallCount: traces.length,
        discovery: discoveryResult,
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

      // ── Step 7: Auto-capture preference from clarification follow-ups ──
      // If the previous assistant message was a clarification, the user implicitly confirmed
      // the stated assumptions by proceeding. Capture them as preferences based on the mode.
      const prevMessages = await this.prisma.dataChatMessage.findMany({
        where: { chatId, status: 'clarification_needed' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });

      if (prevMessages.length > 0) {
        const prevClarification = prevMessages[0];
        const prevMeta = prevClarification.metadata as any;

        if (prevMeta?.clarificationQuestions?.length > 0) {
          const autoCapturePref = effectivePreferences.find((p) => p.key === 'auto_capture_mode');
          const autoCaptureMode = autoCapturePref?.value || 'auto';

          if (autoCaptureMode === 'auto') {
            for (const q of prevMeta.clarificationQuestions) {
              try {
                await this.dataAgentService.createPreference(userId, {
                  ontologyId: ontology.id,
                  key: q.question,
                  value: q.assumption,
                  source: 'auto_captured',
                });
              } catch (err) {
                this.logger.warn(`Failed to auto-capture preference: ${(err as Error).message}`);
              }
            }
            onEvent({
              type: 'preference_auto_saved',
              preferences: prevMeta.clarificationQuestions.map((q: any) => ({
                key: q.question,
                value: q.assumption,
              })),
            });
          } else if (autoCaptureMode === 'ask') {
            onEvent({
              type: 'preference_suggested',
              suggestions: prevMeta.clarificationQuestions.map((q: any) => ({
                key: q.question,
                value: q.assumption,
                question: q.question,
              })),
            });
          }
          // 'off' → do nothing
        }
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Agent execution failed';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Agent execution failed: ${errorMessage}`, errorStack);

      // Persist any traces collected before the error
      const errorTraces = tracer.getTraces();
      if (errorTraces.length > 0) {
        this.dataAgentService.persistTraces(messageId, errorTraces)
          .catch((err) => this.logger.error(`Failed to persist LLM traces: ${err.message}`));
      }

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
