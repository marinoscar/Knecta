import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DataAgentController } from './data-agent.controller';
import { AgentStreamController } from './agent-stream.controller';
import { DataAgentService } from './data-agent.service';
import { DataAgentAgentService } from './agent/agent.service';

@Module({
  imports: [PrismaModule],
  controllers: [DataAgentController, AgentStreamController],
  providers: [DataAgentService, DataAgentAgentService],
  exports: [DataAgentService, DataAgentAgentService],
})
export class DataAgentModule {}
