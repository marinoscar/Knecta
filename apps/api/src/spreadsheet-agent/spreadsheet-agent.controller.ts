import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Req,
  BadRequestException,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';

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

  // ============================================================================
  // FILES
  // ============================================================================

  @Post('projects/:id/files')
  @Auth({ permissions: [PERMISSIONS.SPREADSHEET_AGENT_WRITE] })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Spreadsheet file to upload (xlsx, xls, csv, tsv, ods — max 50 MB)',
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        projectId: { type: 'string', format: 'uuid' },
      },
    },
  })
  @ApiOperation({ summary: 'Upload a spreadsheet file to a project' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 201, description: 'File record created' })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async uploadFiles(
    @Req() req: FastifyRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    const data = await req.file();

    if (!data) {
      throw new BadRequestException('No file provided in the request');
    }

    const file = await this.service.uploadFile(
      id,
      {
        filename: data.filename,
        mimetype: data.mimetype,
        file: data.file,
      },
      userId,
    );

    return { data: file };
  }

  @Get('projects/:id/files')
  @Auth({ permissions: [PERMISSIONS.SPREADSHEET_AGENT_READ] })
  @ApiOperation({ summary: 'List files in a project' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'List of files' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async listFiles(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.service.listFiles(id);
    return { data: result };
  }

  @Get('projects/:id/files/:fileId')
  @Auth({ permissions: [PERMISSIONS.SPREADSHEET_AGENT_READ] })
  @ApiOperation({ summary: 'Get a file by ID within a project' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiParam({ name: 'fileId', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'File found' })
  @ApiResponse({ status: 404, description: 'File not found' })
  async getFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    const file = await this.service.getFile(id, fileId);
    return { data: file };
  }

  @Delete('projects/:id/files/:fileId')
  @Auth({ permissions: [PERMISSIONS.SPREADSHEET_AGENT_DELETE] })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a file from a project' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiParam({ name: 'fileId', type: String, format: 'uuid' })
  @ApiResponse({ status: 204, description: 'File deleted' })
  @ApiResponse({ status: 404, description: 'File not found' })
  @ApiResponse({ status: 409, description: 'Active run in progress' })
  async deleteFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.service.deleteFile(id, fileId, userId);
  }

  // ============================================================================
  // TABLES
  // ============================================================================

  @Get('projects/:id/tables')
  @Auth({ permissions: [PERMISSIONS.SPREADSHEET_AGENT_READ] })
  @ApiOperation({ summary: 'List tables in a project' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'fileId', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'extracting', 'ready', 'failed'] })
  @ApiResponse({ status: 200, description: 'Paginated list of tables' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async listTables(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryTableDto,
  ) {
    const result = await this.service.listTables(id, query);
    return { data: result };
  }

  @Get('projects/:id/tables/:tableId')
  @Auth({ permissions: [PERMISSIONS.SPREADSHEET_AGENT_READ] })
  @ApiOperation({ summary: 'Get a table by ID within a project' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiParam({ name: 'tableId', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Table found' })
  @ApiResponse({ status: 404, description: 'Table not found' })
  async getTable(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tableId', ParseUUIDPipe) tableId: string,
  ) {
    const table = await this.service.getTable(id, tableId);
    return { data: table };
  }

  @Get('projects/:id/tables/:tableId/preview')
  @Auth({ permissions: [PERMISSIONS.SPREADSHEET_AGENT_READ] })
  @ApiOperation({ summary: 'Preview rows from a ready table' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiParam({ name: 'tableId', type: String, format: 'uuid' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max rows to return (1-500, default 50)' })
  @ApiResponse({ status: 200, description: 'Table preview data' })
  @ApiResponse({ status: 404, description: 'Table not found' })
  @ApiResponse({ status: 409, description: 'Table not ready' })
  async previewTable(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tableId', ParseUUIDPipe) tableId: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = Math.min(Math.max(parseInt(limit ?? '50', 10) || 50, 1), 500);
    const result = await this.service.getTablePreview(id, tableId, parsedLimit);
    return { data: result };
  }

  @Get('projects/:id/tables/:tableId/download')
  @Auth({ permissions: [PERMISSIONS.SPREADSHEET_AGENT_READ] })
  @ApiOperation({ summary: 'Get a signed download URL for a table Parquet file' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiParam({ name: 'tableId', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Signed download URL' })
  @ApiResponse({ status: 404, description: 'Table not found' })
  @ApiResponse({ status: 409, description: 'Table not ready' })
  async downloadTable(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tableId', ParseUUIDPipe) tableId: string,
  ) {
    const result = await this.service.getTableDownloadUrl(id, tableId);
    return { data: result };
  }

  @Delete('projects/:id/tables/:tableId')
  @Auth({ permissions: [PERMISSIONS.SPREADSHEET_AGENT_DELETE] })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a table from a project' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiParam({ name: 'tableId', type: String, format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Table deleted' })
  @ApiResponse({ status: 404, description: 'Table not found' })
  async deleteTable(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tableId', ParseUUIDPipe) tableId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.service.deleteTable(id, tableId, userId);
  }

  // ============================================================================
  // RUNS — static routes MUST come before parameterized routes
  // ============================================================================

  @Post('runs')
  @Auth({ permissions: [PERMISSIONS.SPREADSHEET_AGENT_WRITE] })
  @ApiOperation({ summary: 'Create a new agent run for a project' })
  @ApiResponse({ status: 201, description: 'Run created' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 409, description: 'Active run already in progress or no files uploaded' })
  async createRun(
    @Body() dto: CreateRunDto,
    @CurrentUser('id') userId: string,
  ) {
    const run = await this.service.createRun(dto, userId);
    return { data: run };
  }

  @Get('runs/:runId')
  @Auth({ permissions: [PERMISSIONS.SPREADSHEET_AGENT_READ] })
  @ApiOperation({ summary: 'Get run status by ID' })
  @ApiParam({ name: 'runId', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Run found' })
  @ApiResponse({ status: 404, description: 'Run not found' })
  async getRun(@Param('runId', ParseUUIDPipe) runId: string) {
    const run = await this.service.getRun(runId);
    return { data: run };
  }

  @Post('runs/:runId/cancel')
  @Auth({ permissions: [PERMISSIONS.SPREADSHEET_AGENT_WRITE] })
  @ApiOperation({ summary: 'Cancel an active or pending run' })
  @ApiParam({ name: 'runId', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Run cancelled' })
  @ApiResponse({ status: 404, description: 'Run not found' })
  @ApiResponse({ status: 400, description: 'Run cannot be cancelled' })
  async cancelRun(
    @Param('runId', ParseUUIDPipe) runId: string,
    @CurrentUser('id') userId: string,
  ) {
    const run = await this.service.cancelRun(runId, userId);
    return { data: run };
  }

  @Post('runs/:runId/approve')
  @Auth({ permissions: [PERMISSIONS.SPREADSHEET_AGENT_WRITE] })
  @ApiOperation({ summary: 'Approve (or modify) an extraction plan and resume the run' })
  @ApiParam({ name: 'runId', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Plan approved, run reset to pending' })
  @ApiResponse({ status: 404, description: 'Run not found' })
  @ApiResponse({ status: 400, description: 'Run is not in review_pending state' })
  async approvePlan(
    @Param('runId', ParseUUIDPipe) runId: string,
    @Body() dto: ApprovePlanDto,
    @CurrentUser('id') userId: string,
  ) {
    const run = await this.service.approvePlan(runId, dto, userId);
    return { data: run };
  }
}
