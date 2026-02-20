# Notification System Specification

## Table of Contents

1. [Feature Overview](#feature-overview)
2. [Architecture](#architecture)
3. [Frontend Implementation](#frontend-implementation)
4. [Backend Implementation](#backend-implementation)
5. [Settings Configuration](#settings-configuration)
6. [Extension Guide](#extension-guide)
7. [Example: Adding Slack Notifications](#example-adding-slack-notifications)
8. [File Inventory](#file-inventory)
9. [Testing](#testing)

---

## Feature Overview

The Notification System provides a unified, extensible framework for delivering user notifications across multiple channels. It enables browser notifications for long-running tasks (Semantic Model generation, Data Agent analysis) while maintaining flexibility for future channels like email, SMS, and Slack.

### Core Capabilities

- **Browser Notifications**: Native OS notifications for long-running tasks when the tab is not visible
- **Extensible Channel Architecture**: Pluggable notification channels with standardized interfaces
- **Error Isolation**: Channel failures are isolated and logged, never blocking the application
- **User Preferences**: Per-user opt-in/opt-out for each notification channel
- **Admin Configuration**: System-wide channel enablement and configuration
- **Frontend-Backend Symmetry**: Consistent channel abstraction on both frontend and backend

### Use Cases

1. **Semantic Model Generation**: Notify when model generation completes or fails
2. **Data Agent Analysis**: Notify when analysis completes or encounters errors
3. **Background Operations**: Any long-running task that benefits from asynchronous completion notification

### Current Limitations

- **Browser Channel Only**: Email and SMS channels are stubs awaiting integration
- **No Notification History**: Notifications are ephemeral (not persisted to database)
- **No Batching**: Each event triggers separate notification (no aggregation)
- **Frontend-Only Permissions**: Permission requests handled exclusively in browser

---

## Architecture

The notification system uses a symmetric architecture with parallel channel registries on frontend and backend:

```
┌──────────────────────────────────────────────────────────────────┐
│                       Frontend Layer                             │
│  React + Material UI                                             │
│                                                                   │
│  NotificationContext (React Context API)                         │
│         ↓                                                         │
│  NotificationService (channel registry + dispatch)               │
│         ↓                                                         │
│  BrowserNotificationChannel (document.hidden check + icon map)   │
│         ↓                                                         │
│  Browser Notification API (native OS notifications)              │
│                                                                   │
│  Integration Points:                                             │
│  - AgentLog: run_complete, run_error                             │
│  - useDataChat: message_complete, message_error                  │
│  - HomePage: permission request on mount                         │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                       Backend Layer                              │
│  NestJS + Fastify + TypeScript                                   │
│                                                                   │
│  NotificationsModule (@Global)                                   │
│         ↓                                                         │
│  NotificationsService (channel registry + dispatch)              │
│         ↓                                                         │
│  Channels:                                                        │
│  - ConsoleChannel (NODE_ENV !== 'production')                    │
│  - EmailChannel (stub, always disabled)                          │
│  - SmsChannel (stub, always disabled)                            │
└──────────────────────────────────────────────────────────────────┘
```

### Data Flow (Example: Semantic Model Complete)

```
1. LangGraph agent completes run
2. SSE emits 'run_complete' event
3. AgentLog.tsx receives event
4. AgentLog calls notify({ title, body, module, severity, clickUrl })
5. NotificationContext generates ID + timestamp
6. NotificationService.notify() dispatches to all available channels
7. BrowserNotificationChannel checks document.hidden
8. If tab hidden: creates native OS notification with icon
9. User clicks notification → window focus + navigate to clickUrl
```

---

## Frontend Implementation

### NotificationChannel Interface

All frontend notification channels implement this interface:

**File**: `apps/web/src/notifications/notification.types.ts`

```typescript
export interface NotificationChannel {
  readonly name: string;
  isAvailable(): boolean;
  requestPermission(): Promise<boolean>;
  getPermissionStatus(): 'granted' | 'denied' | 'default' | 'not-applicable';
  send(notification: AppNotification): Promise<void>;
}
```

### AppNotification Type

**File**: `apps/web/src/types/index.ts`

```typescript
export type NotificationModule = 'semantic-models' | 'data-agent' | 'ontologies';
export type NotificationSeverity = 'success' | 'error' | 'info' | 'warning';
export type BrowserNotificationPermission = 'default' | 'granted' | 'denied';

export interface AppNotification {
  id: string;                        // Generated UUID
  title: string;                     // Notification headline
  body: string;                      // Notification message
  module: NotificationModule;        // Source module
  severity: NotificationSeverity;    // Visual severity indicator
  clickUrl?: string;                 // Optional navigation target
  timestamp: number;                 // Unix timestamp (ms)
}
```

### BrowserNotificationChannel

**File**: `apps/web/src/notifications/channels/BrowserNotificationChannel.ts`

**Key Behaviors**:

1. **Availability Check**: Returns `true` if `'Notification' in window`
2. **Permission Request**: Calls `Notification.requestPermission()` and returns boolean
3. **Permission Status**: Returns browser's permission state or `'not-applicable'`
4. **Conditional Send**: Only sends notification if `document.hidden === true` (tab not visible)
5. **Icon Mapping**: Maps module to static SVG icon:
   - `semantic-models` → `/icons/semantic-models.svg`
   - `data-agent` → `/icons/data-agent.svg`
   - `ontologies` → `/icons/ontologies.svg`
6. **Click Handler**: Focuses window and navigates to `clickUrl` if provided

**Static Icon Files**:
- `apps/web/public/icons/semantic-models.svg`
- `apps/web/public/icons/data-agent.svg`
- `apps/web/public/icons/ontologies.svg`

### NotificationService

**File**: `apps/web/src/notifications/NotificationService.ts`

**Responsibilities**:
- Maintains channel registry (`NotificationChannel[]`)
- Dispatches notifications to all available channels
- Provides permission management utilities

**API**:
```typescript
class NotificationService {
  registerChannel(channel: NotificationChannel): void
  async notify(notification: AppNotification): Promise<void>
  getChannels(): NotificationChannel[]
  async requestAllPermissions(): Promise<Record<string, boolean>>
  getPermissionSummary(): Record<string, string>
}
```

**Error Isolation**: Uses `Promise.allSettled()` to prevent channel failures from blocking other channels. Failed channels log warnings to console.

### NotificationContext + useNotifications Hook

**File**: `apps/web/src/contexts/NotificationContext.tsx`

**Purpose**: Provides React Context API for notification dispatch throughout the app.

**API**:
```typescript
interface NotificationContextValue {
  notify: (notification: Omit<AppNotification, 'id' | 'timestamp'>) => Promise<void>;
  browserPermission: BrowserNotificationPermission;
  requestBrowserPermission: () => Promise<boolean>;
  isSupported: boolean;
}

export function useNotifications(): NotificationContextValue
```

**Lifecycle**:
1. Creates singleton `NotificationService` on first render
2. Creates singleton `BrowserNotificationChannel`
3. Registers browser channel in `useEffect` (once)
4. Tracks permission state in React state
5. Auto-generates `id` and `timestamp` in `notify()` function

**Usage Pattern**:
```typescript
const { notify, browserPermission, requestBrowserPermission } = useNotifications();

// Request permission
await requestBrowserPermission();

// Send notification (id + timestamp auto-generated)
await notify({
  title: 'Analysis Complete',
  body: 'Your query has been answered.',
  module: 'data-agent',
  severity: 'success',
  clickUrl: '/data-agent/chat/123',
});
```

### Integration Points

#### 1. HomePage.tsx (Permission Request)

**File**: `apps/web/src/pages/HomePage.tsx`

Currently removed pending UX design. Previously requested browser notification permission on mount.

Future implementation:
- Display permission status banner
- Provide "Enable Notifications" button
- Show permission instructions for denied state

#### 2. AgentLog.tsx (Semantic Model Generation)

**File**: `apps/web/src/components/semantic-models/AgentLog.tsx`

**SSE Events**:
- `run_complete`: Success notification with semantic model link
- `run_error`: Error notification with failure message

**Implementation**:
```typescript
const { notify } = useNotifications();
const notifyRef = useRef(notify);
notifyRef.current = notify;

// In SSE event handler
case 'run_complete':
  notifyRef.current({
    title: event.semanticModelId ? 'Semantic Model Ready' : 'Model Generation Complete',
    body: event.failedTables?.length
      ? `Generated with ${event.failedTables.length} table(s) skipped.`
      : 'Successfully generated semantic model.',
    module: 'semantic-models',
    severity: 'success',
    clickUrl: event.semanticModelId ? `/semantic-models/${event.semanticModelId}` : undefined,
  });
  break;

case 'run_error':
  notifyRef.current({
    title: 'Model Generation Failed',
    body: event.message || 'An error occurred during generation.',
    module: 'semantic-models',
    severity: 'error',
  });
  break;
```

**Why `notifyRef`**: Prevents stale closure issues in SSE event handler (event listener persists across re-renders).

#### 3. useDataChat.ts (Data Agent Analysis)

**File**: `apps/web/src/hooks/useDataChat.ts`

**SSE Events**:
- `message_complete`: Success notification (skipped for clarification requests)
- `message_error`: Error notification with failure message

**Implementation**:
```typescript
const { notify } = useNotifications();
const notifyRef = useRef(notify);
notifyRef.current = notify;

// In SSE event handler
case 'message_complete':
  if ((event as any).status !== 'clarification_needed') {
    notifyRef.current({
      title: 'Analysis Complete',
      body: ((event as any).content || 'Your query has been answered.').slice(0, 120),
      module: 'data-agent',
      severity: 'success',
      clickUrl: `/data-agent/chat/${chatId}`,
    });
  }
  break;

case 'message_error':
  notifyRef.current({
    title: 'Analysis Failed',
    body: (event as any).message || 'An error occurred.',
    module: 'data-agent',
    severity: 'error',
  });
  break;
```

**Why truncate body**: Browser notifications have character limits. Truncating at 120 chars ensures consistent display.

---

## Backend Implementation

### NotificationChannel Interface

All backend notification channels implement this interface:

**File**: `apps/api/src/notifications/notifications.types.ts`

```typescript
export type NotificationChannelName = 'console' | 'email' | 'sms';

export interface NotificationChannel {
  readonly name: NotificationChannelName;
  isEnabled(): boolean;
  send(payload: NotificationPayload): Promise<void>;
}

export interface NotificationPayload {
  title: string;
  body: string;
  module: 'semantic-models' | 'data-agent' | 'ontologies';
  severity: 'success' | 'error' | 'info' | 'warning';
  clickUrl?: string;
  userId: string;
  metadata?: Record<string, unknown>;
}
```

**Key Differences from Frontend**:
- `name` is typed union (not free-form string)
- `userId` is required (identifies recipient)
- No `id` or `timestamp` (backend doesn't generate these)
- No `requestPermission()` or `getPermissionStatus()` (backend doesn't manage permissions)

### NotificationsModule

**File**: `apps/api/src/notifications/notifications.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Module({
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
```

**Integration**: Module is imported wherever notifications are needed (currently not used, reserved for future server-side notification triggers).

### NotificationsService

**File**: `apps/api/src/notifications/notifications.service.ts`

**Lifecycle**:
1. `onModuleInit()`: Registers all built-in channels (Console, Email, SMS)
2. Logs registered channels to console

**API**:
```typescript
class NotificationsService {
  registerChannel(channel: NotificationChannel): void
  async notify(payload: NotificationPayload): Promise<void>
  getRegisteredChannels(): NotificationChannelName[]
  getEnabledChannels(): NotificationChannelName[]
}
```

**Error Isolation**: Uses `Promise.allSettled()` to prevent channel failures from blocking other channels. Failed channels log warnings via NestJS Logger.

**Dispatch Logic**:
```typescript
async notify(payload: NotificationPayload): Promise<void> {
  const enabledChannels = [...this.channels.values()].filter((ch) => ch.isEnabled());

  if (enabledChannels.length === 0) {
    this.logger.debug('No enabled notification channels, skipping notification');
    return;
  }

  const results = await Promise.allSettled(
    enabledChannels.map((ch) => ch.send(payload)),
  );

  // Log failures
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'rejected') {
      this.logger.warn(
        `Notification channel '${enabledChannels[i].name}' failed: ${result.reason?.message || result.reason}`,
      );
    }
  }
}
```

### ConsoleChannel (Functional)

**File**: `apps/api/src/notifications/channels/console.channel.ts`

**Purpose**: Logs notifications to console for development/debugging.

**Enablement Logic**: `process.env.NODE_ENV !== 'production'`

**Output Format**:
```
[NOTIFICATION] [SEVERITY] Title: Body (module=semantic-models, user=user-123)
```

**Example**:
```
[NOTIFICATION] [SUCCESS] Semantic Model Ready: Successfully generated semantic model. (module=semantic-models, user=user-456)
```

### EmailChannel (Stub)

**File**: `apps/api/src/notifications/channels/email.channel.ts`

**Status**: Stub implementation awaiting SMTP integration.

**Enablement Logic**: Always returns `false` (TODO: check `SystemSettings.notifications.email.enabled`)

**Behavior**: Logs warning and throws error when `send()` is called.

**Future Integration**:
- Check `SystemSettings.notifications.email.enabled`
- Check `UserSettings.notifications.email` (opt-in)
- Integrate SMTP library (e.g., `nodemailer`)
- Fetch user email from database
- Render HTML email template
- Send email via SMTP

### SmsChannel (Stub)

**File**: `apps/api/src/notifications/channels/sms.channel.ts`

**Status**: Stub implementation awaiting Twilio/SMS provider integration.

**Enablement Logic**: Always returns `false` (TODO: check `SystemSettings.notifications.sms.enabled`)

**Behavior**: Logs warning and throws error when `send()` is called.

**Future Integration**:
- Check `SystemSettings.notifications.sms.enabled`
- Check `UserSettings.notifications.sms` (opt-in)
- Integrate SMS provider (e.g., Twilio SDK)
- Fetch user phone number from database
- Format SMS message (160 char limit)
- Send SMS via provider API

---

## Settings Configuration

### SystemSettings (Admin Configuration)

**File**: `apps/api/src/common/types/settings.types.ts`

```typescript
export interface SystemSettings {
  // ... other settings
  notifications?: {
    email?: { enabled: boolean };
    sms?: { enabled: boolean };
  };
}
```

**Schema**: `apps/api/src/common/schemas/settings.schema.ts`

```typescript
const notificationChannelConfigSchema = z.object({
  enabled: z.boolean(),
});

export const systemSettingsSchema = z.object({
  // ... other fields
  notifications: z
    .object({
      email: notificationChannelConfigSchema.optional(),
      sms: notificationChannelConfigSchema.optional(),
    })
    .optional(),
});
```

**Purpose**: Global channel enablement. If `email.enabled` is `false`, **no user** receives email notifications regardless of user preferences.

**Future Admin UI**: Settings page → "Notifications" tab → toggles for email/SMS with configuration fields (SMTP host, Twilio API key, etc.).

### UserSettings (User Preferences)

**File**: `apps/api/src/common/types/settings.types.ts`

```typescript
export interface UserSettings {
  // ... other settings
  notifications?: {
    browser?: boolean;
    email?: boolean;
    sms?: boolean;
  };
}
```

**Schema**: `apps/api/src/common/schemas/settings.schema.ts`

```typescript
export const userSettingsSchema = z.object({
  // ... other fields
  notifications: z
    .object({
      browser: z.boolean().optional(),
      email: z.boolean().optional(),
      sms: z.boolean().optional(),
    })
    .optional(),
});
```

**Purpose**: Per-user opt-in/opt-out for each notification channel.

**Defaults** (when `notifications` object is undefined or channel is missing):
- `browser`: `true` (opt-in by default)
- `email`: `false` (opt-out by default)
- `sms`: `false` (opt-out by default)

**Future User UI**: User profile → "Notifications" tab → checkboxes for browser/email/SMS.

### Effective Channel Enablement Logic

For a notification to be sent via a channel:

1. **System-Level**: `SystemSettings.notifications[channel].enabled === true` (email/SMS only)
2. **User-Level**: `UserSettings.notifications[channel] === true`

**Browser Channel Exception**: Browser notifications are frontend-only and don't respect `SystemSettings`. Admins cannot disable browser notifications system-wide.

---

## Extension Guide

This section provides step-by-step instructions for adding a new notification channel.

### Step 1: Create Backend Channel

Create a new channel class implementing the `NotificationChannel` interface.

**File**: `apps/api/src/notifications/channels/{channel-name}.channel.ts`

**Template**:
```typescript
import { Logger } from '@nestjs/common';
import type { NotificationChannel, NotificationPayload } from '../notifications.types';

export class MyChannel implements NotificationChannel {
  readonly name = 'my-channel' as const;
  private readonly logger = new Logger(MyChannel.name);

  isEnabled(): boolean {
    // Check SystemSettings.notifications.myChannel.enabled
    return false; // TODO: implement
  }

  async send(payload: NotificationPayload): Promise<void> {
    // 1. Check user preference: UserSettings.notifications.myChannel
    // 2. Fetch user contact info (email, phone, Slack user ID, etc.)
    // 3. Format message for channel
    // 4. Send via channel API
    // 5. Log success/failure

    this.logger.log(`Sent notification to user ${payload.userId}: ${payload.title}`);
  }
}
```

### Step 2: Register Channel in NotificationsModule

**File**: `apps/api/src/notifications/notifications.service.ts`

Add channel registration in `onModuleInit()`:

```typescript
import { MyChannel } from './channels/my-channel.channel';

@Injectable()
export class NotificationsService implements OnModuleInit {
  onModuleInit() {
    this.registerChannel(new ConsoleChannel());
    this.registerChannel(new EmailChannel());
    this.registerChannel(new SmsChannel());
    this.registerChannel(new MyChannel()); // Add this line
  }
}
```

### Step 3: Add Channel to Type System

**File**: `apps/api/src/notifications/notifications.types.ts`

Update `NotificationChannelName` union:

```typescript
export type NotificationChannelName = 'console' | 'email' | 'sms' | 'my-channel';
```

### Step 4: Update Settings Schemas

**System Settings** (`apps/api/src/common/schemas/settings.schema.ts`):

```typescript
export const systemSettingsSchema = z.object({
  // ... other fields
  notifications: z
    .object({
      email: notificationChannelConfigSchema.optional(),
      sms: notificationChannelConfigSchema.optional(),
      myChannel: notificationChannelConfigSchema.optional(), // Add this line
    })
    .optional(),
});
```

**User Settings** (`apps/api/src/common/schemas/settings.schema.ts`):

```typescript
export const userSettingsSchema = z.object({
  // ... other fields
  notifications: z
    .object({
      browser: z.boolean().optional(),
      email: z.boolean().optional(),
      sms: z.boolean().optional(),
      myChannel: z.boolean().optional(), // Add this line
    })
    .optional(),
});
```

**Types** (`apps/api/src/common/types/settings.types.ts`):

```typescript
export interface SystemSettings {
  // ... other fields
  notifications?: {
    email?: { enabled: boolean };
    sms?: { enabled: boolean };
    myChannel?: { enabled: boolean }; // Add this line
  };
}

export interface UserSettings {
  // ... other fields
  notifications?: {
    browser?: boolean;
    email?: boolean;
    sms?: boolean;
    myChannel?: boolean; // Add this line
  };
}
```

### Step 5: Update SystemSettings Merge Logic

**File**: `apps/api/src/settings/settings.service.ts`

Find the `getSystemSettings()` method and update the default merge:

```typescript
async getSystemSettings(): Promise<SystemSettings> {
  const row = await this.prisma.systemSettings.findUnique({
    where: { id: SYSTEM_SETTINGS_ID },
  });

  const defaults: SystemSettings = {
    ui: { allowUserThemeOverride: true },
    features: {},
    notifications: {
      email: { enabled: false },
      sms: { enabled: false },
      myChannel: { enabled: false }, // Add this line
    },
  };

  // ... rest of method
}
```

### Step 6: (Optional) Add Frontend Channel

If the channel requires frontend-driven behavior (like browser notifications), create a frontend channel:

**File**: `apps/web/src/notifications/channels/MyChannel.ts`

```typescript
import type { AppNotification } from '../../types';
import type { NotificationChannel } from '../notification.types';

export class MyChannel implements NotificationChannel {
  readonly name = 'my-channel';

  isAvailable(): boolean {
    // Check if channel is available in browser
    return true;
  }

  async requestPermission(): Promise<boolean> {
    // Request permission if needed
    return true;
  }

  getPermissionStatus(): 'granted' | 'denied' | 'default' | 'not-applicable' {
    return 'not-applicable';
  }

  async send(notification: AppNotification): Promise<void> {
    // Send notification via channel
  }
}
```

**Register in NotificationContext** (`apps/web/src/contexts/NotificationContext.tsx`):

```typescript
import { MyChannel } from '../notifications/channels/MyChannel';

export function NotificationProvider({ children }: NotificationProviderProps) {
  const myChannelRef = useRef<MyChannel | null>(null);

  if (!myChannelRef.current) {
    myChannelRef.current = new MyChannel();
  }

  useEffect(() => {
    if (!initializedRef.current && serviceRef.current && myChannelRef.current) {
      serviceRef.current.registerChannel(browserChannelRef.current!);
      serviceRef.current.registerChannel(myChannelRef.current); // Add this line
      initializedRef.current = true;
    }
  }, []);

  // ... rest of provider
}
```

### Step 7: Add Admin UI

Create admin settings UI for channel configuration:

**File**: `apps/web/src/components/settings/NotificationSettings.tsx` (new file)

```typescript
export function NotificationSettings() {
  const { systemSettings, updateSystemSettings } = useSystemSettings();

  const handleToggle = async (channel: string, enabled: boolean) => {
    await updateSystemSettings({
      notifications: {
        ...systemSettings.notifications,
        [channel]: { enabled },
      },
    });
  };

  return (
    <Box>
      <Typography variant="h6">Notification Channels</Typography>
      <FormControlLabel
        control={
          <Switch
            checked={systemSettings.notifications?.myChannel?.enabled ?? false}
            onChange={(e) => handleToggle('myChannel', e.target.checked)}
          />
        }
        label="My Channel Notifications"
      />
    </Box>
  );
}
```

**Add to Settings Page** (`apps/web/src/pages/admin/SettingsPage.tsx`):

```typescript
import { NotificationSettings } from '../../components/settings/NotificationSettings';

// Add new tab
const tabs = [
  { label: 'UI Settings', value: 'ui' },
  { label: 'Notifications', value: 'notifications' }, // Add this line
];

// Add tab panel
{activeTab === 'notifications' && <NotificationSettings />}
```

### Step 8: Add User Preference UI

Create user preference toggle:

**File**: `apps/web/src/components/settings/UserNotificationPreferences.tsx` (new file)

```typescript
export function UserNotificationPreferences() {
  const { userSettings, updateUserSettings } = useUserSettings();

  const handleToggle = async (channel: string, enabled: boolean) => {
    await updateUserSettings({
      notifications: {
        ...userSettings.notifications,
        [channel]: enabled,
      },
    });
  };

  return (
    <Box>
      <Typography variant="h6">Notification Preferences</Typography>
      <FormControlLabel
        control={
          <Switch
            checked={userSettings.notifications?.myChannel ?? false}
            onChange={(e) => handleToggle('myChannel', e.target.checked)}
          />
        }
        label="Receive My Channel Notifications"
      />
    </Box>
  );
}
```

---

## Example: Adding Slack Notifications

This section demonstrates adding Slack as a notification channel using the Slack Web API.

### Backend Implementation

**1. Install Slack SDK**:
```bash
cd apps/api && npm install @slack/web-api
```

**2. Create SlackChannel**:

**File**: `apps/api/src/notifications/channels/slack.channel.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { WebClient } from '@slack/web-api';
import type { NotificationChannel, NotificationPayload } from '../notifications.types';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../../settings/settings.service';

@Injectable()
export class SlackChannel implements NotificationChannel {
  readonly name = 'slack' as const;
  private readonly logger = new Logger(SlackChannel.name);
  private client: WebClient | null = null;

  constructor(
    private readonly settingsService: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  isEnabled(): boolean {
    const systemSettings = this.settingsService.getSystemSettingsSync();
    return systemSettings.notifications?.slack?.enabled ?? false;
  }

  async send(payload: NotificationPayload): Promise<void> {
    // 1. Check user preference
    const userSettings = await this.settingsService.getUserSettings(payload.userId);
    if (!userSettings.notifications?.slack) {
      this.logger.debug(`User ${payload.userId} has Slack notifications disabled`);
      return;
    }

    // 2. Get user's Slack user ID from database
    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
      select: { slackUserId: true },
    });

    if (!user?.slackUserId) {
      this.logger.warn(`User ${payload.userId} does not have a Slack user ID configured`);
      return;
    }

    // 3. Initialize Slack client (lazy)
    if (!this.client) {
      const systemSettings = await this.settingsService.getSystemSettings();
      const botToken = systemSettings.notifications?.slack?.botToken;

      if (!botToken) {
        throw new Error('Slack bot token not configured in SystemSettings');
      }

      this.client = new WebClient(botToken);
    }

    // 4. Format Slack message
    const icon = this.getSeverityIcon(payload.severity);
    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${icon} *${payload.title}*\n${payload.body}`,
        },
      },
    ];

    if (payload.clickUrl) {
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View Details' },
            url: `${process.env.APP_URL}${payload.clickUrl}`,
          },
        ],
      });
    }

    // 5. Send message
    try {
      await this.client.chat.postMessage({
        channel: user.slackUserId,
        blocks,
        text: `${payload.title}: ${payload.body}`, // Fallback for notifications
      });

      this.logger.log(`Sent Slack notification to user ${payload.userId}`);
    } catch (error) {
      this.logger.error(`Failed to send Slack notification: ${error.message}`);
      throw error;
    }
  }

  private getSeverityIcon(severity: NotificationPayload['severity']): string {
    const icons = {
      success: ':white_check_mark:',
      error: ':x:',
      warning: ':warning:',
      info: ':information_source:',
    };
    return icons[severity] || icons.info;
  }
}
```

**3. Add `slackUserId` column to User model**:

**File**: `apps/api/prisma/schema.prisma`

```prisma
model User {
  id              String   @id @default(uuid())
  // ... other fields
  slackUserId     String?  @map("slack_user_id")
}
```

**Migration**:
```bash
cd apps/api && npm run prisma:migrate:dev -- --name add_slack_user_id
```

**4. Update Settings Types**:

**File**: `apps/api/src/common/types/settings.types.ts`

```typescript
export interface SystemSettings {
  notifications?: {
    email?: { enabled: boolean };
    sms?: { enabled: boolean };
    slack?: {
      enabled: boolean;
      botToken?: string;
    };
  };
}

export interface UserSettings {
  notifications?: {
    browser?: boolean;
    email?: boolean;
    sms?: boolean;
    slack?: boolean;
  };
}
```

**5. Update Settings Schemas**:

**File**: `apps/api/src/common/schemas/settings.schema.ts`

```typescript
const slackChannelConfigSchema = z.object({
  enabled: z.boolean(),
  botToken: z.string().optional(),
});

export const systemSettingsSchema = z.object({
  notifications: z
    .object({
      email: notificationChannelConfigSchema.optional(),
      sms: notificationChannelConfigSchema.optional(),
      slack: slackChannelConfigSchema.optional(),
    })
    .optional(),
});

export const userSettingsSchema = z.object({
  notifications: z
    .object({
      browser: z.boolean().optional(),
      email: z.boolean().optional(),
      sms: z.boolean().optional(),
      slack: z.boolean().optional(),
    })
    .optional(),
});
```

**6. Register Channel**:

**File**: `apps/api/src/notifications/notifications.service.ts`

```typescript
import { SlackChannel } from './channels/slack.channel';
import { SettingsService } from '../settings/settings.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService implements OnModuleInit {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.registerChannel(new ConsoleChannel());
    this.registerChannel(new EmailChannel());
    this.registerChannel(new SmsChannel());
    this.registerChannel(new SlackChannel(this.settingsService, this.prisma));
  }
}
```

**Update Module**:

**File**: `apps/api/src/notifications/notifications.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { SettingsModule } from '../settings/settings.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [SettingsModule, PrismaModule],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
```

**7. Add Admin UI**:

**File**: `apps/web/src/components/settings/SlackSettings.tsx`

```typescript
import { Box, Switch, FormControlLabel, TextField, Alert } from '@mui/material';
import { useSystemSettings } from '../../hooks/useSystemSettings';

