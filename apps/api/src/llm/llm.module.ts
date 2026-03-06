import { Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { LlmProviderService } from './llm-provider.service';
import { LlmProvidersController } from './llm-providers.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [LlmProvidersController],
  providers: [LlmService, LlmProviderService],
  exports: [LlmService, LlmProviderService],
})
export class LlmModule {}
