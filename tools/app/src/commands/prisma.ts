import { Command } from 'commander';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { exec, execCapture, confirm } from '../utils/exec.js';
import { paths } from '../utils/paths.js';
import { config } from '../utils/config.js';
import * as output from '../utils/output.js';

/**
 * Load database connection parameters from infra/compose/.env
 */
function loadDatabaseEnv(): Record<string, string> {
  const envPath = join(paths.composeDir, '.env');
  const vars: Record<string, string> = {};

  if (!existsSync(envPath)) {
    output.warn(`Environment file not found: ${envPath}`);
    return vars;
  }

  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    vars[key] = value;
  }

  return vars;
}

/**
 * Construct PostgreSQL DATABASE_URL from env vars
 */
function getDatabaseUrl(): string {
  const env = loadDatabaseEnv();
  const host = env.POSTGRES_HOST || 'localhost';
  const port = env.POSTGRES_PORT || '5432';
  const user = env.POSTGRES_USER || 'postgres';
  const password = env.POSTGRES_PASSWORD || 'postgres';
  const dbName = env.POSTGRES_DB || 'appdb';
  const ssl = env.POSTGRES_SSL === 'true';

  const encodedPassword = encodeURIComponent(password);
  const sslParam = ssl ? '?sslmode=require' : '';

  return `postgresql://${user}:${encodedPassword}@${host}:${port}/${dbName}${sslParam}`;
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
  const running = await isContainerRunning();

  if (!running) {
    output.error('ERROR: API container is not running.');
    output.info('Start the services first with: app start');
    return 1;
  }

  const dbUrl = getDatabaseUrl();
  output.info(`Running in Docker container: npx prisma ${prismaArgs}`);

  return exec('docker', [
    'exec',
    '-e',
    `DATABASE_URL=${dbUrl}`,
    config.containerName,
    'sh',
    '-c',
    `npx prisma ${prismaArgs}`,
  ]);
}

/**
 * Generate Prisma client
 */
async function prismaGenerate(): Promise<void> {
  output.info('Generating Prisma client...');

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
  output.info('Pushing schema changes to database...');

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
  output.info('Opening Prisma Studio...');
  output.info('Studio will be available at: http://localhost:5555');
  output.warn('Note: Studio runs locally (not in Docker) to allow browser access');

  const dbUrl = getDatabaseUrl();

  const code = await exec('npx', ['prisma', 'studio'], {
    cwd: paths.apiDir,
    env: { ...process.env, DATABASE_URL: dbUrl },
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
  output.info('Seeding database...');

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
  output.warn('WARNING: This will reset the database and DELETE all data!');

  const confirmed = await confirm('Are you sure?');

  if (confirmed) {
    output.info('Resetting database...');

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
