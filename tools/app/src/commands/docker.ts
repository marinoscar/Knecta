import { Command } from 'commander';
import { exec, execCapture, execInterruptible, confirm, sleep } from '../utils/exec.js';
import { paths, verifyPaths } from '../utils/paths.js';
import * as output from '../utils/output.js';
import { checkHealth } from '../lib/api-client.js';

export interface DockerOptions {
  otel?: boolean;
}

// ---------------------------------------------------------------------------
// Post-start health check constants
// ---------------------------------------------------------------------------

/** Milliseconds to wait for containers to stabilize before checking */
const STABILIZATION_DELAY_MS = 3000;

/** Maximum time to wait for health endpoints to respond (ms) */
const HEALTH_CHECK_TIMEOUT_MS = 15000;

/** Interval between health check polling attempts (ms) */
const HEALTH_POLL_INTERVAL_MS = 2000;

/** Number of log lines to capture per service */
const LOG_TAIL_LINES = 50;

/** Services whose logs should be scanned when no specific service is given */
const MONITORED_SERVICES = ['api', 'web', 'db', 'neo4j', 'nginx'];

/** Error patterns to scan for in container logs */
const ERROR_PATTERNS: Array<{ pattern: RegExp; label: string; severity: 'error' | 'warn' }> = [
  // Node.js / NestJS errors
  { pattern: /Error: Cannot find module/i, label: 'Missing module', severity: 'error' },
  { pattern: /SyntaxError:/i, label: 'Syntax error', severity: 'error' },
  { pattern: /TypeError:/i, label: 'Type error', severity: 'error' },
  { pattern: /ReferenceError:/i, label: 'Reference error', severity: 'error' },
  { pattern: /FATAL\s+ERROR/i, label: 'Fatal error', severity: 'error' },
  { pattern: /UnhandledPromiseRejection/i, label: 'Unhandled promise rejection', severity: 'error' },
  { pattern: /\[Nest\]\s+\d+\s+-\s+.*ERROR/i, label: 'NestJS error', severity: 'error' },

  // Database connection errors
  { pattern: /ECONNREFUSED/i, label: 'Connection refused', severity: 'error' },
  { pattern: /ENOTFOUND/i, label: 'Host not found', severity: 'error' },
  { pattern: /ETIMEDOUT/i, label: 'Connection timeout', severity: 'error' },
  { pattern: /prisma.*error/i, label: 'Prisma error', severity: 'error' },
  { pattern: /Can't reach database server/i, label: 'Database unreachable', severity: 'error' },
  { pattern: /password authentication failed/i, label: 'Database auth failed', severity: 'error' },

  // Neo4j errors
  { pattern: /Neo4jError/i, label: 'Neo4j error', severity: 'error' },
  { pattern: /ServiceUnavailable/i, label: 'Service unavailable', severity: 'error' },

  // Process crashes
  { pattern: /npm ERR!/i, label: 'npm error', severity: 'error' },
  { pattern: /exited with code [^0]/i, label: 'Process exited with error', severity: 'error' },
  { pattern: /OOMKilled/i, label: 'Out of memory', severity: 'error' },
  { pattern: /segmentation fault/i, label: 'Segfault', severity: 'error' },

  // Nginx errors
  { pattern: /\[emerg\]/i, label: 'Nginx emergency', severity: 'error' },
  { pattern: /\[crit\]/i, label: 'Nginx critical', severity: 'error' },
  { pattern: /upstream .* failed/i, label: 'Nginx upstream failed', severity: 'warn' },

  // Warnings
  { pattern: /DeprecationWarning/i, label: 'Deprecation warning', severity: 'warn' },
  { pattern: /EACCES/i, label: 'Permission denied', severity: 'warn' },
];

// ---------------------------------------------------------------------------
// Post-start health check types and helpers
// ---------------------------------------------------------------------------

interface LogScanResult {
  service: string;
  errors: Array<{ line: string; label: string; severity: 'error' | 'warn' }>;
}

interface HealthPollResult {
  live: boolean;
  ready: boolean;
  attempts: number;
  timedOut: boolean;
}

/**
 * Truncate a log line for display
 */
function truncateLine(line: string, maxLength: number): string {
  if (line.length <= maxLength) return line;
  return line.substring(0, maxLength - 3) + '...';
}

/**
 * Capture recent logs for a service and scan for error patterns
 */
async function scanServiceLogs(
  composeArgs: string[],
  service: string,
): Promise<LogScanResult> {
  const result: LogScanResult = { service, errors: [] };

  const { code, stdout, stderr } = await execCapture(
    'docker',
    [...composeArgs, 'logs', '--tail', String(LOG_TAIL_LINES), '--no-log-prefix', service],
    { cwd: paths.composeDir },
  );

  if (code !== 0) {
    return result;
  }

  const logOutput = stdout + '\n' + stderr;
  const lines = logOutput.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    for (const { pattern, label, severity } of ERROR_PATTERNS) {
      if (pattern.test(trimmed)) {
        if (!result.errors.some((e) => e.line === trimmed)) {
          result.errors.push({ line: trimmed, label, severity });
        }
        break;
      }
    }
  }

  return result;
}

