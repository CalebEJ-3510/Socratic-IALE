/**
 * Alphabet helpers — the app supports ANY finite alphabet, not just {0,1}.
 * Symbols are parsed from free text: comma, space or newline separated.
 * A bare run of characters ("abc") is also accepted and split per character,
 * which is how most textbooks write Σ = {a,b,c}.
 */

export const RESERVED = new Set(["(", ")", "|", "*", "+", "?", "[", "]", ".", "\\", "ε"]);

/** Parse free text into a de-duplicated list of single-character symbols. */
export function parseAlphabet(text: string): string[] {
  const chunks = text.split(/[,\s]+/).filter(Boolean);
  const out: string[] = [];
  for (const chunk of chunks) {
    // "abc" → a, b, c ; "0" → 0 ; multi-char tokens are split per character.
    for (const ch of [...chunk]) if (!out.includes(ch)) out.push(ch);
  }
  return out;
}

export function formatAlphabet(alphabet: string[]): string {
  return alphabet.join(",");
}

/** Symbols that clash with regex syntax and must be escaped in patterns. */
export function escapeSymbol(sym: string): string {
  return RESERVED.has(sym) ? `\\${sym}` : sym;
}

/** `(a|b|c)` — matches any single symbol of the alphabet. */
export function anySymbol(alphabet: string[]): string {
  return alphabet.length === 1
    ? escapeSymbol(alphabet[0]!)
    : `(${alphabet.map(escapeSymbol).join("|")})`;
}

/** A random alphabet for generated exercises, biased towards small ones. */
export function randomAlphabet(): string[] {
  const pools = [
    ["0", "1"],
    ["a", "b"],
    ["0", "1", "2"],
    ["a", "b", "c"],
    ["x", "y"],
  ];
  const weights = [0.4, 0.75, 0.85, 0.95, 1];
  const r = Math.random();
  const idx = weights.findIndex((w) => r <= w);
  return pools[idx === -1 ? 0 : idx]!;
}
