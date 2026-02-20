import { Logger } from '@nestjs/common';
import type { NotificationChannel, NotificationPayload } from '../notifications.types';

export class SmsChannel implements NotificationChannel {
  readonly name = 'sms' as const;
  private readonly logger = new Logger(SmsChannel.name);

  isEnabled(): boolean {
    // TODO: Check SystemSettings.notifications.sms.enabled
    return false;
  }

  async send(payload: NotificationPayload): Promise<void> {
    this.logger.warn(`SMS channel not yet implemented. Would send: "${payload.title}" to user ${payload.userId}`);
    throw new Error('SMS notification channel is not yet implemented. Configure SMS provider (e.g., Twilio) to enable.');
  }
}
