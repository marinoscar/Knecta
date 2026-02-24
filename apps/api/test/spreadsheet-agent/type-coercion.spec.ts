/**
 * Unit tests for the type coercion utilities used in the spreadsheet agent's
 * extract pipeline.
 *
 * All functions under test are pure — no external dependencies, no I/O.
 * Tests follow the Arrange / Act / Assert pattern.
 */

import {
  coerceType,
  buildTransformer,
  applyColumnTransformations,
  ColumnDescriptor,
} from '../../src/spreadsheet-agent/agent/utils/type-coercion';

// ─── coerceType ────────────────────────────────────────────────────────────────

describe('coerceType', () => {

  // ── VARCHAR ──────────────────────────────────────────────────────────────────

  describe('VARCHAR', () => {
    it('passes a string value through unchanged', () => {
      expect(coerceType('hello', 'VARCHAR')).toBe('hello');
    });

    it('converts a number to its string representation', () => {
      expect(coerceType(42, 'VARCHAR')).toBe('42');
    });

    it('returns null when the value is null', () => {
      expect(coerceType(null, 'VARCHAR')).toBeNull();
    });

    it('returns null for an empty string (isAbsent check fires before VARCHAR branch)', () => {
      // The implementation calls isAbsent() first; '' is treated as absent for all types.
      expect(coerceType('', 'VARCHAR')).toBeNull();
    });

    it('accepts TEXT as an alias for VARCHAR', () => {
      expect(coerceType('test', 'TEXT')).toBe('test');
    });

    it('accepts STRING as an alias for VARCHAR', () => {
      expect(coerceType('test', 'STRING')).toBe('test');
    });

    it('is case-insensitive in the type name', () => {
      expect(coerceType('hello', 'varchar')).toBe('hello');
    });
  });

  // ── INTEGER ──────────────────────────────────────────────────────────────────

  describe('INTEGER', () => {
    it('parses a plain integer string', () => {
      expect(coerceType('123', 'INTEGER')).toBe(123);
    });

    it('strips dollar sign and comma before parsing', () => {
      expect(coerceType('$1,234', 'INTEGER')).toBe(1234);
    });

    it('handles parenthesised negative numbers', () => {
      expect(coerceType('(45)', 'INTEGER')).toBe(-45);
    });

    it('returns null for a non-numeric string', () => {
      expect(coerceType('abc', 'INTEGER')).toBeNull();
    });

    it('returns null for null input', () => {
      expect(coerceType(null, 'INTEGER')).toBeNull();
    });

    it('returns null for an empty string', () => {
      expect(coerceType('', 'INTEGER')).toBeNull();
    });

    it('truncates a floating-point string to an integer', () => {
      expect(coerceType('3.9', 'INTEGER')).toBe(3);
    });

    it('accepts INT as an alias', () => {
      expect(coerceType('7', 'INT')).toBe(7);
    });

    it('accepts BIGINT as an alias', () => {
      expect(coerceType('9999999', 'BIGINT')).toBe(9999999);
    });

    it('handles a numeric value that is already a number', () => {
      expect(coerceType(100, 'INTEGER')).toBe(100);
    });
  });

  // ── DOUBLE ───────────────────────────────────────────────────────────────────

  describe('DOUBLE', () => {
    it('parses a plain float string', () => {
      expect(coerceType('3.14', 'DOUBLE')).toBeCloseTo(3.14);
    });

    it('strips commas from a formatted number', () => {
      expect(coerceType('1,234.56', 'DOUBLE')).toBeCloseTo(1234.56);
    });

    it('returns null for a non-numeric string', () => {
      expect(coerceType('abc', 'DOUBLE')).toBeNull();
    });

    it('accepts FLOAT as an alias', () => {
      expect(coerceType('2.5', 'FLOAT')).toBeCloseTo(2.5);
    });

    it('accepts DECIMAL as an alias', () => {
      expect(coerceType('9.99', 'DECIMAL')).toBeCloseTo(9.99);
    });

    it('accepts NUMERIC as an alias', () => {
      expect(coerceType('0.001', 'NUMERIC')).toBeCloseTo(0.001);
    });

    it('handles negative floats', () => {
      expect(coerceType('-3.14', 'DOUBLE')).toBeCloseTo(-3.14);
    });
  });

  // ── BOOLEAN ──────────────────────────────────────────────────────────────────

  describe('BOOLEAN', () => {
    it('converts the string "true" to true', () => {
      expect(coerceType('true', 'BOOLEAN')).toBe(true);
    });

    it('converts the string "1" to true', () => {
      expect(coerceType('1', 'BOOLEAN')).toBe(true);
    });

    it('converts the string "no" to false', () => {
      expect(coerceType('no', 'BOOLEAN')).toBe(false);
    });

    it('converts the string "false" to false', () => {
      expect(coerceType('false', 'BOOLEAN')).toBe(false);
    });

    it('passes a native boolean true through unchanged', () => {
      expect(coerceType(true, 'BOOLEAN')).toBe(true);
    });

    it('passes a native boolean false through unchanged', () => {
      expect(coerceType(false, 'BOOLEAN')).toBe(false);
    });

    it('returns null for an unrecognised string like "maybe"', () => {
      expect(coerceType('maybe', 'BOOLEAN')).toBeNull();
    });

    it('converts "yes" to true', () => {
      expect(coerceType('yes', 'BOOLEAN')).toBe(true);
    });

    it('converts "0" to false', () => {
      expect(coerceType('0', 'BOOLEAN')).toBe(false);
    });

    it('accepts BOOL as an alias', () => {
      expect(coerceType('on', 'BOOL')).toBe(true);
    });

    it('is case-insensitive for boolean strings', () => {
      expect(coerceType('TRUE', 'BOOLEAN')).toBe(true);
      expect(coerceType('NO', 'BOOLEAN')).toBe(false);
    });
  });

  // ── DATE ─────────────────────────────────────────────────────────────────────

  describe('DATE', () => {
    it('accepts a ISO YYYY-MM-DD string and returns it unchanged', () => {
      expect(coerceType('2024-01-15', 'DATE')).toBe('2024-01-15');
    });

    it('converts an Excel serial date number to a YYYY-MM-DD string', () => {
      // Excel serial 44927 = 2023-01-01T00:00:00.000Z
      const result = coerceType(44927, 'DATE');
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // The date portion of the ISO string is always UTC regardless of local timezone
      expect(result).toBe('2023-01-01');
    });

    it('returns null for an unparseable date string', () => {
      expect(coerceType('bad-date', 'DATE')).toBeNull();
    });

    it('returns null for null input', () => {
      expect(coerceType(null, 'DATE')).toBeNull();
    });

    it('returns null for an empty string', () => {
      expect(coerceType('', 'DATE')).toBeNull();
    });

    it('returns null for an out-of-range Excel serial (0)', () => {
      expect(coerceType(0, 'DATE')).toBeNull();
    });

    it('returns null for a negative Excel serial', () => {
      expect(coerceType(-1, 'DATE')).toBeNull();
    });
  });

  // ── TIMESTAMP ────────────────────────────────────────────────────────────────

  describe('TIMESTAMP', () => {
    it('accepts an ISO timestamp string and returns an ISO string', () => {
      const result = coerceType('2024-01-15T10:30:00Z', 'TIMESTAMP');
      expect(typeof result).toBe('string');
      // Must be a parseable ISO string
      expect(() => new Date(result as string)).not.toThrow();
      // Use UTC accessor to avoid local-timezone influence
      expect(new Date(result as string).getUTCFullYear()).toBe(2024);
    });

    it('converts an Excel serial integer to an ISO timestamp string', () => {
      // Excel serial 44927 = 2023-01-01T00:00:00.000Z
      const result = coerceType(44927, 'TIMESTAMP');
      expect(typeof result).toBe('string');
      // Validate using UTC accessors to avoid local-timezone shifts
      const d = new Date(result as string);
      expect(d.getUTCFullYear()).toBe(2023);
      expect(d.getUTCMonth()).toBe(0); // January
      expect(d.getUTCDate()).toBe(1);
    });

    it('returns null for an unparseable timestamp string', () => {
      expect(coerceType('not-a-timestamp', 'TIMESTAMP')).toBeNull();
    });

    it('accepts DATETIME as an alias', () => {
      const result = coerceType('2024-06-01T00:00:00Z', 'DATETIME');
      expect(typeof result).toBe('string');
      // Use UTC accessors to avoid local-timezone shifts (e.g. UTC-X makes June → May)
      const d = new Date(result as string);
      expect(d.getUTCMonth()).toBe(5); // June (0-indexed)
      expect(d.getUTCFullYear()).toBe(2024);
    });
  });

  // ── Absent values (shared across all types) ───────────────────────────────────

  describe('absent value handling', () => {
    it('returns null for undefined regardless of type', () => {
      expect(coerceType(undefined, 'INTEGER')).toBeNull();
      expect(coerceType(undefined, 'DOUBLE')).toBeNull();
      expect(coerceType(undefined, 'BOOLEAN')).toBeNull();
      expect(coerceType(undefined, 'DATE')).toBeNull();
    });

    it('returns null for empty string for non-VARCHAR types', () => {
      expect(coerceType('', 'INTEGER')).toBeNull();
      expect(coerceType('', 'DOUBLE')).toBeNull();
      expect(coerceType('', 'BOOLEAN')).toBeNull();
      expect(coerceType('', 'DATE')).toBeNull();
    });
  });

});

