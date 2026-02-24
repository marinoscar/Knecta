import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  ListObjectsV2Command,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  NotFound,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';
import { StorageProvider } from '../storage-provider.interface';
import {
  StorageUploadOptions,
  StorageUploadResult,
  MultipartUploadInit,
  UploadPart,
  SignedUrlOptions,
} from '../storage-provider.types';

/**
 * AWS S3 storage provider implementation
 */
@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly logger = new Logger(S3StorageProvider.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly region: string;

  constructor(private readonly configService: ConfigService) {
    this.region = this.configService.get<string>('storage.s3.region') || 'us-east-1';
    const accessKeyId = this.configService.get<string>(
      'storage.s3.accessKeyId',
    );
    const secretAccessKey = this.configService.get<string>(
      'storage.s3.secretAccessKey',
    );

    this.bucket = this.configService.get<string>('storage.s3.bucket') || '';

    if (!this.bucket) {
      this.logger.warn('S3 bucket not configured');
    }

    // Initialize S3 client
    this.s3Client = new S3Client({
      region: this.region,
      credentials:
        accessKeyId && secretAccessKey
          ? {
              accessKeyId,
              secretAccessKey,
            }
          : undefined,
    });

    this.logger.log(
      `S3StorageProvider initialized - Bucket: ${this.bucket}, Region: ${this.region}`,
    );

    // Ensure the bucket exists (fire-and-forget — logged on failure)
    if (this.bucket) {
      this.ensureBucketExists().catch((err) => {
        this.logger.error(`Failed to ensure bucket exists: ${err.message}`);
      });
    }
  }

  /**
   * Check if the configured bucket exists; create it if it does not.
   */
  private async ensureBucketExists(): Promise<void> {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.debug(`Bucket "${this.bucket}" exists`);
    } catch (error: unknown) {
      const code =
        (error as { name?: string })?.name ??
        (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;

      if (code === 'NotFound' || code === 404) {
        this.logger.warn(`Bucket "${this.bucket}" not found — creating it`);
        await this.s3Client.send(
          new CreateBucketCommand({
            Bucket: this.bucket,
            ...(this.region !== 'us-east-1'
              ? { CreateBucketConfiguration: { LocationConstraint: this.region as any } }
              : {}),
          }),
        );
        this.logger.log(`Bucket "${this.bucket}" created in ${this.region}`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Simple upload using AWS SDK Upload helper
   * Automatically handles multipart uploads for large files
   */
  async upload(
    key: string,
    stream: Readable,
    options: StorageUploadOptions,
  ): Promise<StorageUploadResult> {
    this.logger.debug(`Starting upload for key: ${key}`);

    try {
      const upload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: this.bucket,
          Key: key,
          Body: stream,
          ContentType: options.mimeType,
          Metadata: options.metadata || {},
          ContentLength: options.contentLength,
        },
        // Use configured part size for automatic multipart uploads
        partSize: this.configService.get<number>('storage.partSize', 10485760), // 10MB default
      });

      const result = await upload.done();

      this.logger.log(`Upload completed for key: ${key}`);

      return {
        key,
        bucket: this.bucket,
        location: result.Location || `${this.bucket}/${key}`,
        eTag: result.ETag,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Upload failed for key ${key}: ${message}`, stack);
      throw error;
    }
  }

  /**
   * Initialize multipart upload
   */
  async initMultipartUpload(
    key: string,
    options: StorageUploadOptions,
  ): Promise<MultipartUploadInit> {
    this.logger.debug(`Initiating multipart upload for key: ${key}`);

    try {
      const command = new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: options.mimeType,
        Metadata: options.metadata || {},
      });

      const result = await this.s3Client.send(command);

      if (!result.UploadId) {
        throw new Error('Failed to initiate multipart upload - no UploadId returned');
      }

      this.logger.log(`Multipart upload initiated for key: ${key}, UploadId: ${result.UploadId}`);

      return {
        uploadId: result.UploadId,
        key,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to initiate multipart upload for key ${key}: ${message}`,
        stack,
      );
      throw error;
    }
  }

  /**
   * Generate signed URL for uploading a specific part
   */
  async getSignedUploadUrl(
    key: string,
    uploadId: string,
    partNumber: number,
    expiresIn: number = 3600,
  ): Promise<string> {
    this.logger.debug(
      `Generating signed upload URL for key: ${key}, part: ${partNumber}`,
    );

    try {
      const command = new UploadPartCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      });

      const signedUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn,
      });

      return signedUrl;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to generate signed upload URL for key ${key}, part ${partNumber}: ${message}`,
        stack,
      );
      throw error;
    }
  }

  /**
   * Complete multipart upload
   */
  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: UploadPart[],
  ): Promise<StorageUploadResult> {
    this.logger.debug(
      `Completing multipart upload for key: ${key}, ${parts.length} parts`,
    );

    try {
      const command = new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map((part) => ({
            PartNumber: part.partNumber,
            ETag: part.eTag,
          })),
        },
      });

      const result = await this.s3Client.send(command);

      this.logger.log(`Multipart upload completed for key: ${key}`);

      return {
        key,
        bucket: this.bucket,
        location: result.Location || `${this.bucket}/${key}`,
        eTag: result.ETag,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to complete multipart upload for key ${key}: ${message}`,
        stack,
      );
      throw error;
    }
  }

  /**
   * Abort multipart upload
   */
  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    this.logger.debug(`Aborting multipart upload for key: ${key}`);

    try {
      const command = new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
      });

      await this.s3Client.send(command);

      this.logger.log(`Multipart upload aborted for key: ${key}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to abort multipart upload for key ${key}: ${message}`,
        stack,
      );
      throw error;
    }
  }

  /**
   * Download file as stream
   */
  async download(key: string): Promise<Readable> {
    this.logger.debug(`Downloading file for key: ${key}`);

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const result = await this.s3Client.send(command);

      if (!result.Body) {
        throw new Error('No body returned from S3');
      }

      // S3 returns a readable stream
      return result.Body as Readable;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to download file for key ${key}: ${message}`,
        stack,
      );
      throw error;
    }
  }

  /**
   * Generate signed download URL
   */
  async getSignedDownloadUrl(
    key: string,
    options?: SignedUrlOptions,
  ): Promise<string> {
    this.logger.debug(`Generating signed download URL for key: ${key}`);

    try {
      const expiresIn = options?.expiresIn || 3600;

      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: options?.responseContentDisposition,
      });

      const signedUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn,
      });

      return signedUrl;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to generate signed download URL for key ${key}: ${message}`,
        stack,
      );
      throw error;
    }
  }

  /**
   * Delete file
   */
  async delete(key: string): Promise<void> {
    this.logger.debug(`Deleting file for key: ${key}`);

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.s3Client.send(command);

      this.logger.log(`File deleted for key: ${key}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to delete file for key ${key}: ${message}`,
        stack,
      );
      throw error;
    }
  }

  /**
   * Delete all files matching a key prefix
   */
  async deleteByPrefix(prefix: string): Promise<number> {
    this.logger.debug(`Deleting all objects with prefix: ${prefix}`);

    let totalDeleted = 0;
    let continuationToken: string | undefined;

    try {
      do {
        const listCommand = new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        });

        const listResult = await this.s3Client.send(listCommand);
        const objects = listResult.Contents;

        if (!objects || objects.length === 0) {
          break;
        }

        const deleteCommand = new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: {
            Objects: objects.map((obj) => ({ Key: obj.Key })),
            Quiet: true,
          },
        });

        await this.s3Client.send(deleteCommand);
        totalDeleted += objects.length;

        continuationToken = listResult.IsTruncated
          ? listResult.NextContinuationToken
          : undefined;
      } while (continuationToken);

      this.logger.log(
        `Deleted ${totalDeleted} objects with prefix: ${prefix}`,
      );
      return totalDeleted;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to delete objects with prefix ${prefix}: ${message}`,
        stack,
      );
      throw error;
    }
  }

  /**
   * Get file metadata
   */
  async getMetadata(key: string): Promise<Record<string, string> | null> {
    this.logger.debug(`Getting metadata for key: ${key}`);

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const result = await this.s3Client.send(command);

      return result.Metadata || {};
    } catch (error) {
      if (error instanceof NotFound || (error && typeof error === 'object' && 'name' in error && error.name === 'NotFound')) {
        return null;
      }
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to get metadata for key ${key}: ${message}`,
        stack,
      );
      throw error;
    }
  }

  /**
   * Set file metadata
   * Uses CopyObject with REPLACE metadata directive
   */
  async setMetadata(
    key: string,
    metadata: Record<string, string>,
  ): Promise<void> {
    this.logger.debug(`Setting metadata for key: ${key}`);

    try {
      const command = new CopyObjectCommand({
        Bucket: this.bucket,
        Key: key,
        CopySource: `${this.bucket}/${key}`,
        Metadata: metadata,
        MetadataDirective: 'REPLACE',
      });

      await this.s3Client.send(command);

      this.logger.log(`Metadata updated for key: ${key}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to set metadata for key ${key}: ${message}`,
        stack,
      );
      throw error;
    }
  }

  /**
   * Check if file exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.s3Client.send(command);
      return true;
    } catch (error) {
      if (error instanceof NotFound || (error && typeof error === 'object' && 'name' in error && error.name === 'NotFound')) {
        return false;
      }
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Error checking existence for key ${key}: ${message}`,
        stack,
      );
      throw error;
    }
  }

  /**
   * Get bucket name
   */
  getBucket(): string {
    return this.bucket;
  }
}
