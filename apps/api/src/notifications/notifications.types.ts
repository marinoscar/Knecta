export type NotificationChannelName = 'console' | 'email' | 'sms';

export interface NotificationPayload {
  title: string;
  body: string;
  module: 'semantic-models' | 'data-agent' | 'ontologies';
  severity: 'success' | 'error' | 'info' | 'warning';
  clickUrl?: string;
  userId: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationChannel {
  readonly name: NotificationChannelName;
  isEnabled(): boolean;
  send(payload: NotificationPayload): Promise<void>;
}
