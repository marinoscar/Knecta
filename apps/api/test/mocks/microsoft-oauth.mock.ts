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
 * Bypasses actual Microsoft OIDC authentication and returns mock profile.
 * Registered under the 'microsoft' Passport strategy name, same as the real
 * MicrosoftStrategy, so the MicrosoftOAuthGuard picks it up transparently.
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
    super();
  }

  validate(req: any, done: any): void {
    done(null, MockMicrosoftStrategy.mockProfile);
  }

  /**
   * Set the mock profile for the next authentication
   */
  static setMockProfile(profile: Partial<MockMicrosoftProfile>): void {
    MockMicrosoftStrategy.mockProfile = {
      ...MockMicrosoftStrategy.mockProfile,
      ...profile,
    };
  }

  /**
   * Reset mock profile to defaults
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