export function SlackSettings() {
  const { systemSettings, updateSystemSettings, isLoading } = useSystemSettings();

  const handleEnabledToggle = async (enabled: boolean) => {
    await updateSystemSettings({
      notifications: {
        ...systemSettings.notifications,
        slack: {
          ...systemSettings.notifications?.slack,
          enabled,
        },
      },
    });
  };

  const handleBotTokenChange = async (botToken: string) => {
    await updateSystemSettings({
      notifications: {
        ...systemSettings.notifications,
        slack: {
          ...systemSettings.notifications?.slack,
          botToken,
        },
      },
    });
  };

  return (
    <Box>
      <FormControlLabel
        control={
          <Switch
            checked={systemSettings.notifications?.slack?.enabled ?? false}
            onChange={(e) => handleEnabledToggle(e.target.checked)}
            disabled={isLoading}
          />
        }
        label="Enable Slack Notifications"
      />

      {systemSettings.notifications?.slack?.enabled && (
        <>
          <TextField
            fullWidth
            label="Slack Bot Token"
            type="password"
            value={systemSettings.notifications?.slack?.botToken ?? ''}
            onChange={(e) => handleBotTokenChange(e.target.value)}
            margin="normal"
            helperText="Bot token from Slack App configuration (xoxb-...)"
          />

          <Alert severity="info" sx={{ mt: 2 }}>
            To set up Slack notifications:
            <ol>
              <li>Create a Slack App at api.slack.com/apps</li>
              <li>Add OAuth scope: chat:write</li>
              <li>Install app to workspace</li>
              <li>Copy Bot User OAuth Token and paste above</li>
              <li>Users must set their Slack user ID in profile settings</li>
            </ol>
          </Alert>
        </>
      )}
    </Box>
  );
}
```

**8. Add User Preference**:

**File**: `apps/web/src/components/profile/NotificationPreferences.tsx`

```typescript
import { FormControlLabel, Switch, TextField, Box } from '@mui/material';
import { useUserSettings } from '../../hooks/useUserSettings';

