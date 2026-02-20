import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  ReactNode,
  useEffect,
} from 'react';
import type { AppNotification, BrowserNotificationPermission } from '../types';
import { NotificationService } from '../notifications/NotificationService';
import { BrowserNotificationChannel } from '../notifications/channels/BrowserNotificationChannel';

interface NotificationContextValue {
  notify: (notification: Omit<AppNotification, 'id' | 'timestamp'>) => Promise<void>;
  browserPermission: BrowserNotificationPermission;
  requestBrowserPermission: () => Promise<boolean>;
  isSupported: boolean;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export { NotificationContext };

interface NotificationProviderProps {
  children: ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  // Create NotificationService singleton
  const serviceRef = useRef<NotificationService | null>(null);
  const browserChannelRef = useRef<BrowserNotificationChannel | null>(null);
  const initializedRef = useRef(false);

  // Initialize service and channel once
  if (!serviceRef.current) {
    serviceRef.current = new NotificationService();
  }
  if (!browserChannelRef.current) {
    browserChannelRef.current = new BrowserNotificationChannel();
  }

  // Register browser channel once
  useEffect(() => {
    if (!initializedRef.current && serviceRef.current && browserChannelRef.current) {
      serviceRef.current.registerChannel(browserChannelRef.current);
      initializedRef.current = true;
    }
  }, []);

  // Track browser permission state
  const [browserPermission, setBrowserPermission] = useState<BrowserNotificationPermission>(() => {
    if ('Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });

  // Check if notifications are supported
  const isSupported = 'Notification' in window;

  // Notify function
  const notify = useCallback(
    async (notification: Omit<AppNotification, 'id' | 'timestamp'>) => {
      const id =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : Date.now().toString(36) + Math.random().toString(36).slice(2);

      const fullNotification: AppNotification = {
        ...notification,
        id,
        timestamp: Date.now(),
      };

      await serviceRef.current?.notify(fullNotification);
    },
    [],
  );

  // Request browser permission
  const requestBrowserPermission = useCallback(async () => {
    if (!browserChannelRef.current) {
      return false;
    }

    const granted = await browserChannelRef.current.requestPermission();

    // Update state
    if ('Notification' in window) {
      setBrowserPermission(Notification.permission);
    }

    return granted;
  }, []);

  const value: NotificationContextValue = {
    notify,
    browserPermission,
    requestBrowserPermission,
    isSupported,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
