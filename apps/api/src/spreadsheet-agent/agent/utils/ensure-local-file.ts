import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join, extname } from 'path';
import { Logger } from '@nestjs/common';
import { StorageProvider } from '../../../storage/providers/storage-provider.interface';

const logger = new Logger('EnsureLocalFile');

/**
 * Ensure the file is available as a local path.
 *
 * Priority:
 * 1. storagePath is already a local file that exists — use it directly (backward compat).
 * 2. storagePath is an S3 key — check /tmp cache first, then download from S3.
 */
export async function ensureLocalFile(
  file: { storagePath: string; fileHash: string; fileName: string },
  storageProvider: StorageProvider,
): Promise<string> {
  // Unix absolute path
  if (file.storagePath.startsWith('/') && existsSync(file.storagePath)) {
    return file.storagePath;
  }
  // Windows absolute path (e.g. C:\...)
  if (/^[A-Za-z]:/.test(file.storagePath) && existsSync(file.storagePath)) {
    return file.storagePath;
  }

  // storagePath is an S3 key — resolve via local cache
  const ext = extname(file.fileName);
  const cacheDir = join(tmpdir(), 'spreadsheet-agent', 'cache');
  mkdirSync(cacheDir, { recursive: true });
  const localPath = join(cacheDir, `${file.fileHash}${ext}`);

  // Reuse existing cache entry if present
  if (existsSync(localPath)) {
    logger.debug(`Using cached file: ${localPath}`);
    return localPath;
  }

  // Download from S3 and write to cache
  logger.log(`Downloading file from S3: ${file.storagePath}`);
  const stream = await storageProvider.download(file.storagePath);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  writeFileSync(localPath, Buffer.concat(chunks));
  logger.debug(`File downloaded and cached at: ${localPath}`);

  return localPath;
}
