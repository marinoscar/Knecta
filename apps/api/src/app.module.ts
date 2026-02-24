import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';

import { PrismaModule } from './prisma/prisma.module';
import { NeoGraphModule } from './neo-graph/neo-graph.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SettingsModule } from './settings/settings.module';
import { HealthModule } from './health/health.module';
import { AllowlistModule } from './allowlist/allowlist.module';
import { DeviceAuthModule } from './device-auth/device-auth.module';
import { StorageModule } from './storage/storage.module';
import { ConnectionsModule } from './connections/connections.module';
import { DiscoveryModule } from './discovery/discovery.module';
import { LlmModule } from './llm/llm.module';
import { EmbeddingModule } from './embedding/embedding.module';
import { SandboxModule } from './sandbox/sandbox.module';
import { LoggerModule } from './common/logger/logger.module';
import { TestAuthModule } from './test-auth/test-auth.module';
import { SemanticModelsModule } from './semantic-models/semantic-models.module';
import { OntologiesModule } from './ontologies/ontologies.module';
import { DataAgentModule } from './data-agent/data-agent.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OAuthModule } from './oauth/oauth.module';
import { McpModule } from './mcp/mcp.module';
import { SpreadsheetAgentModule } from './spreadsheet-agent/spreadsheet-agent.module';
import { DataImportsModule } from './data-imports/data-imports.module';

import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';

import configuration from './config/configuration';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),

    // Scheduling (must be at root level for NestJS 11)
    ScheduleModule.forRoot(),

    // Event emitter for async events
    EventEmitterModule.forRoot(),

    // Database
    PrismaModule,
    NeoGraphModule,

    // Logger
    LoggerModule,

    // Feature modules
    CommonModule,
    AuthModule,
    UsersModule,
    SettingsModule,
    HealthModule,
    AllowlistModule,
    DeviceAuthModule,
    StorageModule,
    ConnectionsModule,
    DiscoveryModule,
    LlmModule,
    EmbeddingModule,
    SandboxModule,
    SemanticModelsModule,
    OntologiesModule,
    DataAgentModule,
    NotificationsModule,
    OAuthModule,
    McpModule,
    SpreadsheetAgentModule,
    DataImportsModule,

    // Test modules (non-production only)
    ...(process.env.NODE_ENV !== 'production' ? [TestAuthModule] : []),
  ],
  providers: [
    // Global validation pipe (Zod)
    {
      provide: APP_PIPE,
      useClass: ZodValidationPipe,
    },
    // Global exception filter
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    // Global logging interceptor
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    // Global response transform interceptor
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes('*');
  }
}
