import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DiscoveryModule } from '../discovery/discovery.module';
import { LlmModule } from '../llm/llm.module';
import { SemanticModelsController } from './semantic-models.controller';
import { AgentStreamController } from './agent-stream.controller';
import { SemanticModelsService } from './semantic-models.service';
import { AgentService } from './agent/agent.service';
import { OsiSpecService } from './agent/osi';

@Module({
  imports: [PrismaModule, DiscoveryModule, LlmModule],
  controllers: [SemanticModelsController, AgentStreamController],
  providers: [SemanticModelsService, AgentService, OsiSpecService],
  exports: [SemanticModelsService, AgentService],
})
export class SemanticModelsModule {}
