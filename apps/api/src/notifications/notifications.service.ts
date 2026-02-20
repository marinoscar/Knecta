import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { NotificationChannel, NotificationPayload, NotificationChannelName } from './notifications.types';
import { ConsoleChannel } from './channels/console.channel';
import { EmailChannel } from './channels/email.channel';
import { SmsChannel } from './channels/sms.channel';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly channels = new Map<string, NotificationChannel>();

  onModuleInit() {
    // Register built-in channels
    this.registerChannel(new ConsoleChannel());
    this.registerChannel(new EmailChannel());
    this.registerChannel(new SmsChannel());

    this.logger.log(`Registered ${this.channels.size} notification channels: ${[...this.channels.keys()].join(', ')}`);
  }

  registerChannel(channel: NotificationChannel): void {
    this.channels.set(channel.name, channel);
  }

  async notify(payload: NotificationPayload): Promise<void> {
    const enabledChannels = [...this.channels.values()].filter((ch) => ch.isEnabled());

    if (enabledChannels.length === 0) {
      this.logger.debug('No enabled notification channels, skipping notification');
      return;
    }

    const results = await Promise.allSettled(
      enabledChannels.map((ch) => ch.send(payload)),
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'rejected') {
        this.logger.warn(
          `Notification channel '${enabledChannels[i].name}' failed: ${result.reason?.message || result.reason}`,
        );
      }
    }
  }

  getRegisteredChannels(): NotificationChannelName[] {
    return [...this.channels.keys()] as NotificationChannelName[];
  }

  getEnabledChannels(): NotificationChannelName[] {
    return [...this.channels.values()]
      .filter((ch) => ch.isEnabled())
      .map((ch) => ch.name);
  }
}
