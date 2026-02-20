import type { AppNotification } from '../types';
import type { NotificationChannel } from './notification.types';

export class NotificationService {
  private channels: NotificationChannel[] = [];

  registerChannel(channel: NotificationChannel): void {
    this.channels.push(channel);
  }

  async notify(notification: AppNotification): Promise<void> {
    const promises = this.channels
      .filter((ch) => ch.isAvailable())
      .map((ch) =>
        ch.send(notification).catch((err) => {
          console.warn(`Notification channel '${ch.name}' failed:`, err);
        }),
      );
    await Promise.allSettled(promises);
  }

  getChannels(): NotificationChannel[] {
    return [...this.channels];
  }

  async requestAllPermissions(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    for (const channel of this.channels) {
      results[channel.name] = await channel.requestPermission();
    }
    return results;
  }

  getPermissionSummary(): Record<string, string> {
    const summary: Record<string, string> = {};
    for (const channel of this.channels) {
      summary[channel.name] = channel.getPermissionStatus();
    }
    return summary;
  }
}
