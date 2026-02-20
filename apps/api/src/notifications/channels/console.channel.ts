import { Logger } from '@nestjs/common';
import type { NotificationChannel, NotificationPayload } from '../notifications.types';

export class ConsoleChannel implements NotificationChannel {
  readonly name = 'console' as const;
  private readonly logger = new Logger(ConsoleChannel.name);

  isEnabled(): boolean {
    return process.env.NODE_ENV !== 'production';
  }

  async send(payload: NotificationPayload): Promise<void> {
    this.logger.log(
      `[NOTIFICATION] [${payload.severity.toUpperCase()}] ${payload.title}: ${payload.body} (module=${payload.module}, user=${payload.userId})`,
    );
  }
}
