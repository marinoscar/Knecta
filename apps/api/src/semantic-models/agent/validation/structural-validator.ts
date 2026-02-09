import { OSISemanticModel, OSISemanticModelDefinition, OSIDataset, OSIField, OSIRelationship, OSIMetric } from '../osi/types';

export interface ValidationResult {
  isValid: boolean;
  fatalIssues: string[];    // Issues that can't be auto-fixed
  fixedIssues: string[];    // Issues that were auto-fixed
  warnings: string[];       // Non-blocking quality warnings
}

/**
 * Validate and auto-fix an OSI semantic model structure.
 * Mutates the model in-place for auto-fixable issues.
 */
export function validateAndFixModel(model: Record<string, unknown>): ValidationResult {
  const fatalIssues: string[] = [];
  const fixedIssues: string[] = [];
  const warnings: string[] = [];

  // 1. Root structure
  const semanticModel = model as any;
  if (!semanticModel.semantic_model || !Array.isArray(semanticModel.semantic_model) || semanticModel.semantic_model.length === 0) {
    fatalIssues.push('Root must have "semantic_model" array with at least one definition');
    return { isValid: false, fatalIssues, fixedIssues, warnings };
  }

  const definition = semanticModel.semantic_model[0];

  // 2. Model name
  if (!definition.name || typeof definition.name !== 'string') {
    fatalIssues.push('Model definition must have a "name" string');
  }

  // 3. Datasets
  if (!definition.datasets || !Array.isArray(definition.datasets) || definition.datasets.length === 0) {
    fatalIssues.push('Model definition must have a non-empty "datasets" array');
    return { isValid: fatalIssues.length === 0, fatalIssues, fixedIssues, warnings };
  }

  // 4. Model-level ai_context
  if (!definition.ai_context) {
    definition.ai_context = { synonyms: [], instructions: '' };
    fixedIssues.push('Added missing model-level ai_context');
  } else if (typeof definition.ai_context === 'object') {
    if (!definition.ai_context.synonyms || !Array.isArray(definition.ai_context.synonyms)) {
      definition.ai_context.synonyms = [];
      fixedIssues.push('Added missing model-level ai_context.synonyms array');
    }
  }

  // 5. Validate each dataset
  const datasetNames = new Set<string>();
  for (let i = 0; i < definition.datasets.length; i++) {
    const ds = definition.datasets[i];
    const dsLabel = `Dataset[${i}]${ds.name ? ` "${ds.name}"` : ''}`;

    // Name
    if (!ds.name || typeof ds.name !== 'string') {
      fatalIssues.push(`${dsLabel}: missing "name"`);
      continue;
    }
    datasetNames.add(ds.name);

    // Source
    if (!ds.source || typeof ds.source !== 'string') {
      fatalIssues.push(`${dsLabel}: missing "source"`);
    }

    // Fields
    if (!ds.fields || !Array.isArray(ds.fields) || ds.fields.length === 0) {
      fatalIssues.push(`${dsLabel}: must have a non-empty "fields" array`);
      continue;
    }

    // Dataset ai_context
    if (!ds.ai_context) {
      ds.ai_context = { synonyms: [] };
      fixedIssues.push(`${dsLabel}: added missing ai_context`);
    } else if (typeof ds.ai_context === 'object' && !Array.isArray(ds.ai_context)) {
      if (!(ds.ai_context as any).synonyms || !Array.isArray((ds.ai_context as any).synonyms)) {
        (ds.ai_context as any).synonyms = [];
        fixedIssues.push(`${dsLabel}: added missing ai_context.synonyms`);
      }
    }

    // 6. Validate each field
    for (let j = 0; j < ds.fields.length; j++) {
      const field = ds.fields[j];
      const fieldLabel = `${dsLabel}.fields[${j}]${field.name ? ` "${field.name}"` : ''}`;

      if (!field.name || typeof field.name !== 'string') {
        fatalIssues.push(`${fieldLabel}: missing "name"`);
        continue;
      }

      // Expression
      if (!field.expression) {
        // Auto-fix: create expression from field name
        field.expression = { dialects: [{ dialect: 'ANSI_SQL', expression: field.name }] };
        fixedIssues.push(`${fieldLabel}: auto-created expression from field name`);
      } else if (!field.expression.dialects || !Array.isArray(field.expression.dialects) || field.expression.dialects.length === 0) {
        field.expression = { dialects: [{ dialect: 'ANSI_SQL', expression: field.name }] };
        fixedIssues.push(`${fieldLabel}: auto-fixed empty expression dialects`);
      } else {
        // Validate dialect values
        const validDialects = new Set(['ANSI_SQL', 'SNOWFLAKE', 'MDX', 'TABLEAU', 'DATABRICKS']);
        for (const de of field.expression.dialects) {
          if (!validDialects.has(de.dialect)) {
            warnings.push(`${fieldLabel}: unrecognized dialect "${de.dialect}"`);
          }
          if (!de.expression || typeof de.expression !== 'string') {
            fatalIssues.push(`${fieldLabel}: dialect entry missing "expression" string`);
          }
        }
      }

      // Field ai_context
      if (!field.ai_context) {
        field.ai_context = { synonyms: [] };
        fixedIssues.push(`${fieldLabel}: added missing ai_context`);
      } else if (typeof field.ai_context === 'object' && !Array.isArray(field.ai_context)) {
        if (!(field.ai_context as any).synonyms || !Array.isArray((field.ai_context as any).synonyms)) {
          (field.ai_context as any).synonyms = [];
          fixedIssues.push(`${fieldLabel}: added missing ai_context.synonyms`);
        }
      }
    }
  }

  // 7. Validate relationships
  if (definition.relationships && Array.isArray(definition.relationships)) {
    for (let i = 0; i < definition.relationships.length; i++) {
      const rel = definition.relationships[i];
      const relLabel = `Relationship[${i}]${rel.name ? ` "${rel.name}"` : ''}`;

      if (!rel.name || typeof rel.name !== 'string') {
        fatalIssues.push(`${relLabel}: missing "name"`);
      }
      if (!rel.from || typeof rel.from !== 'string') {
        fatalIssues.push(`${relLabel}: missing "from" dataset name`);
      } else if (!datasetNames.has(rel.from)) {
        warnings.push(`${relLabel}: "from" references non-existent dataset "${rel.from}"`);
      }
      if (!rel.to || typeof rel.to !== 'string') {
        fatalIssues.push(`${relLabel}: missing "to" dataset name`);
      } else if (!datasetNames.has(rel.to)) {
        warnings.push(`${relLabel}: "to" references non-existent dataset "${rel.to}"`);
      }
      if (!rel.from_columns || !Array.isArray(rel.from_columns) || rel.from_columns.length === 0) {
        fatalIssues.push(`${relLabel}: missing or empty "from_columns"`);
      }
      if (!rel.to_columns || !Array.isArray(rel.to_columns) || rel.to_columns.length === 0) {
        fatalIssues.push(`${relLabel}: missing or empty "to_columns"`);
      }
      if (rel.from_columns && rel.to_columns && rel.from_columns.length !== rel.to_columns.length) {
        fatalIssues.push(`${relLabel}: "from_columns" (${rel.from_columns.length}) and "to_columns" (${rel.to_columns.length}) must have equal length`);
      }
    }
  }

  // 8. Validate metrics
  if (definition.metrics && Array.isArray(definition.metrics)) {
    for (let i = 0; i < definition.metrics.length; i++) {
      const metric = definition.metrics[i];
      const metricLabel = `Metric[${i}]${metric.name ? ` "${metric.name}"` : ''}`;

      if (!metric.name || typeof metric.name !== 'string') {
        fatalIssues.push(`${metricLabel}: missing "name"`);
      }
      if (!metric.expression) {
        fatalIssues.push(`${metricLabel}: missing "expression"`);
      } else if (!metric.expression.dialects || !Array.isArray(metric.expression.dialects) || metric.expression.dialects.length === 0) {
        fatalIssues.push(`${metricLabel}: expression must have non-empty "dialects" array`);
      }
    }
  }

  return {
    isValid: fatalIssues.length === 0,
    fatalIssues,
    fixedIssues,
    warnings,
  };
}
