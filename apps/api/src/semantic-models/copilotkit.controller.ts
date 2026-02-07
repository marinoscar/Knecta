import { Controller, Post, Req, Res, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import { FastifyRequest, FastifyReply } from 'fastify';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PERMISSIONS } from '../common/constants/roles.constants';
import { AgentService } from './agent/agent.service';

/**
 * CopilotKit runtime endpoint for semantic model agent
 *
 * This controller provides the CopilotKit runtime endpoint for the semantic model generation agent.
 * It handles AG-UI protocol communication (Server-Sent Events) between the frontend and the LangGraph agent.
 */
@ApiTags('CopilotKit')
@Controller('copilotkit')
export class CopilotKitController {
  private readonly logger = new Logger(CopilotKitController.name);

  constructor(private readonly agentService: AgentService) {}

  /**
   * CopilotKit runtime endpoint
   *
   * This endpoint handles the AG-UI protocol for real-time agent communication.
   * It creates a CopilotRuntime instance and registers the semantic model agent.
   *
   * Note: This endpoint uses SSE (Server-Sent Events) and bypasses the standard
   * NestJS response transformation interceptor by using @Res() decorator.
   */
  @Post()
  @Auth({ permissions: [PERMISSIONS.SEMANTIC_MODELS_GENERATE] })
  @ApiExcludeEndpoint() // Exclude from Swagger since it uses SSE protocol
  async handleCopilotRequest(
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
    @CurrentUser('id') userId: string,
  ) {
    this.logger.log(`CopilotKit request from user ${userId}`);

    try {
      // Dynamically import CopilotKit runtime to handle ESM/CJS compatibility
      const { CopilotRuntime, copilotRuntimeNestEndpoint } = await import('@copilotkit/runtime');
      const { LangGraphAgent } = await import('@copilotkit/runtime/langgraph');

      // TODO: Get connection and model generation parameters from request
      // For now, we create a stub runtime without the agent
      // In a full implementation, we would:
      // 1. Extract connectionId, databaseName, schemas, tables from request properties
      // 2. Call agentService.createAgentGraph() to get the compiled graph
      // 3. Create a LangGraphAgent wrapping the compiled graph
      // 4. Register the agent with the runtime

      const runtime = new CopilotRuntime({
        // agents: {
        //   semantic_model_agent: langGraphAgent,
        // },
      });

      // Create the endpoint handler
      const handler = copilotRuntimeNestEndpoint({
        runtime,
        endpoint: '/api/copilotkit',
      });

      // Fastify uses raw Node.js request/response objects
      // CopilotKit expects standard Node.js http.IncomingMessage and http.ServerResponse
      const rawReq = req.raw;
      const rawRes = res.raw;

      // Call the handler with raw Node.js objects
      await handler(rawReq, rawRes);
    } catch (error) {
      this.logger.error('CopilotKit request failed', error);

      // Only send error response if response hasn't been sent yet
      if (!res.sent) {
        res.status(500).send({
          code: 'COPILOTKIT_RUNTIME_ERROR',
          message: 'Failed to process CopilotKit request',
        });
      }
    }
  }
}
