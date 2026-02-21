import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LlmModule } from '../llm/llm.module';
import { StorageModule } from '../storage/storage.module';
import { StorageProvidersModule } from '../storage/providers/storage-providers.module';
import { SpreadsheetAgentController } from './spreadsheet-agent.controller';
import { AgentStreamController } from './agent-stream.controller';
import { SpreadsheetAgentService } from './spreadsheet-agent.service';
import { SpreadsheetAgentAgentService } from './agent/agent.service';

@Module({
  imports: [PrismaModule, LlmModule, StorageModule, StorageProvidersModule],
  controllers: [SpreadsheetAgentController, AgentStreamController],
  providers: [SpreadsheetAgentService, SpreadsheetAgentAgentService],
  exports: [SpreadsheetAgentService],
})
export class SpreadsheetAgentModule {}
