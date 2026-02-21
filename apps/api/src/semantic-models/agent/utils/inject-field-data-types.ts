import { OSIDataset, OSIRelationship, OSIAIContext } from '../osi/types';
import { ColumnInfo } from '../../../connections/drivers/driver.interface';

/**
 * Determine if a column is eligible for sample_data injection.
 * Only text/string types and enum types qualify.
 * Primary keys are excluded (IDs are not useful for sample data).
 * Values are always truncated to 25 chars downstream.
 */
export function isEligibleForSampleData(col: ColumnInfo): boolean {
  // Primary keys (auto-increment IDs, surrogate keys) are not useful
  if (col.isPrimaryKey) return false;

  const dt = col.dataType.toLowerCase();

  // Allowlist: text/string types + enum types across all providers
  const TEXT_TYPES = new Set([
    // PostgreSQL
    'character varying', 'varchar', 'text', 'character', 'char',
    // SQL Server
    'nvarchar', 'nchar', 'ntext',
    // Snowflake (all text types are aliases for VARCHAR)
    'string',
    // PostgreSQL enum types (reported as USER-DEFINED in data_type)
    'user-defined',
  ]);

  if (!TEXT_TYPES.has(dt)) return false;

  // Cap at 500 to exclude truly large text columns
  // (e.g., Snowflake default VARCHAR(16777216), SQL Server ntext 1GB)
  // maxLength == null is allowed (PG text, PG varchar without length)
  if (col.maxLength != null && col.maxLength > 500) return false;

  return true;
}

/**
 * Programmatically inject data_type and sample_data from ColumnInfo into each
 * field's ai_context. This ensures the Data Agent has accurate type information
 * for SQL generation without relying on the LLM to include it.
 * For eligible short text columns, sample_data is injected from the provided map.
 *
 * Mutates the dataset in place for efficiency.
 * Only injects if the field name matches a column name (case-insensitive).
 */
export function injectFieldDataTypes(
  dataset: OSIDataset,
  columns: ColumnInfo[],
  sampleDataMap?: Map<string, string[]>,
): void {
  if (!dataset.fields || dataset.fields.length === 0) return;

  // Build a lookup map: lowercase column name -> ColumnInfo
  const columnMap = new Map<string, ColumnInfo>();
  for (const col of columns) {
    columnMap.set(col.name.toLowerCase(), col);
  }

  for (const field of dataset.fields) {
    const col = columnMap.get(field.name.toLowerCase());
    if (!col) continue; // Field might be a calculated expression, not a direct column

    // Ensure ai_context is an object (not a string)
    if (!field.ai_context || typeof field.ai_context === 'string') {
      field.ai_context = {
        ...(typeof field.ai_context === 'string'
          ? { instructions: field.ai_context }
          : {}),
      } as OSIAIContext;
    }

    // Inject data_type and is_primary_key
    const ctx = field.ai_context as OSIAIContext;
    ctx.data_type = col.dataType;
    ctx.is_primary_key = col.isPrimaryKey;

    // Inject sample_data for eligible text columns
    if (sampleDataMap && isEligibleForSampleData(col)) {
      const raw = sampleDataMap.get(col.name.toLowerCase()) || [];
      ctx.sample_data = raw
        .map(v => String(v).substring(0, 25))
        .slice(0, 5);
    }
  }
}

/**
 * Enrich relationship ai_context with data type information for join columns.
 * This helps the Data Agent know the types when building JOIN queries.
 *
 * Builds a lookup from datasets' field ai_context (which should already have
 * data_type injected by injectFieldDataTypes) and adds column_types to each
 * relationship's ai_context.
 *
 * Mutates relationships in place.
 */
export function injectRelationshipDataTypes(
  relationships: OSIRelationship[],
  datasets: OSIDataset[],
): void {
  if (!relationships || relationships.length === 0) return;

  // Build lookup: datasetName -> fieldName -> { data_type }
  const datasetFieldTypes = new Map<string, Map<string, { data_type: string }>>();

  for (const ds of datasets) {
    const fieldMap = new Map<string, { data_type: string }>();
    if (ds.fields) {
      for (const field of ds.fields) {
        const ctx = field.ai_context as OSIAIContext | undefined;
        if (ctx && typeof ctx === 'object' && ctx.data_type) {
          fieldMap.set(field.name.toLowerCase(), {
            data_type: ctx.data_type as string,
          });
        }
      }
    }
    datasetFieldTypes.set(ds.name.toLowerCase(), fieldMap);
  }

  for (const rel of relationships) {
    const fromFields = datasetFieldTypes.get(rel.from.toLowerCase());
    const toFields = datasetFieldTypes.get(rel.to.toLowerCase());
    if (!fromFields && !toFields) continue;

    // Build column_types object
    const columnTypes: Record<string, Record<string, { data_type: string }>> = {};

    if (fromFields && rel.from_columns) {
      const fromColumnTypes: Record<string, { data_type: string }> = {};
      for (const colName of rel.from_columns) {
        const typeInfo = fromFields.get(colName.toLowerCase());
        if (typeInfo) {
          fromColumnTypes[colName] = typeInfo;
        }
      }
      if (Object.keys(fromColumnTypes).length > 0) {
        columnTypes.from_columns = fromColumnTypes;
      }
    }

    if (toFields && rel.to_columns) {
      const toColumnTypes: Record<string, { data_type: string }> = {};
      for (const colName of rel.to_columns) {
        const typeInfo = toFields.get(colName.toLowerCase());
        if (typeInfo) {
          toColumnTypes[colName] = typeInfo;
        }
      }
      if (Object.keys(toColumnTypes).length > 0) {
        columnTypes.to_columns = toColumnTypes;
      }
    }

    // Only add if we found type info
    if (Object.keys(columnTypes).length > 0) {
      // Ensure ai_context is an object
      if (!rel.ai_context || typeof rel.ai_context === 'string') {
        rel.ai_context = {
          ...(typeof rel.ai_context === 'string' ? { notes: rel.ai_context } : {}),
        } as OSIAIContext;
      }
      (rel.ai_context as OSIAIContext).column_types = columnTypes;
    }
  }
}
