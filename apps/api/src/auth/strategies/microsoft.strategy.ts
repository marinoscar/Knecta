import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { OIDCStrategy, IProfile, VerifyCallback } from 'passport-azure-ad';

/**
 * Microsoft OIDC profile information extracted from the provider
 *
 * Note: Azure AD OIDC does not return a profile picture URL in the
 * standard token claims. Photo retrieval requires a separate Microsoft
 * Graph API call which is out of scope for the initial OAuth flow.
 */
export interface MicrosoftProfile {
  id: string;
  email: string;
  displayName: string;
  picture?: string;
}

/**
 * Microsoft Azure AD OIDC authentication strategy
 *
 * Handles the OIDC flow with Microsoft identity platform:
 * 1. Redirects user to Microsoft login
 * 2. Microsoft redirects back to callback URL with authorization code
 * 3. Strategy exchanges code for tokens and fetches user profile
 * 4. Extracts user profile information from the ID token claims
 *
 * Supports both single-tenant (specific tenantId) and multi-tenant
 * ('common') configurations via the MICROSOFT_TENANT_ID environment variable.
 */
@Injectable()
export class MicrosoftStrategy extends PassportStrategy(OIDCStrategy, 'microsoft') {
  constructor(private readonly configService: ConfigService) {
    const tenantId = configService.get<string>('microsoft.tenantId') || 'common';

    super({
      identityMetadata: `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`,
      clientID: configService.get<string>('microsoft.clientId') || '',
      clientSecret: configService.get<string>('microsoft.clientSecret') || '',
      redirectUrl: configService.get<string>('microsoft.callbackUrl') || '',
      responseType: 'code',
      responseMode: 'query',
      scope: ['openid', 'profile', 'email'],
      // Allow HTTP redirect URLs in non-production environments only
      allowHttpForRedirectUrl: configService.get<string>('nodeEnv') !== 'production',
      passReqToCallback: false as const,
    });
  }

  /**
   * Validates the Microsoft OIDC response and extracts user profile
   *
   * Email is sourced from the `email` claim first, falling back to
   * `preferred_username` (typically the UPN for work/school accounts)
   * and then the top-level `upn` field on the profile object.
   *
   * @param profile - User profile extracted from the Microsoft ID token
   * @param done - Passport callback
   */
  async validate(profile: IProfile, done: VerifyCallback): Promise<void> {
    // Resolve email from multiple possible claim locations
    const email =
      profile._json?.email ||
      profile._json?.preferred_username ||
      profile.upn;

    if (!email) {
      return done(new Error('No email found in Microsoft profile'), null);
    }

    // Build standardized profile object matching the shape used by other providers
    const microsoftProfile: MicrosoftProfile = {
      id: profile.oid || '',
      email,
      displayName: profile.displayName || email,
      picture: undefined, // Azure AD OIDC does not return picture in token claims
    };

    done(null, microsoftProfile);
  }
}
