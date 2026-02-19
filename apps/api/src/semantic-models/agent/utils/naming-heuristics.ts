// ==========================================
// Naming Heuristics Utility for FK Candidate Generation
// ==========================================

import { OSIDataset, OSIField, OSIAIContext } from '../osi/types';
import { ForeignKeyInfo } from '../../../connections/drivers/driver.interface';
import { RelationshipCandidate } from '../types/relationship-candidate';

// ==========================================
// Type Definitions
// ==========================================

interface TableLookupInfo {
  schema: string;
  table: string;
  pkColumns: Array<{ name: string; dataType: string }>;
  allColumns: Map<string, string>; // columnName -> dataType
}

interface FKSuffixInfo {
  prefix: string;
  suffix: string;
}

// ==========================================
// Constants
// ==========================================

/**
 * Recognized FK suffixes in order of precedence
 */
const FK_SUFFIXES = ['_id', '_code', '_key', '_ref', '_num', '_no', '_fk', 'id'] as const;

/**
 * Common abbreviations mapping to full table names
 */
const ABBREVIATIONS: Record<string, string[]> = {
  cust: ['customer', 'customers'],
  prod: ['product', 'products'],
  cat: ['category', 'categories'],
  usr: ['user', 'users'],
  org: ['organization', 'organizations', 'organisation', 'organisations'],
  dept: ['department', 'departments'],
  emp: ['employee', 'employees'],
  inv: ['invoice', 'invoices', 'inventory'],
  addr: ['address', 'addresses'],
  acct: ['account', 'accounts'],
  txn: ['transaction', 'transactions'],
  msg: ['message', 'messages'],
  doc: ['document', 'documents'],
  proj: ['project', 'projects'],
  mgr: ['manager', 'managers'],
  loc: ['location', 'locations'],
  desc: ['description', 'descriptions'],
  qty: ['quantity'],
  amt: ['amount'],
  num: ['number'],
};

/**
 * Type compatibility groups
 */
const TYPE_GROUPS = {
  integer: new Set([
    'integer',
    'int',
    'int2',
    'int4',
    'int8',
    'smallint',
    'bigint',
    'serial',
    'bigserial',
    'number',
  ]),
  uuid: new Set(['uuid', 'uniqueidentifier']),
  string: new Set([
    'varchar',
    'character varying',
    'text',
    'nvarchar',
    'char',
    'nchar',
    'character',
    'string',
  ]),
  numeric: new Set([
    'numeric',
    'decimal',
    'real',
    'float',
    'double precision',
    'float4',
    'float8',
    'money',
  ]),
};

// ==========================================
// Helper Functions
// ==========================================

/**
 * Extract FK suffix from column name
 */
export function extractFKSuffix(columnName: string): FKSuffixInfo | null {
  const lowerName = columnName.toLowerCase();

  for (const suffix of FK_SUFFIXES) {
    if (suffix === 'id') {
      // Special case: 'id' without separator, only if longer than 2 chars
      if (lowerName.endsWith('id') && lowerName.length > 2 && !lowerName.endsWith('_id')) {
        const prefix = columnName.slice(0, -2);
        return { prefix, suffix: 'id' };
      }
    } else {
      // Standard suffix with separator
      if (lowerName.endsWith(suffix)) {
        const prefix = columnName.slice(0, -(suffix.length));
        return { prefix, suffix };
      }
    }
  }

  return null;
}

/**
 * Pluralize a word using basic rules
 */
export function pluralize(word: string): string {
  const lower = word.toLowerCase();

  // Already plural
  if (lower.endsWith('s')) {
    return word;
  }

  // Ends with consonant + y → ies
  if (lower.endsWith('y') && lower.length > 1) {
    const beforeY = lower[lower.length - 2];
    if (!/[aeiou]/.test(beforeY)) {
      return word.slice(0, -1) + 'ies';
    }
  }

  // Ends with s, x, z, sh, ch → es
  if (
    lower.endsWith('s') ||
    lower.endsWith('x') ||
    lower.endsWith('z') ||
    lower.endsWith('sh') ||
    lower.endsWith('ch')
  ) {
    return word + 'es';
  }

  // Default: add s
  return word + 's';
}

