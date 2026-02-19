import { RelationshipCandidate } from '../types/relationship-candidate';

export interface GenerateRelationshipsPromptParams {
  modelName: string;
  databaseName: string;
  datasetSummaries: Array<{
    name: string;
    source: string;
    primaryKey: string[];
    columns: string[];
  }>;
  relationshipCandidates: RelationshipCandidate[];
  instructions?: string;
  osiSpecText?: string;
}

/**
 * Format a single candidate for the prompt
 */
function formatCandidate(c: RelationshipCandidate, index: number): string {
  const overlapInfo = c.overlap
    ? `Overlap: ${(c.overlap.overlapRatio * 100).toFixed(1)}% (${c.overlap.childDistinctCount} of ${c.overlap.childSampleSize} child values found in parent), Cardinality: ${c.overlap.cardinality}${c.overlap.nullRatio > 0.1 ? `, Null ratio: ${(c.overlap.nullRatio * 100).toFixed(1)}%` : ''}`
    : 'No overlap data';

  let source = '';
  if (c.source === 'database_constraint') {
    source = `Source: explicit FK constraint (${c.constraintName || 'unnamed'})`;
  } else if (c.source === 'naming_pattern') {
    source = `Source: naming pattern match (score: ${c.namingScore?.toFixed(2) || 'N/A'})`;
  } else {
    source = `Source: value overlap analysis`;
  }

  return `${index + 1}. ${c.fromTable}.${c.fromColumns.join(',')} → ${c.toTable}.${c.toColumns.join(',')}
   ${source}
   ${overlapInfo}`;
}

/**
 * Format M:N candidate for the prompt
 */
function formatM2NCandidate(c: RelationshipCandidate, index: number): string {
  return `${index + 1}. ${c.fromTable} ↔ ${c.toTable} (via junction table: ${c.junctionTable})
   Confidence: ${c.confidence}`;
}

export function buildGenerateRelationshipsPrompt(params: GenerateRelationshipsPromptParams): string {
  const highCandidates = params.relationshipCandidates.filter(
    c => c.confidence === 'high' && !c.isJunctionRelationship,
  );
  const mediumCandidates = params.relationshipCandidates.filter(
    c => c.confidence === 'medium' && !c.isJunctionRelationship,
  );
  const lowCandidates = params.relationshipCandidates.filter(
    c => c.confidence === 'low' && !c.isJunctionRelationship,
  );
  const m2mCandidates = params.relationshipCandidates.filter(
    c => c.isJunctionRelationship,
  );

  const candidatesSection = [
    highCandidates.length > 0
      ? `### High Confidence (overlap > 80%):\n${highCandidates.map((c, i) => formatCandidate(c, i)).join('\n\n')}`
      : null,
    mediumCandidates.length > 0
      ? `### Medium Confidence (overlap 50-80%):\n${mediumCandidates.map((c, i) => formatCandidate(c, i)).join('\n\n')}`
      : null,
    lowCandidates.length > 0
      ? `### Low Confidence (overlap 20-50%):\n${lowCandidates.map((c, i) => formatCandidate(c, i)).join('\n\n')}`
      : null,
    m2mCandidates.length > 0
      ? `### Many-to-Many (junction table detected):\n${m2mCandidates.map((c, i) => formatM2NCandidate(c, i)).join('\n\n')}`
      : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  return `You are finalizing an OSI semantic model by reviewing validated relationship candidates and generating model-level metadata.
${params.osiSpecText ? `
## OSI Specification Reference

Follow this specification EXACTLY for structure and field naming:

${params.osiSpecText}
` : ''}
## Model: ${params.modelName}
Database: ${params.databaseName}

## Datasets in the model
${JSON.stringify(params.datasetSummaries, null, 2)}

## Validated Relationship Candidates

The following relationship candidates were discovered programmatically through database constraint analysis, column naming pattern matching, and value overlap validation. Each candidate has been validated by querying actual data for overlap between the candidate FK column and the referenced PK column.

${candidatesSection || 'No relationship candidates found.'}

${params.instructions ? `## Business Context\n${params.instructions}\n` : ''}
## Your Task

### 1. relationships (Array)
Review each candidate above and decide whether to ACCEPT or REJECT it:
- **High confidence candidates**: ACCEPT unless you see a clear semantic reason to reject (e.g., coincidental type overlap, polymorphic FK referencing multiple tables)
- **Medium confidence candidates**: Use your semantic understanding to decide — the data overlap suggests a relationship exists but naming is less clear
- **Low confidence candidates**: Be skeptical — only accept if the relationship makes clear business sense
- **Many-to-many candidates**: Confirm or reject the junction table interpretation

For each ACCEPTED relationship, provide:
  - **name**: Descriptive name (e.g., "order_customer" or "fk_orders_customer_id")
  - **from**: The dataset name containing the foreign key column (many side)
  - **to**: The dataset name being referenced (one side)
  - **from_columns**: Array of FK column names
  - **to_columns**: Array of referenced column names
  - **ai_context**: Include:
    - "source": the discovery source ("database_constraint", "naming_pattern", or "value_overlap")
    - "confidence": the confidence level
    - "overlap_ratio": the overlap percentage (if available)
    - For inferred relationships: "notes" explaining why this relationship exists
    - For M:N relationships: "junction_table" with the junction table name, and "relationship_type": "many_to_many"

You may also suggest additional relationships if you see patterns the programmatic analysis may have missed, but prioritize the validated candidates.

### 2. model_metrics (Array)
- Generate cross-table aggregate metrics that make business sense
- Only create metrics that span multiple datasets
- Examples: total count of records, average values, ratios
- Each metric needs: name, expression (ANSI_SQL dialect), description, ai_context with synonyms
- **CRITICAL**: Metric expressions MUST use fully qualified column names in the format \`schema.table.column\`. Reference the \`source\` field of each dataset (minus the database prefix) for the correct qualification. Example: \`SUM(public.orders.total_amount)\` NOT \`SUM(total_amount)\`
- If no cross-table metrics make sense, return an empty array

### 3. model_ai_context (Object)
- **instructions**: Brief description of what this semantic model represents and how to use it
- **synonyms**: At least 5 domain-related terms for this database/model

Output ONLY a valid JSON object:
{
  "relationships": [...],
  "model_metrics": [...],
  "model_ai_context": { "instructions": "...", "synonyms": [...] }
}

Do not include any text before or after the JSON. Do not wrap in markdown code blocks.`;
}
