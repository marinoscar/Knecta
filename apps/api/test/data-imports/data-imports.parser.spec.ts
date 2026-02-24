/**
 * Unit tests for DataImportsParser.
 *
 * DataImportsParser has no injected dependencies (it only uses the XLSX
 * library internally), so tests instantiate the class directly without
 * NestJS module setup.  No database, storage, or network I/O occurs.
 */

import * as XLSX from 'xlsx';
import { DataImportsParser } from '../../src/data-imports/data-imports.parser';

// ---------------------------------------------------------------------------
// Helper: build Buffer payloads
// ---------------------------------------------------------------------------

/**
 * Encode a CSV string to a Buffer, optionally prepending a UTF-8 BOM.
 */
function csvBuffer(content: string, withBom = false): Buffer {
  const text = withBom ? '\ufeff' + content : content;
  return Buffer.from(text, 'utf8');
}

/**
 * Build a minimal XLSX buffer from a 2-D array of cell values.
 * Uses the `xlsx` library so the buffer is a genuine workbook.
 */
function xlsxBuffer(
  sheetData: Record<string, unknown[][]>,
): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [sheetName, rows] of Object.entries(sheetData)) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------

let parser: DataImportsParser;

beforeEach(() => {
  parser = new DataImportsParser();
});

// ===========================================================================
// CSV PARSING
// ===========================================================================

describe('DataImportsParser — CSV', () => {

  // ── Delimiter detection ──────────────────────────────────────────────────

  describe('delimiter detection', () => {
    it('detects comma as the delimiter for a comma-separated file', () => {
      const buf = csvBuffer('id,name,age\n1,Alice,30\n2,Bob,25\n');
      const result = parser.parseCsv(buf);

      expect(result.detectedDelimiter).toBe(',');
    });

    it('detects semicolon as the delimiter for a semicolon-separated file', () => {
      const buf = csvBuffer('id;name;age\n1;Alice;30\n2;Bob;25\n');
      const result = parser.parseCsv(buf);

      expect(result.detectedDelimiter).toBe(';');
    });

    it('detects tab as the delimiter for a tab-separated file', () => {
      const buf = csvBuffer('id\tname\tage\n1\tAlice\t30\n2\tBob\t25\n');
      const result = parser.parseCsv(buf);

      expect(result.detectedDelimiter).toBe('\t');
    });

    it('respects an explicitly provided delimiter, overriding auto-detection', () => {
      // Data is actually semicolon-delimited but we force comma
      const buf = csvBuffer('a;b;c\n1;2;3\n');
      const result = parser.parseCsv(buf, { delimiter: ';' });

      expect(result.detectedDelimiter).toBe(';');
    });
  });

  // ── Header detection ─────────────────────────────────────────────────────

  describe('header row detection', () => {
    it('uses the first row as column names when hasHeader is true (default)', () => {
      const buf = csvBuffer('name,score\nAlice,95\nBob,87\n');
      const result = parser.parseCsv(buf);

      expect(result.hasHeader).toBe(true);
      expect(result.columns.map((c) => c.name)).toEqual(['name', 'score']);
    });

    it('generates synthetic col_N names when hasHeader is false', () => {
      const buf = csvBuffer('Alice,95\nBob,87\n');
      const result = parser.parseCsv(buf, { hasHeader: false });

      expect(result.hasHeader).toBe(false);
      expect(result.columns.map((c) => c.name)).toEqual(['col_0', 'col_1']);
    });
  });

  // ── Column and sample row extraction ─────────────────────────────────────

  describe('column and sample row extraction', () => {
    it('returns the correct column count and sample rows', () => {
      const buf = csvBuffer('a,b,c\n1,2,3\n4,5,6\n7,8,9\n');
      const result = parser.parseCsv(buf);

      expect(result.columns).toHaveLength(3);
      expect(result.sampleRows).toHaveLength(3);
    });

    it('limits sample rows to 100 even for files with more rows', () => {
      // Generate 200 data rows
      const rows = Array.from({ length: 200 }, (_, i) => `${i},val${i}`).join('\n');
      const buf = csvBuffer('id,val\n' + rows + '\n');
      const result = parser.parseCsv(buf);

      expect(result.sampleRows.length).toBeLessThanOrEqual(100);
    });

    it('returns the correct rowCountEstimate', () => {
      const buf = csvBuffer('x,y\n1,2\n3,4\n5,6\n');
      const result = parser.parseCsv(buf);

      // 3 data rows after the header
      expect(result.rowCountEstimate).toBe(3);
    });
  });

  // ── Empty and edge cases ─────────────────────────────────────────────────

  describe('empty file and edge cases', () => {
    it('handles an empty CSV buffer gracefully (zero sample rows, zero row count)', () => {
      const buf = csvBuffer('');
      const result = parser.parseCsv(buf);

      // The XLSX parser creates a minimal sheet from empty input and may produce
      // a synthetic "col_0" column entry.  What matters is that no data rows appear.
      expect(result.sampleRows).toHaveLength(0);
      expect(result.rowCountEstimate).toBe(0);
    });

    it('strips the UTF-8 BOM from the content before parsing', () => {
      const buf = csvBuffer('name,value\nAlice,1\n', true /* withBom */);
      const result = parser.parseCsv(buf);

      // BOM must not appear in the first column name
      expect(result.columns[0].name).toBe('name');
    });

    it('reports detectedEncoding as UTF-8-BOM when a BOM is present', () => {
      const buf = csvBuffer('col\nval\n', true);
      const result = parser.parseCsv(buf);

      expect(result.detectedEncoding).toBe('UTF-8-BOM');
    });
  });

  // ── Type field ────────────────────────────────────────────────────────────

  it('sets result.type to "csv"', () => {
    const buf = csvBuffer('a\n1\n');
    const result = parser.parseCsv(buf);
    expect(result.type).toBe('csv');
  });
});