// ─── buildTransformer ──────────────────────────────────────────────────────────

describe('buildTransformer', () => {

  it('returns a coercion-only transformer when transformation is null', () => {
    const transform = buildTransformer(null, 'INTEGER');
    expect(transform('42')).toBe(42);
    expect(transform(null)).toBeNull();
  });

  it('returns a coercion-only transformer for an empty string expression', () => {
    const transform = buildTransformer('', 'VARCHAR');
    expect(transform('hello')).toBe('hello');
  });

  describe('TRIM', () => {
    it('trims whitespace before coercing', () => {
      const transform = buildTransformer('TRIM(value)', 'VARCHAR');
      expect(transform('  hello  ')).toBe('hello');
    });

    it('handles the bare TRIM keyword', () => {
      const transform = buildTransformer('TRIM', 'VARCHAR');
      expect(transform('  spaced  ')).toBe('spaced');
    });

    it('returns null when the input is null', () => {
      const transform = buildTransformer('TRIM(value)', 'VARCHAR');
      expect(transform(null)).toBeNull();
    });

    it('trims and then coerces to INTEGER', () => {
      const transform = buildTransformer('TRIM(value)', 'INTEGER');
      expect(transform('  7  ')).toBe(7);
    });
  });

  describe('UPPER', () => {
    it('uppercases the string before coercing', () => {
      const transform = buildTransformer('UPPER(value)', 'VARCHAR');
      expect(transform('hello')).toBe('HELLO');
    });

    it('handles the bare UPPER keyword', () => {
      const transform = buildTransformer('UPPER', 'VARCHAR');
      expect(transform('world')).toBe('WORLD');
    });

    it('returns null when input is null', () => {
      const transform = buildTransformer('UPPER(value)', 'VARCHAR');
      expect(transform(null)).toBeNull();
    });
  });

  describe('LOWER', () => {
    it('lowercases the string before coercing', () => {
      const transform = buildTransformer('LOWER(value)', 'VARCHAR');
      expect(transform('HELLO')).toBe('hello');
    });

    it('handles the bare LOWER keyword', () => {
      const transform = buildTransformer('LOWER', 'VARCHAR');
      expect(transform('WORLD')).toBe('world');
    });

    it('returns null when input is null', () => {
      const transform = buildTransformer('LOWER(value)', 'VARCHAR');
      expect(transform(null)).toBeNull();
    });
  });

  describe("REPLACE(',', '')", () => {
    it('removes all commas from the value before coercing', () => {
      const transform = buildTransformer("REPLACE(',', '')", 'VARCHAR');
      expect(transform('1,234,567')).toBe('1234567');
    });

    it('is a no-op when the search string is absent', () => {
      const transform = buildTransformer("REPLACE(',', '')", 'VARCHAR');
      expect(transform('no commas')).toBe('no commas');
    });

    it('returns null when input is null', () => {
      const transform = buildTransformer("REPLACE(',', '')", 'VARCHAR');
      expect(transform(null)).toBeNull();
    });

    it('replaces one string with another', () => {
      const transform = buildTransformer("REPLACE('USD', 'US')", 'VARCHAR');
      expect(transform('100 USD')).toBe('100 US');
    });

    it('removes commas and then coerces to INTEGER', () => {
      const transform = buildTransformer("REPLACE(',', '')", 'INTEGER');
      expect(transform('1,000')).toBe(1000);
    });
  });

  describe('CAST(value AS TYPE)', () => {
    it('coerces the value to the declared outputType', () => {
      const transform = buildTransformer('CAST(value AS INTEGER)', 'INTEGER');
      expect(transform('99')).toBe(99);
    });

    it('returns null when input is null', () => {
      const transform = buildTransformer('CAST(value AS DOUBLE)', 'DOUBLE');
      expect(transform(null)).toBeNull();
    });

    it('is case-insensitive in the keyword', () => {
      const transform = buildTransformer('cast(value as integer)', 'INTEGER');
      expect(transform('5')).toBe(5);
    });
  });

  describe("COALESCE(value, 'default')", () => {
    it('returns the default string when the value is null', () => {
      const transform = buildTransformer("COALESCE(value, 'N/A')", 'VARCHAR');
      expect(transform(null)).toBe('N/A');
    });

    it('returns the actual value when it is not null', () => {
      const transform = buildTransformer("COALESCE(value, 'N/A')", 'VARCHAR');
      expect(transform('real')).toBe('real');
    });

    it('uses the default for empty string inputs (empty is absent for non-VARCHAR types)', () => {
      // COALESCE treats absent values (null/undefined/'') as missing;
      // the default is inserted and then coerced to the output type.
      const transform = buildTransformer("COALESCE(value, '0')", 'INTEGER');
      expect(transform(null)).toBe(0);
    });

    it('is case-insensitive in the keyword', () => {
      const transform = buildTransformer("coalesce(value, 'fallback')", 'VARCHAR');
      expect(transform(null)).toBe('fallback');
    });
  });

  describe('unrecognised expression', () => {
    it('falls back to plain type coercion for an unknown expression', () => {
      const transform = buildTransformer('SOME_UNKNOWN_FUNC(value)', 'INTEGER');
      expect(transform('55')).toBe(55);
    });

    it('returns null when input is null (fallback path)', () => {
      const transform = buildTransformer('UNKNOWN_EXPR', 'DOUBLE');
      expect(transform(null)).toBeNull();
    });
  });

});