export function NotificationPreferences() {
  const { userSettings, updateUserSettings, isLoading } = useUserSettings();

  const handleToggle = async (channel: string, enabled: boolean) => {
    await updateUserSettings({
      notifications: {
        ...userSettings.notifications,
        [channel]: enabled,
      },
    });
  };

  return (
    <Box>
      <FormControlLabel
        control={
          <Switch
            checked={userSettings.notifications?.slack ?? false}
            onChange={(e) => handleToggle('slack', e.target.checked)}
            disabled={isLoading}
          />
        }
        label="Slack Notifications"
      />

      {/* Note: Slack user ID would be set via user profile, not here */}
    </Box>
  );
}
```

**9. Test**:

```typescript
// In any service that triggers notifications
await this.notificationsService.notify({
  title: 'Semantic Model Ready',
  body: 'Successfully generated semantic model for PostgreSQL connection.',
  module: 'semantic-models',
  severity: 'success',
  clickUrl: '/semantic-models/123',
  userId: 'user-456',
  metadata: { semanticModelId: '123' },
});
```

This will dispatch to all enabled channels (Console, Slack, etc.).

---

## File Inventory

### Frontend Files

**Core Notification System**:
- `apps/web/src/notifications/notification.types.ts` - NotificationChannel interface
- `apps/web/src/notifications/NotificationService.ts` - Channel registry + dispatch
- `apps/web/src/notifications/channels/BrowserNotificationChannel.ts` - Browser channel implementation
- `apps/web/src/contexts/NotificationContext.tsx` - React Context + useNotifications hook
- `apps/web/src/types/index.ts` - AppNotification, NotificationModule, NotificationSeverity types

**Integration Points**:
- `apps/web/src/components/semantic-models/AgentLog.tsx` - Semantic model run notifications
- `apps/web/src/hooks/useDataChat.ts` - Data agent analysis notifications
- `apps/web/src/pages/HomePage.tsx` - Permission request (currently removed)

**Static Assets**:
- `apps/web/public/icons/semantic-models.svg` - Semantic model notification icon
- `apps/web/public/icons/data-agent.svg` - Data agent notification icon
- `apps/web/public/icons/ontologies.svg` - Ontology notification icon

### Backend Files

**Core Notification System**:
- `apps/api/src/notifications/notifications.types.ts` - Backend types (NotificationChannel, NotificationPayload)
- `apps/api/src/notifications/notifications.service.ts` - Channel registry + dispatch service
- `apps/api/src/notifications/notifications.module.ts` - NestJS module
- `apps/api/src/notifications/channels/console.channel.ts` - Console channel (functional)
- `apps/api/src/notifications/channels/email.channel.ts` - Email channel (stub)
- `apps/api/src/notifications/channels/sms.channel.ts` - SMS channel (stub)

**Settings Configuration**:
- `apps/api/src/common/types/settings.types.ts` - SystemSettings + UserSettings types (notifications section)
- `apps/api/src/common/schemas/settings.schema.ts` - Zod schemas for notifications config

**Tests**:
- `apps/api/src/notifications/__tests__/notifications.service.spec.ts` - Backend service tests (100% coverage)

---

## Testing

### Backend Tests

**File**: `apps/api/src/notifications/__tests__/notifications.service.spec.ts`

**Coverage**: 322 lines, 13 test suites

**Test Categories**:

1. **Module Initialization**:
   - Registers all built-in channels on module init
   - Logs registered channels

2. **Channel Registry**:
   - `getRegisteredChannels()` returns all channels
   - `getEnabledChannels()` returns only enabled channels
   - `registerChannel()` allows custom channels

3. **Notification Dispatch**:
   - Dispatches to enabled channels only
   - Skips all channels when none are enabled
   - Isolates channel errors using `Promise.allSettled`
   - Handles errors without message property
   - Handles empty payload gracefully

4. **ConsoleChannel**:
   - Enabled when `NODE_ENV !== 'production'`
   - Disabled when `NODE_ENV === 'production'`
   - Logs notification in correct format
   - Formats severity as uppercase

5. **EmailChannel (Stub)**:
   - Always disabled
   - Throws error when send is called
   - Logs warning when send is attempted

6. **SmsChannel (Stub)**:
   - Always disabled
   - Throws error when send is called
   - Logs warning when send is attempted

**Run Tests**:
```bash
cd apps/api
npm test -- notifications.service.spec.ts
```

**Coverage**: 100% (statements, branches, functions, lines)

### Frontend Tests

**Status**: No dedicated notification tests currently.

**Future Test Coverage**:

1. **BrowserNotificationChannel**:
   - `isAvailable()` checks for Notification API
   - `requestPermission()` calls browser API
   - `send()` skips when `document.hidden === false`
   - `send()` creates notification when `document.hidden === true`
   - Click handler focuses window and navigates

2. **NotificationService**:
   - Registers channels
   - Dispatches to all available channels
   - Isolates channel errors
   - Returns permission summary

3. **useNotifications Hook**:
   - Auto-generates notification ID
   - Auto-generates timestamp
   - Tracks browser permission state
   - Requests permission correctly

4. **Integration Tests**:
   - AgentLog dispatches on `run_complete` and `run_error`
   - useDataChat dispatches on `message_complete` and `message_error`
   - HomePage requests permission on mount (when implemented)

**Run Tests** (when implemented):
```bash
cd apps/web
npm test -- notification
```

### Manual Testing

**Test Scenario**: Semantic Model Generation Notification

1. Navigate to `/semantic-models/new`
2. Open browser DevTools → Application → Notifications
3. Verify permission is "Granted" (if not, grant it)
4. Create semantic model and start generation
5. Switch to a different browser tab (make Knecta tab inactive)
6. Wait for generation to complete
7. Verify OS notification appears with:
   - Title: "Semantic Model Ready" or "Model Generation Failed"
   - Body: Success/failure message
   - Icon: Semantic model icon
8. Click notification
9. Verify browser focuses on Knecta tab and navigates to semantic model detail page

**Test Scenario**: Data Agent Analysis Notification

1. Navigate to `/data-agent`
2. Ensure browser notification permission is granted
3. Create new chat and ask a question
4. Switch to different browser tab
5. Wait for analysis to complete
6. Verify OS notification appears
7. Click notification
8. Verify navigation to chat page

**Test Scenario**: Permission Denied

1. Open browser settings → Notifications
2. Block notifications for localhost:8319
3. Reload Knecta app
4. Verify no notifications appear (graceful degradation)
5. Verify no errors in console
6. Re-enable notifications
7. Verify notifications work again

---

## Summary

The Notification System provides a production-ready, extensible framework for multi-channel user notifications. The browser notification channel is fully functional, while email and SMS channels are stubbed for future integration. The system emphasizes error isolation, user control, and straightforward extension patterns, making it easy to add new channels like Slack, Discord, or push notifications.
