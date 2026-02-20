import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserNotificationChannel } from '../../notifications/channels/BrowserNotificationChannel';
import type { AppNotification } from '../../types';

describe('BrowserNotificationChannel', () => {
  let channel: BrowserNotificationChannel;
  let originalNotification: any;

  beforeEach(() => {
    channel = new BrowserNotificationChannel();
    originalNotification = (window as any).Notification;
  });

  afterEach(() => {
    (window as any).Notification = originalNotification;
    vi.restoreAllMocks();
  });

  describe('isAvailable', () => {
    it('should return false when Notification not in window', () => {
      // Spy on the method to simulate Notification not being in window
      const testChannel = new BrowserNotificationChannel();
      vi.spyOn(testChannel, 'isAvailable').mockReturnValue(false);

      expect(testChannel.isAvailable()).toBe(false);
    });

    it('should return true when Notification is in window', () => {
      const MockNotification: any = vi.fn();
      Object.defineProperty(MockNotification, 'permission', {
        value: 'default',
        writable: true,
      });
      (window as any).Notification = MockNotification;

      const testChannel = new BrowserNotificationChannel();
      expect(testChannel.isAvailable()).toBe(true);
    });
  });

  describe('requestPermission', () => {
    it('should return false when not available', async () => {
      const testChannel = new BrowserNotificationChannel();
      vi.spyOn(testChannel, 'isAvailable').mockReturnValue(false);

      const result = await testChannel.requestPermission();

      expect(result).toBe(false);
    });

    it('should return true when permission granted', async () => {
      const mockRequestPermission = vi.fn().mockResolvedValue('granted');
      (window as any).Notification = vi.fn();
      (window as any).Notification.requestPermission = mockRequestPermission;

      const result = await channel.requestPermission();

      expect(result).toBe(true);
      expect(mockRequestPermission).toHaveBeenCalledOnce();
    });

    it('should return false when permission denied', async () => {
      const mockRequestPermission = vi.fn().mockResolvedValue('denied');
      (window as any).Notification = vi.fn();
      (window as any).Notification.requestPermission = mockRequestPermission;

      const result = await channel.requestPermission();

      expect(result).toBe(false);
      expect(mockRequestPermission).toHaveBeenCalledOnce();
    });
  });

  describe('getPermissionStatus', () => {
    it('should return "not-applicable" when not available', () => {
      const testChannel = new BrowserNotificationChannel();
      vi.spyOn(testChannel, 'isAvailable').mockReturnValue(false);

      const status = testChannel.getPermissionStatus();

      expect(status).toBe('not-applicable');
    });

    it('should return current Notification.permission', () => {
      const MockNotification: any = vi.fn();
      Object.defineProperty(MockNotification, 'permission', {
        value: 'granted',
        writable: true,
      });
      (window as any).Notification = MockNotification;

      const status = channel.getPermissionStatus();

      expect(status).toBe('granted');
    });
  });

  describe('send', () => {
    let mockNotificationCalls: Array<{ title: string; options: any }>;
    let lastNotificationInstance: any;

    beforeEach(() => {
      mockNotificationCalls = [];
      lastNotificationInstance = null;

      // Setup constructor - must use function keyword to be a proper constructor
      class MockNotification {
        close = vi.fn();
        onclick: any = null;

        constructor(title: string, options: any) {
          mockNotificationCalls.push({ title, options });
          lastNotificationInstance = this;
        }
      }

      Object.defineProperty(MockNotification, 'permission', {
        value: 'granted',
        writable: true,
        configurable: true,
      });

      (window as any).Notification = MockNotification;

      // Mock document.hidden
      Object.defineProperty(document, 'hidden', {
        value: true,
        writable: true,
        configurable: true,
      });

      // Mock window.focus
      window.focus = vi.fn();
    });

    it('should create Notification with correct title, body, icon', async () => {
      const notification: AppNotification = {
        id: 'test-123',
        title: 'Test Title',
        body: 'Test Body',
        module: 'semantic-models',
        severity: 'success',
        timestamp: Date.now(),
      };

      await channel.send(notification);

      expect(mockNotificationCalls).toHaveLength(1);
      expect(mockNotificationCalls[0].title).toBe('Test Title');
      expect(mockNotificationCalls[0].options).toEqual({
        body: 'Test Body',
        icon: '/icons/semantic-models.svg',
        tag: 'test-123',
      });
    });

    it('should use correct icon for semantic-models module', async () => {
      const notification: AppNotification = {
        id: 'test-123',
        title: 'Test',
        body: 'Body',
        module: 'semantic-models',
        severity: 'success',
        timestamp: Date.now(),
      };

      await channel.send(notification);

      expect(mockNotificationCalls).toHaveLength(1);
      expect(mockNotificationCalls[0].options.icon).toBe('/icons/semantic-models.svg');
    });

    it('should use correct icon for data-agent module', async () => {
      const notification: AppNotification = {
        id: 'test-456',
        title: 'Test',
        body: 'Body',
        module: 'data-agent',
        severity: 'info',
        timestamp: Date.now(),
      };

      await channel.send(notification);

      expect(mockNotificationCalls).toHaveLength(1);
      expect(mockNotificationCalls[0].options.icon).toBe('/icons/data-agent.svg');
    });

    it('should use correct icon for ontologies module', async () => {
      const notification: AppNotification = {
        id: 'test-789',
        title: 'Test',
        body: 'Body',
        module: 'ontologies',
        severity: 'error',
        timestamp: Date.now(),
      };

      await channel.send(notification);

      expect(mockNotificationCalls).toHaveLength(1);
      expect(mockNotificationCalls[0].options.icon).toBe('/icons/ontologies.svg');
    });

    it('should skip when document.hidden is false', async () => {
      Object.defineProperty(document, 'hidden', {
        value: false,
        writable: true,
        configurable: true,
      });

      const notification: AppNotification = {
        id: 'test-123',
        title: 'Test',
        body: 'Body',
        module: 'semantic-models',
        severity: 'success',
        timestamp: Date.now(),
      };

      await channel.send(notification);

      expect(mockNotificationCalls).toHaveLength(0);
    });

    it('should skip when permission is not granted', async () => {
      Object.defineProperty((window as any).Notification, 'permission', {
        value: 'denied',
        writable: true,
        configurable: true,
      });

      const notification: AppNotification = {
        id: 'test-123',
        title: 'Test',
        body: 'Body',
        module: 'semantic-models',
        severity: 'success',
        timestamp: Date.now(),
      };

      await channel.send(notification);

      expect(mockNotificationCalls).toHaveLength(0);
    });

    it('should call window.focus and navigate on click', async () => {
      const notification: AppNotification = {
        id: 'test-123',
        title: 'Test',
        body: 'Body',
        module: 'semantic-models',
        severity: 'success',
        clickUrl: '/semantic-models/test-id',
        timestamp: Date.now(),
      };

      await channel.send(notification);

      expect(mockNotificationCalls).toHaveLength(1);
      expect(lastNotificationInstance).not.toBeNull();

      // Simulate click
      const clickHandler = lastNotificationInstance.onclick;
      expect(clickHandler).toBeDefined();

      clickHandler();

      expect(window.focus).toHaveBeenCalled();
      expect(window.location.href).toBe('/semantic-models/test-id');
      expect(lastNotificationInstance.close).toHaveBeenCalled();
    });
  });
});
