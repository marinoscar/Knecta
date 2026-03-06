import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PERMISSIONS } from '../common/constants/roles.constants';
import { LlmProviderService } from './llm-provider.service';
import { LlmService } from './llm.service';
import { CreateLlmProviderDto } from './dto/create-llm-provider.dto';
import { UpdateLlmProviderDto } from './dto/update-llm-provider.dto';

@ApiTags('LLM Providers')
@Controller('llm/providers')
export class LlmProvidersController {
  constructor(
    private readonly llmProviderService: LlmProviderService,
    private readonly llmService: LlmService,
  ) {}

  @Get()
  @Auth({ permissions: [PERMISSIONS.LLM_PROVIDERS_READ] })
  @ApiOperation({ summary: 'List LLM providers' })
  @ApiResponse({ status: 200, description: 'List of LLM providers' })
  async list() {
    const providers = await this.llmProviderService.getEnabledProviders();
    return { data: { providers } };
  }

  @Post()
  @Auth({ permissions: [PERMISSIONS.LLM_PROVIDERS_WRITE] })
  @ApiOperation({ summary: 'Create LLM provider' })
  @ApiResponse({ status: 201, description: 'Provider created' })
  @ApiResponse({ status: 400, description: 'Invalid configuration' })
  @ApiResponse({ status: 409, description: 'Provider type already exists' })
  async create(
    @Body() dto: CreateLlmProviderDto,
    @CurrentUser('id') userId: string,
  ) {
    const provider = await this.llmProviderService.create(dto, userId);
    return { data: provider };
  }

  @Get(':id')
  @Auth({ permissions: [PERMISSIONS.LLM_PROVIDERS_WRITE] })
  @ApiOperation({ summary: 'Get LLM provider details (admin)' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Provider found' })
  @ApiResponse({ status: 404, description: 'Provider not found' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    const provider = await this.llmProviderService.getById(id);
    return { data: provider };
  }

  @Patch(':id')
  @Auth({ permissions: [PERMISSIONS.LLM_PROVIDERS_WRITE] })
  @ApiOperation({ summary: 'Update LLM provider' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Provider updated' })
  @ApiResponse({ status: 404, description: 'Provider not found' })
  @ApiResponse({ status: 400, description: 'Invalid configuration' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLlmProviderDto,
    @CurrentUser('id') userId: string,
  ) {
    const provider = await this.llmProviderService.update(id, dto, userId);
    return { data: provider };
  }

  @Delete(':id')
  @Auth({ permissions: [PERMISSIONS.LLM_PROVIDERS_DELETE] })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete LLM provider' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Provider deleted' })
  @ApiResponse({ status: 404, description: 'Provider not found' })
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.llmProviderService.delete(id, userId);
  }

  @Post(':id/test')
  @Auth({ permissions: [PERMISSIONS.LLM_PROVIDERS_WRITE] })
  @ApiOperation({ summary: 'Test LLM provider connection' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Test result' })
  @ApiResponse({ status: 404, description: 'Provider not found' })
  async test(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') _userId: string,
  ) {
    // Retrieve the decrypted config without persisting a test result yet
    const { type, config } = await this.llmProviderService.testProvider(id, {
      success: false,
      message: 'Test in progress',
    });

    try {
      // Use LlmService to create a model from the raw decrypted config
      const model = this.llmService.getChatModelFromConfig(type, config);
      await model.invoke('Say "hello" in one word.');

      // Persist the successful result
      await this.llmProviderService.testProvider(id, {
        success: true,
        message: 'Connection successful',
      });

      return {
        data: { success: true, message: 'Connection successful' },
      };
    } catch (error: any) {
      const message =
        error.message?.substring(0, 500) || 'Connection failed';

      // Persist the failure result
      await this.llmProviderService.testProvider(id, {
        success: false,
        message,
      });

      return {
        data: { success: false, message },
      };
    }
  }
}
