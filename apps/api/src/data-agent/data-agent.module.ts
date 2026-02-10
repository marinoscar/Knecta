import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DataAgentController } from './data-agent.controller';
import { DataAgentService } from './data-agent.service';

@Module({
  imports: [PrismaModule],
  controllers: [DataAgentController],
  providers: [DataAgentService],
  exports: [DataAgentService],
})
export class DataAgentModule {}
