# Database Connections Feature Specification

## Table of Contents

1. [Feature Overview](#feature-overview)
2. [Architecture](#architecture)
3. [Database Schema](#database-schema)
4. [API Endpoints](#api-endpoints)
5. [Security](#security)
6. [RBAC Permissions](#rbac-permissions)
7. [Database Drivers](#database-drivers)
8. [Frontend Components](#frontend-components)
9. [Key Patterns for Reuse](#key-patterns-for-reuse)
10. [File Inventory](#file-inventory)
11. [Testing](#testing)
12. [Configuration](#configuration)

---

## Feature Overview

The Database Connections feature enables users to configure, store, manage, and test connections to external databases across five supported database types:

- **PostgreSQL** (default port: 5432)
- **MySQL** (default port: 3306)
- **SQL Server** (default port: 1433)
- **Databricks** (default port: 443)
- **Snowflake** (default port: 443)

### Core Capabilities

- **Create** connections with encrypted credential storage
- **Read** connections with pagination, search, and filtering
- **Update** connections (partial updates supported)
- **Delete** connections
- **Test** connections (both saved and unsaved configurations)
- **System-level shared resources** - all authorized users can see and manage connections based on RBAC permissions
- **Type-specific configuration** - JSONB `options` field stores database-specific parameters
- **Audit trail** - all CRUD operations logged to `audit_events` table

### Use Cases

1. **Data Engineers**: Configure connections to data warehouses (Databricks, Snowflake) for ETL jobs
2. **Developers**: Store development and staging database credentials securely
3. **Analysts**: Test database connectivity before running queries
4. **Admins**: Validate credentials and connection parameters

---

## Architecture

The feature follows a clean layered architecture with complete separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                       Frontend Layer                        │
│  React + Material UI + TypeScript                           │
│                                                               │
│  ConnectionsPage → useConnections hook → API client         │
│  ConnectionDialog (create/edit form)                        │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTPS (Nginx)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                       Backend Layer                         │
│  NestJS + Fastify + TypeScript                              │
│                                                               │
│  ConnectionsController (REST endpoints)                     │
│         ↓                                                    │
│  ConnectionsService (business logic + encryption)           │
│         ↓                                                    │
│  Database Drivers (PostgreSQL, MySQL, etc.)                 │
└────────────────────────────┬────────────────────────────────┘
                             │ Prisma ORM
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                      Database Layer                         │
│  PostgreSQL                                                  │
│                                                               │
│  data_connections table (encrypted credentials)             │
│  audit_events table (audit trail)                           │
└─────────────────────────────────────────────────────────────┘
```

### Layer Responsibilities

#### Frontend
- **Page**: `ConnectionsPage.tsx` - UI layout, table, search, filters, pagination
- **Dialog**: `ConnectionDialog.tsx` - Create/edit form with type-specific fields
- **Hook**: `useConnections.ts` - State management and API integration
- **Types**: `types/index.ts` - TypeScript interfaces for type safety
- **API Client**: `services/api.ts` - HTTP request functions

#### Backend
- **Controller**: `connections.controller.ts` - HTTP endpoint definitions, OpenAPI docs
- **Service**: `connections.service.ts` - Business logic, encryption/decryption, audit logging
- **DTOs**: `dto/*.dto.ts` - Request validation using Zod schemas
- **Drivers**: `drivers/*.driver.ts` - Database-specific connection testing
- **Module**: `connections.module.ts` - NestJS dependency injection container

#### Database
- **Schema**: `schema.prisma` - Prisma model definition
- **Migrations**: Auto-generated migration files
- **Seed**: RBAC permissions seeded via `prisma/seed.ts`

### System-Level Resource Access

Connections are system-level shared resources accessible to all authorized users. Access is controlled by RBAC permissions, not ownership filtering:

```typescript
// Service layer returns all connections (no ownership filtering)
async list(query: ConnectionQueryDto, userId: string) {
  const where: any = {
    // No ownerId filter - all connections visible to authorized users
  };
  // ...
}
```

- **Create**: `createdByUserId` set to authenticated user ID (for audit tracking only)
- **Read**: All authorized users can see all connections (no ownership filter)
- **Update/Delete**: All authorized users can modify/delete any connection (RBAC-controlled)
- **Test**: All authorized users can test any connection

Access control is enforced through RBAC permissions (`connections:read`, `connections:write`, etc.), not ownership checks.

---

## Database Schema

### DataConnection Model (Prisma)

Located in `apps/api/prisma/schema.prisma`:

```prisma
enum DatabaseType {
  postgresql
  mysql
  sqlserver
  databricks
  snowflake
}

model DataConnection {
  id                  String       @id @default(uuid()) @db.Uuid
  name                String
  description         String?
  dbType              DatabaseType @map("db_type")
  host                String
  port                Int
  databaseName        String?      @map("database_name")
  username            String?
  encryptedCredential String?      @map("encrypted_credential")
  useSsl              Boolean      @default(false) @map("use_ssl")
  options             Json?        // JSONB for type-specific config
  createdByUserId     String?      @map("created_by_user_id") @db.Uuid
  lastTestedAt        DateTime?    @map("last_tested_at") @db.Timestamptz
  lastTestResult      Boolean?     @map("last_test_result")
  lastTestMessage     String?      @map("last_test_message")
  createdAt           DateTime     @default(now()) @map("created_at") @db.Timestamptz
  updatedAt           DateTime     @updatedAt @map("updated_at") @db.Timestamptz

  // Relations
  createdByUser User? @relation("UserDataConnections", fields: [createdByUserId], references: [id], onDelete: SetNull)

  @@index([createdByUserId])
  @@index([dbType])
  @@map("data_connections")
}
```

### Field Definitions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | Primary key |
| `name` | String | Yes | User-defined name (max 100 chars) |
| `description` | String | No | Optional description (max 500 chars) |
| `dbType` | Enum | Yes | Database type (postgresql, mysql, sqlserver, databricks, snowflake) |
| `host` | String | Yes | Hostname or IP address (max 255 chars) |
| `port` | Integer | Yes | Port number (1-65535) |
| `databaseName` | String | No | Database/catalog name (max 255 chars) |
| `username` | String | No | Authentication username (max 255 chars) |
| `encryptedCredential` | String | No | AES-256-GCM encrypted password/token |
| `useSsl` | Boolean | Yes | Enable SSL/TLS (default: false) |
| `options` | JSONB | No | Type-specific configuration (see below) |
| `createdByUserId` | UUID | No | Foreign key to users.id (nullable, for audit tracking only) |
| `lastTestedAt` | Timestamp | No | Last test execution time |
| `lastTestResult` | Boolean | No | Last test success/failure |
| `lastTestMessage` | String | No | Last test result message |
| `createdAt` | Timestamp | Yes | Record creation time |
| `updatedAt` | Timestamp | Yes | Last update time |

### Options Field (JSONB)

The `options` field stores database-specific configuration:

#### Databricks
```json
{
  "httpPath": "/sql/1.0/warehouses/abc123"
}
```

#### Snowflake
```json
{
  "account": "xy12345.us-east-1",
  "warehouse": "COMPUTE_WH",
  "role": "ANALYST",
  "schema": "PUBLIC"
}
```

#### SQL Server
```json
{
  "instanceName": "SQLEXPRESS",
  "encrypt": true,
  "trustServerCertificate": false
}
```

#### PostgreSQL / MySQL
```json
{
  "schema": "public"
}
```

### Indexes

- `createdByUserId` - Fast lookup for audit queries (who created which connections)
- `dbType` - Filtering by database type

---

## API Endpoints

All endpoints require authentication. Base path: `/api/connections`

### 1. List Connections

```http
GET /api/connections
```

**Query Parameters:**
- `page` (number, default: 1) - Page number
- `pageSize` (number, default: 20) - Items per page
- `search` (string, optional) - Search in name/description
- `dbType` (enum, optional) - Filter by database type
- `sortBy` (enum, default: 'createdAt') - Sort field (name, dbType, createdAt, lastTestedAt)
- `sortOrder` (enum, default: 'desc') - Sort direction (asc, desc)

**Permission:** `connections:read`

**Response (200):**
```json
{
  "data": {
    "items": [
      {
        "id": "uuid",
        "name": "Production PostgreSQL",
        "description": "Main application database",
        "dbType": "postgresql",
        "host": "db.example.com",
        "port": 5432,
        "databaseName": "app_prod",
        "username": "app_user",
        "hasCredential": true,
        "useSsl": true,
        "options": { "schema": "public" },
        "lastTestedAt": "2024-01-15T10:30:00Z",
        "lastTestResult": true,
        "lastTestMessage": "Connection successful",
        "createdAt": "2024-01-01T00:00:00Z",
        "updatedAt": "2024-01-15T10:30:00Z",
        "createdByUserId": "user-uuid"
      }
    ],
    "total": 25,
    "page": 1,
    "pageSize": 20,
    "totalPages": 2
  }
}
```

**Note:** Passwords are never returned. The `hasCredential` boolean indicates if a password is stored.

---

### 2. Get Connection by ID

```http
GET /api/connections/:id
```

**Parameters:**
- `id` (UUID, path) - Connection ID

**Permission:** `connections:read`

**Response (200):** Single connection object (same structure as list items)

**Response (404):** Connection not found

---

### 3. Create Connection

```http
POST /api/connections
```

**Permission:** `connections:write`

**Request Body:**
```json
{
  "name": "Development MySQL",
  "description": "Local development database",
  "dbType": "mysql",
  "host": "localhost",
  "port": 3306,
  "databaseName": "dev_db",
  "username": "root",
  "password": "secret123",
  "useSsl": false,
  "options": {
    "schema": "app"
  }
}
```

**Validation Rules:**
- `name`: Required, 1-100 characters
- `description`: Optional, max 500 characters
- `dbType`: Required, one of: postgresql, mysql, sqlserver, databricks, snowflake
- `host`: Required, 1-255 characters
- `port`: Required, integer 1-65535
- `databaseName`: Optional, max 255 characters
- `username`: Optional, max 255 characters
- `password`: Optional, max 1000 characters (encrypted before storage)
- `useSsl`: Boolean, default false
- `options`: Optional, record of key-value pairs

**Response (201):** Created connection object

**Response (400):** Validation error

**Audit Event:** `connections:create` logged with connection name and dbType

---

### 4. Update Connection

```http
PATCH /api/connections/:id
```

**Permission:** `connections:write`

**Request Body:** Partial update (all fields optional)
```json
{
  "name": "Updated Name",
  "port": 5433,
  "password": "new-password"
}
```

**Password Handling:**
- `password` not provided: Existing credential preserved
- `password: ""` (empty string): Credential removed
- `password: "newvalue"`: Credential updated

**Response (200):** Updated connection object

**Response (404):** Connection not found

**Audit Event:** `connections:update` logged

---

### 5. Delete Connection

```http
DELETE /api/connections/:id
```

**Permission:** `connections:delete`

**Response (204):** No content (success)

**Response (404):** Connection not found

**Audit Event:** `connections:delete` logged

---

### 6. Test New Connection

```http
POST /api/connections/test
```

**Permission:** `connections:test`

**Request Body:** Same as create, but not saved
```json
{
  "dbType": "postgresql",
  "host": "test.example.com",
  "port": 5432,
  "username": "testuser",
  "password": "testpass",
  "useSsl": true
}
```

**Response (201):**
```json
{
  "data": {
    "success": true,
    "message": "Connection successful",
    "latencyMs": 145
  }
}
```

**Note:** This endpoint does NOT save the connection. Use it to validate credentials before creating.

---

### 7. Test Existing Connection

```http
POST /api/connections/:id/test
```

**Permission:** `connections:test`

**Response (201):** Same test result format as above

**Side Effects:**
- Updates `lastTestedAt`, `lastTestResult`, `lastTestMessage` fields
- Creates audit event `connections:test`

**Response (404):** Connection not found

---

## Security

### Encryption at Rest

Passwords and access tokens are encrypted using **AES-256-GCM** before storage.

#### Encryption Implementation

File: `apps/api/src/common/utils/encryption.util.ts`

```typescript
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Format: base64(iv):base64(authTag):base64(ciphertext)
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decrypt(encrypted: string, key: Buffer): string {
  const [ivB64, authTagB64, ciphertextB64] = encrypted.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
```

**Security Features:**
- **AES-256-GCM**: Authenticated encryption prevents tampering
- **Random IV**: Each encryption produces different ciphertext (prevents pattern analysis)
- **Auth Tag**: Detects any modification to ciphertext
- **Key Validation**: Enforces 32-byte (256-bit) key length

#### Key Management

The encryption key is stored in the `ENCRYPTION_KEY` environment variable:

```typescript
export function getEncryptionKey(): Buffer {
  const keyStr = process.env.ENCRYPTION_KEY;
  if (!keyStr) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }

  // Accept base64-encoded or raw UTF-8 32-byte key
  const base64Decoded = Buffer.from(keyStr, 'base64');
  if (base64Decoded.length === 32) return base64Decoded;

  const rawKey = Buffer.from(keyStr, 'utf8');
  if (rawKey.length === 32) return rawKey;

  throw new Error('ENCRYPTION_KEY must be exactly 32 bytes');
}
```

**Key Requirements:**
- Exactly 32 bytes (256 bits)
- Can be base64-encoded or raw UTF-8
- **MUST** be set in production

**Example Key Generation:**
```bash
# Generate random 32-byte key (base64-encoded)
openssl rand -base64 32
```

### API Response Security

Passwords are **never** returned in API responses:

```typescript
private mapConnection(connection: any) {
  return {
    id: connection.id,
    name: connection.name,
    // ... other fields ...
    hasCredential: connection.encryptedCredential !== null, // ← Boolean flag only
    // encryptedCredential field is NOT included
    // password field is NOT included
  };
}
```

Frontend receives `hasCredential: true/false` to show UI indicators without exposing secrets.

### Transport Security

- All API traffic over HTTPS (enforced by Nginx)
- Credentials never logged
- Connection test timeouts prevent DoS (10s default)

---

## RBAC Permissions

Defined in `apps/api/src/common/constants/roles.constants.ts`:

```typescript
export const PERMISSIONS = {
  CONNECTIONS_READ: 'connections:read',
  CONNECTIONS_WRITE: 'connections:write',
  CONNECTIONS_DELETE: 'connections:delete',
  CONNECTIONS_TEST: 'connections:test',
} as const;
```

### Permission Matrix

| Role | connections:read | connections:write | connections:delete | connections:test |
|------|-----------------|-------------------|-------------------|------------------|
| **Admin** | ✅ | ✅ | ✅ | ✅ |
| **Contributor** | ✅ | ✅ | ✅ | ✅ |
| **Viewer** | ❌ | ❌ | ❌ | ❌ |

**Note:** Viewers have NO access to connections (enterprise data security requirement). All authorized users can see and manage all connections - access is controlled by RBAC permissions, not ownership.

### Controller Usage

Permissions are enforced via `@Auth` decorator:

```typescript
@Get()
@Auth({ permissions: [PERMISSIONS.CONNECTIONS_READ] })
@ApiOperation({ summary: 'List data connections' })
async list(
  @Query() query: ConnectionQueryDto,
  @CurrentUser('id') userId: string,
) {
  return this.connectionsService.list(query, userId);
}
```

The decorator:
1. Validates JWT token
2. Checks user has required permission(s)
3. Returns 401 if not authenticated
4. Returns 403 if missing permission
5. Injects `userId` from token claims

---

## Database Drivers

The driver pattern abstracts database-specific connection logic.

### Driver Interface

File: `apps/api/src/connections/drivers/driver.interface.ts`

```typescript
export interface ConnectionParams {
  host: string;
  port: number;
  databaseName?: string;
  username?: string;
  password?: string;
  useSsl: boolean;
  options?: Record<string, unknown>;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  latencyMs: number;
}

export interface DatabaseDriver {
  testConnection(params: ConnectionParams): Promise<ConnectionTestResult>;
}
```

### Driver Factory

File: `apps/api/src/connections/drivers/index.ts`

```typescript
export function getDriver(dbType: string): DatabaseDriver {
  switch (dbType) {
    case 'postgresql':
      return new PostgreSQLDriver();
    case 'mysql':
      return new MySQLDriver();
    case 'sqlserver':
      return new SQLServerDriver();
    case 'databricks':
      return new DatabricksDriver();
    case 'snowflake':
      return new SnowflakeDriver();
    default:
      throw new BadRequestException(`Unsupported database type: ${dbType}`);
  }
}
```

### Example Driver: PostgreSQL

File: `apps/api/src/connections/drivers/postgresql.driver.ts`

```typescript
import { Client } from 'pg';
import { DatabaseDriver, ConnectionParams, ConnectionTestResult } from './driver.interface';

export class PostgreSQLDriver implements DatabaseDriver {
  async testConnection(params: ConnectionParams): Promise<ConnectionTestResult> {
    const start = Date.now();
    const client = new Client({
      host: params.host,
      port: params.port,
      database: params.databaseName || undefined,
      user: params.username || undefined,
      password: params.password || undefined,
      ssl: params.useSsl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 10000, // 10s timeout
      query_timeout: 10000,
    });

    try {
      await client.connect();
      await client.query('SELECT 1'); // Validate connection works
      const latencyMs = Date.now() - start;
      return { success: true, message: 'Connection successful', latencyMs };
    } catch (error) {
      const latencyMs = Date.now() - start;
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message, latencyMs };
    } finally {
      try {
        await client.end();
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
```

### Driver Implementations

All drivers follow the same pattern:

1. **Create client** with connection parameters
2. **Set timeout** (10s default prevents hangs)
3. **Connect** and run simple query (`SELECT 1`)
4. **Return result** with success status, message, latency
5. **Clean up** connection in finally block

**Packages:**
- PostgreSQL: `pg`
- MySQL: `mysql2`
- SQL Server: `mssql`
- Databricks: `@databricks/sql`
- Snowflake: `snowflake-sdk`

---

## Frontend Components

### 1. ConnectionsPage

File: `apps/web/src/pages/ConnectionsPage.tsx`

**Purpose:** Main page for viewing and managing connections

**Key Features:**
- Table with columns: Name, Type, Host, Database, Status, Last Tested, Actions
- Search by name/description
- Filter by database type
- Pagination (10, 20, 50 rows per page)
- Database type chips with color coding
- Status chips: Untested (gray), Connected (green), Failed (red)
- Action buttons: Test, Edit, Delete
- Permission-aware UI (buttons hidden if no permission)

**State Management:**
```typescript
const {
  connections,
  total,
  page,
  pageSize,
  isLoading,
  error,
  fetchConnections,
  createConnection,
  updateConnection,
  deleteConnection,
  testConnection,
  testNewConnection,
} = useConnections();
```

**Database Type Colors:**
```typescript
const DB_TYPE_CONFIG: Record<DatabaseType, { label: string; color: ... }> = {
  postgresql: { label: 'PostgreSQL', color: 'primary' },    // Blue
  mysql: { label: 'MySQL', color: 'warning' },              // Orange
  sqlserver: { label: 'SQL Server', color: 'error' },       // Red
  databricks: { label: 'Databricks', color: 'secondary' },  // Purple
  snowflake: { label: 'Snowflake', color: 'info' },         // Cyan
};
```

---

### 2. ConnectionDialog

File: `apps/web/src/components/connections/ConnectionDialog.tsx`

**Purpose:** Create or edit connection configuration

**Type-Specific Fields:**

The dialog dynamically shows/hides fields based on `dbType`:

```typescript
// All types
<TextField label="Connection Name" required />
<TextField label="Description" multiline />
<Select label="Database Type" required />
<TextField label="Host" required />
<TextField label="Port" type="number" required />
<TextField label="Database Name" />
<TextField label="Username" />
<TextField label="Password" type="password" />
<Switch label="Use SSL" />

// Databricks only
{dbType === 'databricks' && (
  <TextField label="HTTP Path" required helperText="e.g., /sql/1.0/warehouses/abc123" />
)}

// Snowflake only
{dbType === 'snowflake' && (
  <>
    <TextField label="Account" required helperText="e.g., xy12345.us-east-1" />
    <TextField label="Warehouse" />
    <TextField label="Role" />
    <TextField label="Schema" />
  </>
)}

// SQL Server only
{dbType === 'sqlserver' && (
  <>
    <TextField label="Instance Name" />
    <Switch label="Encrypt Connection" />
    <Switch label="Trust Server Certificate" />
  </>
)}

// PostgreSQL / MySQL only
{(dbType === 'postgresql' || dbType === 'mysql') && (
  <TextField label="Schema" />
)}
```

**Port Auto-Fill:**

When database type changes, port auto-fills unless user manually edited it:

```typescript
const DEFAULT_PORTS: Record<DatabaseType, number> = {
  postgresql: 5432,
  mysql: 3306,
  sqlserver: 1433,
  databricks: 443,
  snowflake: 443,
};

const handleDbTypeChange = (newType: DatabaseType) => {
  setDbType(newType);
  if (!portManuallySet) {
    setPort(DEFAULT_PORTS[newType]); // Auto-fill
  }
};
```

**Test Connection:**

"Test Connection" button validates config without saving:

```typescript
const handleTest = async () => {
  setIsTesting(true);
  try {
    const data: TestConnectionPayload = {
      dbType, host, port, databaseName, username, password, useSsl, options: buildOptions(),
    };
    const result = await onTestNew(data);
    setTestResult(result);
  } catch (err) {
    setTestResult({ success: false, message: err.message, latencyMs: 0 });
  } finally {
    setIsTesting(false);
  }
};
```

Result shown in Alert:
- Success: Green alert with message and latency (e.g., "Connection successful (145ms)")
- Failure: Red alert with error message

**Edit Mode:**

When `connection` prop is provided:
- Form pre-fills with existing values
- Password field shows helper text: "Leave blank to keep existing"
- Empty password preserves credential
- Submit button says "Save Changes" instead of "Create"

---

### 3. useConnections Hook

File: `apps/web/src/hooks/useConnections.ts`

**Purpose:** Encapsulate connections state and API calls

**Pattern:** Follows same structure as `useAllowlist` hook

**State:**
```typescript
const [connections, setConnections] = useState<DataConnection[]>([]);
const [total, setTotal] = useState(0);
const [page, setPage] = useState(1);
const [pageSize, setPageSize] = useState(20);
const [totalPages, setTotalPages] = useState(0);
const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
```

**Methods:**
```typescript
fetchConnections({ page?, pageSize?, search?, dbType?, sortBy?, sortOrder? })
createConnection(data: CreateConnectionPayload)
updateConnection(id: string, data: UpdateConnectionPayload)
deleteConnection(id: string)
testConnection(id: string) → ConnectionTestResult
testNewConnection(data: TestConnectionPayload) → ConnectionTestResult
```

**Auto-Refresh:**

CRUD operations automatically refresh the list:

```typescript
const createConnection = useCallback(async (data: CreateConnectionPayload) => {
  setError(null);
  try {
    await createConnectionApi(data);
    await fetchConnections({ page, pageSize }); // ← Refresh list
  } catch (err) {
    setError(err.message);
    throw err;
  }
}, [fetchConnections, page, pageSize]);
```

---

### 4. API Service Functions

File: `apps/web/src/services/api.ts`

```typescript
export async function getConnections(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  dbType?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}): Promise<ConnectionsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
  if (params?.search) searchParams.set('search', params.search);
  if (params?.dbType) searchParams.set('dbType', params.dbType);
  if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
  if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder);

  const query = searchParams.toString();
  return api.get<ConnectionsResponse>(`/connections${query ? `?${query}` : ''}`);
}

export async function createConnection(data: CreateConnectionPayload): Promise<DataConnection> {
  return api.post<DataConnection>('/connections', data);
}

export async function updateConnection(id: string, data: UpdateConnectionPayload): Promise<DataConnection> {
  return api.patch<DataConnection>(`/connections/${id}`, data);
}

export async function deleteConnection(id: string): Promise<void> {
  await api.delete<void>(`/connections/${id}`);
}

export async function testNewConnection(data: TestConnectionPayload): Promise<ConnectionTestResult> {
  return api.post<ConnectionTestResult>('/connections/test', data);
}

export async function testExistingConnection(id: string): Promise<ConnectionTestResult> {
  return api.post<ConnectionTestResult>(`/connections/${id}/test`);
}
```

---

### 5. TypeScript Types

File: `apps/web/src/types/index.ts`

```typescript
export type DatabaseType = 'postgresql' | 'mysql' | 'sqlserver' | 'databricks' | 'snowflake';

export interface DataConnection {
  id: string;
  name: string;
  description: string | null;
  dbType: DatabaseType;
  host: string;
  port: number;
  databaseName: string | null;
  username: string | null;
  hasCredential: boolean;
  useSsl: boolean;
  options: Record<string, unknown> | null;
  lastTestedAt: string | null;
  lastTestResult: boolean | null;
  lastTestMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateConnectionPayload {
  name: string;
  description?: string;
  dbType: DatabaseType;
  host: string;
  port: number;
  databaseName?: string;
  username?: string;
  password?: string;
  useSsl?: boolean;
  options?: Record<string, unknown>;
}

export interface UpdateConnectionPayload {
  name?: string;
  description?: string;
  dbType?: DatabaseType;
  host?: string;
  port?: number;
  databaseName?: string;
  username?: string;
  password?: string;
  useSsl?: boolean;
  options?: Record<string, unknown>;
}

export interface TestConnectionPayload {
  dbType: DatabaseType;
  host: string;
  port: number;
  databaseName?: string;
  username?: string;
  password?: string;
  useSsl?: boolean;
  options?: Record<string, unknown>;
}

export interface ConnectionsResponse {
  items: DataConnection[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  latencyMs: number;
}
```

---

### 6. Routing and Navigation

**Route Definition:**

File: `apps/web/src/App.tsx`

```tsx
<Route path="/connections" element={<ConnectionsPage />} />
```

**Sidebar Entry:**

File: `apps/web/src/components/navigation/Sidebar.tsx`

```tsx
import StorageIcon from '@mui/icons-material/Storage';

<RequirePermission permission="connections:read">
  <ListItem button component={Link} to="/connections">
    <ListItemIcon>
      <StorageIcon />
    </ListItemIcon>
    <ListItemText primary="Connections" />
  </ListItem>
</RequirePermission>
```

**Permission-Based Visibility:**

The `RequirePermission` component hides the sidebar link if the user lacks `connections:read` permission.

---

## Key Patterns for Reuse

This section explains how to use the Database Connections implementation as a blueprint for similar features.

### 1. Adding a NestJS CRUD Module

**Steps:**

1. **Create module folder:** `apps/api/src/<feature>/`

2. **Define DTOs with Zod validation:**

```typescript
// dto/create-<feature>.dto.ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createFeatureSchema = z.object({
  name: z.string().min(1).max(100),
  // ... other fields
});

export class CreateFeatureDto extends createZodDto(createFeatureSchema) {}
```

3. **Create controller:**

```typescript
// <feature>.controller.ts
import { Controller, Get, Post, Patch, Delete, Param, Query, Body } from '@nestjs/common';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PERMISSIONS } from '../common/constants/roles.constants';

@ApiTags('Feature')
@Controller('feature')
export class FeatureController {
  constructor(private readonly featureService: FeatureService) {}

  @Get()
  @Auth({ permissions: [PERMISSIONS.FEATURE_READ] })
  async list(@Query() query: FeatureQueryDto, @CurrentUser('id') userId: string) {
    return this.featureService.list(query, userId);
  }

  @Post()
  @Auth({ permissions: [PERMISSIONS.FEATURE_WRITE] })
  async create(@Body() dto: CreateFeatureDto, @CurrentUser('id') userId: string) {
    return this.featureService.create(dto, userId);
  }

  // ... other endpoints
}
```

4. **Create service:**

```typescript
// <feature>.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FeatureService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: FeatureQueryDto, userId: string) {
    const { page, pageSize } = query;
    const skip = (page - 1) * pageSize;

    const where = {}; // System-level access - no ownership filtering

    const [items, total] = await Promise.all([
      this.prisma.feature.findMany({ where, skip, take: pageSize }),
      this.prisma.feature.count({ where }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  // ... other methods
}
```

5. **Create module:**

```typescript
// <feature>.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FeatureController } from './<feature>.controller';
import { FeatureService } from './<feature>.service';

@Module({
  imports: [PrismaModule],
  controllers: [FeatureController],
  providers: [FeatureService],
  exports: [FeatureService],
})
export class FeatureModule {}
```

6. **Register in AppModule:**

```typescript
// app.module.ts
import { FeatureModule } from './<feature>/<feature>.module';

@Module({
  imports: [
    // ... other modules
    FeatureModule,
  ],
})
export class AppModule {}
```

---

### 2. Implementing System-Level Resource Access

**Pattern:** Allow all authorized users to access resources, use `createdByUserId` for audit tracking only (not access control).

**Create:**
```typescript
async create(dto: CreateDto, userId: string) {
  const entity = await this.prisma.entity.create({
    data: {
      ...dto,
      createdByUserId: userId, // ← Track creator (for audit only)
    },
  });
  return entity;
}
```

**Read (List):**
```typescript
async list(query: QueryDto, userId: string) {
  // No ownership filtering - all authorized users see all resources
  const where = {}; // ← No createdByUserId filter
  const items = await this.prisma.entity.findMany({ where });
  return items;
}
```

**Read (Single):**
```typescript
async getById(id: string, userId: string) {
  // Use findUnique since we're not filtering by ownership
  const entity = await this.prisma.entity.findUnique({
    where: { id }, // ← No createdByUserId check
  });

  if (!entity) {
    throw new NotFoundException(`Entity ${id} not found`);
  }

  return entity;
}
```

**Update/Delete:**
```typescript
async update(id: string, dto: UpdateDto, userId: string) {
  // Verify entity exists (no ownership check)
  const existing = await this.prisma.entity.findUnique({
    where: { id }, // ← No createdByUserId check
  });

  if (!existing) {
    throw new NotFoundException(`Entity ${id} not found`);
  }

  // Update (any authorized user can update)
  const updated = await this.prisma.entity.update({
    where: { id },
    data: dto,
  });

  return updated;
}
```

**Database Schema:**
```prisma
model Entity {
  id              String  @id @default(uuid()) @db.Uuid
  // ... other fields
  createdByUserId String? @map("created_by_user_id") @db.Uuid

  createdByUser User? @relation("UserEntities", fields: [createdByUserId], references: [id], onDelete: SetNull)

  @@index([createdByUserId]) // ← For audit queries only
  @@map("entities")
}
```

**Access Control:** Enforce via RBAC permissions (`@Auth({ permissions: [...] })` decorator) on controller endpoints, NOT via ownership filtering in service layer.

---

### 3. Adding RBAC Permissions

**Step 1: Define permission constants**

File: `apps/api/src/common/constants/roles.constants.ts`

```typescript
export const PERMISSIONS = {
  // ... existing permissions
  FEATURE_READ: 'feature:read',
  FEATURE_WRITE: 'feature:write',
  FEATURE_DELETE: 'feature:delete',
} as const;
```

**Step 2: Seed permissions and role assignments**

File: `apps/api/prisma/seed.ts`

```typescript
// Create permissions
const featureRead = await prisma.permission.upsert({
  where: { name: 'feature:read' },
  update: {},
  create: { name: 'feature:read', description: 'Read features' },
});

const featureWrite = await prisma.permission.upsert({
  where: { name: 'feature:write' },
  update: {},
  create: { name: 'feature:write', description: 'Create/update features' },
});

const featureDelete = await prisma.permission.upsert({
  where: { name: 'feature:delete' },
  update: {},
  create: { name: 'feature:delete', description: 'Delete features' },
});

// Assign to roles
await prisma.rolePermission.upsert({
  where: { roleId_permissionId: { roleId: adminRole.id, permissionId: featureRead.id } },
  update: {},
  create: { roleId: adminRole.id, permissionId: featureRead.id },
});

await prisma.rolePermission.upsert({
  where: { roleId_permissionId: { roleId: contributorRole.id, permissionId: featureRead.id } },
  update: {},
  create: { roleId: contributorRole.id, permissionId: featureRead.id },
});

// Repeat for other permissions and roles
```

**Step 3: Apply to endpoints**

```typescript
@Get()
@Auth({ permissions: [PERMISSIONS.FEATURE_READ] })
async list() { /* ... */ }

@Post()
@Auth({ permissions: [PERMISSIONS.FEATURE_WRITE] })
async create() { /* ... */ }

@Delete(':id')
@Auth({ permissions: [PERMISSIONS.FEATURE_DELETE] })
async delete() { /* ... */ }
```

---

### 4. Encrypting Sensitive Fields

**Use Case:** Store API keys, passwords, tokens securely

**Pattern:**

```typescript
import { encrypt, decrypt, getEncryptionKey } from '../common/utils/encryption.util';

@Injectable()
export class FeatureService {
  private encryptionKey: Buffer;

  constructor(private readonly prisma: PrismaService) {
    this.encryptionKey = getEncryptionKey(); // Load from env
  }

  async create(dto: CreateDto, userId: string) {
    // Encrypt sensitive field
    let encryptedSecret: string | null = null;
    if (dto.secret) {
      encryptedSecret = encrypt(dto.secret, this.encryptionKey);
    }

    const entity = await this.prisma.entity.create({
      data: {
        ...dto,
        encryptedSecret, // Store encrypted
        createdByUserId: userId, // Track creator (for audit only)
      },
    });

    return this.mapEntity(entity); // Map to response (excludes encryptedSecret)
  }

  async useSecret(id: string, userId: string) {
    const entity = await this.getById(id, userId);

    // Decrypt when needed
    let secret: string | undefined;
    if (entity.encryptedSecret) {
      secret = decrypt(entity.encryptedSecret, this.encryptionKey);
    }

    // Use secret for API call, etc.
  }

  private mapEntity(entity: any) {
    return {
      id: entity.id,
      // ... other fields
      hasSecret: entity.encryptedSecret !== null, // Boolean flag
      // DO NOT include encryptedSecret or plaintext secret
    };
  }
}
```

**Database Schema:**
```prisma
model Entity {
  // ... other fields
  encryptedSecret String? @map("encrypted_secret")
}
```

**Environment:**
```bash
ENCRYPTION_KEY=<base64-encoded-32-byte-key>
```

---

### 5. Building a React Page with CRUD Hook

**Pattern: Page → Hook → API Service**

**Step 1: Create API service functions**

File: `apps/web/src/services/api.ts`

```typescript
export async function getEntities(params?: {
  page?: number;
  pageSize?: number;
}): Promise<EntitiesResponse> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
  const query = searchParams.toString();
  return api.get<EntitiesResponse>(`/entities${query ? `?${query}` : ''}`);
}

export async function createEntity(data: CreateEntityPayload): Promise<Entity> {
  return api.post<Entity>('/entities', data);
}

export async function updateEntity(id: string, data: UpdateEntityPayload): Promise<Entity> {
  return api.patch<Entity>(`/entities/${id}`, data);
}

export async function deleteEntity(id: string): Promise<void> {
  await api.delete<void>(`/entities/${id}`);
}
```

**Step 2: Create hook**

File: `apps/web/src/hooks/useEntities.ts`

```typescript
import { useState, useCallback } from 'react';
import type { Entity, EntitiesResponse } from '../types';
import { getEntities, createEntity, updateEntity, deleteEntity } from '../services/api';

export function useEntities() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEntities = useCallback(async (params?: { page?: number; pageSize?: number }) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getEntities(params);
      setEntities(response.items);
      setTotal(response.total);
      setPage(response.page);
      setPageSize(response.pageSize);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
      setEntities([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const create = useCallback(async (data: CreateEntityPayload) => {
    try {
      await createEntity(data);
      await fetchEntities({ page, pageSize }); // Refresh
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [fetchEntities, page, pageSize]);

  // Similar for update and delete...

  return {
    entities,
    total,
    page,
    pageSize,
    isLoading,
    error,
    fetchEntities,
    createEntity: create,
    updateEntity: update,
    deleteEntity: remove,
  };
}
```

**Step 3: Create page**

File: `apps/web/src/pages/EntitiesPage.tsx`

```typescript
import { useState, useEffect } from 'react';
import { Container, Box, Table, TablePagination, Button } from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { useEntities } from '../hooks/useEntities';
import { usePermissions } from '../hooks/usePermissions';

export default function EntitiesPage() {
  const { entities, total, page, pageSize, isLoading, fetchEntities } = useEntities();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('entities:write');

  useEffect(() => {
    fetchEntities({ page, pageSize });
  }, [page, pageSize, fetchEntities]);

  return (
    <Container>
      <Box>
        {canWrite && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => /* open dialog */}>
            Add Entity
          </Button>
        )}
      </Box>

      <Table>
        {/* Table content */}
      </Table>

      <TablePagination
        count={total}
        page={page - 1}
        onPageChange={(_, newPage) => fetchEntities({ page: newPage + 1, pageSize })}
        rowsPerPage={pageSize}
        onRowsPerPageChange={(e) => fetchEntities({ page: 1, pageSize: parseInt(e.target.value) })}
      />
    </Container>
  );
}
```

---

### 6. Implementing a Driver/Adapter Pattern

**Use Case:** Support multiple external services with a unified interface

**Pattern:**

1. **Define interface:**

```typescript
// drivers/driver.interface.ts
export interface ServiceDriver {
  execute(params: ServiceParams): Promise<ServiceResult>;
}

export interface ServiceParams {
  // Common parameters
}

export interface ServiceResult {
  success: boolean;
  data?: unknown;
  error?: string;
}
```

2. **Create factory:**

```typescript
// drivers/index.ts
import { ServiceDriver } from './driver.interface';
import { ProviderADriver } from './provider-a.driver';
import { ProviderBDriver } from './provider-b.driver';

export function getDriver(provider: string): ServiceDriver {
  switch (provider) {
    case 'provider-a':
      return new ProviderADriver();
    case 'provider-b':
      return new ProviderBDriver();
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}
```

3. **Implement drivers:**

```typescript
// drivers/provider-a.driver.ts
import { ServiceDriver, ServiceParams, ServiceResult } from './driver.interface';

export class ProviderADriver implements ServiceDriver {
  async execute(params: ServiceParams): Promise<ServiceResult> {
    try {
      // Provider-specific logic
      const result = await providerAApi.call(params);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
```

4. **Use in service:**

```typescript
@Injectable()
export class MyService {
  async executeWithProvider(provider: string, params: ServiceParams) {
    const driver = getDriver(provider);
    const result = await driver.execute(params);
    return result;
  }
}
```

---

### 7. Adding a Route and Sidebar Entry

**Step 1: Add route**

File: `apps/web/src/App.tsx`

```tsx
import FeaturePage from './pages/FeaturePage';

function App() {
  return (
    <Routes>
      {/* ... other routes */}
      <Route path="/feature" element={<FeaturePage />} />
    </Routes>
  );
}
```

**Step 2: Add sidebar entry**

File: `apps/web/src/components/navigation/Sidebar.tsx`

```tsx
import FeatureIcon from '@mui/icons-material/Feature';
import { RequirePermission } from '../common/RequirePermission';

<RequirePermission permission="feature:read">
  <ListItem button component={Link} to="/feature" selected={location.pathname === '/feature'}>
    <ListItemIcon>
      <FeatureIcon />
    </ListItemIcon>
    <ListItemText primary="Feature" />
  </ListItem>
</RequirePermission>
```

**Step 3: Update types**

File: `apps/web/src/types/index.ts`

```typescript
export interface Feature {
  id: string;
  name: string;
  // ... other fields
}

export interface FeaturesResponse {
  items: Feature[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
```

---

## File Inventory

### Backend Files (Created)

```
apps/api/
├── prisma/
│   ├── schema.prisma                          # DataConnection model + DatabaseType enum
│   └── migrations/
│       └── YYYYMMDDHHMMSS_add_data_connections/
│           └── migration.sql                  # SQL migration
├── src/
│   ├── common/
│   │   ├── constants/
│   │   │   └── roles.constants.ts             # PERMISSIONS.CONNECTIONS_* added
│   │   └── utils/
│   │       └── encryption.util.ts             # Encryption functions
│   │       └── encryption.util.spec.ts        # Encryption tests
│   └── connections/
│       ├── connections.module.ts              # NestJS module
│       ├── connections.controller.ts          # REST endpoints
│       ├── connections.service.ts             # Business logic + encryption
│       ├── dto/
│       │   ├── create-connection.dto.ts       # Create validation (Zod)
│       │   ├── update-connection.dto.ts       # Update validation (Zod)
│       │   ├── connection-query.dto.ts        # List query validation (Zod)
│       │   └── test-connection.dto.ts         # Test validation (Zod)
│       └── drivers/
│           ├── driver.interface.ts            # DatabaseDriver interface
│           ├── index.ts                       # getDriver factory
│           ├── postgresql.driver.ts           # PostgreSQL implementation
│           ├── mysql.driver.ts                # MySQL implementation
│           ├── sqlserver.driver.ts            # SQL Server implementation
│           ├── databricks.driver.ts           # Databricks implementation
│           └── snowflake.driver.ts            # Snowflake implementation
└── test/
    ├── connections.integration.spec.ts        # Integration tests
    └── fixtures/
        └── test-data.factory.ts               # createMockConnection helper (modified)
```

### Frontend Files (Created)

```
apps/web/
└── src/
    ├── components/
    │   └── connections/
    │       └── ConnectionDialog.tsx           # Create/edit dialog
    ├── hooks/
    │   └── useConnections.ts                  # State + API integration hook
    ├── pages/
    │   └── ConnectionsPage.tsx                # Main page
    ├── services/
    │   └── api.ts                             # API functions (modified)
    ├── types/
    │   └── index.ts                           # TypeScript types (modified)
    └── __tests__/
        └── pages/
            └── ConnectionsPage.test.tsx       # Frontend tests
```

### Configuration Files (Modified)

```
apps/api/
├── package.json                               # Added: pg, mysql2, mssql, @databricks/sql, snowflake-sdk
└── src/
    └── app.module.ts                          # Imported ConnectionsModule

apps/web/
└── src/
    ├── App.tsx                                # Added route: /connections
    └── components/
        └── navigation/
            └── Sidebar.tsx                    # Added sidebar entry
```

---

## Testing

### Backend Tests

#### Unit Tests: Encryption Utility

File: `apps/api/src/common/utils/encryption.util.spec.ts`

**Coverage:**
- Encrypt/decrypt round-trip
- Random IV (different ciphertexts for same plaintext)
- Special characters and Unicode support
- Tamper detection (auth tag validation)
- Wrong key rejection
- Invalid format handling
- Environment variable validation

**Run:**
```bash
cd apps/api && npm test -- encryption.util
```

---

#### Integration Tests: Connections API

File: `apps/api/test/connections.integration.spec.ts`

**Coverage:**

**GET /api/connections**
- ✅ 401 if not authenticated
- ✅ 403 for viewer (no permission)
- ✅ Empty list when no connections
- ✅ Paginated results
- ✅ Returns all connections (no ownership filtering)
- ✅ hasCredential in response, no password

**GET /api/connections/:id**
- ✅ 401 if not authenticated
- ✅ 403 for viewer
- ✅ 200 with connection data
- ✅ 404 for non-existent

**POST /api/connections**
- ✅ 401 if not authenticated
- ✅ 403 for viewer
- ✅ 201 with created connection
- ✅ Validation errors (400)
- ✅ Password not returned

**PATCH /api/connections/:id**
- ✅ 401 if not authenticated
- ✅ 403 for viewer
- ✅ 200 with updated connection
- ✅ Preserve credential when password omitted
- ✅ 404 for non-existent

**DELETE /api/connections/:id**
- ✅ 401 if not authenticated
- ✅ 403 for viewer
- ✅ 204 on success
- ✅ 404 for non-existent

**POST /api/connections/test**
- ✅ 401 if not authenticated
- ✅ 403 for viewer
- ✅ Test result returned

**POST /api/connections/:id/test**
- ✅ 401 if not authenticated
- ✅ 403 for viewer
- ✅ Test result returned
- ✅ Test results saved to DB
- ✅ 400 for invalid UUID
- ✅ 404 for non-existent

**Run:**
```bash
cd apps/api && npm test -- connections.integration
```

---

### Frontend Tests

File: `apps/web/src/__tests__/pages/ConnectionsPage.test.tsx`

**Coverage:**

**Page Layout**
- ✅ Renders page title
- ✅ Renders page description
- ✅ Shows loading state

**Connections Table**
- ✅ Renders table after loading
- ✅ Displays connection data correctly
- ✅ Shows database type chip with color
- ✅ Displays "Untested" status

**Empty State**
- ✅ Shows empty state when no connections
- ✅ Shows filtered empty state message

**Permissions**
- ✅ Shows "Add Connection" button with write permission

**Search and Filters**
- ✅ Renders search input
- ✅ Renders database type filter
- ✅ Allows typing in search box

**Actions**
- ✅ Shows test, edit, delete buttons
- ✅ Opens dialog on "Add Connection" click

**Error Handling**
- ✅ Displays error message when fetch fails

**Pagination**
- ✅ Renders pagination controls
- ✅ Shows correct rows per page options

**Connection Status**
- ✅ Displays "Connected" for successful test
- ✅ Displays "Failed" for failed test

**Uses MSW (Mock Service Worker)** to mock API responses.

**Run:**
```bash
cd apps/web && npm test -- ConnectionsPage
```

---

## Configuration

### Environment Variables

Required in `infra/compose/.env`:

```bash
# Encryption key for database credentials (REQUIRED)
# Generate with: openssl rand -base64 32
ENCRYPTION_KEY=<base64-encoded-32-byte-key>
```

**Example:**
```bash
ENCRYPTION_KEY=dGVzdC1lbmNyeXB0aW9uLWtleS0zMi1ieXRlcw==
```

**Key Requirements:**
- Exactly 32 bytes (256 bits)
- Base64-encoded or raw UTF-8
- Must be set before starting API server
- Same key required for all API instances (for decryption)

---

### NPM Packages

Added to `apps/api/package.json`:

```json
{
  "dependencies": {
    "@databricks/sql": "^1.12.0",
    "mssql": "^12.2.0",
    "mysql2": "^3.16.3",
    "pg": "^8.18.0",
    "snowflake-sdk": "^2.3.3"
  },
  "devDependencies": {
    "@types/mssql": "^9.1.9",
    "@types/pg": "^8.15.6"
  }
}
```

**Install:**
```bash
cd apps/api && npm install
```

---

### Database Migration

Run migration to create `data_connections` table:

```bash
cd apps/api && npm run prisma:migrate:dev
```

Or in production:

```bash
cd apps/api && npm run prisma:migrate
```

---

### Seed Permissions

The permissions are automatically seeded when running:

```bash
cd apps/api && npm run prisma:seed
```

This creates:
- `connections:read` → Admin, Contributor
- `connections:write` → Admin, Contributor
- `connections:delete` → Admin, Contributor
- `connections:test` → Admin, Contributor

---

## Summary

The Database Connections feature provides a production-ready, secure, and user-friendly way to manage database credentials. It demonstrates:

- **Clean architecture** with proper separation of concerns
- **Security best practices** with AES-256-GCM encryption
- **RBAC enforcement** at API and UI levels
- **Type safety** with TypeScript and Zod validation
- **Testability** with comprehensive unit and integration tests
- **Reusable patterns** that can be applied to other features

This specification serves as both documentation and a blueprint for building similar features in the codebase.
