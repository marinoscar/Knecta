/**
 * DuckDB-based Parquet writer for the spreadsheet agent's extract pipeline.
 *
 * Creates an in-memory DuckDB database, inserts transformed rows into a
 * table with the correct schema, then COPYs the result to a local Parquet
 * file. The duckdb native module is loaded lazily (same pattern as
 * `apps/api/src/connections/drivers/duckdb.util.ts`) so the API can start
 * normally when the module is absent.
 *
 * Only `writeParquet` is exported. All other symbols are internal helpers.
 */

import { mkdirSync } from 'fs';
import { dirname } from 'path';

// ─── DuckDB lazy loader ────────────────────────────────────────────────────

/**
 * Lazily loads the duckdb native module.
 * Throws a descriptive error when the module is not installed.
 */
function loadDuckDB(): typeof import('duckdb') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('duckdb') as typeof import('duckdb');
  } catch (err) {
    throw new Error(
      'The duckdb native module is not available in this environment. ' +
        'Install the optional "duckdb" package to use the Parquet writer.',
      { cause: err },
    );
  }
}

// ─── Promise wrappers ──────────────────────────────────────────────────────

/**
 * Wraps a duckdb Connection.run() call in a Promise.
 * Used for DDL and DML statements that do not return rows.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function execAsync(conn: any, sql: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    conn.run(sql, (err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Wraps a duckdb Database.close() call in a Promise.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function closeAsync(db: any): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    db.close((err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// ─── Type mapping ──────────────────────────────────────────────────────────

/**
 * Maps a SQL-like output type from the extraction plan to a DuckDB column
 * type suitable for Parquet storage.
 *
 * Unknown / unrecognised types fall back to VARCHAR.
 */
function mapOutputTypeToDuckDB(outputType: string): string {
  const upper = outputType.toUpperCase().trim();

  if (upper === 'INTEGER' || upper === 'INT' || upper === 'BIGINT') {
    return 'BIGINT';
  }
  if (upper === 'DOUBLE' || upper === 'FLOAT' || upper === 'DECIMAL' || upper === 'NUMERIC') {
    return 'DOUBLE';
  }
  if (upper === 'VARCHAR' || upper === 'TEXT' || upper === 'STRING') {
    return 'VARCHAR';
  }
  if (upper === 'DATE') {
    return 'DATE';
  }
  if (upper === 'TIMESTAMP' || upper === 'DATETIME') {
    return 'TIMESTAMP';
  }
  if (upper === 'BOOLEAN' || upper === 'BOOL') {
    return 'BOOLEAN';
  }
  if (upper === 'JSON') {
    // DuckDB stores JSON as VARCHAR for maximum compatibility
    return 'VARCHAR';
  }

  // Default: treat as VARCHAR
  return 'VARCHAR';
}

// ─── SQL value formatter ───────────────────────────────────────────────────

/**
 * Formats a JavaScript value as a DuckDB SQL literal for inline VALUES
 * clauses.
 *
 * Rules:
 * - null / undefined → NULL
 * - VARCHAR          → single-quoted string with internal quotes doubled
 * - BIGINT           → integer literal, or NULL when not a finite number
 * - DOUBLE           → floating-point literal, or NULL when not a finite number
 * - BOOLEAN          → true / false (unquoted keywords)
 * - DATE             → DATE 'YYYY-MM-DD' typed literal, or NULL when invalid
 * - TIMESTAMP        → TIMESTAMP 'ISO-string' typed literal, or NULL when invalid
 */
