import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChatDto } from './dto/create-chat.dto';
import { UpdateChatDto } from './dto/update-chat.dto';
import { ChatQueryDto } from './dto/chat-query.dto';
import { DataChat, DataChatMessage } from '@prisma/client';

@Injectable()
export class DataAgentService {
  private readonly logger = new Logger(DataAgentService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new chat (validates ontology exists and is owned by user)
   */
  async createChat(
    data: CreateChatDto,
    userId: string,
  ): Promise<DataChat> {
    // Validate the ontology exists, is ready, and is owned by user
    const ontology = await this.prisma.ontology.findFirst({
      where: {
        id: data.ontologyId,
        ownerId: userId,
      },
      include: {
        semanticModel: {
          select: {
            ownerId: true,
          },
        },
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

    // Create chat
    const chat = await this.prisma.dataChat.create({
      data: {
        name: data.name,
        ontologyId: data.ontologyId,
        ownerId: userId,
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

    // Update chat
    const chat = await this.prisma.dataChat.update({
      where: { id },
      data: {
        name: data.name,
        updatedAt: new Date(),
      },
    });

    this.logger.log(`Chat ${id} renamed to ${data.name} by user ${userId}`);
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
    status: 'complete' | 'failed',
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
      // Atomic update: only claim if not already claimed
      const result = await this.prisma.dataChatMessage.updateMany({
        where: {
          id: messageId,
          status: 'generating',
          metadata: {
            path: ['claimed'],
            equals: null,
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
}
