import { Command } from 'commander';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { exec, execCapture, confirm } from '../utils/exec.js';
import { paths } from '../utils/paths.js';
import { config } from '../utils/config.js';
import * as output from '../utils/output.js';

/**
 * Structured database connection information
 */
interface DatabaseConnectionInfo {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
  ssl: boolean;
  url: string;
  maskedUrl: string;
  envPath: string;
}

/**
 * Load database connection parameters from infra/compose/.env
 */
function loadDatabaseEnv(verbose: boolean = true): Record<string, string> {
  const envPath = join(paths.composeDir, '.env');

  if (verbose) {
    output.step(1, `Loading environment from ${envPath}`);
  }

  if (!existsSync(envPath)) {
    if (verbose) {
      output.warn(`  Environment file not found: ${envPath}`);
      output.warn('  Using default values for all database parameters');
    }
    return {};
  }

  const content = readFileSync(envPath, 'utf-8');
  const vars: Record<string, string> = {};
  let dbVarCount = 0;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    vars[key] = value;
    if (key.startsWith('POSTGRES_')) dbVarCount++;
  }

  if (verbose) {
    output.success(`  Loaded ${Object.keys(vars).length} variables (${dbVarCount} database params)`);
  }

  return vars;
}

/**
 * Get structured database connection info from env vars
 */
function getDatabaseConnection(verbose: boolean = true): DatabaseConnectionInfo {
  const env = loadDatabaseEnv(verbose);

  const host = env.POSTGRES_HOST || 'localhost';
  const port = env.POSTGRES_PORT || '5432';
  const user = env.POSTGRES_USER || 'postgres';
  const password = env.POSTGRES_PASSWORD || 'postgres';
  const database = env.POSTGRES_DB || 'appdb';
  const ssl = env.POSTGRES_SSL === 'true';

  if (verbose) {
    output.step(2, 'Constructing DATABASE_URL from parameters');
  }

  const encodedPassword = encodeURIComponent(password);
  const sslParam = ssl ? '?sslmode=require' : '';
  const url = `postgresql://${user}:${encodedPassword}@${host}:${port}/${database}${sslParam}`;

  const maskedPwd = output.maskPassword(password);
  const maskedUrl = `postgresql://${user}:${maskedPwd}@${host}:${port}/${database}${sslParam}`;

  return {
    host,
    port,
    user,
    password,
    database,
    ssl,
    url,
    maskedUrl,
    envPath: join(paths.composeDir, '.env'),
  };
}

/**
 * Display the connection info box
 */
function displayConnectionInfo(conn: DatabaseConnectionInfo): void {
  output.connectionBox({
    host: conn.host,
    port: conn.port,
    database: conn.database,
    user: conn.user,
    password: conn.password,
    ssl: conn.ssl,
    databaseUrl: conn.maskedUrl,
    source: conn.envPath,
  });
}

/**
 * Get a short connection summary string (host:port/db) without logging
 */
export function getConnectionSummary(): string {
  const conn = getDatabaseConnection(false);
  return `${conn.host}:${conn.port}/${conn.database}`;
}

/**
 * Check if API container is running
 */
async function isContainerRunning(): Promise<boolean> {
  const result = await execCapture('docker', [
    'ps',
    '--filter',
    `name=${config.containerName}`,
    '--format',
    '{{.Names}}',
  ]);

  return result.stdout.trim().includes(config.containerName);
}

/**
 * Run a Prisma command inside the Docker container
 */
async function runPrismaInDocker(prismaArgs: string): Promise<number> {
  output.step(3, 'Checking if API container is running...');
  const running = await isContainerRunning();

  if (!running) {
    output.error(`  Container "${config.containerName}" is not running.`);
    output.info('  Start the services first with: app start');
    return 1;
  }
  output.success(`  Container "${config.containerName}" is running`);

  const conn = getDatabaseConnection();
  displayConnectionInfo(conn);

  output.step(4, `Executing in Docker: npx prisma ${prismaArgs}`);
  output.dim(`  docker exec -e DATABASE_URL=*** ${config.containerName} sh -c "npx prisma ${prismaArgs}"`);
  output.blank();

  const code = await exec('docker', [
    'exec',
    '-e',
    `DATABASE_URL=${conn.url}`,
    config.containerName,
    'sh',
    '-c',
    `npx prisma ${prismaArgs}`,
  ]);

  output.blank();
  if (code === 0) {
    output.step(5, 'Command completed successfully');
  } else {
    output.step(5, `Command exited with code ${code}`);
  }

  return code;
}

/**
 * Generate Prisma client
 */
async function prismaGenerate(): Promise<void> {
  output.header('Prisma Generate');
  output.info('Generating Prisma client from schema...');
  output.blank();

  const code = await runPrismaInDocker('generate');

  if (code === 0) {
    output.success('Prisma client generated!');
  } else {
    output.error('Failed to generate Prisma client');
    process.exit(code);
  }
}

/**
 * Run Prisma migrations
 */