/**
 * Poll health endpoints with retries until they respond or timeout
 */
async function pollHealthEndpoints(): Promise<HealthPollResult> {
  const maxAttempts = Math.ceil(HEALTH_CHECK_TIMEOUT_MS / HEALTH_POLL_INTERVAL_MS);
  let attempts = 0;

  for (let i = 0; i < maxAttempts; i++) {
    attempts++;
    const health = await checkHealth();

    if (health.live && health.ready) {
      return { live: true, ready: true, attempts, timedOut: false };
    }

    if (i < maxAttempts - 1) {
      await sleep(HEALTH_POLL_INTERVAL_MS);
      continue;
    }

    return { live: health.live, ready: health.ready, attempts, timedOut: true };
  }

  return { live: false, ready: false, attempts, timedOut: true };
}

/**
 * Post-start health verification.
 * Waits for containers to stabilize, scans logs for errors,
 * and polls health endpoints. Reports findings to the user.
 */
async function postStartHealthCheck(service?: string): Promise<boolean> {
  output.blank();
  output.header('Post-Start Verification');

  // Step 1: Wait for containers to stabilize
  output.step(1, 'Waiting for containers to stabilize...');
  await sleep(STABILIZATION_DELAY_MS);

  // Step 2: Scan container logs for errors
  output.step(2, 'Scanning container logs for errors...');
  const composeArgs = getComposeArgs();
  const servicesToScan = service ? [service] : MONITORED_SERVICES;

  const logResults: LogScanResult[] = [];
  for (const svc of servicesToScan) {
    const result = await scanServiceLogs(composeArgs, svc);
    logResults.push(result);
  }

  // Step 3: Poll health endpoints
  output.step(3, 'Checking API health endpoints...');
  const healthResult = await pollHealthEndpoints();

  // Step 4: Report findings
  output.blank();
  let hasErrors = false;
  let hasWarnings = false;

  // Report log scan results
  const servicesWithErrors = logResults.filter(
    (r) => r.errors.some((e) => e.severity === 'error'),
  );
  const servicesWithWarnings = logResults.filter(
    (r) =>
      r.errors.some((e) => e.severity === 'warn') &&
      !r.errors.some((e) => e.severity === 'error'),
  );

  if (servicesWithErrors.length > 0) {
    hasErrors = true;
    output.error('Errors detected in container logs:');
    output.blank();

    for (const svcResult of servicesWithErrors) {
      const errors = svcResult.errors.filter((e) => e.severity === 'error');
      output.bold(`  ${svcResult.service} (${errors.length} error${errors.length > 1 ? 's' : ''}):`);
      for (const err of errors.slice(0, 5)) {
        output.error(`    [${err.label}] ${truncateLine(err.line, 120)}`);
      }
      if (errors.length > 5) {
        output.dim(`    ... and ${errors.length - 5} more`);
      }
    }
    output.blank();
  }

  if (servicesWithWarnings.length > 0) {
    hasWarnings = true;
    output.warn('Warnings detected in container logs:');
    for (const svcResult of servicesWithWarnings) {
      const warnings = svcResult.errors.filter((e) => e.severity === 'warn');
      for (const w of warnings.slice(0, 3)) {
        output.warn(`  [${svcResult.service}] ${w.label}: ${truncateLine(w.line, 100)}`);
      }
    }
    output.blank();
  }

  // Report health check results
  if (healthResult.live && healthResult.ready) {
    output.success(
      `API health: OK (responded after ${healthResult.attempts} attempt${healthResult.attempts > 1 ? 's' : ''})`,
    );
  } else if (healthResult.live && !healthResult.ready) {
    hasWarnings = true;
    output.warn('API health: Live but NOT ready (database may still be starting)');
    output.dim('  The API process is running but dependencies are not yet available.');
    output.dim('  Try again in a few seconds, or check: app health');
  } else {
    hasErrors = true;
    output.error('API health: NOT responding');
    if (healthResult.timedOut) {
      output.dim(
        `  Timed out after ${healthResult.attempts} attempts (${HEALTH_CHECK_TIMEOUT_MS / 1000}s)`,
      );
    }
    output.dim('  The API may still be starting, or there may be a configuration issue.');
    output.dim('  Check logs: app logs api');
  }

  output.blank();

  // Final summary
  if (!hasErrors && !hasWarnings) {
    output.success('All checks passed. Services are healthy.');
  } else if (hasErrors) {
    output.error('Issues detected. Review the errors above.');
    output.info('Useful commands:');
    output.dim('  app logs api       # View API logs');
    output.dim('  app status         # Check container status');
    output.dim('  app health         # Re-check API health');
  } else {
    output.warn('Services started with warnings. Review the messages above.');
  }

  return !hasErrors;
}

