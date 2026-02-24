# Cloud Storage Connections Feature Specification

## Table of Contents

1. [Feature Overview](#feature-overview)
2. [Architecture](#architecture)
3. [Database Schema](#database-schema)
4. [Connection Parameter Mapping](#connection-parameter-mapping)
5. [DuckDB Query Engine](#duckdb-query-engine)
6. [Discovery Interface Implementation](#discovery-interface-implementation)
7. [API Endpoints](#api-endpoints)
8. [Security](#security)
9. [RBAC Permissions](#rbac-permissions)
10. [Semantic Model Integration](#semantic-model-integration)
11. [Data Agent Integration](#data-agent-integration)
12. [Driver Architecture](#driver-architecture)
13. [Frontend Components](#frontend-components)
14. [File Inventory](#file-inventory)
15. [NPM Packages](#npm-packages)
16. [Testing](#testing)
17. [Configuration](#configuration)

---

## Feature Overview

The Cloud Storage Connections feature extends the existing Database Connections system with two new connection types that treat cloud object storage as queryable data sources. Parquet files stored in AWS S3 buckets or Azure Blob Storage containers are surfaced as database tables, and **DuckDB** serves as the in-process SQL query engine. This enables the existing Semantic Model agent and Data Agent to analyze data lakes without requiring a separate database server.

### Supported Storage Types

- **AWS S3** (`s3`) — Amazon Web Services Simple Storage Service, including S3-compatible endpoints
- **Azure Blob Storage** (`azure_blob`) — Microsoft Azure Blob Storage with Account Key or SAS Token authentication

### Core Capabilities

- **Create** cloud storage connections with encrypted credential storage
- **Read** connections with pagination, search, and type filtering
- **Update** connections (partial updates supported)
- **Delete** connections
- **Test** connections by listing buckets/containers (validates credentials without reading data)
- **Discover** buckets, containers, folder prefixes, Parquet files, and column schemas via DuckDB
- **Query** Parquet data with standard SQL using an ephemeral in-process DuckDB instance
- **Support Hive-style partitioned datasets** — folders of Parquet files are treated as a single table
- **Integrate** with the Semantic Model agent for AI-driven model generation
- **Integrate** with the Data Agent for natural language analytics over data lake tables

### Hierarchy Mapping

Cloud storage uses a four-level hierarchy that maps onto the existing discovery interface used by relational databases:

```
Traditional DB:  Database   → Schema       → Table           → Column
S3:              Bucket     → Folder Prefix → Parquet File   → Arrow Field
Azure Blob:      Container  → Folder Prefix → Parquet File   → Arrow Field
```

This mapping allows the discovery API, Semantic Model wizard, and Data Agent to work uniformly across all connection types without UI or agent changes.

### Partitioned Dataset Support

The feature supports two Parquet file layouts:

1. **Single file** — `s3://mybucket/sales/orders.parquet` maps to table `orders` in schema `sales`
2. **Partitioned folder** — `s3://mybucket/sales/orders/` containing `year=2024/month=01/*.parquet` maps to table `orders` in schema `sales`, read via DuckDB's `read_parquet('s3://mybucket/sales/orders/**/*.parquet', hive_partitioning=true)`

### Use Cases

1. **Data Analysts**: Query Parquet data lakes in S3 or Azure Blob using SQL without ETL pipelines
2. **Data Engineers**: Generate Semantic Models from existing Parquet-based data lakes
3. **Business Users**: Run natural language analytics over cloud-hosted datasets via the Data Agent
4. **Data Architects**: Discover and document data lake schemas with automated column profiling

---

## Architecture

The feature integrates a new execution layer (DuckDB) between the backend and cloud storage APIs. Listing operations (buckets, folders, files) use cloud SDK clients directly; query operations (column schemas, sample data, stats, SQL) open an ephemeral DuckDB session configured with the appropriate cloud extension.

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Frontend Layer                             │
│  React + Material UI + TypeScript                                   │
│                                                                     │
│  ConnectionsPage → useConnections hook → API client                 │
│  ConnectionDialog (type-specific fields for S3 / Azure Blob)        │
│  SemanticModelWizard (contextual labels per connection type)        │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTPS (Nginx)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          Backend Layer                              │
│  NestJS + Fastify + TypeScript                                      │
│                                                                     │
│  ConnectionsController (REST endpoints — unchanged)                 │
│         ↓                                                           │
│  ConnectionsService (business logic + encryption — unchanged)       │
│         ↓                                                           │
│  Driver Factory (getDriver / getDiscoveryDriver — extended)         │
│         ↓                            ↓                              │
│  S3Driver / AzureBlobDriver    DuckDBSession utility                │
│  (listing via cloud SDKs)      (ephemeral in-process DuckDB)        │
└──────┬───────────────────────────────┬───────────────────────────────┘
       │ AWS SDK / Azure SDK           │ DuckDB httpfs / azure extension
       ▼                               ▼
┌──────────────────┐        ┌─────────────────────────────────────────┐
│  Cloud Storage   │        │  Parquet Files (read-only)              │
│  AWS S3          │        │  s3://mybucket/schema/table.parquet     │
│  Azure Blob      │        │  az://mycontainer/schema/table.parquet  │
└──────────────────┘        └─────────────────────────────────────────┘
                                             │
┌─────────────────────────────────────────────────────────────────────┐
│                      Application Database Layer                     │
│  PostgreSQL                                                         │
│                                                                     │
│  data_connections table (encrypted credentials, extended enum)      │
│  audit_events table (audit trail)                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Layer Responsibilities

#### Frontend
- **Page**: `ConnectionsPage.tsx` — renders cloud storage types in existing table with new color-coded chips
- **Dialog**: `ConnectionDialog.tsx` — type-specific form fields for S3 and Azure Blob (region, bucket, container, auth method, endpoint URL)
- **Hook**: `useConnections.ts` — unchanged; cloud types surface as additional `DatabaseType` values
- **Types**: `types/index.ts` — `DatabaseType` union extended with `'s3'` and `'azure_blob'`
- **API Client**: `services/api.ts` — unchanged; same endpoint structure

#### Backend
- **Controller**: `connections.controller.ts` — unchanged; new types are transparently handled
- **Service**: `connections.service.ts` — unchanged; credential encryption/decryption is type-agnostic
- **DTOs**: `dto/*.dto.ts` — `dbType` Zod enum extended with `'s3'` and `'azure_blob'`
- **Drivers**: `drivers/s3.driver.ts`, `drivers/azure-blob.driver.ts` — new cloud drivers
- **Base Class**: `drivers/data-lake-base.driver.ts` — shared listing and DuckDB delegation logic
- **DuckDB Utility**: `drivers/duckdb-session.ts` — ephemeral session lifecycle management

#### Cloud Storage
- AWS S3: Listing via `@aws-sdk/client-s3` (`ListBucketsCommand`, `ListObjectsV2Command`)
- Azure Blob: Listing via `@azure/storage-blob` (`BlobServiceClient`, `ContainerClient`)
- Data access: DuckDB `httpfs` extension (S3) or `azure` extension (Azure Blob)

#### Application Database
- `data_connections` table — no new columns; `db_type` enum is extended at the Prisma and PostgreSQL levels
- `audit_events` table — unchanged; cloud storage operations are logged with the same pattern

---

## Database Schema

### DataConnection Model (Prisma)

No new columns are required. The existing schema accommodates cloud storage by extending the `DatabaseType` enum and using the existing `options` JSONB field for cloud-specific configuration.

Located in `apps/api/prisma/schema.prisma`:

```prisma
enum DatabaseType {
  postgresql
  mysql
  sqlserver
  databricks
  snowflake
  s3          // NEW: AWS S3 (and S3-compatible endpoints)
  azure_blob  // NEW: Azure Blob Storage
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
  options             Json?        // JSONB for type-specific config (see below)
  createdByUserId     String?      @map("created_by_user_id") @db.Uuid
  lastTestedAt        DateTime?    @map("last_tested_at") @db.Timestamptz
  lastTestResult      Boolean?     @map("last_test_result")
  lastTestMessage     String?      @map("last_test_message")
  createdAt           DateTime     @default(now()) @map("created_at") @db.Timestamptz
  updatedAt           DateTime     @updatedAt @map("updated_at") @db.Timestamptz

  createdByUser User? @relation("UserDataConnections", fields: [createdByUserId], references: [id], onDelete: SetNull)

  @@index([createdByUserId])
  @@index([dbType])
  @@map("data_connections")
}
```

A Prisma migration is required to add the two new enum values to the PostgreSQL `database_type` enum:

```sql
-- Migration: add_cloud_storage_connection_types
ALTER TYPE "database_type" ADD VALUE 's3';
ALTER TYPE "database_type" ADD VALUE 'azure_blob';
```

### Options Field (JSONB) — Cloud Types

The `options` JSONB field stores cloud-specific parameters that do not map to the existing scalar columns.

#### S3

```json
{
  "region": "us-east-1",
  "bucket": "my-data-lake",
  "pathPrefix": "prod/",
  "endpointUrl": "https://s3.internal.example.com"
}
```

| Key | Type | Required | Description |
|-----|------|----------|-------------|
| `region` | string | Yes | AWS region (e.g., `us-east-1`). Duplicate of `host` — stored in both for clarity. |
| `bucket` | string | No | Default bucket for discovery. If omitted, the user picks during wizard. |
| `pathPrefix` | string | No | Narrows listing to keys under this prefix (e.g., `prod/`). |
| `endpointUrl` | string | No | Custom S3-compatible endpoint for non-AWS S3-compatible services. |

#### Azure Blob

```json
{
  "containerName": "datalake",
  "pathPrefix": "prod/",
  "authMethod": "key"
}
```

| Key | Type | Required | Description |
|-----|------|----------|-------------|
| `containerName` | string | No | Default container for discovery. If omitted, user picks during wizard. |
| `pathPrefix` | string | No | Narrows listing to blobs under this prefix. |
| `authMethod` | `'key'` \| `'sas'` | No | Authentication method (default: `'key'`). `'sas'` stores the SAS token in `encryptedCredential`. |

### Credential Storage Convention

Cloud credentials are stored in the existing `encryptedCredential` column using the same AES-256-GCM encryption as other connection types:

| Type | `username` | `encryptedCredential` |
|------|------------|----------------------|
| `s3` | AWS Access Key ID | AWS Secret Access Key |
| `azure_blob` (key auth) | Storage Account Name | Account Key |
| `azure_blob` (SAS auth) | Storage Account Name | SAS Token string |

The `host` column stores the primary identifier for the storage endpoint:

| Type | `host` |
|------|--------|
| `s3` | AWS Region (e.g., `us-east-1`) |
| `azure_blob` | Account URL (e.g., `myaccount.blob.core.windows.net`) |

The `port` column is fixed at `443` (HTTPS) for both types. The `useSsl` column is always `true`.

---

## Connection Parameter Mapping

This section documents how each `DataConnection` field is used for cloud storage connections. This is the authoritative reference for driver implementations and DTO validation.

### S3 Field Mapping

| `DataConnection` Field | S3 Meaning | Notes |
|------------------------|-----------|-------|
| `dbType` | `'s3'` | Enum value |
| `name` | User-defined name | e.g., "Production Data Lake" |
| `description` | Optional description | |
| `host` | AWS Region | e.g., `us-east-1`. Also stored in `options.region`. |
| `port` | `443` (fixed) | Always HTTPS |
| `databaseName` | Not used | Bucket selected during discovery |
| `username` | AWS Access Key ID | e.g., `AKIA1234EXAMPLE` |
| `encryptedCredential` | AWS Secret Access Key | AES-256-GCM encrypted at rest |
| `useSsl` | `true` (always) | All S3 traffic is HTTPS |
| `options.region` | AWS Region | Required; mirrors `host` |
| `options.bucket` | Default bucket | Optional; narrows wizard default |
| `options.pathPrefix` | Key prefix filter | Optional; e.g., `prod/` |
| `options.endpointUrl` | Custom endpoint URL | Optional; enables S3-compatible services with custom endpoints |

**S3 Validation Rules (Zod):**

```typescript
const s3OptionsSchema = z.object({
  region: z.string().min(1).max(50),
  bucket: z.string().min(1).max(63).optional(),
  pathPrefix: z.string().max(1024).optional(),
  endpointUrl: z.string().url().optional(),
});
```

### Azure Blob Field Mapping

| `DataConnection` Field | Azure Blob Meaning | Notes |
|------------------------|-------------------|-------|
| `dbType` | `'azure_blob'` | Enum value |
| `name` | User-defined name | e.g., "Azure Data Lake" |
| `description` | Optional description | |
| `host` | Storage Account URL | e.g., `myaccount.blob.core.windows.net` |
| `port` | `443` (fixed) | Always HTTPS |
| `databaseName` | Not used | Container selected during discovery |
| `username` | Storage Account Name | e.g., `myaccount` |
| `encryptedCredential` | Account Key or SAS Token | AES-256-GCM encrypted at rest |
| `useSsl` | `true` (always) | All Azure Blob traffic is HTTPS |
| `options.containerName` | Default container | Optional; narrows wizard default |
| `options.pathPrefix` | Blob name prefix filter | Optional; e.g., `prod/` |
| `options.authMethod` | `'key'` or `'sas'` | Default `'key'` |

**Azure Blob Validation Rules (Zod):**

```typescript
const azureBlobOptionsSchema = z.object({
  containerName: z.string().min(3).max(63).optional(),
  pathPrefix: z.string().max(1024).optional(),
  authMethod: z.enum(['key', 'sas']).default('key'),
});
```

---

## DuckDB Query Engine

DuckDB is an in-process analytical SQL engine. It requires no external server and starts in milliseconds. Each query operation creates an ephemeral DuckDB instance, configures cloud credentials, registers Parquet files as temporary views, executes the SQL, and immediately closes the instance.

### Why DuckDB

- **Zero operational overhead**: No server to provision, monitor, or scale
- **Native Parquet support**: Reads `.parquet` files directly from S3 and Azure Blob via extensions
- **Full SQL dialect**: Standard `SELECT`, `GROUP BY`, `DESCRIBE`, aggregates — compatible with the Data Agent's SQL Builder
- **Hive partitioning**: Built-in support for `read_parquet('.../**/*.parquet', hive_partitioning=true)`
- **Columnar performance**: Efficiently reads only required columns from Parquet files (predicate pushdown)

### Session Lifecycle

```
1. Open DuckDB in-memory instance        db = new duckdb.Database(':memory:')
2. Install and load extension            INSTALL httpfs; LOAD httpfs;    (or azure)
3. Configure cloud credentials           SET s3_access_key_id = '...';
4. Register parquet file as view         CREATE VIEW <table> AS SELECT * FROM read_parquet('...')
5. Execute SQL query                     SELECT * FROM <table> LIMIT 50
6. Return results                        rows: unknown[][], columns: string[]
7. Close instance                        db.close()
```

Each `DuckDBSession` instance is single-use and closed in a `finally` block regardless of success or error.

### DuckDBSession Utility

File: `apps/api/src/connections/drivers/duckdb-session.ts`

```typescript
import * as duckdb from 'duckdb';

export interface DuckDBSessionOptions {
  storageType: 's3' | 'azure_blob';
  credentials: S3Credentials | AzureBlobCredentials;
}

export interface S3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  endpointUrl?: string;
}

export interface AzureBlobCredentials {
  accountName: string;
  accountKey?: string;      // used when authMethod = 'key'
  sasToken?: string;        // used when authMethod = 'sas'
  accountUrl: string;
}

export class DuckDBSession {
  private db: duckdb.Database;
  private conn: duckdb.Connection;

  private constructor(db: duckdb.Database, conn: duckdb.Connection) {
    this.db = db;
    this.conn = conn;
  }

  static async create(options: DuckDBSessionOptions): Promise<DuckDBSession> {
    const db = new duckdb.Database(':memory:');
    const conn = db.connect();
    const session = new DuckDBSession(db, conn);
    await session.configureCredentials(options);
    return session;
  }

  private async configureCredentials(options: DuckDBSessionOptions): Promise<void> {
    if (options.storageType === 's3') {
      const creds = options.credentials as S3Credentials;
      await this.exec(`INSTALL httpfs; LOAD httpfs;`);
      await this.exec(`SET s3_access_key_id='${creds.accessKeyId}';`);
      await this.exec(`SET s3_secret_access_key='${creds.secretAccessKey}';`);
      await this.exec(`SET s3_region='${creds.region}';`);
      if (creds.endpointUrl) {
        await this.exec(`SET s3_endpoint='${new URL(creds.endpointUrl).host}';`);
        await this.exec(`SET s3_use_ssl=true;`);
        await this.exec(`SET s3_url_style='path';`);
      }
    } else {
      const creds = options.credentials as AzureBlobCredentials;
      await this.exec(`INSTALL azure; LOAD azure;`);
      if (creds.sasToken) {
        await this.exec(
          `CREATE SECRET azure_secret (TYPE AZURE, PROVIDER SERVICE_PRINCIPAL,` +
          ` ACCOUNT_NAME '${creds.accountName}', SAS_TOKEN '${creds.sasToken}');`
        );
      } else {
        await this.exec(
          `CREATE SECRET azure_secret (TYPE AZURE, CONNECTION_STRING` +
          ` 'DefaultEndpointsProtocol=https;AccountName=${creds.accountName};` +
          `AccountKey=${creds.accountKey};EndpointSuffix=core.windows.net');`
        );
      }
    }
  }

  async exec(sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.conn.exec(sql, (err) => (err ? reject(err) : resolve()));
    });
  }

  async query(sql: string): Promise<{ columns: string[]; rows: unknown[][] }> {
    return new Promise((resolve, reject) => {
      this.conn.all(sql, (err, rows) => {
        if (err) return reject(err);
        const columns = rows.length > 0 ? Object.keys(rows[0] as object) : [];
        const data = rows.map((r) => columns.map((c) => (r as Record<string, unknown>)[c]));
        resolve({ columns, data });
      });
    });
  }

  async registerView(viewName: string, parquetUri: string, hive: boolean): Promise<void> {
    const readExpr = hive
      ? `read_parquet('${parquetUri}', hive_partitioning=true)`
      : `read_parquet('${parquetUri}')`;
    await this.exec(`CREATE VIEW "${viewName}" AS SELECT * FROM ${readExpr};`);
  }

  close(): void {
    try {
      this.db.close();
    } catch {
      // Ignore cleanup errors
    }
  }
}
```

### Extension Setup

| Storage Type | DuckDB Extension | Install Statement |
|-------------|------------------|-------------------|
| S3 | `httpfs` | `INSTALL httpfs; LOAD httpfs;` |
| Azure Blob | `azure` | `INSTALL azure; LOAD azure;` |

DuckDB installs extensions from its official extension repository the first time they are requested. In a Docker environment, extensions should be pre-installed in the image to avoid network dependency at runtime (see [Configuration](#configuration)).

### Write Protection

All SQL executed through `DuckDBSession` is read-only by construction:

1. `registerView` creates temporary read-only views over Parquet files
2. `executeReadOnlyQuery` in the driver validates the SQL statement before execution:

```typescript
private validateReadOnly(sql: string): void {
  const normalized = sql.trim().toLowerCase();
  const writeKeywords = ['insert', 'update', 'delete', 'drop', 'create', 'alter', 'truncate', 'copy'];
  for (const kw of writeKeywords) {
    if (normalized.startsWith(kw) || normalized.includes(` ${kw} `)) {
      throw new BadRequestException(`Write operations are not permitted: ${kw}`);
    }
  }
}
```

### Type Mapping

DuckDB reports column types using its own type system. The following mapping is used when constructing `ColumnInfo` objects for the discovery API:

| DuckDB Type | `ColumnInfo.dataType` | Notes |
|-------------|----------------------|-------|
| `BOOLEAN` | `boolean` | |
| `TINYINT`, `SMALLINT`, `INTEGER`, `BIGINT`, `HUGEINT` | `integer` | |
| `FLOAT`, `DOUBLE` | `float` | |
| `DECIMAL(p,s)` | `decimal` | Precision/scale extracted |
| `VARCHAR`, `TEXT`, `STRING` | `varchar` | |
| `DATE` | `date` | |
| `TIMESTAMP`, `TIMESTAMP WITH TIME ZONE` | `timestamp` | |
| `BLOB`, `BYTES` | `binary` | |
| `LIST`, `STRUCT`, `MAP` | `json` | Complex types serialized as JSON |
| Anything else | `unknown` | Passes through as-is |

---

## Discovery Interface Implementation

Cloud storage drivers implement the full `DiscoveryDriver` interface defined in `apps/api/src/connections/drivers/driver.interface.ts`. This allows the existing `DiscoveryService`, Semantic Model agent, and Data Agent to use cloud storage connections without any interface changes.

### Method-by-Method Mapping

#### `listDatabases(params)` → List Buckets / Containers

Returns the top-level storage units.

**S3:**
```typescript
// Uses: ListBucketsCommand from @aws-sdk/client-s3
// If options.bucket is set, returns only that bucket (fast path)
// Otherwise returns all buckets accessible to the credentials
async listDatabases(params: ConnectionParams): Promise<DatabaseInfo[]> {
  const client = this.buildS3Client(params);
  const response = await client.send(new ListBucketsCommand({}));
  return (response.Buckets ?? []).map((b) => ({ name: b.Name! }));
}
```

**Azure Blob:**
```typescript
// Uses: BlobServiceClient.listContainers()
async listDatabases(params: ConnectionParams): Promise<DatabaseInfo[]> {
  const client = this.buildBlobServiceClient(params);
  const containers: DatabaseInfo[] = [];
  for await (const container of client.listContainers()) {
    containers.push({ name: container.name });
  }
  return containers;
}
```

---

#### `listSchemas(params, bucket)` → List Top-Level Folder Prefixes

Returns the set of unique top-level path segments under the bucket or container. These become the "schemas" in the hierarchy.

```typescript
// Lists objects with delimiter='/' to get common prefixes (virtual folders)
// Returns each prefix with its trailing slash stripped as a SchemaInfo
// Example: prefix 'sales/' → SchemaInfo { name: 'sales', database: 'mybucket' }
async listSchemas(params: ConnectionParams, database: string): Promise<SchemaInfo[]> {
  // For S3: ListObjectsV2Command with Prefix=options.pathPrefix and Delimiter='/'
  // For Azure: ContainerClient.listBlobsByHierarchy('/', { prefix: options.pathPrefix })
  // Returns each CommonPrefix / BlobPrefix as a SchemaInfo
}
```

If `options.pathPrefix` is set, it is prepended to all listing calls to narrow the scope.

---

#### `listTables(params, bucket, schema)` → List Parquet Files and Partitioned Folders

Returns discoverable tables within a schema (folder prefix). A table is either:

1. **Single Parquet file**: `s3://mybucket/sales/orders.parquet` → `TableInfo { name: 'orders', type: 'TABLE' }`
2. **Partitioned folder**: `s3://mybucket/sales/events/year=2024/part-0.parquet` → `TableInfo { name: 'events', type: 'TABLE' }` (the `events/` folder appears as a common prefix at the schema level)

Detection logic:
- List all keys under `{bucket}/{schema}/` with `Delimiter='/'`
- **CommonPrefixes** (sub-folders) are partitioned dataset candidates — include if they contain at least one `.parquet` file at any depth
- **Objects** ending in `.parquet` directly under the schema prefix are single-file tables
- Objects not ending in `.parquet` are ignored

```typescript
async listTables(
  params: ConnectionParams,
  database: string,
  schema: string,
): Promise<TableInfo[]> {
  // Lists objects under {bucket}/{schema}/ with Delimiter='/'
  // Folders → potential partitioned tables (verified by checking for .parquet content)
  // .parquet files → single-file tables
  // Returns TableInfo[] with name derived from filename (without .parquet) or folder name
}
```

---

#### `listColumns(params, bucket, schema, table)` → DuckDB DESCRIBE on Parquet

Opens a DuckDB session, registers the Parquet URI as a view, and runs `DESCRIBE <view>` to retrieve column metadata.

```typescript
async listColumns(
  params: ConnectionParams,
  database: string,
  schema: string,
  table: string,
): Promise<ColumnInfo[]> {
  const uri = this.buildParquetUri(params, database, schema, table);
  const isPartitioned = await this.isPartitionedDataset(params, database, schema, table);
  const session = await DuckDBSession.create(this.buildSessionOptions(params));
  try {
    await session.registerView('__describe_target', uri, isPartitioned);
    const { columns, data } = await session.query('DESCRIBE __describe_target');
    return data.map((row) => this.mapDuckDBColumnToColumnInfo(row, columns));
  } finally {
    session.close();
  }
}
```

`DESCRIBE` returns: `column_name`, `column_type`, `null`, `key`, `default`, `extra`. Relevant fields are mapped to `ColumnInfo`:

```typescript
private mapDuckDBColumnToColumnInfo(row: unknown[], columns: string[]): ColumnInfo {
  const get = (col: string) => row[columns.indexOf(col)];
  const nativeType = String(get('column_type'));
  return {
    name: String(get('column_name')),
    dataType: this.mapDuckDBType(nativeType),
    nativeType,
    isNullable: true,   // Parquet columns are always nullable from schema perspective
    isPrimaryKey: false, // Parquet has no primary keys
    comment: undefined,
  };
}
```

---

#### `listForeignKeys(params, bucket, schema)` → Always Returns Empty

Parquet files have no foreign key constraints. The method returns an empty array.

```typescript
async listForeignKeys(
  params: ConnectionParams,
  database: string,
  schema: string,
): Promise<ForeignKeyInfo[]> {
  return []; // Parquet has no relational constraints
}
```

This means the Semantic Model agent will not attempt FK-based relationship discovery. Heuristic and value-overlap relationship discovery still applies.

---

#### `getSampleData(params, bucket, schema, table, limit)` → DuckDB SELECT LIMIT N

```typescript
async getSampleData(
  params: ConnectionParams,
  database: string,
  schema: string,
  table: string,
  limit = 10,
): Promise<SampleDataResult> {
  const uri = this.buildParquetUri(params, database, schema, table);
  const isPartitioned = await this.isPartitionedDataset(params, database, schema, table);
  const session = await DuckDBSession.create(this.buildSessionOptions(params));
  try {
    await session.registerView(table, uri, isPartitioned);
    const { columns, data } = await session.query(
      `SELECT * FROM "${table}" LIMIT ${limit}`
    );
    return { columns, rows: data };
  } finally {
    session.close();
  }
}
```

---

#### `getColumnStats(params, bucket, schema, table, column)` → DuckDB Aggregates

```typescript
async getColumnStats(
  params: ConnectionParams,
  database: string,
  schema: string,
  table: string,
  column: string,
): Promise<ColumnStatsResult> {
  const uri = this.buildParquetUri(params, database, schema, table);
  const isPartitioned = await this.isPartitionedDataset(params, database, schema, table);
  const session = await DuckDBSession.create(this.buildSessionOptions(params));
  try {
    await session.registerView(table, uri, isPartitioned);
    const sql = `
      SELECT
        COUNT(DISTINCT "${column}") AS distinct_count,
        COUNT(*) FILTER (WHERE "${column}" IS NULL) AS null_count,
        COUNT(*) AS total_count,
        MIN("${column}") AS min_val,
        MAX("${column}") AS max_val
      FROM "${table}"
    `;
    const { data } = await session.query(sql);
    const row = data[0] as unknown[];
    const sampleSql = `SELECT DISTINCT "${column}" FROM "${table}" LIMIT 10`;
    const { data: sampleData } = await session.query(sampleSql);
    return {
      distinctCount: Number(row[0]),
      nullCount: Number(row[1]),
      totalCount: Number(row[2]),
      min: row[3],
      max: row[4],
      sampleValues: sampleData.map((r) => r[0]),
    };
  } finally {
    session.close();
  }
}
```

---

#### `executeReadOnlyQuery(params, sql, maxRows)` → DuckDB SQL Execution

Used by the Data Agent to execute SQL queries against Parquet data. The driver resolves table references in the SQL to Parquet URIs, registers them as views, and executes the query.

```typescript
async executeReadOnlyQuery(
  params: ConnectionParams,
  sql: string,
  maxRows = 1000,
): Promise<QueryResult> {
  this.validateReadOnly(sql);
  const tables = this.extractTableReferences(sql); // Parse table names from SQL
  const session = await DuckDBSession.create(this.buildSessionOptions(params));
  try {
    for (const { schema, table } of tables) {
      const uri = this.buildParquetUri(params, /* bucket from params */ '', schema, table);
      const isPartitioned = await this.isPartitionedDataset(params, '', schema, table);
      await session.registerView(table, uri, isPartitioned);
    }
    const wrappedSql = `SELECT * FROM (${sql}) __result LIMIT ${maxRows}`;
    const { columns, data } = await session.query(wrappedSql);
    return { columns, rows: data, rowCount: data.length };
  } finally {
    session.close();
  }
}
```

**Table Name Resolution:**

The Data Agent generates SQL using the table names discovered during the Semantic Model build phase (e.g., `orders`, `events`). The driver resolves these to Parquet URIs using the convention:

```
s3://{bucket}/{schema}/{table}.parquet          (single file)
s3://{bucket}/{schema}/{table}/**/*.parquet     (partitioned folder)
az://{container}/{schema}/{table}.parquet       (Azure, single file)
az://{container}/{schema}/{table}/**/*.parquet  (Azure, partitioned folder)
```

The `bucket`/`container` is stored in the `database` parameter passed by the `DiscoveryService`.

---

#### `testConnection(params)` → List Buckets/Containers

The connection test validates credentials by performing a lightweight listing operation. It does not read any Parquet data.

```typescript
async testConnection(params: ConnectionParams): Promise<ConnectionTestResult> {
  const start = Date.now();
  try {
    // S3: send ListBucketsCommand, expect 200
    // Azure: create BlobServiceClient, call listContainers().next() (one item)
    await this.validateCredentials(params);
    const latencyMs = Date.now() - start;
    return { success: true, message: 'Connection successful', latencyMs };
  } catch (error) {
    const latencyMs = Date.now() - start;
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, message, latencyMs };
  }
}
```

---

## API Endpoints

Cloud storage connections use the same REST endpoints as all other connection types. No new endpoints are required. The sections below highlight cloud-specific request/response examples.

All endpoints require authentication. Base path: `/api/connections`

### Create S3 Connection

```http
POST /api/connections
```

**Permission:** `connections:write`

**Request Body:**
```json
{
  "name": "Production S3 Data Lake",
  "description": "Parquet files in the prod data lake bucket",
  "dbType": "s3",
  "host": "us-east-1",
  "port": 443,
  "username": "AKIA1234EXAMPLE",
  "password": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  "useSsl": true,
  "options": {
    "region": "us-east-1",
    "bucket": "my-data-lake",
    "pathPrefix": "prod/"
  }
}
```

**Response (201):**
```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Production S3 Data Lake",
    "dbType": "s3",
    "host": "us-east-1",
    "port": 443,
    "username": "AKIA1234EXAMPLE",
    "hasCredential": true,
    "useSsl": true,
    "options": {
      "region": "us-east-1",
      "bucket": "my-data-lake",
      "pathPrefix": "prod/"
    },
    "lastTestedAt": null,
    "lastTestResult": null,
    "lastTestMessage": null,
    "createdAt": "2026-02-21T09:00:00Z",
    "updatedAt": "2026-02-21T09:00:00Z"
  }
}
```

---

### Create Azure Blob Connection

```http
POST /api/connections
```

**Request Body (Account Key auth):**
```json
{
  "name": "Azure Analytics Lake",
  "dbType": "azure_blob",
  "host": "myaccount.blob.core.windows.net",
  "port": 443,
  "username": "myaccount",
  "password": "base64encodedAccountKey==",
  "useSsl": true,
  "options": {
    "containerName": "datalake",
    "pathPrefix": "prod/",
    "authMethod": "key"
  }
}
```

**Request Body (SAS Token auth):**
```json
{
  "name": "Azure Analytics Lake (SAS)",
  "dbType": "azure_blob",
  "host": "myaccount.blob.core.windows.net",
  "port": 443,
  "username": "myaccount",
  "password": "sv=2024-01-01&ss=b&srt=sco&sp=rl&...",
  "useSsl": true,
  "options": {
    "containerName": "datalake",
    "authMethod": "sas"
  }
}
```

---

### Test Connection

```http
POST /api/connections/test
POST /api/connections/:id/test
```

**Response (201):**
```json
{
  "data": {
    "success": true,
    "message": "Connection successful",
    "latencyMs": 312
  }
}
```

On failure (invalid credentials):
```json
{
  "data": {
    "success": false,
    "message": "The AWS Access Key Id you provided does not exist in our records.",
    "latencyMs": 287
  }
}
```

---

### Discovery Endpoints

Cloud storage connections are fully supported by the existing discovery endpoints with no changes:

```http
GET /api/connections/:id/databases                                          # List buckets/containers
GET /api/connections/:id/databases/:db/schemas                              # List folder prefixes
GET /api/connections/:id/databases/:db/schemas/:schema/tables               # List Parquet files/folders
GET /api/connections/:id/databases/:db/schemas/:schema/tables/:table/columns # DuckDB DESCRIBE
```

**Example — List Buckets (S3):**
```http
GET /api/connections/550e8400-e29b-41d4-a716-446655440000/databases
```
```json
{
  "data": [
    { "name": "my-data-lake" },
    { "name": "archive-bucket" }
  ]
}
```

**Example — List Parquet Tables:**
```http
GET /api/connections/550e8400.../databases/my-data-lake/schemas/sales/tables
```
```json
{
  "data": [
    { "name": "orders", "schema": "sales", "database": "my-data-lake", "type": "TABLE" },
    { "name": "customers", "schema": "sales", "database": "my-data-lake", "type": "TABLE" }
  ]
}
```

**Example — List Columns (via DuckDB DESCRIBE):**
```http
GET /api/connections/550e8400.../databases/my-data-lake/schemas/sales/tables/orders/columns
```
```json
{
  "data": [
    { "name": "order_id", "dataType": "integer", "nativeType": "INTEGER", "isNullable": true, "isPrimaryKey": false },
    { "name": "customer_id", "dataType": "integer", "nativeType": "BIGINT", "isNullable": true, "isPrimaryKey": false },
    { "name": "order_date", "dataType": "date", "nativeType": "DATE", "isNullable": true, "isPrimaryKey": false },
    { "name": "amount", "dataType": "decimal", "nativeType": "DECIMAL(18,2)", "isNullable": true, "isPrimaryKey": false }
  ]
}
```

---

## Security

### Credential Encryption at Rest

All cloud credentials (AWS Secret Access Key, Azure Account Key, SAS Token) are encrypted using **AES-256-GCM** before storage, identical to relational database passwords. The same `ENCRYPTION_KEY` environment variable and `encryption.util.ts` functions are used. No new encryption infrastructure is required.

```typescript
// During create / update
let encryptedCredential: string | null = null;
if (dto.password) {
  encryptedCredential = encrypt(dto.password, this.encryptionKey);
}

// During test / discovery
const credential = connection.encryptedCredential
  ? decrypt(connection.encryptedCredential, this.encryptionKey)
  : undefined;
```

### Credentials Never in API Responses

Cloud credentials follow the same response-mapping convention as relational passwords. The API returns a `hasCredential: boolean` flag. The `encryptedCredential` column is excluded from all mapped responses.

### Read-Only Query Enforcement

DuckDB sessions used for `executeReadOnlyQuery` enforce read-only access at two levels:

1. **SQL validation**: The driver rejects any SQL statement beginning with or containing DML/DDL keywords (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `CREATE`, `ALTER`, `TRUNCATE`, `COPY`)
2. **View-only architecture**: Table references are pre-registered as `CREATE VIEW ... AS SELECT * FROM read_parquet(...)`. The underlying Parquet files on cloud storage are accessed read-only by the DuckDB `httpfs` / `azure` extensions — no write operations are possible against Parquet files via these extensions

### Transport Security

- All S3 API calls use HTTPS (AWS SDK default; enforced with `SET s3_use_ssl=true` in DuckDB)
- All Azure Blob API calls use HTTPS (`DefaultEndpointsProtocol=https` in connection strings)
- The `useSsl` field is always `true` for cloud storage connections and is enforced by the drivers
- Nginx terminates TLS for all API traffic from the frontend

### Credentials Not Logged

The `DuckDBSession` credential configuration code must never log the credential values. The logger should record only connection metadata (type, account name, region) — never keys, tokens, or secrets.

```typescript
// Correct
this.logger.log(`Opening DuckDB session for s3, region=${creds.region}`);

// NEVER do this
this.logger.log(`Using secret key: ${creds.secretAccessKey}`); // ← Forbidden
```

---

## RBAC Permissions

Cloud storage connections reuse the existing connection permissions. No new permissions are required.

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

This is identical to the permission matrix for relational database connections. Viewers have no access to any connection type (enterprise data security requirement).

---

## Semantic Model Integration

The Semantic Model agent works with cloud storage connections through the existing `DiscoveryService` interface. The agent calls the same service methods regardless of the underlying connection type.

### Full Flow

```
1. User opens "New Semantic Model" wizard
2. User selects an S3 or Azure Blob connection
3. Step 1 - Select Storage:    GET /api/connections/:id/databases
                                → Returns buckets / containers
                                → UI label: "Select Bucket" (S3) or "Select Container" (Azure)
4. Step 2 - Select Schema:     GET /api/connections/:id/databases/:db/schemas
                                → Returns folder prefixes
                                → UI label: "Select Folder"
5. Step 3 - Select Tables:     GET /api/connections/:id/databases/:db/schemas/:schema/tables
                                → Returns Parquet files and partitioned folders
                                → UI label: "Select Parquet Files"
6. Step 4 - Generate:          POST /api/semantic-models/runs (starts agent)
7. Agent - Per-table loop:
   a. listColumns → DuckDB DESCRIBE on Parquet → ColumnInfo[]
   b. listForeignKeys → returns [] (no FKs in Parquet)
   c. getSampleData → DuckDB SELECT LIMIT 10
   d. getColumnStats → DuckDB aggregates per column
   e. LLM generates OSI table spec from column metadata + sample data + stats
8. Agent - Relationship discovery:
   a. No FK candidates from step 7b (empty)
   b. Heuristic naming analysis over column names (unchanged)
   c. Value-overlap validation via getColumnValueOverlap → DuckDB cross-table query
9. Agent - Assemble, validate, persist OSI model
```

### Discovery Data Flow

The same data structures flow into the LLM prompt for cloud storage as for relational databases:

```typescript
// Same ColumnInfo interface — DuckDB types mapped to standard dataType values
{
  name: 'order_id',
  dataType: 'integer',   // mapped from DuckDB INTEGER
  nativeType: 'INTEGER',
  isNullable: true,
  isPrimaryKey: false,
}

// SampleDataResult — identical format
{
  columns: ['order_id', 'customer_id', 'order_date', 'amount'],
  rows: [[1001, 42, '2024-01-15', 199.99], ...]
}
```

### Source Field Convention

The OSI model `source` field on each dataset uses the Parquet URI format to precisely identify the data location:

```yaml
# Single-file Parquet table
datasets:
  - name: orders
    source: "s3://my-data-lake/sales/orders.parquet"

# Partitioned Parquet dataset
datasets:
  - name: events
    source: "s3://my-data-lake/analytics/events/**/*.parquet"

# Azure Blob
datasets:
  - name: products
    source: "az://datalake/catalog/products.parquet"
```

This URI is stored in the OSI model JSON and appears in the Neo4j Dataset node's `yaml` property, making it available to the Data Agent for table name resolution.

### What Works Unchanged

- LLM prompts: The table-generation prompts are column-metadata-driven and are cloud-type agnostic
- Relationship generation: Heuristic and value-overlap discovery work via DuckDB queries
- OSI model assembly and validation: Identical
- YAML export: Identical
- Run tracking and SSE streaming: Identical
- Ontology creation from semantic model: Identical (uses OSI model JSON, not raw DB schema)

### What is Different

- **No FK constraints**: `listForeignKeys` returns `[]`; the relationship generator receives no FK candidates and relies entirely on heuristics and value-overlap analysis
- **Column nullability**: All Parquet columns are reported as nullable (`isNullable: true`) since Parquet's schema does not enforce NOT NULL constraints in the same way relational databases do
- **No row count estimates**: Parquet files do not expose row count estimates without a full scan; `TableInfo.rowCountEstimate` is `undefined` for cloud storage tables
- **DuckDB latency**: Each `getSampleData` and `getColumnStats` call opens a DuckDB session and makes an HTTP(S) call to cloud storage. For large Parquet files, column stats may take several seconds per column — the agent's per-table timeout applies

---

## Data Agent Integration

The Data Agent executes user queries against cloud storage connections using the existing `executeReadOnlyQuery` driver method through the `DiscoveryService`. The primary change is in the SQL Builder phase, which must generate DuckDB-compatible SQL instead of dialect-specific SQL.

### Full Query Execution Flow

```
1. User sends natural language question in chat for an ontology backed by an S3 connection
2. Planner: Decomposes question into sub-tasks with strategy='sql'
3. Navigator: Uses Neo4j ontology tools to find relevant datasets
   - get_dataset_details → returns OSI YAML including source='s3://bucket/schema/table.parquet'
   - get_relationships → finds join paths
4. SQL Builder: Generates DuckDB SQL for each sub-task
   - Receives dialect hint: 'duckdb'
   - Receives relevant dataset YAMLs (column names, types)
   - Uses plain table names (e.g., orders) — driver resolves to Parquet URI
5. Executor: Calls DiscoveryService.executeReadOnlyQuery(connectionId, sql)
   - DiscoveryService → getDiscoveryDriver('s3') → S3Driver
   - S3Driver.executeReadOnlyQuery:
     a. Parses table names from SQL
     b. Resolves each table to Parquet URI via buildParquetUri()
     c. Opens DuckDB session, registers views
     d. Executes SQL, returns QueryResult
6. Verifier: Checks results for grain issues, join explosions, NULLs
7. Explainer: Generates natural language response with data lineage
```

### SQL Builder Dialect Mapping

The SQL Builder receives a `sqlDialect` hint in its prompt. This hint is derived from the connection's `dbType`:

```typescript
// apps/api/src/data-agent/agent/nodes/sql-builder.node.ts

function getSqlDialect(dbType: string): string {
  switch (dbType) {
    case 's3':
    case 'azure_blob':
      return 'duckdb';
    case 'postgresql':
      return 'postgresql';
    case 'mysql':
      return 'mysql';
    case 'sqlserver':
      return 'tsql';
    case 'databricks':
      return 'spark_sql';
    case 'snowflake':
      return 'snowflake';
    default:
      return 'sql';
  }
}
```

### DuckDB Dialect Hints for SQL Builder

The SQL Builder prompt includes dialect-specific guidance when `sqlDialect === 'duckdb'`:

```
DIALECT: DuckDB SQL

DuckDB-specific guidance:
- Use standard ANSI SQL SELECT, FROM, WHERE, GROUP BY, HAVING, ORDER BY
- Date functions: DATE_TRUNC('month', col), EXTRACT(year FROM col), col::DATE
- String functions: REGEXP_MATCHES(col, pattern), SPLIT_PART(col, delimiter, n)
- Array/struct access: col[1], col.field_name
- Window functions: standard ANSI syntax supported
- Lateral joins: CROSS JOIN LATERAL or UNNEST() for array expansion
- Avoid: stored procedures, temporary tables (use CTEs instead), database-specific types

IMPORTANT: Use the plain table name (e.g., orders) in all SQL. Do NOT use bucket names,
container names, or file paths in SQL. The query engine resolves table names to Parquet URIs
automatically using the ontology's source field mapping.
```

### Table Name Resolution Detail

The `executeReadOnlyQuery` driver method resolves table names from the SQL query to Parquet URIs. The resolution uses the connection's default bucket/container from `options`, the schema discovered during ontology creation, and the table name:

```typescript
// The Data Agent passes SQL like:
//   SELECT o.order_id, c.name FROM orders o JOIN customers c ON o.customer_id = c.id

// S3Driver extracts: ['orders', 'customers']
// For each table, it queries its Parquet URI from the ontology source field
// Or derives it from the default bucket + schema convention:
//   orders → s3://my-data-lake/sales/orders.parquet   (single file found)
//   customers → s3://my-data-lake/sales/customers.parquet
// Registers both as DuckDB views before executing the JOIN
```

For production robustness, the Data Agent passes `relevantDatasets[].yaml` to the Executor, which includes the `source` field. The Executor extracts the Parquet URI from `source` and passes it to the driver, bypassing the need for the driver to re-discover URIs at query time.

### What Works Unchanged

- Navigator phase: Ontology tool calls use Neo4j (unaffected by storage type)
- Verifier phase: Receives SQL query result and performs Python-based checks (unaffected)
- Explainer phase: Generates response from verified results (unaffected)
- Clarifying questions: Pre-query flow is storage-type agnostic
- User preferences/memory: Stored in PostgreSQL (unaffected)
- SSE streaming of phase events: Unaffected
- PhaseIndicator and ToolCallAccordion UI components: Unaffected

### What is Different

- **SQL dialect**: SQL Builder receives `sqlDialect='duckdb'` for cloud storage connections
- **No stored procedures**: DuckDB does not support stored procedures; the SQL Builder must use CTEs
- **Row limit**: `executeReadOnlyQuery` wraps the user's SQL in a `SELECT * FROM (...) LIMIT N` outer query to prevent unbounded Parquet scans
- **Latency**: Cloud storage queries have higher latency than local relational databases due to HTTP(S) calls per Parquet file scan. DuckDB column predicate pushdown mitigates this for `WHERE` clauses on partition columns

---

## Driver Architecture

### Class Hierarchy

```
DatabaseDriver (interface)
└── DiscoveryDriver (interface extends DatabaseDriver)
    └── DataLakeBaseDriver (abstract class)
        ├── S3Driver
        └── AzureBlobDriver
```

### DataLakeBaseDriver

File: `apps/api/src/connections/drivers/data-lake-base.driver.ts`

Implements the shared logic used by both cloud storage drivers:

- `listTables`: Shared algorithm for detecting single-file vs. partitioned Parquet datasets
- `listColumns`: DuckDB DESCRIBE delegation (calls `buildParquetUri` + `buildSessionOptions` from subclass)
- `getSampleData`: DuckDB SELECT LIMIT N (same pattern)
- `getColumnStats`: DuckDB aggregates (same pattern)
- `getColumnValueOverlap`: Cross-table DuckDB query for relationship discovery
- `executeReadOnlyQuery`: SQL validation + view registration + execution
- `validateReadOnly`: SQL write-operation guard
- `mapDuckDBType`: DuckDB type → normalized `ColumnInfo.dataType` mapping
- `buildParquetUri`: Abstract — subclass constructs the correct `s3://` or `az://` URI
- `buildSessionOptions`: Abstract — subclass provides `DuckDBSessionOptions` with credentials
- `isPartitionedDataset`: Checks if a path prefix contains sub-folders (partitioned) vs. a direct `.parquet` file

```typescript
// apps/api/src/connections/drivers/data-lake-base.driver.ts

import { BadRequestException } from '@nestjs/common';
import {
  ConnectionParams, ConnectionTestResult, DiscoveryDriver,
  DatabaseInfo, SchemaInfo, TableInfo, ColumnInfo, ForeignKeyInfo,
  SampleDataResult, ColumnStatsResult, ColumnValueOverlapResult, QueryResult,
} from './driver.interface';
import { DuckDBSession, DuckDBSessionOptions } from './duckdb-session';

export abstract class DataLakeBaseDriver implements DiscoveryDriver {
  abstract testConnection(params: ConnectionParams): Promise<ConnectionTestResult>;
  abstract listDatabases(params: ConnectionParams): Promise<DatabaseInfo[]>;
  abstract listSchemas(params: ConnectionParams, database: string): Promise<SchemaInfo[]>;
  abstract listTables(params: ConnectionParams, database: string, schema: string): Promise<TableInfo[]>;
  protected abstract buildParquetUri(params: ConnectionParams, database: string, schema: string, table: string): string;
  protected abstract buildSessionOptions(params: ConnectionParams): DuckDBSessionOptions;
  protected abstract isPartitionedDataset(params: ConnectionParams, database: string, schema: string, table: string): Promise<boolean>;

  async listForeignKeys(
    _params: ConnectionParams,
    _database: string,
    _schema: string,
  ): Promise<ForeignKeyInfo[]> {
    return [];
  }

  async listColumns(
    params: ConnectionParams,
    database: string,
    schema: string,
    table: string,
  ): Promise<ColumnInfo[]> {
    const uri = this.buildParquetUri(params, database, schema, table);
    const hive = await this.isPartitionedDataset(params, database, schema, table);
    const session = await DuckDBSession.create(this.buildSessionOptions(params));
    try {
      await session.registerView('__col_target', uri, hive);
      const { columns, data } = await session.query('DESCRIBE __col_target');
      return data.map((row) => this.mapDescribeRow(row, columns));
    } finally {
      session.close();
    }
  }

  // ... getSampleData, getColumnStats, getColumnValueOverlap, executeReadOnlyQuery implementations
}
```

### S3Driver

File: `apps/api/src/connections/drivers/s3.driver.ts`

Implements the S3-specific methods:

- `testConnection`: `ListBucketsCommand` or `HeadBucketCommand` on `options.bucket` if set
- `listDatabases`: `ListBucketsCommand` (or single bucket from `options.bucket`)
- `listSchemas`: `ListObjectsV2Command` with `Delimiter='/'` on the bucket, applying `options.pathPrefix`
- `listTables`: `ListObjectsV2Command` to find `.parquet` files and folder prefixes within a schema
- `buildParquetUri`: Returns `s3://{bucket}/{schema}/{table}.parquet` or `s3://{bucket}/{schema}/{table}/**/*.parquet`
- `buildSessionOptions`: Returns `DuckDBSessionOptions` with `storageType: 's3'` and S3 credentials extracted from `params`
- `isPartitionedDataset`: Checks if `{bucket}/{schema}/{table}/` is a common prefix (sub-folder exists)

```typescript
// apps/api/src/connections/drivers/s3.driver.ts

import { S3Client, ListBucketsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { DataLakeBaseDriver } from './data-lake-base.driver';
import { ConnectionParams, ConnectionTestResult, DatabaseInfo, SchemaInfo, TableInfo } from './driver.interface';

export class S3Driver extends DataLakeBaseDriver {
  private buildS3Client(params: ConnectionParams): S3Client {
    const opts = params.options as Record<string, string> | undefined;
    return new S3Client({
      region: opts?.['region'] ?? params.host,
      credentials: {
        accessKeyId: params.username ?? '',
        secretAccessKey: params.password ?? '',
      },
      endpoint: opts?.['endpointUrl'] ?? undefined,
      forcePathStyle: !!opts?.['endpointUrl'], // Required for path-style S3-compatible endpoints
    });
  }

  async testConnection(params: ConnectionParams): Promise<ConnectionTestResult> {
    const start = Date.now();
    try {
      const client = this.buildS3Client(params);
      await client.send(new ListBucketsCommand({}));
      return { success: true, message: 'Connection successful', latencyMs: Date.now() - start };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message, latencyMs: Date.now() - start };
    }
  }

  // ... listDatabases, listSchemas, listTables, buildParquetUri, buildSessionOptions, isPartitionedDataset
}
```

### AzureBlobDriver

File: `apps/api/src/connections/drivers/azure-blob.driver.ts`

Implements the Azure Blob Storage-specific methods:

- `testConnection`: `BlobServiceClient.listContainers().next()` (fetches first container to validate auth)
- `listDatabases`: `BlobServiceClient.listContainers()` (or single container from `options.containerName`)
- `listSchemas`: `ContainerClient.listBlobsByHierarchy('/', ...)` to get top-level folder prefixes
- `listTables`: `ContainerClient.listBlobsByHierarchy('/', ...)` within a folder prefix for `.parquet` files
- `buildParquetUri`: Returns `az://{containerName}/{schema}/{table}.parquet` or with `/**/*.parquet`
- `buildSessionOptions`: Returns `DuckDBSessionOptions` with `storageType: 'azure_blob'` and Azure credentials
- `isPartitionedDataset`: Checks if `{container}/{schema}/{table}/` is a virtual directory

```typescript
// apps/api/src/connections/drivers/azure-blob.driver.ts

import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import { DataLakeBaseDriver } from './data-lake-base.driver';
import { ConnectionParams, ConnectionTestResult, DatabaseInfo } from './driver.interface';

export class AzureBlobDriver extends DataLakeBaseDriver {
  private buildBlobServiceClient(params: ConnectionParams): BlobServiceClient {
    const opts = params.options as Record<string, string> | undefined;
    const authMethod = opts?.['authMethod'] ?? 'key';
    if (authMethod === 'sas') {
      const url = `https://${params.host}`;
      return new BlobServiceClient(`${url}?${params.password}`);
    }
    const credential = new StorageSharedKeyCredential(
      params.username ?? '',
      params.password ?? '',
    );
    return new BlobServiceClient(`https://${params.host}`, credential);
  }

  async testConnection(params: ConnectionParams): Promise<ConnectionTestResult> {
    const start = Date.now();
    try {
      const client = this.buildBlobServiceClient(params);
      const iter = client.listContainers();
      await iter.next(); // Validates auth — does not require containers to exist
      return { success: true, message: 'Connection successful', latencyMs: Date.now() - start };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message, latencyMs: Date.now() - start };
    }
  }

  // ... listDatabases, listSchemas, listTables, buildParquetUri, buildSessionOptions, isPartitionedDataset
}
```

### Driver Factory Extension

File: `apps/api/src/connections/drivers/index.ts`

The existing `getDriver` and `getDiscoveryDriver` factory functions are extended with the two new cases:

```typescript
import { S3Driver } from './s3.driver';
import { AzureBlobDriver } from './azure-blob.driver';

export function getDriver(dbType: string): DatabaseDriver {
  switch (dbType) {
    case 'postgresql': return new PostgreSQLDriver();
    case 'mysql':      return new MySQLDriver();
    case 'sqlserver':  return new SQLServerDriver();
    case 'databricks': return new DatabricksDriver();
    case 'snowflake':  return new SnowflakeDriver();
    case 's3':         return new S3Driver();         // NEW
    case 'azure_blob': return new AzureBlobDriver();  // NEW
    default:
      throw new BadRequestException(`Unsupported database type: ${dbType}`);
  }
}

export function getDiscoveryDriver(dbType: string): DiscoveryDriver {
  switch (dbType) {
    case 'postgresql': return new PostgreSQLDriver();
    case 's3':         return new S3Driver();         // NEW
    case 'azure_blob': return new AzureBlobDriver();  // NEW
    default:
      throw new BadRequestException(
        `Schema discovery is not supported for database type: ${dbType}`
      );
  }
}
```

---

## Frontend Components

### 1. ConnectionDialog Changes

File: `apps/web/src/components/connections/ConnectionDialog.tsx`

The dialog is extended with two new type-specific field sections. The structure follows the same conditional rendering pattern used for Databricks and Snowflake.

**S3 Fields:**

```tsx
// S3-specific options section
{dbType === 's3' && (
  <>
    <TextField
      label="AWS Region"
      required
      helperText="e.g., us-east-1"
      value={s3Region}
      onChange={(e) => setS3Region(e.target.value)}
    />
    <TextField
      label="Default Bucket"
      helperText="Optional. Limits discovery to this bucket."
      value={s3Bucket}
      onChange={(e) => setS3Bucket(e.target.value)}
    />
    <TextField
      label="Path Prefix"
      helperText="Optional. e.g., prod/ — narrows file listing."
      value={s3PathPrefix}
      onChange={(e) => setS3PathPrefix(e.target.value)}
    />
    <TextField
      label="Custom Endpoint URL"
      helperText="Optional. For S3-compatible services with custom endpoints. e.g., https://s3.example.com"
      value={s3EndpointUrl}
      onChange={(e) => setS3EndpointUrl(e.target.value)}
    />
  </>
)}
```

**S3 Field Labels Override:**

The "Host" field label is overridden for S3 to read "AWS Region" with appropriate helper text. The "Username" and "Password" field labels are overridden to "Access Key ID" and "Secret Access Key".

```tsx
<TextField
  label={dbType === 's3' ? 'AWS Region' : dbType === 'azure_blob' ? 'Account URL' : 'Host'}
  helperText={
    dbType === 's3' ? 'e.g., us-east-1' :
    dbType === 'azure_blob' ? 'e.g., myaccount.blob.core.windows.net' :
    undefined
  }
  required
  value={host}
  onChange={(e) => setHost(e.target.value)}
/>

<TextField
  label={dbType === 's3' ? 'Access Key ID' : dbType === 'azure_blob' ? 'Storage Account Name' : 'Username'}
  value={username}
  onChange={(e) => setUsername(e.target.value)}
/>

<TextField
  label={dbType === 's3' ? 'Secret Access Key' : dbType === 'azure_blob' ? 'Account Key / SAS Token' : 'Password'}
  type="password"
  value={password}
  onChange={(e) => setPassword(e.target.value)}
/>
```

**Azure Blob Fields:**

```tsx
{dbType === 'azure_blob' && (
  <>
    <Select
      label="Authentication Method"
      value={azureAuthMethod}
      onChange={(e) => setAzureAuthMethod(e.target.value as 'key' | 'sas')}
    >
      <MenuItem value="key">Account Key</MenuItem>
      <MenuItem value="sas">SAS Token</MenuItem>
    </Select>
    <TextField
      label="Default Container"
      helperText="Optional. Limits discovery to this container."
      value={azureContainer}
      onChange={(e) => setAzureContainer(e.target.value)}
    />
    <TextField
      label="Path Prefix"
      helperText="Optional. e.g., prod/ — narrows blob listing."
      value={azurePathPrefix}
      onChange={(e) => setAzurePathPrefix(e.target.value)}
    />
  </>
)}
```

**Port Auto-Fill:**

```typescript
const DEFAULT_PORTS: Record<DatabaseType, number> = {
  postgresql: 5432,
  mysql: 3306,
  sqlserver: 1433,
  databricks: 443,
  snowflake: 443,
  s3: 443,          // NEW — always HTTPS
  azure_blob: 443,  // NEW — always HTTPS
};
```

**SSL Toggle Hidden:**

For `s3` and `azure_blob`, the SSL toggle is hidden and forced to `true`. The `useSsl` field is set to `true` programmatically before submission and the toggle is not rendered.

```tsx
{dbType !== 's3' && dbType !== 'azure_blob' && (
  <FormControlLabel
    control={<Switch checked={useSsl} onChange={(e) => setUseSsl(e.target.checked)} />}
    label="Use SSL"
  />
)}
```

---

### 2. ConnectionsPage Type Config

File: `apps/web/src/pages/ConnectionsPage.tsx`

The `DB_TYPE_CONFIG` map is extended with the two new types:

```typescript
const DB_TYPE_CONFIG: Record<DatabaseType, { label: string; color: ChipColor }> = {
  postgresql: { label: 'PostgreSQL',   color: 'primary'   }, // Blue
  mysql:      { label: 'MySQL',        color: 'warning'   }, // Orange
  sqlserver:  { label: 'SQL Server',   color: 'error'     }, // Red
  databricks: { label: 'Databricks',   color: 'secondary' }, // Purple
  snowflake:  { label: 'Snowflake',    color: 'info'      }, // Cyan
  s3:         { label: 'AWS S3',       color: 'success'   }, // Green — NEW
  azure_blob: { label: 'Azure Blob',   color: 'default'   }, // Gray — NEW
};
```

The table columns, pagination, search, and action buttons require no changes.

---

### 3. Semantic Model Wizard Label Overrides

File: `apps/web/src/pages/NewSemanticModelPage.tsx`

The four-step wizard already adapts labels based on the connection type through the discovery API responses. Two label overrides are added for cloud storage connections:

```tsx
// Step 1: Select database/bucket/container
const databaseStepLabel = (() => {
  if (connectionType === 's3') return 'Select Bucket';
  if (connectionType === 'azure_blob') return 'Select Container';
  return 'Select Database';
})();

// Step 2: Select schema/folder
const schemaStepLabel = (() => {
  if (connectionType === 's3' || connectionType === 'azure_blob') return 'Select Folder';
  return 'Select Schema';
})();

// Step 3: Select tables/parquet files
const tableStepLabel = (() => {
  if (connectionType === 's3' || connectionType === 'azure_blob') return 'Select Parquet Files';
  return 'Select Tables';
})();
```

These label strings are displayed in the MUI Stepper component and the step headings. The underlying API calls and data flow are unchanged.

---

### 4. TypeScript Types

File: `apps/web/src/types/index.ts`

```typescript
// Extended with two new cloud storage types
export type DatabaseType =
  | 'postgresql'
  | 'mysql'
  | 'sqlserver'
  | 'databricks'
  | 'snowflake'
  | 's3'          // NEW
  | 'azure_blob'; // NEW
```

All other interfaces (`DataConnection`, `CreateConnectionPayload`, `UpdateConnectionPayload`, `TestConnectionPayload`) reference `DatabaseType` and therefore automatically accept the new values without changes.

---

## File Inventory

### Backend Files (New)

```
apps/api/
└── src/
    └── connections/
        └── drivers/
            ├── data-lake-base.driver.ts    # Abstract base class for S3 + Azure Blob
            ├── duckdb-session.ts           # Ephemeral DuckDB session lifecycle utility
            ├── s3.driver.ts                # AWS S3 driver (listing + DuckDB delegation)
            └── azure-blob.driver.ts        # Azure Blob Storage driver (listing + DuckDB delegation)
```

### Backend Files (Modified)

```
apps/api/
├── prisma/
│   ├── schema.prisma                       # DatabaseType enum: added s3, azure_blob
│   └── migrations/
│       └── YYYYMMDDHHMMSS_add_cloud_storage_types/
│           └── migration.sql               # ALTER TYPE database_type ADD VALUE ...
├── src/
│   └── connections/
│       ├── drivers/
│       │   └── index.ts                    # getDriver + getDiscoveryDriver: added s3, azure_blob cases
│       └── dto/
│           ├── create-connection.dto.ts    # dbType Zod enum: added 's3', 'azure_blob'
│           ├── update-connection.dto.ts    # dbType Zod enum: added 's3', 'azure_blob'
│           ├── connection-query.dto.ts     # dbType filter enum: added 's3', 'azure_blob'
│           └── test-connection.dto.ts      # dbType Zod enum: added 's3', 'azure_blob'
└── package.json                            # Added: duckdb, @azure/storage-blob
```

### Frontend Files (New)

None — the cloud storage types are handled by extending existing components.

### Frontend Files (Modified)

```
apps/web/
└── src/
    ├── types/
    │   └── index.ts                        # DatabaseType: added 's3', 'azure_blob'
    ├── pages/
    │   ├── ConnectionsPage.tsx             # DB_TYPE_CONFIG: added s3, azure_blob entries
    │   └── NewSemanticModelPage.tsx        # Step label overrides for cloud storage types
    └── components/
        └── connections/
            └── ConnectionDialog.tsx        # S3 + Azure Blob type-specific fields, label overrides
```

### Backend Test Files (New)

```
apps/api/
└── test/
    ├── duckdb-session.spec.ts              # DuckDB utility unit tests
    ├── s3-driver.spec.ts                   # S3Driver unit tests (mocked AWS SDK)
    └── azure-blob-driver.spec.ts           # AzureBlobDriver unit tests (mocked Azure SDK)
```

### Frontend Test Files (Modified)

```
apps/web/
└── src/
    └── __tests__/
        └── pages/
            └── ConnectionsPage.test.tsx    # Added tests for s3 + azure_blob chip rendering
```

### Data Agent Prompt Files (Modified)

```
apps/api/
└── src/
    └── data-agent/
        └── agent/
            └── prompts/
                └── sql-builder.prompt.ts   # Added DuckDB dialect guidance block
```

---

## NPM Packages

### New Packages

Added to `apps/api/package.json`:

```json
{
  "dependencies": {
    "duckdb": "^1.1.0",
    "@azure/storage-blob": "^12.27.0"
  }
}
```

**`duckdb`** — In-process analytical SQL engine with native Parquet, `httpfs` (S3), and `azure` extension support. Installed as a native Node.js addon; the Docker image must include build tools for native compilation or use a pre-built binary.

**`@azure/storage-blob`** — Official Azure SDK for Blob Storage listing operations (`BlobServiceClient`, `ContainerClient`, `ListBlobsByHierarchyResponse`). Used for `testConnection`, `listDatabases`, `listSchemas`, and `listTables` in `AzureBlobDriver`.

### Existing Package Used

**`@aws-sdk/client-s3`** — Already present in `apps/api/package.json` (required by semantic model or other features). Used for `ListBucketsCommand`, `ListObjectsV2Command`, and `HeadBucketCommand` in `S3Driver`. No version change required.

### Install

```bash
cd apps/api && npm install
```

### Docker Considerations

DuckDB's `duckdb` npm package includes a native Node.js addon compiled from C++. The Docker build must accommodate this:

**Option A — Compile at build time** (simple, slower build):
```dockerfile
# Ensure build tools are available in the API Dockerfile
RUN apt-get install -y python3 make g++ && npm install
```

**Option B — Pre-install DuckDB extensions** (avoids network dependency at runtime):
```dockerfile
# After npm install, pre-install DuckDB extensions so httpfs and azure are available offline
RUN node -e "
  const duckdb = require('duckdb');
  const db = new duckdb.Database(':memory:');
  const conn = db.connect();
  conn.exec('INSTALL httpfs; INSTALL azure;', () => db.close());
"
```

Pre-installing extensions is recommended for production to remove the runtime dependency on DuckDB's extension repository.

---

## Testing

### Backend Tests

#### Unit Tests: DuckDBSession Utility

File: `apps/api/test/duckdb-session.spec.ts`

**Coverage:**
- Successfully creates an in-memory DuckDB session
- Configures S3 credentials via `SET` statements
- Configures Azure Account Key via `CREATE SECRET`
- Configures Azure SAS Token via `CREATE SECRET`
- Registers a view over a mock Parquet URI
- Executes a basic `SELECT 1` query and returns results
- `close()` does not throw even if called multiple times
- Custom S3 endpoint sets `s3_endpoint` and `s3_url_style='path'`

**Run:**
```bash
cd apps/api && npm test -- --config ./test/jest.config.js duckdb-session
```

---

#### Unit Tests: S3Driver

File: `apps/api/test/s3-driver.spec.ts`

The AWS SDK is mocked using `jest.mock('@aws-sdk/client-s3')`.

**Coverage:**

**`testConnection`**
- ✅ Returns `success: true` when `ListBucketsCommand` succeeds
- ✅ Returns `success: false` with error message when credentials are invalid
- ✅ Includes `latencyMs` in result

**`listDatabases`**
- ✅ Returns all buckets from `ListBucketsCommand` response
- ✅ Returns single bucket when `options.bucket` is set

**`listSchemas`**
- ✅ Returns common prefixes as `SchemaInfo[]` (folder names without trailing slash)
- ✅ Applies `options.pathPrefix` to listing request
- ✅ Returns empty array when bucket has no folder structure

**`listTables`**
- ✅ Returns `.parquet` files as tables
- ✅ Returns sub-folder prefixes as partitioned table candidates
- ✅ Filters out non-Parquet files
- ✅ Returns empty array when schema prefix has no Parquet content

**`listForeignKeys`**
- ✅ Always returns empty array

**`buildParquetUri`** (via `listColumns` integration)
- ✅ Returns `s3://bucket/schema/table.parquet` for single-file tables
- ✅ Returns `s3://bucket/schema/table/**/*.parquet` for partitioned folders
- ✅ Includes custom endpoint for S3-compatible connections

**`testConnection` (custom endpoint)**
- ✅ Passes `forcePathStyle: true` when `options.endpointUrl` is set

**Run:**
```bash
cd apps/api && npm test -- --config ./test/jest.config.js s3-driver
```

---

#### Unit Tests: AzureBlobDriver

File: `apps/api/test/azure-blob-driver.spec.ts`

Azure SDK is mocked using `jest.mock('@azure/storage-blob')`.

**Coverage:**

**`testConnection`**
- ✅ Returns `success: true` when `listContainers().next()` succeeds
- ✅ Returns `success: false` with error message when credentials are invalid
- ✅ Builds client with `StorageSharedKeyCredential` for Account Key auth
- ✅ Builds client with SAS token URL for SAS auth

**`listDatabases`**
- ✅ Returns all containers as `DatabaseInfo[]`
- ✅ Returns single container when `options.containerName` is set

**`listSchemas`**
- ✅ Returns virtual directory prefixes as `SchemaInfo[]`
- ✅ Applies `options.pathPrefix` to listing

**`listTables`**
- ✅ Returns `.parquet` blobs as tables (single-file)
- ✅ Returns virtual directory prefixes as partitioned table candidates
- ✅ Filters out non-Parquet blobs

**`listForeignKeys`**
- ✅ Always returns empty array

**`buildParquetUri`**
- ✅ Returns `az://container/schema/table.parquet` for single-file tables
- ✅ Returns `az://container/schema/table/**/*.parquet` for partitioned folders

**Run:**
```bash
cd apps/api && npm test -- --config ./test/jest.config.js azure-blob-driver
```

---

#### Integration Tests: Connections API (Extended)

File: `apps/api/test/connections.integration.spec.ts`

Existing integration tests cover all CRUD endpoints. The following additional cases are added for cloud storage types:

**POST /api/connections (S3)**
- ✅ Creates S3 connection with valid options
- ✅ Validates `options.region` is required for `s3` type
- ✅ Validates `options.endpointUrl` must be a valid URL if provided
- ✅ `hasCredential: true` returned, Access Key ID visible in `username`, secret not returned

**POST /api/connections (Azure Blob)**
- ✅ Creates Azure Blob connection with Account Key auth
- ✅ Creates Azure Blob connection with SAS Token auth
- ✅ Validates `options.authMethod` accepts only `'key'` or `'sas'`

**POST /api/connections/test (S3, mocked driver)**
- ✅ Returns `success: true` with latency for valid credentials

**GET /api/connections (filter by type)**
- ✅ `?dbType=s3` returns only S3 connections
- ✅ `?dbType=azure_blob` returns only Azure Blob connections

**Run:**
```bash
cd apps/api && npm test -- --config ./test/jest.config.js connections.integration
```

---

### Frontend Tests

File: `apps/web/src/__tests__/pages/ConnectionsPage.test.tsx`

Additional test cases for cloud storage type rendering:

**Connections Table (Cloud Types)**
- ✅ Renders "AWS S3" chip with success (green) color for S3 connection
- ✅ Renders "Azure Blob" chip for Azure Blob connection
- ✅ Shows `username` (Access Key ID) in the connection row for S3

**ConnectionDialog (S3)**
- ✅ Renders "AWS Region" field when S3 type is selected
- ✅ Renders "Access Key ID" label for username field
- ✅ Renders "Secret Access Key" label for password field
- ✅ Renders "Default Bucket" optional field
- ✅ Renders "Custom Endpoint URL" optional field for S3-compatible endpoints
- ✅ Does not render SSL toggle for S3 type
- ✅ Port auto-fills to 443 when S3 type is selected

**ConnectionDialog (Azure Blob)**
- ✅ Renders "Authentication Method" select with "Account Key" and "SAS Token" options
- ✅ Renders "Account URL" label for host field
- ✅ Renders "Storage Account Name" label for username field
- ✅ Renders "Account Key / SAS Token" label for password field
- ✅ Renders "Default Container" optional field
- ✅ Does not render SSL toggle for Azure Blob type
- ✅ Port auto-fills to 443 when Azure Blob type is selected

**Run:**
```bash
cd apps/web && npm test -- ConnectionsPage
```

---

## Configuration

### Environment Variables

No new environment variables are required. Cloud storage credentials are stored encrypted in the `data_connections` table, not in environment variables.

The existing `ENCRYPTION_KEY` environment variable is used to encrypt cloud credentials at rest:

```bash
# Required — used for encrypting ALL connection credentials including cloud storage
ENCRYPTION_KEY=<base64-encoded-32-byte-key>
```

### Database Migration

Run the migration to add the two new enum values to the `database_type` PostgreSQL enum:

```bash
cd apps/api && npm run prisma:migrate:dev -- --name add_cloud_storage_types
```

Or in production:

```bash
cd apps/api && npm run prisma:migrate
```

The migration adds `s3` and `azure_blob` to the existing `database_type` enum. PostgreSQL `ALTER TYPE ... ADD VALUE` statements are non-transactional and cannot be rolled back in a single transaction — this is expected behavior for enum additions.

### NPM Package Installation

```bash
cd apps/api && npm install
```

### Docker Build

The API Dockerfile must be updated to ensure native build tools are available for the `duckdb` package compilation:

```dockerfile
# apps/api/Dockerfile — add before npm install
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*
```

To pre-install DuckDB extensions at image build time (eliminates runtime network dependency):

```dockerfile
# After npm install, pre-bake the extensions
RUN node -e "\
  const duckdb = require('duckdb');\
  const db = new duckdb.Database(':memory:');\
  const conn = db.connect();\
  conn.exec('INSTALL httpfs; INSTALL azure;', (err) => { db.close(); if (err) process.exit(1); });\
"
```

This step requires outbound internet access from the Docker build environment. In air-gapped environments, extensions must be copied from a build artifact or an internal extension mirror.

### Seed (No Changes)

The connection permissions (`connections:read`, `connections:write`, `connections:delete`, `connections:test`) are already seeded and apply to cloud storage connection types without modification. No seed changes are required.

---

## Summary

The Cloud Storage Connections feature extends the existing Database Connections system to support AWS S3 and Azure Blob Storage as queryable data sources. DuckDB serves as the in-process query engine, providing native Parquet support without operational overhead.

Key design principles followed:

- **Zero new endpoints**: Reuses all existing `/api/connections` and discovery endpoints unchanged
- **Zero new permissions**: Reuses existing `connections:read/write/delete/test` permission set
- **Zero service layer changes**: `ConnectionsService` and `DiscoveryService` are untouched — the abstraction provided by `DatabaseDriver` and `DiscoveryDriver` interfaces fully contains the new complexity
- **Additive schema migration**: Only extends the `DatabaseType` enum; no new columns, tables, or indexes
- **Uniform discovery interface**: Cloud drivers implement the full `DiscoveryDriver` interface, enabling transparent integration with the Semantic Model agent and Data Agent
- **Encrypted credentials**: Same AES-256-GCM encryption used for relational database passwords
- **Read-only enforcement**: Two-layer protection (SQL validation + read-only Parquet view architecture) ensures data cannot be modified through cloud storage connections

This specification serves as both documentation and an implementation blueprint for the cloud storage connection drivers and their integration points.
