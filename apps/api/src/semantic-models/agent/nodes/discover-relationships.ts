import { AgentStateType } from '../state';
import { DiscoveryService } from '../../../discovery/discovery.service';
import { SemanticModelsService } from '../../semantic-models.service';
import { ForeignKeyInfo } from '../../../connections/drivers/driver.interface';
import { RelationshipCandidate, OverlapEvidence } from '../types/relationship-candidate';
import { generateFKCandidates } from '../utils/naming-heuristics';
import { createConcurrencyLimiter } from '../utils/concurrency';
import { Logger } from '@nestjs/common';

const logger = new Logger('DiscoverRelationships');

/**
 * Detect audit/system columns that shouldn't count as "own" columns
 */
const AUDIT_COLUMNS = new Set([
  'id',
  'created_at',
  'updated_at',
  'created_by',
  'updated_by',
  'deleted_at',
  'deleted_by',
  'createdat',
  'updatedat',
  'createdby',
  'updatedby',
]);

/**
 * Convert explicit FK to RelationshipCandidate
 */
function explicitFKToCandidate(fk: ForeignKeyInfo): RelationshipCandidate {
  return {
    fromSchema: fk.fromSchema,
    fromTable: fk.fromTable,
    fromColumns: fk.fromColumns,
    toSchema: fk.toSchema,
    toTable: fk.toTable,
    toColumns: fk.toColumns,
    source: 'database_constraint',
    confidence: 'medium', // Will be updated after validation
    constraintName: fk.constraintName,
  };
}

/**
 * Check if a candidate is in the selected tables
 */
function isCandidateInSelectedTables(
  candidate: RelationshipCandidate,
  datasets: AgentStateType['datasets'],
): boolean {
  const fromFQN = `${candidate.fromSchema}.${candidate.fromTable}`;
  const toFQN = `${candidate.toSchema}.${candidate.toTable}`;

  const fromExists = datasets.some((ds) => {
    const source = ds.source.toLowerCase();
    return source.endsWith(fromFQN.toLowerCase()) || source === fromFQN.toLowerCase();
  });

  const toExists = datasets.some((ds) => {
    const source = ds.source.toLowerCase();
    return source.endsWith(toFQN.toLowerCase()) || source === toFQN.toLowerCase();
  });

  return fromExists && toExists;
}

/**
 * Deduplicate candidates: skip naming candidates if an explicit FK exists for the same relationship
 */
function deduplicateCandidates(
  explicitCandidates: RelationshipCandidate[],
  namingCandidates: RelationshipCandidate[],
): RelationshipCandidate[] {
  const explicitSet = new Set<string>();

  for (const c of explicitCandidates) {
    const key = `${c.fromSchema}.${c.fromTable}.${c.fromColumns[0]}→${c.toSchema}.${c.toTable}.${c.toColumns[0]}`;
    explicitSet.add(key.toLowerCase());
  }

  const dedupedNaming = namingCandidates.filter((c) => {
    const key = `${c.fromSchema}.${c.fromTable}.${c.fromColumns[0]}→${c.toSchema}.${c.toTable}.${c.toColumns[0]}`;
    return !explicitSet.has(key.toLowerCase());
  });

  return [...explicitCandidates, ...dedupedNaming];
}

/**
 * Update candidate confidence based on overlap ratio
 */
function assignConfidence(
  candidate: RelationshipCandidate,
  overlapRatio: number,
): RelationshipCandidate {
  if (candidate.source === 'database_constraint') {
    // Explicit FKs are always high confidence
    candidate.confidence = 'high';
  } else {
    // Inferred candidates based on overlap
    if (overlapRatio > 0.8) {
      candidate.confidence = 'high';
    } else if (overlapRatio >= 0.5) {
      candidate.confidence = 'medium';
    } else if (overlapRatio >= 0.2) {
      candidate.confidence = 'low';
    } else {
      candidate.confidence = 'rejected';
    }
  }

  return candidate;
}

/**
 * Determine cardinality from overlap evidence
 */
function determineCardinality(
  childDistinctCount: number,
  childSampleSize: number,
): 'one_to_one' | 'one_to_many' {
  if (childSampleSize === 0) {
    return 'one_to_many';
  }
  const ratio = childDistinctCount / childSampleSize;
  return ratio > 0.9 ? 'one_to_one' : 'one_to_many';
}

/**
 * Detect junction tables based on FK pattern
 * A junction table has:
 * - 2+ outgoing FK relationships
 * - Few "own" columns (non-FK, non-audit columns)
 */
