# Settings Feature Specification

## Table of Contents

1. [Feature Overview](#feature-overview)
2. [Architecture](#architecture)
3. [User Settings](#user-settings)
4. [System Settings](#system-settings)
5. [RBAC Permissions](#rbac-permissions)
6. [Database Schema](#database-schema)
7. [API Endpoints](#api-endpoints)
8. [Frontend Components](#frontend-components)
9. [Key Patterns](#key-patterns)
10. [File Inventory](#file-inventory)
11. [Testing](#testing)
12. [Configuration](#configuration)

---

## Feature Overview

The Settings feature provides a flexible, type-safe configuration framework for both user-level and system-level application settings. Settings are stored as JSONB in PostgreSQL with Zod validation, optimistic concurrency control, and deep partial updates.

### Core Capabilities

- **User Settings**: Per-user preferences (theme, profile, default LLM provider)
- **System Settings**: Global application configuration (feature flags, UI overrides, Data Agent provider config)
- **Optimistic Concurrency**: Version-based conflict detection with 409 responses
- **Deep Partial Updates**: PATCH endpoints support nested object merging
- **Audit Trails**: All system settings changes logged to `audit_events` table
- **Type Safety**: Zod schemas for validation + TypeScript types for frontend
- **Display Name Sync**: User settings `profile.displayName` automatically syncs to `users.display_name` column
- **JSONB Flexibility**: Schema evolution without migrations

### Use Cases

1. **User Customization**: Users set theme preference, profile image, and default LLM provider
2. **Admin Control**: Admins configure feature flags and global UI settings
3. **Data Agent Configuration**: Admins configure per-provider LLM model settings (temperature, reasoning level)
4. **Graceful Defaults**: Missing settings keys use default values from Zod schemas
5. **Concurrent Updates**: Multiple admin sessions prevented from overwriting each other's changes

---

## Architecture

The settings framework follows a clean layered architecture with JSONB storage and version-based concurrency:

```
┌─────────────────────────────────────────────────────────────┐
│                       Frontend Layer                        │
│  React + Material UI + TypeScript                           │
│                                                               │
│  SettingsPage → useUserSettings hook → API client          │
│  SystemSettingsPage → useSystemSettings hook → API client  │
│  ThemeSettings, ProfileSettings, DefaultProviderSettings    │
│  UISettings, FeatureFlagsList, DataAgentSettings            │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTPS (Nginx)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                       Backend Layer                         │
│  NestJS + Fastify + TypeScript                              │
│                                                               │
│  UserSettingsController (GET/PUT/PATCH)                     │
│         ↓                                                    │
│  UserSettingsService (JSONB merge + display_name sync)      │
│         ↓                                                    │
│  SystemSettingsController (GET/PUT/PATCH, Admin only)       │
│         ↓                                                    │
│  SystemSettingsService (JSONB merge + audit logging)        │
└────────────────────────────┬────────────────────────────────┘
                             │ Prisma ORM
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                      Database Layer                         │
│  PostgreSQL                                                  │
│                                                               │
│  user_settings table (JSONB value, version, userId FK)      │
│  system_settings table (JSONB value, version, key='global') │
│  users table (display_name column synced from user_settings)│
│  audit_events table (system settings change log)            │
└─────────────────────────────────────────────────────────────┘
```

### Layer Responsibilities

#### Frontend
- **Pages**: `SettingsPage.tsx` (user), `SystemSettingsPage.tsx` (admin)
- **Components**: `ThemeSettings.tsx`, `ProfileSettings.tsx`, `DefaultProviderSettings.tsx`, `UISettings.tsx`, `FeatureFlagsList.tsx`, `DataAgentSettings.tsx`, `SystemSettingsEditor.tsx`
- **Hooks**: `useUserSettings.ts`, `useSystemSettings.ts` - State management and optimistic concurrency
- **Types**: TypeScript interfaces matching Zod schemas
- **API Client**: `services/api.ts` - HTTP requests with `If-Match` header handling

#### Backend
- **Controllers**: `user-settings.controller.ts`, `system-settings.controller.ts` - HTTP endpoints + OpenAPI docs
- **Services**: `user-settings.service.ts`, `system-settings.service.ts` - Business logic + JSONB merging
- **DTOs**: `dto/*.dto.ts` - Zod schemas for validation
- **Guards**: `@Auth` decorator for RBAC enforcement
- **Modules**: `user-settings.module.ts`, `system-settings.module.ts` - NestJS dependency injection

#### Database
- **Schema**: `schema.prisma` - UserSettings and SystemSettings models
- **Migrations**: Auto-generated migration files
- **Seed**: Default permissions and initial settings rows

### Optimistic Concurrency Control

Settings use version-based concurrency to prevent lost updates:

```typescript
// Client sends current version in If-Match header
PUT /api/user-settings
If-Match: 5

// Server checks version
if (existingSettings.version !== requestVersion) {
  return 409 Conflict;
}

// Update increments version
await prisma.userSettings.update({
  where: { id },
  data: {
    value: mergedSettings,
    version: { increment: 1 },
  },
});
```

**Conflict Resolution**: Frontend receives 409, re-fetches latest settings, and prompts user to retry.

---

## User Settings

User settings are per-user preferences stored as JSONB with versioning.

### Schema

Defined in `apps/api/src/user-settings/dto/user-settings.dto.ts`:

```typescript
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const userSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  profile: z.object({
    displayName: z.string().min(1).max(100).optional(),
    useProviderImage: z.boolean().default(true),
    customImageUrl: z.string().url().optional(),
  }).optional(),
  defaultProvider: z.string().optional(), // 'openai' | 'anthropic' | 'azure'
});

export class UserSettingsDto extends createZodDto(userSettingsSchema) {}
```

### Field Definitions

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `theme` | Enum | `'system'` | UI appearance: 'light', 'dark', or 'system' (follows OS) |
| `profile.displayName` | String | `undefined` | Optional display name (synced to `users.display_name` column) |
| `profile.useProviderImage` | Boolean | `true` | Use OAuth provider profile image (Google avatar) |
| `profile.customImageUrl` | String | `undefined` | Custom profile image URL (overrides provider image) |
| `defaultProvider` | String | `undefined` | User's preferred LLM provider for Data Agent ('openai', 'anthropic', 'azure') |

### Default Values

New users automatically get settings with defaults:

```json
{
  "theme": "system",
  "profile": {
    "useProviderImage": true
  }
}
```

### Display Name Sync

When `profile.displayName` is updated, the service automatically syncs it to the `users.display_name` column:

```typescript
// In UserSettingsService.update()
if (dto.profile?.displayName !== undefined) {
  await this.prisma.user.update({
    where: { id: userId },
    data: { displayName: dto.profile.displayName },
  });
}
```

This enables:
- Display name appears in user menus, chat headers, etc.
- Database-level queries can filter/sort by display name
- Settings remain the source of truth for user preferences

### Deep Partial Updates

PATCH endpoint supports nested partial updates:

```typescript
// PATCH /api/user-settings
{
  "profile": {
    "displayName": "Alice Smith"  // Only update displayName, preserve useProviderImage
  }
}
```

Implementation uses spread-based merge:

```typescript
const merged = {
  ...existingSettings.value,
  ...dto,
  profile: {
    ...existingSettings.value.profile,
    ...dto.profile,
  },
};
```

Special handling:
- `undefined` = don't change
- `null` = clear field
- Empty string `""` = clear string field

---

## System Settings

System settings are global application configuration stored as a single JSONB row with versioning and audit trails.

### Schema

Defined in `apps/api/src/system-settings/dto/system-settings.dto.ts`:

```typescript
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const dataAgentProviderConfigSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  model: z.string().optional(),
  reasoningLevel: z.union([
    z.enum(['low', 'medium', 'high']),           // OpenAI/Azure reasoning_effort
    z.enum(['adaptive']),                        // Anthropic thinking mode
    z.number().min(1000).max(100000),            // Anthropic thinking budget
  ]).optional(),
}).optional();

export const systemSettingsSchema = z.object({
  ui: z.object({
    allowUserThemeOverride: z.boolean().default(true),
  }).optional(),
  features: z.record(z.string(), z.boolean()).default({}),
  dataAgent: z.object({
    openai: dataAgentProviderConfigSchema,
    anthropic: dataAgentProviderConfigSchema,
    azure: dataAgentProviderConfigSchema,
  }).optional(),
});

export class SystemSettingsDto extends createZodDto(systemSettingsSchema) {}
```

### Field Definitions

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `ui.allowUserThemeOverride` | Boolean | `true` | Allow users to override theme (if false, system theme is enforced) |
| `features` | Record<string, boolean> | `{}` | Feature flags (e.g., `{ "newDashboard": true }`) |
| `dataAgent.openai.temperature` | Number | `undefined` | OpenAI temperature (0-2), overrides env var |
| `dataAgent.openai.model` | String | `undefined` | OpenAI model name (e.g., `gpt-4o`), overrides env var |
| `dataAgent.openai.reasoningLevel` | Enum/Number | `undefined` | OpenAI `reasoning_effort`: 'low', 'medium', 'high' |
| `dataAgent.anthropic.temperature` | Number | `undefined` | Anthropic temperature (0-2), overrides env var |
| `dataAgent.anthropic.model` | String | `undefined` | Anthropic model name (e.g., `claude-3-5-sonnet-20241022`), overrides env var |
| `dataAgent.anthropic.reasoningLevel` | Enum/Number | `undefined` | Anthropic thinking: 'adaptive' or numeric budget (1000-100000 tokens) |
| `dataAgent.azure.temperature` | Number | `undefined` | Azure OpenAI temperature (0-2), overrides env var |
| `dataAgent.azure.model` | String | `undefined` | Azure OpenAI deployment name, overrides env var |
| `dataAgent.azure.reasoningLevel` | Enum/Number | `undefined` | Azure OpenAI `reasoning_effort`: 'low', 'medium', 'high' |

### Default Values

Initial system settings row created during seed:

```json
{
  "ui": {
    "allowUserThemeOverride": true
  },
  "features": {}
}
```

### Data Agent Provider Configuration

Admins can configure LLM provider settings per provider. These settings override environment variables and are used by the Data Agent when executing multi-phase pipelines.

#### Reasoning Level Mapping

The `reasoningLevel` field maps to provider-specific parameters:

**OpenAI and Azure OpenAI**:
- Uses `reasoning_effort` parameter (o1 and o3 models)
- Values: `'low'`, `'medium'`, `'high'`
- Lower values = faster, less thorough reasoning
- Higher values = slower, more thorough reasoning

**Anthropic**:
- Uses `thinking` parameter (extended thinking feature)
- Values:
  - `'adaptive'`: Let model decide thinking budget dynamically
  - Numeric budget: `1000` to `100000` tokens (explicit thinking token limit)
- Adaptive mode recommended for most use cases

**Example Configuration**:
```json
{
  "dataAgent": {
    "openai": {
      "model": "o3-mini",
      "temperature": 0.3,
      "reasoningLevel": "medium"
    },
    "anthropic": {
      "model": "claude-3-7-sonnet-20250219",
      "temperature": 0.5,
      "reasoningLevel": "adaptive"
    },
    "azure": {
      "model": "gpt-4o-deployment",
      "temperature": 0.4,
      "reasoningLevel": "high"
    }
  }
}
```

### Audit Trail

All system settings modifications are logged to the `audit_events` table:

```typescript
// In SystemSettingsService.update()
await this.auditService.log({
  action: 'system_settings:update',
  userId: adminUserId,
  entityType: 'system_settings',
  entityId: settings.id,
  data: {
    changedFields: Object.keys(dto),
    oldVersion: existingSettings.version,
    newVersion: existingSettings.version + 1,
  },
});
```

Audit entries include:
- Who made the change (userId)
- What changed (changedFields)
- When it changed (timestamp)
- Version numbers (for conflict resolution)

---

## RBAC Permissions

Defined in `apps/api/src/common/constants/roles.constants.ts`:

```typescript
export const PERMISSIONS = {
  USER_SETTINGS_READ: 'user_settings:read',
  USER_SETTINGS_WRITE: 'user_settings:write',
  SYSTEM_SETTINGS_READ: 'system_settings:read',
  SYSTEM_SETTINGS_WRITE: 'system_settings:write',
} as const;
```

### Permission Matrix

| Permission | Roles | Description |
|------------|-------|-------------|
| `user_settings:read` | Viewer, Contributor, Admin | View own user settings |
| `user_settings:write` | Viewer, Contributor, Admin | Modify own user settings |
| `system_settings:read` | Admin | View system settings |
| `system_settings:write` | Admin | Modify system settings |

**Notes**:
- All users (including Viewer) can manage their own settings
- Only Admins can access system settings
- System settings include sensitive configuration (feature flags, provider API settings)

---

## Database Schema

Located in `apps/api/prisma/schema.prisma`:

### UserSettings Model

```prisma
model UserSettings {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @unique @map("user_id") @db.Uuid
  value     Json     @default("{}") // JSONB
  version   Int      @default(1)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz

  // Relations
  user User @relation("UserSettings", fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("user_settings")
}
```

**Field Definitions**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | Primary key | Unique identifier |
| `userId` | UUID | Unique, Foreign key | References `users.id`, enforces one settings row per user |
| `value` | JSONB | Default `{}` | User settings object (validated against Zod schema) |
| `version` | Integer | Default 1 | Optimistic concurrency version counter |
| `updatedAt` | Timestamptz | Auto-updated | Last modification timestamp |

**Cascade Deletion**: When a user is deleted, their settings are automatically deleted.

---

### SystemSettings Model

```prisma
model SystemSettings {
  id              String   @id @default(uuid()) @db.Uuid
  key             String   @unique @default("global") @db.VarChar(50)
  value           Json     @default("{}") // JSONB
  version         Int      @default(1)
  updatedAt       DateTime @updatedAt @map("updated_at") @db.Timestamptz
  updatedByUserId String?  @map("updated_by_user_id") @db.Uuid

  // Relations
  updatedByUser User? @relation("SystemSettingsUpdater", fields: [updatedByUserId], references: [id], onDelete: SetNull)

  @@index([key])
  @@map("system_settings")
}
```

**Field Definitions**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | Primary key | Unique identifier |
| `key` | String | Unique, Default `'global'` | Settings namespace (currently only 'global' used) |
| `value` | JSONB | Default `{}` | System settings object (validated against Zod schema) |
| `version` | Integer | Default 1 | Optimistic concurrency version counter |
| `updatedAt` | Timestamptz | Auto-updated | Last modification timestamp |
| `updatedByUserId` | UUID | Nullable, Foreign key | Last admin who modified settings (for audit trail) |

**Singleton Pattern**: Only one row with `key = 'global'` exists. Future enhancement could support multiple namespaces (e.g., `key = 'integration:salesforce'`).

---

### Users Table Extension

The `users` table includes a `display_name` column synced from user settings:

```prisma
model User {
  // ... existing fields
  displayName String? @map("display_name") @db.VarChar(100)

  // Relations
  userSettings UserSettings? @relation("UserSettings")
}
```

**Sync Logic**:
- When `userSettings.profile.displayName` is updated, `users.display_name` is updated
- Enables database-level queries on display name
- Settings remain source of truth for user preferences

---

## API Endpoints

All endpoints require authentication. User settings require user ownership, system settings require Admin role.

### User Settings Endpoints

#### 1. Get User Settings

```http
GET /api/user-settings
```

**Permission**: `user_settings:read` (own settings only)

**Response (200)**:
```json
{
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "value": {
      "theme": "dark",
      "profile": {
        "displayName": "Alice Smith",
        "useProviderImage": false,
        "customImageUrl": "https://example.com/avatar.png"
      },
      "defaultProvider": "anthropic"
    },
    "version": 5,
    "updatedAt": "2025-01-15T10:00:00Z"
  }
}
```

**Note**: If no settings exist for user, creates default settings row automatically.

---

#### 2. Replace User Settings

```http
PUT /api/user-settings
If-Match: 5
```

**Permission**: `user_settings:write` (own settings only)

**Request Body**:
```json
{
  "theme": "light",
  "profile": {
    "displayName": "Alice Johnson",
    "useProviderImage": true
  },
  "defaultProvider": "openai"
}
```

**Response (200)**:
```json
{
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "value": {
      "theme": "light",
      "profile": {
        "displayName": "Alice Johnson",
        "useProviderImage": true
      },
      "defaultProvider": "openai"
    },
    "version": 6,
    "updatedAt": "2025-01-15T11:00:00Z"
  }
}
```

**Response (409)**: Version conflict
```json
{
  "statusCode": 409,
  "message": "Settings version conflict. The settings have been modified by another request.",
  "error": "Conflict"
}
```

**Side Effects**:
- If `profile.displayName` changes, `users.display_name` is updated
- `version` incremented
- `updatedAt` updated

---

#### 3. Partial Update User Settings

```http
PATCH /api/user-settings
If-Match: 6
```

**Permission**: `user_settings:write` (own settings only)

**Request Body** (partial, only fields to change):
```json
{
  "theme": "dark"
}
```

**Response (200)**:
```json
{
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "value": {
      "theme": "dark",
      "profile": {
        "displayName": "Alice Johnson",
        "useProviderImage": true
      },
      "defaultProvider": "openai"
    },
    "version": 7,
    "updatedAt": "2025-01-15T12:00:00Z"
  }
}
```

**Nested Partial Update**:
```json
{
  "profile": {
    "displayName": "Alice"  // Only update displayName, preserve other profile fields
  }
}
```

**Response (409)**: Same conflict handling as PUT

---

### System Settings Endpoints

#### 4. Get System Settings

```http
GET /api/system-settings
```

**Permission**: `system_settings:read` (Admin only)

**Response (200)**:
```json
{
  "data": {
    "id": "uuid",
    "key": "global",
    "value": {
      "ui": {
        "allowUserThemeOverride": true
      },
      "features": {
        "newDashboard": true,
        "advancedAnalytics": false
      },
      "dataAgent": {
        "openai": {
          "model": "o3-mini",
          "temperature": 0.3,
          "reasoningLevel": "medium"
        },
        "anthropic": {
          "model": "claude-3-7-sonnet-20250219",
          "temperature": 0.5,
          "reasoningLevel": "adaptive"
        }
      }
    },
    "version": 12,
    "updatedAt": "2025-01-15T14:00:00Z",
    "updatedByUserId": "admin-uuid"
  }
}
```

**Response (403)**: Non-admin users
```json
{
  "statusCode": 403,
  "message": "Forbidden resource",
  "error": "Forbidden"
}
```

---

#### 5. Replace System Settings

```http
PUT /api/system-settings
If-Match: 12
```

**Permission**: `system_settings:write` (Admin only)

**Request Body**:
```json
{
  "ui": {
    "allowUserThemeOverride": false
  },
  "features": {
    "newDashboard": true,
    "advancedAnalytics": true,
    "betaFeatures": false
  },
  "dataAgent": {
    "openai": {
      "model": "gpt-4o",
      "temperature": 0.4,
      "reasoningLevel": "high"
    }
  }
}
```

**Response (200)**:
```json
{
  "data": {
    "id": "uuid",
    "key": "global",
    "value": { /* updated settings */ },
    "version": 13,
    "updatedAt": "2025-01-15T15:00:00Z",
    "updatedByUserId": "admin-uuid"
  }
}
```

**Response (409)**: Version conflict (same as user settings)

**Side Effects**:
- Audit event logged to `audit_events` table
- `updatedByUserId` set to current admin user ID
- `version` incremented
- `updatedAt` updated

---

#### 6. Partial Update System Settings

```http
PATCH /api/system-settings
If-Match: 13
```

**Permission**: `system_settings:write` (Admin only)

**Request Body** (partial):
```json
{
  "features": {
    "betaFeatures": true  // Only update this flag, preserve others
  }
}
```

**Response (200)**: Same structure as PUT

**Nested Partial Update**:
```json
{
  "dataAgent": {
    "anthropic": {
      "temperature": 0.6  // Only update temperature, preserve model and reasoningLevel
    }
  }
}
```

**Response (409)**: Same conflict handling as PUT

**Side Effects**: Same as PUT (audit log, version increment, etc.)

---

## Frontend Components

### User Settings Page

**Location**: `apps/web/src/pages/SettingsPage.tsx`

**Purpose**: User preferences management

**Layout**:
```
┌─────────────────────────────────────────┐
│ Settings                                │
├─────────────────────────────────────────┤
│                                          │
│ Theme Settings                           │
│ ┌─────┬─────┬─────────┐                │
│ │Light│Dark │System   │ (toggle group) │
│ └─────┴─────┴─────────┘                │
│                                          │
│ Profile Settings                         │
│ Display Name: [Alice Smith      ]       │
│ Profile Image:                           │
│   ○ Use Google profile image             │
│   ● Custom image                         │
│   URL: [https://...          ]          │
│                                          │
│ Default LLM Provider (Data Agent)        │
│ Provider: [Anthropic ▼]                  │
│                                          │
│         [Cancel] [Save Changes]          │
└─────────────────────────────────────────┘
```

**Components**:
- `ThemeSettings.tsx`: MUI ToggleButtonGroup for light/dark/system
- `ProfileSettings.tsx`: TextField for displayName, RadioGroup for image source, TextField for customImageUrl
- `DefaultProviderSettings.tsx`: Select dropdown with available LLM providers

**State Management**:
```typescript
const {
  settings,
  version,
  isLoading,
  error,
  fetchSettings,
  updateSettings,
} = useUserSettings();
```

**Save Flow**:
1. User modifies fields (local state)
2. Clicks "Save Changes"
3. Hook calls `updateSettings(changedFields, version)` with `If-Match` header
4. On 200: Success toast, re-fetch settings
5. On 409: Conflict toast, re-fetch latest, prompt retry
6. On 400: Validation error toast

---

### System Settings Page

**Location**: `apps/web/src/pages/admin/SystemSettingsPage.tsx`

**Purpose**: Global application configuration (Admin only)

**Layout**:
```
┌─────────────────────────────────────────┐
│ System Settings                         │
├─────────────────────────────────────────┤
│                                          │
│ UI Settings                              │
│ □ Allow user theme override              │
│                                          │
│ Feature Flags                            │
│ ┌────────────────────────────────────┐  │
│ │ Flag Name           Status         │  │
│ ├────────────────────────────────────┤  │
│ │ New Dashboard       ✓ Enabled   [×]│  │
│ │ Advanced Analytics  ○ Disabled  [×]│  │
│ │ [Add New Flag...]                  │  │
│ └────────────────────────────────────┘  │
│                                          │
│ Data Agent LLM Configuration             │
│ ┌────────────────────────────────────┐  │
│ │ OpenAI                             │  │
│ │ Model: [o3-mini ▼]                 │  │
│ │ Temperature: [0.3]                 │  │
│ │ Reasoning Level: [Medium ▼]        │  │
│ ├────────────────────────────────────┤  │
│ │ Anthropic                          │  │
│ │ Model: [claude-3-7-sonnet ▼]      │  │
│ │ Temperature: [0.5]                 │  │
│ │ Reasoning: [Adaptive ▼]            │  │
│ ├────────────────────────────────────┤  │
│ │ Azure OpenAI                       │  │
│ │ Model: [gpt-4o-deployment]         │  │
│ │ Temperature: [0.4]                 │  │
│ │ Reasoning Level: [High ▼]          │  │
│ └────────────────────────────────────┘  │
│                                          │
│ Advanced                                 │
│ [View Raw JSON]                          │
│                                          │
│         [Cancel] [Save Changes]          │
└─────────────────────────────────────────┘
```

**Components**:
- `UISettings.tsx`: Checkbox for allowUserThemeOverride
- `FeatureFlagsList.tsx`: Dynamic table with add/remove flag functionality
- `DataAgentSettings.tsx`: Per-provider configuration (model, temperature, reasoningLevel)
- `SystemSettingsEditor.tsx`: Raw JSON editor with syntax highlighting (advanced mode)

**State Management**:
```typescript
const {
  settings,
  version,
  isLoading,
  error,
  fetchSettings,
  updateSettings,
} = useSystemSettings();
```

**Reasoning Level UI**:

**OpenAI/Azure**:
```tsx
<Select value={reasoningLevel} onChange={handleChange}>
  <MenuItem value="low">Low (faster, less thorough)</MenuItem>
  <MenuItem value="medium">Medium (balanced)</MenuItem>
  <MenuItem value="high">High (slower, more thorough)</MenuItem>
</Select>
```

**Anthropic**:
```tsx
<Select value={reasoningMode} onChange={handleReasoningModeChange}>
  <MenuItem value="adaptive">Adaptive (recommended)</MenuItem>
  <MenuItem value="custom">Custom token budget</MenuItem>
</Select>

{reasoningMode === 'custom' && (
  <TextField
    type="number"
    label="Thinking Budget (tokens)"
    value={thinkingBudget}
    inputProps={{ min: 1000, max: 100000 }}
    helperText="1,000 - 100,000 tokens"
  />
)}
```

**Save Flow**: Same as user settings (with Admin permission check)

---

### Theme Settings Component

**Location**: `apps/web/src/components/settings/ThemeSettings.tsx`

**Purpose**: Toggle button group for theme selection

**Features**:
- Three options: Light, Dark, System
- Icon + label for each option
- Updates `userSettings.theme`
- Immediately applies theme on selection (optimistic update)

**Example**:
```tsx
<ToggleButtonGroup
  value={theme}
  exclusive
  onChange={handleThemeChange}
>
  <ToggleButton value="light">
    <LightModeIcon /> Light
  </ToggleButton>
  <ToggleButton value="dark">
    <DarkModeIcon /> Dark
  </ToggleButton>
  <ToggleButton value="system">
    <SettingsBrightnessIcon /> System
  </ToggleButton>
</ToggleButtonGroup>
```

---

### Profile Settings Component

**Location**: `apps/web/src/components/settings/ProfileSettings.tsx`

**Purpose**: Display name and profile image configuration

**Features**:
- TextField for display name (max 100 chars)
- Radio group for image source (provider vs custom)
- TextField for custom image URL (disabled unless "Custom image" selected)
- Avatar preview showing current image

---

### Default Provider Settings Component

**Location**: `apps/web/src/components/settings/DefaultProviderSettings.tsx`

**Purpose**: Select default LLM provider for Data Agent

**Features**:
- Dropdown with available providers (from `GET /api/llm/providers`)
- Displays provider name and icon
- Saves to `userSettings.defaultProvider`
- Used by Data Agent to determine which LLM to use when multiple providers are configured

---

### Feature Flags List Component

**Location**: `apps/web/src/components/admin/FeatureFlagsList.tsx`

**Purpose**: Manage feature flags dynamically

**Features**:
- Table with columns: Flag Name, Status (Enabled/Disabled), Actions (Delete)
- Toggle switch to enable/disable flags
- "Add New Flag" button opens dialog with text input + default state
- Delete button with confirmation dialog

**State**:
```typescript
const [flags, setFlags] = useState<Record<string, boolean>>(systemSettings.features);

const handleToggle = (flagName: string) => {
  setFlags({ ...flags, [flagName]: !flags[flagName] });
};

const handleAdd = (flagName: string, enabled: boolean) => {
  setFlags({ ...flags, [flagName]: enabled });
};

const handleDelete = (flagName: string) => {
  const { [flagName]: _, ...rest } = flags;
  setFlags(rest);
};
```

---

### Data Agent Settings Component

**Location**: `apps/web/src/components/admin/DataAgentSettings.tsx`

**Purpose**: Configure per-provider LLM settings for Data Agent

**Features**:
- Accordion per provider (OpenAI, Anthropic, Azure)
- Model select dropdown (populated from available models)
- Temperature slider (0-2 with 0.1 step)
- Reasoning level select (provider-specific options)
- Help text explaining reasoning levels

**State**:
```typescript
const [openaiConfig, setOpenaiConfig] = useState(systemSettings.dataAgent?.openai || {});
const [anthropicConfig, setAnthropicConfig] = useState(systemSettings.dataAgent?.anthropic || {});
const [azureConfig, setAzureConfig] = useState(systemSettings.dataAgent?.azure || {});
```

---

### System Settings Editor Component

**Location**: `apps/web/src/components/admin/SystemSettingsEditor.tsx`

**Purpose**: Raw JSON editor for advanced users

**Features**:
- Syntax-highlighted JSON editor (Monaco Editor)
- Real-time validation (Zod schema)
- Error display for invalid JSON
- "Reset to Default" button
- Confirmation dialog before saving

**Usage**: Advanced users who want to edit settings structure directly without UI limitations.

---

## Key Patterns

### 1. Zod Schema + Deep Partial

Settings use Zod for validation with deep partial updates:

```typescript
// Base schema
export const userSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  profile: z.object({
    displayName: z.string().min(1).max(100).optional(),
    useProviderImage: z.boolean().default(true),
    customImageUrl: z.string().url().optional(),
  }).optional(),
  defaultProvider: z.string().optional(),
});

// For PATCH endpoint, use deepPartial
export const userSettingsPatchSchema = userSettingsSchema.deepPartial();
```

**Why deepPartial?**
- Allows partial nested updates
- `{ profile: { displayName: 'Alice' } }` only updates displayName, preserves other profile fields
- Regular `partial()` would require sending entire `profile` object

---

### 2. Optimistic Concurrency with If-Match

Frontend sends current version in `If-Match` header:

```typescript
// In useUserSettings hook
const updateSettings = async (dto: Partial<UserSettings>, currentVersion: number) => {
  const response = await fetch('/api/user-settings', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'If-Match': String(currentVersion), // ← Version check
    },
    body: JSON.stringify(dto),
  });

  if (response.status === 409) {
    // Conflict: settings were modified by another request
    const latestSettings = await fetchSettings(); // Re-fetch
    throw new ConflictError('Settings have changed. Please review and try again.', latestSettings);
  }

  return response.json();
};
```

Backend checks version:

```typescript
// In UserSettingsService.update()
const requestVersion = parseInt(ifMatchHeader, 10);

if (existingSettings.version !== requestVersion) {
  throw new ConflictException('Settings version conflict. The settings have been modified by another request.');
}

// Update with version increment
await this.prisma.userSettings.update({
  where: { id: existingSettings.id },
  data: {
    value: mergedSettings,
    version: { increment: 1 },
  },
});
```

---

### 3. JSONB Merge Strategy

Settings service implements spread-based merge for nested objects:

```typescript
// In UserSettingsService.update()
private mergeSettings(existing: UserSettings, update: Partial<UserSettings>): UserSettings {
  return {
    ...existing,
    ...update,
    profile: {
      ...existing.profile,
      ...update.profile,
    },
  };
}
```

**Rules**:
- `undefined` = don't change (field not included in PATCH body)
- `null` = clear field (explicitly set to null)
- `""` (empty string) = clear string field

**Example**:
```typescript
// Existing
{
  theme: 'dark',
  profile: {
    displayName: 'Alice',
    useProviderImage: true,
  },
}

// PATCH body
{
  profile: {
    customImageUrl: 'https://example.com/avatar.png',
  },
}

// Merged result
{
  theme: 'dark',  // ← Preserved (undefined in PATCH)
  profile: {
    displayName: 'Alice',  // ← Preserved (undefined in PATCH)
    useProviderImage: true,  // ← Preserved (undefined in PATCH)
    customImageUrl: 'https://example.com/avatar.png',  // ← Added
  },
}
```

---

### 4. Display Name Sync

User settings service automatically syncs display name to users table:

```typescript
// In UserSettingsService.update()
async update(userId: string, dto: Partial<UserSettings>, ifMatchHeader?: string) {
  // ... version check and merge logic ...

  // Sync display name to users table
  if (dto.profile?.displayName !== undefined) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { displayName: dto.profile.displayName || null },
    });
  }

  // Update settings
  const updated = await this.prisma.userSettings.update({
    where: { userId },
    data: {
      value: mergedSettings,
      version: { increment: 1 },
    },
  });

  return updated;
}
```

**Why sync?**
- Display name is frequently accessed (user menus, chat headers, admin user tables)
- Storing in users table enables database-level queries (filter, sort)
- Settings remain source of truth (single write path)

---

### 5. Audit Logging for System Settings

System settings changes are audited:

```typescript
// In SystemSettingsService.update()
async update(adminUserId: string, dto: Partial<SystemSettings>, ifMatchHeader?: string) {
  // ... version check and merge logic ...

  // Update settings
  const updated = await this.prisma.systemSettings.update({
    where: { key: 'global' },
    data: {
      value: mergedSettings,
      version: { increment: 1 },
      updatedByUserId: adminUserId,
    },
  });

  // Log audit event
  await this.auditService.log({
    action: 'system_settings:update',
    userId: adminUserId,
    entityType: 'system_settings',
    entityId: updated.id,
    data: {
      changedFields: Object.keys(dto),
      oldVersion: existingSettings.version,
      newVersion: updated.version,
    },
  });

  return updated;
}
```

Audit events enable:
- Compliance tracking (who changed what and when)
- Rollback capability (can reconstruct previous state from audit log)
- Debugging (identify cause of unexpected behavior changes)

---

## File Inventory

### Backend Files

| File | Purpose |
|------|---------|
| `apps/api/src/user-settings/user-settings.module.ts` | NestJS module |
| `apps/api/src/user-settings/user-settings.controller.ts` | REST endpoints (GET/PUT/PATCH) |
| `apps/api/src/user-settings/user-settings.service.ts` | Business logic + JSONB merge + display_name sync |
| `apps/api/src/user-settings/dto/user-settings.dto.ts` | Zod schemas (base + patch) |
| `apps/api/src/system-settings/system-settings.module.ts` | NestJS module |
| `apps/api/src/system-settings/system-settings.controller.ts` | REST endpoints (GET/PUT/PATCH, Admin only) |
| `apps/api/src/system-settings/system-settings.service.ts` | Business logic + JSONB merge + audit logging |
| `apps/api/src/system-settings/dto/system-settings.dto.ts` | Zod schemas (base + patch) |
| `apps/api/prisma/schema.prisma` | UserSettings and SystemSettings models |
| `apps/api/prisma/migrations/YYYYMMDDHHMMSS_add_settings/` | Migration files |
| `apps/api/prisma/seed.ts` | Seed permissions and default settings row |

### Frontend Files

| File | Purpose |
|------|---------|
| `apps/web/src/pages/SettingsPage.tsx` | User settings page |
| `apps/web/src/pages/admin/SystemSettingsPage.tsx` | System settings page (Admin only) |
| `apps/web/src/components/settings/ThemeSettings.tsx` | Theme toggle button group |
| `apps/web/src/components/settings/ProfileSettings.tsx` | Display name + profile image config |
| `apps/web/src/components/settings/DefaultProviderSettings.tsx` | LLM provider select |
| `apps/web/src/components/admin/UISettings.tsx` | UI settings (theme override toggle) |
| `apps/web/src/components/admin/FeatureFlagsList.tsx` | Dynamic feature flag table |
| `apps/web/src/components/admin/DataAgentSettings.tsx` | Per-provider LLM config (model, temperature, reasoning) |
| `apps/web/src/components/admin/SystemSettingsEditor.tsx` | Raw JSON editor (advanced mode) |
| `apps/web/src/hooks/useUserSettings.ts` | User settings hook (state + API integration) |
| `apps/web/src/hooks/useSystemSettings.ts` | System settings hook (state + API integration) |
| `apps/web/src/services/api.ts` | API client functions (modified) |
| `apps/web/src/types/index.ts` | TypeScript interfaces (modified) |

### Test Files

| File | Purpose |
|------|---------|
| `apps/api/test/settings/user-settings.integration.spec.ts` | User settings API integration tests |
| `apps/api/test/settings/system-settings.integration.spec.ts` | System settings API integration tests |
| `apps/web/src/__tests__/components/settings/ThemeSettings.test.tsx` | ThemeSettings component tests |
| `apps/web/src/__tests__/components/settings/ProfileSettings.test.tsx` | ProfileSettings component tests |
| `apps/web/src/__tests__/components/admin/FeatureFlagsList.test.tsx` | FeatureFlagsList component tests |
| `apps/web/src/__tests__/components/admin/DataAgentSettings.test.tsx` | DataAgentSettings component tests |

---

## Testing

### Backend Integration Tests

#### User Settings Tests

File: `apps/api/test/settings/user-settings.integration.spec.ts`

**Coverage**:

**GET /api/user-settings**
- ✅ 401 if not authenticated
- ✅ Creates default settings on first access
- ✅ Returns existing settings
- ✅ Settings include version number

**PUT /api/user-settings**
- ✅ 401 if not authenticated
- ✅ Replaces settings
- ✅ Increments version
- ✅ Syncs displayName to users table
- ✅ 409 on version conflict
- ✅ 400 on validation error (invalid theme enum)

**PATCH /api/user-settings**
- ✅ 401 if not authenticated
- ✅ Partial update preserves other fields
- ✅ Nested partial update (profile.displayName only)
- ✅ 409 on version conflict
- ✅ Sync displayName on partial update

**Run**:
```bash
cd apps/api && npm test -- user-settings.integration
```

---

#### System Settings Tests

File: `apps/api/test/settings/system-settings.integration.spec.ts`

**Coverage**:

**GET /api/system-settings**
- ✅ 401 if not authenticated
- ✅ 403 for non-admin users
- ✅ Returns global settings for admin
- ✅ Creates default settings if missing

**PUT /api/system-settings**
- ✅ 401 if not authenticated
- ✅ 403 for non-admin users
- ✅ Replaces settings for admin
- ✅ Increments version
- ✅ Sets updatedByUserId
- ✅ Logs audit event
- ✅ 409 on version conflict
- ✅ 400 on validation error

**PATCH /api/system-settings**
- ✅ 401 if not authenticated
- ✅ 403 for non-admin users
- ✅ Partial update preserves other fields
- ✅ Nested partial update (features flag only)
- ✅ Nested partial update (dataAgent.openai.temperature only)
- ✅ 409 on version conflict
- ✅ Logs audit event

**Run**:
```bash
cd apps/api && npm test -- system-settings.integration
```

---

### Frontend Component Tests

#### ThemeSettings Tests

File: `apps/web/src/__tests__/components/settings/ThemeSettings.test.tsx`

**Coverage**:
- ✅ Renders toggle button group
- ✅ Shows current theme selected
- ✅ Calls onChange when theme clicked
- ✅ Displays icons for each theme

---

#### ProfileSettings Tests

File: `apps/web/src/__tests__/components/settings/ProfileSettings.test.tsx`

**Coverage**:
- ✅ Renders display name input
- ✅ Renders profile image radio group
- ✅ Disables custom URL when "Use provider image" selected
- ✅ Enables custom URL when "Custom image" selected
- ✅ Calls onChange when fields change
- ✅ Shows avatar preview

---

#### FeatureFlagsList Tests

File: `apps/web/src/__tests__/components/admin/FeatureFlagsList.test.tsx`

**Coverage**:
- ✅ Renders table with flags
- ✅ Toggles flag on switch click
- ✅ Opens add dialog on "Add New Flag" click
- ✅ Adds new flag on dialog submit
- ✅ Deletes flag on delete button click
- ✅ Shows confirmation dialog before delete

---

#### DataAgentSettings Tests

File: `apps/web/src/__tests__/components/admin/DataAgentSettings.test.tsx`

**Coverage**:
- ✅ Renders provider accordions
- ✅ Shows model select dropdown
- ✅ Shows temperature slider
- ✅ Shows reasoning level select (OpenAI)
- ✅ Shows reasoning mode select + budget input (Anthropic)
- ✅ Calls onChange when fields change
- ✅ Validates temperature range (0-2)
- ✅ Validates thinking budget range (1000-100000)

---

### Manual Testing Scenarios

1. **User Settings**:
   - Login as user
   - Navigate to `/settings`
   - Change theme → Verify UI updates immediately
   - Set display name → Save → Verify name appears in user menu
   - Upload custom avatar → Save → Verify image appears in header
   - Set default provider → Save → Verify Data Agent uses provider

2. **System Settings**:
   - Login as admin
   - Navigate to `/admin/settings`
   - Toggle "Allow user theme override" → Save → Login as user → Verify theme selector disabled
   - Add feature flag `betaFeatures` → Enable → Verify flag appears in app
   - Configure OpenAI reasoning level to "high" → Create Data Agent chat → Verify LLM uses reasoning_effort=high
   - Configure Anthropic thinking budget to 5000 → Create Data Agent chat → Verify thinking budget applied

3. **Conflict Resolution**:
   - Open settings page in two browser tabs
   - Change theme in Tab 1 → Save
   - Change display name in Tab 2 → Save → Verify 409 conflict toast
   - Review changes → Retry → Verify successful save

---

## Configuration

### Environment Variables

No new environment variables required. Settings framework uses existing database configuration.

**Optional**: Default system settings can be seeded via `INITIAL_SYSTEM_SETTINGS` env var (JSON string).

### Database Migration

Run migration to create `user_settings` and `system_settings` tables:

```bash
cd apps/api && npm run prisma:migrate:dev
```

Or in production:

```bash
cd apps/api && npm run prisma:migrate
```

### Seed Permissions

Permissions are automatically seeded when running:

```bash
cd apps/api && npm run prisma:seed
```

This creates:
- `user_settings:read` → All roles (Viewer, Contributor, Admin)
- `user_settings:write` → All roles (Viewer, Contributor, Admin)
- `system_settings:read` → Admin only
- `system_settings:write` → Admin only

And creates default system settings row:

```typescript
await prisma.systemSettings.upsert({
  where: { key: 'global' },
  update: {},
  create: {
    key: 'global',
    value: {
      ui: { allowUserThemeOverride: true },
      features: {},
    },
    version: 1,
  },
});
```

---

## Summary

The Settings feature provides a production-ready, type-safe configuration framework with:

- **Flexible Schema**: JSONB storage enables schema evolution without migrations
- **Type Safety**: Zod validation + TypeScript types prevent invalid configurations
- **Concurrency Control**: Version-based optimistic locking prevents lost updates
- **Audit Trail**: System settings changes logged for compliance and debugging
- **Deep Partial Updates**: PATCH endpoints support nested object merging
- **User Preferences**: Theme, profile, and LLM provider defaults
- **Admin Control**: Feature flags, UI overrides, and Data Agent configuration
- **Data Integrity**: Display name synced between settings and users table

This specification serves as both documentation and a blueprint for extending the settings framework with new configuration options.
