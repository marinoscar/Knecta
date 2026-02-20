import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationService } from '../../notifications/NotificationService';
import type { NotificationChannel } from '../../notifications/notification.types';
import type { AppNotification } from '../../types';

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    service = new NotificationService();
  });

  describe('registerChannel', () => {
    it('should add channel to registry', () => {
      const mockChannel: NotificationChannel = {
        name: 'test-channel',
        isAvailable: vi.fn().mockReturnValue(true),
        requestPermission: vi.fn().mockResolvedValue(true),
        getPermissionStatus: vi.fn().mockReturnValue('granted'),
        send: vi.fn().mockResolvedValue(undefined),
      };

      service.registerChannel(mockChannel);

      const channels = service.getChannels();
      expect(channels).toHaveLength(1);
      expect(channels[0]).toBe(mockChannel);
    });
  });

  describe('notify', () => {
    it('should dispatch to all registered available channels', async () => {
      const mockChannel1: NotificationChannel = {
        name: 'channel-1',
        isAvailable: vi.fn().mockReturnValue(true),
        requestPermission: vi.fn().mockResolvedValue(true),
        getPermissionStatus: vi.fn().mockReturnValue('granted'),
        send: vi.fn().mockResolvedValue(undefined),
      };

      const mockChannel2: NotificationChannel = {
        name: 'channel-2',
        isAvailable: vi.fn().mockReturnValue(true),
        requestPermission: vi.fn().mockResolvedValue(true),
        getPermissionStatus: vi.fn().mockReturnValue('granted'),
        send: vi.fn().mockResolvedValue(undefined),
      };

      service.registerChannel(mockChannel1);
      service.registerChannel(mockChannel2);

      const notification: AppNotification = {
        id: 'test-123',
        title: 'Test',
        body: 'Body',
        module: 'semantic-models',
        severity: 'success',
        timestamp: Date.now(),
      };

      await service.notify(notification);

      expect(mockChannel1.isAvailable).toHaveBeenCalled();
      expect(mockChannel1.send).toHaveBeenCalledWith(notification);
      expect(mockChannel2.isAvailable).toHaveBeenCalled();
      expect(mockChannel2.send).toHaveBeenCalledWith(notification);
    });

    it('should skip channels where isAvailable returns false', async () => {
      const availableChannel: NotificationChannel = {
        name: 'available',
        isAvailable: vi.fn().mockReturnValue(true),
        requestPermission: vi.fn().mockResolvedValue(true),
        getPermissionStatus: vi.fn().mockReturnValue('granted'),
        send: vi.fn().mockResolvedValue(undefined),
      };

      const unavailableChannel: NotificationChannel = {
        name: 'unavailable',
        isAvailable: vi.fn().mockReturnValue(false),
        requestPermission: vi.fn().mockResolvedValue(false),
        getPermissionStatus: vi.fn().mockReturnValue('not-applicable'),
        send: vi.fn().mockResolvedValue(undefined),
      };

      service.registerChannel(availableChannel);
      service.registerChannel(unavailableChannel);

      const notification: AppNotification = {
        id: 'test-123',
        title: 'Test',
        body: 'Body',
        module: 'semantic-models',
        severity: 'success',
        timestamp: Date.now(),
      };

      await service.notify(notification);

      expect(availableChannel.send).toHaveBeenCalledWith(notification);
      expect(unavailableChannel.send).not.toHaveBeenCalled();
    });

    it('should catch per-channel errors without throwing', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const failingChannel: NotificationChannel = {
        name: 'failing-channel',
        isAvailable: vi.fn().mockReturnValue(true),
        requestPermission: vi.fn().mockResolvedValue(true),
        getPermissionStatus: vi.fn().mockReturnValue('granted'),
        send: vi.fn().mockRejectedValue(new Error('Channel error')),
      };

      const successChannel: NotificationChannel = {
        name: 'success-channel',
        isAvailable: vi.fn().mockReturnValue(true),
        requestPermission: vi.fn().mockResolvedValue(true),
        getPermissionStatus: vi.fn().mockReturnValue('granted'),
        send: vi.fn().mockResolvedValue(undefined),
      };

      service.registerChannel(failingChannel);
      service.registerChannel(successChannel);

      const notification: AppNotification = {
        id: 'test-123',
        title: 'Test',
        body: 'Body',
        module: 'semantic-models',
        severity: 'success',
        timestamp: Date.now(),
      };

      await expect(service.notify(notification)).resolves.not.toThrow();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Notification channel 'failing-channel' failed:",
        expect.any(Error)
      );
      expect(successChannel.send).toHaveBeenCalledWith(notification);

      consoleWarnSpy.mockRestore();
    });
  });

  describe('requestAllPermissions', () => {
    it('should call requestPermission on all available channels', async () => {
      const channel1: NotificationChannel = {
        name: 'channel-1',
        isAvailable: vi.fn().mockReturnValue(true),
        requestPermission: vi.fn().mockResolvedValue(true),
        getPermissionStatus: vi.fn().mockReturnValue('granted'),
        send: vi.fn().mockResolvedValue(undefined),
      };

      const channel2: NotificationChannel = {
        name: 'channel-2',
        isAvailable: vi.fn().mockReturnValue(true),
        requestPermission: vi.fn().mockResolvedValue(false),
        getPermissionStatus: vi.fn().mockReturnValue('denied'),
        send: vi.fn().mockResolvedValue(undefined),
      };

      service.registerChannel(channel1);
      service.registerChannel(channel2);

      const results = await service.requestAllPermissions();

      expect(channel1.requestPermission).toHaveBeenCalled();
      expect(channel2.requestPermission).toHaveBeenCalled();
      expect(results).toEqual({
        'channel-1': true,
        'channel-2': false,
      });
    });
  });

  describe('getPermissionSummary', () => {
    it('should return status for all registered channels', () => {
      const channel1: NotificationChannel = {
        name: 'channel-1',
        isAvailable: vi.fn().mockReturnValue(true),
        requestPermission: vi.fn().mockResolvedValue(true),
        getPermissionStatus: vi.fn().mockReturnValue('granted'),
        send: vi.fn().mockResolvedValue(undefined),
      };

      const channel2: NotificationChannel = {
        name: 'channel-2',
        isAvailable: vi.fn().mockReturnValue(false),
        requestPermission: vi.fn().mockResolvedValue(false),
        getPermissionStatus: vi.fn().mockReturnValue('not-applicable'),
        send: vi.fn().mockResolvedValue(undefined),
      };

      service.registerChannel(channel1);
      service.registerChannel(channel2);

      const summary = service.getPermissionSummary();

      expect(channel1.getPermissionStatus).toHaveBeenCalled();
      expect(channel2.getPermissionStatus).toHaveBeenCalled();
      expect(summary).toEqual({
        'channel-1': 'granted',
        'channel-2': 'not-applicable',
      });
    });
  });
});