function detectJunctionTables(
  candidates: RelationshipCandidate[],
  state: AgentStateType,
): RelationshipCandidate[] {
  const m2mCandidates: RelationshipCandidate[] = [];

  // Group candidates by fromTable
  const candidatesByTable = new Map<string, RelationshipCandidate[]>();
  for (const c of candidates) {
    const key = `${c.fromSchema}.${c.fromTable}`;
    if (!candidatesByTable.has(key)) {
      candidatesByTable.set(key, []);
    }
    candidatesByTable.get(key)!.push(c);
  }

  // Check each table with 2+ FKs
  for (const [tableFQN, tableCandidates] of candidatesByTable.entries()) {
    if (tableCandidates.length < 2) {
      continue;
    }

    // Find the dataset for this table
    const dataset = state.datasets.find((ds) => {
      const source = ds.source.toLowerCase();
      return source.endsWith(tableFQN.toLowerCase()) || source === tableFQN.toLowerCase();
    });

    if (!dataset || !dataset.fields) {
      continue;
    }

    // Count "own" columns
    const fkColumns = new Set<string>();
    for (const c of tableCandidates) {
      for (const col of c.fromColumns) {
        fkColumns.add(col.toLowerCase());
      }
    }

    const ownColumns = dataset.fields.filter((field) => {
      const name = field.name.toLowerCase();
      return !fkColumns.has(name) && !AUDIT_COLUMNS.has(name);
    });

    // If <= 3 own columns, flag as junction table
    if (ownColumns.length <= 3) {
      logger.log(`Detected potential junction table: ${tableFQN} (${ownColumns.length} own columns, ${tableCandidates.length} FKs)`);

      // Create M:N relationships for each pair of FKs
      for (let i = 0; i < tableCandidates.length; i++) {
        for (let j = i + 1; j < tableCandidates.length; j++) {
          const fk1 = tableCandidates[i];
          const fk2 = tableCandidates[j];

          // Create bidirectional M:N relationships
          m2mCandidates.push({
            fromSchema: fk1.toSchema,
            fromTable: fk1.toTable,
            fromColumns: fk1.toColumns,
            toSchema: fk2.toSchema,
            toTable: fk2.toTable,
            toColumns: fk2.toColumns,
            source: 'value_overlap',
            confidence: fk1.confidence === 'high' && fk2.confidence === 'high' ? 'high' : 'medium',
            isJunctionRelationship: true,
            junctionTable: tableFQN,
          });

          m2mCandidates.push({
            fromSchema: fk2.toSchema,
            fromTable: fk2.toTable,
            fromColumns: fk2.toColumns,
            toSchema: fk1.toSchema,
            toTable: fk1.toTable,
            toColumns: fk1.toColumns,
            source: 'value_overlap',
            confidence: fk1.confidence === 'high' && fk2.confidence === 'high' ? 'high' : 'medium',
            isJunctionRelationship: true,
            junctionTable: tableFQN,
          });
        }
      }
    }
  }

  return m2mCandidates;
}

