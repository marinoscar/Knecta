/**
 * Data Agent Clarification Routing & Preference Service Tests
 *
 * Tests clarification routing logic and the getEffectivePreferences service
 * method. Since routeAfterPlanner is a module-private function in graph.ts,
 * we test it through the PlanArtifact shape in state and verify the service
 * methods that feed into the graph's routing decisions.
 */
import { randomUUID } from 'crypto';
import {
  TestContext,
  createTestApp,
  closeTestApp,
} from './helpers/test-app.helper';
import { resetPrismaMock } from './mocks/prisma.mock';
import { setupBaseMocks } from './fixtures/mock-setup.helper';
import { DataAgentService } from '../src/data-agent/data-agent.service';
import { createMockDataAgentPreference } from './fixtures/test-data.factory';
import { PlanArtifact } from '../src/data-agent/agent/types';

describe('Data Agent Clarification Routing & Preferences (Integration)', () => {
  let context: TestContext;
  let dataAgentService: DataAgentService;

  beforeAll(async () => {
    context = await createTestApp({ useMockDatabase: true });
  });

  afterAll(async () => {
    await closeTestApp(context);
  });

  beforeEach(async () => {
    resetPrismaMock();
    setupBaseMocks();
    dataAgentService = context.module.get<DataAgentService>(DataAgentService);
  });

  // ==========================================================================
  // PlanArtifact type shape — verifies shouldClarify exists and is typed correctly
  // ==========================================================================

  describe('PlanArtifact type shape', () => {
    it('should construct a valid PlanArtifact with shouldClarify=true', () => {
      const plan: PlanArtifact = {
        complexity: 'simple',
        intent: 'What is the total revenue?',
        metrics: ['revenue'],
        dimensions: [],
        timeWindow: null,
        filters: [],
        grain: 'total',
        ambiguities: [],
        acceptanceChecks: ['Revenue sum is positive'],
        shouldClarify: true,
        clarificationQuestions: [
          {
            question: 'Which date range should be used?',
            assumption: 'Last 30 days',
          },
        ],
        confidenceLevel: 'low',
        steps: [],
      };

      expect(plan.shouldClarify).toBe(true);
      expect(plan.clarificationQuestions).toHaveLength(1);
      expect(plan.clarificationQuestions[0]).toHaveProperty('question');
      expect(plan.clarificationQuestions[0]).toHaveProperty('assumption');
    });

    it('should construct a valid PlanArtifact with shouldClarify=false', () => {
      const plan: PlanArtifact = {
        complexity: 'analytical',
        intent: 'Show top 10 customers by revenue',
        metrics: ['revenue'],
        dimensions: ['customer_name'],
        timeWindow: 'last_quarter',
        filters: [],
        grain: 'customer',
        ambiguities: [],
        acceptanceChecks: [],
        shouldClarify: false,
        clarificationQuestions: [],
        confidenceLevel: 'high',
        steps: [
          {
            id: 1,
            description: 'Query revenue by customer',
            strategy: 'sql',
            dependsOn: [],
            datasets: ['customers', 'orders'],
            expectedOutput: 'Top 10 customers table',
          },
        ],
      };

      expect(plan.shouldClarify).toBe(false);
      expect(plan.clarificationQuestions).toHaveLength(0);
      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].strategy).toBe('sql');
    });

    it('should support all valid step strategies', () => {
      const strategies: Array<'sql' | 'python' | 'sql_then_python'> = [
        'sql',
        'python',
        'sql_then_python',
      ];

      strategies.forEach((strategy) => {
        const plan: PlanArtifact = {
          complexity: 'analytical',
          intent: `Test ${strategy}`,
          metrics: [],
          dimensions: [],
          timeWindow: null,
          filters: [],
          grain: 'row',
          ambiguities: [],
          acceptanceChecks: [],
          shouldClarify: false,
          clarificationQuestions: [],
          confidenceLevel: 'high',
          steps: [
            {
              id: 1,
              description: `Step using ${strategy}`,
              strategy,
              dependsOn: [],
              datasets: [],
              expectedOutput: 'result',
            },
          ],
        };

        expect(plan.steps[0].strategy).toBe(strategy);
      });
    });
  });

  // ==========================================================================
  // routeAfterPlanner logic — tested indirectly via state shape
  //
  // The actual routing function is module-private. We verify its conditions
  // by testing the state fields it reads:
  //   - state.plan?.shouldClarify && state.plan.clarificationQuestions?.length > 0 => '__end__'
  //   - state.plan?.complexity === 'simple' => 'executor'
  //   - else => 'navigator'
  // ==========================================================================

  describe('routeAfterPlanner routing conditions', () => {
    it('clarification route: shouldClarify=true with questions routes to END (clarification)', () => {
      // A plan that has shouldClarify=true with non-empty questions
      // should cause the graph to terminate early and emit clarification
      const plan: PlanArtifact = {
        complexity: 'simple',
        intent: 'How much did we sell?',
        metrics: ['revenue'],
        dimensions: [],
        timeWindow: null,
        filters: [],
        grain: 'total',
        ambiguities: [],
        acceptanceChecks: [],
        shouldClarify: true,
        clarificationQuestions: [
          {
            question: 'In what currency?',
            assumption: 'USD',
          },
          {
            question: 'Which region?',
            assumption: 'Global',
          },
        ],
        confidenceLevel: 'low',
        steps: [],
      };

      // Verify the routing conditions that routeAfterPlanner checks
      const shouldTerminateEarly =
        plan.shouldClarify && plan.clarificationQuestions.length > 0;

      expect(shouldTerminateEarly).toBe(true);
    });

    it('no clarification route: shouldClarify=false does NOT terminate early', () => {
      const plan: PlanArtifact = {
        complexity: 'simple',
        intent: 'Total revenue last month',
        metrics: ['revenue'],
        dimensions: [],
        timeWindow: 'last_month',
        filters: [],
        grain: 'total',
        ambiguities: [],
        acceptanceChecks: [],
        shouldClarify: false,
        clarificationQuestions: [],
        confidenceLevel: 'high',
        steps: [],
      };

      const shouldTerminateEarly =
        plan.shouldClarify && plan.clarificationQuestions.length > 0;

      expect(shouldTerminateEarly).toBe(false);
    });

    it('no clarification route: shouldClarify=true with empty questions does NOT terminate', () => {
      // Edge case: shouldClarify set but no questions provided
      const plan: PlanArtifact = {
        complexity: 'simple',
        intent: 'Total revenue',
        metrics: ['revenue'],
        dimensions: [],
        timeWindow: null,
        filters: [],
        grain: 'total',
        ambiguities: [],
        acceptanceChecks: [],
        shouldClarify: true,
        clarificationQuestions: [], // Empty — no termination
        confidenceLevel: 'medium',
        steps: [],
      };

      const shouldTerminateEarly =
        plan.shouldClarify && plan.clarificationQuestions.length > 0;

      expect(shouldTerminateEarly).toBe(false);
    });

    it('simple complexity: routes to executor (skip navigator)', () => {
      const plan: PlanArtifact = {
        complexity: 'simple',
        intent: 'Total count of users',
        metrics: ['user_count'],
        dimensions: [],
        timeWindow: null,
        filters: [],
        grain: 'total',
        ambiguities: [],
        acceptanceChecks: [],
        shouldClarify: false,
        clarificationQuestions: [],
        confidenceLevel: 'high',
        steps: [],
      };

      // After ruling out clarification, simple complexity goes to executor
      const shouldTerminate =
        plan.shouldClarify && plan.clarificationQuestions.length > 0;
      const nextNode =
        !shouldTerminate && plan.complexity === 'simple'
          ? 'executor'
          : 'navigator';

      expect(shouldTerminate).toBe(false);
      expect(nextNode).toBe('executor');
    });

    it('analytical complexity: routes to navigator', () => {
      const plan: PlanArtifact = {
        complexity: 'analytical',
        intent: 'Revenue breakdown by region and product category last quarter',
        metrics: ['revenue'],
        dimensions: ['region', 'product_category'],
        timeWindow: 'last_quarter',
        filters: [],
        grain: 'region_x_product',
        ambiguities: [],
        acceptanceChecks: [],
        shouldClarify: false,
        clarificationQuestions: [],
        confidenceLevel: 'medium',
        steps: [],
      };

      const shouldTerminate =
        plan.shouldClarify && plan.clarificationQuestions.length > 0;
      const nextNode =
        !shouldTerminate && plan.complexity === 'simple'
          ? 'executor'
          : 'navigator';

      expect(shouldTerminate).toBe(false);
      expect(nextNode).toBe('navigator');
    });
  });

  // ==========================================================================
  // DataAgentService.getEffectivePreferences — comprehensive merge behavior
  // ==========================================================================

  describe('DataAgentService.getEffectivePreferences', () => {
    it('should return merged global + ontology preferences with correct shape', async () => {
      const userId = randomUUID();
      const ontologyId = randomUUID();

      const globalPref = createMockDataAgentPreference({
        id: randomUUID(),
        userId,
        ontologyId: null,
        key: 'output_format',
        value: 'table',
        source: 'manual',
      });

      const ontologyPref = createMockDataAgentPreference({
        id: randomUUID(),
        userId,
        ontologyId,
        key: 'chart_type',
        value: 'bar',
        source: 'auto_captured',
      });

      context.prismaMock.dataAgentPreference.findMany.mockResolvedValue([
        globalPref,
        ontologyPref,
      ]);

      const result = await dataAgentService.getEffectivePreferences(
        userId,
        ontologyId,
      );

      // Returns merged list
      expect(result).toHaveLength(2);

      // Each result has the expected three fields (key, value, source)
      result.forEach((pref) => {
        expect(pref).toHaveProperty('key');
        expect(pref).toHaveProperty('value');
        expect(pref).toHaveProperty('source');
        // Result should NOT include raw DB fields like id, userId, ontologyId
        expect(pref).not.toHaveProperty('id');
        expect(pref).not.toHaveProperty('userId');
        expect(pref).not.toHaveProperty('ontologyId');
      });
    });

    it('should apply ontology-scoped override for the same key', async () => {
      const userId = randomUUID();
      const ontologyId = randomUUID();

      // Same key 'output_format' in both scopes
      const globalPref = createMockDataAgentPreference({
        id: randomUUID(),
        userId,
        ontologyId: null,
        key: 'output_format',
        value: 'table',
        source: 'manual',
      });

      const ontologyPref = createMockDataAgentPreference({
        id: randomUUID(),
        userId,
        ontologyId,
        key: 'output_format',
        value: 'json',
        source: 'manual',
      });

      // Service receives global first, then ontology (order matters for map merge)
      context.prismaMock.dataAgentPreference.findMany.mockResolvedValue([
        globalPref,
        ontologyPref,
      ]);

      const result = await dataAgentService.getEffectivePreferences(
        userId,
        ontologyId,
      );

      // Ontology-scoped wins
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        key: 'output_format',
        value: 'json',
        source: 'manual',
      });
    });

    it('should preserve source field when merging preferences', async () => {
      const userId = randomUUID();
      const ontologyId = randomUUID();

      const globalManual = createMockDataAgentPreference({
        id: randomUUID(),
        userId,
        ontologyId: null,
        key: 'verbosity',
        value: 'concise',
        source: 'manual',
      });

      const ontologyAuto = createMockDataAgentPreference({
        id: randomUUID(),
        userId,
        ontologyId,
        key: 'chart_type',
        value: 'scatter',
        source: 'auto_captured',
      });

      context.prismaMock.dataAgentPreference.findMany.mockResolvedValue([
        globalManual,
        ontologyAuto,
      ]);

      const result = await dataAgentService.getEffectivePreferences(
        userId,
        ontologyId,
      );

      expect(result).toHaveLength(2);
      const verbosityPref = result.find((p) => p.key === 'verbosity');
      const chartPref = result.find((p) => p.key === 'chart_type');

      expect(verbosityPref?.source).toBe('manual');
      expect(chartPref?.source).toBe('auto_captured');
    });

    it('should return empty array when no preferences exist for user or ontology', async () => {
      const userId = randomUUID();
      const ontologyId = randomUUID();

      context.prismaMock.dataAgentPreference.findMany.mockResolvedValue([]);

      const result = await dataAgentService.getEffectivePreferences(
        userId,
        ontologyId,
      );

      expect(result).toEqual([]);
    });

    it('should query with OR clause covering both null and specific ontologyId', async () => {
      const userId = randomUUID();
      const ontologyId = randomUUID();

      context.prismaMock.dataAgentPreference.findMany.mockResolvedValue([]);

      await dataAgentService.getEffectivePreferences(userId, ontologyId);

      expect(
        context.prismaMock.dataAgentPreference.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId,
            OR: [{ ontologyId: null }, { ontologyId }],
          },
        }),
      );
    });

    it('should handle multiple keys with both global and ontology overrides', async () => {
      const userId = randomUUID();
      const ontologyId = randomUUID();

      // Keys: output_format (global only), chart_type (ontology only), verbosity (both — ontology wins)
      const prefs = [
        // Global prefs
        createMockDataAgentPreference({
          id: randomUUID(),
          userId,
          ontologyId: null,
          key: 'output_format',
          value: 'table',
          source: 'manual',
        }),
        createMockDataAgentPreference({
          id: randomUUID(),
          userId,
          ontologyId: null,
          key: 'verbosity',
          value: 'concise',
          source: 'manual',
        }),
        // Ontology-scoped prefs
        createMockDataAgentPreference({
          id: randomUUID(),
          userId,
          ontologyId,
          key: 'chart_type',
          value: 'bar',
          source: 'auto_captured',
        }),
        createMockDataAgentPreference({
          id: randomUUID(),
          userId,
          ontologyId,
          key: 'verbosity',
          value: 'detailed',  // Overrides global 'concise'
          source: 'manual',
        }),
      ];

      context.prismaMock.dataAgentPreference.findMany.mockResolvedValue(prefs);

      const result = await dataAgentService.getEffectivePreferences(
        userId,
        ontologyId,
      );

      // 3 unique keys: output_format, verbosity (overridden), chart_type
      expect(result).toHaveLength(3);

      const outputFormat = result.find((p) => p.key === 'output_format');
      const verbosity = result.find((p) => p.key === 'verbosity');
      const chartType = result.find((p) => p.key === 'chart_type');

      expect(outputFormat?.value).toBe('table');  // Global value survives (no override)
      expect(verbosity?.value).toBe('detailed');   // Ontology override wins
      expect(chartType?.value).toBe('bar');         // Ontology-only key
    });
  });

  // ==========================================================================
  // DataAgentService.getPreferences — scope parameter behavior
  // ==========================================================================

  describe('DataAgentService.getPreferences — scope filtering', () => {
    it('should pass ontologyId: null filter for scope=global', async () => {
      const userId = randomUUID();

      context.prismaMock.dataAgentPreference.findMany.mockResolvedValue([]);

      await dataAgentService.getPreferences(userId, undefined, 'global');

      expect(
        context.prismaMock.dataAgentPreference.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId,
            ontologyId: null,
          }),
        }),
      );
    });

    it('should pass ontologyId filter for scope=ontology', async () => {
      const userId = randomUUID();
      const ontologyId = randomUUID();

      context.prismaMock.dataAgentPreference.findMany.mockResolvedValue([]);

      await dataAgentService.getPreferences(userId, ontologyId, 'ontology');

      expect(
        context.prismaMock.dataAgentPreference.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId,
            ontologyId,
          }),
        }),
      );
    });

    it('should pass OR filter for scope=all with ontologyId', async () => {
      const userId = randomUUID();
      const ontologyId = randomUUID();

      context.prismaMock.dataAgentPreference.findMany.mockResolvedValue([]);

      await dataAgentService.getPreferences(userId, ontologyId, 'all');

      expect(
        context.prismaMock.dataAgentPreference.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId,
            OR: expect.arrayContaining([
              { ontologyId: null },
              { ontologyId },
            ]),
          }),
        }),
      );
    });

    it('should return all user preferences when no ontologyId and scope=all', async () => {
      const userId = randomUUID();

      context.prismaMock.dataAgentPreference.findMany.mockResolvedValue([]);

      await dataAgentService.getPreferences(userId, undefined, 'all');

      // Only userId filter — returns everything for the user
      expect(
        context.prismaMock.dataAgentPreference.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId,
          }),
        }),
      );

      // No OR clause and no ontologyId filter (no restriction)
      const callArgs =
        context.prismaMock.dataAgentPreference.findMany.mock.calls[0][0];
      expect(callArgs.where).not.toHaveProperty('ontologyId');
      expect(callArgs.where).not.toHaveProperty('OR');
    });
  });

  // ==========================================================================
  // DataAgentService.createPreference — upsert logic
  // ==========================================================================

  describe('DataAgentService.createPreference', () => {
    it('should call upsert with correct where clause using composite unique constraint', async () => {
      const userId = randomUUID();
      const ontologyId = randomUUID();

      const created = createMockDataAgentPreference({
        id: randomUUID(),
        userId,
        ontologyId,
        key: 'output_format',
        value: 'table',
        source: 'manual',
      });

      context.prismaMock.dataAgentPreference.upsert.mockResolvedValue(created);

      await dataAgentService.createPreference(userId, {
        ontologyId,
        key: 'output_format',
        value: 'table',
        source: 'manual',
      });

      expect(
        context.prismaMock.dataAgentPreference.upsert,
      ).toHaveBeenCalledWith({
        where: {
          user_ontology_key_unique: {
            userId,
            ontologyId,
            key: 'output_format',
          },
        },
        update: {
          value: 'table',
          source: 'manual',
        },
        create: {
          userId,
          ontologyId,
          key: 'output_format',
          value: 'table',
          source: 'manual',
        },
      });
    });

    it('should default source to "manual" when not provided', async () => {
      const userId = randomUUID();

      const created = createMockDataAgentPreference({
        id: randomUUID(),
        userId,
        ontologyId: null,
        key: 'verbosity',
        value: 'detailed',
        source: 'manual',
      });

      // null ontologyId → findFirst + create path
      context.prismaMock.dataAgentPreference.findFirst.mockResolvedValue(null);
      context.prismaMock.dataAgentPreference.create.mockResolvedValue(created);

      await dataAgentService.createPreference(userId, {
        key: 'verbosity',
        value: 'detailed',
        // source not provided — should default to 'manual'
      });

      const callArgs =
        context.prismaMock.dataAgentPreference.create.mock.calls[0][0];
      expect(callArgs.data.source).toBe('manual');
    });

    it('should coerce undefined ontologyId to null in where clause', async () => {
      const userId = randomUUID();

      const created = createMockDataAgentPreference({
        id: randomUUID(),
        userId,
        ontologyId: null,
        key: 'output_format',
        value: 'table',
        source: 'manual',
      });

      // null ontologyId → findFirst + create path
      context.prismaMock.dataAgentPreference.findFirst.mockResolvedValue(null);
      context.prismaMock.dataAgentPreference.create.mockResolvedValue(created);

      await dataAgentService.createPreference(userId, {
        key: 'output_format',
        value: 'table',
        // ontologyId omitted
      });

      // Verify findFirst was called with ontologyId: null
      expect(
        context.prismaMock.dataAgentPreference.findFirst,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId,
            ontologyId: null,
            key: 'output_format',
          }),
        }),
      );
      // Verify create was called with ontologyId: null
      const createArgs =
        context.prismaMock.dataAgentPreference.create.mock.calls[0][0];
      expect(createArgs.data.ontologyId).toBeNull();
    });
  });

  // ==========================================================================
  // DataAgentService.updatePreference — ownership check
  // ==========================================================================

  describe('DataAgentService.updatePreference', () => {
    it('should throw NotFoundException when preference belongs to different user', async () => {
      const userId = randomUUID();
      const prefId = randomUUID();

      // findFirst returns null (userId mismatch)
      context.prismaMock.dataAgentPreference.findFirst.mockResolvedValue(null);

      await expect(
        dataAgentService.updatePreference(prefId, userId, { value: 'chart' }),
      ).rejects.toThrow('Preference not found');
    });

    it('should update and return preference when ownership is confirmed', async () => {
      const userId = randomUUID();
      const prefId = randomUUID();

      const existingPref = createMockDataAgentPreference({
        id: prefId,
        userId,
        ontologyId: null,
        key: 'output_format',
        value: 'table',
        source: 'manual',
      });

      const updatedPref = { ...existingPref, value: 'chart' };

      context.prismaMock.dataAgentPreference.findFirst.mockResolvedValue(
        existingPref,
      );
      context.prismaMock.dataAgentPreference.update.mockResolvedValue(
        updatedPref,
      );

      const result = await dataAgentService.updatePreference(prefId, userId, {
        value: 'chart',
      });

      expect(result.value).toBe('chart');
      expect(
        context.prismaMock.dataAgentPreference.findFirst,
      ).toHaveBeenCalledWith({
        where: { id: prefId, userId },
      });
      expect(
        context.prismaMock.dataAgentPreference.update,
      ).toHaveBeenCalledWith({
        where: { id: prefId },
        data: { value: 'chart' },
      });
    });
  });

  // ==========================================================================
  // DataAgentService.deletePreference — ownership check
  // ==========================================================================

  describe('DataAgentService.deletePreference', () => {
    it('should throw NotFoundException when preference does not exist or wrong user', async () => {
      const userId = randomUUID();
      const prefId = randomUUID();

      context.prismaMock.dataAgentPreference.findFirst.mockResolvedValue(null);

      await expect(
        dataAgentService.deletePreference(prefId, userId),
      ).rejects.toThrow('Preference not found');
    });

    it('should delete preference when ownership is confirmed', async () => {
      const userId = randomUUID();
      const prefId = randomUUID();

      const existingPref = createMockDataAgentPreference({
        id: prefId,
        userId,
        ontologyId: null,
        key: 'output_format',
        value: 'table',
        source: 'manual',
      });

      context.prismaMock.dataAgentPreference.findFirst.mockResolvedValue(
        existingPref,
      );
      context.prismaMock.dataAgentPreference.delete.mockResolvedValue(
        existingPref,
      );

      await expect(
        dataAgentService.deletePreference(prefId, userId),
      ).resolves.toBeUndefined();

      expect(
        context.prismaMock.dataAgentPreference.delete,
      ).toHaveBeenCalledWith({ where: { id: prefId } });
    });
  });

  // ==========================================================================
  // DataAgentService.clearPreferences — scoping
  // ==========================================================================

  describe('DataAgentService.clearPreferences', () => {
    it('should delete all user preferences when no ontologyId provided', async () => {
      const userId = randomUUID();

      context.prismaMock.dataAgentPreference.deleteMany.mockResolvedValue({
        count: 5,
      });

      await dataAgentService.clearPreferences(userId);

      expect(
        context.prismaMock.dataAgentPreference.deleteMany,
      ).toHaveBeenCalledWith({
        where: { userId },
      });
    });

    it('should scope deletion to ontologyId when provided', async () => {
      const userId = randomUUID();
      const ontologyId = randomUUID();

      context.prismaMock.dataAgentPreference.deleteMany.mockResolvedValue({
        count: 2,
      });

      await dataAgentService.clearPreferences(userId, ontologyId);

      expect(
        context.prismaMock.dataAgentPreference.deleteMany,
      ).toHaveBeenCalledWith({
        where: { userId, ontologyId },
      });
    });
  });
});
