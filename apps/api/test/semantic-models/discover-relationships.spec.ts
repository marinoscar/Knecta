// ==========================================
// Unit Tests for discover_relationships Node
// ==========================================

import { createDiscoverRelationshipsNode } from '../../src/semantic-models/agent/nodes/discover-relationships';
import { AgentStateType } from '../../src/semantic-models/agent/state';
import { OSIDataset, OSIField } from '../../src/semantic-models/agent/osi/types';
import { ForeignKeyInfo, ColumnValueOverlapResult } from '../../src/connections/drivers/driver.interface';
import { DiscoveryService } from '../../src/discovery/discovery.service';
import { SemanticModelsService } from '../../src/semantic-models/semantic-models.service';
import { RelationshipCandidate } from '../../src/semantic-models/agent/types/relationship-candidate';

describe('discover_relationships node', () => {
  let mockDiscoveryService: jest.Mocked<DiscoveryService>;
  let mockSemanticModelsService: jest.Mocked<SemanticModelsService>;
  let emitProgress: jest.Mock;
  let state: AgentStateType;

  // Set concurrency to 1 for predictable test execution
  const originalEnv = process.env.SEMANTIC_MODEL_CONCURRENCY;

  beforeAll(() => {
    process.env.SEMANTIC_MODEL_CONCURRENCY = '1';
  });

  afterAll(() => {
    if (originalEnv !== undefined) {
      process.env.SEMANTIC_MODEL_CONCURRENCY = originalEnv;
    } else {
      delete process.env.SEMANTIC_MODEL_CONCURRENCY;
    }
  });

  beforeEach(() => {
    mockDiscoveryService = {
      getColumnValueOverlap: jest.fn(),
    } as any;

    mockSemanticModelsService = {
      updateRunProgress: jest.fn().mockResolvedValue(undefined),
    } as any;

    emitProgress = jest.fn();

    // Base state template
    state = {
      connectionId: 'conn-1',
      userId: 'user-1',
      databaseName: 'testdb',
      selectedSchemas: ['public'],
      selectedTables: ['public.customers', 'public.orders'],
      runId: 'run-1',
      modelName: 'Test Model',
      instructions: null,
      osiSpecText: '',
      datasets: [],
      foreignKeys: [],
      tableMetrics: [],
      failedTables: [],
      relationshipCandidates: [],
      relationships: [],
      modelMetrics: [],
      modelAiContext: null,
      semanticModel: null,
      tokensUsed: { prompt: 0, completion: 0, total: 0 },
      semanticModelId: null,
      error: null,
    };
  });

  // ==========================================
  // Helper: Create OSIDataset
  // ==========================================

  function createDataset(
    name: string,
    schema: string,
    table: string,
    fields: Array<{ name: string; dataType: string; isPK?: boolean }>,
  ): OSIDataset {
    return {
      name,
      source: `${schema}.${table}`,
      fields: fields.map((f) => ({
        name: f.name,
        expression: { dialects: [] },
        ai_context: {
          data_type: f.dataType,
          is_primary_key: f.isPK || false,
        },
      })),
    };
  }

  // ==========================================
  // Helper: Create FK
  // ==========================================

  function createFK(
    fromSchema: string,
    fromTable: string,
    fromColumn: string,
    toSchema: string,
    toTable: string,
    toColumn: string,
    constraintName: string = 'fk_test',
  ): ForeignKeyInfo {
    return {
      constraintName,
      fromSchema,
      fromTable,
      fromColumns: [fromColumn],
      toSchema,
      toTable,
      toColumns: [toColumn],
    };
  }

  // ==========================================
  // Helper: Create overlap result
  // ==========================================

  function createOverlapResult(
    overlapRatio: number,
    childDistinctCount: number = 1000,
    childSampleSize: number = 1000,
    parentDistinctCount: number = 500,
    nullRatio: number = 0.01,
  ): ColumnValueOverlapResult {
    return {
      childDistinctCount,
      childNullCount: Math.floor(childSampleSize * nullRatio),
      childSampleSize,
      parentDistinctCount,
      overlapCount: Math.floor(childDistinctCount * overlapRatio),
      overlapRatio,
      nullRatio,
    };
  }

  // ==========================================
  // Phase 1: Candidate Generation
  // ==========================================

  describe('Phase 1: Candidate Generation', () => {
    it('should convert explicit FKs to candidates', async () => {
      state.datasets = [
        createDataset('customers', 'public', 'customers', [
          { name: 'id', dataType: 'integer', isPK: true },
        ]),
        createDataset('orders', 'public', 'orders', [
          { name: 'id', dataType: 'integer', isPK: true },
          { name: 'customer_id', dataType: 'integer' },
        ]),
      ];

      state.foreignKeys = [
        createFK('public', 'orders', 'customer_id', 'public', 'customers', 'id', 'fk_orders_customer'),
      ];

      mockDiscoveryService.getColumnValueOverlap.mockResolvedValue({
        data: createOverlapResult(0.95),
      } as any);

      const node = createDiscoverRelationshipsNode(
        mockDiscoveryService,
        'conn-1',
        'testdb',
        mockSemanticModelsService,
        'run-1',
        emitProgress,
      );

      const result = await node(state);

      expect(result.relationshipCandidates).toHaveLength(1);
      expect(result.relationshipCandidates![0]).toMatchObject({
        fromSchema: 'public',
        fromTable: 'orders',
        fromColumns: ['customer_id'],
        toSchema: 'public',
        toTable: 'customers',
        toColumns: ['id'],
        source: 'database_constraint',
        confidence: 'high', // Explicit FKs are always high confidence
        constraintName: 'fk_orders_customer',
      });
    });

    it('should generate naming pattern candidates', async () => {
      state.datasets = [
        createDataset('customers', 'public', 'customers', [
          { name: 'id', dataType: 'integer', isPK: true },
        ]),
        createDataset('orders', 'public', 'orders', [
          { name: 'id', dataType: 'integer', isPK: true },
          { name: 'customer_id', dataType: 'integer' },
        ]),
      ];

      state.foreignKeys = []; // No explicit FKs

      mockDiscoveryService.getColumnValueOverlap.mockResolvedValue({
        data: createOverlapResult(0.85),
      } as any);

      const node = createDiscoverRelationshipsNode(
        mockDiscoveryService,
        'conn-1',
        'testdb',
        mockSemanticModelsService,
        'run-1',
        emitProgress,
      );

      const result = await node(state);

      expect(result.relationshipCandidates).toHaveLength(1);
      expect(result.relationshipCandidates![0]).toMatchObject({
        fromSchema: 'public',
        fromTable: 'orders',
        fromColumns: ['customer_id'],
        toSchema: 'public',
        toTable: 'customers',
        toColumns: ['id'],
        source: 'naming_pattern',
      });
    });

    it('should deduplicate explicit FK and naming pattern candidates', async () => {
      state.datasets = [
        createDataset('customers', 'public', 'customers', [
          { name: 'id', dataType: 'integer', isPK: true },
        ]),
        createDataset('orders', 'public', 'orders', [
          { name: 'id', dataType: 'integer', isPK: true },
          { name: 'customer_id', dataType: 'integer' },
        ]),
      ];

      // Explicit FK exists for the same relationship that naming heuristics would find
      state.foreignKeys = [
        createFK('public', 'orders', 'customer_id', 'public', 'customers', 'id'),
      ];

      mockDiscoveryService.getColumnValueOverlap.mockResolvedValue({
        data: createOverlapResult(0.95),
      } as any);

      const node = createDiscoverRelationshipsNode(
        mockDiscoveryService,
        'conn-1',
        'testdb',
        mockSemanticModelsService,
        'run-1',
        emitProgress,
      );

      const result = await node(state);

      // Should only have 1 candidate (explicit FK), not 2 (explicit + naming)
      expect(result.relationshipCandidates).toHaveLength(1);
      expect(result.relationshipCandidates![0].source).toBe('database_constraint');
    });

    it('should filter out FKs referencing tables not in datasets', async () => {
      state.datasets = [
        createDataset('orders', 'public', 'orders', [
          { name: 'id', dataType: 'integer', isPK: true },
          { name: 'customer_id', dataType: 'integer' },
        ]),
      ];

      // FK references customers table, but customers is not in datasets
      state.foreignKeys = [
        createFK('public', 'orders', 'customer_id', 'public', 'customers', 'id'),
      ];

      const node = createDiscoverRelationshipsNode(
        mockDiscoveryService,
        'conn-1',
        'testdb',
        mockSemanticModelsService,
        'run-1',
        emitProgress,
      );

      const result = await node(state);

      expect(result.relationshipCandidates).toHaveLength(0);
    });
  });

  // ==========================================
  // Phase 2: Value Overlap Validation
  // ==========================================

  describe('Phase 2: Value Overlap Validation', () => {
    it('should assign high confidence for high overlap on explicit FK', async () => {
      state.datasets = [
        createDataset('customers', 'public', 'customers', [
          { name: 'id', dataType: 'integer', isPK: true },
        ]),
        createDataset('orders', 'public', 'orders', [
          { name: 'id', dataType: 'integer', isPK: true },
          { name: 'customer_id', dataType: 'integer' },
        ]),
      ];

      state.foreignKeys = [
        createFK('public', 'orders', 'customer_id', 'public', 'customers', 'id'),
      ];

      mockDiscoveryService.getColumnValueOverlap.mockResolvedValue({
        data: createOverlapResult(0.95), // 95% overlap
      } as any);

      const node = createDiscoverRelationshipsNode(
        mockDiscoveryService,
        'conn-1',
        'testdb',
        mockSemanticModelsService,
        'run-1',
        emitProgress,
      );

      const result = await node(state);

      expect(result.relationshipCandidates![0].confidence).toBe('high');
      expect(result.relationshipCandidates![0].overlap).toMatchObject({
        overlapRatio: 0.95,
        cardinality: expect.any(String),
      });
    });

    it('should assign medium confidence for medium overlap on naming candidate', async () => {
      state.datasets = [
        createDataset('customers', 'public', 'customers', [
          { name: 'id', dataType: 'integer', isPK: true },
        ]),
        createDataset('orders', 'public', 'orders', [
          { name: 'id', dataType: 'integer', isPK: true },
          { name: 'customer_id', dataType: 'integer' },
        ]),
      ];

      state.foreignKeys = [];

      mockDiscoveryService.getColumnValueOverlap.mockResolvedValue({
        data: createOverlapResult(0.65), // 65% overlap
      } as any);

      const node = createDiscoverRelationshipsNode(
        mockDiscoveryService,
        'conn-1',
        'testdb',
        mockSemanticModelsService,
        'run-1',
        emitProgress,
      );

      const result = await node(state);

      expect(result.relationshipCandidates![0].confidence).toBe('medium');
    });

    it('should assign low confidence for low overlap', async () => {
      state.datasets = [
        createDataset('customers', 'public', 'customers', [
          { name: 'id', dataType: 'integer', isPK: true },
        ]),
        createDataset('orders', 'public', 'orders', [
          { name: 'id', dataType: 'integer', isPK: true },
          { name: 'customer_id', dataType: 'integer' },
        ]),
      ];

      state.foreignKeys = [];

      mockDiscoveryService.getColumnValueOverlap.mockResolvedValue({
        data: createOverlapResult(0.3), // 30% overlap
      } as any);

      const node = createDiscoverRelationshipsNode(
        mockDiscoveryService,
        'conn-1',
        'testdb',
        mockSemanticModelsService,
        'run-1',
        emitProgress,
      );

      const result = await node(state);

      expect(result.relationshipCandidates![0].confidence).toBe('low');
    });

    it('should reject candidates with very low overlap', async () => {
      state.datasets = [
        createDataset('customers', 'public', 'customers', [
          { name: 'id', dataType: 'integer', isPK: true },
        ]),
        createDataset('orders', 'public', 'orders', [
          { name: 'id', dataType: 'integer', isPK: true },
          { name: 'customer_id', dataType: 'integer' },
        ]),
      ];

      state.foreignKeys = [];

      mockDiscoveryService.getColumnValueOverlap.mockResolvedValue({
        data: createOverlapResult(0.1), // 10% overlap
      } as any);

      const node = createDiscoverRelationshipsNode(
        mockDiscoveryService,
        'conn-1',
        'testdb',
        mockSemanticModelsService,
        'run-1',
        emitProgress,
      );

      const result = await node(state);

      // Candidate should be rejected (not included in results)
      expect(result.relationshipCandidates).toHaveLength(0);
    });

    it('should handle validation failure gracefully', async () => {
      state.datasets = [
        createDataset('customers', 'public', 'customers', [
          { name: 'id', dataType: 'integer', isPK: true },
        ]),
        createDataset('orders', 'public', 'orders', [
          { name: 'id', dataType: 'integer', isPK: true },
          { name: 'customer_id', dataType: 'integer' },
        ]),
      ];

      state.foreignKeys = [
        createFK('public', 'orders', 'customer_id', 'public', 'customers', 'id'),
      ];

      mockDiscoveryService.getColumnValueOverlap.mockRejectedValue(
        new Error('Database connection failed'),
      );

      const node = createDiscoverRelationshipsNode(
        mockDiscoveryService,
        'conn-1',
        'testdb',
        mockSemanticModelsService,
        'run-1',
        emitProgress,
      );

      const result = await node(state);

      // Candidate should be skipped, node should not crash
      expect(result.relationshipCandidates).toHaveLength(0);
    });

    it('should populate overlap evidence with correct fields', async () => {
      state.datasets = [
        createDataset('customers', 'public', 'customers', [
          { name: 'id', dataType: 'integer', isPK: true },
        ]),
        createDataset('orders', 'public', 'orders', [
          { name: 'id', dataType: 'integer', isPK: true },
          { name: 'customer_id', dataType: 'integer' },
        ]),
      ];

      state.foreignKeys = [
        createFK('public', 'orders', 'customer_id', 'public', 'customers', 'id'),
      ];

      const overlapResult = createOverlapResult(0.95, 950, 1000, 500, 0.01);

      mockDiscoveryService.getColumnValueOverlap.mockResolvedValue({
        data: overlapResult,
      } as any);

      const node = createDiscoverRelationshipsNode(
        mockDiscoveryService,
        'conn-1',
        'testdb',
        mockSemanticModelsService,
        'run-1',
        emitProgress,
      );

      const result = await node(state);

      expect(result.relationshipCandidates![0].overlap).toMatchObject({
        overlapRatio: 0.95,
        childDistinctCount: 950,
        parentDistinctCount: 500,
        nullRatio: 0.01,
        childSampleSize: 1000,
        cardinality: expect.stringMatching(/^(one_to_one|one_to_many)$/),
      });
    });

    it('should detect one_to_one cardinality when childDistinct/childSample > 0.9', async () => {
      state.datasets = [
        createDataset('customers', 'public', 'customers', [
          { name: 'id', dataType: 'integer', isPK: true },
        ]),
        createDataset('orders', 'public', 'orders', [
          { name: 'id', dataType: 'integer', isPK: true },
          { name: 'customer_id', dataType: 'integer' },
        ]),
      ];

      state.foreignKeys = [
        createFK('public', 'orders', 'customer_id', 'public', 'customers', 'id'),
      ];

      // 950 distinct values out of 1000 rows = 0.95 ratio > 0.9
      mockDiscoveryService.getColumnValueOverlap.mockResolvedValue({
        data: createOverlapResult(0.95, 950, 1000, 500, 0.01),
      } as any);

      const node = createDiscoverRelationshipsNode(
        mockDiscoveryService,
        'conn-1',
        'testdb',
        mockSemanticModelsService,
        'run-1',
        emitProgress,
      );

      const result = await node(state);

      expect(result.relationshipCandidates![0].overlap!.cardinality).toBe('one_to_one');
    });

    it('should detect one_to_many cardinality when childDistinct/childSample <= 0.9', async () => {
      state.datasets = [
        createDataset('customers', 'public', 'customers', [
          { name: 'id', dataType: 'integer', isPK: true },
        ]),
        createDataset('orders', 'public', 'orders', [
          { name: 'id', dataType: 'integer', isPK: true },
          { name: 'customer_id', dataType: 'integer' },
        ]),
      ];

      state.foreignKeys = [
        createFK('public', 'orders', 'customer_id', 'public', 'customers', 'id'),
      ];

      // 500 distinct values out of 1000 rows = 0.5 ratio <= 0.9
      mockDiscoveryService.getColumnValueOverlap.mockResolvedValue({
        data: createOverlapResult(0.95, 500, 1000, 500, 0.01),
      } as any);

      const node = createDiscoverRelationshipsNode(
        mockDiscoveryService,
        'conn-1',
        'testdb',
        mockSemanticModelsService,
        'run-1',
        emitProgress,
      );

      const result = await node(state);

      expect(result.relationshipCandidates![0].overlap!.cardinality).toBe('one_to_many');
    });
  });

  // ==========================================
  // Phase 3: Junction Table Detection
  // ==========================================

  describe('Phase 3: Junction Table Detection', () => {
    it('should detect junction table and create M:N relationships', async () => {
      state.datasets = [
        createDataset('students', 'public', 'students', [
          { name: 'id', dataType: 'integer', isPK: true },
        ]),
        createDataset('courses', 'public', 'courses', [
          { name: 'id', dataType: 'integer', isPK: true },
        ]),
        createDataset('enrollments', 'public', 'enrollments', [
          { name: 'id', dataType: 'integer', isPK: true },
          { name: 'student_id', dataType: 'integer' },
          { name: 'course_id', dataType: 'integer' },
          { name: 'created_at', dataType: 'timestamp' }, // Audit column (doesn't count as "own")
        ]),
      ];

      state.foreignKeys = [
        createFK('public', 'enrollments', 'student_id', 'public', 'students', 'id'),
        createFK('public', 'enrollments', 'course_id', 'public', 'courses', 'id'),
      ];

      mockDiscoveryService.getColumnValueOverlap.mockResolvedValue({
        data: createOverlapResult(0.95),
      } as any);

      const node = createDiscoverRelationshipsNode(
        mockDiscoveryService,
        'conn-1',
        'testdb',
        mockSemanticModelsService,
        'run-1',
        emitProgress,
      );

      const result = await node(state);

      // Should have 2 direct relationships + 2 M:N relationships
      expect(result.relationshipCandidates).toHaveLength(4);

      const m2mRelationships = result.relationshipCandidates!.filter(
        (c) => c.isJunctionRelationship === true,
      );

      expect(m2mRelationships).toHaveLength(2);
      expect(m2mRelationships[0]).toMatchObject({
        fromTable: 'students',
        toTable: 'courses',
        source: 'value_overlap',
        isJunctionRelationship: true,
        junctionTable: 'public.enrollments',
      });
      expect(m2mRelationships[1]).toMatchObject({
        fromTable: 'courses',
        toTable: 'students',
        source: 'value_overlap',
        isJunctionRelationship: true,
        junctionTable: 'public.enrollments',
      });
    });

    it('should not detect junction table if too many own columns', async () => {
      state.datasets = [
        createDataset('students', 'public', 'students', [
          { name: 'id', dataType: 'integer', isPK: true },
        ]),
        createDataset('courses', 'public', 'courses', [
          { name: 'id', dataType: 'integer', isPK: true },
        ]),
        createDataset('enrollments', 'public', 'enrollments', [
          { name: 'id', dataType: 'integer', isPK: true },
          { name: 'student_id', dataType: 'integer' },
          { name: 'course_id', dataType: 'integer' },
          { name: 'grade', dataType: 'varchar' },
          { name: 'attendance', dataType: 'integer' },
          { name: 'notes', dataType: 'text' },
          { name: 'status', dataType: 'varchar' },
          // 4 own columns (excluding id, student_id, course_id) > 3 threshold
        ]),
      ];

      state.foreignKeys = [
        createFK('public', 'enrollments', 'student_id', 'public', 'students', 'id'),
        createFK('public', 'enrollments', 'course_id', 'public', 'courses', 'id'),
      ];

      mockDiscoveryService.getColumnValueOverlap.mockResolvedValue({
        data: createOverlapResult(0.95),
      } as any);

      const node = createDiscoverRelationshipsNode(
        mockDiscoveryService,
        'conn-1',
        'testdb',
        mockSemanticModelsService,
        'run-1',
        emitProgress,
      );

      const result = await node(state);

      // Should only have 2 direct relationships, no M:N
      const m2mRelationships = result.relationshipCandidates!.filter(
        (c) => c.isJunctionRelationship === true,
      );
      expect(m2mRelationships).toHaveLength(0);
    });

    it('should create M:N combinations for junction table with 3 FKs', async () => {
      state.datasets = [
        createDataset('users', 'public', 'users', [
          { name: 'id', dataType: 'integer', isPK: true },
        ]),
        createDataset('projects', 'public', 'projects', [
          { name: 'id', dataType: 'integer', isPK: true },
        ]),
        createDataset('roles', 'public', 'roles', [
          { name: 'id', dataType: 'integer', isPK: true },
        ]),
        createDataset('user_project_roles', 'public', 'user_project_roles', [
          { name: 'id', dataType: 'integer', isPK: true },
          { name: 'user_id', dataType: 'integer' },
          { name: 'project_id', dataType: 'integer' },
          { name: 'role_id', dataType: 'integer' },
        ]),
      ];

      state.foreignKeys = [
        createFK('public', 'user_project_roles', 'user_id', 'public', 'users', 'id'),
        createFK('public', 'user_project_roles', 'project_id', 'public', 'projects', 'id'),
        createFK('public', 'user_project_roles', 'role_id', 'public', 'roles', 'id'),
      ];

      mockDiscoveryService.getColumnValueOverlap.mockResolvedValue({
        data: createOverlapResult(0.95),
      } as any);

      const node = createDiscoverRelationshipsNode(
        mockDiscoveryService,
        'conn-1',
        'testdb',
        mockSemanticModelsService,
        'run-1',
        emitProgress,
      );

      const result = await node(state);

      // 3 direct relationships + 6 M:N (3 choose 2 = 3 pairs * 2 directions)
      const m2mRelationships = result.relationshipCandidates!.filter(
        (c) => c.isJunctionRelationship === true,
      );
      expect(m2mRelationships).toHaveLength(6);
    });
  });

  // ==========================================
  // Phase 4: Events and Progress
  // ==========================================

  describe('Phase 4: Events and Progress', () => {
    it('should emit step_start and step_end events', async () => {
      state.datasets = [
        createDataset('customers', 'public', 'customers', [
          { name: 'id', dataType: 'integer', isPK: true },
        ]),
      ];

      const node = createDiscoverRelationshipsNode(
        mockDiscoveryService,
        'conn-1',
        'testdb',
        mockSemanticModelsService,
        'run-1',
        emitProgress,
      );

      await node(state);

      expect(emitProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'step_start',
          step: 'discover_relationships',
          label: 'Analyzing Relationships',
        }),
      );

      expect(emitProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'step_end',
          step: 'discover_relationships',
        }),
      );
    });

    it('should emit text events for progress', async () => {
      state.datasets = [
        createDataset('customers', 'public', 'customers', [
          { name: 'id', dataType: 'integer', isPK: true },
        ]),
        createDataset('orders', 'public', 'orders', [
          { name: 'id', dataType: 'integer', isPK: true },
          { name: 'customer_id', dataType: 'integer' },
        ]),
      ];

      state.foreignKeys = [
        createFK('public', 'orders', 'customer_id', 'public', 'customers', 'id'),
      ];

      mockDiscoveryService.getColumnValueOverlap.mockResolvedValue({
        data: createOverlapResult(0.95),
      } as any);

      const node = createDiscoverRelationshipsNode(
        mockDiscoveryService,
        'conn-1',
        'testdb',
        mockSemanticModelsService,
        'run-1',
        emitProgress,
      );

      await node(state);

      const textEvents = emitProgress.mock.calls.filter(
        (call) => call[0].type === 'text',
      );

      expect(textEvents.length).toBeGreaterThan(0);
      expect(textEvents.some((call) => call[0].content?.includes('explicit FK'))).toBe(true);
      expect(textEvents.some((call) => call[0].content?.includes('Validated:'))).toBe(true);
    });

    it('should update run progress', async () => {
      state.datasets = [
        createDataset('customers', 'public', 'customers', [
          { name: 'id', dataType: 'integer', isPK: true },
        ]),
      ];

      const node = createDiscoverRelationshipsNode(
        mockDiscoveryService,
        'conn-1',
        'testdb',
        mockSemanticModelsService,
        'run-1',
        emitProgress,
      );

      await node(state);

      expect(mockSemanticModelsService.updateRunProgress).toHaveBeenCalledWith(
        'run-1',
        expect.objectContaining({
          currentStep: 'discover_relationships',
          currentStepLabel: 'Analyzing Relationships',
          percentComplete: 75,
        }),
      );
    });
  });

  // ==========================================
  // Edge Cases
  // ==========================================

  describe('Edge Cases', () => {
    it('should return empty array when no datasets', async () => {
      state.datasets = [];

      const node = createDiscoverRelationshipsNode(
        mockDiscoveryService,
        'conn-1',
        'testdb',
        mockSemanticModelsService,
        'run-1',
        emitProgress,
      );

      const result = await node(state);

      expect(result.relationshipCandidates).toHaveLength(0);
    });

    it('should return empty array when no candidates found', async () => {
      state.datasets = [
        createDataset('customers', 'public', 'customers', [
          { name: 'id', dataType: 'integer', isPK: true },
          { name: 'name', dataType: 'varchar' }, // No FK-like columns
        ]),
      ];

      state.foreignKeys = [];

      const node = createDiscoverRelationshipsNode(
        mockDiscoveryService,
        'conn-1',
        'testdb',
        mockSemanticModelsService,
        'run-1',
        emitProgress,
      );

      const result = await node(state);

      expect(result.relationshipCandidates).toHaveLength(0);
    });

    it('should handle multiple candidates with different confidence levels', async () => {
      state.datasets = [
        createDataset('customers', 'public', 'customers', [
          { name: 'id', dataType: 'integer', isPK: true },
        ]),
        createDataset('products', 'public', 'products', [
          { name: 'id', dataType: 'integer', isPK: true },
        ]),
        createDataset('orders', 'public', 'orders', [
          { name: 'id', dataType: 'integer', isPK: true },
          { name: 'customer_id', dataType: 'integer' },
          { name: 'product_id', dataType: 'integer' },
          { name: 'order_date', dataType: 'timestamp' },
          { name: 'total_amount', dataType: 'numeric' },
          { name: 'status', dataType: 'varchar' },
          { name: 'notes', dataType: 'text' },
          // 4 own columns (excluding id, customer_id, product_id, and audit columns)
          // This prevents junction table detection
        ]),
      ];

      state.foreignKeys = [
        createFK('public', 'orders', 'customer_id', 'public', 'customers', 'id'),
      ];

      // First call: high overlap for customer FK
      // Second call: medium overlap for product FK (naming pattern)
      mockDiscoveryService.getColumnValueOverlap
        .mockResolvedValueOnce({ data: createOverlapResult(0.95) } as any)
        .mockResolvedValueOnce({ data: createOverlapResult(0.6) } as any);

      const node = createDiscoverRelationshipsNode(
        mockDiscoveryService,
        'conn-1',
        'testdb',
        mockSemanticModelsService,
        'run-1',
        emitProgress,
      );

      const result = await node(state);

      expect(result.relationshipCandidates).toHaveLength(2);

      const customerRel = result.relationshipCandidates!.find(
        (c) => c.toTable === 'customers',
      );
      const productRel = result.relationshipCandidates!.find(
        (c) => c.toTable === 'products',
      );

      expect(customerRel!.confidence).toBe('high');
      expect(productRel!.confidence).toBe('medium');
    });
  });
});
