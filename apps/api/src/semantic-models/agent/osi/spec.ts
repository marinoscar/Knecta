/**
 * OSI (Open Semantic Interchange) Core Specification
 * Bundled as a static constant for use by agent tools and validation.
 * Source: https://github.com/open-semantic-interchange/OSI/blob/main/core-spec/spec.yaml
 */
export const OSI_SPEC_TEXT = `# OSI Semantic Model Core Specification

## Root Structure
The document root must contain a "semantic_model" key with an array of model definitions.

\`\`\`
semantic_model:         # REQUIRED - Array of semantic model definitions
  - name: string        # REQUIRED - Unique model name
    description: string # Optional - Model description
    ai_context: string  # Optional - String or object with {instructions, synonyms, examples, sample_data}
    datasets: [...]     # REQUIRED - Array of dataset definitions
    relationships: [...] # Optional - Array of relationship definitions
    metrics: [...]      # Optional - Array of metric definitions
    custom_extensions: [...] # Optional - Array of vendor extensions
\`\`\`

## Dataset Definition
Each dataset represents a table or view in the database.

\`\`\`
datasets:
  - name: string         # REQUIRED - Unique dataset name
    source: string       # REQUIRED - Fully qualified reference (e.g., "database.schema.table")
    primary_key: string[] # Optional - Column names forming the primary key
    unique_keys: string[][] # Optional - Arrays of column names forming unique constraints
    description: string  # Optional - Human-readable description
    ai_context: string   # Optional - String or object with {synonyms, sample_data, notes, instructions}
    fields: [...]        # REQUIRED - Array of field definitions
    custom_extensions: [...] # Optional - Array of vendor extensions
\`\`\`

## Field Definition
Each field represents a column or calculated expression.

\`\`\`
fields:
  - name: string         # REQUIRED - Column or calculated field name
    expression:          # REQUIRED - Expression definition
      dialects:          # REQUIRED - Array of dialect-specific expressions
        - dialect: string  # REQUIRED - One of: ANSI_SQL, SNOWFLAKE, MDX, TABLEAU, DATABRICKS
          expression: string # REQUIRED - The SQL or dialect-specific expression
    dimension:           # Optional - Dimension metadata
      is_time: boolean   # Optional - Whether this is a time dimension
    label: string        # Optional - Human-friendly display label
    description: string  # Optional - Human-readable description
    ai_context: string   # Optional - String or object with {synonyms, instructions}
    custom_extensions: [...] # Optional - Array of vendor extensions
\`\`\`

## Relationship Definition
Defines foreign key or inferred relationships between datasets.

\`\`\`
relationships:
  - name: string         # REQUIRED - Descriptive relationship name
    from: string         # REQUIRED - Source dataset name (many/FK side)
    to: string           # REQUIRED - Target dataset name (one/PK side)
    from_columns: string[] # REQUIRED - Column names in the source dataset
    to_columns: string[] # REQUIRED - Column names in the target dataset
    ai_context: string   # Optional - Confidence notes for inferred relationships
    custom_extensions: [...] # Optional - Array of vendor extensions
\`\`\`

## Metric Definition
Aggregate expressions for analytics.

\`\`\`
metrics:
  - name: string         # REQUIRED - Metric name
    expression:          # REQUIRED - Expression definition
      dialects:          # REQUIRED - Array of dialect-specific expressions
        - dialect: string  # REQUIRED - Dialect enum value
          expression: string # REQUIRED - Aggregate SQL expression
    description: string  # Optional - Human-readable description
    ai_context: string   # Optional - String or object
    custom_extensions: [...] # Optional - Array of vendor extensions
\`\`\`

## Custom Extension
Vendor-specific metadata.

\`\`\`
custom_extensions:
  - vendor_name: string  # REQUIRED - One of: COMMON, SNOWFLAKE, SALESFORCE, DBT, DATABRICKS (or custom)
    data: string         # REQUIRED - JSON-encoded vendor-specific data
\`\`\`

## Validation Rules
1. Root must have "semantic_model" as an array with at least one definition
2. Every model definition MUST have "name" (string) and "datasets" (non-empty array)
3. Every dataset MUST have "name", "source", and "fields" (non-empty array)
4. Every field MUST have "name" and "expression" with at least one dialect entry
5. Every dialect entry MUST have "dialect" (valid enum) and "expression" (string)
6. Every relationship MUST have "name", "from", "to", "from_columns", "to_columns"
7. Relationship "from" and "to" MUST reference existing dataset names
8. "from_columns" and "to_columns" arrays MUST have the same length
9. Every metric MUST have "name" and "expression" with at least one dialect entry
10. vendor_name in custom_extensions SHOULD be one of the defined enum values

## ai_context Best Practices
- ai_context can be a simple string or a structured object
- When structured, include "synonyms" (array of alternative terms), "instructions" (usage notes)
- Dataset ai_context should include "sample_data" (representative rows) and "notes"
- Field ai_context should include "synonyms" for discoverability
- Model-level ai_context should describe the overall domain and include domain synonyms
`;
