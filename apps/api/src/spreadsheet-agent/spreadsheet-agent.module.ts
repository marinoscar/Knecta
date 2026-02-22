import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LlmModule } from '../llm/llm.module';
import { SpreadsheetAgentService } from './spreadsheet-agent.service';
import { SpreadsheetAgentController } from './spreadsheet-agent.controller';
import { SpreadsheetAgentStreamController } from './spreadsheet-agent-stream.controller';
import { SpreadsheetAgentAgentService } from './agent/spreadsheet-agent-agent.service';

@Module({
  imports: [PrismaModule, LlmModule],
  controllers: [SpreadsheetAgentController, SpreadsheetAgentStreamController],
  providers: [SpreadsheetAgentService, SpreadsheetAgentAgentService],
  exports: [SpreadsheetAgentService, SpreadsheetAgentAgentService],
})
export class SpreadsheetAgentModule {}
