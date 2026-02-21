import chalk from 'chalk';

/**
 * Output utilities for consistent CLI formatting
 */

export function info(message: string): void {
  console.log(chalk.cyan(message));
}

export function success(message: string): void {
  console.log(chalk.green(message));
}

export function warn(message: string): void {
  console.log(chalk.yellow(message));
}

export function error(message: string): void {
  console.log(chalk.red(message));
}

export function dim(message: string): void {
  console.log(chalk.dim(message));
}

export function bold(message: string): void {
  console.log(chalk.bold(message));
}

/**
 * Print a section header
 */
export function header(title: string): void {
  console.log('');
  console.log(chalk.bold.cyan(title));
  console.log(chalk.dim('='.repeat(title.length)));
}

/**
 * Print a key-value pair
 */
export function keyValue(key: string, value: string): void {
  console.log(`${chalk.dim(key + ':')} ${value}`);
}

/**
 * Print a table row
 */
export function tableRow(columns: string[], widths: number[]): void {
  const formatted = columns.map((col, i) =>
    String(col ?? '').padEnd(widths[i] || 20)
  );
  console.log(formatted.join('  '));
}

/**
 * Print table header
 */
export function tableHeader(columns: string[], widths: number[]): void {
  tableRow(columns, widths);
  console.log(chalk.dim('-'.repeat(widths.reduce((a, b) => a + b + 2, 0))));
}

/**
 * Print a blank line
 */
export function blank(): void {
  console.log('');
}

/**
 * Print service URLs after start
 */
export function printServiceUrls(includeOtel: boolean = false): void {
  blank();
  info('Application:  http://localhost:8319');
  info('API:          http://localhost:8319/api');
  info('Swagger UI:   http://localhost:8319/api/docs');
  info('API Health:   http://localhost:8319/api/health/live');
  if (includeOtel) {
    info('Uptrace:      http://localhost:14318');
  }
  blank();
}

/**
 * Mask a password string: show first 2 chars + asterisks
 */
export function maskPassword(password: string | undefined): string {
  if (!password) return '(empty)';
  if (password.length <= 2) return '*'.repeat(password.length);
  return password.slice(0, 2) + '*'.repeat(Math.min(password.length - 2, 8));
}

/**
 * Print a numbered step indicator for verbose logging
 */
export function step(number: number, message: string): void {
  console.log(chalk.dim(`[${number}]`) + ' ' + chalk.cyan(message));
}

/**
 * Print a bordered connection info box
 */
export function connectionBox(params: {
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  databaseUrl: string;
  source: string;
}): void {
  const width = 60;
  const border = chalk.cyan('+' + '-'.repeat(width) + '+');
  const line = (label: string, value: string) => {
    const content = `  ${label.padEnd(11)} ${value}`;
    const padded = content.length > width ? content.slice(0, width) : content.padEnd(width);
    return chalk.cyan('|') + padded + chalk.cyan('|');
  };

  blank();
  console.log(border);
  console.log(chalk.cyan('|') + chalk.bold.cyan('  Database Connection'.padEnd(width)) + chalk.cyan('|'));
  console.log(border);
  console.log(line('Source:', params.source));
  console.log(line('Host:', params.host));
  console.log(line('Port:', params.port));
  console.log(line('Database:', params.database));
  console.log(line('User:', params.user));
  console.log(line('Password:', maskPassword(params.password)));
  console.log(line('SSL:', params.ssl ? 'enabled' : 'disabled'));
  console.log(border);
  console.log(line('URL:', params.databaseUrl));
  console.log(border);
  blank();
}
