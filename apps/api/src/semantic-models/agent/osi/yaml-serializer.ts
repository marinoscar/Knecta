import * as yaml from 'js-yaml';
import type { OSISemanticModel } from './types';

/**
 * Convert an OSI semantic model JSON to YAML string
 */
export function toYaml(model: OSISemanticModel): string {
  return yaml.dump(model, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
    quotingType: '"',
    forceQuotes: false,
  });
}

/**
 * Parse an OSI semantic model YAML string to JSON
 */
export function fromYaml(yamlString: string): OSISemanticModel {
  const parsed = yaml.load(yamlString);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid OSI YAML: must be a non-null object');
  }
  return parsed as OSISemanticModel;
}

/**
 * Validate that a JSON object has the basic structure of an OSI semantic model
 */
export function validateModel(model: unknown): model is OSISemanticModel {
  if (!model || typeof model !== 'object') return false;
  const m = model as Record<string, unknown>;
  if (!Array.isArray(m.semantic_model)) return false;
  if (m.semantic_model.length === 0) return false;
  const def = m.semantic_model[0] as Record<string, unknown>;
  if (typeof def.name !== 'string') return false;
  if (!Array.isArray(def.datasets)) return false;
  return true;
}
