import type { AppNotification, NotificationModule } from '../../types';
import type { NotificationChannel } from '../notification.types';

const MODULE_ICONS: Record<NotificationModule, string> = {
  'semantic-models': '/icons/semantic-models.svg',
  'data-agent': '/icons/data-agent.svg',
  ontologies: '/icons/ontologies.svg',
};

export class BrowserNotificationChannel implements NotificationChannel {
  readonly name = 'browser';

  isAvailable(): boolean {
    return 'Notification' in window;
  }

  async requestPermission(): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  getPermissionStatus(): 'granted' | 'denied' | 'default' | 'not-applicable' {
    if (!this.isAvailable()) {
      return 'not-applicable';
    }
    return Notification.permission;
  }

  async send(notification: AppNotification): Promise<void> {
    // Don't send notification if tab is visible
    if (!document.hidden) {
      return;
    }

    // Check permission
    if (!this.isAvailable() || Notification.permission !== 'granted') {
      return;
    }

    const icon = MODULE_ICONS[notification.module];

    const browserNotification = new Notification(notification.title, {
      body: notification.body,
      icon,
      tag: notification.id,
    });

    browserNotification.onclick = () => {
      window.focus();
      if (notification.clickUrl) {
        window.location.href = notification.clickUrl;
      }
      browserNotification.close();
    };
  }
}