function formatDuckDBValue(value: unknown, duckdbType: string): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  switch (duckdbType) {
    case 'VARCHAR': {
      // Stringify and escape single quotes by doubling them
      const str = String(value).replace(/'/g, "''");
      return `'${str}'`;
    }

    case 'BIGINT': {
      const n = Number(value);
      if (!Number.isFinite(n)) return 'NULL';
      return String(Math.trunc(n));
    }

    case 'DOUBLE': {
      const n = Number(value);
      if (!Number.isFinite(n)) return 'NULL';
      return String(n);
    }

    case 'BOOLEAN': {
      if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
      }
      // Accept the boolean string representations that type-coercion.ts
      // already handles, but here we just do a best-effort coercion.
      const s = String(value).trim().toLowerCase();
      if (s === 'true' || s === '1' || s === 'yes') return 'true';
      if (s === 'false' || s === '0' || s === 'no') return 'false';
      return 'NULL';
    }

    case 'DATE': {
      // Value should already be a 'YYYY-MM-DD' string after type coercion.
      // Validate the format before emitting the typed literal.
      const dateStr = String(value).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        // Try parsing as a generic date
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return 'NULL';
        return `DATE '${d.toISOString().slice(0, 10)}'`;
      }
      return `DATE '${dateStr}'`;
    }

    case 'TIMESTAMP': {
      // Value should already be an ISO string after type coercion.
      const tsStr = String(value).trim();
      const d = new Date(tsStr);
      if (isNaN(d.getTime())) return 'NULL';
      // DuckDB TIMESTAMP literal format: 'YYYY-MM-DD HH:MM:SS.mmm'
      const iso = d.toISOString().replace('T', ' ').replace('Z', '');
      return `TIMESTAMP '${iso}'`;
    }

    default:
      // Fallback to VARCHAR formatting
      return `'${String(value).replace(/'/g, "''")}'`;
  }
}

// ─── Batch size ────────────────────────────────────────────────────────────

const BATCH_SIZE = 1000;

// ─── Column descriptor ─────────────────────────────────────────────────────

export interface WriterColumn {
  /** Clean output column name (used as both the table column and row key). */
  outputName: string;
  /** SQL-like type from the extraction plan (e.g. 'VARCHAR', 'INTEGER'). */
  outputType: string;
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Writes an array of rows to a Parquet file using an ephemeral DuckDB
 * in-memory database.
 *
 * Steps:
 * 1. Ensure the output directory exists.
 * 2. Create an in-memory DuckDB database and connection.
 * 3. CREATE TABLE with the schema derived from `columns`.
 * 4. INSERT rows in batches of 1000 using inline VALUES syntax.
 * 5. COPY the table to `outputPath` in Parquet format.
 * 6. Close the database (always, via try/finally).
 *
 * An empty `rows` array is handled gracefully: DuckDB will write a valid
 * empty Parquet file with the correct schema.
 *
 * @param rows       Transformed rows keyed by output column name.
 * @param columns    Column definitions (output name + type).
 * @param outputPath Absolute local filesystem path for the Parquet file.
 */
export async function writeParquet(
  rows: Record<string, unknown>[],
  columns: WriterColumn[],
  outputPath: string,
): Promise<void> {
  // 1. Ensure the output directory exists
  mkdirSync(dirname(outputPath), { recursive: true });

  const duckdb = loadDuckDB();

  // 2. Create in-memory database + connection
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = new duckdb.Database(':memory:');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conn: any = db.connect();

  try {
    // 3. Derive DuckDB types for each column (done once, reused for every batch)
    const duckdbTypes = columns.map((col) => mapOutputTypeToDuckDB(col.outputType));

    // 4. CREATE TABLE — quote column names to handle reserved words and spaces
    const columnDefs = columns
      .map((col, idx) => `"${col.outputName}" ${duckdbTypes[idx]}`)
      .join(', ');

    await execAsync(conn, `CREATE TABLE extract_data (${columnDefs});`);

    // 5. INSERT rows in batches
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);

      const valuesList = batch
        .map((row) => {
          const rowLiterals = columns
            .map((col, colIdx) => formatDuckDBValue(row[col.outputName], duckdbTypes[colIdx]))
            .join(', ');
          return `(${rowLiterals})`;
        })
        .join(',\n');

      await execAsync(conn, `INSERT INTO extract_data VALUES ${valuesList};`);
    }

    // 6. COPY TO Parquet — DuckDB on Windows requires forward slashes
    const posixPath = outputPath.replace(/\\/g, '/');
    await execAsync(conn, `COPY extract_data TO '${posixPath}' (FORMAT PARQUET);`);
  } finally {
    // Always close the database, even on error
    await closeAsync(db);
  }
}
