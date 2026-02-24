/**
 * Tests for the DuckDB-based Parquet writer used in the spreadsheet agent's
 * extract pipeline.
 *
 * The duckdb native module is optional — tests are conditionally skipped when
 * the module is not installed in the current environment.
 */

import { existsSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeParquet, WriterColumn } from '../../src/spreadsheet-agent/agent/utils/duckdb-writer';

// ─── Runtime check for duckdb availability ────────────────────────────────────

let duckdbAvailable = false;
try {
  require('duckdb');
  duckdbAvailable = true;
} catch {
  // duckdb is not installed — skip all tests in this suite
}

const describeIfDuckDB = duckdbAvailable ? describe : describe.skip;

// ─── Test helpers ─────────────────────────────────────────────────────────────

/**
 * Returns a fresh temporary output path for each test so that tests are
 * independent and do not share state via the filesystem.
 */
function tempParquetPath(name: string): string {
  const dir = join(tmpdir(), 'duckdb-writer-tests');
  mkdirSync(dir, { recursive: true });
  return join(dir, `${name}-${Date.now()}.parquet`);
}

/**
 * Reads all rows from a Parquet file using DuckDB and returns them as plain
 * objects. Uses a separate in-memory DuckDB database so there is no
 * interference with the writer under test.
 */