// ---------------------------------------------------------------------------
// Docker compose commands
// ---------------------------------------------------------------------------

/**
 * Get docker compose command with appropriate files
 */
function getComposeArgs(otel: boolean = false): string[] {
  const args = [
    'compose',
    '-f',
    paths.baseCompose,
    '-f',
    paths.devCompose,
  ];

  if (otel) {
    args.push('-f', paths.otelCompose);
  }

  return args;
}

/**
 * Run docker compose command
 */
async function dockerCompose(
  composeArgs: string[],
  extraArgs: string[] = []
): Promise<number> {
  const allArgs = [...composeArgs, ...extraArgs];
  output.info(`Running: docker ${allArgs.join(' ')}`);
  return exec('docker', allArgs, { cwd: paths.composeDir });
}

/**
 * Start services
 */
export async function startServices(
  service?: string,
  options: DockerOptions = {}
): Promise<void> {
  output.info('Starting EnterpriseAppBase services...');

  if (options.otel) {
    output.info('Including OpenTelemetry observability stack...');
  }

  const composeArgs = getComposeArgs(options.otel);
  const args = ['up', '-d'];

  if (service) {
    args.push(service);
  }

  const code = await dockerCompose(composeArgs, args);

  if (code === 0) {
    output.success('Services started!');
    output.printServiceUrls(options.otel);
    await postStartHealthCheck(service);
  } else {
    output.error('Failed to start services');
    process.exit(code);
  }
}

/**
 * Stop services
 */
export async function stopServices(service?: string): Promise<void> {
  output.info('Stopping EnterpriseAppBase services...');

  const composeArgs = getComposeArgs();

  if (service) {
    const code = await dockerCompose(composeArgs, ['stop', service]);
    if (code === 0) {
      output.success(`Service ${service} stopped!`);
    } else {
      output.error(`Failed to stop service ${service}`);
      process.exit(code);
    }
  } else {
    const code = await dockerCompose(composeArgs, ['down']);
    if (code === 0) {
      output.success('Services stopped!');
    } else {
      output.error('Failed to stop services');
      process.exit(code);
    }
  }
}

/**
 * Restart services
 */
export async function restartServices(service?: string): Promise<void> {
  output.info('Restarting EnterpriseAppBase services...');

  const composeArgs = getComposeArgs();

  if (service) {
    const code = await dockerCompose(composeArgs, ['restart', service]);
    if (code === 0) {
      output.success(`Service ${service} restarted!`);
      await postStartHealthCheck(service);
    } else {
      output.error(`Failed to restart service ${service}`);
      process.exit(code);
    }
  } else {
    await dockerCompose(composeArgs, ['down']);
    const code = await dockerCompose(composeArgs, ['up', '-d']);
    if (code === 0) {
      output.success('Services restarted!');
      await postStartHealthCheck();
    } else {
      output.error('Failed to restart services');
      process.exit(code);
    }
  }
}

/**
 * Rebuild services
 */
