/**
 * Custom CopilotKit Agent Implementation
 *
 * Bridges the AG-UI protocol with our LangGraph-based semantic model agent.
 * Uses dynamic imports for ESM compatibility with CJS NestJS app.
 */

import { AgentService } from './agent.service';
import { SemanticModelsService } from '../semantic-models.service';

/**
 * Agent context containing services and run metadata
 */
export interface AgentContext {
  agentService: AgentService;
  semanticModelsService: SemanticModelsService;
  runId: string;
  userId: string;
  connectionId: string;
  databaseName: string;
  selectedSchemas: string[];
  selectedTables: string[];
}

/**
 * Factory function to create a SemanticModelAgent instance.
 *
 * This pattern is required because we cannot extend dynamically-imported
 * ESM classes at the module level in a CJS environment.
 *
 * @param context AgentContext with services and run configuration
 * @returns Promise<AbstractAgent> A configured agent instance
 */
export async function createSemanticModelAgent(context: AgentContext): Promise<any> {
  // @ts-ignore - ESM module imports
  const { AbstractAgent, EventType } = await import('@ag-ui/client');
  // @ts-ignore - ESM module imports
  const { Observable } = await import('rxjs');
  // @ts-ignore - ESM module imports
  const { AIMessage, ToolMessage } = await import('@langchain/core/messages');

  /**
   * SemanticModelAgent
   *
   * Implements the AG-UI protocol for streaming agent responses.
   * Executes the LangGraph agent and maps node outputs to AG-UI events.
   *
   * Event flow:
   * 1. RUN_STARTED - Signals run initiation
   * 2. STEP_STARTED - Each graph node begins
   * 3. TEXT_MESSAGE_START/CONTENT/END - Assistant text messages
   * 4. TOOL_CALL_START/ARGS/END - Tool invocations
   * 5. TOOL_CALL_RESULT - Tool execution results
   * 6. STEP_FINISHED - Each graph node completes
   * 7. RUN_FINISHED - Signal run completion (or RUN_ERROR on failure)
   */
  class SemanticModelAgent extends AbstractAgent {
    private context: AgentContext;

    constructor(ctx: AgentContext) {
      super({
        agentId: 'default',
        description: 'Analyzes database schemas and generates semantic models using AI',
      });
      this.context = ctx;
    }

    /**
     * Override clone() to preserve the agent context.
     * CopilotKit runtime calls clone() before running agents, and the default
     * AbstractAgent.clone() does not copy custom properties.
     */
    clone(): any {
      return new SemanticModelAgent(this.context);
    }

    /**
     * Execute the agent run
     *
     * @param input RunAgentInput - Contains runId, threadId, messages, state
     * @returns Observable<BaseEvent> - Stream of AG-UI protocol events
     */
    run(input: any): any {
      return new Observable((subscriber) => {
        this.executeAgent(subscriber, input, EventType, AIMessage, ToolMessage).catch(
          (error) => {
            // Emit error event instead of calling subscriber.error()
            // This keeps the Observable alive for proper cleanup
            subscriber.next({
              type: EventType.RUN_ERROR,
              message: error.message || 'Agent execution failed',
            });
            subscriber.complete();
          },
        );
      });
    }

    /**
     * Core agent execution logic
     */
    private async executeAgent(
      subscriber: any,
      input: any,
      EventType: any,
      AIMessage: any,
      ToolMessage: any,
    ) {
      const runId = this.context.runId;
      const threadId = input.threadId || `thread-${Date.now()}`;

      try {
        // 1. Emit RUN_STARTED
        subscriber.next({
          type: EventType.RUN_STARTED,
          threadId,
          runId,
        });

        // 2. Update run status to 'executing'
        await this.context.semanticModelsService.updateRunStatus(
          runId,
          this.context.userId,
          'executing',
        );

        // 3. Create agent graph with skipApproval: true
        const { graph, initialState } = await this.context.agentService.createAgentGraph(
          this.context.connectionId,
          this.context.userId,
          this.context.databaseName,
          this.context.selectedSchemas,
          this.context.selectedTables,
          runId,
          undefined, // llmProvider (use default)
          { skipApproval: true },
        );

        // 4. Stream graph execution
        const stream = (await graph.stream(initialState, {
          streamMode: 'updates' as any,
        })) as any;

        // 5. Process each node's output
        for await (const chunk of stream) {
          // chunk format: { nodeName: nodeOutput }
          const nodeName = Object.keys(chunk)[0];
          const nodeOutput = chunk[nodeName];

          // Emit STEP_STARTED
          subscriber.next({
            type: EventType.STEP_STARTED,
            stepName: nodeName,
          });

          // Process messages in the node output
          if (nodeOutput?.messages && Array.isArray(nodeOutput.messages)) {
            for (const message of nodeOutput.messages) {
              await this.processMessage(message, subscriber, EventType, AIMessage, ToolMessage);
            }
          }

          // Emit STEP_FINISHED
          subscriber.next({
            type: EventType.STEP_FINISHED,
            stepName: nodeName,
          });
        }

        // 6. Emit RUN_FINISHED on success
        subscriber.next({
          type: EventType.RUN_FINISHED,
          threadId,
          runId,
        });

        subscriber.complete();
      } catch (error: any) {
        // 7. Handle errors
        await this.context.semanticModelsService.updateRunStatus(
          runId,
          this.context.userId,
          'failed',
          error.message || 'Agent execution failed',
        );

        subscriber.next({
          type: EventType.RUN_ERROR,
          message: error.message || 'Agent execution failed',
        });

        subscriber.complete();
      }
    }

    /**
     * Process a single LangChain message and emit appropriate AG-UI events
     */
    private async processMessage(
      message: any,
      subscriber: any,
      EventType: any,
      AIMessage: any,
      ToolMessage: any,
    ) {
      const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Case 1: AIMessage with tool_calls
      if (message instanceof AIMessage && message.tool_calls && message.tool_calls.length > 0) {
        for (const toolCall of message.tool_calls) {
          // Emit TOOL_CALL_START
          subscriber.next({
            type: EventType.TOOL_CALL_START,
            toolCallId: toolCall.id,
            toolCallName: toolCall.name,
          });

          // Emit TOOL_CALL_ARGS (must be JSON string)
          subscriber.next({
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: toolCall.id,
            delta: JSON.stringify(toolCall.args),
          });

          // Emit TOOL_CALL_END
          subscriber.next({
            type: EventType.TOOL_CALL_END,
            toolCallId: toolCall.id,
          });
        }
      }

      // Case 2: AIMessage with text content
      if (
        message instanceof AIMessage &&
        typeof message.content === 'string' &&
        message.content.trim().length > 0
      ) {
        // Emit TEXT_MESSAGE_START
        subscriber.next({
          type: EventType.TEXT_MESSAGE_START,
          messageId,
          role: 'assistant',
        });

        // Emit TEXT_MESSAGE_CONTENT
        subscriber.next({
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId,
          delta: message.content,
        });

        // Emit TEXT_MESSAGE_END
        subscriber.next({
          type: EventType.TEXT_MESSAGE_END,
          messageId,
        });
      }

      // Case 3: ToolMessage (tool execution result)
      if (message instanceof ToolMessage) {
        subscriber.next({
          type: EventType.TOOL_CALL_RESULT,
          toolCallId: message.tool_call_id,
          result:
            typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
        });
      }
    }
  }

  return new SemanticModelAgent(context);
}
