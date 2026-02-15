import { BaseMessage } from '@langchain/core/messages';
import { extractTokenUsage } from './token-tracker';
import { EmitFn } from '../graph';
import { LlmTraceInput, CollectedTrace } from '../types';

export class DataAgentTracer {
  private callCounter = 0;
  private traces: CollectedTrace[] = [];

  constructor(
    private readonly messageId: string,
    private readonly provider: string,
    private readonly model: string,
    private readonly temperature: number | undefined,
    private readonly emit: EmitFn,
  ) {}

  async trace<T>(
    input: LlmTraceInput,
    messages: BaseMessage[],
    invokeFn: () => Promise<T>,
    extractResponse?: (result: T) => { content: string; toolCalls?: any[]; raw?: any },
  ): Promise<{ response: T; trace: CollectedTrace }> {
    const callIndex = this.callCounter++;
    const startedAt = Date.now();

    // Serialize prompt messages
    const promptMessages = messages.map((msg) => ({
      role: msg._getType(),
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
    }));

    // Emit SSE event: llm_call_start (summary only, not full prompts)
    this.emit({
      type: 'llm_call_start',
      phase: input.phase,
      callIndex,
      stepId: input.stepId,
      purpose: input.purpose,
      provider: this.provider,
      model: this.model,
      structuredOutput: input.structuredOutput,
      promptSummary: {
        messageCount: promptMessages.length,
        totalChars: promptMessages.reduce((sum, m) => sum + m.content.length, 0),
      },
    });

    let trace: CollectedTrace;

    try {
      const response = await invokeFn();
      const completedAt = Date.now();

      // Extract response details
      const extracted = extractResponse
        ? extractResponse(response)
        : this.defaultExtract(response);

      const tokenUsage = extracted.raw
        ? extractTokenUsage(extracted.raw)
        : extractTokenUsage(response);

      trace = {
        phase: input.phase,
        callIndex,
        stepId: input.stepId,
        purpose: input.purpose,
        provider: this.provider,
        model: this.model,
        temperature: this.temperature,
        structuredOutput: input.structuredOutput,
        promptMessages,
        responseContent: extracted.content,
        toolCalls: extracted.toolCalls?.map((tc: any) => ({
          name: tc.name,
          args: tc.args,
        })),
        promptTokens: tokenUsage.prompt,
        completionTokens: tokenUsage.completion,
        totalTokens: tokenUsage.total,
        startedAt,
        completedAt,
        durationMs: completedAt - startedAt,
      };

      // Emit SSE event: llm_call_end
      this.emit({
        type: 'llm_call_end',
        phase: input.phase,
        callIndex,
        stepId: input.stepId,
        purpose: input.purpose,
        durationMs: trace.durationMs,
        promptTokens: trace.promptTokens,
        completionTokens: trace.completionTokens,
        totalTokens: trace.totalTokens,
        responsePreview: trace.responseContent.substring(0, 200),
        toolCallCount: trace.toolCalls?.length ?? 0,
      });

      this.traces.push(trace);
      return { response, trace };
    } catch (error) {
      const completedAt = Date.now();
      const errorMsg = error instanceof Error ? error.message : String(error);

      trace = {
        phase: input.phase,
        callIndex,
        stepId: input.stepId,
        purpose: input.purpose,
        provider: this.provider,
        model: this.model,
        temperature: this.temperature,
        structuredOutput: input.structuredOutput,
        promptMessages,
        responseContent: '',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        startedAt,
        completedAt,
        durationMs: completedAt - startedAt,
        error: errorMsg,
      };

      this.emit({
        type: 'llm_call_end',
        phase: input.phase,
        callIndex,
        stepId: input.stepId,
        purpose: input.purpose,
        durationMs: trace.durationMs,
        error: errorMsg,
      });

      this.traces.push(trace);
      throw error;
    }
  }

  getTraces(): CollectedTrace[] {
    return this.traces;
  }

  private defaultExtract(response: any): { content: string; toolCalls?: any[]; raw?: any } {
    // withStructuredOutput response has {parsed, raw}
    if (response?.parsed !== undefined && response?.raw) {
      return {
        content: typeof response.raw.content === 'string'
          ? response.raw.content
          : JSON.stringify(response.parsed),
        toolCalls: response.raw.tool_calls,
        raw: response.raw,
      };
    }
    // Regular AIMessage
    return {
      content: typeof response?.content === 'string' ? response.content : '',
      toolCalls: response?.tool_calls,
      raw: response,
    };
  }
}