export async function rebuildServices(
  service?: string,
  options: DockerOptions = {}
): Promise<void> {
  output.info('Rebuilding EnterpriseAppBase services (no cache)...');

  if (options.otel) {
    output.info('Including OpenTelemetry observability stack...');
  }

  const composeArgs = getComposeArgs(options.otel);

  if (service) {
    await dockerCompose(composeArgs, ['build', '--no-cache', service]);
    const code = await dockerCompose(composeArgs, ['up', '-d', service]);
    if (code === 0) {
      output.success(`Service ${service} rebuilt and started!`);
      output.printServiceUrls(options.otel);
      await postStartHealthCheck(service);
    } else {
      output.error(`Failed to rebuild service ${service}`);
      process.exit(code);
    }
  } else {
    await dockerCompose(composeArgs, ['build', '--no-cache']);
    const code = await dockerCompose(composeArgs, ['up', '-d']);
    if (code === 0) {
      output.success('Services rebuilt and started!');
      output.printServiceUrls(options.otel);
      await postStartHealthCheck();
    } else {
      output.error('Failed to rebuild services');
      process.exit(code);
    }
  }
}

/**
 * Show logs (interruptible - Ctrl+C returns to menu)
 */
export async function showLogs(service?: string): Promise<void> {
  output.info('Showing logs (Ctrl+C to return)...');
  output.blank();

  const composeArgs = getComposeArgs();
  const allArgs = [...composeArgs, 'logs', '-f'];

  if (service) {
    allArgs.push(service);
  }

  // Use execInterruptible so Ctrl+C returns to menu instead of exiting
  await execInterruptible('docker', allArgs, { cwd: paths.composeDir });

  output.blank();
  output.info('Logs closed.');
}

/**
 * Show status
 */
export async function showStatus(): Promise<void> {
  output.info('Service Status:');
  output.blank();

  const composeArgs = getComposeArgs();
  await dockerCompose(composeArgs, ['ps']);
}

/**
 * Clean services (remove volumes)
 */
export async function cleanServices(): Promise<void> {
  output.warn(
    'WARNING: This will stop all services and DELETE all data (database, volumes)!'
  );

  const confirmed = await confirm('Are you sure?');

  if (confirmed) {
    output.info('Cleaning up EnterpriseAppBase services and volumes...');
    const composeArgs = getComposeArgs();
    const code = await dockerCompose(composeArgs, ['down', '-v']);

    if (code === 0) {
      output.success('Cleanup complete! All data has been removed.');
    } else {
      output.error('Failed to clean services');
      process.exit(code);
    }
  } else {
    output.info('Cleanup cancelled.');
  }
}

/**
 * Register docker commands with Commander
 */
export function registerDockerCommands(program: Command): void {
  // Verify paths exist
  const { valid, missing } = verifyPaths();
  if (!valid) {
    output.error('ERROR: Required files not found:');
    missing.forEach((p) => output.error(`  - ${p}`));
    output.error('Make sure you are running from the EnterpriseAppBase repository.');
    process.exit(1);
  }

  program
    .command('start')
    .description('Start all services (or specific service)')
    .argument('[service]', 'Specific service to start (api, web, db, nginx)')
    .option('--otel', 'Include OpenTelemetry observability stack')
    .action(async (service: string | undefined, options: DockerOptions) => {
      await startServices(service, options);
    });

  program
    .command('stop')
    .description('Stop all services (or specific service)')
    .argument('[service]', 'Specific service to stop')
    .action(async (service: string | undefined) => {
      await stopServices(service);
    });

  program
    .command('restart')
    .description('Restart all services (or specific service)')
    .argument('[service]', 'Specific service to restart')
    .action(async (service: string | undefined) => {
      await restartServices(service);
    });

  program
    .command('rebuild')
    .description('Rebuild and restart all services (or specific service)')
    .argument('[service]', 'Specific service to rebuild')
    .option('--otel', 'Include OpenTelemetry observability stack')
    .action(async (service: string | undefined, options: DockerOptions) => {
      await rebuildServices(service, options);
    });

  program
    .command('logs')
    .description('Show logs (follow mode). Optionally specify service')
    .argument('[service]', 'Specific service to show logs for')
    .action(async (service: string | undefined) => {
      await showLogs(service);
    });

  program
    .command('status')
    .description('Show status of all services')
    .action(async () => {
      await showStatus();
    });

  program
    .command('clean')
    .description('Stop services and remove volumes (resets database)')
    .action(async () => {
      await cleanServices();
    });
}
