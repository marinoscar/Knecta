import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  ContainerClient,
} from '@azure/storage-blob';
import { DataLakeBaseDriver } from './datalake-base.driver';
import {
  ConnectionParams,
  ConnectionTestResult,
  DatabaseInfo,
  SchemaInfo,
  TableInfo,
} from './driver.interface';
import { DuckDBSessionOptions } from './duckdb.util';

/**
 * Discovery driver for Azure Blob Storage.
 *
 * Listing operations (containers, virtual-directory schemas, parquet tables)
 * are performed via the @azure/storage-blob SDK.  All schema introspection and
 * SQL execution is delegated to the DuckDB-based methods inherited from
 * DataLakeBaseDriver.
 *
 * Connection parameter mapping:
 *   params.host        — Storage account URL (e.g. https://myaccount.blob.core.windows.net)
 *   params.username    — Storage account name
 *   params.password    — Account key OR SAS token, depending on authMethod
 *   params.options.authMethod     — 'key' (default) | 'sas'
 *   params.options.containerName  — Optional: restrict listing to a single container
 *   params.options.pathPrefix     — Optional: virtual-directory prefix inside container
 */
export class AzureBlobDriver extends DataLakeBaseDriver {
  // ----------------------------------------
  // Storage-type identifier
  // ----------------------------------------

  getStorageType(): 'azure_blob' {
    return 'azure_blob';
  }

  // ----------------------------------------
  // URI builders (used by DataLakeBaseDriver)
  // ----------------------------------------

  /**
   * Builds the URI for a single Parquet file.
   *
   * Mapping: database = container name, schema = virtual folder, table = file name.
   * DuckDB Azure extension uses the az:// scheme.
   */
  protected buildParquetUri(
    params: ConnectionParams,
    database: string,
    schema: string,
    table: string,
  ): string {
    const pathPrefix = (params.options?.pathPrefix as string | undefined) ?? '';
    const prefix = pathPrefix ? `${pathPrefix}/${schema}` : schema;
    return `az://${database}/${prefix}/${table}.parquet`;
  }

  /**
   * Builds the glob URI for a partitioned Parquet folder.
   *
   * DuckDB reads all .parquet files under the folder using the ** glob.
   */
  protected buildPartitionedUri(
    params: ConnectionParams,
    database: string,
    schema: string,
    table: string,
  ): string {
    const pathPrefix = (params.options?.pathPrefix as string | undefined) ?? '';
    const prefix = pathPrefix ? `${pathPrefix}/${schema}` : schema;
    return `az://${database}/${prefix}/${table}/**/*.parquet`;
  }

  /**
   * Builds the DuckDBSessionOptions for Azure Blob Storage.
   *
   * The DuckDB azure extension supports two authentication modes:
   *   - Account key:  passed via a connection string secret
   *   - SAS token:    passed via a service-principal-style secret with SAS_TOKEN
   */
  protected buildSessionOptions(params: ConnectionParams): DuckDBSessionOptions {
    const authMethod = (params.options?.authMethod as string | undefined) ?? 'key';
    const accountName = params.username ?? '';
    const accountUrl = this.normaliseAccountUrl(params.host ?? '', accountName);

    if (authMethod === 'sas') {
      const rawSas = params.password ?? '';
      // Normalise SAS token: DuckDB expects it without a leading '?'
      const sasToken = rawSas.startsWith('?') ? rawSas.slice(1) : rawSas;

      return {
        storageType: 'azure_blob',
        credentials: {
          accountName,
          sasToken,
          accountUrl,
        },
      };
    }

    // Default: account key authentication
    return {
      storageType: 'azure_blob',
      credentials: {
        accountName,
        accountKey: params.password ?? '',
        accountUrl,
      },
    };
  }

