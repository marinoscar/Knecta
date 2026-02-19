import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';

import { OntologiesService } from './ontologies.service';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PERMISSIONS } from '../common/constants/roles.constants';
import { CreateOntologyDto } from './dto/create-ontology.dto';
import { OntologyQueryDto } from './dto/ontology-query.dto';

@ApiTags('Ontologies')
@Controller('ontologies')
export class OntologiesController {
  constructor(private readonly service: OntologiesService) {}

  @Get()
  @Auth({ permissions: [PERMISSIONS.ONTOLOGIES_READ] })
  @ApiOperation({ summary: 'List ontologies' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['creating', 'ready', 'failed'] })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['name', 'status', 'createdAt', 'updatedAt'] })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiResponse({ status: 200, description: 'Paginated list of ontologies' })
  async list(@Query() query: OntologyQueryDto) {
    return this.service.list(query);
  }

  @Get(':id')
  @Auth({ permissions: [PERMISSIONS.ONTOLOGIES_READ] })
  @ApiOperation({ summary: 'Get ontology by ID' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Ontology found' })
  @ApiResponse({ status: 404, description: 'Ontology not found' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getById(id);
  }

  @Post()
  @Auth({ permissions: [PERMISSIONS.ONTOLOGIES_WRITE] })
  @ApiOperation({ summary: 'Create a new ontology from semantic model' })
  @ApiResponse({ status: 201, description: 'Ontology created' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 404, description: 'Semantic model not found' })
  async create(
    @Body() dto: CreateOntologyDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.create(dto, userId);
  }

  @Delete(':id')
  @Auth({ permissions: [PERMISSIONS.ONTOLOGIES_DELETE] })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an ontology' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Ontology deleted' })
  @ApiResponse({ status: 404, description: 'Ontology not found' })
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.service.delete(id, userId);
  }

  @Get(':id/graph')
  @Auth({ permissions: [PERMISSIONS.ONTOLOGIES_READ] })
  @ApiOperation({ summary: 'Get graph representation for visualization' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Graph data retrieved' })
  @ApiResponse({ status: 404, description: 'Ontology not found' })
  async getGraph(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getGraph(id);
  }

  @Get(':id/rdf')
  @Auth({ permissions: [PERMISSIONS.ONTOLOGIES_READ] })
  @ApiOperation({ summary: 'Export ontology as RDF Turtle' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'RDF Turtle exported' })
  @ApiResponse({ status: 404, description: 'Ontology not found' })
  @ApiResponse({ status: 400, description: 'Ontology not ready for export' })
  async exportRdf(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.exportRdf(id);
  }
}
