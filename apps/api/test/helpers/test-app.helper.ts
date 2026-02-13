import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { NeoGraphService } from '../../src/neo-graph/neo-graph.service';
import { NeoVectorService } from '../../src/neo-graph/neo-vector.service';
import { prismaMock } from '../mocks/prisma.mock';

export interface TestContext {
  app: NestFastifyApplication;
  prisma: PrismaService;
  /** Access to Prisma mock methods (only available when isMocked is true) */
  prismaMock: any;
  module: TestingModule;
  isMocked: boolean;
}

export interface TestAppOptions {
  /**
   * If true, uses a mocked PrismaService instead of connecting to a real database
   * This is recommended for unit/integration tests
   * Set to false only for true E2E tests that need a real database
   */
  useMockDatabase?: boolean;
}

/**
 * Creates a fully configured test application
 * By default, uses mocked PrismaService (no real database)
 */
export async function createTestApp(
  options: TestAppOptions = {},
): Promise<TestContext> {
  // Ensure ENCRYPTION_KEY is set for tests (ConnectionsService requires it at construction time)
  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = 'test-encryption-key-32bytes!!!!!';
  }

  // Default to mocked database for unit/integration tests
  const shouldUseMock = options.useMockDatabase ?? true;

  // Create mocks for Neo4j services (always mocked in tests)
  const mockSession = {
    run: jest.fn(),
    close: jest.fn(),
    executeRead: jest.fn(),
    executeWrite: jest.fn(),
  };

  const mockDriver = {
    session: jest.fn().mockReturnValue(mockSession),
    close: jest.fn(),
  };

  const neoGraphMock = {
    onModuleInit: jest.fn().mockResolvedValue(undefined),
    onModuleDestroy: jest.fn().mockResolvedValue(undefined),
    getSession: jest.fn().mockReturnValue(mockSession),
    readTransaction: jest.fn(),
    writeTransaction: jest.fn(),
    verifyConnectivity: jest.fn().mockResolvedValue(undefined),
    getDriver: jest.fn().mockReturnValue(mockDriver),
  };

  const neoVectorMock = {
    ensureVectorIndex: jest.fn().mockResolvedValue(undefined),
    updateNodeEmbeddings: jest.fn().mockResolvedValue(undefined),
    searchSimilar: jest.fn().mockResolvedValue([]),
  };

  let moduleFixture: TestingModule;

  if (shouldUseMock) {
    // Create test module with mocked PrismaService and Neo4j services
    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(NeoGraphService)
      .useValue(neoGraphMock)
      .overrideProvider(NeoVectorService)
      .useValue(neoVectorMock)
      .compile();
  } else {
    // Create test module with real database but mocked Neo4j (for true E2E tests)
    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(NeoGraphService)
      .useValue(neoGraphMock)
      .overrideProvider(NeoVectorService)
      .useValue(neoVectorMock)
      .compile();
  }

  const app = moduleFixture.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
  );

  // Register cookie plugin for auth tests
  await app.register(fastifyCookie, {
    secret: 'test-secret',
  });

  app.setGlobalPrefix('api');
  // Note: ZodValidationPipe is already registered globally via APP_PIPE in AppModule
  // Do NOT add a standard ValidationPipe here as it conflicts with Zod DTOs

  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  const prisma = moduleFixture.get<PrismaService>(PrismaService);

  return {
    app,
    prisma,
    prismaMock: shouldUseMock ? prismaMock : null,
    module: moduleFixture,
    isMocked: shouldUseMock,
  };
}

/**
 * Creates a minimal test module for unit testing
 */
export async function createTestModule(
  imports: any[] = [],
  providers: any[] = [],
): Promise<TestingModule> {
  return Test.createTestingModule({
    imports,
    providers,
  }).compile();
}

/**
 * Closes the test application and cleans up
 */
export async function closeTestApp(context: TestContext): Promise<void> {
  if (context && context.app) {
    await context.app.close();
  }
  // Skip disconnect if using mocked database
  if (context && context.prisma && !context.isMocked) {
    await context.prisma.$disconnect();
  }
}
