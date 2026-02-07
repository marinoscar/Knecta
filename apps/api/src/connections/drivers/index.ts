import { BadRequestException } from '@nestjs/common';
import { DatabaseDriver } from './driver.interface';
import { PostgreSQLDriver } from './postgresql.driver';
import { MySQLDriver } from './mysql.driver';
import { SQLServerDriver } from './sqlserver.driver';
import { DatabricksDriver } from './databricks.driver';
import { SnowflakeDriver } from './snowflake.driver';

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

export { DatabaseDriver, ConnectionParams, ConnectionTestResult } from './driver.interface';
