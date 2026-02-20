import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DataAgentModule } from '../data-agent/data-agent.module';
import { OntologiesModule } from '../ontologies/ontologies.module';
import { SettingsModule } from '../settings/settings.module';
import { PrismaModule } from '../prisma/prisma.module';
import { McpController } from './mcp.controller';
import { McpServerService } from './mcp-server.service';
import { McpAuthGuard } from './mcp-auth.guard';

@Module({
  imports: [
    AuthModule,
    DataAgentModule,
    OntologiesModule,
    SettingsModule,
    PrismaModule,
  ],
  controllers: [McpController],
  providers: [McpServerService, McpAuthGuard],
})
export class McpModule {}
