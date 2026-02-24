/**
 * Type coercion utilities for the spreadsheet agent's extract pipeline.
 *
 * Converts raw cell values from spreadsheet data into typed output values
 * according to the column definitions produced by the Design node. All
 * functions are pure — no external dependencies, no side effects.
 */

// ─── Excel Serial Date Epoch ───────────────────────────────────────────────
// Excel uses a serial integer where 1 = 1900-01-01 (with the leap-year bug
// that treats 1900 as a leap year, so serial 60 = phantom 1900-02-29).
// We subtract 25569 (days from 1900-01-01 to 1970-01-01) and multiply by
// the number of milliseconds per day to convert to a JS timestamp.
const EXCEL_EPOCH_OFFSET_DAYS = 25569;
const MS_PER_DAY = 86_400_000;
// Plausible range for Excel date serials: 1 (1900-01-01) through 2958465 (9999-12-31).
const EXCEL_SERIAL_MIN = 1;
const EXCEL_SERIAL_MAX = 2_958_465;

// ─── Truthy / Falsy Boolean Strings ───────────────────────────────────────
const BOOLEAN_TRUE_VALUES = new Set(['true', '1', 'yes', 'y', 'on']);
const BOOLEAN_FALSE_VALUES = new Set(['false', '0', 'no', 'n', 'off']);

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Returns true when the value is null, undefined, or an empty string.
 * An empty string is treated as absent for all non-VARCHAR types.
 */
