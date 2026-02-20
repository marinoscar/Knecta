import { Logger } from '@nestjs/common';
import type { NotificationChannel, NotificationPayload } from '../notifications.types';

export class EmailChannel implements NotificationChannel {
  readonly name = 'email' as const;
  private readonly logger = new Logger(EmailChannel.name);

  isEnabled(): boolean {
    // TODO: Check SystemSettings.notifications.email.enabled
    return false;
  }

  async send(payload: NotificationPayload): Promise<void> {
    this.logger.warn(`Email channel not yet implemented. Would send: "${payload.title}" to user ${payload.userId}`);
    throw new Error('Email notification channel is not yet implemented. Configure SMTP settings to enable.');
  }
}
