import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

@ApiTags('OAuth 2.1 Discovery')
@Controller('oauth/.well-known')
export class WellKnownController {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Protected Resource Metadata (RFC 9728)
   * Returns metadata about the protected MCP resource
   */
  @Get('protected-resource')
  @ApiOperation({ summary: 'OAuth Protected Resource Metadata (RFC 9728)' })
  @ApiResponse({
    status: 200,
    description: 'Protected resource metadata',
    schema: {
      type: 'object',
      properties: {
        resource: { type: 'string', format: 'uri' },
        authorization_servers: { type: 'array', items: { type: 'string' } },
        scopes_supported: { type: 'array', items: { type: 'string' } },
        bearer_methods_supported: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  async getProtectedResourceMetadata() {
    const appUrl = this.configService.get<string>('appUrl');

    return {
      resource: `${appUrl}/api/data-agent/mcp`,
      authorization_servers: [appUrl],
      scopes_supported: [
        'data_agent:read',
        'data_agent:write',
        'ontologies:read',
      ],
      bearer_methods_supported: ['header'],
    };
  }

  /**
   * Authorization Server Metadata (RFC 8414)
   * Returns OAuth 2.1 AS metadata for client discovery
   */
  @Get('authorization-server')
  @ApiOperation({ summary: 'OAuth 2.1 Authorization Server Metadata (RFC 8414)' })
  @ApiResponse({
    status: 200,
    description: 'Authorization server metadata',
    schema: {
      type: 'object',
      properties: {
        issuer: { type: 'string', format: 'uri' },
        authorization_endpoint: { type: 'string', format: 'uri' },
        token_endpoint: { type: 'string', format: 'uri' },
        response_types_supported: { type: 'array', items: { type: 'string' } },
        grant_types_supported: { type: 'array', items: { type: 'string' } },
        code_challenge_methods_supported: {
          type: 'array',
          items: { type: 'string' },
        },
        scopes_supported: { type: 'array', items: { type: 'string' } },
        token_endpoint_auth_methods_supported: {
          type: 'array',
          items: { type: 'string' },
        },
        client_id_metadata_document_supported: { type: 'boolean' },
      },
    },
  })
  async getAuthorizationServerMetadata() {
    const appUrl = this.configService.get<string>('appUrl');

    return {
      issuer: appUrl,
      authorization_endpoint: `${appUrl}/api/oauth/authorize`,
      token_endpoint: `${appUrl}/api/oauth/token`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: [
        'data_agent:read',
        'data_agent:write',
        'ontologies:read',
      ],
      token_endpoint_auth_methods_supported: ['none'],
      client_id_metadata_document_supported: true,
    };
  }
}
