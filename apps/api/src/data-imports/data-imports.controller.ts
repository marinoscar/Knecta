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
import { DataImportsService } from './data-imports.service';
import {
  UpdateImportDto,
  ImportQueryDto,
  PreviewRequestDto,
  RunQueryDto,
  CreateRunDto,
} from './dto';

@ApiTags('Data Imports')
@Controller('data-imports')
export class DataImportsController {
  constructor(private readonly service: DataImportsService) {}

  // ============================================================================
  // UPLOAD — static route, must come before /:id
  // ============================================================================

  @Post('upload')
  @Auth({ permissions: [PERMISSIONS.DATA_IMPORTS_WRITE] })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'CSV or Excel file to import (max 100 MB)',
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        name: { type: 'string' },
      },
    },
  })
  @ApiOperation({ summary: 'Upload a CSV or Excel file to create a new data import' })
  @ApiResponse({ status: 201, description: 'Import created' })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  async upload(
    @Req() req: FastifyRequest,
    @CurrentUser('id') userId: string,
  ) {
    const data = await req.file();

    if (!data) {
      throw new BadRequestException('No file provided in the request');
    }

    // Buffer the stream
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      data.file.on('data', (chunk: Buffer) => chunks.push(chunk));
      data.file.on('end', resolve);
      data.file.on('error', reject);
    });
    const buffer = Buffer.concat(chunks);

    const result = await this.service.upload(
      { buffer, filename: data.filename, mimetype: data.mimetype },
      userId,
    );

    return { data: result };
  }

  // ============================================================================
  // RUNS — static routes MUST come before parameterized /:id routes
  // ============================================================================

  @Post('runs')
  @Auth({ permissions: [PERMISSIONS.DATA_IMPORTS_WRITE] })
  @ApiOperation({ summary: 'Create a new import run' })
  @ApiResponse({ status: 201, description: 'Run created' })
  @ApiResponse({ status: 400, description: 'Invalid request or import not in a runnable state' })
  @ApiResponse({ status: 404, description: 'Import not found' })
  @ApiResponse({ status: 409, description: 'Import is already running' })
  async createRun(
    @Body() dto: CreateRunDto,
    @CurrentUser('id') userId: string,
  ) {
    const run = await this.service.createRun(dto, userId);
    return { data: run };
  }

  @Get('runs/:runId')
  @Auth({ permissions: [PERMISSIONS.DATA_IMPORTS_READ] })
  @ApiOperation({ summary: 'Get run status by ID' })
  @ApiParam({ name: 'runId', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Run found' })
  @ApiResponse({ status: 404, description: 'Run not found' })
  async getRun(@Param('runId', ParseUUIDPipe) runId: string) {
    const run = await this.service.getRun(runId);
    return { data: run };
  }

  @Post('runs/:runId/cancel')
  @Auth({ permissions: [PERMISSIONS.DATA_IMPORTS_WRITE] })
  @ApiOperation({ summary: 'Cancel an active or pending run' })
  @ApiParam({ name: 'runId', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Run cancelled' })
  @ApiResponse({ status: 400, description: 'Run cannot be cancelled in its current state' })
  @ApiResponse({ status: 404, description: 'Run not found' })
  async cancelRun(@Param('runId', ParseUUIDPipe) runId: string) {
    const run = await this.service.cancelRun(runId);
    return { data: run };
  }

  @Delete('runs/:runId')
  @Auth({ permissions: [PERMISSIONS.DATA_IMPORTS_DELETE] })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a failed or cancelled run' })
  @ApiParam({ name: 'runId', type: String, format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Run deleted' })
  @ApiResponse({ status: 400, description: 'Only failed or cancelled runs can be deleted' })
  @ApiResponse({ status: 404, description: 'Run not found' })
  async deleteRun(@Param('runId', ParseUUIDPipe) runId: string) {
    await this.service.deleteRun(runId);
  }

  // ============================================================================
  // LIST
  // ============================================================================

  @Get()
  @Auth({ permissions: [PERMISSIONS.DATA_IMPORTS_READ] })
  @ApiOperation({ summary: 'List data imports' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['draft', 'pending', 'importing', 'ready', 'partial', 'failed'],
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['name', 'createdAt', 'status', 'sourceFileType'],
  })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiResponse({ status: 200, description: 'Paginated list of data imports' })
  async list(@Query() query: ImportQueryDto) {
    const result = await this.service.list(query);
    return { data: result };
  }

  // ============================================================================
  // INDIVIDUAL IMPORT — parameterized routes (:id) come after all static routes
  // ============================================================================

  @Get(':id')
  @Auth({ permissions: [PERMISSIONS.DATA_IMPORTS_READ] })
  @ApiOperation({ summary: 'Get a data import by ID' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Import found' })
  @ApiResponse({ status: 404, description: 'Import not found' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    const item = await this.service.getById(id);
    return { data: item };
  }

  @Get(':id/preview')
  @Auth({ permissions: [PERMISSIONS.DATA_IMPORTS_READ] })
  @ApiOperation({ summary: 'Get the auto-detected parse result for an import' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Parse result' })
  @ApiResponse({ status: 404, description: 'Import not found' })
  async getPreview(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.service.getPreview(id);
    return { data: result };
  }

  @Post(':id/preview')
  @Auth({ permissions: [PERMISSIONS.DATA_IMPORTS_READ] })
  @ApiOperation({ summary: 'Preview rows from a specific Excel sheet and range' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Sheet preview data' })
  @ApiResponse({ status: 400, description: 'Not an Excel file or invalid request' })
  @ApiResponse({ status: 404, description: 'Import not found' })
  async getSheetPreview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PreviewRequestDto,
  ) {
    const result = await this.service.getSheetPreview(id, dto);
    return { data: result };
  }

  @Patch(':id')
  @Auth({ permissions: [PERMISSIONS.DATA_IMPORTS_WRITE] })
  @ApiOperation({ summary: 'Update import name or parsing configuration' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Import updated' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 404, description: 'Import not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateImportDto,
  ) {
    const updated = await this.service.update(id, dto);
    return { data: updated };
  }

  @Delete(':id')
  @Auth({ permissions: [PERMISSIONS.DATA_IMPORTS_DELETE] })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a data import and all associated resources' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Import deleted' })
  @ApiResponse({ status: 404, description: 'Import not found' })
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    await this.service.delete(id);
  }

  @Get(':id/runs')
  @Auth({ permissions: [PERMISSIONS.DATA_IMPORTS_READ] })
  @ApiOperation({ summary: 'List runs for a specific import' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Paginated list of runs' })
  @ApiResponse({ status: 404, description: 'Import not found' })
  async listRuns(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: RunQueryDto,
  ) {
    const result = await this.service.listRuns(id, query);
    return { data: result };
  }
}
