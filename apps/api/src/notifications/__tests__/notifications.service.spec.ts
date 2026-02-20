import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { NotificationsService } from '../notifications.service';
import { ConsoleChannel } from '../channels/console.channel';
import { EmailChannel } from '../channels/email.channel';
import { SmsChannel } from '../channels/sms.channel';
import type { NotificationPayload } from '../notifications.types';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let consoleChannel: ConsoleChannel;
  let emailChannel: EmailChannel;
  let smsChannel: SmsChannel;

  const mockPayload: NotificationPayload = {
    title: 'Test Notification',
    body: 'This is a test notification',
    module: 'semantic-models',
    severity: 'info',
    userId: 'user-123',
    clickUrl: '/semantic-models/123',
    metadata: { runId: 'run-456' },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationsService],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);

    // Manually trigger onModuleInit to register channels
    service.onModuleInit();

    // Get registered channels after onModuleInit
    const channels = service['channels'];
    consoleChannel = channels.get('console') as ConsoleChannel;
    emailChannel = channels.get('email') as EmailChannel;
    smsChannel = channels.get('sms') as SmsChannel;
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('onModuleInit', () => {
    it('should register all built-in channels on module init', () => {
      const channels = service.getRegisteredChannels();

      expect(channels).toHaveLength(3);
      expect(channels).toContain('console');
      expect(channels).toContain('email');
      expect(channels).toContain('sms');
    });

    it('should log registered channels', () => {
      const loggerSpy = jest.spyOn(Logger.prototype, 'log');

      service.onModuleInit();

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Registered 3 notification channels'),
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('console'),
      );
      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('email'));
      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('sms'));
    });
  });

  describe('getRegisteredChannels', () => {
    it('should return all registered channel names', () => {
      const channels = service.getRegisteredChannels();

      expect(channels).toEqual(['console', 'email', 'sms']);
    });
  });

  describe('getEnabledChannels', () => {
    it('should return only enabled channels (console in non-production)', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const channels = service.getEnabledChannels();

      expect(channels).toEqual(['console']);

      process.env.NODE_ENV = originalEnv;
    });

    it('should return empty array when all channels are disabled (production)', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const channels = service.getEnabledChannels();

      expect(channels).toEqual([]);

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('notify', () => {
    it('should dispatch to enabled channels only (console in development)', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const consoleSpy = jest.spyOn(consoleChannel, 'send');
      const emailSpy = jest.spyOn(emailChannel, 'send');
      const smsSpy = jest.spyOn(smsChannel, 'send');

      await service.notify(mockPayload);

      expect(consoleSpy).toHaveBeenCalledWith(mockPayload);
      expect(emailSpy).not.toHaveBeenCalled();
      expect(smsSpy).not.toHaveBeenCalled();

      process.env.NODE_ENV = originalEnv;
    });

    it('should skip all channels when none are enabled (production)', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const consoleSpy = jest.spyOn(consoleChannel, 'send');
      const debugSpy = jest.spyOn(Logger.prototype, 'debug');

      await service.notify(mockPayload);

      expect(consoleSpy).not.toHaveBeenCalled();
      expect(debugSpy).toHaveBeenCalledWith(
        'No enabled notification channels, skipping notification',
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('should isolate channel errors using Promise.allSettled', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      // Mock console channel to throw error
      const error = new Error('Console channel failed');
      jest.spyOn(consoleChannel, 'send').mockRejectedValue(error);

      const warnSpy = jest.spyOn(Logger.prototype, 'warn');

      await service.notify(mockPayload);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Notification channel 'console' failed"),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Console channel failed'),
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('should handle error without message property', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      // Mock console channel to throw non-Error object
      jest.spyOn(consoleChannel, 'send').mockRejectedValue('string error');

      const warnSpy = jest.spyOn(Logger.prototype, 'warn');

      await service.notify(mockPayload);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Notification channel 'console' failed"),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('string error'),
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('should handle empty payload gracefully', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const minimalPayload: NotificationPayload = {
        title: 'Minimal',
        body: 'Body',
        module: 'data-agent',
        severity: 'success',
        userId: 'user-1',
      };

      const consoleSpy = jest.spyOn(consoleChannel, 'send');

      await service.notify(minimalPayload);

      expect(consoleSpy).toHaveBeenCalledWith(minimalPayload);

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('ConsoleChannel', () => {
    it('should be enabled when NODE_ENV is not production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      expect(consoleChannel.isEnabled()).toBe(true);

      process.env.NODE_ENV = originalEnv;
    });

    it('should be disabled when NODE_ENV is production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      expect(consoleChannel.isEnabled()).toBe(false);

      process.env.NODE_ENV = originalEnv;
    });

    it('should log notification in correct format', async () => {
      const loggerSpy = jest.spyOn(Logger.prototype, 'log');

      await consoleChannel.send(mockPayload);

      expect(loggerSpy).toHaveBeenCalledWith(
        '[NOTIFICATION] [INFO] Test Notification: This is a test notification (module=semantic-models, user=user-123)',
      );
    });

    it('should format severity as uppercase', async () => {
      const loggerSpy = jest.spyOn(Logger.prototype, 'log');

      const errorPayload: NotificationPayload = {
        ...mockPayload,
        severity: 'error',
      };

      await consoleChannel.send(errorPayload);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]'),
      );
    });
  });

  describe('EmailChannel', () => {
    it('should be disabled (stub implementation)', () => {
      expect(emailChannel.isEnabled()).toBe(false);
    });

    it('should throw error when send is called', async () => {
      await expect(emailChannel.send(mockPayload)).rejects.toThrow(
        'Email notification channel is not yet implemented',
      );
    });

    it('should log warning when send is attempted', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn');

      await emailChannel.send(mockPayload).catch(() => {
        // Expected error
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Email channel not yet implemented'),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(mockPayload.title),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(mockPayload.userId),
      );
    });
  });

  describe('SmsChannel', () => {
    it('should be disabled (stub implementation)', () => {
      expect(smsChannel.isEnabled()).toBe(false);
    });

    it('should throw error when send is called', async () => {
      await expect(smsChannel.send(mockPayload)).rejects.toThrow(
        'SMS notification channel is not yet implemented',
      );
    });

    it('should log warning when send is attempted', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn');

      await smsChannel.send(mockPayload).catch(() => {
        // Expected error
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('SMS channel not yet implemented'),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(mockPayload.title),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(mockPayload.userId),
      );
    });
  });

  describe('registerChannel', () => {
    it('should allow registering custom channels', () => {
      const customChannel = {
        name: 'console' as const,
        isEnabled: () => true,
        send: jest.fn().mockResolvedValue(undefined),
      };

      service.registerChannel(customChannel);

      const channels = service['channels'];
      expect(channels.has('console')).toBe(true);
      expect(channels.get('console')).toBe(customChannel);
    });
  });
});
