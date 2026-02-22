import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SpreadsheetAgentService } from './spreadsheet-agent.service';

@ApiTags('Spreadsheet Agent')
@Controller('spreadsheet-agent')
export class SpreadsheetAgentController {
  constructor(private readonly service: SpreadsheetAgentService) {}
}
