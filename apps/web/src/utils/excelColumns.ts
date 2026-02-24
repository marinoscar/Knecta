/**
 * Converts a 1-based column number to an Excel-style column letter.
 * Examples: 1→A, 26→Z, 27→AA, 702→ZZ, 703→AAA
 */
export function colToLetter(num: number): string {
  let result = '';
  let n = num;
  while (n > 0) {
    const remainder = ((n - 1) % 26) + 1;
    result = String.fromCharCode(64 + remainder) + result;
    n = Math.floor((n - remainder) / 26);
  }
  return result;
}

/**
 * Converts an Excel-style column letter (case-insensitive) to a 1-based column number.
 * Examples: A→1, Z→26, AA→27, ZZ→702, AAA→703
 */
export function letterToCol(letter: string): number {
  const upper = letter.toUpperCase();
  let result = 0;
  for (let i = 0; i < upper.length; i++) {
    result = result * 26 + (upper.charCodeAt(i) - 64);
  }
  return result;
}

/**
 * Returns true if the string is a non-empty sequence of A-Z letters (case-insensitive).
 * Examples: "A"→true, "AA"→true, "abc"→true, ""→false, "A1"→false
 */
export function isValidColLetter(s: string): boolean {
  return /^[A-Za-z]+$/.test(s);
}