function isAbsent(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

/**
 * Strips common numeric formatting characters before parsing.
 * Handles:
 *   - Thousand-separator commas: "1,234" → "1234"
 *   - Currency symbols: "$1.50", "€2", "£3"
 *   - Leading/trailing whitespace
 *   - Parenthesised negatives: "(123)" → "-123"
 */
function normaliseNumericString(raw: string): string {
  let s = raw.trim();
  // Parenthesised negative: (123) or ( 123 )
  const parenMatch = /^\(\s*([0-9.,]+)\s*\)$/.exec(s);
  if (parenMatch) {
    s = `-${parenMatch[1]}`;
  }
  // Strip currency symbols and commas
  s = s.replace(/[$€£]/g, '').replace(/,/g, '').trim();
  return s;
}

/**
 * Attempts to parse an Excel serial date integer into a JavaScript Date.
 * Returns null when the number is outside the plausible serial range.
 */
function parseExcelSerial(serial: number): Date | null {
  if (!Number.isInteger(serial) || serial < EXCEL_SERIAL_MIN || serial > EXCEL_SERIAL_MAX) {
    return null;
  }
  const ms = (serial - EXCEL_EPOCH_OFFSET_DAYS) * MS_PER_DAY;
  const d = new Date(ms);
  return isNaN(d.getTime()) ? null : d;
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Converts a raw cell value to the target output type.
 *
 * @param value      Raw value from the spreadsheet row.
 * @param outputType SQL-like type name (case-insensitive).
 * @returns          The converted value, or null when conversion is
 *                   impossible or the input is absent.
 */
export function coerceType(value: unknown, outputType: string): unknown {
  if (isAbsent(value)) {
    return null;
  }

  const type = outputType.toUpperCase();

  // ── VARCHAR / TEXT / STRING ──────────────────────────────────────────────
  if (type === 'VARCHAR' || type === 'TEXT' || type === 'STRING') {
    // Empty string is valid for string types — keep it.
    return String(value);
  }

  // For all remaining types, treat empty string as null.
  if (value === '') {
    return null;
  }

  // ── INTEGER / INT / BIGINT ───────────────────────────────────────────────
  if (type === 'INTEGER' || type === 'INT' || type === 'BIGINT') {
    const raw = typeof value === 'string' ? normaliseNumericString(value) : String(value);
    const n = Number(raw);
    if (isNaN(n)) {
      return null;
    }
    return Math.trunc(n);
  }

  // ── DOUBLE / FLOAT / DECIMAL / NUMERIC ───────────────────────────────────
  if (
    type === 'DOUBLE' ||
    type === 'FLOAT' ||
    type === 'DECIMAL' ||
    type === 'NUMERIC'
  ) {
    const raw = typeof value === 'string' ? normaliseNumericString(value) : String(value);
    const n = parseFloat(raw);
    return isNaN(n) ? null : n;
  }

  // ── BOOLEAN / BOOL ───────────────────────────────────────────────────────
  if (type === 'BOOLEAN' || type === 'BOOL') {
    if (typeof value === 'boolean') {
      return value;
    }
    const s = String(value).trim().toLowerCase();
    if (BOOLEAN_TRUE_VALUES.has(s)) return true;
    if (BOOLEAN_FALSE_VALUES.has(s)) return false;
    return null;
  }

  // ── DATE ─────────────────────────────────────────────────────────────────
  if (type === 'DATE') {
    // Excel serial integer
    if (typeof value === 'number') {
      const d = parseExcelSerial(value);
      if (!d) return null;
      return d.toISOString().slice(0, 10); // YYYY-MM-DD
    }
    const s = String(value).trim();
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }

  // ── TIMESTAMP / DATETIME ─────────────────────────────────────────────────
  if (type === 'TIMESTAMP' || type === 'DATETIME') {
    // Excel serial integer (date-only serial, no time component)
    if (typeof value === 'number') {
      const d = parseExcelSerial(value);
      if (!d) return null;
      return d.toISOString();
    }
    const s = String(value).trim();
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  // ── Default: stringify ────────────────────────────────────────────────────
  return String(value);
}

// ─── Transformation Parser ─────────────────────────────────────────────────

/**
 * Parses a SQL-like transformation expression and returns a function that
 * applies it to a single cell value before type coercion.
 *
 * Supported patterns (case-insensitive):
 *   - null / empty string      — identity (type coercion only)
 *   - TRIM(value) or TRIM      — String.trim()
 *   - UPPER(value) or UPPER    — String.toUpperCase()
 *   - LOWER(value) or LOWER    — String.toLowerCase()
 *   - REPLACE('x', 'y')        — global string replace
 *   - CAST(value AS TYPE)      — identity (type coercion handles the cast)
 *   - COALESCE(value, 'dflt')  — null-coalescing with a literal default
 *   - Anything else            — identity (falls back to type coercion)
 *
 * Null / undefined input values always produce null regardless of the
 * transformation expression.
 *
 * @param transformation  SQL-like expression string from the extraction plan.
 * @param outputType      Target output type passed through to `coerceType`.
 * @returns               A function that transforms a raw cell value.
 */
export function buildTransformer(
  transformation: string | null,
  outputType: string,
): (value: unknown) => unknown {
  // Normalise
  const expr = (transformation ?? '').trim().toUpperCase();

  // ── TRIM ────────────────────────────────────────────────────────────────
  if (expr === 'TRIM' || /^TRIM\s*\(\s*VALUE\s*\)$/.test(expr)) {
    return (value) => {
      if (isAbsent(value)) return null;
      return coerceType(String(value).trim(), outputType);
    };
  }

  // ── UPPER ────────────────────────────────────────────────────────────────
  if (expr === 'UPPER' || /^UPPER\s*\(\s*VALUE\s*\)$/.test(expr)) {
    return (value) => {
      if (isAbsent(value)) return null;
      return coerceType(String(value).toUpperCase(), outputType);
    };
  }

  // ── LOWER ────────────────────────────────────────────────────────────────
  if (expr === 'LOWER' || /^LOWER\s*\(\s*VALUE\s*\)$/.test(expr)) {
    return (value) => {
      if (isAbsent(value)) return null;
      return coerceType(String(value).toLowerCase(), outputType);
    };
  }

  // ── REPLACE('x', 'y') — case-insensitive matching of the keyword ─────────
  // Match: REPLACE('search', 'replace') with optional spaces.
  // The original case of the expression is needed for the literal values, so
  // we match against the original (non-uppercased) expression here.
  const replaceMatch = /^REPLACE\s*\(\s*'([^']*)'\s*,\s*'([^']*)'\s*\)$/i.exec(
    (transformation ?? '').trim(),
  );
  if (replaceMatch) {
    const searchStr = replaceMatch[1];
    const replaceStr = replaceMatch[2];
    // Escape special regex characters in the search string
    const escapedSearch = searchStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(escapedSearch, 'g');
    return (value) => {
      if (isAbsent(value)) return null;
      return coerceType(String(value).replace(pattern, replaceStr), outputType);
    };
  }

  // ── CAST(value AS TYPE) ───────────────────────────────────────────────────
  if (/^CAST\s*\(\s*VALUE\s+AS\s+\w+\s*\)$/i.test((transformation ?? '').trim())) {
    return (value) => {
      if (isAbsent(value)) return null;
      return coerceType(value, outputType);
    };
  }

  // ── COALESCE(value, 'default') ────────────────────────────────────────────
  // Matches: COALESCE(value, 'some default text')
  const coalesceMatch = /^COALESCE\s*\(\s*VALUE\s*,\s*'([^']*)'\s*\)$/i.exec(
    (transformation ?? '').trim(),
  );
  if (coalesceMatch) {
    const defaultVal = coalesceMatch[1];
    return (value) => {
      const effective = isAbsent(value) ? defaultVal : value;
      return coerceType(effective, outputType);
    };
  }

  // ── No transformation / unrecognised — fall back to type coercion ─────────
  return (value) => {
    if (isAbsent(value)) return null;
    return coerceType(value, outputType);
  };
}

// ─── Column Descriptor (subset of ExtractionPlan column) ──────────────────

export interface ColumnDescriptor {
  /** Original column name in the source spreadsheet row. */
  sourceName: string;
  /** Clean column name to use in the output row. */
  outputName: string;
  /** Target SQL-like type (e.g. 'VARCHAR', 'INTEGER', 'DATE'). */
  outputType: string;
  /** SQL-like transformation expression, or null for none. */
  transformation: string | null;
}

// ─── Batch Transformer ─────────────────────────────────────────────────────

/**
 * Applies per-column transformations and type coercions to all rows,
 * mapping source column names to output column names in one pass.
 *
 * A transformer function is compiled once per column and reused across
 * all rows for efficiency. Null counts are accumulated while iterating
 * so the caller can populate `nullCount` in the extraction result without
 * a second pass.
 *
 * @param rows     Raw rows keyed by source column name.
 * @param columns  Column descriptors from the extraction plan.
 * @returns        Transformed rows keyed by output column name, plus
 *                 a map of output column name → number of null values.
 */
export function applyColumnTransformations(
  rows: Record<string, unknown>[],
  columns: ColumnDescriptor[],
): { transformedRows: Record<string, unknown>[]; nullCounts: Map<string, number> } {
  // Compile one transformer per column up front.
  const transformers = columns.map((col) => ({
    sourceName: col.sourceName,
    outputName: col.outputName,
    fn: buildTransformer(col.transformation, col.outputType),
  }));

  // Initialise null counters.
  const nullCounts = new Map<string, number>(
    columns.map((col) => [col.outputName, 0]),
  );

  const transformedRows = rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const { sourceName, outputName, fn } of transformers) {
      const raw = row[sourceName];
      const transformed = fn(raw);
      out[outputName] = transformed;
      if (transformed === null) {
        nullCounts.set(outputName, (nullCounts.get(outputName) ?? 0) + 1);
      }
    }
    return out;
  });

  return { transformedRows, nullCounts };
}
