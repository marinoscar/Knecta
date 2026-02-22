-- Add S3 and Azure Blob Storage connection types
ALTER TYPE "DatabaseType" ADD VALUE 's3';
ALTER TYPE "DatabaseType" ADD VALUE 'azure_blob';
