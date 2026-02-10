import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OntologiesController } from './ontologies.controller';
import { OntologiesService } from './ontologies.service';
import { NeoOntologyService } from './neo-ontology.service';

@Module({
  imports: [PrismaModule],
  controllers: [OntologiesController],
  providers: [OntologiesService, NeoOntologyService],
  exports: [OntologiesService, NeoOntologyService],
})
export class OntologiesModule {}
