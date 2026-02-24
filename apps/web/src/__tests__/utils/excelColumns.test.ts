import { describe, it, expect } from 'vitest';
import { colToLetter, letterToCol, isValidColLetter } from '../../utils/excelColumns';

describe('colToLetter', () => {
  it('converts single-letter columns', () => {
    expect(colToLetter(1)).toBe('A');
    expect(colToLetter(2)).toBe('B');
    expect(colToLetter(25)).toBe('Y');
    expect(colToLetter(26)).toBe('Z');
  });

  it('converts two-letter columns', () => {
    expect(colToLetter(27)).toBe('AA');
    expect(colToLetter(28)).toBe('AB');
    expect(colToLetter(52)).toBe('AZ');
    expect(colToLetter(53)).toBe('BA');
    expect(colToLetter(78)).toBe('BZ');
    expect(colToLetter(79)).toBe('CA');
    expect(colToLetter(702)).toBe('ZZ');
  });

  it('converts three-letter columns', () => {
    expect(colToLetter(703)).toBe('AAA');
  });
});

describe('letterToCol', () => {
  it('converts single-letter columns', () => {
    expect(letterToCol('A')).toBe(1);
    expect(letterToCol('B')).toBe(2);
    expect(letterToCol('Y')).toBe(25);
    expect(letterToCol('Z')).toBe(26);
  });

  it('converts two-letter columns', () => {
    expect(letterToCol('AA')).toBe(27);
    expect(letterToCol('AB')).toBe(28);
    expect(letterToCol('AZ')).toBe(52);
    expect(letterToCol('BA')).toBe(53);
    expect(letterToCol('BZ')).toBe(78);
    expect(letterToCol('CA')).toBe(79);
    expect(letterToCol('ZZ')).toBe(702);
  });

  it('converts three-letter columns', () => {
    expect(letterToCol('AAA')).toBe(703);
  });

  it('is case insensitive', () => {
    expect(letterToCol('a')).toBe(1);
    expect(letterToCol('aa')).toBe(27);
    expect(letterToCol('Az')).toBe(52);
  });
});

describe('round-trip', () => {
  it('letterToCol(colToLetter(n)) === n for n = 1..702', () => {
    for (let n = 1; n <= 702; n++) {
      expect(letterToCol(colToLetter(n))).toBe(n);
    }
  });

  it('colToLetter(letterToCol(s)) === s for known values', () => {
    const samples = ['A', 'Z', 'AA', 'AZ', 'BA', 'ZZ', 'AAA'];
    for (const s of samples) {
      expect(colToLetter(letterToCol(s))).toBe(s);
    }
  });
});

describe('isValidColLetter', () => {
  it('returns true for valid letter strings', () => {
    expect(isValidColLetter('A')).toBe(true);
    expect(isValidColLetter('Z')).toBe(true);
    expect(isValidColLetter('AA')).toBe(true);
    expect(isValidColLetter('AZ')).toBe(true);
    expect(isValidColLetter('abc')).toBe(true);
    expect(isValidColLetter('AbC')).toBe(true);
  });

  it('returns false for invalid strings', () => {
    expect(isValidColLetter('')).toBe(false);
    expect(isValidColLetter('1')).toBe(false);
    expect(isValidColLetter('A1')).toBe(false);
    expect(isValidColLetter('!')).toBe(false);
    expect(isValidColLetter(' ')).toBe(false);
    expect(isValidColLetter('A B')).toBe(false);
  });
});
