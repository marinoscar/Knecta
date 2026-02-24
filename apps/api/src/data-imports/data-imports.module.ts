import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageProvidersModule } from '../storage/providers/storage-providers.module';
import { DataImportsService } from './data-imports.service';
import { DataImportsController } from './data-imports.controller';
import { DataImportsStreamController } from './data-imports-stream.controller';
import { DataImportsParser } from './data-imports.parser';

@Module({
  imports: [PrismaModule, StorageProvidersModule],
  controllers: [DataImportsController, DataImportsStreamController],
  providers: [DataImportsService, DataImportsParser],
  exports: [DataImportsService],
})
export class DataImportsModule {}
