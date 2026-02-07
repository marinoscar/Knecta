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

import { ConnectionsService } from './connections.service';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PERMISSIONS } from '../common/constants/roles.constants';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { UpdateConnectionDto } from './dto/update-connection.dto';
import { ConnectionQueryDto } from './dto/connection-query.dto';
import { TestConnectionDto } from './dto/test-connection.dto';

@ApiTags('Connections')
@Controller('connections')
export class ConnectionsController {
  constructor(private readonly connectionsService: ConnectionsService) {}

  @Get()
  @Auth({ permissions: [PERMISSIONS.CONNECTIONS_READ] })
  @ApiOperation({ summary: 'List data connections' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'dbType', required: false, enum: ['postgresql', 'mysql', 'sqlserver', 'databricks', 'snowflake'] })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['name', 'dbType', 'createdAt', 'lastTestedAt'] })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiResponse({ status: 200, description: 'Paginated list of connections' })
  async list(
    @Query() query: ConnectionQueryDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.connectionsService.list(query, userId);
  }

  @Get(':id')
  @Auth({ permissions: [PERMISSIONS.CONNECTIONS_READ] })
  @ApiOperation({ summary: 'Get connection by ID' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Connection found' })
  @ApiResponse({ status: 404, description: 'Connection not found' })
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.connectionsService.getById(id, userId);
  }

  @Post()
  @Auth({ permissions: [PERMISSIONS.CONNECTIONS_WRITE] })
  @ApiOperation({ summary: 'Create a new connection' })
  @ApiResponse({ status: 201, description: 'Connection created' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  async create(
    @Body() dto: CreateConnectionDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.connectionsService.create(dto, userId);
  }

  @Patch(':id')
  @Auth({ permissions: [PERMISSIONS.CONNECTIONS_WRITE] })
  @ApiOperation({ summary: 'Update a connection' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Connection updated' })
  @ApiResponse({ status: 404, description: 'Connection not found' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConnectionDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.connectionsService.update(id, dto, userId);
  }

  @Delete(':id')
  @Auth({ permissions: [PERMISSIONS.CONNECTIONS_DELETE] })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a connection' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Connection deleted' })
  @ApiResponse({ status: 404, description: 'Connection not found' })
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.connectionsService.delete(id, userId);
  }

  @Post('test')
  @Auth({ permissions: [PERMISSIONS.CONNECTIONS_TEST] })
  @ApiOperation({ summary: 'Test new connection parameters without saving' })
  @ApiResponse({ status: 200, description: 'Test result' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  async testNew(@Body() dto: TestConnectionDto) {
    return this.connectionsService.testNew(dto);
  }

  @Post(':id/test')
  @Auth({ permissions: [PERMISSIONS.CONNECTIONS_TEST] })
  @ApiOperation({ summary: 'Test an existing connection' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Test result' })
  @ApiResponse({ status: 404, description: 'Connection not found' })
  async testExisting(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.connectionsService.testExisting(id, userId);
  }
}
