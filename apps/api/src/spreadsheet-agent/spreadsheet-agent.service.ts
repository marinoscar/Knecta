import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SpreadsheetAgentService {
  private readonly logger = new Logger(SpreadsheetAgentService.name);

  constructor(private readonly prisma: PrismaService) {}
}
