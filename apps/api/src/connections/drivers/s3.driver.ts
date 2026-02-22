import {
  S3Client,
  ListBucketsCommand,
  ListObjectsV2Command,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
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
 * S3Driver implements schema discovery and query execution for Amazon S3
 * (and S3-compatible stores such as MinIO) backed by Parquet files.
 *
 * Mapping conventions:
 *   database = S3 bucket name
 *   schema   = top-level folder (common prefix) inside the bucket
 *   table    = either a single .parquet file (without extension) or a
 *              sub-folder containing .parquet files (partitioned dataset)
 *
 * Connection params:
 *   params.username          = AWS access key ID
 *   params.password          = AWS secret access key
 *   params.host              = AWS region (fallback when options.region absent)
 *   params.options.region    = AWS region (preferred)
 *   params.options.bucket    = restrict discovery to a single bucket (optional)
 *   params.options.pathPrefix = path prefix inside the bucket to scope all
 *                               listing operations (optional, no leading slash)
 *   params.options.endpointUrl = custom endpoint for S3-compatible stores
 *                                (e.g. http://minio:9000)
 */
export class S3Driver extends DataLakeBaseDriver {
  // ----------------------------------------
  // Storage type identifier
  // ----------------------------------------

  getStorageType(): 's3' {
    return 's3';
  }

  // ----------------------------------------
  // URI builders
  // ----------------------------------------

  protected buildParquetUri(
    params: ConnectionParams,
    database: string,
    schema: string,
    table: string,
  ): string {
    const pathPrefix = (params.options?.pathPrefix as string) || '';
    const folderSegment = pathPrefix ? `${pathPrefix}/${schema}` : schema;

    // _root schema means files live directly under the bucket (or pathPrefix)
    if (schema === '_root') {
      const rootSegment = pathPrefix || '';
      return rootSegment
        ? `s3://${database}/${rootSegment}/${table}.parquet`
        : `s3://${database}/${table}.parquet`;
    }

    return `s3://${database}/${folderSegment}/${table}.parquet`;
  }

  protected buildPartitionedUri(
    params: ConnectionParams,
    database: string,
    schema: string,
    table: string,
  ): string {
    const pathPrefix = (params.options?.pathPrefix as string) || '';
    const folderSegment = pathPrefix ? `${pathPrefix}/${schema}` : schema;

    if (schema === '_root') {
      const rootSegment = pathPrefix || '';
      return rootSegment
        ? `s3://${database}/${rootSegment}/${table}/**/*.parquet`
        : `s3://${database}/${table}/**/*.parquet`;
    }

    return `s3://${database}/${folderSegment}/${table}/**/*.parquet`;
  }

  // ----------------------------------------
  // DuckDB session options
  // ----------------------------------------

  protected buildSessionOptions(params: ConnectionParams): DuckDBSessionOptions {
    return {
      storageType: 's3',
      credentials: {
        region: (params.options?.region as string) || params.host || 'us-east-1',
        accessKeyId: params.username || '',
        secretAccessKey: params.password || '',
        endpointUrl: params.options?.endpointUrl as string | undefined,
      },
    };
  }

  // ----------------------------------------
  // Partitioned dataset detection
  // ----------------------------------------

  protected async isPartitionedDataset(
    params: ConnectionParams,
    database: string,
    schema: string,
    table: string,
  ): Promise<boolean> {
    const client = this.buildS3Client(params);
    const pathPrefix = (params.options?.pathPrefix as string) || '';

    let prefix: string;
    if (schema === '_root') {
      prefix = pathPrefix ? `${pathPrefix}/${table}/` : `${table}/`;
    } else {
      prefix = pathPrefix
        ? `${pathPrefix}/${schema}/${table}/`
        : `${schema}/${table}/`;
    }

    try {
      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: database,
          Prefix: prefix,
          MaxKeys: 1,
        }),
      );
      // Any objects under the prefix means this is a partitioned folder
      return (response.Contents?.length ?? 0) > 0;
    } catch {
      return false;
    }
  }

  // ----------------------------------------
  // Connection test
  // ----------------------------------------

  async testConnection(params: ConnectionParams): Promise<ConnectionTestResult> {
    const start = Date.now();
    try {
      const client = this.buildS3Client(params);
      const bucket = params.options?.bucket as string | undefined;

      if (bucket) {
        // Verify access to the specific configured bucket
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
      } else {
        // Verify credentials by listing buckets
        await client.send(new ListBucketsCommand({}));
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

  // ----------------------------------------
  // Schema discovery: databases (buckets)
  // ----------------------------------------

  async listDatabases(params: ConnectionParams): Promise<DatabaseInfo[]> {
    const client = this.buildS3Client(params);
    const defaultBucket = params.options?.bucket as string | undefined;

    // When a specific bucket is configured, expose only that bucket
    if (defaultBucket) {
      return [{ name: defaultBucket }];
    }

    const response = await client.send(new ListBucketsCommand({}));
    return (response.Buckets ?? [])
      .map((b) => ({ name: b.Name ?? '' }))
      .filter((b) => b.name !== '');
  }

  // ----------------------------------------
  // Schema discovery: schemas (top-level folders)
  // ----------------------------------------

  async listSchemas(params: ConnectionParams, database: string): Promise<SchemaInfo[]> {
    const client = this.buildS3Client(params);
    const pathPrefix = (params.options?.pathPrefix as string) || '';
    const listPrefix = pathPrefix ? `${pathPrefix}/` : '';

    // Collect all common prefixes (folders) via paginated listing
    const schemas: SchemaInfo[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: database,
          Prefix: listPrefix,
          Delimiter: '/',
          ContinuationToken: continuationToken,
        }),
      );

      for (const prefix of response.CommonPrefixes ?? []) {
        if (!prefix.Prefix) continue;

        // Strip trailing slash and optional path prefix
        let name = prefix.Prefix.replace(/\/$/, '');
        if (pathPrefix) {
          name = name.replace(new RegExp(`^${escapeRegExp(pathPrefix)}/`), '');
        }
        if (name) {
          schemas.push({ name, database });
        }
      }

      // Check for parquet files directly at the root level (first page only)
      if (!continuationToken) {
        const hasRootParquet = (response.Contents ?? []).some((obj) =>
          obj.Key?.endsWith('.parquet'),
        );
        if (hasRootParquet) {
          // Prepend a virtual schema for root-level files
          schemas.unshift({ name: '_root', database });
        }
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    return schemas;
  }

  // ----------------------------------------
  // Schema discovery: tables (files / folders)
  // ----------------------------------------

  async listTables(
    params: ConnectionParams,
    database: string,
    schema: string,
  ): Promise<TableInfo[]> {
    const client = this.buildS3Client(params);
    const pathPrefix = (params.options?.pathPrefix as string) || '';

    let listPrefix: string;
    if (schema === '_root') {
      listPrefix = pathPrefix ? `${pathPrefix}/` : '';
    } else {
      listPrefix = pathPrefix ? `${pathPrefix}/${schema}/` : `${schema}/`;
    }

    const tables: TableInfo[] = [];
    let continuationToken: string | undefined;

    // Collect individual parquet files and sub-folder names across all pages
    const subFolderPrefixes = new Set<string>();
    const parquetFiles: string[] = [];

    do {
      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: database,
          Prefix: listPrefix,
          Delimiter: '/',
          ContinuationToken: continuationToken,
        }),
      );

      // Individual .parquet files at this level
      for (const obj of response.Contents ?? []) {
        if (obj.Key?.endsWith('.parquet')) {
          const fileName = obj.Key.split('/').pop() ?? '';
          const tableName = fileName.replace(/\.parquet$/, '');
          if (tableName) {
            parquetFiles.push(tableName);
          }
        }
      }

      // Sub-folders are candidates for partitioned datasets
      for (const prefix of response.CommonPrefixes ?? []) {
        if (prefix.Prefix) {
          subFolderPrefixes.add(prefix.Prefix);
        }
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    // Add individual parquet files as tables
    for (const tableName of parquetFiles) {
      tables.push({
        name: tableName,
        schema,
        database,
        type: 'TABLE',
        rowCountEstimate: undefined,
      });
    }

    // Check sub-folders in parallel — include only those that contain parquet files
    const folderChecks = Array.from(subFolderPrefixes).map(async (folderPrefix) => {
      const folderName = folderPrefix.replace(/\/$/, '').split('/').pop() ?? '';
      if (!folderName) return;

      const subResponse = await client.send(
        new ListObjectsV2Command({
          Bucket: database,
          Prefix: folderPrefix,
          MaxKeys: 5,
        }),
      );

      const hasParquet = (subResponse.Contents ?? []).some((obj) =>
        obj.Key?.endsWith('.parquet'),
      );

      if (hasParquet) {
        tables.push({
          name: folderName,
          schema,
          database,
          type: 'TABLE',
          rowCountEstimate: undefined,
        });
      }
    });

    await Promise.all(folderChecks);

    return tables;
  }

  // ----------------------------------------
  // Private helpers
  // ----------------------------------------

  private buildS3Client(params: ConnectionParams): S3Client {
    const region =
      (params.options?.region as string) || params.host || 'us-east-1';
    const endpointUrl = params.options?.endpointUrl as string | undefined;

    return new S3Client({
      region,
      credentials: {
        accessKeyId: params.username || '',
        secretAccessKey: params.password || '',
      },
      ...(endpointUrl
        ? {
            endpoint: endpointUrl,
            // Required for MinIO and other S3-compatible stores
            forcePathStyle: true,
          }
        : {}),
    });
  }
}

// ==========================================
// Helpers
// ==========================================

/**
 * Escapes special regex metacharacters in a literal string so it can be
 * safely embedded in a RegExp pattern.
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
