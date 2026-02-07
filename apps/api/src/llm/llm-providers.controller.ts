import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import { PERMISSIONS } from '../common/constants/roles.constants';
import { LlmService } from './llm.service';

@ApiTags('LLM')
@Controller('llm')
export class LlmProvidersController {
  constructor(private readonly llmService: LlmService) {}

  @Get('providers')
  @Auth({ permissions: [PERMISSIONS.SEMANTIC_MODELS_READ] })
  @ApiOperation({ summary: 'List enabled LLM providers' })
  async getProviders() {
    const providers = this.llmService.getEnabledProviders();
    return { data: { providers } };
  }
}