/**
 * Singularize a word using basic rules
 */
export function singularize(word: string): string {
  const lower = word.toLowerCase();

  // ies → y
  if (lower.endsWith('ies') && lower.length > 3) {
    return word.slice(0, -3) + 'y';
  }

  // Remove trailing s
  if (lower.endsWith('s') && lower.length > 1) {
    return word.slice(0, -1);
  }

  return word;
}

/**
 * Match prefix to table name using exact, plural, or abbreviation matching
 */
export function matchTableName(prefix: string, tableNames: string[]): string | null {
  const lowerPrefix = prefix.toLowerCase();
  const lowerTables = tableNames.map((t) => t.toLowerCase());

  // 1. Exact match
  const exactIdx = lowerTables.indexOf(lowerPrefix);
  if (exactIdx !== -1) {
    return tableNames[exactIdx];
  }

  // 2. Plural match (pluralize prefix or singularize table)
  const pluralPrefix = pluralize(lowerPrefix);
  const pluralIdx = lowerTables.indexOf(pluralPrefix);
  if (pluralIdx !== -1) {
    return tableNames[pluralIdx];
  }

  // Try singularizing table names to match prefix
  for (let i = 0; i < lowerTables.length; i++) {
    const singularTable = singularize(lowerTables[i]);
    if (singularTable === lowerPrefix) {
      return tableNames[i];
    }
  }

  // 3. Abbreviation match
  const expansions = ABBREVIATIONS[lowerPrefix];
  if (expansions) {
    for (const expansion of expansions) {
      const abbrevIdx = lowerTables.indexOf(expansion.toLowerCase());
      if (abbrevIdx !== -1) {
        return tableNames[abbrevIdx];
      }
    }
  }

  return null;
}

/**
 * Check if two data types are compatible
 */
export function areTypesCompatible(type1: string, type2: string): boolean {
  const lower1 = type1.toLowerCase().trim();
  const lower2 = type2.toLowerCase().trim();

  // Find which group each type belongs to
  let group1: string | null = null;
  let group2: string | null = null;

  for (const [groupName, typeSet] of Object.entries(TYPE_GROUPS)) {
    if (typeSet.has(lower1)) {
      group1 = groupName;
    }
    if (typeSet.has(lower2)) {
      group2 = groupName;
    }
  }

  // Compatible if both belong to the same group
  return group1 !== null && group1 === group2;
}

/**
 * Parse source field to extract schema and table name
 */
function parseSource(source: string): { schema: string; table: string } {
  const parts = source.split('.');
  if (parts.length >= 2) {
    // Take last two parts: schema.table or database.schema.table
    const schema = parts[parts.length - 2];
    const table = parts[parts.length - 1];
    return { schema, table };
  }
  // Fallback: assume public schema
  return { schema: 'public', table: source };
}

/**
 * Get data type from field
 */
function getFieldDataType(field: OSIField): string | null {
  if (!field.ai_context) {
    return null;
  }

  if (typeof field.ai_context === 'string') {
    return null;
  }

  const context = field.ai_context as OSIAIContext;
  return (context.data_type as string) || null;
}

/**
 * Check if field is a primary key
 */
function isFieldPrimaryKey(field: OSIField): boolean {
  if (!field.ai_context) {
    return false;
  }

  if (typeof field.ai_context === 'string') {
    return false;
  }

  const context = field.ai_context as OSIAIContext;
  return context.is_primary_key === true;
}

/**
 * Build lookup indices for datasets
 */