// ─── applyColumnTransformations ───────────────────────────────────────────────

describe('applyColumnTransformations', () => {

  const baseColumns: ColumnDescriptor[] = [
    { sourceName: 'raw_name',  outputName: 'name',  outputType: 'VARCHAR', transformation: 'TRIM(value)' },
    { sourceName: 'raw_age',   outputName: 'age',   outputType: 'INTEGER', transformation: null },
    { sourceName: 'raw_score', outputName: 'score', outputType: 'DOUBLE',  transformation: null },
  ];

  it('maps sourceName keys to outputName keys in the transformed rows', () => {
    const rows = [{ raw_name: 'Alice', raw_age: '30', raw_score: '99.5' }];

    const { transformedRows } = applyColumnTransformations(rows, baseColumns);

    expect(transformedRows[0]).toHaveProperty('name');
    expect(transformedRows[0]).toHaveProperty('age');
    expect(transformedRows[0]).toHaveProperty('score');
    expect(transformedRows[0]).not.toHaveProperty('raw_name');
    expect(transformedRows[0]).not.toHaveProperty('raw_age');
  });

  it('applies transformations and type coercion to each cell', () => {
    const rows = [{ raw_name: '  Bob  ', raw_age: '25', raw_score: '78.3' }];

    const { transformedRows } = applyColumnTransformations(rows, baseColumns);

    expect(transformedRows[0].name).toBe('Bob'); // TRIM applied
    expect(transformedRows[0].age).toBe(25);      // coerced to INTEGER
    expect(transformedRows[0].score).toBeCloseTo(78.3);
  });

  it('counts null values per output column', () => {
    const rows = [
      { raw_name: 'Alice', raw_age: null,   raw_score: '10.0' },
      { raw_name: null,    raw_age: '20',   raw_score: null   },
      { raw_name: 'Carol', raw_age: 'oops', raw_score: '30.0' },
    ];

    const { nullCounts } = applyColumnTransformations(rows, baseColumns);

    // name: 1 null (row 2)
    expect(nullCounts.get('name')).toBe(1);
    // age: 2 nulls (row 1 and row 3 — 'oops' → null)
    expect(nullCounts.get('age')).toBe(2);
    // score: 1 null (row 2)
    expect(nullCounts.get('score')).toBe(1);
  });

  it('returns an empty transformedRows array for an empty input', () => {
    const { transformedRows, nullCounts } = applyColumnTransformations([], baseColumns);

    expect(transformedRows).toEqual([]);
    // nullCounts should still be initialised to 0 for each column
    expect(nullCounts.get('name')).toBe(0);
    expect(nullCounts.get('age')).toBe(0);
    expect(nullCounts.get('score')).toBe(0);
  });

  it('handles multiple rows correctly', () => {
    const rows = [
      { raw_name: ' Alice ', raw_age: '30', raw_score: '100.0' },
      { raw_name: ' Bob ',   raw_age: '25', raw_score: '85.5'  },
      { raw_name: ' Carol ', raw_age: '35', raw_score: '92.3'  },
    ];

    const { transformedRows } = applyColumnTransformations(rows, baseColumns);

    expect(transformedRows).toHaveLength(3);
    expect(transformedRows[0].name).toBe('Alice');
    expect(transformedRows[1].name).toBe('Bob');
    expect(transformedRows[2].name).toBe('Carol');
  });

  it('initialises nullCounts to 0 for all columns when there are no nulls', () => {
    const rows = [{ raw_name: 'Alice', raw_age: '30', raw_score: '99.0' }];

    const { nullCounts } = applyColumnTransformations(rows, baseColumns);

    for (const col of baseColumns) {
      expect(nullCounts.get(col.outputName)).toBe(0);
    }
  });

  it('handles columns with REPLACE transformation correctly', () => {
    const columns: ColumnDescriptor[] = [
      {
        sourceName: 'amount_raw',
        outputName: 'amount',
        outputType: 'DOUBLE',
        transformation: "REPLACE(',', '')",
      },
    ];
    const rows = [
      { amount_raw: '1,234.56' },
      { amount_raw: '7,890.00' },
    ];

    const { transformedRows } = applyColumnTransformations(rows, columns);

    expect(transformedRows[0].amount).toBeCloseTo(1234.56);
    expect(transformedRows[1].amount).toBeCloseTo(7890.0);
  });

  it('handles an undefined source key as null', () => {
    const columns: ColumnDescriptor[] = [
      { sourceName: 'missing_col', outputName: 'out', outputType: 'INTEGER', transformation: null },
    ];
    const rows = [{ other_col: 'irrelevant' }];

    const { transformedRows, nullCounts } = applyColumnTransformations(rows, columns);

    expect(transformedRows[0].out).toBeNull();
    expect(nullCounts.get('out')).toBe(1);
  });

});
