import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { PrismaService } from '../../prisma/prisma.service';
import { LlmService } from '../../llm/llm.service';
import { EmbeddingService } from '../../embedding/embedding.service';
import { NeoVectorService } from '../../neo-graph/neo-vector.service';
import { NeoOntologyService } from '../../ontologies/neo-ontology.service';
import { DiscoveryService } from '../../discovery/discovery.service';
import { SandboxService } from '../../sandbox/sandbox.service';
import { DataAgentService } from '../data-agent.service';
import {
  createQueryDatabaseTool,
  createGetDatasetDetailsTool,
  createGetSampleDataTool,
  createRunPythonTool,
} from './tools';
import { buildDataAgentSystemPrompt } from './prompts';

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
   * Execute the agent for a given message.
   * Streams events via the onEvent callback.
   */
  async executeAgent(
    chatId: string,
    messageId: string,
    userQuestion: string,
    userId: string,
    onEvent: (event: AgentStreamEvent) => void,
  ): Promise<void> {
    // Step 1: Load the chat and related data
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

    onEvent({ type: 'message_start' });

    // Step 2: Generate embedding for user question
    this.logger.log('Generating embedding for user question');
    const provider = this.embeddingService.getProvider();
    const queryEmbedding = await provider.generateEmbedding(userQuestion);

    // Step 3: Vector search for relevant datasets
    this.logger.log('Searching for relevant datasets');
    const relevantDatasets = await this.neoVectorService.searchSimilar(
      'dataset_embedding',
      ontology.id,
      queryEmbedding,
      5,
    );

    if (relevantDatasets.length === 0) {
      // No relevant datasets found
      const errorMsg = 'I could not find any relevant datasets in the knowledge graph for your question. Please try rephrasing your question or check that the ontology has the data you need.';
      await this.dataAgentService.updateAssistantMessage(
        messageId,
        errorMsg,
        { error: 'no_relevant_datasets' },
        'complete',
      );
      onEvent({ type: 'text', content: errorMsg });
      onEvent({ type: 'message_complete', content: errorMsg, metadata: { error: 'no_relevant_datasets' } });
      return;
    }

    this.logger.log(`Found ${relevantDatasets.length} relevant datasets`);

    // Step 4: Load conversation history (last 10 messages)
    const previousMessages = await this.prisma.dataChatMessage.findMany({
      where: { chatId, status: 'complete' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    previousMessages.reverse(); // chronological order

    const conversationContext = previousMessages
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.substring(0, 500)}`)
      .join('\n\n');

    // Step 5: Build system prompt
    const systemPrompt = buildDataAgentSystemPrompt(
      relevantDatasets,
      databaseType,
      conversationContext,
    );

    // Step 6: Create tools
    const tools = [
      createQueryDatabaseTool(this.discoveryService, connectionId, userId),
      createGetDatasetDetailsTool(this.neoOntologyService, ontology.id),
      createGetSampleDataTool(this.discoveryService, this.neoOntologyService, connectionId, userId, ontology.id),
      createRunPythonTool(this.sandboxService),
    ];

    // Step 7: Create ReAct agent (DO NOT set streaming: true on LLM)
    const llm = this.llmService.getChatModel();
    const agent = createReactAgent({
      llm,
      tools,
      messageModifier: systemPrompt,
    });

    // Step 8: Run agent with streaming
    const toolCalls: Array<{ name: string; args: any; result?: string }> = [];
    let tokensUsed = { prompt: 0, completion: 0, total: 0 };
    let finalContent = '';

    try {
      const stream = await agent.stream(
        { messages: [new HumanMessage(userQuestion)] },
        { streamMode: 'updates' },
      );

      for await (const update of stream) {
        const nodeName = Object.keys(update)[0];
        const nodeOutput = update[nodeName];

        if (nodeName === 'agent' && nodeOutput?.messages) {
          // Agent produced messages (AI responses)
          for (const msg of nodeOutput.messages) {
            if (msg._getType() === 'ai') {
              const aiMsg = msg as AIMessage;

              // Check for tool calls
              if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
                for (const tc of aiMsg.tool_calls) {
                  onEvent({ type: 'tool_call', name: tc.name, args: tc.args });
                  toolCalls.push({ name: tc.name, args: tc.args });
                }
              }

              // Check for text content (final response)
              if (typeof aiMsg.content === 'string' && aiMsg.content.trim()) {
                finalContent = aiMsg.content;
                onEvent({ type: 'text', content: aiMsg.content });
              }

              // Extract token usage
              if (aiMsg.usage_metadata) {
                tokensUsed.prompt += aiMsg.usage_metadata.input_tokens || 0;
                tokensUsed.completion += aiMsg.usage_metadata.output_tokens || 0;
                tokensUsed.total += (aiMsg.usage_metadata.input_tokens || 0) + (aiMsg.usage_metadata.output_tokens || 0);
              }
            }
          }
        } else if (nodeName === 'tools' && nodeOutput?.messages) {
          // Tool results
          for (const msg of nodeOutput.messages) {
            if (msg._getType() === 'tool') {
              const toolName = toolCalls.length > 0 ? toolCalls[toolCalls.length - 1]?.name : 'unknown';
              const resultStr = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
              onEvent({ type: 'tool_result', name: toolName, result: resultStr.substring(0, 2000) });

              // Update the matching tool call with result
              const lastCall = toolCalls[toolCalls.length - 1];
              if (lastCall && !lastCall.result) {
                lastCall.result = resultStr.substring(0, 2000);
              }
            }
          }
        }
      }

      // Step 9: Persist final response
      const metadata = {
        toolCalls: toolCalls.map((tc) => ({ name: tc.name, args: tc.args })),
        tokensUsed,
        datasetsUsed: relevantDatasets.map((ds) => ds.name),
      };

      await this.dataAgentService.updateAssistantMessage(
        messageId,
        finalContent || 'I was unable to generate a response. Please try again.',
        metadata,
        'complete',
      );

      onEvent({
        type: 'token_update',
        tokensUsed,
      });

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