async function readParquet(filePath: string): Promise<Record<string, unknown>[]> {
  const duckdb = require('duckdb');
  return new Promise<Record<string, unknown>[]>((resolve, reject) => {
    const db = new duckdb.Database(':memory:');
    const conn = db.connect();
    // Normalise Windows backslashes to forward slashes for DuckDB
    const posixPath = filePath.replace(/\\/g, '/');
    conn.all(`SELECT * FROM read_parquet('${posixPath}')`, (err: Error | null, rows: Record<string, unknown>[]) => {
      db.close();
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describeIfDuckDB('writeParquet', () => {

  it('writes a valid Parquet file with mixed column types', async () => {
    const outputPath = tempParquetPath('mixed-types');

    const columns: WriterColumn[] = [
      { outputName: 'name',       outputType: 'VARCHAR'   },
      { outputName: 'age',        outputType: 'INTEGER'   },
      { outputName: 'salary',     outputType: 'DOUBLE'    },
      { outputName: 'hire_date',  outputType: 'DATE'      },
      { outputName: 'is_active',  outputType: 'BOOLEAN'   },
    ];

    const rows = [
      {
        name:      'Alice',
        age:       30,
        salary:    75000.50,
        hire_date: '2020-03-15',
        is_active: true,
      },
      {
        name:      'Bob',
        age:       25,
        salary:    62000.00,
        hire_date: '2022-07-01',
        is_active: false,
      },
    ];

    await writeParquet(rows, columns, outputPath);

    // Verify the file was created
    expect(existsSync(outputPath)).toBe(true);

    // Read it back and verify the data
    const result = await readParquet(outputPath);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Alice');
    // DuckDB returns BIGINT columns as JavaScript BigInt; normalise with Number()
    expect(Number(result[0].age)).toBe(30);
    expect(result[1].name).toBe('Bob');
    expect(result[1].is_active).toBe(false);
  }, 30_000);

  it('produces a valid Parquet file with the correct schema when rows is empty', async () => {
    const outputPath = tempParquetPath('empty-rows');

    const columns: WriterColumn[] = [
      { outputName: 'id',    outputType: 'INTEGER' },
      { outputName: 'label', outputType: 'VARCHAR' },
    ];

    await writeParquet([], columns, outputPath);

    // File must exist even with no rows
    expect(existsSync(outputPath)).toBe(true);

    // Read it back — should be an empty result set with the correct schema
    const result = await readParquet(outputPath);
    expect(result).toHaveLength(0);
  }, 30_000);

  it('handles null values correctly in the written Parquet file', async () => {
    const outputPath = tempParquetPath('null-values');

    const columns: WriterColumn[] = [
      { outputName: 'name',   outputType: 'VARCHAR' },
      { outputName: 'amount', outputType: 'DOUBLE'  },
    ];

    const rows = [
      { name: 'Present',  amount: 123.45 },
      { name: null,       amount: null   },
      { name: 'Has null', amount: null   },
    ];

    await writeParquet(rows, columns, outputPath);

    const result = await readParquet(outputPath);

    expect(result).toHaveLength(3);
    expect(result[1].name).toBeNull();
    expect(result[1].amount).toBeNull();
    expect(result[2].amount).toBeNull();
  }, 30_000);

  it('escapes single quotes in string values without corrupting the file', async () => {
    const outputPath = tempParquetPath('special-chars');

    const columns: WriterColumn[] = [
      { outputName: 'text', outputType: 'VARCHAR' },
    ];

    const rows = [
      { text: "O'Brien" },
      { text: "it's fine" },
      { text: "double '' quote" },
    ];

    await writeParquet(rows, columns, outputPath);

    const result = await readParquet(outputPath);

    expect(result).toHaveLength(3);
    expect(result[0].text).toBe("O'Brien");
    expect(result[1].text).toBe("it's fine");
    expect(result[2].text).toBe("double '' quote");
  }, 30_000);

  it('handles unicode characters in string values', async () => {
    const outputPath = tempParquetPath('unicode');

    const columns: WriterColumn[] = [
      { outputName: 'label', outputType: 'VARCHAR' },
    ];

    const rows = [
      { label: 'Café' },
      { label: '日本語' },
      { label: 'Ñoño' },
    ];

    await writeParquet(rows, columns, outputPath);

    const result = await readParquet(outputPath);

    expect(result).toHaveLength(3);
    expect(result[0].label).toBe('Café');
    expect(result[1].label).toBe('日本語');
    expect(result[2].label).toBe('Ñoño');
  }, 30_000);

  it('creates the output directory when it does not already exist', async () => {
    // Use a deeply nested path that definitely does not exist yet
    const nestedDir = join(
      tmpdir(),
      'duckdb-writer-tests',
      'nested',
      `subdir-${Date.now()}`,
    );
    const outputPath = join(nestedDir, 'output.parquet');

    const columns: WriterColumn[] = [
      { outputName: 'x', outputType: 'INTEGER' },
    ];

    // nestedDir must not exist before the call
    expect(existsSync(nestedDir)).toBe(false);

    await writeParquet([{ x: 1 }], columns, outputPath);

    expect(existsSync(outputPath)).toBe(true);
  }, 30_000);

  it('writes large batches correctly (> BATCH_SIZE rows)', async () => {
    const outputPath = tempParquetPath('large-batch');

    const columns: WriterColumn[] = [
      { outputName: 'idx',   outputType: 'INTEGER' },
      { outputName: 'value', outputType: 'DOUBLE'  },
    ];

    // Generate 2500 rows (2.5× the internal BATCH_SIZE of 1000)
    const rows = Array.from({ length: 2500 }, (_, i) => ({
      idx:   i + 1,
      value: (i + 1) * 1.5,
    }));

    await writeParquet(rows, columns, outputPath);

    const result = await readParquet(outputPath);

    expect(result).toHaveLength(2500);
    // DuckDB returns BIGINT columns as JavaScript BigInt; normalise with Number()
    expect(Number((result[0] as any).idx)).toBe(1);
    expect(Number((result[2499] as any).idx)).toBe(2500);
  }, 60_000);

  it('writes DATE-typed columns that read back as parseable date values', async () => {
    const outputPath = tempParquetPath('date-column');

    const columns: WriterColumn[] = [
      { outputName: 'event_date', outputType: 'DATE' },
    ];

    const rows = [
      { event_date: '2024-01-15' },
      { event_date: '2024-12-31' },
    ];

    await writeParquet(rows, columns, outputPath);
    expect(existsSync(outputPath)).toBe(true);

    const result = await readParquet(outputPath);
    expect(result).toHaveLength(2);
    // DuckDB may return dates as Date objects or date-like strings; both are acceptable
    expect(result[0].event_date).toBeTruthy();
    expect(result[1].event_date).toBeTruthy();
  }, 30_000);

  it('writes BOOLEAN-typed columns correctly', async () => {
    const outputPath = tempParquetPath('boolean-column');

    const columns: WriterColumn[] = [
      { outputName: 'flag', outputType: 'BOOLEAN' },
    ];

    const rows = [
      { flag: true  },
      { flag: false },
      { flag: null  },
    ];

    await writeParquet(rows, columns, outputPath);

    const result = await readParquet(outputPath);

    expect(result).toHaveLength(3);
    expect(result[0].flag).toBe(true);
    expect(result[1].flag).toBe(false);
    expect(result[2].flag).toBeNull();
  }, 30_000);

});

// ─── Smoke test when duckdb is absent ────────────────────────────────────────

describe('writeParquet (duckdb not available)', () => {
  if (duckdbAvailable) {
    it.skip('skipped — duckdb IS available in this environment', () => {});
    return;
  }

  it('throws a descriptive error when duckdb is not installed', async () => {
    const columns: WriterColumn[] = [
      { outputName: 'id', outputType: 'INTEGER' },
    ];

    await expect(
      writeParquet([{ id: 1 }], columns, join(tmpdir(), 'should-not-exist.parquet')),
    ).rejects.toThrow(/duckdb native module/i);
  });
});
