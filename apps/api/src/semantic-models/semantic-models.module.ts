import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SemanticModelsController } from './semantic-models.controller';
import { SemanticModelsService } from './semantic-models.service';

@Module({
  imports: [PrismaModule],
  controllers: [SemanticModelsController],
  providers: [SemanticModelsService],
  exports: [SemanticModelsService],
})
export class SemanticModelsModule {}
