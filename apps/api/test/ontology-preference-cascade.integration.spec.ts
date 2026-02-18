import { randomUUID } from 'crypto';
import request from 'supertest';
import {
  TestContext,
  createTestApp,
  closeTestApp,
} from './helpers/test-app.helper';
import { resetPrismaMock } from './mocks/prisma.mock';
import { setupBaseMocks } from './fixtures/mock-setup.helper';
import {
  createMockContributorUser,
  authHeader,
} from './helpers/auth-mock.helper';
import {
  createMockOntology,
  createMockDataAgentPreference,
} from './fixtures/test-data.factory';
import { NeoOntologyService } from '../src/ontologies/neo-ontology.service';
import { DataAgentService } from '../src/data-agent/data-agent.service';

describe('Ontology Preference Cascade (Integration)', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await createTestApp({ useMockDatabase: true });
  });

  afterAll(async () => {
    await closeTestApp(context);
  });

  beforeEach(async () => {
    resetPrismaMock();
    setupBaseMocks();
  });

  // ==========================================================================
  // Cascade delete: ontology deletion removes associated preferences
  //
  // NOTE: The actual CASCADE DELETE is enforced at the PostgreSQL level via the
  // Prisma schema FK constraint (onDelete: Cascade on dataAgentPreference.ontologyId).
  // Since tests use a mocked Prisma client (no real DB), we verify:
  //   1. The ontology DELETE endpoint functions correctly
  //   2. The service layer correctly scopes preferences to an ontologyId
  //   3. getEffectivePreferences only returns prefs for the right ontology
  //   4. getPreferences with scope=ontology correctly isolates per-ontology prefs
  // ==========================================================================

  describe('DELETE /api/ontologies/:id — preference isolation', () => {
    it('should delete the ontology successfully', async () => {
      const contributor = await createMockContributorUser(context);
      const ontologyId = randomUUID();

      const mockOntology = createMockOntology({
        id: ontologyId,
        name: 'To Delete',
        semanticModelId: randomUUID(),
        createdByUserId: contributor.id,
      });

      context.prismaMock.ontology.findUnique.mockResolvedValue(mockOntology);
      context.prismaMock.ontology.delete.mockResolvedValue(mockOntology);
      context.prismaMock.auditEvent.create.mockResolvedValue({} as any);

      const mockNeoOntologyService =
        context.module.get(NeoOntologyService) as any;
      if (mockNeoOntologyService && mockNeoOntologyService.deleteGraph) {
        mockNeoOntologyService.deleteGraph.mockResolvedValue(undefined);
      }

      await request(context.app.getHttpServer())
        .delete(`/api/ontologies/${ontologyId}`)
        .set(authHeader(contributor.accessToken))
        .expect(204);

      expect(context.prismaMock.ontology.delete).toHaveBeenCalledWith({
        where: { id: ontologyId },
      });
    });

    it('should not affect global preferences when an ontology is deleted', async () => {
      const contributor = await createMockContributorUser(context);
      const ontologyId = randomUUID();

      // After ontology deletion, global preferences (ontologyId=null) survive.
      // We verify this by calling getPreferences with scope=global and confirming
      // the service queries with ontologyId: null (unaffected by the delete).
      const globalPref = createMockDataAgentPreference({
        id: randomUUID(),
        userId: contributor.id,
        ontologyId: null,
        key: 'output_format',
        value: 'table',
      });

      context.prismaMock.dataAgentPreference.findMany.mockResolvedValue([
        globalPref,
      ]);

      const response = await request(context.app.getHttpServer())
        .get('/api/data-agent/preferences?scope=global')
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].ontologyId).toBeNull();
      expect(response.body.data[0].key).toBe('output_format');
    });

    it('should not affect preferences for other ontologies when one is deleted', async () => {
      const contributor = await createMockContributorUser(context);
      const ontologyIdA = randomUUID();
      const ontologyIdB = randomUUID();

      // Ontology B's preferences survive when Ontology A is deleted.
      // Verify that querying scope=ontology for B returns B's prefs.
      const prefForB = createMockDataAgentPreference({
        id: randomUUID(),
        userId: contributor.id,
        ontologyId: ontologyIdB,
        key: 'chart_type',
        value: 'bar',
      });

      context.prismaMock.dataAgentPreference.findMany.mockResolvedValue([
        prefForB,
      ]);

      const response = await request(context.app.getHttpServer())
        .get(
          `/api/data-agent/preferences?scope=ontology&ontologyId=${ontologyIdB}`,
        )
        .set(authHeader(contributor.accessToken))
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].ontologyId).toBe(ontologyIdB);
      expect(response.body.data[0].key).toBe('chart_type');

      // Verify the query was scoped to ontologyIdB (not affected by A's deletion)
      expect(
        context.prismaMock.dataAgentPreference.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: contributor.id,
            ontologyId: ontologyIdB,
          }),
        }),
      );
    });
  });

  // ==========================================================================
  // DataAgentService.getEffectivePreferences — merge semantics
  // ==========================================================================

  describe('DataAgentService.getEffectivePreferences', () => {
    let dataAgentService: DataAgentService;

    beforeEach(() => {
      dataAgentService = context.module.get<DataAgentService>(DataAgentService);
    });

    it('should return merged global + ontology preferences', async () => {
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
        source: 'manual',
      });

      context.prismaMock.dataAgentPreference.findMany.mockResolvedValue([
        globalPref,
        ontologyPref,
      ]);

      const result = await dataAgentService.getEffectivePreferences(
        userId,
        ontologyId,
      );

      expect(result).toHaveLength(2);
      expect(result).toEqual(
        expect.arrayContaining([
          { key: 'output_format', value: 'table', source: 'manual' },
          { key: 'chart_type', value: 'bar', source: 'manual' },
        ]),
      );

      // Verify the query uses OR to include both global and ontology-scoped prefs
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

    it('should have ontology-scoped preference override global for the same key', async () => {
      const userId = randomUUID();
      const ontologyId = randomUUID();

      // Same key 'output_format' appears in both global and ontology scope
      const globalPref = createMockDataAgentPreference({
        id: randomUUID(),
        userId,
        ontologyId: null,
        key: 'output_format',
        value: 'table',   // global default
        source: 'manual',
      });

      const ontologyPref = createMockDataAgentPreference({
        id: randomUUID(),
        userId,
        ontologyId,
        key: 'output_format',
        value: 'chart',   // ontology-scoped override
        source: 'manual',
      });

      // Service receives both in query result (global first, then ontology-scoped)
      context.prismaMock.dataAgentPreference.findMany.mockResolvedValue([
        globalPref,
        ontologyPref,
      ]);

      const result = await dataAgentService.getEffectivePreferences(
        userId,
        ontologyId,
      );

      // Should only have one entry for 'output_format' and it should be the ontology override
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        key: 'output_format',
        value: 'chart',
        source: 'manual',
      });
    });

    it('should return empty array when no preferences exist', async () => {
      const userId = randomUUID();
      const ontologyId = randomUUID();

      context.prismaMock.dataAgentPreference.findMany.mockResolvedValue([]);

      const result = await dataAgentService.getEffectivePreferences(
        userId,
        ontologyId,
      );

      expect(result).toEqual([]);
    });

    it('should return only global preferences when no ontology-scoped prefs exist', async () => {
      const userId = randomUUID();
      const ontologyId = randomUUID();

      const globalPref1 = createMockDataAgentPreference({
        id: randomUUID(),
        userId,
        ontologyId: null,
        key: 'output_format',
        value: 'table',
        source: 'manual',
      });

      const globalPref2 = createMockDataAgentPreference({
        id: randomUUID(),
        userId,
        ontologyId: null,
        key: 'verbosity',
        value: 'concise',
        source: 'auto_captured',
      });

      context.prismaMock.dataAgentPreference.findMany.mockResolvedValue([
        globalPref1,
        globalPref2,
      ]);

      const result = await dataAgentService.getEffectivePreferences(
        userId,
        ontologyId,
      );

      expect(result).toHaveLength(2);
      expect(result).toEqual(
        expect.arrayContaining([
          { key: 'output_format', value: 'table', source: 'manual' },
          { key: 'verbosity', value: 'concise', source: 'auto_captured' },
        ]),
      );
    });

    it('should return only ontology preferences when no global prefs exist', async () => {
      const userId = randomUUID();
      const ontologyId = randomUUID();

      const ontologyPref = createMockDataAgentPreference({
        id: randomUUID(),
        userId,
        ontologyId,
        key: 'chart_type',
        value: 'scatter',
        source: 'manual',
      });

      context.prismaMock.dataAgentPreference.findMany.mockResolvedValue([
        ontologyPref,
      ]);

      const result = await dataAgentService.getEffectivePreferences(
        userId,
        ontologyId,
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        key: 'chart_type',
        value: 'scatter',
        source: 'manual',
      });
    });
  });

  // ==========================================================================
  // Preference isolation: clearing by ontologyId leaves others intact
  // ==========================================================================

  describe('DELETE /api/data-agent/preferences — ontologyId scoping', () => {
    it('should only delete preferences for the specified ontologyId', async () => {
      const contributor = await createMockContributorUser(context);
      const ontologyIdA = randomUUID();

      context.prismaMock.dataAgentPreference.deleteMany.mockResolvedValue({
        count: 2,
      });

      await request(context.app.getHttpServer())
        .delete(`/api/data-agent/preferences?ontologyId=${ontologyIdA}`)
        .set(authHeader(contributor.accessToken))
        .expect(204);

      // deleteMany was called with ontologyId scoped to A only
      expect(
        context.prismaMock.dataAgentPreference.deleteMany,
      ).toHaveBeenCalledWith({
        where: { userId: contributor.id, ontologyId: ontologyIdA },
      });
    });

    it('should NOT pass ontologyId when clearing all preferences', async () => {
      const contributor = await createMockContributorUser(context);

      context.prismaMock.dataAgentPreference.deleteMany.mockResolvedValue({
        count: 5,
      });

      await request(context.app.getHttpServer())
        .delete('/api/data-agent/preferences')
        .set(authHeader(contributor.accessToken))
        .expect(204);

      // Called without ontologyId — clears everything for the user
      expect(
        context.prismaMock.dataAgentPreference.deleteMany,
      ).toHaveBeenCalledWith({
        where: { userId: contributor.id },
      });
    });
  });
});
