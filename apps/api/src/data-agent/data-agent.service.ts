import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  GoneException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChatDto } from './dto/create-chat.dto';
import { UpdateChatDto } from './dto/update-chat.dto';
import { ChatQueryDto } from './dto/chat-query.dto';
import { CreatePreferenceDto } from './dto/create-preference.dto';
import { UpdatePreferenceDto } from './dto/update-preference.dto';
import { DataChat, DataChatMessage, DataChatShare, Prisma } from '@prisma/client';
import { CollectedTrace } from './agent/types';

@Injectable()
export class DataAgentService {
  private readonly logger = new Logger(DataAgentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Create a new chat (validates ontology exists and is ready)
   */
  async createChat(
    data: CreateChatDto,
    userId: string,
  ): Promise<DataChat> {
    // Validate the ontology exists and is ready (system-level, no ownership check)
    const ontology = await this.prisma.ontology.findUnique({
      where: {
        id: data.ontologyId,
      },
    });

    if (!ontology) {
      throw new NotFoundException(
        `Ontology with ID ${data.ontologyId} not found`,
      );
    }

    if (ontology.status !== 'ready') {
      throw new ConflictException('Ontology must be in ready status');
    }

    // Create chat (chats remain per-user)
    const chat = await this.prisma.dataChat.create({
      data: {
        name: data.name,
        ontologyId: data.ontologyId,
        ownerId: userId,
        llmProvider: data.llmProvider || null,
      },
    });

    this.logger.log(`Chat ${chat.name} created by user ${userId}`);
    return chat;
  }

  /**
   * List chats with pagination, search, filters
   */
  async findChats(query: ChatQueryDto, userId: string) {
    const { page, pageSize, search, ontologyId, sortBy, sortOrder } = query;
    const skip = (page - 1) * pageSize;

    // Build where clause
    const where: any = {
      ownerId: userId,
    };

    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    if (ontologyId) {
      where.ontologyId = ontologyId;
    }

    // Execute query
    const [items, total] = await Promise.all([
      this.prisma.dataChat.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { [sortBy]: sortOrder },
        include: {
          ontology: {
            select: {
              name: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.dataChat.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Get single chat by ID with all messages (ownership check)
   */
  async findChatById(
    id: string,
    userId: string,
  ): Promise<DataChat & { messages: DataChatMessage[] }> {
    const chat = await this.prisma.dataChat.findFirst({
      where: {
        id,
        ownerId: userId,
      },
      include: {
        messages: {
          orderBy: {
            createdAt: 'asc',
          },
        },
        ontology: {
          select: {
            name: true,
            status: true,
          },
        },
      },
    });

    if (!chat) {
      throw new NotFoundException(`Chat with ID ${id} not found`);
    }

    return chat;
  }

  /**
   * Rename a chat (ownership check)
   */
  async updateChat(
    id: string,
    data: UpdateChatDto,
    userId: string,
  ): Promise<DataChat> {
    // Verify ownership
    const existing = await this.prisma.dataChat.findFirst({
      where: {
        id,
        ownerId: userId,
      },
    });

    if (!existing) {
      throw new NotFoundException(`Chat with ID ${id} not found`);
    }

    // Build update data
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (data.name !== undefined) {
      updateData.name = data.name;
    }

    if (data.llmProvider !== undefined) {
      updateData.llmProvider = data.llmProvider;
    }

    // Update chat
    const chat = await this.prisma.dataChat.update({
      where: { id },
      data: updateData,
    });

    this.logger.log(`Chat ${id} updated by user ${userId}`);
    return chat;
  }

  /**
   * Delete a chat (ownership check)
   */
  async deleteChat(id: string, userId: string): Promise<void> {
    // Verify ownership
    const chat = await this.prisma.dataChat.findFirst({
      where: {
        id,
        ownerId: userId,
      },
    });

    if (!chat) {
      throw new NotFoundException(`Chat with ID ${id} not found`);
    }

    // Delete chat (messages cascade)
    await this.prisma.dataChat.delete({
      where: { id },
    });

    this.logger.log(`Chat ${chat.name} deleted by user ${userId}`);
  }

  /**
   * Create a user message and an assistant placeholder
   */
  async createMessagePair(
    chatId: string,
    content: string,
    userId: string,
  ): Promise<{ userMessage: DataChatMessage; assistantMessage: DataChatMessage }> {
    // Verify chat ownership
    const chat = await this.prisma.dataChat.findFirst({
      where: {
        id: chatId,
        ownerId: userId,
      },
    });

    if (!chat) {
      throw new NotFoundException(`Chat with ID ${chatId} not found`);
    }

    // Create both messages in a transaction
    const [userMessage, assistantMessage] = await this.prisma.$transaction([
      this.prisma.dataChatMessage.create({
        data: {
          chatId,
          role: 'user',
          content,
          status: 'complete',
        },
      }),
      this.prisma.dataChatMessage.create({
        data: {
          chatId,
          role: 'assistant',
          content: '',
          status: 'generating',
          metadata: {},
        },
      }),
    ]);

    // Touch chat updatedAt
    await this.prisma.dataChat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() },
    });

    this.logger.log(`Message pair created in chat ${chatId}`);
    return { userMessage, assistantMessage };
  }

  /**
   * Update assistant message content and status
   */
  async updateAssistantMessage(
    messageId: string,
    content: string,
    metadata: any,
    status: 'complete' | 'failed' | 'clarification_needed',
  ): Promise<DataChatMessage> {
    const message = await this.prisma.dataChatMessage.update({
      where: { id: messageId },
      data: {
        content,
        metadata,
        status,
      },
    });

    this.logger.log(`Assistant message ${messageId} updated with status ${status}`);
    return message;
  }

  /**
   * Claim a message for processing (atomic, prevents duplicate execution)
   */
  async claimMessage(messageId: string): Promise<boolean> {
    try {
      // Atomic update: only claim if not already claimed.
      // The message is created with metadata={}, so we check for that exact value.
      // After claiming, metadata becomes {claimed:true}, so a second attempt won't match.
      const result = await this.prisma.dataChatMessage.updateMany({
        where: {
          id: messageId,
          status: 'generating',
          metadata: {
            equals: {},
          },
        },
        data: {
          metadata: {
            claimed: true,
          },
        },
      });

      const claimed = result.count > 0;
      if (claimed) {
        this.logger.log(`Message ${messageId} claimed for processing`);
      } else {
        this.logger.warn(`Message ${messageId} already claimed or not in generating status`);
      }

      return claimed;
    } catch (error) {
      this.logger.error(`Failed to claim message ${messageId}`, error);
      return false;
    }
  }

  /**
   * Get all messages for a chat (no ownership check, caller must verify)
   */
  async getChatMessages(chatId: string): Promise<DataChatMessage[]> {
    return this.prisma.dataChatMessage.findMany({
      where: { chatId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Persist LLM traces for a message (batch write)
   */
  async persistTraces(messageId: string, traces: CollectedTrace[]): Promise<void> {
    if (traces.length === 0) return;

    await this.prisma.llmTrace.createMany({
      data: traces.map((trace) => ({
        messageId,
        phase: trace.phase,
        callIndex: trace.callIndex,
        stepId: trace.stepId ?? null,
        purpose: trace.purpose,
        provider: trace.provider,
        model: trace.model,
        temperature: trace.temperature ?? null,
        structuredOutput: trace.structuredOutput,
        promptMessages: trace.promptMessages,
        responseContent: trace.responseContent,
        toolCalls: Array.isArray(trace.toolCalls) ? (trace.toolCalls as unknown as Prisma.InputJsonValue) : undefined,
        promptTokens: trace.promptTokens,
        completionTokens: trace.completionTokens,
        totalTokens: trace.totalTokens,
        startedAt: new Date(trace.startedAt),
        completedAt: new Date(trace.completedAt),
        durationMs: trace.durationMs,
        error: trace.error ?? null,
      })),
    });
  }

  /**
   * Get LLM traces for a message (ownership verified via chat)
   */
  async getMessageTraces(messageId: string, chatId: string, userId: string) {
    // Verify ownership through the chat
    const chat = await this.prisma.dataChat.findFirst({
      where: { id: chatId, ownerId: userId },
    });
    if (!chat) throw new NotFoundException('Chat not found');

    // Verify message belongs to chat
    const message = await this.prisma.dataChatMessage.findFirst({
      where: { id: messageId, chatId },
    });
    if (!message) throw new NotFoundException('Message not found');

    return this.prisma.llmTrace.findMany({
      where: { messageId },
      orderBy: { callIndex: 'asc' },
    });
  }

  // ─── Preferences CRUD ───

  async getPreferences(userId: string, ontologyId?: string, scope?: string) {
    const where: any = { userId };

    if (scope === 'global') {
      where.ontologyId = null;
    } else if (scope === 'ontology' && ontologyId) {
      where.ontologyId = ontologyId;
    } else if (ontologyId) {
      // 'all' scope with ontologyId: return global + that ontology's prefs
      where.OR = [
        { ontologyId: null },
        { ontologyId },
      ];
    }
    // If no ontologyId and scope is 'all', return everything for the user

    return this.prisma.dataAgentPreference.findMany({
      where,
      orderBy: [{ ontologyId: 'asc' }, { key: 'asc' }],
    });
  }

  async getEffectivePreferences(
    userId: string,
    ontologyId: string,
  ): Promise<Array<{ key: string; value: string; source: string }>> {
    // Get both global (ontologyId=null) and ontology-scoped preferences.
    // Ontology-scoped overrides global for the same key.
    const prefs = await this.prisma.dataAgentPreference.findMany({
      where: {
        userId,
        OR: [
          { ontologyId: null },
          { ontologyId },
        ],
      },
    });

    const map = new Map<string, { key: string; value: string; source: string }>();
    // Globals first (so ontology-scoped can override)
    for (const p of prefs.filter((p) => !p.ontologyId)) {
      map.set(p.key, { key: p.key, value: p.value, source: p.source });
    }
    // Ontology-scoped override
    for (const p of prefs.filter((p) => p.ontologyId)) {
      map.set(p.key, { key: p.key, value: p.value, source: p.source });
    }
    return [...map.values()];
  }

  async createPreference(userId: string, dto: CreatePreferenceDto) {
    if (dto.ontologyId) {
      // When ontologyId is provided, use upsert with composite unique
      return this.prisma.dataAgentPreference.upsert({
        where: {
          user_ontology_key_unique: {
            userId,
            ontologyId: dto.ontologyId,
            key: dto.key,
          },
        },
        update: {
          value: dto.value,
          source: dto.source || 'manual',
        },
        create: {
          userId,
          ontologyId: dto.ontologyId,
          key: dto.key,
          value: dto.value,
          source: dto.source || 'manual',
        },
      });
    }

    // When ontologyId is null (global preference), find existing and update or create
    const existing = await this.prisma.dataAgentPreference.findFirst({
      where: { userId, ontologyId: null, key: dto.key },
    });

    if (existing) {
      return this.prisma.dataAgentPreference.update({
        where: { id: existing.id },
        data: {
          value: dto.value,
          source: dto.source || 'manual',
        },
      });
    }

    return this.prisma.dataAgentPreference.create({
      data: {
        userId,
        ontologyId: null,
        key: dto.key,
        value: dto.value,
        source: dto.source || 'manual',
      },
    });
  }

  async updatePreference(id: string, userId: string, dto: UpdatePreferenceDto) {
    const pref = await this.prisma.dataAgentPreference.findFirst({
      where: { id, userId },
    });
    if (!pref) {
      throw new NotFoundException('Preference not found');
    }

    return this.prisma.dataAgentPreference.update({
      where: { id },
      data: { value: dto.value },
    });
  }

  async deletePreference(id: string, userId: string): Promise<void> {
    const pref = await this.prisma.dataAgentPreference.findFirst({
      where: { id, userId },
    });
    if (!pref) {
      throw new NotFoundException('Preference not found');
    }

    await this.prisma.dataAgentPreference.delete({ where: { id } });
  }

  async clearPreferences(userId: string, ontologyId?: string): Promise<void> {
    const where: any = { userId };
    if (ontologyId) {
      where.ontologyId = ontologyId;
    }
    await this.prisma.dataAgentPreference.deleteMany({ where });
  }

  // ─── Chat Share CRUD ───

  /**
   * Build the public share URL from a token.
   */
  private buildShareUrl(shareToken: string): string {
    const appUrl = this.configService.get<string>('APP_URL') || 'http://localhost:8319';
    return `${appUrl}/share/${shareToken}`;
  }

  /**
   * Format a DataChatShare record into a consistent share-response shape.
   */
  private formatShareResponse(share: DataChatShare) {
    return {
      id: share.id,
      shareToken: share.shareToken,
      shareUrl: this.buildShareUrl(share.shareToken),
      expiresAt: share.expiresAt,
      isActive: share.isActive,
      viewCount: share.viewCount,
      createdAt: share.createdAt,
    };
  }

  /**
   * Create a share link for a chat (idempotent — returns existing active share if one exists).
   */
  async createShare(chatId: string, userId: string, expiresInDays?: number) {
    // Verify ownership
    const chat = await this.prisma.dataChat.findFirst({
      where: { id: chatId, ownerId: userId },
    });
    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    // Return existing active share (idempotent)
    const existing = await this.prisma.dataChatShare.findFirst({
      where: { chatId, isActive: true },
    });
    if (existing) {
      this.logger.log(`Returning existing share for chat ${chatId}`);
      return this.formatShareResponse(existing);
    }

    // Generate a cryptographically-random token
    const shareToken = randomBytes(32).toString('base64url');

    // Calculate optional expiry
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 86_400_000)
      : null;

    const share = await this.prisma.dataChatShare.create({
      data: {
        chatId,
        shareToken,
        createdById: userId,
        expiresAt,
        isActive: true,
      },
    });

    this.logger.log(`Share created for chat ${chatId} by user ${userId}`);
    return this.formatShareResponse(share);
  }

  /**
   * Return the active share for a chat, or null if none exists.
   */
  async getShareStatus(chatId: string, userId: string) {
    // Verify ownership
    const chat = await this.prisma.dataChat.findFirst({
      where: { id: chatId, ownerId: userId },
    });
    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    const share = await this.prisma.dataChatShare.findFirst({
      where: { chatId, isActive: true },
    });
    if (!share) {
      return null;
    }

    return this.formatShareResponse(share);
  }

  /**
   * Revoke the active share for a chat.
   */
  async revokeShare(chatId: string, userId: string): Promise<void> {
    // Verify ownership
    const chat = await this.prisma.dataChat.findFirst({
      where: { id: chatId, ownerId: userId },
    });
    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    const share = await this.prisma.dataChatShare.findFirst({
      where: { chatId, isActive: true },
    });
    if (!share) {
      throw new NotFoundException('No active share found');
    }

    await this.prisma.dataChatShare.update({
      where: { id: share.id },
      data: { isActive: false },
    });

    this.logger.log(`Share revoked for chat ${chatId} by user ${userId}`);
  }

  /**
   * Return sanitized chat data for a public share token (no auth required).
   */
  async getSharedChat(shareToken: string) {
    const share = await this.prisma.dataChatShare.findFirst({
      where: { shareToken },
    });

    if (!share) {
      throw new NotFoundException('Share not found');
    }

    if (!share.isActive) {
      throw new GoneException('This share has been revoked');
    }

    if (share.expiresAt && share.expiresAt < new Date()) {
      throw new GoneException('This share has expired');
    }

    // Increment view count asynchronously (fire-and-forget, non-blocking)
    this.prisma.dataChatShare
      .update({ where: { id: share.id }, data: { viewCount: { increment: 1 } } })
      .catch((err) => this.logger.warn(`Failed to increment view count for share ${share.id}`, err));

    const chat = await this.prisma.dataChat.findUnique({
      where: { id: share.chatId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            llmTraces: {
              orderBy: { callIndex: 'asc' },
              select: {
                phase: true,
                callIndex: true,
                stepId: true,
                purpose: true,
                provider: true,
                model: true,
                structuredOutput: true,
                promptTokens: true,
                completionTokens: true,
                totalTokens: true,
                durationMs: true,
                error: true,
              },
            },
          },
        },
        ontology: { select: { name: true } },
      },
    });

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    return {
      chatName: chat.name,
      ontologyName: chat.ontology?.name ?? null,
      sharedAt: share.createdAt.toISOString(),
      messages: chat.messages.map((m) => this.sanitizeMessageForShare(m)),
    };
  }

  /**
   * Strip sensitive fields from a message before returning it in a public share response.
   * Keeps: role, content, status, createdAt, and a safe subset of metadata.
   */
  private sanitizeMessageForShare(message: DataChatMessage) {
    const raw = (message.metadata ?? {}) as Record<string, any>;

    // Strip yaml and notes from joinPlan (keep only relevantDatasets name+description and joinPaths)
    let joinPlan: any = undefined;
    if (raw.joinPlan) {
      const jp = raw.joinPlan;
      joinPlan = {
        relevantDatasets: Array.isArray(jp.relevantDatasets)
          ? jp.relevantDatasets.map(
              ({ name, description }: { name?: string; description?: string; [key: string]: any }) => ({
                name,
                description,
              }),
            )
          : [],
        joinPaths: jp.joinPaths ?? [],
      };
    }

    const safeMetadata: Record<string, any> = {};

    if (raw.plan !== undefined) safeMetadata.plan = raw.plan;
    if (joinPlan !== undefined) safeMetadata.joinPlan = joinPlan;
    if (raw.stepResults !== undefined) safeMetadata.stepResults = raw.stepResults;
    if (raw.verificationReport !== undefined) safeMetadata.verificationReport = raw.verificationReport;
    if (raw.dataLineage !== undefined) safeMetadata.dataLineage = raw.dataLineage;
    if (raw.cannotAnswer !== undefined) safeMetadata.cannotAnswer = raw.cannotAnswer;
    if (raw.durationMs !== undefined) safeMetadata.durationMs = raw.durationMs;
    if (raw.revisionsUsed !== undefined) safeMetadata.revisionsUsed = raw.revisionsUsed;

    // Include sanitized LLM traces (no prompt messages or response content)
    const traces = (message as any).llmTraces;

    return {
      role: message.role,
      content: message.content,
      status: message.status,
      createdAt: message.createdAt,
      metadata: safeMetadata,
      traces: Array.isArray(traces) ? traces : [],
    };
  }
}
