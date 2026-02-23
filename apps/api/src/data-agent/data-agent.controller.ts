import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';

import { DataAgentService } from './data-agent.service';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { PERMISSIONS } from '../common/constants/roles.constants';
import { CreateChatDto } from './dto/create-chat.dto';
import { UpdateChatDto } from './dto/update-chat.dto';
import { ChatQueryDto } from './dto/chat-query.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { CreatePreferenceDto } from './dto/create-preference.dto';
import { UpdatePreferenceDto } from './dto/update-preference.dto';
import { PreferenceQueryDto } from './dto/preference-query.dto';
import { CreateShareDto } from './dto/create-share.dto';

@ApiTags('Data Agent')
@Controller('data-agent')
export class DataAgentController {
  constructor(private readonly dataAgentService: DataAgentService) {}

  // ─── Preferences endpoints ───

  @Get('preferences')
  @Auth({ permissions: [PERMISSIONS.DATA_AGENT_READ] })
  @ApiOperation({ summary: 'List user data agent preferences' })
  @ApiQuery({ name: 'ontologyId', required: false, type: String })
  @ApiQuery({ name: 'scope', required: false, enum: ['global', 'ontology', 'all'] })
  @ApiResponse({ status: 200, description: 'Preferences returned' })
  async getPreferences(
    @Query() query: PreferenceQueryDto,
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.dataAgentService.getPreferences(userId, query.ontologyId, query.scope);
    return { data };
  }

  @Post('preferences')
  @Auth({ permissions: [PERMISSIONS.DATA_AGENT_WRITE] })
  @ApiOperation({ summary: 'Create or update a data agent preference' })
  @ApiResponse({ status: 201, description: 'Preference created or updated' })
  async createPreference(
    @Body() dto: CreatePreferenceDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.dataAgentService.createPreference(userId, dto);
  }

  @Patch('preferences/:id')
  @Auth({ permissions: [PERMISSIONS.DATA_AGENT_WRITE] })
  @ApiOperation({ summary: 'Update a data agent preference value' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Preference updated' })
  @ApiResponse({ status: 404, description: 'Preference not found' })
  async updatePreference(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePreferenceDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.dataAgentService.updatePreference(id, userId, dto);
  }

  @Delete('preferences/:id')
  @Auth({ permissions: [PERMISSIONS.DATA_AGENT_WRITE] })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a data agent preference' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Preference deleted' })
  @ApiResponse({ status: 404, description: 'Preference not found' })
  async deletePreference(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.dataAgentService.deletePreference(id, userId);
  }

  @Delete('preferences')
  @Auth({ permissions: [PERMISSIONS.DATA_AGENT_WRITE] })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Clear all data agent preferences for the user' })
  @ApiQuery({ name: 'ontologyId', required: false, type: String })
  @ApiResponse({ status: 204, description: 'Preferences cleared' })
  async clearPreferences(
    @Query('ontologyId') ontologyId: string | undefined,
    @CurrentUser('id') userId: string,
  ) {
    await this.dataAgentService.clearPreferences(userId, ontologyId || undefined);
  }

  // ─── Public share endpoint — MUST be before chats/:id to avoid route collision ───

  @Get('share/:shareToken')
  @Public()
  @ApiOperation({ summary: 'View a publicly shared chat (no auth required)' })
  @ApiParam({ name: 'shareToken', type: String })
  @ApiResponse({ status: 200, description: 'Shared chat data returned' })
  @ApiResponse({ status: 404, description: 'Share not found' })
  @ApiResponse({ status: 410, description: 'Share expired or revoked' })
  async getSharedChat(@Param('shareToken') shareToken: string) {
    return this.dataAgentService.getSharedChat(shareToken);
  }

