import { Module, Global } from '@nestjs/common';
import { NeoGraphService } from './neo-graph.service';

@Global()
@Module({
  providers: [NeoGraphService],
  exports: [NeoGraphService],
})
export class NeoGraphModule {}
