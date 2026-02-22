import { BadRequestException } from '@nestjs/common';
import { DatabaseDriver, DiscoveryDriver } from './driver.interface';
import { PostgreSQLDriver } from './postgresql.driver';
import { MySQLDriver } from './mysql.driver';
import { SQLServerDriver } from './sqlserver.driver';
import { DatabricksDriver } from './databricks.driver';
import { SnowflakeDriver } from './snowflake.driver';
import { S3Driver } from './s3.driver';
import { AzureBlobDriver } from './azure-blob.driver';

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
    case 's3':
      return new S3Driver();
    case 'azure_blob':
      return new AzureBlobDriver();
    default:
      throw new BadRequestException(`Unsupported database type: ${dbType}`);
  }
}

export function getDiscoveryDriver(dbType: string): DiscoveryDriver {
  switch (dbType) {
    case 'postgresql':
      return new PostgreSQLDriver() as DiscoveryDriver;
    case 'snowflake':
      return new SnowflakeDriver() as DiscoveryDriver;
    case 's3':
      return new S3Driver();
    case 'azure_blob':
      return new AzureBlobDriver();
    default:
      throw new BadRequestException(`Schema discovery not yet implemented for ${dbType}`);
  }
}

export {
  DatabaseDriver,
  DiscoveryDriver,
  ConnectionParams,
  ConnectionTestResult,
  DatabaseInfo,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  ForeignKeyInfo,
  SampleDataResult,
  ColumnStatsResult,
  ColumnValueOverlapResult,
  QueryResult,
} from './driver.interface';
