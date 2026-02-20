import {
  Controller,
  Post,
  Get,
  Delete,
  Req,
  Res,
  UseGuards,
  Logger,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';
import { FastifyRequest, FastifyReply } from 'fastify';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpAuthGuard } from './mcp-auth.guard';
import { McpServerService } from './mcp-server.service';

/**
 * MCP Controller
 *
 * Implements the Streamable HTTP transport for the Model Context Protocol.
 * Handles POST, GET, and DELETE requests for MCP session management.
 */
@ApiTags('MCP')
@Controller('data-agent/mcp')
@UseGuards(McpAuthGuard)
export class McpController {
  private readonly logger = new Logger(McpController.name);

  // Session store: sessionId → { transport, server, userId }
  private sessions = new Map<
    string,
    { transport: StreamableHTTPServerTransport; server: any; userId: string }
  >();

  constructor(private readonly mcpServerService: McpServerService) {}

  @Post()
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async handlePost(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    // CRITICAL: Hijack the response to prevent Fastify from closing it
    res.hijack();

    const user = (req as any).mcpUser;
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // Check if this is an existing session
    if (sessionId && this.sessions.has(sessionId)) {
      const session = this.sessions.get(sessionId)!;
      // Forward request to existing transport
      try {
        await session.transport.handleRequest(req.raw, res.raw, req.body);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`MCP session ${sessionId} error: ${errorMessage}`);
        if (!res.raw.writableEnded) {
          res.raw.writeHead(500, { 'Content-Type': 'application/json' });
          res.raw.end(JSON.stringify({ error: errorMessage }));
        }
      }
      return;
    }

    // New session — create transport and server
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });

    // Extract user permissions
    const permissions = this.extractPermissions(user);
    const clientName = 'MCP Client'; // Could be extracted from headers if provided

    const server = this.mcpServerService.createServerForUser(
      user.id,
      permissions,
      clientName,
    );

    // Connect server to transport
    await server.connect(transport);

    // Store session when initialized
    (transport as any).onSessionInitialized = (sid: string) => {
      this.sessions.set(sid, { transport, server, userId: user.id });
      this.logger.log(`MCP session ${sid} created for user ${user.id}`);
    };

    // Clean up on close
    (transport as any).onClose = () => {
      const sid = (transport as any).sessionId;
      if (sid) {
        this.sessions.delete(sid);
        this.logger.log(`MCP session ${sid} closed`);
      }
    };

    // Handle the request
    try {
      await transport.handleRequest(req.raw, res.raw, req.body);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`MCP request error: ${errorMessage}`);
      if (!res.raw.writableEnded) {
        res.raw.writeHead(500, { 'Content-Type': 'application/json' });
        res.raw.end(JSON.stringify({ error: errorMessage }));
      }
    }
  }

  @Get()
  @ApiExcludeEndpoint()
  async handleGet(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    res.hijack();

    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !this.sessions.has(sessionId)) {
      res.raw.writeHead(400, { 'Content-Type': 'application/json' });
      res.raw.end(JSON.stringify({ error: 'Invalid or missing session ID' }));
      return;
    }

    const session = this.sessions.get(sessionId)!;
    try {
      await session.transport.handleRequest(req.raw, res.raw);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`MCP GET error for session ${sessionId}: ${errorMessage}`);
      if (!res.raw.writableEnded) {
        res.raw.writeHead(500, { 'Content-Type': 'application/json' });
        res.raw.end(JSON.stringify({ error: errorMessage }));
      }
    }
  }

  @Delete()
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async handleDelete(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    res.hijack();

    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId && this.sessions.has(sessionId)) {
      const session = this.sessions.get(sessionId)!;
      try {
        await session.transport.close();
      } catch (error) {
        this.logger.warn(
          `Error closing transport for session ${sessionId}:`,
          error,
        );
      }
      this.sessions.delete(sessionId);
      this.logger.log(`MCP session ${sessionId} terminated by client`);
    }

    res.raw.writeHead(200, { 'Content-Type': 'application/json' });
    res.raw.end(JSON.stringify({ ok: true }));
  }

  /**
   * Extract flat permission list from user's roles
   */
  private extractPermissions(user: any): string[] {
    const permissions: string[] = [];
    if (user.userRoles) {
      for (const ur of user.userRoles) {
        if (ur.role?.rolePermissions) {
          for (const rp of ur.role.rolePermissions) {
            if (rp.permission?.name) {
              permissions.push(rp.permission.name);
            }
          }
        }
      }
    }
    return [...new Set(permissions)];
  }
}