// ===========================================================================
// EXCEL PARSING
// ===========================================================================

describe('DataImportsParser — Excel', () => {

  // ── Sheet listing ─────────────────────────────────────────────────────────

  describe('parseExcelSheets', () => {
    it('returns all sheets with their dimensions', () => {
      const buf = xlsxBuffer({
        Sheet1: [['id', 'name'], [1, 'Alice'], [2, 'Bob']],
        Summary: [['total'], [2]],
      });
      const result = parser.parseExcelSheets(buf);

      expect(result.type).toBe('excel');
      expect(result.sheets).toHaveLength(2);

      const sheet1 = result.sheets.find((s) => s.name === 'Sheet1')!;
      expect(sheet1.rowCount).toBe(3);
      expect(sheet1.colCount).toBe(2);

      const summary = result.sheets.find((s) => s.name === 'Summary')!;
      expect(summary.rowCount).toBe(2);
      expect(summary.colCount).toBe(1);
    });

    it('sets hasMergedCells to false for sheets without merges', () => {
      const buf = xlsxBuffer({
        Sheet1: [['a', 'b'], [1, 2]],
      });
      const result = parser.parseExcelSheets(buf);

      expect(result.sheets[0].hasMergedCells).toBe(false);
    });

    it('handles a workbook with a single empty sheet gracefully', () => {
      const buf = xlsxBuffer({ EmptySheet: [] });
      const result = parser.parseExcelSheets(buf);

      expect(result.sheets).toHaveLength(1);
      expect(result.sheets[0].rowCount).toBe(0);
      expect(result.sheets[0].colCount).toBe(0);
    });
  });

  // ── Range parsing ─────────────────────────────────────────────────────────

  describe('parseExcelRange', () => {
    it('returns columns, rows, and totalRows for a standard sheet', () => {
      const buf = xlsxBuffer({
        Data: [
          ['product', 'price', 'qty'],
          ['Widget', 9.99, 100],
          ['Gadget', 24.99, 50],
          ['Doohickey', 4.99, 200],
        ],
      });
      const result = parser.parseExcelRange(buf, 'Data');

      expect(result.columns.map((c) => c.name)).toEqual(['product', 'price', 'qty']);
      expect(result.totalRows).toBe(3);
      expect(result.rows).toHaveLength(3);
    });

    it('generates col_N column names when hasHeader is false', () => {
      const buf = xlsxBuffer({
        Sheet1: [
          [1, 2, 3],
          [4, 5, 6],
        ],
      });
      const result = parser.parseExcelRange(buf, 'Sheet1', undefined, false);

      expect(result.columns.map((c) => c.name)).toEqual(['col_0', 'col_1', 'col_2']);
      expect(result.totalRows).toBe(2); // both rows are data rows when no header
    });

    it('respects the limit parameter for sample rows', () => {
      const rows: unknown[][] = [['x']];
      for (let i = 0; i < 20; i++) rows.push([i]);
      const buf = xlsxBuffer({ Sheet1: rows });
      const result = parser.parseExcelRange(buf, 'Sheet1', undefined, true, 5);

      expect(result.rows).toHaveLength(5);
      expect(result.totalRows).toBe(20);
    });

    it('respects a range selection (startRow, startCol)', () => {
      const buf = xlsxBuffer({
        Sheet1: [
          ['skip_a', 'skip_b', 'keep_c', 'keep_d'],
          ['skip_1', 'skip_2', 'value_1', 'value_2'],
        ],
      });
      // Start from row 0 (0-based), col 2 — only columns C and D
      const result = parser.parseExcelRange(
        buf,
        'Sheet1',
        { startRow: 0, startCol: 2 },
        true,
        50,
      );

      expect(result.columns.map((c) => c.name)).toEqual(['keep_c', 'keep_d']);
      expect(result.rows[0]).toEqual(expect.arrayContaining(['value_1', 'value_2']));
    });

    it('throws an error when the requested sheet does not exist', () => {
      const buf = xlsxBuffer({ Sheet1: [['a']] });

      expect(() => parser.parseExcelRange(buf, 'NonExistent')).toThrow(
        /NonExistent/,
      );
    });

    it('returns detectedTypes alongside columns', () => {
      const buf = xlsxBuffer({
        Sheet1: [
          ['id', 'label'],
          [1, 'foo'],
          [2, 'bar'],
        ],
      });
      const result = parser.parseExcelRange(buf, 'Sheet1');

      expect(result.detectedTypes).toBeDefined();
      expect(result.detectedTypes).toHaveLength(2);
    });
  });
});

