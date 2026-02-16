import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';

import { DiscoveryService } from './discovery.service';
import { Auth } from '../auth/decorators/auth.decorator';
import { PERMISSIONS } from '../common/constants/roles.constants';

@ApiTags('Discovery')
@Controller('connections')
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Get(':id/databases')
  @Auth({ permissions: [PERMISSIONS.CONNECTIONS_READ] })
  @ApiOperation({ summary: 'List databases on a connection' })
  @ApiParam({ name: 'id', type: String, format: 'uuid', description: 'Connection ID' })
  @ApiResponse({ status: 200, description: 'List of databases' })
  @ApiResponse({ status: 404, description: 'Connection not found' })
  @ApiResponse({ status: 400, description: 'Schema discovery not supported for this database type' })
  async listDatabases(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.discoveryService.listDatabases(id);
  }

  @Get(':id/databases/:database/schemas')
  @Auth({ permissions: [PERMISSIONS.CONNECTIONS_READ] })
  @ApiOperation({ summary: 'List schemas in a database' })
  @ApiParam({ name: 'id', type: String, format: 'uuid', description: 'Connection ID' })
  @ApiParam({ name: 'database', type: String, description: 'Database name' })
  @ApiResponse({ status: 200, description: 'List of schemas' })
  @ApiResponse({ status: 404, description: 'Connection not found' })
  @ApiResponse({ status: 400, description: 'Schema discovery not supported for this database type' })
  async listSchemas(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('database') database: string,
  ) {
    return this.discoveryService.listSchemas(id, database);
  }

  @Get(':id/databases/:database/schemas/:schema/tables')
  @Auth({ permissions: [PERMISSIONS.CONNECTIONS_READ] })
  @ApiOperation({ summary: 'List tables in a schema' })
  @ApiParam({ name: 'id', type: String, format: 'uuid', description: 'Connection ID' })
  @ApiParam({ name: 'database', type: String, description: 'Database name' })
  @ApiParam({ name: 'schema', type: String, description: 'Schema name' })
  @ApiResponse({ status: 200, description: 'List of tables' })
  @ApiResponse({ status: 404, description: 'Connection not found' })
  @ApiResponse({ status: 400, description: 'Schema discovery not supported for this database type' })
  async listTables(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('database') database: string,
    @Param('schema') schema: string,
  ) {
    return this.discoveryService.listTables(id, database, schema);
  }

  @Get(':id/databases/:database/schemas/:schema/tables/:table/columns')
  @Auth({ permissions: [PERMISSIONS.CONNECTIONS_READ] })
  @ApiOperation({ summary: 'List columns for a table' })
  @ApiParam({ name: 'id', type: String, format: 'uuid', description: 'Connection ID' })
  @ApiParam({ name: 'database', type: String, description: 'Database name' })
  @ApiParam({ name: 'schema', type: String, description: 'Schema name' })
  @ApiParam({ name: 'table', type: String, description: 'Table name' })
  @ApiResponse({ status: 200, description: 'List of columns with metadata' })
  @ApiResponse({ status: 404, description: 'Connection not found' })
  @ApiResponse({ status: 400, description: 'Schema discovery not supported for this database type' })
  async listColumns(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('database') database: string,
    @Param('schema') schema: string,
    @Param('table') table: string,
  ) {
    return this.discoveryService.listColumns(id, database, schema, table);
  }
}
