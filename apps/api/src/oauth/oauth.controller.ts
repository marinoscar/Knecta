import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Res,
  Req,
  UnauthorizedException,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { FastifyRequest, FastifyReply } from 'fastify';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OAuthService } from './oauth.service';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizeQueryDto } from './dto/authorize-query.dto';
import { TokenRequestDto } from './dto/token-request.dto';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('OAuth 2.1')
@Controller('oauth')
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);

  constructor(
    private readonly oauthService: OAuthService,
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * OAuth 2.1 Authorization Endpoint
   * Initiates the authorization code flow with PKCE
   */
  @Get('authorize')
  @ApiOperation({ summary: 'OAuth 2.1 authorization endpoint (PKCE S256)' })
  @ApiQuery({ name: 'response_type', enum: ['code'] })
  @ApiQuery({ name: 'client_id', type: String })
  @ApiQuery({ name: 'redirect_uri', type: String })
  @ApiQuery({ name: 'code_challenge', type: String })
  @ApiQuery({ name: 'code_challenge_method', enum: ['S256'] })
  @ApiQuery({ name: 'scope', type: String, required: false })
  @ApiQuery({ name: 'state', type: String, required: false })
  @ApiQuery({ name: 'resource', type: String, required: false })
  @ApiResponse({
    status: 302,
    description: 'Redirects to redirect_uri with authorization code',
  })
  @ApiResponse({
    status: 401,
    description: 'User not authenticated',
  })
  async authorize(
    @Query() query: AuthorizeQueryDto,
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ) {
    // Extract and validate JWT from Authorization header or cookie
    let user: any;
    try {
      user = await this.extractAndValidateUser(req);
    } catch (error) {
      // User not authenticated - return login_required error
      return res.status(401).send({
        error: 'login_required',
        login_url: '/api/auth/google',
        message: 'Please log in first, then retry the authorization request.',
      });
    }

    // Generate authorization code
    const code = await this.oauthService.generateAuthorizationCode(
      user.id,
      query.client_id,
      query.redirect_uri,
      query.scope || '',
      query.code_challenge,
      query.code_challenge_method,
      query.resource,
    );

    // Build redirect URL
    const redirectUrl = new URL(query.redirect_uri);
    redirectUrl.searchParams.set('code', code);
    if (query.state) {
      redirectUrl.searchParams.set('state', query.state);
    }

    this.logger.log(
      `Authorization code issued for user ${user.id}, redirecting to ${query.redirect_uri}`,
    );

    // Redirect to client
    return res.redirect(302, redirectUrl.toString());
  }

  /**
   * OAuth 2.1 Token Endpoint
   * Exchanges authorization code for access token (with PKCE verification)
   * Also handles refresh token grant
   */
  @Post('token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'OAuth 2.1 token endpoint' })
  @ApiBody({ type: TokenRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Access token issued',
    schema: {
      type: 'object',
      properties: {
        access_token: { type: 'string' },
        token_type: { type: 'string', example: 'Bearer' },
        expires_in: { type: 'number', example: 900 },
        refresh_token: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid authorization code or refresh token',
  })
  async token(@Body() body: TokenRequestDto) {
    if (body.grant_type === 'authorization_code') {
      return this.handleAuthorizationCodeGrant(body);
    } else if (body.grant_type === 'refresh_token') {
      return this.handleRefreshTokenGrant(body);
    }

    throw new BadRequestException('Unsupported grant_type');
  }

  /**
   * Handles authorization_code grant type
   */
  private async handleAuthorizationCodeGrant(body: TokenRequestDto) {
    if (!body.code || !body.code_verifier || !body.redirect_uri || !body.client_id) {
      throw new BadRequestException(
        'code, code_verifier, redirect_uri, and client_id are required for authorization_code grant',
      );
    }

    // Exchange code for user info
    const { userId, scope } = await this.oauthService.exchangeCode(
      body.code,
      body.code_verifier,
      body.redirect_uri,
      body.client_id,
    );

    // Fetch user with roles
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    // Generate tokens
    const tokens = await this.authService.generateFullTokens(user);

    return {
      access_token: tokens.accessToken,
      token_type: 'Bearer',
      expires_in: tokens.expiresIn,
      refresh_token: tokens.refreshToken,
    };
  }

  /**
   * Handles refresh_token grant type
   */
  private async handleRefreshTokenGrant(body: TokenRequestDto) {
    if (!body.refresh_token) {
      throw new BadRequestException('refresh_token is required for refresh_token grant');
    }

    // Use existing auth service refresh token logic
    const tokens = await this.authService.refreshAccessToken(body.refresh_token);

    return {
      access_token: tokens.accessToken,
      token_type: 'Bearer',
      expires_in: tokens.expiresIn,
      refresh_token: tokens.refreshToken,
    };
  }

  /**
   * Extracts and validates user from JWT in request
   * Checks Authorization header (Bearer token) or access_token cookie
   */
  private async extractAndValidateUser(req: FastifyRequest): Promise<any> {
    // Try Authorization header first
    const authHeader = req.headers.authorization;
    let token: string | undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.cookies?.access_token) {
      // Fallback to cookie
      token = req.cookies.access_token;
    }

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    // Verify JWT
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('jwt.secret'),
      });
    } catch (error) {
      this.logger.warn(`Invalid JWT token: ${error.message}`);
      throw new UnauthorizedException('Invalid token');
    }

    // Validate user
    const user = await this.authService.validateJwtPayload(payload);
    if (!user) {
      throw new UnauthorizedException('User not found or inactive');
    }

    return user;
  }
}
