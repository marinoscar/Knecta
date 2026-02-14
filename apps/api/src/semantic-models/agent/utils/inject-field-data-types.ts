import { OSIDataset, OSIAIContext } from '../osi/types';
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
