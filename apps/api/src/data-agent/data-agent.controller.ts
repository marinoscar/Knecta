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
import { PERMISSIONS } from '../common/constants/roles.constants';
import { CreateChatDto } from './dto/create-chat.dto';
import { UpdateChatDto } from './dto/update-chat.dto';
import { ChatQueryDto } from './dto/chat-query.dto';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('Data Agent')
@Controller('data-agent')
export class DataAgentController {
  constructor(private readonly dataAgentService: DataAgentService) {}

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
}
