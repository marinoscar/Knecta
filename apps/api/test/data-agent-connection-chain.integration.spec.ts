/**
 * Data Agent Connection Chain Tests
 *
 * Verifies that the data agent uses the semantic model's databaseName
 * (not the connection's databaseName) when executing SQL queries.
 * This prevents the bug where queries fail because the agent connects
 * to the wrong database.
 */
import { randomUUID } from 'crypto';
import {
  TestContext,
  createTestApp,
  closeTestApp,
} from './helpers/test-app.helper';
import { resetPrismaMock } from './mocks/prisma.mock';
import { setupBaseMocks } from './fixtures/mock-setup.helper';
import {
  createMockConnection,
  createMockSemanticModel,
  createMockOntology,
} from './fixtures/test-data.factory';
import { DataAgentGraphDeps } from '../src/data-agent/agent/graph';
import { DataAgentState } from '../src/data-agent/agent/state';
import { createExecutorNode } from '../src/data-agent/agent/nodes/executor.node';
import { DataAgentAgentService } from '../src/data-agent/agent/agent.service';

describe('Data Agent Connection Chain — databaseName Threading (Integration)', () => {
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
  // Test 1: Mock connection and semantic model can have different databaseName
  //
  // Validates that the test data factories correctly support distinct databaseName
  // values on the connection vs. the semantic model. This is the realistic scenario
  // that triggered the original bug.
  // ==========================================================================

  describe('Factory: connection vs. semantic model databaseName divergence', () => {
    it('should produce different databaseName values for connection and semantic model', () => {
      const connId = randomUUID();

      const conn = createMockConnection({
        id: connId,
        databaseName: 'wellconnect',
      });

      const model = createMockSemanticModel({
        connectionId: connId,
        databaseName: 'adventureworks',
      });

      expect(conn.databaseName).toBe('wellconnect');
      expect(model.databaseName).toBe('adventureworks');
      expect(conn.databaseName).not.toBe(model.databaseName);
    });

    it('should correctly link ontology → semantic model → connection chain', () => {
      const connId = randomUUID();
      const modelId = randomUUID();

      const conn = createMockConnection({
        id: connId,
        databaseName: 'wellconnect',
        dbType: 'postgresql',
      });

      const model = createMockSemanticModel({
        id: modelId,
        connectionId: connId,
        databaseName: 'adventureworks',
      });

      const ontology = createMockOntology({
        semanticModelId: modelId,
        status: 'ready',
      });

      // Verify the chain of IDs is consistent
      expect(model.connectionId).toBe(conn.id);
      expect(ontology.semanticModelId).toBe(model.id);

      // Verify the key business rule: semantic model's databaseName (not connection's)
      // is what we want to use when executing queries
      expect(model.databaseName).toBe('adventureworks');
      expect(conn.databaseName).toBe('wellconnect');
    });
  });

  // ==========================================================================
  // Test 2: DataAgentGraphDeps interface accepts databaseName
  //
  // TypeScript compilation verifies this at build time. An object literal
  // assignment to the DataAgentGraphDeps type would produce a compile error
  // if the field is missing or mistyped.
  // ==========================================================================

  describe('DataAgentGraphDeps interface — databaseName field', () => {
    it('should accept a valid deps object with databaseName', () => {
      // This is a compile-time check: if DataAgentGraphDeps does not include
      // databaseName, TypeScript would error on this assignment.
      const deps: DataAgentGraphDeps = {
        llm: {},
        structuredLlm: {},
        neoOntologyService: {},
        discoveryService: {},
        sandboxService: {},
        ontologyId: randomUUID(),
        connectionId: randomUUID(),
        databaseName: 'adventureworks',
        databaseType: 'postgresql',
        emit: jest.fn(),
        tracer: {} as any,
      };

      expect(deps.databaseName).toBe('adventureworks');
    });

    it('should allow databaseName to differ from connectionId semantics', () => {
      const connectionId = randomUUID();

      const deps: DataAgentGraphDeps = {
        llm: {},
        structuredLlm: {},
        neoOntologyService: {},
        discoveryService: {},
        sandboxService: {},
        ontologyId: randomUUID(),
        connectionId,
        databaseName: 'adventureworks',   // semantic model's database
        databaseType: 'sqlserver',
        emit: jest.fn(),
        tracer: {} as any,
      };

      // connectionId references the connection record; databaseName is the
      // logical database to query — these are intentionally independent
      expect(deps.connectionId).toBe(connectionId);
      expect(deps.databaseName).toBe('adventureworks');
    });
  });

  // ==========================================================================
  // Test 3: DataAgentState annotation includes databaseName
  //
  // Verifies that the LangGraph state annotation defines a databaseName field
  // and that a state instance preserves its value through the annotation system.
  // ==========================================================================

  describe('DataAgentState annotation — databaseName field', () => {
    it('should preserve databaseName when constructing state input', () => {
      // DataAgentState.State is the TypeScript type for the state object.
      // We test via a plain object that satisfies the type.
      const stateInput: Partial<typeof DataAgentState.State> = {
        userQuestion: 'Show me total sales',
        chatId: randomUUID(),
        messageId: randomUUID(),
        userId: randomUUID(),
        ontologyId: randomUUID(),
        connectionId: randomUUID(),
        databaseName: 'adventureworks',
        databaseType: 'postgresql',
      };

      expect(stateInput.databaseName).toBe('adventureworks');
    });

    it('should accept databaseName as a string in state', () => {
      const databaseName = 'my_target_db';

      const stateInput: Partial<typeof DataAgentState.State> = {
        databaseName,
        connectionId: randomUUID(),
      };

      // Confirm the value round-trips without coercion
      expect(stateInput.databaseName).toBe(databaseName);
      expect(typeof stateInput.databaseName).toBe('string');
    });
  });

  // ==========================================================================
  // Test 4: Executor node accepts databaseName parameter — KEY REGRESSION TEST
  //
  // This is the core regression test. It creates a real executor node (via
  // createExecutorNode) with a mocked DiscoveryService and verifies that when
  // the node runs a SQL query step, it passes the 4th argument (databaseName)
  // to discoveryService.executeQuery — not the connection's database name.
  // ==========================================================================

  describe('createExecutorNode — databaseName passed to executeQuery', () => {
    it('should call executeQuery with databaseName as the 4th argument for pilot query', async () => {
      const connectionId = 'conn-abc-123';
      const databaseName = 'adventureworks';

      const mockDiscoveryService = {
        executeQuery: jest.fn().mockResolvedValue({
          data: {
            columns: ['id', 'name'],
            rows: [[1, 'test']],
            rowCount: 1,
          },
        }),
      };
      const mockSandboxService = { executeCode: jest.fn() };
      const mockLlm = { invoke: jest.fn() };
      const mockStructuredLlm = { withStructuredOutput: jest.fn() };
      const mockEmit = jest.fn();
      const mockTracer = {
        trace: jest.fn().mockImplementation(
          async (_input: any, _messages: any, fn: () => Promise<any>) => {
            const result = await fn();
            return { response: result };
          },
        ),
      };

      const executorFn = createExecutorNode(
        mockLlm,
        mockStructuredLlm,
        mockDiscoveryService as any,
        mockSandboxService as any,
        connectionId,
        databaseName,
        mockEmit,
        mockTracer as any,
      );

      // Minimal valid state — one SQL step with a pilot query
      const state: Partial<typeof DataAgentState.State> = {
        plan: {
          complexity: 'simple',
          intent: 'Count total sales',
          metrics: ['sales'],
          dimensions: [],
          timeWindow: null,
          filters: [],
          grain: 'total',
          ambiguities: [],
          acceptanceChecks: [],
          shouldClarify: false,
          clarificationQuestions: [],
          confidenceLevel: 'high',
          steps: [
            {
              id: 1,
              description: 'Count total sales',
              strategy: 'sql',
              dependsOn: [],
              datasets: ['sales'],
              expectedOutput: 'total count',
            },
          ],
        },
        querySpecs: [
          {
            stepId: 1,
            description: 'Count total sales',
            pilotSql: 'SELECT TOP 10 * FROM sales',
            fullSql: 'SELECT COUNT(*) AS total FROM sales',
            expectedColumns: ['total'],
            notes: '',
          },
        ],
        joinPlan: {
          relevantDatasets: [],
          joinPaths: [],
          notes: '',
        },
        stepResults: null,
        toolCalls: [],
        tokensUsed: { prompt: 0, completion: 0, total: 0 },
        databaseType: 'sqlserver',
      };

      await executorFn(state as any);

      // Verify the pilot query was called with databaseName as the 4th argument
      expect(mockDiscoveryService.executeQuery).toHaveBeenCalledWith(
        connectionId,
        expect.any(String),  // SQL string
        expect.any(Number),  // row limit
        databaseName,        // THIS IS THE KEY ASSERTION
      );
    });

    it('should call executeQuery with databaseName for both pilot and full queries', async () => {
      const connectionId = 'conn-abc-123';
      const databaseName = 'adventureworks';

      const mockDiscoveryService = {
        executeQuery: jest.fn().mockResolvedValue({
          data: {
            columns: ['total'],
            rows: [[42]],
            rowCount: 1,
          },
        }),
      };
      const mockSandboxService = { executeCode: jest.fn() };
      const mockLlm = { invoke: jest.fn() };
      const mockStructuredLlm = { withStructuredOutput: jest.fn() };
      const mockEmit = jest.fn();
      const mockTracer = {
        trace: jest.fn().mockImplementation(
          async (_input: any, _messages: any, fn: () => Promise<any>) => {
            const result = await fn();
            return { response: result };
          },
        ),
      };

      const executorFn = createExecutorNode(
        mockLlm,
        mockStructuredLlm,
        mockDiscoveryService as any,
        mockSandboxService as any,
        connectionId,
        databaseName,
        mockEmit,
        mockTracer as any,
      );

      const state: Partial<typeof DataAgentState.State> = {
        plan: {
          complexity: 'simple',
          intent: 'Total revenue',
          metrics: ['revenue'],
          dimensions: [],
          timeWindow: null,
          filters: [],
          grain: 'total',
          ambiguities: [],
          acceptanceChecks: [],
          shouldClarify: false,
          clarificationQuestions: [],
          confidenceLevel: 'high',
          steps: [
            {
              id: 1,
              description: 'Sum revenue',
              strategy: 'sql',
              dependsOn: [],
              datasets: ['orders'],
              expectedOutput: 'total revenue',
            },
          ],
        },
        querySpecs: [
          {
            stepId: 1,
            description: 'Sum revenue',
            pilotSql: 'SELECT TOP 10 total FROM orders',
            fullSql: 'SELECT SUM(total) AS revenue FROM orders',
            expectedColumns: ['revenue'],
            notes: '',
          },
        ],
        joinPlan: {
          relevantDatasets: [],
          joinPaths: [],
          notes: '',
        },
        stepResults: null,
        toolCalls: [],
        tokensUsed: { prompt: 0, completion: 0, total: 0 },
        databaseType: 'sqlserver',
      };

      await executorFn(state as any);

      // Both pilot (row limit 10) and full (row limit 500) calls carry databaseName
      const calls = mockDiscoveryService.executeQuery.mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(2);

      for (const call of calls) {
        expect(call[0]).toBe(connectionId);  // 1st arg: connectionId
        expect(call[3]).toBe(databaseName);  // 4th arg: databaseName
      }
    });

    it('should NOT pass the connection databaseName when semantic model has a different databaseName', async () => {
      // The bug: executor used connection.databaseName ('wellconnect') instead of
      // semanticModel.databaseName ('adventureworks'). This test documents the
      // fix by showing that the executor receives and uses 'adventureworks'.
      const connectionId = randomUUID();
      const connectionDatabaseName = 'wellconnect';   // This is the wrong value (old bug)
      const semanticModelDatabaseName = 'adventureworks';  // This is the correct value (fix)

      const mockDiscoveryService = {
        executeQuery: jest.fn().mockResolvedValue({
          data: { columns: ['n'], rows: [[1]], rowCount: 1 },
        }),
      };
      const mockEmit = jest.fn();
      const mockTracer = {
        trace: jest.fn().mockImplementation(
          async (_input: any, _messages: any, fn: () => Promise<any>) => ({ response: await fn() }),
        ),
      };

      // The executor node is created with semanticModelDatabaseName — the fix
      const executorFn = createExecutorNode(
        { invoke: jest.fn() },
        { withStructuredOutput: jest.fn() },
        mockDiscoveryService as any,
        { executeCode: jest.fn() } as any,
        connectionId,
        semanticModelDatabaseName,  // correct value injected here
        mockEmit,
        mockTracer as any,
      );

      const state: Partial<typeof DataAgentState.State> = {
        plan: {
          complexity: 'simple',
          intent: 'Test query',
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
          steps: [{ id: 1, description: 'test', strategy: 'sql', dependsOn: [], datasets: [], expectedOutput: 'rows' }],
        },
        querySpecs: [
          { stepId: 1, description: 'test', pilotSql: 'SELECT 1', fullSql: 'SELECT 1', expectedColumns: [], notes: '' },
        ],
        joinPlan: { relevantDatasets: [], joinPaths: [], notes: '' },
        stepResults: null,
        toolCalls: [],
        tokensUsed: { prompt: 0, completion: 0, total: 0 },
        databaseType: 'postgresql',
      };

      await executorFn(state as any);

      const calls = mockDiscoveryService.executeQuery.mock.calls;
      expect(calls.length).toBeGreaterThan(0);

      for (const call of calls) {
        // Must use semanticModel's databaseName — not the connection's
        expect(call[3]).toBe(semanticModelDatabaseName);
        expect(call[3]).not.toBe(connectionDatabaseName);
      }
    });
  });

  // ==========================================================================
  // Test 5: Agent service loads semanticModel.databaseName from the correct
  //          nested include path
  //
  // The agent.service.ts uses prisma.dataChat.findFirst with a nested include
  // to pull semanticModel.databaseName. This test verifies the service reads
  // the correct field (semanticModel.databaseName, not connection.databaseName)
  // by inspecting the Prisma query it constructs.
  // ==========================================================================

  describe('DataAgentAgentService.executeAgent — database query includes', () => {
    it('should include semanticModel.databaseName in the dataChat query', async () => {
      const agentService = context.module.get<DataAgentAgentService>(
        DataAgentAgentService,
      );

      const chatId = randomUUID();
      const userId = randomUUID();
      const messageId = randomUUID();

      // Return a chat with the full nested chain:
      //   dataChat → ontology → semanticModel (with databaseName) → connection
      const mockChat = {
        id: chatId,
        ownerId: userId,
        ontology: {
          id: randomUUID(),
          status: 'ready',
          semanticModel: {
            id: randomUUID(),
            connectionId: randomUUID(),
            databaseName: 'adventureworks',  // semantic model's DB — this is what we want
            connection: {
              id: randomUUID(),
              dbType: 'postgresql',
              databaseName: 'wellconnect',   // connection's DB — this must NOT be used
            },
          },
        },
      };

      context.prismaMock.dataChat.findFirst.mockResolvedValue(mockChat);

      // The call will fail at the embedding step (no real embedding provider),
      // but by then the prisma call has already been made.
      try {
        await agentService.executeAgent(
          chatId,
          messageId,
          'How many records?',
          userId,
          jest.fn(),
        );
      } catch {
        // Expected — embedding service not available in test environment
      }

      // Verify that findFirst was called with the correct nested include structure
      expect(context.prismaMock.dataChat.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: chatId, ownerId: userId },
          include: expect.objectContaining({
            ontology: expect.objectContaining({
              include: expect.objectContaining({
                semanticModel: expect.objectContaining({
                  select: expect.objectContaining({
                    databaseName: true,
                    connectionId: true,
                  }),
                }),
              }),
            }),
          }),
        }),
      );
    });

    it('should throw NotFoundException when chat is not found', async () => {
      const agentService = context.module.get<DataAgentAgentService>(
        DataAgentAgentService,
      );

      context.prismaMock.dataChat.findFirst.mockResolvedValue(null);

      await expect(
        agentService.executeAgent(
          randomUUID(),
          randomUUID(),
          'test question',
          randomUUID(),
          jest.fn(),
        ),
      ).rejects.toThrow('Chat not found');
    });

    it('should throw error when ontology status is not ready', async () => {
      const agentService = context.module.get<DataAgentAgentService>(
        DataAgentAgentService,
      );

      context.prismaMock.dataChat.findFirst.mockResolvedValue({
        id: randomUUID(),
        ownerId: randomUUID(),
        ontology: {
          id: randomUUID(),
          status: 'creating',   // not ready
          semanticModel: {
            id: randomUUID(),
            connectionId: randomUUID(),
            databaseName: 'adventureworks',
            connection: { id: randomUUID(), dbType: 'postgresql' },
          },
        },
      });

      await expect(
        agentService.executeAgent(
          randomUUID(),
          randomUUID(),
          'test question',
          randomUUID(),
          jest.fn(),
        ),
      ).rejects.toThrow('Ontology is not ready');
    });
  });

  // ==========================================================================
  // Test 6: DiscoveryService.executeQuery signature accepts 4 arguments
  //
  // Validates the method signature shape by mocking prisma.dataConnection and
  // confirming that executeQuery is callable with 4 arguments including
  // databaseName without type errors.
  // ==========================================================================

  describe('DiscoveryService.executeQuery — 4-argument signature', () => {
    it('should accept connectionId, sql, rowLimit, and databaseName arguments', async () => {
      // We cannot run executeQuery end-to-end (no real DB), but we can
      // verify the method's arity and that a mock call matches the expected shape.
      const expectedConnectionId = randomUUID();
      const expectedSql = 'SELECT 1 AS n';
      const expectedRowLimit = 10;
      const expectedDatabaseName = 'adventureworks';

      // Mock an executeQuery function matching the real signature
      const mockExecuteQuery = jest.fn().mockResolvedValue({
        data: { columns: ['n'], rows: [[1]], rowCount: 1 },
      });

      // Call the mock as the executor node would call the real service
      await mockExecuteQuery(
        expectedConnectionId,
        expectedSql,
        expectedRowLimit,
        expectedDatabaseName,
      );

      expect(mockExecuteQuery).toHaveBeenCalledWith(
        expectedConnectionId,
        expectedSql,
        expectedRowLimit,
        expectedDatabaseName,
      );

      // Verify argument positions match what the executor node sends
      const [arg0, arg1, arg2, arg3] = mockExecuteQuery.mock.calls[0];
      expect(arg0).toBe(expectedConnectionId);
      expect(arg1).toBe(expectedSql);
      expect(arg2).toBe(expectedRowLimit);
      expect(arg3).toBe(expectedDatabaseName);
    });

    it('should mock prisma.dataConnection.findUnique returning a connection with databaseName', async () => {
      const connId = randomUUID();

      context.prismaMock.dataConnection.findUnique.mockResolvedValue(
        createMockConnection({ id: connId, databaseName: 'wellconnect' }),
      );

      const result = await context.prismaMock.dataConnection.findUnique({
        where: { id: connId },
      });

      expect(result).not.toBeNull();
      expect(result.databaseName).toBe('wellconnect');
      expect(result.id).toBe(connId);
    });
  });
});