function buildLookupIndices(datasets: OSIDataset[]): Map<string, TableLookupInfo> {
  const lookup = new Map<string, TableLookupInfo>();

  for (const dataset of datasets) {
    const { schema, table } = parseSource(dataset.source);
    const lowerTableName = table.toLowerCase();

    const pkColumns: Array<{ name: string; dataType: string }> = [];
    const allColumns = new Map<string, string>();

    if (dataset.fields) {
      for (const field of dataset.fields) {
        const dataType = getFieldDataType(field);
        if (dataType) {
          allColumns.set(field.name, dataType);

          if (isFieldPrimaryKey(field)) {
            pkColumns.push({ name: field.name, dataType });
          }
        }
      }
    }

    lookup.set(lowerTableName, {
      schema,
      table,
      pkColumns,
      allColumns,
    });
  }

  return lookup;
}

/**
 * Build set of explicit FK pairs to skip
 */
function buildExplicitFKSet(explicitFKs: ForeignKeyInfo[]): Set<string> {
  const fkSet = new Set<string>();

  for (const fk of explicitFKs) {
    for (const fromCol of fk.fromColumns) {
      const key = `${fk.fromSchema}.${fk.fromTable}.${fromCol}→${fk.toSchema}.${fk.toTable}.${fk.toColumns[0]}`;
      fkSet.add(key.toLowerCase());
    }
  }

  return fkSet;
}

/**
 * Determine target column in matched table based on suffix
 */
function determineTargetColumn(
  suffix: string,
  targetInfo: TableLookupInfo,
): { name: string; dataType: string } | null {
  // For _id or id suffix, look for PK
  if (suffix === '_id' || suffix === 'id') {
    if (targetInfo.pkColumns.length === 1) {
      return targetInfo.pkColumns[0];
    }
    return null; // Skip composite PKs
  }

  // For _code suffix, look for 'code' column
  if (suffix === '_code') {
    const codeType = targetInfo.allColumns.get('code');
    if (codeType) {
      return { name: 'code', dataType: codeType };
    }
    // Fallback to PK
    if (targetInfo.pkColumns.length === 1) {
      return targetInfo.pkColumns[0];
    }
    return null;
  }

  // For _key suffix, look for 'key' column or PK
  if (suffix === '_key') {
    const keyType = targetInfo.allColumns.get('key');
    if (keyType) {
      return { name: 'key', dataType: keyType };
    }
    if (targetInfo.pkColumns.length === 1) {
      return targetInfo.pkColumns[0];
    }
    return null;
  }

  // For other suffixes (_ref, _num, _no, _fk), use PK
  if (targetInfo.pkColumns.length === 1) {
    return targetInfo.pkColumns[0];
  }

  return null;
}

/**
 * Assign naming score based on match quality
 */
function assignNamingScore(
  matchType: 'exact' | 'plural' | 'abbreviation' | 'suffix_only',
  suffix: string,
): number {
  if (matchType === 'exact') {
    return suffix === '_id' || suffix === 'id' ? 0.9 : 0.7;
  }

  if (matchType === 'plural') {
    return suffix === '_id' || suffix === 'id' ? 0.85 : 0.7;
  }

  if (matchType === 'abbreviation') {
    return suffix === '_id' || suffix === 'id' ? 0.5 : 0.4;
  }

  // suffix_only (type-compatible but no table name match)
  return 0.3;
}

/**
 * Determine match type based on how prefix matched table name
 */
function determineMatchType(
  prefix: string,
  matchedTable: string,
  tableNames: string[],
): 'exact' | 'plural' | 'abbreviation' {
  const lowerPrefix = prefix.toLowerCase();
  const lowerTable = matchedTable.toLowerCase();

  // Exact match
  if (lowerPrefix === lowerTable) {
    return 'exact';
  }

  // Plural match
  const pluralPrefix = pluralize(lowerPrefix);
  const singularTable = singularize(lowerTable);
  if (pluralPrefix === lowerTable || singularTable === lowerPrefix) {
    return 'plural';
  }

  // Abbreviation match
  return 'abbreviation';
}

// ==========================================
// Main Function
// ==========================================

/**
 * Generate FK candidates by analyzing column naming patterns and type compatibility
 */
