import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { DiscoveryService } from '../../../discovery/discovery.service';

export function createAgentTools(
  discoveryService: DiscoveryService,
  connectionId: string,
  userId: string,
) {
  const listSchemas = new DynamicStructuredTool({
    name: 'list_schemas',
    description: 'List all schemas in the target database. Use this first to understand what schemas are available.',
    schema: z.object({
      database: z.string().describe('The database name to list schemas for'),
    }),
    func: async ({ database }) => {
      const result = await discoveryService.listSchemas(connectionId, database, userId);
      return JSON.stringify(result);
    },
  });

  const listTables = new DynamicStructuredTool({
    name: 'list_tables',
    description: 'List all tables and views in a specific schema. Returns table names, types (TABLE/VIEW), and estimated row counts.',
    schema: z.object({
      database: z.string().describe('The database name'),
      schema: z.string().describe('The schema name'),
    }),
    func: async ({ database, schema }) => {
      const result = await discoveryService.listTables(connectionId, database, schema, userId);
      return JSON.stringify(result);
    },
  });

  const listColumns = new DynamicStructuredTool({
    name: 'list_columns',
    description: 'Get detailed column metadata for a table including data types, nullability, primary keys, and comments.',
    schema: z.object({
      database: z.string().describe('The database name'),
      schema: z.string().describe('The schema name'),
      table: z.string().describe('The table name'),
    }),
    func: async ({ database, schema, table }) => {
      const result = await discoveryService.listColumns(connectionId, database, schema, table, userId);
      return JSON.stringify(result);
    },
  });

  const getForeignKeys = new DynamicStructuredTool({
    name: 'get_foreign_keys',
    description: 'Get all explicit foreign key constraints in a schema. Returns from/to table and column mappings.',
    schema: z.object({
      database: z.string().describe('The database name'),
      schema: z.string().describe('The schema name'),
    }),
    func: async ({ database, schema }) => {
      const result = await discoveryService.getForeignKeys(connectionId, database, schema, userId);
      return JSON.stringify(result);
    },
  });

  const getSampleData = new DynamicStructuredTool({
    name: 'get_sample_data',
    description: 'Get sample rows from a table. Default 5 rows. Use this to understand actual data values and patterns.',
    schema: z.object({
      database: z.string().describe('The database name'),
      schema: z.string().describe('The schema name'),
      table: z.string().describe('The table name'),
      limit: z.number().min(1).max(10).default(5).describe('Number of rows to sample'),
    }),
    func: async ({ database, schema, table, limit }) => {
      const result = await discoveryService.getSampleData(connectionId, database, schema, table, limit, userId);
      return JSON.stringify(result);
    },
  });

  const getColumnStats = new DynamicStructuredTool({
    name: 'get_column_stats',
    description: 'Get statistical information about a column: distinct count, null count, min/max values, and sample distinct values. Useful for inferring relationships by checking value overlaps.',
    schema: z.object({
      database: z.string().describe('The database name'),
      schema: z.string().describe('The schema name'),
      table: z.string().describe('The table name'),
      column: z.string().describe('The column name'),
    }),
    func: async ({ database, schema, table, column }) => {
      const result = await discoveryService.getColumnStats(connectionId, database, schema, table, column, userId);
      return JSON.stringify(result);
    },
  });

  const runQuery = new DynamicStructuredTool({
    name: 'run_query',
    description: 'Execute a read-only SQL query against the database. Use this to validate inferred relationships, check data patterns, or verify metrics. ONLY SELECT queries are allowed - no INSERT, UPDATE, DELETE, etc. Max 100 rows returned.',
    schema: z.object({
      sql: z.string().describe('The SQL SELECT query to execute'),
    }),
    func: async ({ sql }) => {
      const result = await discoveryService.executeQuery(connectionId, sql, userId);
      return JSON.stringify(result);
    },
  });

  return [listSchemas, listTables, listColumns, getForeignKeys, getSampleData, getColumnStats, runQuery];
}
