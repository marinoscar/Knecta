# LLM Providers Feature Specification

## Table of Contents

1. [Feature Overview](#feature-overview)
2. [Architecture](#architecture)
3. [Database Schema](#database-schema)
4. [Security](#security)
5. [RBAC Permissions](#rbac-permissions)
6. [API Endpoints](#api-endpoints)
7. [Provider Integration](#provider-integration)
8. [Agent Configuration (agentConfigs)](#agent-configuration-agentconfigs)
9. [Frontend Components](#frontend-components)
10. [Caching](#caching)
11. [File Inventory](#file-inventory)
12. [Testing](#testing)
13. [Configuration](#configuration)

---

## Feature Overview

The LLM Providers feature replaces the env-var-only approach to LLM configuration with a DB-backed provider management system. Admins create and manage provider records through the UI; credentials are encrypted at rest. A two-layer architecture separates credential management (Layer 1: DB records) from per-agent runtime tuning (Layer 2: system settings `agentConfigs`).

### Core Capabilities

- **DB-backed provider records**: Each provider type is stored as a single row in `llm_providers` with AES-256-GCM encrypted credentials.
- **Five provider types**: OpenAI, Anthropic, Azure OpenAI, Snowflake Cortex, Databricks.
- **Env var fallback**: When no DB provider is configured for a given type, `LlmService` falls back to legacy env vars (OpenAI, Anthropic, Azure only).
- **Default provider**: One provider can be flagged as the system default; switching default is atomic (transaction clears existing default before setting new one).
- **Test connection**: Admins can test a provider by invoking the underlying LLM with a minimal prompt.
- **Per-agent tuning**: System settings store per-agent, per-provider overrides for model, temperature, and reasoning level (`agentConfigs`).
- **Config masking**: Sensitive fields (API keys, tokens) are replaced with `********` in all API responses.
- **In-memory caching**: Decrypted configs and the enabled-providers list are cached for 60 seconds; invalidated on any mutation.

### Use Cases

1. Admins configure one or more LLM providers without redeploying the application.
2. Agents and features call `LlmService.getChatModel(provider?, config?)` to obtain a ready-to-use LangChain chat model.
3. Admins tune per-agent behavior (temperature, model override, reasoning level) without touching provider credentials.
4. Contributors and Viewers see which providers are available for chat model selection.

### Current Limitations

- One record per provider type (`@@unique([type])`). To reconfigure a provider of the same type, update the existing record.
- Snowflake Cortex and Databricks have no env var fallback; they require a DB record to function.
- Env var fallback providers (OpenAI, Anthropic, Azure) expose the legacy type string `azure` rather than `azure_openai` in the providers list.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       Request Path                              │
│                                                                 │
│  Agent / Feature code                                           │
│       │                                                         │
│       ▼                                                         │
│  LlmService.getChatModel(provider?, runtimeConfig?)             │
│       │                                                         │
│       ├── Resolve type alias  (e.g., 'azure' → 'azure_openai') │
│       │                                                         │
│       ├── Layer 1: DB lookup (LlmProviderService)               │
│       │     LlmProvider.getDecryptedConfig(type)                │
│       │     Hit: decrypt + cache (60s TTL)                      │
│       │     Miss: fall through to Layer 2                       │
│       │                                                         │
│       └── Layer 2: Env var fallback (legacy)                    │
│             OPENAI_API_KEY / ANTHROPIC_API_KEY / AZURE_*        │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Model Resolution Order (for runtimeConfig.model)              │
│                                                                 │
│    1. agentConfig.model  (from system settings agentConfigs)    │
│    2. provider.defaultModel  (config.model stored in DB)        │
│    3. DEFAULT_MODELS[type]  (hardcoded per provider type)       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│              Admin Configuration Layers                         │
│                                                                 │
│  Layer 1 — llm_providers table                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  type (unique) │ name │ enabled │ isDefault │ encryptedConfig │
│  │  openai        │ ...  │ true    │ false     │ AES-256-GCM...  │
│  │  anthropic     │ ...  │ true    │ true      │ AES-256-GCM...  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Layer 2 — system_settings.value.agentConfigs  (JSONB)          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  {                                                        │  │
│  │    "dataAgent": {                                         │  │
│  │      "openai":    { temperature, model, reasoningLevel }, │  │
│  │      "anthropic": { temperature, model, reasoningLevel }  │  │
│  │    },                                                     │  │
│  │    "semanticModel": { ... }                               │  │
│  │  }                                                        │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

**One record per provider type**: Enforced by `@@unique([type])` in Prisma. Prevents accidental duplicate configurations for the same underlying service. Admins update the existing record to change credentials.

**Encryption in service, not controller**: `LlmProviderService` holds the encryption key (`getEncryptionKey()`) and encrypts/decrypts in private methods. The controller never sees plaintext credentials.

**In-memory cache over Redis**: The 60-second TTL in-memory cache avoids repeated DB decryption calls for high-frequency agent invocations without introducing a Redis dependency. Invalidated synchronously on every write.

**DB-first, env-fallback**: Production deployments use the DB. The env var path exists purely for backward compatibility during migration. Snowflake Cortex and Databricks never had env var support.

**agentConfigs decoupled from llm_providers**: Per-agent tuning (temperature, model override, reasoning level) lives in `system_settings`, not in `llm_providers`. This allows the same credential to be used with different parameters by different agents without creating additional provider records.

---

## Database Schema

### LlmProvider Model

```prisma
model LlmProvider {
  id              String    @id @default(uuid()) @db.Uuid
  type            String    @unique @db.VarChar(50)
  name            String    @db.VarChar(100)
  enabled         Boolean   @default(true)
  isDefault       Boolean   @default(false) @map("is_default")
  encryptedConfig String    @map("encrypted_config") @db.Text
  lastTestedAt    DateTime? @map("last_tested_at") @db.Timestamptz
  lastTestResult  Boolean?  @map("last_test_result")
  lastTestMessage String?   @map("last_test_message")
  createdByUserId String?   @map("created_by_user_id") @db.Uuid
  updatedByUserId String?   @map("updated_by_user_id") @db.Uuid
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  createdByUser User? @relation("UserLlmProvidersCreated", ...)
  updatedByUser User? @relation("UserLlmProvidersUpdated", ...)

  @@index([enabled])
  @@map("llm_providers")
}
```

### Field Reference

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `type` | VARCHAR(50) UNIQUE | Provider type identifier (see valid values below) |
| `name` | VARCHAR(100) | Human-readable display name |
| `enabled` | BOOLEAN | Whether this provider is available for use |
| `isDefault` | BOOLEAN | Whether this is the system default provider |
| `encryptedConfig` | TEXT | AES-256-GCM encrypted JSON config blob |
| `lastTestedAt` | TIMESTAMPTZ | Timestamp of most recent connection test |
| `lastTestResult` | BOOLEAN | `true` = last test passed, `false` = failed, `null` = never tested |
| `lastTestMessage` | TEXT | Message from the last test (success string or error excerpt, max 500 chars) |
| `createdByUserId` | UUID | User who created this record (nullable, SetNull on user delete) |
| `updatedByUserId` | UUID | User who last updated this record |
| `createdAt` | TIMESTAMPTZ | Record creation timestamp |
| `updatedAt` | TIMESTAMPTZ | Last update timestamp (auto-updated) |

### Valid Provider Type Values

| `type` | Display Name |
|---|---|
| `openai` | OpenAI |
| `anthropic` | Anthropic |
| `azure_openai` | Azure OpenAI |
| `snowflake_cortex` | Snowflake Cortex |
| `databricks` | Databricks |

### Encrypted Config Structure Per Provider Type

The `encryptedConfig` field decrypts to a JSON object. The fields stored per provider type are:

| Provider Type | Config Fields | Sensitive Fields |
|---|---|---|
| `openai` | `apiKey` (required), `model` (optional) | `apiKey` |
| `anthropic` | `apiKey` (required), `model` (optional) | `apiKey` |
| `azure_openai` | `apiKey` (required), `endpoint` (required URL), `deployment` (required), `apiVersion` (optional, default `2024-02-01`), `model` (optional display name) | `apiKey` |
| `snowflake_cortex` | `account` (required, e.g. `xy12345.us-east-1`), `pat` (required, Personal Access Token), `model` (optional) | `pat` |
| `databricks` | `host` (required, workspace hostname without `https://`), `token` (required, Personal Access Token), `endpoint` (required, serving endpoint name) | `token` |

### Default Models Per Provider Type

When no `model` is specified in the stored config or at runtime, these defaults are used:

| Provider Type | Default Model |
|---|---|
| `openai` | `gpt-4o` |
| `anthropic` | `claude-sonnet-4-5-20250929` |
| `azure_openai` | (uses deployment name) |
| `snowflake_cortex` | `claude-3-7-sonnet` |
| `databricks` | (uses endpoint name) |

---

## Security

### Credential Encryption

Provider configurations are encrypted using AES-256-GCM via the shared `encryption.util.ts` utility. The encryption key is read from the `ENCRYPTION_KEY` environment variable (32-byte key required). This is the same utility used for `DataConnection` credentials.

```
encrypt(JSON.stringify(config), encryptionKey)  →  encryptedConfig column
decrypt(encryptedConfig, encryptionKey)         →  JSON.parse(...)  →  config object
```

The encryption key is loaded once in the `LlmProviderService` constructor via `getEncryptionKey()` and stored as a `Buffer` on the service instance.

### Config Masking in API Responses

Sensitive fields are never returned in plaintext. Before any config is serialized into an API response, `maskConfig()` replaces each sensitive field value with `'********'`. The sensitive fields per provider type are defined in `SENSITIVE_FIELDS` in `provider-config.types.ts`.

```typescript
const SENSITIVE_FIELDS: Record<ProviderType, string[]> = {
  openai:           ['apiKey'],
  anthropic:        ['apiKey'],
  azure_openai:     ['apiKey'],
  snowflake_cortex: ['pat'],
  databricks:       ['token'],
};
```

All six API endpoints (list, create, get, update, delete, test) return masked configs. The decrypted config is only ever passed internally from `LlmProviderService` to `LlmService` for model instantiation.

### Type-Specific Config Validation

Before encryption, the submitted config is validated against a per-type Zod schema (`CONFIG_SCHEMAS[dto.type]`). Invalid configs are rejected with HTTP 400 before any write to the database.

### Provider Type Immutability

Once a provider is created, its `type` cannot be changed. The `PATCH` endpoint validates new config against the existing provider's type. The `type` field is absent from `UpdateLlmProviderDto`.

---

## RBAC Permissions

### Permission Definitions

| Permission | Description |
|---|---|
| `llm_providers:read` | View LLM provider configurations |
| `llm_providers:write` | Create, update, and manage LLM providers |
| `llm_providers:delete` | Delete LLM provider configurations |

### Role Assignments

| Permission | Admin | Contributor | Viewer |
|---|---|---|---|
| `llm_providers:read` | Yes | Yes | Yes |
| `llm_providers:write` | Yes | No | No |
| `llm_providers:delete` | Yes | No | No |

### Endpoint Permission Mapping

| Endpoint | Required Permission |
|---|---|
| `GET /api/llm/providers` | `llm_providers:read` |
| `POST /api/llm/providers` | `llm_providers:write` |
| `GET /api/llm/providers/:id` | `llm_providers:write` |
| `PATCH /api/llm/providers/:id` | `llm_providers:write` |
| `DELETE /api/llm/providers/:id` | `llm_providers:delete` |
| `POST /api/llm/providers/:id/test` | `llm_providers:write` |

Note: `GET /api/llm/providers` (list) uses `llm_providers:read`, which all roles have. `GET /api/llm/providers/:id` (detail) uses `llm_providers:write` because it is intended for admin management UIs and returns the full masked config.

---

## API Endpoints

### Base URL

`/api/llm/providers`

All endpoints require a valid JWT Bearer token.

### GET /api/llm/providers

List all enabled providers. Used by the frontend model selector and agent configuration UI.

**Permission**: `llm_providers:read`

**Response 200**:
```json
{
  "data": {
    "providers": [
      {
        "id": "uuid",
        "type": "openai",
        "name": "OpenAI",
        "enabled": true,
        "isDefault": true,
        "model": "gpt-4o"
      },
      {
        "id": "uuid",
        "type": "anthropic",
        "name": "Anthropic",
        "enabled": true,
        "isDefault": false,
        "model": "claude-sonnet-4-5-20250929"
      }
    ]
  }
}
```

Note: This endpoint returns the `LLMProviderInfo` shape (no `config` field). Sensitive credentials are not exposed.

---

### POST /api/llm/providers

Create a new LLM provider. Only one provider per type is allowed.

**Permission**: `llm_providers:write`

**Request Body**:
```json
{
  "type": "openai",
  "name": "OpenAI",
  "enabled": true,
  "isDefault": false,
  "config": {
    "apiKey": "sk-...",
    "model": "gpt-4o"
  }
}
```

**Field Validation**:
- `type`: one of `openai`, `anthropic`, `azure_openai`, `snowflake_cortex`, `databricks`
- `name`: string, 1–100 characters
- `enabled`: boolean, default `true`
- `isDefault`: boolean, default `false`
- `config`: object validated against per-type schema (see Database Schema section)

**Response 201**:
```json
{
  "data": {
    "id": "uuid",
    "type": "openai",
    "name": "OpenAI",
    "enabled": true,
    "isDefault": false,
    "config": {
      "apiKey": "********",
      "model": "gpt-4o"
    },
    "model": "gpt-4o",
    "lastTestedAt": null,
    "lastTestResult": null,
    "lastTestMessage": null,
    "createdAt": "2026-03-06T00:00:00Z",
    "updatedAt": "2026-03-06T00:00:00Z"
  }
}
```

**Error Responses**:
- `400 Bad Request` — invalid config fields for the selected type
- `409 Conflict` — a provider of this type already exists

When `isDefault: true`, the service wraps the creation in a transaction that first clears `isDefault` on all existing providers.

---

### GET /api/llm/providers/:id

Get full provider details including masked config. Intended for the admin edit form.

**Permission**: `llm_providers:write`

**Response 200**:
```json
{
  "data": {
    "id": "uuid",
    "type": "azure_openai",
    "name": "Azure OpenAI",
    "enabled": true,
    "isDefault": false,
    "config": {
      "apiKey": "********",
      "endpoint": "https://myresource.openai.azure.com",
      "deployment": "gpt-4o",
      "apiVersion": "2024-02-01"
    },
    "model": "gpt-4o",
    "lastTestedAt": "2026-03-06T12:00:00Z",
    "lastTestResult": true,
    "lastTestMessage": "Connection successful",
    "createdAt": "2026-03-06T00:00:00Z",
    "updatedAt": "2026-03-06T00:00:00Z"
  }
}
```

**Error Responses**:
- `404 Not Found` — provider ID does not exist

---

### PATCH /api/llm/providers/:id

Update an existing provider. The `type` field cannot be changed. Config is validated against the existing provider's type.

**Permission**: `llm_providers:write`

**Request Body** (all fields optional):
```json
{
  "name": "My OpenAI",
  "enabled": false,
  "isDefault": true,
  "config": {
    "apiKey": "sk-new-key",
    "model": "gpt-4o-mini"
  }
}
```

If `config` is omitted, the existing encrypted config is preserved. If `config` is provided, the entire config blob is replaced (not merged). In the frontend edit form, password fields left blank by the user are excluded from the submitted config so the backend retains the existing key.

When `isDefault: true`, the update is wrapped in a transaction that clears `isDefault` on all other providers.

**Response 200**: Same shape as POST response.

**Error Responses**:
- `400 Bad Request` — invalid config
- `404 Not Found` — provider ID does not exist

---

### DELETE /api/llm/providers/:id

Delete a provider record. There is no cascade effect on other tables. Agents previously configured to use this provider will fall back to the default provider.

**Permission**: `llm_providers:delete`

**Response 204**: No content.

**Error Responses**:
- `404 Not Found` — provider ID does not exist

---

### POST /api/llm/providers/:id/test

Test connectivity for an existing provider by invoking the LLM with a minimal prompt (`'Say "hello" in one word.'`). Records the test result and timestamp on the provider row regardless of outcome.

**Permission**: `llm_providers:write`

**Response 200**:
```json
{
  "data": {
    "success": true,
    "message": "Connection successful"
  }
}
```

On failure:
```json
{
  "data": {
    "success": false,
    "message": "Error: 401 Unauthorized - Invalid API key"
  }
}
```

The error message is truncated to 500 characters. The endpoint always returns HTTP 200 regardless of test outcome; the `success` boolean in the response body indicates the test result.

**Error Responses**:
- `404 Not Found` — provider ID does not exist

---

## Provider Integration

`LlmService.createModelFromDbConfig()` constructs LangChain chat model instances from decrypted configs. The `LlmModelConfig` runtime override (temperature, model, reasoningLevel) is applied on top of the stored defaults.

```typescript
interface LlmModelConfig {
  temperature?: number;   // 0–2, overrides stored default (default: 0)
  model?: string;         // overrides stored defaultModel
  reasoningLevel?: string; // provider-specific reasoning control
}
```

### OpenAI

- **LangChain class**: `ChatOpenAI` (`@langchain/openai`)
- **Authentication**: `openAIApiKey` parameter
- **Reasoning**: Native `reasoning: { effort: 'low' | 'medium' | 'high' }` constructor parameter. Temperature is omitted when reasoning is enabled (reasoning models reject custom temperature).
- **Default model**: `gpt-4o`

### Anthropic

- **LangChain class**: `ChatAnthropic` (`@langchain/anthropic`)
- **Authentication**: `anthropicApiKey` parameter
- **Reasoning**: Enabled via `thinking` constructor parameter. Two modes:
  - `'adaptive'` → `{ type: 'adaptive' }`
  - numeric string `>= 1024` → `{ type: 'enabled', budget_tokens: N }`
- Temperature is omitted when thinking is enabled (Anthropic rejects temperature + thinking together).
- **Important**: `withStructuredOutput()` is incompatible with thinking enabled. Use a separate model instance without `reasoningLevel` for phases that require structured output.
- **Default model**: `claude-sonnet-4-5-20250929`

### Azure OpenAI

- **LangChain class**: `ChatOpenAI` with custom `configuration`
- **Authentication**: `api-key` request header (passed via `defaultHeaders`)
- **Endpoint format**: `${endpoint}/openai/deployments/${deployment}`
- **API version**: Query param `api-version`, default `2024-02-01`
- **Reasoning**: Same as OpenAI (native `reasoning: { effort }` parameter)
- **Default model**: Uses deployment name (no separate default)
- **Type alias**: The legacy env var path uses the type string `'azure'`; `TYPE_ALIASES['azure'] = 'azure_openai'` maps it to the canonical type.

### Snowflake Cortex

- **LangChain class**: `ChatOpenAI` with custom `configuration.baseURL`
- **Authentication**: Personal Access Token passed as `openAIApiKey` parameter
- **Endpoint**: `https://{account}.snowflakecomputing.com/api/v2/cortex/v1`
- **Protocol**: OpenAI-compatible REST API; no custom headers required beyond Bearer auth
- **No env var fallback**: Requires a DB record
- **Default model**: `claude-3-7-sonnet`
- **Available models** (examples): `claude-3-7-sonnet`, `mistral-large`, `llama3.1-70b`

### Databricks

- **LangChain class**: `ChatOpenAI` with custom `configuration.baseURL`
- **Authentication**: Personal Access Token passed as `openAIApiKey` parameter
- **Endpoint**: `https://{host}/serving-endpoints`
- **Model name**: The `endpoint` config field is used as the `modelName` parameter (Databricks Foundation Model APIs use the serving endpoint name as the model identifier)
- **Protocol**: OpenAI-compatible Foundation Model APIs
- **No env var fallback**: Requires a DB record
- **No default model**: Endpoint name is required and serves as the model identifier

### Type Aliases

The `TYPE_ALIASES` map provides backward compatibility for existing data that references legacy type strings:

```typescript
const TYPE_ALIASES: Record<string, ProviderType> = {
  azure: 'azure_openai',
};
```

`data_chats.llm_provider = 'azure'` is resolved to `'azure_openai'` before DB lookup and model construction.

---

## Agent Configuration (agentConfigs)

Per-agent, per-provider tuning is stored in `system_settings.value.agentConfigs` (JSONB). This is Layer 2 of the two-layer architecture.

### Schema

```typescript
interface AgentProviderConfig {
  temperature?: number;      // 0.0–2.0
  model?: string;            // overrides provider's defaultModel
  reasoningLevel?: string;   // provider-specific (see Provider Integration)
}

interface AgentConfigs {
  dataAgent?:     Record<string, AgentProviderConfig | undefined>;
  semanticModel?: Record<string, AgentProviderConfig | undefined>;
}
```

### Example System Settings Value

```json
{
  "ui": { "allowUserThemeOverride": true },
  "features": {},
  "agentConfigs": {
    "dataAgent": {
      "openai": {
        "temperature": 0.2,
        "model": "gpt-4o-mini",
        "reasoningLevel": "medium"
      },
      "anthropic": {
        "temperature": 0.0,
        "reasoningLevel": "adaptive"
      }
    },
    "semanticModel": {
      "openai": {
        "temperature": 0.0,
        "model": "gpt-4o"
      }
    }
  }
}
```

### How Agents Use agentConfigs

Agents retrieve the system settings and build an `LlmModelConfig` from the relevant `agentConfigs` entry before calling `LlmService.getChatModel()`:

```typescript
const agentConfig = systemSettings.agentConfigs?.dataAgent?.[provider] ?? {};

const model = await llmService.getChatModel(provider, {
  temperature: agentConfig.temperature,
  model:       agentConfig.model,
  reasoningLevel: agentConfig.reasoningLevel,
});
```

### Deep Merge Behavior on PATCH

The settings `PATCH` endpoint merges the submitted value into the existing settings at the top level. When saving `agentConfigs`, the frontend must include the full `agentConfigs` object (spreading the existing value and replacing only the changed agent key) to avoid overwriting configurations for other agents.

```typescript
// SystemSettingsPage.handleAgentConfigSave
await updateSettings({
  agentConfigs: {
    ...settings?.agentConfigs,
    [agentKey]: providerConfigs,
  },
});
```

### Supported agentKey Values

| agentKey | Used By |
|---|---|
| `dataAgent` | Data Agent chat pipeline (all six phases) |
| `semanticModel` | Semantic Model generation agent |

---

## Frontend Components

### LlmProviderSettings

**File**: `apps/web/src/components/admin/LlmProviderSettings.tsx`

CRUD management table rendered in the System Settings "LLM Providers" tab. Responsibilities:
- Displays all providers in a `Table` with columns: Name, Type, Model, Status (enabled chip), Default (star icon), Last Test (success/error icon with tooltip), Actions.
- "Add Provider" button opens `LlmProviderDialog` in create mode.
- Edit icon fetches full provider detail via `getLlmProviderById(id)` before opening `LlmProviderDialog` in edit mode (to prefill non-sensitive config fields).
- Enable/disable `Switch` calls `editProvider(id, { enabled })` inline without opening the dialog.
- Test (play) icon calls `testProviderConnection(id)` and shows success/error via `Snackbar` and `Alert`.
- Delete icon opens a confirmation dialog before calling `removeProvider(id)`.
- Uses `useLlmProvidersCrud` hook for all data operations.
- `TYPE_DISPLAY_NAMES` maps type keys to human-readable labels (same map as `PROVIDER_DISPLAY_NAMES` in backend types).

### LlmProviderDialog

**File**: `apps/web/src/components/admin/LlmProviderDialog.tsx`

MUI `Dialog` for creating and editing providers. Responsibilities:
- In **create mode**: type selector (all five types, already-configured types disabled), name field, dynamic config fields, enabled/default toggles.
- In **edit mode**: type selector is disabled (type cannot change), non-sensitive config fields pre-filled, password fields start empty with placeholder `(unchanged)`.
- `PROVIDER_CONFIGS` map drives dynamic field rendering. Each field specifies `key`, `label`, `type` (`text` | `password` | `url`), `required`, `placeholder`, and `helperText`.
- Password fields have a visibility toggle (eye icon) using `InputAdornment`.
- In edit mode, required password fields are not enforced in validation (empty = keep existing).
- On save, edit mode only includes config in the payload if any field changed (`hasConfigChanges` flag).

**Dynamic fields per provider type**:

| Type | Fields |
|---|---|
| `openai` | API Key (password, required), Default Model (text, optional) |
| `anthropic` | API Key (password, required), Default Model (text, optional) |
| `azure_openai` | API Key (password, required), Endpoint URL (url, required), Deployment Name (text, required), API Version (text, optional), Display Model Name (text, optional) |
| `snowflake_cortex` | Account Identifier (text, required), Personal Access Token (password, required), Default Model (text, optional) |
| `databricks` | Workspace Host (text, required), Personal Access Token (password, required), Serving Endpoint (text, required) |

### AgentConfigSettings

**File**: `apps/web/src/components/admin/AgentConfigSettings.tsx`

Per-agent tuning panel rendered in the System Settings "Agent Configuration" tab. Accepts an `agentKey` prop (`'dataAgent'` or `'semanticModel'`).

- Fetches enabled providers from `GET /api/llm/providers` on mount.
- Renders one `Paper` card per enabled provider showing:
  - Model override text field (placeholder shows provider's current default model)
  - Temperature `Slider` (0–2, step 0.1)
  - Reasoning Level `Select` (options vary by provider type):
    - OpenAI / Azure OpenAI: None, Low, Medium, High
    - Anthropic: None, Adaptive, Custom Budget (token budget `TextField` appears when Custom is selected)
    - Snowflake Cortex / Databricks: no reasoning control shown
- "Save Changes" button is disabled until local state differs from the persisted settings.
- On save, only configs for currently enabled providers are included (orphaned configs for deleted providers are silently dropped).
- `PROVIDER_DISPLAY_NAMES` map used for card headings.

### SystemSettingsPage Tab Layout

**File**: `apps/web/src/pages/SystemSettingsPage.tsx`

Five-tab layout in a MUI `Paper`:

| Index | Label | Content |
|---|---|---|
| 0 | UI Settings | `UISettings` component |
| 1 | Feature Flags | `FeatureFlagsList` component |
| 2 | LLM Providers | `LlmProviderSettings` component |
| 3 | Agent Configuration | `AgentConfigSettings` for `dataAgent` and `semanticModel` (separated by `Divider`) |
| 4 | Advanced (JSON) | `SystemSettingsEditor` raw JSON editor |

Access to this page requires `system_settings:read` permission; write operations check `system_settings:write`.

### Supporting Types

Relevant types from `apps/web/src/types/index.ts` (or equivalent):

```typescript
type LLMProviderType = 'openai' | 'anthropic' | 'azure_openai' | 'snowflake_cortex' | 'databricks';

interface LLMProviderInfo {
  id?: string;
  type: string;
  name: string;
  enabled: boolean;
  isDefault: boolean;
  model: string;
}

interface LLMProviderDetail extends LLMProviderInfo {
  config?: Record<string, unknown>; // masked
  lastTestedAt?: string | null;
  lastTestResult?: boolean | null;
  lastTestMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AgentProviderConfig {
  temperature?: number;
  model?: string;
  reasoningLevel?: string;
}

interface CreateLlmProviderRequest {
  type: LLMProviderType;
  name: string;
  enabled: boolean;
  isDefault: boolean;
  config: Record<string, string>;
}

interface UpdateLlmProviderRequest {
  name?: string;
  enabled?: boolean;
  isDefault?: boolean;
  config?: Record<string, string>;
}
```

---

## Caching

`LlmProviderService` maintains two in-memory caches with a 60-second TTL:

### configCache

- **Type**: `Map<string, { config: any; expiry: number }>`
- **Key**: provider type string (resolved through `TYPE_ALIASES`)
- **Value**: decrypted config object
- **Populated by**: `getDecryptedConfig(type)` on cache miss
- **Used by**: `LlmService.getChatModel()` on every agent invocation

### providerListCache

- **Type**: `{ data: LLMProviderInfo[]; expiry: number } | null`
- **Populated by**: `getEnabledProviders()` on cache miss
- **Used by**: `LlmService.getEnabledProviders()` and the `GET /api/llm/providers` list endpoint

### Cache Invalidation

`invalidateCache()` clears both caches and is called synchronously at the end of every mutating operation:

| Operation | Invalidates Cache |
|---|---|
| `create()` | Yes |
| `update()` | Yes |
| `delete()` | Yes |
| `testProvider()` | No (test metadata update does not affect config or enabled list) |

Cache invalidation is synchronous and in-process. In a multi-instance deployment, each instance maintains its own cache. A provider update on one instance takes up to 60 seconds to be reflected in other instances.

---

## File Inventory

### Backend Files

| File | Purpose |
|---|---|
| `apps/api/src/llm/llm.module.ts` | NestJS module wiring `LlmService`, `LlmProviderService`, `LlmProvidersController` |
| `apps/api/src/llm/llm.service.ts` | DB-first model creation, env var fallback, provider list |
| `apps/api/src/llm/llm-provider.service.ts` | CRUD, encryption/decryption, caching, config masking |
| `apps/api/src/llm/llm-providers.controller.ts` | REST endpoints for CRUD + test |
| `apps/api/src/llm/types/provider-config.types.ts` | TypeScript interfaces, `PROVIDER_TYPES`, `SENSITIVE_FIELDS`, `DEFAULT_MODELS`, `PROVIDER_DISPLAY_NAMES`, `TYPE_ALIASES` |
| `apps/api/src/llm/dto/create-llm-provider.dto.ts` | Zod schema + DTO for create, per-type config schemas, `CONFIG_SCHEMAS` map |
| `apps/api/src/llm/dto/update-llm-provider.dto.ts` | Zod schema + DTO for update |
| `apps/api/src/common/schemas/settings.schema.ts` | `agentProviderConfigSchema`, `agentConfigSchema`, `systemSettingsSchema` |
| `apps/api/src/common/types/settings.types.ts` | `AgentProviderConfig`, `AgentConfigs`, `SystemSettingsValue` |
| `apps/api/src/common/utils/encryption.util.ts` | Shared AES-256-GCM `encrypt`/`decrypt` utility |
| `apps/api/prisma/schema.prisma` | `LlmProvider` model definition |
| `apps/api/prisma/seed.ts` | Seeds `llm_providers:read/write/delete` permissions and role assignments |

### Frontend Files

| File | Purpose |
|---|---|
| `apps/web/src/components/admin/LlmProviderSettings.tsx` | CRUD management table |
| `apps/web/src/components/admin/LlmProviderDialog.tsx` | Create/edit dialog with dynamic per-type fields |
| `apps/web/src/components/admin/AgentConfigSettings.tsx` | Per-agent, per-provider tuning panel |
| `apps/web/src/pages/SystemSettingsPage.tsx` | Five-tab System Settings page including LLM Providers and Agent Configuration tabs |
| `apps/web/src/hooks/useLlmProvidersCrud.ts` | React hook for provider CRUD operations and test |
| `apps/web/src/services/api.ts` | `getLlmProviders`, `getLlmProviderById`, `createLlmProvider`, `updateLlmProvider`, `deleteLlmProvider`, `testLlmProvider` API functions |

---

## Testing

### Backend Unit Tests

Unit tests should cover:

- `LlmProviderService`:
  - `create()`: validates config against per-type schema, enforces one-per-type constraint, encrypts config, handles `isDefault` transaction
  - `update()`: validates new config against existing type, preserves existing config when `config` is undefined, handles `isDefault` transaction
  - `delete()`: throws `NotFoundException` for unknown IDs
  - `getDecryptedConfig()`: cache hit path, cache miss path, returns `null` for disabled/missing provider
  - `getEnabledProviders()`: cache hit path, returns `LLMProviderInfo` shape with resolved model
  - `maskConfig()`: replaces sensitive fields with `'********'`, passes through non-sensitive fields
  - `invalidateCache()`: clears both caches after each mutation

- `LlmService`:
  - `getChatModel()`: DB provider path constructs correct `ChatOpenAI`/`ChatAnthropic`, env fallback path activated when DB returns `null`
  - `getChatModel()` with `reasoningLevel`: OpenAI includes `reasoning` param and omits `temperature`; Anthropic includes `thinking` param; no reasoning when not set
  - `getDefaultProvider()`: returns DB default when available, falls back to `LLM_DEFAULT_PROVIDER` env var
  - Snowflake Cortex: `baseURL` constructed correctly from account identifier
  - Databricks: `modelName` set to endpoint name, `baseURL` to workspace serving-endpoints URL
  - `TYPE_ALIASES` resolution: `'azure'` resolves to `'azure_openai'` throughout

### Backend Integration Tests

Integration tests (against test DB) should cover:

- Full CRUD lifecycle: create → list → get by ID → update → delete
- Conflict error when creating a second provider of the same type
- `isDefault` exclusivity: setting a new default clears the previous default atomically
- Test endpoint: records `lastTestResult` and `lastTestMessage` on the provider row
- Permission enforcement: contributor and viewer cannot POST/PATCH/DELETE; all roles can GET list

### Frontend Component Tests

Component tests (Vitest + React Testing Library + MSW) should cover:

- `LlmProviderSettings`:
  - Renders provider table with correct columns
  - "Add Provider" button opens dialog in create mode
  - Enable/disable toggle calls update API
  - Test button shows loading state during test, success message on pass, error message on fail
  - Delete confirmation dialog appears before deletion

- `LlmProviderDialog`:
  - Create mode: type selector shows all five types, already-configured types are disabled
  - Create mode: changing type clears config and updates default name
  - Create mode: required field validation fires on save
  - Edit mode: type selector is disabled; non-sensitive fields pre-filled; password fields start empty
  - Edit mode: config omitted from payload when no fields changed
  - Password visibility toggle works

- `AgentConfigSettings`:
  - Renders one card per enabled provider
  - Reasoning level selector shows correct options per provider type
  - Anthropic custom budget field appears when "Custom Budget" is selected
  - Save button disabled until changes are made
  - Only enabled provider configs are included in save payload

### Manual Testing Scenarios

1. Create an OpenAI provider, verify the API key is masked in the list and detail responses.
2. Attempt to create a second OpenAI provider — expect HTTP 409.
3. Set a provider as default, then set a different provider as default — verify only one `isDefault = true` remains.
4. Test a provider with an invalid API key — verify `lastTestResult = false` and an error message is stored.
5. Delete a provider — verify agents fall back to the default or env var provider.
6. Configure `agentConfigs.dataAgent.openai.temperature = 0.5` in System Settings, start a Data Agent chat — verify the agent uses the configured temperature.

### Run Commands

```bash
# Backend tests
cd apps/api && npm test

# Frontend tests
cd apps/web && npm test
```

---

## Configuration

### Environment Variables

The following env vars apply to the LLM Providers feature. All `OPENAI_*`, `ANTHROPIC_*`, and `AZURE_*` variables are **fallback only** — they are used only when no DB provider of the corresponding type is configured.

```bash
# Encryption (required for any provider to function)
ENCRYPTION_KEY=<32-byte-hex-or-base64-key>

# Default provider fallback (used when no DB default is set)
# Valid values: openai | anthropic | azure
LLM_DEFAULT_PROVIDER=openai

# Max retries for transient LLM API failures
LLM_MAX_RETRIES=3

# OpenAI (env var fallback — used only if no openai DB record exists)
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o

# Anthropic (env var fallback — used only if no anthropic DB record exists)
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929

# Azure OpenAI (env var fallback — used only if no azure_openai DB record exists)
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_DEPLOYMENT=
AZURE_OPENAI_API_VERSION=2024-02-01
```

Snowflake Cortex and Databricks have no env var fallback. They require a DB-backed `llm_providers` record.

### Migration

The `llm_providers` table is created by a Prisma migration. To apply:

```bash
# Development
cd apps/api && npm run prisma:migrate:dev -- --name add_llm_providers

# Production
cd apps/api && npm run prisma:migrate
```

### Seed Permissions

The seed script (`apps/api/prisma/seed.ts`) creates the three `llm_providers` permissions and assigns them to roles. To run the seed:

```bash
cd apps/api && npm run prisma:seed
```

Permissions seeded:

| Permission | Roles |
|---|---|
| `llm_providers:read` | admin, contributor, viewer |
| `llm_providers:write` | admin |
| `llm_providers:delete` | admin |
