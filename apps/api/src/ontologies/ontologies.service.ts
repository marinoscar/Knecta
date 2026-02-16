import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NeoOntologyService } from './neo-ontology.service';
import { CreateOntologyDto } from './dto/create-ontology.dto';
import { OntologyQueryDto } from './dto/ontology-query.dto';

@Injectable()
export class OntologiesService {
  private readonly logger = new Logger(OntologiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly neoOntologyService: NeoOntologyService,
  ) {}

  /**
   * List ontologies with pagination and filtering
   */
  async list(query: OntologyQueryDto) {
    const { page, pageSize, search, status, sortBy, sortOrder } = query;
    const skip = (page - 1) * pageSize;

    // Build where clause
    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status) {
      where.status = status;
    }

    // Execute query
    const [items, total] = await Promise.all([
      this.prisma.ontology.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { [sortBy]: sortOrder },
        include: {
          semanticModel: {
            select: {
              name: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.ontology.count({ where }),
    ]);

    return {
      items: items.map((ontology) => this.mapOntology(ontology)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Get ontology by ID
   */
  async getById(id: string) {
    const ontology = await this.prisma.ontology.findUnique({
      where: { id },
      include: {
        semanticModel: {
          select: {
            name: true,
            status: true,
          },
        },
      },
    });

    if (!ontology) {
      throw new NotFoundException(`Ontology with ID ${id} not found`);
    }

    return this.mapOntology(ontology);
  }

  /**
   * Create a new ontology from semantic model
   */
  async create(dto: CreateOntologyDto, userId: string) {
    // Find the semantic model by ID and verify it exists
    const semanticModel = await this.prisma.semanticModel.findUnique({
      where: { id: dto.semanticModelId },
    });

    if (!semanticModel) {
      throw new NotFoundException(
        `Semantic model with ID ${dto.semanticModelId} not found`,
      );
    }

    // Verify it has status 'ready'
    if (semanticModel.status !== 'ready') {
      throw new BadRequestException('Semantic model must be in ready status');
    }

    // Verify it has model data
    if (!semanticModel.model) {
      throw new BadRequestException('Semantic model has no data');
    }

    // Create PG record with status 'creating'
    let ontology = await this.prisma.ontology.create({
      data: {
        name: dto.name,
        description: dto.description,
        semanticModelId: dto.semanticModelId,
        createdByUserId: userId,
        status: 'creating',
      },
      include: {
        semanticModel: {
          select: {
            name: true,
            status: true,
          },
        },
      },
    });

    try {
      // Create graph in Neo4j
      const { nodeCount, relationshipCount } =
        await this.neoOntologyService.createGraph(
          ontology.id,
          semanticModel.model,
        );

      // Update PG record with success
      ontology = await this.prisma.ontology.update({
        where: { id: ontology.id },
        data: {
          status: 'ready',
          nodeCount,
          relationshipCount,
        },
        include: {
          semanticModel: {
            select: {
              name: true,
              status: true,
            },
          },
        },
      });

      this.logger.log(
        `Ontology ${ontology.name} created successfully by user ${userId}`,
      );
    } catch (error) {
      // Update PG record with failure
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      ontology = await this.prisma.ontology.update({
        where: { id: ontology.id },
        data: {
          status: 'failed',
          errorMessage,
        },
        include: {
          semanticModel: {
            select: {
              name: true,
              status: true,
            },
          },
        },
      });

      this.logger.error(
        `Failed to create ontology graph for ${ontology.name}`,
        error,
      );
    }

    // Create audit event
    await this.createAuditEvent(
      userId,
      'ontology.created',
      'ontology',
      ontology.id,
      {
        name: ontology.name,
        semanticModelId: dto.semanticModelId,
        status: ontology.status,
      },
    );

    return this.mapOntology(ontology);
  }

  /**
   * Delete ontology (from both PostgreSQL and Neo4j)
   */
  async delete(id: string, userId: string) {
    // Verify ontology exists
    const ontology = await this.prisma.ontology.findUnique({
      where: { id },
    });

    if (!ontology) {
      throw new NotFoundException(`Ontology with ID ${id} not found`);
    }

    // Try to delete from Neo4j (log warning if it fails, but still delete PG record)
    try {
      await this.neoOntologyService.deleteGraph(id);
    } catch (error) {
      this.logger.warn(
        `Failed to delete Neo4j graph for ontology ${id}, continuing with PG deletion`,
        error,
      );
    }

    // Delete PG record
    await this.prisma.ontology.delete({
      where: { id },
    });

    // Create audit event
    await this.createAuditEvent(userId, 'ontology.deleted', 'ontology', id, {
      name: ontology.name,
    });

    this.logger.log(`Ontology ${ontology.name} deleted by user ${userId}`);
  }

  /**
   * Get graph representation for visualization
   */
  async getGraph(id: string) {
    // Verify ontology exists
    const ontology = await this.prisma.ontology.findUnique({
      where: { id },
    });

    if (!ontology) {
      throw new NotFoundException(`Ontology with ID ${id} not found`);
    }

    // Verify status is 'ready'
    if (ontology.status !== 'ready') {
      throw new BadRequestException('Ontology graph is not ready');
    }

    // Get graph from Neo4j
    return this.neoOntologyService.getGraph(id);
  }

  /**
   * Map Prisma ontology to API response
   */
  private mapOntology(ontology: any) {
    return {
      id: ontology.id,
      name: ontology.name,
      description: ontology.description,
      semanticModelId: ontology.semanticModelId,
      semanticModel: ontology.semanticModel
        ? {
            name: ontology.semanticModel.name,
            status: ontology.semanticModel.status,
          }
        : null,
      status: ontology.status,
      nodeCount: ontology.nodeCount,
      relationshipCount: ontology.relationshipCount,
      errorMessage: ontology.errorMessage,
      createdByUserId: ontology.createdByUserId,
      createdAt: ontology.createdAt,
      updatedAt: ontology.updatedAt,
    };
  }

  /**
   * Create audit event
   */
  private async createAuditEvent(
    actorUserId: string,
    action: string,
    targetType: string,
    targetId: string,
    meta: Record<string, unknown>,
  ) {
    await this.prisma.auditEvent.create({
      data: {
        actorUserId,
        action,
        targetType,
        targetId,
        meta: meta as any,
      },
    });
  }
}