export function generateFKCandidates(
  datasets: OSIDataset[],
  explicitFKs: ForeignKeyInfo[],
): RelationshipCandidate[] {
  const candidates: RelationshipCandidate[] = [];

  // Step 1: Build lookup indices
  const tableLookup = buildLookupIndices(datasets);
  const explicitFKSet = buildExplicitFKSet(explicitFKs);
  const tableNames = Array.from(tableLookup.keys());

  // Step 2: For each column in each dataset
  for (const dataset of datasets) {
    const { schema: fromSchema, table: fromTable } = parseSource(dataset.source);
    const lowerFromTable = fromTable.toLowerCase();
    const fromTableInfo = tableLookup.get(lowerFromTable);

    if (!fromTableInfo || !dataset.fields) {
      continue;
    }

    for (const field of dataset.fields) {
      const columnName = field.name;
      const dataType = getFieldDataType(field);

      if (!dataType) {
        continue;
      }

      // Skip if column is a PK of its own table
      if (isFieldPrimaryKey(field)) {
        continue;
      }

      // Extract FK suffix
      const suffixInfo = extractFKSuffix(columnName);
      if (!suffixInfo) {
        continue;
      }

      const { prefix, suffix } = suffixInfo;

      // Step 3: Match prefix to table names
      const matchedTable = matchTableName(prefix, tableNames);

      if (matchedTable) {
        const toTableInfo = tableLookup.get(matchedTable.toLowerCase());
        if (!toTableInfo) {
          continue;
        }

        const { schema: toSchema, table: toTable } = toTableInfo;

        // Don't match a table to itself
        if (fromSchema === toSchema && fromTable === toTable) {
          continue;
        }

        // Check if already an explicit FK
        const fkKey = `${fromSchema}.${fromTable}.${columnName}→${toSchema}.${toTable}`;
        if (
          Array.from(explicitFKSet).some((key) =>
            key.toLowerCase().startsWith(fkKey.toLowerCase()),
          )
        ) {
          continue;
        }

        // Step 4: Determine target column
        const targetColumn = determineTargetColumn(suffix, toTableInfo);
        if (!targetColumn) {
          continue;
        }

        // Step 5: Type compatibility check
        if (!areTypesCompatible(dataType, targetColumn.dataType)) {
          continue;
        }

        // Step 6: Assign naming score
        const matchType = determineMatchType(prefix, matchedTable, tableNames);
        const namingScore = assignNamingScore(matchType, suffix);

        // Step 7: Create candidate
        candidates.push({
          fromSchema,
          fromTable,
          fromColumns: [columnName],
          toSchema,
          toTable,
          toColumns: [targetColumn.name],
          source: 'naming_pattern',
          confidence: 'medium', // Will be updated after overlap validation
          namingScore,
        });
      } else {
        // No table name match, but has FK suffix — check if type-compatible with any PK
        for (const [targetTableName, targetInfo] of tableLookup.entries()) {
          const { schema: toSchema, table: toTable } = targetInfo;

          // Don't match a table to itself
          if (fromSchema === toSchema && fromTable === toTable) {
            continue;
          }

          // Check if already an explicit FK
          const fkKey = `${fromSchema}.${fromTable}.${columnName}→${toSchema}.${toTable}`;
          if (
            Array.from(explicitFKSet).some((key) =>
              key.toLowerCase().startsWith(fkKey.toLowerCase()),
            )
          ) {
            continue;
          }

          // Try to match with PK
          if (targetInfo.pkColumns.length === 1) {
            const pkColumn = targetInfo.pkColumns[0];
            if (areTypesCompatible(dataType, pkColumn.dataType)) {
              candidates.push({
                fromSchema,
                fromTable,
                fromColumns: [columnName],
                toSchema,
                toTable,
                toColumns: [pkColumn.name],
                source: 'naming_pattern',
                confidence: 'medium',
                namingScore: 0.3, // Low score: FK suffix + type-compatible but no name match
              });
            }
          }
        }
      }
    }
  }

  return candidates;
}