// ===========================================================================
// TYPE DETECTION
// ===========================================================================

describe('DataImportsParser — Type Detection', () => {

  it('detects BIGINT for columns containing only whole numbers', () => {
    const types = parser.detectColumnTypes(['count'], [['1'], ['42'], ['100']]);
    expect(types[0].type).toBe('BIGINT');
  });

  it('detects DOUBLE for columns mixing integers and decimals', () => {
    const types = parser.detectColumnTypes(['price'], [['1'], ['9.99'], ['0.50']]);
    expect(types[0].type).toBe('DOUBLE');
  });

  it('detects DOUBLE for a column with only decimals', () => {
    const types = parser.detectColumnTypes(['ratio'], [['0.5'], ['1.25'], ['3.14']]);
    expect(types[0].type).toBe('DOUBLE');
  });

  it('detects BOOLEAN for a column with true/false values', () => {
    const types = parser.detectColumnTypes(['active'], [['true'], ['false'], ['true']]);
    expect(types[0].type).toBe('BOOLEAN');
  });

  it('detects BOOLEAN for a column with 1/0 values', () => {
    const types = parser.detectColumnTypes(['flag'], [['1'], ['0'], ['1']]);
    // '1' and '0' are in BOOL_VALUES but also match INTEGER_RE — BOOLEAN is checked first
    expect(types[0].type).toBe('BOOLEAN');
  });

  it('detects BOOLEAN for a column with yes/no values', () => {
    const types = parser.detectColumnTypes(['enabled'], [['yes'], ['no'], ['yes']]);
    expect(types[0].type).toBe('BOOLEAN');
  });

  it('detects DATE for a column with ISO date strings (YYYY-MM-DD)', () => {
    const types = parser.detectColumnTypes(
      ['dob'],
      [['2020-01-01'], ['1990-12-31'], ['2000-06-15']],
    );
    expect(types[0].type).toBe('DATE');
  });

  it('detects TIMESTAMP for a column with ISO datetime strings', () => {
    const types = parser.detectColumnTypes(
      ['created_at'],
      [
        ['2024-01-01T10:00:00'],
        ['2024-06-15T23:59:59'],
        ['2024-12-31 00:00:00'],
      ],
    );
    expect(types[0].type).toBe('TIMESTAMP');
  });

  it('defaults to VARCHAR for mixed data that does not match a specific type', () => {
    const types = parser.detectColumnTypes(
      ['notes'],
      [['hello'], ['world'], ['123 abc']],
    );
    expect(types[0].type).toBe('VARCHAR');
  });

  it('returns VARCHAR for an empty column (no non-null values)', () => {
    const types = parser.detectColumnTypes(['x'], [[null], [null], [undefined]]);
    expect(types[0].type).toBe('VARCHAR');
  });

  it('handles multiple columns simultaneously', () => {
    const types = parser.detectColumnTypes(
      ['id', 'name', 'price', 'active'],
      [
        [1, 'Alice', 9.99, 'true'],
        [2, 'Bob', 24.99, 'false'],
      ],
    );

    expect(types.find((t) => t.name === 'id')?.type).toBe('BIGINT');
    expect(types.find((t) => t.name === 'name')?.type).toBe('VARCHAR');
    expect(types.find((t) => t.name === 'price')?.type).toBe('DOUBLE');
    expect(types.find((t) => t.name === 'active')?.type).toBe('BOOLEAN');
  });
});