async function prismaMigrate(mode?: string): Promise<void> {
  output.header('Prisma Migrate');

  switch (mode?.toLowerCase()) {
    case 'deploy':
      output.info('Applying migrations (production mode)...');
      break;
    case 'status':
      output.info('Checking migration status...');
      break;
    default:
      output.info('Applying pending migrations...');
  }
  output.blank();

  const command = mode === 'status' ? 'migrate status' : 'migrate deploy';

  const code = await runPrismaInDocker(command);

  if (code === 0) {
    if (mode !== 'status') {
      output.success('Migrations applied!');
      output.blank();
      output.info('To seed the database, run: app prisma seed');
    }
  } else {
    output.error('Migration failed');
    process.exit(code);
  }
}

/**
 * Push schema changes directly
 */
async function prismaPush(): Promise<void> {
  output.header('Prisma Push');
  output.info('Pushing schema changes to database...');
  output.blank();

  const code = await runPrismaInDocker('db push');

  if (code === 0) {
    output.success('Schema pushed successfully!');
  } else {
    output.error('Failed to push schema');
    process.exit(code);
  }
}

/**
 * Open Prisma Studio
 */
async function prismaStudio(): Promise<void> {
  output.header('Prisma Studio');
  output.info('Opening Prisma Studio (local process)...');
  output.blank();

  const conn = getDatabaseConnection();
  displayConnectionInfo(conn);

  output.step(3, 'Starting Prisma Studio locally (not in Docker)');
  output.info('  Studio will be available at: http://localhost:5555');
  output.warn('  Note: Studio runs locally to allow browser access');
  output.blank();

  const code = await exec('npx', ['prisma', 'studio'], {
    cwd: paths.apiDir,
    env: { ...process.env, DATABASE_URL: conn.url },
  });

  if (code !== 0) {
    output.error('Failed to start Prisma Studio');
    process.exit(code);
  }
}

/**
 * Seed the database
 */
async function prismaSeed(): Promise<void> {
  output.header('Prisma Seed');
  output.info('Seeding database...');
  output.blank();

  const code = await runPrismaInDocker('db seed');

  if (code === 0) {
    output.success('Database seeded!');
  } else {
    output.error('Failed to seed database');
    process.exit(code);
  }
}

/**
 * Reset the database
 */
async function prismaReset(): Promise<void> {
  output.header('Prisma Reset');
  output.warn('WARNING: This will reset the database and DELETE all data!');

  const confirmed = await confirm('Are you sure?');

  if (confirmed) {
    output.info('Resetting database...');
    output.blank();

    const code = await runPrismaInDocker('migrate reset --force');

    if (code === 0) {
      output.success('Database reset complete!');
    } else {
      output.error('Failed to reset database');
      process.exit(code);
    }
  } else {
    output.info('Reset cancelled.');
  }
}

/**
 * Show Prisma help
 */
function showPrismaHelp(): void {
  output.blank();
  output.header('Prisma Commands (runs inside Docker)');
  output.blank();
  console.log('Usage: app prisma <command>');
  output.blank();
  console.log('Commands:');
  console.log('  generate       Generate Prisma client after schema changes');
  console.log('  migrate        Apply pending migrations to database');
  console.log('  migrate status Check migration status');
  console.log('  push           Push schema changes directly (dev, no migration file)');
  console.log('  studio         Open Prisma Studio GUI (runs locally)');
  console.log('  seed           Run database seed script');
  console.log('  reset          Reset database (destroys all data)');
  output.blank();
  console.log('Workflow:');
  console.log('  1. app prisma migrate    # Apply migrations');
  console.log('  2. app prisma seed       # Seed initial data');
  output.blank();
  console.log('Examples:');
  console.log('  app prisma migrate');
  console.log('  app prisma migrate status');
  console.log('  app prisma seed');
  console.log('  app prisma studio');
  output.blank();
  console.log('Note: Commands run inside the Docker API container to ensure');
  console.log('      proper database connectivity.');
  console.log('      Database connection parameters are read from infra/compose/.env');
  output.blank();
}

/**
 * Register Prisma commands with Commander
 */
export function registerPrismaCommands(program: Command): void {
  const prismaCmd = program
    .command('prisma')
    .description('Prisma operations. Options: generate, migrate, studio, reset')
    .argument('[command]', 'Prisma command')
    .argument('[option]', 'Command option (e.g., status for migrate)')
    .action(async (command?: string, option?: string) => {
      switch (command?.toLowerCase()) {
        case 'generate':
          await prismaGenerate();
          break;

        case 'migrate':
          await prismaMigrate(option);
          break;

        case 'push':
          await prismaPush();
          break;

        case 'studio':
          await prismaStudio();
          break;

        case 'seed':
          await prismaSeed();
          break;

        case 'reset':
          await prismaReset();
          break;

        default:
          showPrismaHelp();
          break;
      }
    });
}

// Export for interactive mode
export {
  prismaGenerate,
  prismaMigrate,
  prismaPush,
  prismaStudio,
  prismaSeed,
  prismaReset,
  isContainerRunning,
};
