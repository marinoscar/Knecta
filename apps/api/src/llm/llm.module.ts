import { Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { LlmProvidersController } from './llm-providers.controller';

@Module({
  controllers: [LlmProvidersController],
  providers: [LlmService],
  exports: [LlmService],
})
export class LlmModule {}