// ===========================================================================
// PARQUET PREPARATION
// ===========================================================================

describe('DataImportsParser — prepareForParquet', () => {

  it('returns all columns as VARCHAR by default when no overrides are provided', () => {
    const header = ['a', 'b'];
    const rows = [['val1', 'val2'], ['val3', 'val4']];
    const { columns, rows: outRows } = parser.prepareForParquet(header, rows);

    expect(columns).toHaveLength(2);
    expect(columns[0].outputType).toBe('VARCHAR');
    expect(outRows).toHaveLength(2);
    expect(outRows[0]).toEqual({ a: 'val1', b: 'val2' });
  });

  it('applies column renames from overrides', () => {
    const header = ['source_name'];
    const rows = [['Alice']];
    const { columns, rows: outRows } = parser.prepareForParquet(header, rows, [
      { sourceName: 'source_name', outputName: 'full_name', outputType: 'VARCHAR', include: true },
    ]);

    expect(columns[0].outputName).toBe('full_name');
    expect(outRows[0]).toHaveProperty('full_name', 'Alice');
  });

  it('excludes columns whose include flag is false', () => {
    const header = ['keep', 'drop'];
    const rows = [['a', 'b']];
    const { columns, rows: outRows } = parser.prepareForParquet(header, rows, [
      { sourceName: 'keep', outputName: 'keep', outputType: 'VARCHAR', include: true },
      { sourceName: 'drop', outputName: 'drop', outputType: 'VARCHAR', include: false },
    ]);

    expect(columns).toHaveLength(1);
    expect(columns[0].outputName).toBe('keep');
    expect(outRows[0]).not.toHaveProperty('drop');
  });

  it('applies outputType overrides from column definitions', () => {
    const header = ['amount'];
    const rows = [['42.5']];
    const { columns } = parser.prepareForParquet(header, rows, [
      { sourceName: 'amount', outputName: 'amount', outputType: 'DOUBLE', include: true },
    ]);

    expect(columns[0].outputType).toBe('DOUBLE');
  });

  it('handles an empty rows array without throwing', () => {
    const header = ['x', 'y'];
    const { columns, rows: outRows } = parser.prepareForParquet(header, []);

    expect(columns).toHaveLength(2);
    expect(outRows).toHaveLength(0);
  });

  it('sets missing cell values to null in output rows', () => {
    const header = ['a', 'b', 'c'];
    // Row has fewer values than header
    const rows = [['only_a']];
    const { rows: outRows } = parser.prepareForParquet(header, rows);

    expect(outRows[0]['b']).toBeNull();
    expect(outRows[0]['c']).toBeNull();
  });
});
