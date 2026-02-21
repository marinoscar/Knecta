// ==========================================
// OSI Semantic Model TypeScript Types
// ==========================================

/**
 * Supported SQL dialects for expressions
 */
export type OSIDialect = 'ANSI_SQL' | 'SNOWFLAKE' | 'MDX' | 'TABLEAU' | 'DATABRICKS';

/**
 * Supported vendors for custom extensions
 */
export type OSIVendor = 'COMMON' | 'SNOWFLAKE' | 'SALESFORCE' | 'DBT' | 'DATABRICKS';

/**
 * A dialect-specific expression
 */
export interface OSIDialectExpression {
  dialect: OSIDialect;
  expression: string;
}

/**
 * Expression with multi-dialect support
 */
export interface OSIExpression {
  dialects: OSIDialectExpression[];
}

/**
 * Custom extension for vendor-specific metadata
 */
export interface OSICustomExtension {
  vendor_name: OSIVendor | string;
  data: string; // JSON string
}

/**
 * AI context can be a simple string or structured object
 */
export interface OSIAIContext {
  instructions?: string;
  synonyms?: string[];
  examples?: string[];
  sample_data?: unknown[];
  [key: string]: unknown; // Allow additional properties
}

export type OSIAIContextValue = string | OSIAIContext;

/**
 * Dimension metadata for a field
 */
export interface OSIDimension {
  is_time: boolean;
}

/**
 * A field within a dataset (column)
 */
export interface OSIField {
  name: string;
  expression: OSIExpression;
  dimension?: OSIDimension;
  label?: string;
  description?: string;
  ai_context?: OSIAIContextValue;
  custom_extensions?: OSICustomExtension[];
}

/**
 * A dataset (table or view)
 */
export interface OSIDataset {
  name: string;
  source: string; // e.g., "database.schema.table"
  label?: string;
  primary_key?: string[];
  unique_keys?: string[][];
  description?: string;
  ai_context?: OSIAIContextValue;
  fields?: OSIField[];
  custom_extensions?: OSICustomExtension[];
}

/**
 * A relationship between datasets (foreign key or inferred)
 */
export interface OSIRelationship {
  name: string;
  from: string; // Dataset name (many side)
  to: string; // Dataset name (one side)
  from_columns: string[];
  to_columns: string[];
  ai_context?: OSIAIContextValue;
  custom_extensions?: OSICustomExtension[];
}

/**
 * A metric (aggregate expression)
 */
export interface OSIMetric {
  name: string;
  expression: OSIExpression;
  description?: string;
  ai_context?: OSIAIContextValue;
  custom_extensions?: OSICustomExtension[];
}

/**
 * The top-level semantic model
 */
export interface OSISemanticModelDefinition {
  name: string;
  description?: string;
  ai_context?: OSIAIContextValue;
  datasets: OSIDataset[];
  relationships?: OSIRelationship[];
  metrics?: OSIMetric[];
  custom_extensions?: OSICustomExtension[];
}

/**
 * Root document structure
 */
export interface OSISemanticModel {
  semantic_model: OSISemanticModelDefinition[];
}
