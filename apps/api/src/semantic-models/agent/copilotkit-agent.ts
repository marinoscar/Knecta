/**
 * Custom CopilotKit Agent Implementation
 *
 * Bridges the AG-UI protocol with our local LangGraph agent.
 * Uses dynamic imports for ESM compatibility with CJS NestJS app.
 */

/**
 * Factory function to create a SemanticModelAgent instance.
 *
 * This pattern is required because we cannot extend dynamically-imported
 * ESM classes at the module level in a CJS environment.
 *
 * @returns Promise<AbstractAgent> A configured agent instance
 */
export async function createSemanticModelAgent(): Promise<any> {
  // @ts-ignore - ESM module imports
  const { AbstractAgent, EventType } = await import('@ag-ui/client');
  // @ts-ignore - ESM module imports
  const { Observable } = await import('rxjs');

  /**
   * SemanticModelAgent
   *
   * Implements the AG-UI protocol for streaming agent responses.
   * Currently returns a placeholder message while the feature is in development.
   *
   * Event flow:
   * 1. RUN_STARTED - Signals run initiation
   * 2. TEXT_MESSAGE_START - Begin assistant message
   * 3. TEXT_MESSAGE_CONTENT - Streaming text chunks
   * 4. TEXT_MESSAGE_END - Complete assistant message
   * 5. RUN_FINISHED - Signal run completion
   */
  class SemanticModelAgent extends AbstractAgent {
    constructor() {
      super({
        agentId: 'default',
        description: 'Analyzes database schemas and generates semantic models',
      });
    }

    /**
     * Execute the agent run
     *
     * @param input RunAgentInput - Contains runId, threadId, messages, state
     * @returns Observable<BaseEvent> - Stream of AG-UI protocol events
     */
    run(input: any): any {
      return new Observable((subscriber) => {
        try {
          // Generate IDs for this run
          const runId = input.runId || `run-${Date.now()}`;
          const threadId = this.threadId || input.threadId || `thread-${Date.now()}`;
          const messageId = `msg-${Date.now()}`;

          // 1. Signal run start
          subscriber.next({
            type: EventType.RUN_STARTED,
            threadId,
            runId,
          });

          // 2. Start assistant message
          subscriber.next({
            type: EventType.TEXT_MESSAGE_START,
            messageId,
            role: 'assistant',
          });

          // 3. Stream message content
          const message =
            'I am the Semantic Model Agent. I can analyze your database schema and generate a semantic model. ' +
            'This feature is under active development.';

          subscriber.next({
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId,
            delta: message,
          });

          // 4. End assistant message
          subscriber.next({
            type: EventType.TEXT_MESSAGE_END,
            messageId,
          });

          // 5. Signal run completion
          subscriber.next({
            type: EventType.RUN_FINISHED,
            threadId,
            runId,
          });

          subscriber.complete();
        } catch (error) {
          subscriber.error(error);
        }
      });
    }
  }

  return new SemanticModelAgent();
}