export function createDiscoverRelationshipsNode(
  discoveryService: DiscoveryService,
  connectionId: string,
  databaseName: string,
  semanticModelsService: SemanticModelsService,
  runId: string,
  emitProgress: (event: object) => void,
) {
  return async (state: AgentStateType) => {
    emitProgress({
      type: 'step_start',
      step: 'discover_relationships',
      label: 'Analyzing Relationships',
    });

    // Phase 1: Candidate Generation
    logger.log('Phase 1: Generating relationship candidates...');

    // 1a. Convert explicit FKs to candidates (filter to only selected tables)
    const explicitCandidates = state.foreignKeys
      .map((fk) => explicitFKToCandidate(fk))
      .filter((c) => isCandidateInSelectedTables(c, state.datasets));

    logger.log(`Found ${explicitCandidates.length} explicit FK constraints in selected tables`);

    // 1b. Generate naming-based candidates
    const namingCandidates = generateFKCandidates(state.datasets, state.foreignKeys);
    logger.log(`Found ${namingCandidates.length} naming-based candidates`);

    // 1c. Deduplicate
    const allCandidates = deduplicateCandidates(explicitCandidates, namingCandidates);
    logger.log(`After deduplication: ${allCandidates.length} total candidates`);

    emitProgress({
      type: 'text',
      content: `Found ${explicitCandidates.length} explicit FK constraints and ${namingCandidates.length} naming-based candidates`,
    });

    // Phase 2: Value Overlap Validation (parallel)
    logger.log('Phase 2: Validating candidates with value overlap...');

    const concurrency = Math.min(
      Math.max(parseInt(process.env.SEMANTIC_MODEL_CONCURRENCY || '5', 10) || 5, 1),
      20,
    );
    logger.log(`Using concurrency=${concurrency} for overlap validation`);

    const limit = createConcurrencyLimiter(concurrency);

    const validationResults = await Promise.allSettled(
      allCandidates.map((candidate) =>
        limit(async () => {
          try {
            const overlapResult = await discoveryService.getColumnValueOverlap(
              connectionId,
              databaseName,
              candidate.fromSchema,
              candidate.fromTable,
              candidate.fromColumns[0],
              candidate.toSchema,
              candidate.toTable,
              candidate.toColumns[0],
            );

            return { candidate, overlap: overlapResult.data };
          } catch (error: any) {
            logger.warn(
              `Overlap validation failed for ${candidate.fromTable}.${candidate.fromColumns[0]} → ${candidate.toTable}.${candidate.toColumns[0]}: ${error.message}`,
            );
            return { candidate, overlap: null };
          }
        }),
      ),
    );

    // Update candidates with overlap evidence
    const validatedCandidates: RelationshipCandidate[] = [];

    for (const result of validationResults) {
      if (result.status === 'rejected') {
        logger.warn(`Unexpected rejection during validation: ${result.reason}`);
        continue;
      }

      const { candidate, overlap } = result.value;

      if (!overlap) {
        // Skip candidates with failed validation
        continue;
      }

      // Update confidence based on overlap
      assignConfidence(candidate, overlap.overlapRatio);

      // Filter out rejected candidates
      if (candidate.confidence === 'rejected') {
        continue;
      }

      // Set overlap evidence
      const cardinality = determineCardinality(overlap.childDistinctCount, overlap.childSampleSize);
      const overlapEvidence: OverlapEvidence = {
        overlapRatio: overlap.overlapRatio,
        childDistinctCount: overlap.childDistinctCount,
        parentDistinctCount: overlap.parentDistinctCount,
        nullRatio: overlap.nullRatio,
        childSampleSize: overlap.childSampleSize,
        cardinality,
      };
      candidate.overlap = overlapEvidence;

      validatedCandidates.push(candidate);

      // Emit progress for this candidate
      const overlapPercent = (overlap.overlapRatio * 100).toFixed(1);
      emitProgress({
        type: 'text',
        content: `Validated: ${candidate.fromTable}.${candidate.fromColumns[0]} → ${candidate.toTable}.${candidate.toColumns[0]} (overlap: ${overlapPercent}%, ${candidate.confidence} confidence)`,
      });
    }

    logger.log(`Validated ${validatedCandidates.length} candidates (${allCandidates.length - validatedCandidates.length} rejected)`);

    // Phase 3: Junction Table Detection (M:N)
    logger.log('Phase 3: Detecting many-to-many relationships...');

    const m2mCandidates = detectJunctionTables(
      validatedCandidates.filter((c) => c.confidence === 'high' || c.confidence === 'medium'),
      state,
    );

    for (const m2m of m2mCandidates) {
      emitProgress({
        type: 'text',
        content: `Detected many-to-many: ${m2m.fromTable} ↔ ${m2m.toTable} (via ${m2m.junctionTable})`,
      });
    }

    logger.log(`Detected ${m2mCandidates.length} many-to-many relationships`);

    // Phase 4: Persist & Emit Summary
    const allRelationshipCandidates = [...validatedCandidates, ...m2mCandidates];

    const highCount = allRelationshipCandidates.filter((c) => c.confidence === 'high').length;
    const mediumCount = allRelationshipCandidates.filter((c) => c.confidence === 'medium').length;
    const lowCount = allRelationshipCandidates.filter((c) => c.confidence === 'low').length;
    const m2mCount = m2mCandidates.length;

    logger.log(
      `Relationship analysis complete: ${allRelationshipCandidates.length} candidates (${highCount} high, ${mediumCount} medium, ${lowCount} low${m2mCount > 0 ? `, ${m2mCount} many-to-many` : ''})`,
    );

    // Update run progress
    await semanticModelsService
      .updateRunProgress(runId, {
        currentStep: 'discover_relationships',
        currentStepLabel: 'Analyzing Relationships',
        completedTables: state.datasets.length,
        totalTables: state.selectedTables.length,
        failedTables: state.failedTables,
        percentComplete: 75,
        tokensUsed: state.tokensUsed,
        elapsedMs: 0,
        partialModel: {
          datasets: state.datasets,
          foreignKeys: state.foreignKeys,
          tableMetrics: state.tableMetrics,
          relationships: [],
          modelMetrics: [],
        },
        tableStatus: [],
        steps: [],
      })
      .catch(() => {}); // fire-and-forget

    emitProgress({
      type: 'text',
      content: `Relationship analysis complete: ${allRelationshipCandidates.length} candidates found (${highCount} high, ${mediumCount} medium, ${lowCount} low confidence${m2mCount > 0 ? `, ${m2mCount} many-to-many` : ''})`,
    });

    emitProgress({
      type: 'step_end',
      step: 'discover_relationships',
    });

    return {
      relationshipCandidates: allRelationshipCandidates,
    };
  };
}
