import {
  Controller,
  Get,
  Post,
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

import { SpreadsheetAgentService } from './spreadsheet-agent.service';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PERMISSIONS } from '../common/constants/roles.constants';
import { CreateSpreadsheetRunDto } from './dto/create-run.dto';
import { RunQueryDto } from './dto/run-query.dto';

@ApiTags('Spreadsheet Agent')
@Controller('spreadsheet-agent')
export class SpreadsheetAgentController {
  constructor(private readonly service: SpreadsheetAgentService) {}

  @Post('runs')
  @Auth({ permissions: [PERMISSIONS.SPREADSHEET_AGENT_WRITE] })
  @ApiOperation({ summary: 'Create a new spreadsheet processing run' })
  @ApiResponse({ status: 201, description: 'Run created' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  async createRun(
    @Body() dto: CreateSpreadsheetRunDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.createRun(dto, userId);
  }

  @Get('runs')
  @Auth({ permissions: [PERMISSIONS.SPREADSHEET_AGENT_READ] })
  @ApiOperation({ summary: 'List spreadsheet processing runs' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'executing', 'completed', 'failed', 'cancelled'] })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['name', 'status', 'createdAt', 'updatedAt'] })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiResponse({ status: 200, description: 'Paginated list of runs' })
  async listRuns(@Query() query: RunQueryDto) {
    return this.service.listRuns(query);
  }

  @Get('runs/:runId')
  @Auth({ permissions: [PERMISSIONS.SPREADSHEET_AGENT_READ] })
  @ApiOperation({ summary: 'Get spreadsheet run by ID' })
  @ApiParam({ name: 'runId', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Run found' })
  @ApiResponse({ status: 404, description: 'Run not found' })
  async getRun(@Param('runId', ParseUUIDPipe) runId: string) {
    return this.service.getRun(runId);
  }

  @Get('runs/:runId/tables')
  @Auth({ permissions: [PERMISSIONS.SPREADSHEET_AGENT_READ] })
  @ApiOperation({ summary: 'Get tables extracted from a spreadsheet run' })
  @ApiParam({ name: 'runId', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Tables returned' })
  @ApiResponse({ status: 404, description: 'Run not found' })
  async getRunTables(@Param('runId', ParseUUIDPipe) runId: string) {
    const tables = await this.service.getRunTables(runId);
    return { data: tables };
  }

  @Post('runs/:runId/cancel')
  @Auth({ permissions: [PERMISSIONS.SPREADSHEET_AGENT_WRITE] })
  @ApiOperation({ summary: 'Cancel a spreadsheet run' })
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

  @Delete('runs/:runId')
  @Auth({ permissions: [PERMISSIONS.SPREADSHEET_AGENT_DELETE] })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a failed or cancelled run' })
  @ApiParam({ name: 'runId', type: String, format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Run deleted' })
  @ApiResponse({ status: 404, description: 'Run not found' })
  @ApiResponse({ status: 400, description: 'Only failed or cancelled runs can be deleted' })
  async deleteRun(
    @Param('runId', ParseUUIDPipe) runId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.service.deleteRun(runId, userId);
  }
}
