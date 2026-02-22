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
  NotImplementedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';

import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PERMISSIONS } from '../common/constants/roles.constants';
import { SpreadsheetAgentService } from './spreadsheet-agent.service';
import {
  CreateProjectDto,
  UpdateProjectDto,
  QueryProjectDto,
  QueryTableDto,
  CreateRunDto,
  ApprovePlanDto,
} from './dto';

@ApiTags('Spreadsheet Agent')
@Controller('spreadsheet-agent')
export class SpreadsheetAgentController {
  constructor(private readonly service: SpreadsheetAgentService) {}

  // ============================================================================
  // PROJECTS
  // ============================================================================

  @Get('projects')
  @Auth({ permissions: [PERMISSIONS.SPREADSHEET_AGENT_READ] })
  @ApiOperation({ summary: 'List spreadsheet projects' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['draft', 'processing', 'review_pending', 'ready', 'failed', 'partial'],
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['name', 'status', 'createdAt', 'tableCount', 'totalRows'],
  })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiResponse({ status: 200, description: 'Paginated list of projects' })
  async listProjects(@Query() query: QueryProjectDto) {
    const result = await this.service.listProjects(query);
    return { data: result };
  }

  @Post('projects')
  @Auth({ permissions: [PERMISSIONS.SPREADSHEET_AGENT_WRITE] })
  @ApiOperation({ summary: 'Create a new spreadsheet project' })
  @ApiResponse({ status: 201, description: 'Project created' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  async createProject(
    @Body() dto: CreateProjectDto,
    @CurrentUser('id') userId: string,
  ) {
    const project = await this.service.createProject(dto, userId);
    return { data: project };
  }

  @Get('projects/:id')
  @Auth({ permissions: [PERMISSIONS.SPREADSHEET_AGENT_READ] })
  @ApiOperation({ summary: 'Get a spreadsheet project by ID' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Project found' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async getProject(@Param('id', ParseUUIDPipe) id: string) {
    const project = await this.service.getProject(id);
    return { data: project };
  }

  @Patch('projects/:id')
  @Auth({ permissions: [PERMISSIONS.SPREADSHEET_AGENT_WRITE] })
  @ApiOperation({ summary: 'Update a spreadsheet project' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Project updated' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  async updateProject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser('id') userId: string,
  ) {
    const project = await this.service.updateProject(id, dto, userId);
    return { data: project };
  }

  @Delete('projects/:id')
  @Auth({ permissions: [PERMISSIONS.SPREADSHEET_AGENT_DELETE] })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a spreadsheet project' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Project deleted' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async deleteProject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.service.deleteProject(id, userId);
  }
}