  /**
   * Returns true when the given table reference resolves to a partitioned
   * folder (containing one or more Parquet files) rather than a single
   * Parquet file at the root of the schema prefix.
   */
  protected async isPartitionedDataset(
    params: ConnectionParams,
    database: string,
    schema: string,
    table: string,
  ): Promise<boolean> {
    const containerClient = this.getContainerClient(params, database);
    const pathPrefix = (params.options?.pathPrefix as string | undefined) ?? '';
    const folderPrefix = pathPrefix
      ? `${pathPrefix}/${schema}/${table}/`
      : `${schema}/${table}/`;

    try {
      for await (const blob of containerClient.listBlobsFlat({ prefix: folderPrefix })) {
        if (blob.name.endsWith('.parquet')) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  // ----------------------------------------
  // Abstract implementations: listing
  // ----------------------------------------

  async testConnection(params: ConnectionParams): Promise<ConnectionTestResult> {
    const start = Date.now();
    try {
      const serviceClient = this.buildBlobServiceClient(params);
      const containerName = params.options?.containerName as string | undefined;

      if (containerName) {
        // Validate access to the specific configured container
        const containerClient = serviceClient.getContainerClient(containerName);
        await containerClient.getProperties();
      } else {
        // Validate general account access
        await serviceClient.getProperties();
      }

      return {
        success: true,
        message: 'Connection successful',
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        latencyMs: Date.now() - start,
      };
    }
  }

  /**
   * Lists containers in the storage account.
   *
   * If `params.options.containerName` is set, returns only that container
   * so the user sees a single database entry matching their configuration.
   */
  async listDatabases(params: ConnectionParams): Promise<DatabaseInfo[]> {
    const serviceClient = this.buildBlobServiceClient(params);
    const defaultContainer = params.options?.containerName as string | undefined;

    if (defaultContainer) {
      return [{ name: defaultContainer }];
    }

    const containers: DatabaseInfo[] = [];
    for await (const container of serviceClient.listContainers()) {
      containers.push({ name: container.name });
    }
    return containers;
  }

  /**
   * Lists top-level virtual directories within a container, treating each as
   * a schema.
   *
   * When `params.options.pathPrefix` is set (e.g. "data/raw"), the listing is
   * scoped to that prefix so only its direct children are returned as schemas.
   *
   * A special `_root` schema is prepended when Parquet files exist directly
   * under the prefix (or container root) without a sub-folder.
   */
  async listSchemas(params: ConnectionParams, database: string): Promise<SchemaInfo[]> {
    const containerClient = this.getContainerClient(params, database);
    const pathPrefix = (params.options?.pathPrefix as string | undefined) ?? '';
    const listingPrefix = pathPrefix ? `${pathPrefix}/` : '';

    const schemas: SchemaInfo[] = [];
    const seenPrefixes = new Set<string>();
    let hasRootParquet = false;

    for await (const item of containerClient.listBlobsByHierarchy('/', {
      prefix: listingPrefix,
    })) {
      if (item.kind === 'prefix' && item.name) {
        // Virtual directory — strip trailing slash and optional pathPrefix
        let name = item.name.replace(/\/$/, '');
        if (pathPrefix) {
          name = name.replace(new RegExp(`^${escapeRegExp(pathPrefix)}/`), '');
        }
        if (name && !seenPrefixes.has(name)) {
          seenPrefixes.add(name);
          schemas.push({ name, database });
        }
      } else if (item.kind !== 'prefix' && item.name?.endsWith('.parquet')) {
        hasRootParquet = true;
      }
    }

    // Root-level Parquet files are surfaced under a synthetic '_root' schema
    if (hasRootParquet) {
      schemas.unshift({ name: '_root', database });
    }

    return schemas;
  }

  /**
   * Lists Parquet tables within a schema (virtual directory).
   *
   * Handles two layouts:
   *   1. Single-file: schema/table.parquet
   *   2. Partitioned: schema/table/<partition_key>=<value>/<file>.parquet
   *
   * The `_root` schema is treated as the container root (or pathPrefix root),
   * and only flat Parquet files at that level are returned.
   */
  async listTables(
    params: ConnectionParams,
    database: string,
    schema: string,
  ): Promise<TableInfo[]> {
    const containerClient = this.getContainerClient(params, database);
    const pathPrefix = (params.options?.pathPrefix as string | undefined) ?? '';

    let listingPrefix: string;
    if (schema === '_root') {
      listingPrefix = pathPrefix ? `${pathPrefix}/` : '';
    } else {
      listingPrefix = pathPrefix ? `${pathPrefix}/${schema}/` : `${schema}/`;
    }

    const tables: TableInfo[] = [];
    const checkedFolders = new Set<string>();

    for await (const item of containerClient.listBlobsByHierarchy('/', {
      prefix: listingPrefix,
    })) {
      if (item.kind === 'prefix') {
        // Virtual sub-directory — could be a partitioned table folder
        const folderName = item.name.replace(/\/$/, '').split('/').pop() ?? '';
        if (!folderName || checkedFolders.has(folderName)) continue;
        checkedFolders.add(folderName);

        // Only surface the folder as a table if it contains at least one Parquet file
        let hasParquet = false;
        for await (const blob of containerClient.listBlobsFlat({ prefix: item.name })) {
          if (blob.name.endsWith('.parquet')) {
            hasParquet = true;
            break;
          }
        }

        if (hasParquet) {
          tables.push({ name: folderName, schema, database, type: 'TABLE' });
        }
      } else if (item.name?.endsWith('.parquet')) {
        // Single flat Parquet file
        const fileName = item.name.split('/').pop() ?? '';
        const tableName = fileName.replace(/\.parquet$/i, '');
        if (tableName) {
          tables.push({ name: tableName, schema, database, type: 'TABLE' });
        }
      }
    }

    return tables;
  }

  // ----------------------------------------
  // Private helpers
  // ----------------------------------------

  /**
   * Constructs the account URL from the provided host string.
   *
   * Accepts:
   *   - Full URL: "https://myaccount.blob.core.windows.net"
   *   - Host only: "myaccount.blob.core.windows.net"  → prepends https://
   *   - Empty:     falls back to standard Azure URL using accountName
   */
  private normaliseAccountUrl(host: string, accountName: string): string {
    if (!host) {
      return `https://${accountName}.blob.core.windows.net`;
    }
    if (host.startsWith('http://') || host.startsWith('https://')) {
      return host;
    }
    return `https://${host}`;
  }

  /**
   * Creates a BlobServiceClient using the auth method specified in
   * params.options.authMethod ('key' or 'sas').
   */
  private buildBlobServiceClient(params: ConnectionParams): BlobServiceClient {
    const accountName = params.username ?? '';
    const authMethod = (params.options?.authMethod as string | undefined) ?? 'key';
    const accountUrl = this.normaliseAccountUrl(params.host ?? '', accountName);

    if (authMethod === 'sas') {
      const rawSas = params.password ?? '';
      // BlobServiceClient expects the SAS token in the URL query string
      const sasPrefix = rawSas.startsWith('?') ? '' : '?';
      return new BlobServiceClient(`${accountUrl}${sasPrefix}${rawSas}`);
    }

    // Account key authentication via StorageSharedKeyCredential
    const sharedKeyCredential = new StorageSharedKeyCredential(accountName, params.password ?? '');
    return new BlobServiceClient(accountUrl, sharedKeyCredential);
  }

  /**
   * Returns a ContainerClient for the named container, reusing the service
   * client construction logic from buildBlobServiceClient.
   */
  private getContainerClient(params: ConnectionParams, containerName: string): ContainerClient {
    return this.buildBlobServiceClient(params).getContainerClient(containerName);
  }
}

// ==========================================
// Utility
// ==========================================

/**
 * Escapes a string for safe use in a RegExp constructor.
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
