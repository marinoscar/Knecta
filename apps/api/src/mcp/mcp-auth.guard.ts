import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth/auth.service';
import { PERMISSIONS } from '../common/constants/roles.constants';

/**
 * MCP Authentication Guard
 *
 * Validates Bearer tokens for MCP protocol access.
 * If no token is present, returns a 401 with WWW-Authenticate header
 * pointing to the OAuth protected resource metadata endpoint.
 */
@Injectable()
export class McpAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);

    if (!token) {
      const appUrl =
        this.configService.get<string>('APP_URL') || 'http://localhost:8319';
      const response = context.switchToHttp().getResponse();
      response.header(
        'WWW-Authenticate',
        `Bearer resource_metadata="${appUrl}/.well-known/oauth-protected-resource/api/data-agent/mcp", scope="data_agent:read data_agent:write ontologies:read"`,
      );
      throw new UnauthorizedException('Authentication required');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);
      const user = await this.authService.validateJwtPayload(payload);

      if (!user) {
        throw new UnauthorizedException('Invalid token');
      }

      // Extract permissions from the user's roles
      const permissions = [
        ...new Set(
          user.userRoles.flatMap((ur) =>
            ur.role.rolePermissions.map((rp) => rp.permission.name),
          ),
        ),
      ];

      // Check required permissions
      const requiredPermissions = [
        PERMISSIONS.DATA_AGENT_READ,
        PERMISSIONS.ONTOLOGIES_READ,
      ];

      const hasAllPermissions = requiredPermissions.every((perm) =>
        permissions.includes(perm),
      );

      if (!hasAllPermissions) {
        throw new UnauthorizedException(
          'Insufficient permissions for MCP access',
        );
      }

      // Attach user to request for downstream use
      request.mcpUser = user;
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractToken(request: any): string | null {
    const auth = request.headers?.authorization;
    if (auth && auth.startsWith('Bearer ')) {
      return auth.substring(7);
    }
    return null;
  }
}
