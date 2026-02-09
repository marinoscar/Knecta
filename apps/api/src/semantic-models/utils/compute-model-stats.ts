export interface ModelStats {
  tableCount: number;
  fieldCount: number;
  relationshipCount: number;
  metricCount: number;
}

export function computeModelStats(model: Record<string, unknown>): ModelStats {
  const modelDef = (model as any)?.semantic_model?.[0];
  const datasets = modelDef?.datasets || [];
  const relationships = modelDef?.relationships || [];
  const metrics = modelDef?.metrics || [];

  let fieldCount = 0;
  for (const ds of datasets) {
    fieldCount += (ds.fields || []).length;
  }

  return {
    tableCount: datasets.length,
    fieldCount,
    relationshipCount: relationships.length,
    metricCount: metrics.length,
  };
}
