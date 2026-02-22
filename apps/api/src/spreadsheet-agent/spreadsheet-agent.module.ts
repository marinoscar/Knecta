import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SpreadsheetAgentService } from './spreadsheet-agent.service';
import { SpreadsheetAgentController } from './spreadsheet-agent.controller';
import { SpreadsheetAgentAgentService } from './agent/spreadsheet-agent-agent.service';

@Module({
  imports: [PrismaModule],
  controllers: [SpreadsheetAgentController],
  providers: [SpreadsheetAgentService, SpreadsheetAgentAgentService],
  exports: [SpreadsheetAgentService, SpreadsheetAgentAgentService],
})
export class SpreadsheetAgentModule {}
