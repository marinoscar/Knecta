import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';

export interface MockMicrosoftProfile {
  id: string;
  email: string;
  displayName: string;
  picture?: string;
}

/**
 * Mock Microsoft OAuth strategy for testing
 *
 * This mock bypasses the real passport-azure-ad OIDCStrategy (which requires
 * network access to fetch OIDC metadata) and instead produces a Passport-level
 * redirect — the same mechanism used by real OAuth strategies such as
 * passport-google-oauth20.
 *
 * Overriding `authenticate()` directly (rather than providing a `validate`
 * callback) lets us call `this.redirect(url)` before the @nestjs/passport
 * mixin's async wrapper fires.  `this.redirect` is injected onto the strategy
 * instance by passport's `passport.authenticate()` middleware immediately before
 * `strategy.authenticate()` is invoked, so it is always available here.
 *
 * Calling `this.redirect(url)` writes statusCode 302 + Location header directly
 * to the raw Node.js ServerResponse and calls `res.end()`, sending the HTTP
 * response before the NestJS controller runs.  The createPassportContext Promise
 * is left pending (no resolve/reject path is triggered), exactly as happens
 * with real OAuth strategies.  Supertest receives the 302, the test assertion
 * succeeds, and the pending Promise is cleaned up when `app.close()` runs in
 * afterAll.
 *
 * Because the controller never executes in this flow, the static `mockProfile`
 * / `setMockProfile` / `resetMockProfile` helpers are retained for API
 * compatibility but are not used during authentication.
 */
@Injectable()
export class MockMicrosoftStrategy extends PassportStrategy(Strategy, 'microsoft') {
  static mockProfile: MockMicrosoftProfile = {
    id: 'microsoft-oid-123456',
    email: 'test@example.com',
    displayName: 'Test User',
    picture: undefined,
  };

  constructor() {
    // PassportStrategy mixin requires super() to be called; passport-custom's
    // Strategy constructor receives the verify callback but it is never invoked
    // because we override authenticate() below.
    super();
  }

  /**
   * Override authenticate to produce a Passport-level 302 redirect.
   *
   * Passport's middleware injects this.redirect onto the strategy instance
   * before calling strategy.authenticate(), so (this as any).redirect(url) is
   * always available here.  Calling it ends the raw Node.js response with a
   * 302 redirect, mirroring what real OAuth strategies do when initiating the
   * provider flow.
   */
  authenticate(_req: any, _options?: any): void {
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    (this as any).redirect(`${appUrl}/auth/callback?mock=microsoft`);
  }

  /**
   * validate() is never called because authenticate() is overridden above.
   * It is declared here only to satisfy the PassportStrategy mixin's requirement
   * that subclasses implement validate().
   */
  validate(_req: any, _done: any): void {
    // Intentionally empty — authenticate() is used instead.
  }

  /**
   * Set the mock profile (retained for API compatibility; not used in authenticate).
   */
  static setMockProfile(profile: Partial<MockMicrosoftProfile>): void {
    MockMicrosoftStrategy.mockProfile = {
      ...MockMicrosoftStrategy.mockProfile,
      ...profile,
    };
  }

  /**
   * Reset mock profile to defaults (retained for API compatibility).
   */
  static resetMockProfile(): void {
    MockMicrosoftStrategy.mockProfile = {
      id: 'microsoft-oid-123456',
      email: 'test@example.com',
      displayName: 'Test User',
      picture: undefined,
    };
  }
}

/**
 * Creates a mock Microsoft profile for testing
 */
export function createMockMicrosoftProfile(
  overrides: Partial<MockMicrosoftProfile> = {},
): MockMicrosoftProfile {
  return {
    id: `microsoft-oid-${Date.now()}`,
    email: `user-${Date.now()}@example.com`,
    displayName: 'Mock User',
    picture: undefined,
    ...overrides,
  };
}
