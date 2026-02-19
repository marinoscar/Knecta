// ==========================================
// Relationship Candidate Types
// ==========================================

/**
 * Source of a relationship candidate.
 */
export type CandidateSource =
  | 'database_constraint'    // explicit FK from database catalog
  | 'naming_pattern'         // column name matches table+PK naming pattern
  | 'value_overlap';         // type-compatible with PK + confirmed by value overlap

/**
 * Confidence level assigned after overlap validation.
 */
export type CandidateConfidence = 'high' | 'medium' | 'low' | 'rejected';

/**
 * Evidence from value overlap analysis between two columns.
 */
export interface OverlapEvidence {
  /** Ratio of child values found in parent (0-1) */
  overlapRatio: number;
  /** Number of distinct non-null values in child column (sample) */
  childDistinctCount: number;
  /** Number of distinct non-null values in parent column (sample) */
  parentDistinctCount: number;
  /** Ratio of null values in child column (0-1) */
  nullRatio: number;
  /** Sample size used for analysis */
  childSampleSize: number;
  /** Inferred cardinality based on distinct count vs total rows */
  cardinality: 'one_to_one' | 'one_to_many';
}

/**
 * A candidate relationship discovered programmatically.
 * Candidates are generated via naming heuristics + type matching,
 * then validated with value overlap queries.
 */
export interface RelationshipCandidate {
  /** Schema of the child table (many side) */
  fromSchema: string;
  /** Name of the child table */
  fromTable: string;
  /** FK column(s) in the child table */
  fromColumns: string[];
  /** Schema of the parent table (one side) */
  toSchema: string;
  /** Name of the parent table */
  toTable: string;
  /** Referenced column(s) in the parent table */
  toColumns: string[];
  /** How this candidate was discovered */
  source: CandidateSource;
  /** Confidence level after overlap validation */
  confidence: CandidateConfidence;
  /** Naming heuristic score (0-1), higher = better name match */
  namingScore?: number;
  /** Value overlap evidence (populated after validation) */
  overlap?: OverlapEvidence;
  /** FK constraint name (for explicit FK candidates) */
  constraintName?: string;
  /** Whether this represents a many-to-many relationship via junction table */
  isJunctionRelationship?: boolean;
  /** Fully qualified junction table name (schema.table) for M:N relationships */
  junctionTable?: string;
}
