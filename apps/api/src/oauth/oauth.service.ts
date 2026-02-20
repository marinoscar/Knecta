import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates an authorization code and stores it in the database
   * @param userId User ID
   * @param clientId Client ID from the request
   * @param redirectUri Redirect URI to validate during token exchange
   * @param scope Requested scopes (space-separated)
   * @param codeChallenge PKCE code challenge
   * @param codeChallengeMethod PKCE method (must be S256)
   * @param resource Optional resource indicator
   * @returns The generated authorization code
   */
  async generateAuthorizationCode(
    userId: string,
    clientId: string,
    redirectUri: string,
    scope: string,
    codeChallenge: string,
    codeChallengeMethod: string,
    resource?: string,
  ): Promise<string> {
    // Generate random code
    const code = randomBytes(32).toString('base64url');

    // Calculate expiry (60 seconds from now)
    const expiresAt = new Date(Date.now() + 60 * 1000);

    // Store in database
    await this.prisma.oAuthAuthorizationCode.create({
      data: {
        code,
        userId,
        clientId,
        redirectUri,
        scope,
        codeChallenge,
        codeChallengeMethod,
        resource,
        expiresAt,
        used: false,
      },
    });

    this.logger.log(
      `Generated authorization code for user ${userId}, client ${clientId}`,
    );

    return code;
  }

  /**
   * Exchanges an authorization code for user information
   * Validates PKCE, expiry, and single-use constraint
   * @param code Authorization code
   * @param codeVerifier PKCE code verifier
   * @param redirectUri Redirect URI (must match the one from authorization request)
   * @param clientId Client ID (must match the one from authorization request)
   * @returns User ID and scope if valid
   */
  async exchangeCode(
    code: string,
    codeVerifier: string,
    redirectUri: string,
    clientId: string,
  ): Promise<{ userId: string; scope: string }> {
    // Find the code
    const authCode = await this.prisma.oAuthAuthorizationCode.findUnique({
      where: { code },
    });

    if (!authCode) {
      this.logger.warn(`Invalid authorization code: ${code}`);
      throw new UnauthorizedException('Invalid authorization code');
    }

    // Check if already used
    if (authCode.used) {
      this.logger.warn(`Authorization code already used: ${code}`);
      throw new UnauthorizedException('Authorization code already used');
    }

    // Check if expired
    if (authCode.expiresAt < new Date()) {
      this.logger.warn(`Authorization code expired: ${code}`);
      throw new UnauthorizedException('Authorization code expired');
    }

    // Verify redirect URI matches
    if (authCode.redirectUri !== redirectUri) {
      this.logger.warn(
        `Redirect URI mismatch for code ${code}: expected ${authCode.redirectUri}, got ${redirectUri}`,
      );
      throw new BadRequestException('Redirect URI mismatch');
    }

    // Verify client ID matches
    if (authCode.clientId !== clientId) {
      this.logger.warn(
        `Client ID mismatch for code ${code}: expected ${authCode.clientId}, got ${clientId}`,
      );
      throw new BadRequestException('Client ID mismatch');
    }

    // Verify PKCE
    if (!this.verifyPkce(codeVerifier, authCode.codeChallenge)) {
      this.logger.warn(`PKCE verification failed for code ${code}`);
      throw new UnauthorizedException('PKCE verification failed');
    }

    // Mark as used
    await this.prisma.oAuthAuthorizationCode.update({
      where: { code },
      data: { used: true },
    });

    this.logger.log(
      `Authorization code exchanged for user ${authCode.userId}, client ${clientId}`,
    );

    return {
      userId: authCode.userId,
      scope: authCode.scope,
    };
  }

  /**
   * Verifies PKCE code challenge against code verifier
   * Uses SHA-256 hash as per S256 method
   */
  private verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
    const hash = createHash('sha256').update(codeVerifier).digest('base64url');
    return hash === codeChallenge;
  }

  /**
   * Cleans up expired authorization codes
   * Should be called periodically (e.g., via scheduled task)
   */
  async cleanupExpiredCodes(): Promise<number> {
    const result = await this.prisma.oAuthAuthorizationCode.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    if (result.count > 0) {
      this.logger.log(`Cleaned up ${result.count} expired authorization codes`);
    }

    return result.count;
  }
}
