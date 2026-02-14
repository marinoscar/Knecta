import { OSIDataset, OSIRelationship, OSIAIContext } from '../osi/types';
import { ColumnInfo } from '../../../connections/drivers/driver.interface';

/**
 * Programmatically inject data_type and native_type from ColumnInfo into each
 * field's ai_context. This ensures the Data Agent has accurate type information
 * for SQL generation without relying on the LLM to include it.
 *
 * Mutates the dataset in place for efficiency.
 * Only injects if the field name matches a column name (case-insensitive).
 */
export function injectFieldDataTypes(
  dataset: OSIDataset,
  columns: ColumnInfo[],
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

    // Inject data_type and native_type
    const ctx = field.ai_context as OSIAIContext;
    ctx.data_type = col.dataType;
    ctx.native_type = col.nativeType;
    ctx.is_nullable = col.isNullable;
    ctx.is_primary_key = col.isPrimaryKey;
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

  // Build lookup: datasetName -> fieldName -> { data_type, native_type }
  const datasetFieldTypes = new Map<string, Map<string, { data_type: string; native_type: string }>>();

  for (const ds of datasets) {
    const fieldMap = new Map<string, { data_type: string; native_type: string }>();
    if (ds.fields) {
      for (const field of ds.fields) {
        const ctx = field.ai_context as OSIAIContext | undefined;
        if (ctx && typeof ctx === 'object' && ctx.data_type) {
          fieldMap.set(field.name.toLowerCase(), {
            data_type: ctx.data_type as string,
            native_type: (ctx.native_type as string) || '',
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
    const columnTypes: Record<string, Record<string, { data_type: string; native_type: string }>> = {};

    if (fromFields && rel.from_columns) {
      const fromColumnTypes: Record<string, { data_type: string; native_type: string }> = {};
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
      const toColumnTypes: Record<string, { data_type: string; native_type: string }> = {};
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
