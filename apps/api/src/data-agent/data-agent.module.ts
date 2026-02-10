import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LlmModule } from '../llm/llm.module';
import { EmbeddingModule } from '../embedding/embedding.module';
import { NeoGraphModule } from '../neo-graph/neo-graph.module';
import { OntologiesModule } from '../ontologies/ontologies.module';
import { DiscoveryModule } from '../discovery/discovery.module';
import { SandboxModule } from '../sandbox/sandbox.module';
import { DataAgentController } from './data-agent.controller';
import { AgentStreamController } from './agent-stream.controller';
import { DataAgentService } from './data-agent.service';
import { DataAgentAgentService } from './agent/agent.service';

@Module({
  imports: [
    PrismaModule,
    LlmModule,
    EmbeddingModule,
    NeoGraphModule,
    OntologiesModule,
    DiscoveryModule,
    SandboxModule,
  ],
  controllers: [DataAgentController, AgentStreamController],
  providers: [DataAgentService, DataAgentAgentService],
  exports: [DataAgentService, DataAgentAgentService],
})
export class DataAgentModule {}