  @Post('chats')
  @Auth({ permissions: [PERMISSIONS.DATA_AGENT_WRITE] })
  @ApiOperation({ summary: 'Create a new data agent chat' })
  @ApiResponse({ status: 201, description: 'Chat created' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 404, description: 'Ontology not found' })
  async createChat(
    @Body() dto: CreateChatDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.dataAgentService.createChat(dto, userId);
  }

  @Get('chats')
  @Auth({ permissions: [PERMISSIONS.DATA_AGENT_READ] })
  @ApiOperation({ summary: 'List data agent chats' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'ontologyId', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['createdAt', 'updatedAt', 'name'] })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiResponse({ status: 200, description: 'Paginated list of chats' })
  async listChats(
    @Query() query: ChatQueryDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.dataAgentService.findChats(query, userId);
  }

  @Get('chats/:chatId/messages/:messageId/traces')
  @Auth({ permissions: [PERMISSIONS.DATA_AGENT_READ] })
  @ApiOperation({ summary: 'Get LLM traces for a message' })
  @ApiParam({ name: 'chatId', type: String, format: 'uuid' })
  @ApiParam({ name: 'messageId', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'LLM traces returned' })
  @ApiResponse({ status: 404, description: 'Chat or message not found' })
  async getMessageTraces(
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentUser('id') userId: string,
  ) {
    const traces = await this.dataAgentService.getMessageTraces(messageId, chatId, userId);
    return { data: traces };
  }

  @Get('chats/:id')
  @Auth({ permissions: [PERMISSIONS.DATA_AGENT_READ] })
  @ApiOperation({ summary: 'Get data agent chat with messages' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Chat found' })
  @ApiResponse({ status: 404, description: 'Chat not found' })
  async getChat(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.dataAgentService.findChatById(id, userId);
  }

  @Patch('chats/:id')
  @Auth({ permissions: [PERMISSIONS.DATA_AGENT_WRITE] })
  @ApiOperation({ summary: 'Rename a data agent chat' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Chat updated' })
  @ApiResponse({ status: 404, description: 'Chat not found' })
  async updateChat(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateChatDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.dataAgentService.updateChat(id, dto, userId);
  }

  @Delete('chats/:id')
  @Auth({ permissions: [PERMISSIONS.DATA_AGENT_DELETE] })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a data agent chat' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Chat deleted' })
  @ApiResponse({ status: 404, description: 'Chat not found' })
  async deleteChat(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.dataAgentService.deleteChat(id, userId);
  }

  @Post('chats/:id/messages')
  @Auth({ permissions: [PERMISSIONS.DATA_AGENT_WRITE] })
  @ApiOperation({ summary: 'Send a message to the data agent' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Message sent, assistant response pending' })
  @ApiResponse({ status: 404, description: 'Chat not found' })
  async sendMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.dataAgentService.createMessagePair(id, dto.content, userId);
  }

  // ─── Share management endpoints (owner-only) ───

  @Post('chats/:id/share')
  @Auth({ permissions: [PERMISSIONS.DATA_AGENT_WRITE] })
  @ApiOperation({ summary: 'Create a share link for a chat' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Share link created' })
  @ApiResponse({ status: 404, description: 'Chat not found' })
  async createShare(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateShareDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.dataAgentService.createShare(id, userId, dto.expiresInDays);
  }

  @Get('chats/:id/share')
  @Auth({ permissions: [PERMISSIONS.DATA_AGENT_READ] })
  @ApiOperation({ summary: 'Get share status for a chat' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Share status returned' })
  @ApiResponse({ status: 404, description: 'Chat or share not found' })
  async getShareStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    const share = await this.dataAgentService.getShareStatus(id, userId);
    if (!share) throw new NotFoundException('No active share found');
    return share;
  }

  @Delete('chats/:id/share')
  @Auth({ permissions: [PERMISSIONS.DATA_AGENT_WRITE] })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke share link for a chat' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Share revoked' })
  @ApiResponse({ status: 404, description: 'Chat or share not found' })
  async revokeShare(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.dataAgentService.revokeShare(id, userId);
  }
}
