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

import { SemanticModelsService } from './semantic-models.service';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PERMISSIONS } from '../common/constants/roles.constants';
import { ModelQueryDto } from './dto/model-query.dto';
import { UpdateModelDto } from './dto/update-model.dto';
import { CreateRunDto } from './dto/create-run.dto';

@ApiTags('Semantic Models')
@Controller('semantic-models')
export class SemanticModelsController {
  constructor(private readonly service: SemanticModelsService) {}

  @Get()
  @Auth({ permissions: [PERMISSIONS.SEMANTIC_MODELS_READ] })
  @ApiOperation({ summary: 'List semantic models' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['draft', 'generating', 'ready', 'failed'] })
  @ApiQuery({ name: 'connectionId', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['name', 'status', 'createdAt', 'updatedAt'] })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiResponse({ status: 200, description: 'Paginated list of semantic models' })
  async list(
    @Query() query: ModelQueryDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.list(query, userId);
  }

  @Post('runs')
  @Auth({ permissions: [PERMISSIONS.SEMANTIC_MODELS_GENERATE] })
  @ApiOperation({ summary: 'Create a new semantic model run' })
  @ApiResponse({ status: 201, description: 'Run created' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  async createRun(
    @Body() dto: CreateRunDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.createRun(dto, userId);
  }

  @Get('runs/:runId')
  @Auth({ permissions: [PERMISSIONS.SEMANTIC_MODELS_READ] })
  @ApiOperation({ summary: 'Get semantic model run by ID' })
  @ApiParam({ name: 'runId', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Run found' })
  @ApiResponse({ status: 404, description: 'Run not found' })
  async getRun(
    @Param('runId', ParseUUIDPipe) runId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.getRun(runId, userId);
  }

  @Post('runs/:runId/cancel')
  @Auth({ permissions: [PERMISSIONS.SEMANTIC_MODELS_GENERATE] })
  @ApiOperation({ summary: 'Cancel a semantic model run' })
  @ApiParam({ name: 'runId', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Run cancelled' })
  @ApiResponse({ status: 404, description: 'Run not found' })
  @ApiResponse({ status: 400, description: 'Run cannot be cancelled' })
  async cancelRun(
    @Param('runId', ParseUUIDPipe) runId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.cancelRun(runId, userId);
  }

  @Get('runs')
  @Auth({ permissions: [PERMISSIONS.SEMANTIC_MODELS_READ] })
  @ApiOperation({ summary: 'List all runs for current user' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Paginated list of runs' })
  async listAllRuns(
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
  ) {
    return this.service.listAllRuns(userId, {
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      status,
    });
  }

  @Delete('runs/:runId')
  @Auth({ permissions: [PERMISSIONS.SEMANTIC_MODELS_DELETE] })
  @ApiOperation({ summary: 'Delete a failed or cancelled run' })
  @ApiParam({ name: 'runId', type: String, format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Run deleted' })
  @ApiResponse({ status: 404, description: 'Run not found' })
  @ApiResponse({ status: 400, description: 'Only failed or cancelled runs can be deleted' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRun(
    @Param('runId', ParseUUIDPipe) runId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.service.deleteRun(runId, userId);
  }

  @Get(':id')
  @Auth({ permissions: [PERMISSIONS.SEMANTIC_MODELS_READ] })
  @ApiOperation({ summary: 'Get semantic model by ID' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Model found' })
  @ApiResponse({ status: 404, description: 'Model not found' })
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.getById(id, userId);
  }

  @Patch(':id')
  @Auth({ permissions: [PERMISSIONS.SEMANTIC_MODELS_WRITE] })
  @ApiOperation({ summary: 'Update a semantic model' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Model updated' })
  @ApiResponse({ status: 404, description: 'Model not found' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateModelDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.update(id, dto, userId);
  }

  @Delete(':id')
  @Auth({ permissions: [PERMISSIONS.SEMANTIC_MODELS_DELETE] })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a semantic model' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Model deleted' })
  @ApiResponse({ status: 404, description: 'Model not found' })
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.service.delete(id, userId);
  }

  @Get(':id/yaml')
  @Auth({ permissions: [PERMISSIONS.SEMANTIC_MODELS_READ] })
  @ApiOperation({ summary: 'Export semantic model as YAML' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'YAML exported' })
  @ApiResponse({ status: 404, description: 'Model not found' })
  @ApiResponse({ status: 400, description: 'No model data to export' })
  async exportYaml(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.exportYaml(id, userId);
  }

  @Get(':id/runs')
  @Auth({ permissions: [PERMISSIONS.SEMANTIC_MODELS_READ] })
  @ApiOperation({ summary: 'List runs for a semantic model' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'List of runs' })
  @ApiResponse({ status: 404, description: 'Model not found' })
  async listRuns(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.listRuns(id, userId);
  }
}
