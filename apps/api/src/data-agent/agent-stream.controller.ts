import {
  Controller,
  Post,
  Param,
  Res,
  Logger,
  HttpCode,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiExcludeEndpoint } from '@nestjs/swagger';
import { FastifyReply } from 'fastify';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PERMISSIONS } from '../common/constants/roles.constants';
import { DataAgentService } from './data-agent.service';
import { DataAgentAgentService } from './agent/agent.service';
import { SystemSettingsService } from '../settings/system-settings/system-settings.service';
import { LlmModelConfig } from '../llm/llm.service';

/**
 * Agent Stream Controller
 *
 * Provides SSE streaming for data agent message responses.
 *
 * Event types:
 * - message_start: Agent execution started
 * - message_chunk: Partial response content
 * - tool_start: Tool execution started (with tool name and arguments)
 * - tool_end: Tool execution completed (with result)
 * - tool_error: Tool execution failed (with error message)
 * - message_complete: Agent execution completed (with full content and metadata)
 * - message_error: Agent execution failed (with error message)
 */
@ApiTags('Data Agent')
@Controller('data-agent')
export class AgentStreamController {
  private readonly logger = new Logger(AgentStreamController.name);

  constructor(
    private readonly dataAgentService: DataAgentService,
    private readonly agentService: DataAgentAgentService,
    private readonly systemSettingsService: SystemSettingsService,
  ) {}

  @Post('chats/:chatId/messages/:messageId/stream')
  @Auth({ permissions: [PERMISSIONS.DATA_AGENT_WRITE] })
  @HttpCode(200)
  @ApiOperation({ summary: 'Stream agent response for a message' })
  @ApiParam({ name: 'chatId', type: String, format: 'uuid' })
  @ApiParam({ name: 'messageId', type: String, format: 'uuid' })
  @ApiExcludeEndpoint()
  async streamResponse(
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentUser('id') userId: string,
    @Res() res: FastifyReply,
  ) {
    // CRITICAL: Hijack the response to prevent Fastify from closing it
    res.hijack();
    const raw = res.raw;

    // Set SSE headers
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Prevent Nginx buffering
    });

    // Helper to emit SSE events
    const emit = (event: object) => {
      if (!raw.writableEnded) {
        raw.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    };

    // Keep-alive heartbeat
    const keepAlive = setInterval(() => {
      if (!raw.writableEnded) {
        raw.write(': keep-alive\n\n');
      }
    }, 30_000);

    try {
      // Verify chat ownership
      const chat = await this.dataAgentService.findChatById(chatId, userId);
      if (!chat) {
        emit({ type: 'message_error', message: 'Chat not found' });
        raw.end();
        clearInterval(keepAlive);
        return;
      }

      // Claim the message (atomic lock)
      const claimed = await this.dataAgentService.claimMessage(messageId);
      if (!claimed) {
        emit({ type: 'message_error', message: 'Message is already being processed' });
        raw.end();
        clearInterval(keepAlive);
        return;
      }

      // Get the user's question from the message before this one
      // (the assistant message is the placeholder, the user message was created just before it)
      const messages = await this.dataAgentService.getChatMessages(chatId);
      // Find the last user message before this assistant message
      const assistantMsgIndex = messages.findIndex((m) => m.id === messageId);
      const userMessage = messages
        .slice(0, assistantMsgIndex)
        .reverse()
        .find((m) => m.role === 'user');

      if (!userMessage) {
        emit({ type: 'message_error', message: 'No user message found' });
        raw.end();
        clearInterval(keepAlive);
        return;
      }

      // Resolve the provider: chat-level > system default
      const chatProvider = chat.llmProvider || null;

      // Fetch system settings for provider config
      let providerConfig: LlmModelConfig | undefined;
      if (chatProvider) {
        const systemSettings = await this.systemSettingsService.getSettings();
        const providerKey = chatProvider as 'openai' | 'anthropic' | 'azure';
        providerConfig = systemSettings.dataAgent?.[providerKey] || undefined;
      }

      // Execute the agent with streaming
      await this.agentService.executeAgent(
        chatId,
        messageId,
        userMessage.content,
        userId,
        emit,
        chatProvider || undefined,
        providerConfig,
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Stream error: ${errorMessage}`, errorStack);
      emit({ type: 'message_error', message: errorMessage });
    } finally {
      clearInterval(keepAlive);
      if (!raw.writableEnded) {
        raw.end();
      }
    }
  }
}
