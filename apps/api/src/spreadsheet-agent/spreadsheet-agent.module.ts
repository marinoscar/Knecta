import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SpreadsheetAgentService } from './spreadsheet-agent.service';
import { SpreadsheetAgentController } from './spreadsheet-agent.controller';

@Module({
  imports: [PrismaModule],
  controllers: [SpreadsheetAgentController],
  providers: [SpreadsheetAgentService],
  exports: [SpreadsheetAgentService],
})
export class SpreadsheetAgentModule {}
