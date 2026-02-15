import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { DataAgentTracer } from './data-agent-tracer';
import type { LlmTraceInput } from '../types';
import type { EmitFn } from '../graph';

describe('DataAgentTracer', () => {
  let tracer: DataAgentTracer;
  let emitMock: jest.Mock<ReturnType<EmitFn>, Parameters<EmitFn>>;

  const mockMessageId = 'msg-123';
  const mockProvider = 'openai';
  const mockModel = 'gpt-4';
  const mockTemperature = 0.7;

  beforeEach(() => {
    emitMock = jest.fn();
    tracer = new DataAgentTracer(
      mockMessageId,
      mockProvider,
      mockModel,
      mockTemperature,
      emitMock,
    );
  });

  describe('trace', () => {
    it('captures prompt messages, response, and tokens from a successful call', async () => {
      const input: LlmTraceInput = {
        phase: 'planner',
        stepId: 1,
        purpose: 'Generate plan',
        structuredOutput: false,
      };

      const messages = [
        new SystemMessage('System prompt'),
        new HumanMessage('User question'),
      ];

      const mockResponse = {
        content: 'Test response content',
        tool_calls: [],
        response_metadata: {
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
          },
        },
      };

      const invokeFn = jest.fn().mockResolvedValue(mockResponse);

      const { response, trace } = await tracer.trace(input, messages, invokeFn);

      expect(response).toEqual(mockResponse);
      expect(trace).toMatchObject({
        phase: 'planner',
        callIndex: 0,
        stepId: 1,
        purpose: 'Generate plan',
        provider: mockProvider,
        model: mockModel,
        temperature: mockTemperature,
        structuredOutput: false,
        promptMessages: [
          { role: 'system', content: 'System prompt' },
          { role: 'human', content: 'User question' },
        ],
        responseContent: 'Test response content',
        toolCalls: [],
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      });
      expect(trace.durationMs).toBeGreaterThanOrEqual(0);
      expect(trace.startedAt).toBeDefined();
      expect(trace.completedAt).toBeDefined();
    });

    it('auto-increments callIndex across multiple calls', async () => {
      const input: LlmTraceInput = {
        phase: 'planner',
        purpose: 'First call',
        structuredOutput: false,
      };

      const messages = [new HumanMessage('Question 1')];
      const mockResponse = {
        content: 'Response 1',
        response_metadata: { usage: { prompt_tokens: 10, completion_tokens: 5 } },
      };

      const invokeFn = jest.fn().mockResolvedValue(mockResponse);

      const { trace: trace1 } = await tracer.trace(input, messages, invokeFn);
      const { trace: trace2 } = await tracer.trace(input, messages, invokeFn);
      const { trace: trace3 } = await tracer.trace(input, messages, invokeFn);

      expect(trace1.callIndex).toBe(0);
      expect(trace2.callIndex).toBe(1);
      expect(trace3.callIndex).toBe(2);
    });

    it('emits llm_call_start and llm_call_end SSE events', async () => {
      const input: LlmTraceInput = {
        phase: 'navigator',
        stepId: 2,
        purpose: 'Find datasets',
        structuredOutput: true,
      };

      const messages = [new HumanMessage('Find datasets')];
      const mockResponse = {
        content: 'Found datasets',
        response_metadata: { usage: { prompt_tokens: 50, completion_tokens: 25 } },
      };

      const invokeFn = jest.fn().mockResolvedValue(mockResponse);

      await tracer.trace(input, messages, invokeFn);

      expect(emitMock).toHaveBeenCalledTimes(2);

      // Check llm_call_start event
      expect(emitMock).toHaveBeenNthCalledWith(1, {
        type: 'llm_call_start',
        phase: 'navigator',
        callIndex: 0,
        stepId: 2,
        purpose: 'Find datasets',
        provider: mockProvider,
        model: mockModel,
        structuredOutput: true,
        promptSummary: {
          messageCount: 1,
          totalChars: 'Find datasets'.length,
        },
      });

      // Check llm_call_end event
      expect(emitMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
        type: 'llm_call_end',
        phase: 'navigator',
        callIndex: 0,
        stepId: 2,
        purpose: 'Find datasets',
        promptTokens: 50,
        completionTokens: 25,
        totalTokens: 75,
        responsePreview: 'Found datasets',
        toolCallCount: 0,
      }));
    });

    it('captures error traces and re-throws the error', async () => {
      const input: LlmTraceInput = {
        phase: 'executor',
        purpose: 'Execute query',
        structuredOutput: false,
      };

      const messages = [new HumanMessage('Run query')];
      const error = new Error('Database connection failed');
      const invokeFn = jest.fn().mockRejectedValue(error);

      await expect(tracer.trace(input, messages, invokeFn)).rejects.toThrow(
        'Database connection failed',
      );

      const traces = tracer.getTraces();
      expect(traces).toHaveLength(1);
      expect(traces[0]).toMatchObject({
        phase: 'executor',
        callIndex: 0,
        purpose: 'Execute query',
        responseContent: '',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        error: 'Database connection failed',
      });

      // Check error was emitted
      expect(emitMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'llm_call_end',
          error: 'Database connection failed',
        }),
      );
    });

    it('handles structured output responses (parsed + raw)', async () => {
      const input: LlmTraceInput = {
        phase: 'sql_builder',
        purpose: 'Build SQL',
        structuredOutput: true,
      };

      const messages = [new HumanMessage('Build SQL')];

      // Structured output response format
      const mockResponse = {
        parsed: { query: 'SELECT * FROM users', columns: ['id', 'name'] },
        raw: {
          content: 'SQL query generated',
          tool_calls: [],
          response_metadata: {
            usage: { prompt_tokens: 200, completion_tokens: 100 },
          },
        },
      };

      const invokeFn = jest.fn().mockResolvedValue(mockResponse);

      const { trace } = await tracer.trace(input, messages, invokeFn);

      expect(trace.responseContent).toBe('SQL query generated');
      expect(trace.promptTokens).toBe(200);
      expect(trace.completionTokens).toBe(100);
      expect(trace.totalTokens).toBe(300);
    });

    it('llm_call_start event includes prompt summary (not full prompt)', async () => {
      const input: LlmTraceInput = {
        phase: 'planner',
        purpose: 'Plan',
        structuredOutput: false,
      };

      const longMessage = 'A'.repeat(10000);
      const messages = [
        new SystemMessage('System'),
        new HumanMessage(longMessage),
      ];

      const mockResponse = {
        content: 'Response',
        response_metadata: { usage: { prompt_tokens: 100, completion_tokens: 50 } },
      };

      const invokeFn = jest.fn().mockResolvedValue(mockResponse);

      await tracer.trace(input, messages, invokeFn);

      // Check that llm_call_start only includes summary
      expect(emitMock).toHaveBeenNthCalledWith(1, {
        type: 'llm_call_start',
        phase: 'planner',
        callIndex: 0,
        stepId: undefined,
        purpose: 'Plan',
        provider: mockProvider,
        model: mockModel,
        structuredOutput: false,
        promptSummary: {
          messageCount: 2,
          totalChars: 'System'.length + longMessage.length,
        },
      });

      // Full prompt should NOT be in the event
      const startEvent = emitMock.mock.calls[0][0];
      expect(startEvent).not.toHaveProperty('messages');
      expect(startEvent).not.toHaveProperty('prompt');
    });

    it('llm_call_end event includes response preview (truncated to 200 chars)', async () => {
      const input: LlmTraceInput = {
        phase: 'explainer',
        purpose: 'Explain',
        structuredOutput: false,
      };

      const messages = [new HumanMessage('Explain')];
      const longResponse = 'B'.repeat(500);
      const mockResponse = {
        content: longResponse,
        response_metadata: { usage: { prompt_tokens: 10, completion_tokens: 50 } },
      };

      const invokeFn = jest.fn().mockResolvedValue(mockResponse);

      await tracer.trace(input, messages, invokeFn);

      // Check that llm_call_end includes truncated preview
      expect(emitMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
        type: 'llm_call_end',
        responsePreview: longResponse.substring(0, 200),
      }));

      // Full response should be in the trace, not the event
      const traces = tracer.getTraces();
      expect(traces[0].responseContent).toBe(longResponse);
    });
  });

  describe('getTraces', () => {
    it('returns all collected traces in order', async () => {
      const input1: LlmTraceInput = {
        phase: 'planner',
        purpose: 'Plan',
        structuredOutput: false,
      };
      const input2: LlmTraceInput = {
        phase: 'navigator',
        purpose: 'Navigate',
        structuredOutput: false,
      };

      const messages = [new HumanMessage('Question')];
      const mockResponse = {
        content: 'Response',
        response_metadata: { usage: { prompt_tokens: 10, completion_tokens: 5 } },
      };

      const invokeFn = jest.fn().mockResolvedValue(mockResponse);

      await tracer.trace(input1, messages, invokeFn);
      await tracer.trace(input2, messages, invokeFn);

      const traces = tracer.getTraces();

      expect(traces).toHaveLength(2);
      expect(traces[0].phase).toBe('planner');
      expect(traces[0].callIndex).toBe(0);
      expect(traces[1].phase).toBe('navigator');
      expect(traces[1].callIndex).toBe(1);
    });
  });
});
