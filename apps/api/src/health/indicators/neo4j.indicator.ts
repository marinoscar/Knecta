import { Injectable, Logger } from '@nestjs/common';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { NeoGraphService } from '../../neo-graph/neo-graph.service';

@Injectable()
export class Neo4jHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(Neo4jHealthIndicator.name);

  constructor(private readonly neoGraph: NeoGraphService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const startTime = Date.now();

    try {
      // Verify Neo4j connection
      await this.neoGraph.verifyConnectivity();

      const responseTime = Date.now() - startTime;

      return this.getStatus(key, true, {
        responseTime: `${responseTime}ms`,
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;

      this.logger.error('Neo4j health check failed', error);

      throw new HealthCheckError(
        'Neo4j check failed',
        this.getStatus(key, false, {
          message: error instanceof Error ? error.message : 'Unknown error',
          responseTime: `${responseTime}ms`,
        }),
      );
    }
  }
}
