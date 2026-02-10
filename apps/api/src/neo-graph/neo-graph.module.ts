import { Module, Global } from '@nestjs/common';
import { NeoGraphService } from './neo-graph.service';
import { NeoVectorService } from './neo-vector.service';

@Global()
@Module({
  providers: [NeoGraphService, NeoVectorService],
  exports: [NeoGraphService, NeoVectorService],
})
export class NeoGraphModule {}
