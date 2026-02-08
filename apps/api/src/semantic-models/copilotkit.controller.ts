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
      const { CopilotRuntime, OpenAIAdapter, copilotRuntimeNestEndpoint } = await import('@copilotkit/runtime');

      // Import our custom agent factory
      const { createSemanticModelAgent } = await import('./agent/copilotkit-agent');

      // Create the semantic model agent instance
      const agent = await createSemanticModelAgent();

      // Create runtime with the registered agent
      // The agent ID must be 'default' to match CopilotSidebar frontend configuration
      const runtime = new CopilotRuntime({
        agents: {
          default: agent,
        },
      });

      // Create the service adapter (uses OPENAI_API_KEY env var)
      const serviceAdapter = new OpenAIAdapter();

      // Create the endpoint handler
      const handler = copilotRuntimeNestEndpoint({
        runtime,
        serviceAdapter,
        endpoint: '/api/copilotkit',
      });

      // Fastify consumes the request body stream during parsing.
      // CopilotKit's handler checks req.body on the raw Node.js request to
      // rebuild the payload when the stream is already consumed.
      const rawReq = req.raw as any;
      rawReq.body = req.body;
      const rawRes = res.raw;

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
