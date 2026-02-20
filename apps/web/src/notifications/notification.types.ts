import type { AppNotification } from '../types';

export interface NotificationChannel {
  readonly name: string;
  isAvailable(): boolean;
  requestPermission(): Promise<boolean>;
  getPermissionStatus(): 'granted' | 'denied' | 'default' | 'not-applicable';
  send(notification: AppNotification): Promise<void>;
}
