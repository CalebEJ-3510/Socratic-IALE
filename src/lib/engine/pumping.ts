/**
 * Pumping-lemma adversary game.
 *
 * Deliberately independent of the DFA engine: these languages are NOT regular,
 * so there is no machine to build. Membership is decided by a hand-written
 * predicate per language and the app plays the adversary (it picks p and the
 * decomposition; the student picks s and the pumping exponent i).
 */

export interface PumpingLanguage {
  id: string;
  name: string;
  /** Rendered set-builder description. */
  formal: string;
  alphabet: string[];
  /** Hand-coded membership test — no automaton involved. */
  member: (s: string) => boolean;
  /** Why the intuitive counting argument fails for a finite-state machine. */
  intuition: string;
  /** Suggested pumping candidates of length >= p (student may type their own). */
  suggest: (p: number) => string[];
}

const rep = (c: string, n: number) => c.repeat(Math.max(0, n));

export const PUMPING_LANGUAGES: PumpingLanguage[] = [
  {
    id: "anbn",
    name: "Equal a's then b's",
    formal: "L = { aⁿbⁿ | n ≥ 0 }",
    alphabet: ["a", "b"],
    member: (s) =>
      /^a*b*$/.test(s) && s.split("b")[0]!.length === s.length - s.split("b")[0]!.length,
    intuition: "Counting an unbounded n needs unbounded memory; a DFA has finitely many states.",
    suggest: (p) => [rep("a", p) + rep("b", p), rep("a", p + 1) + rep("b", p + 1)],
  },
  {
    id: "ww",
    name: "Doubled words",
    formal: "L = { ww | w ∈ {0,1}* }",
    alphabet: ["0", "1"],
    member: (s) => s.length % 2 === 0 && s.slice(0, s.length / 2) === s.slice(s.length / 2),
    intuition: "The machine would have to remember the whole first half to compare it.",
    suggest: (p) => [rep("0", p) + "1" + rep("0", p) + "1", rep("0", p) + rep("0", p)],
  },
  {
    id: "palindrome",
    name: "Palindromes",
    formal: "L = { w | w = wᴿ, w ∈ {0,1}* }",
    alphabet: ["0", "1"],
    member: (s) => s === [...s].reverse().join(""),
    intuition: "Matching the tail against the head requires remembering arbitrarily long prefixes.",
    suggest: (p) => [rep("0", p) + "1" + rep("0", p), rep("0", p) + rep("0", p)],
  },
  {
    id: "squares",
    name: "Square-length blocks",
    formal: "L = { 0ᵏ | k is a perfect square }",
    alphabet: ["0"],
    member: (s) => /^0*$/.test(s) && Number.isInteger(Math.sqrt(s.length)),
    intuition: "Gaps between squares grow without bound, so no fixed loop length can keep up.",
    suggest: (p) => [rep("0", p * p), rep("0", (p + 1) * (p + 1))],
  },
  {
    id: "morethan",
    name: "More b's than a's",
    formal: "L = { aⁿbᵐ | 0 ≤ n < m }",
    alphabet: ["a", "b"],
    member: (s) => {
      if (!/^a*b*$/.test(s)) return false;
      const n = (s.match(/^a*/)?.[0] ?? "").length;
      return n < s.length - n;
    },
    intuition: "The comparison n < m is unbounded arithmetic, not a finite look-up.",
    suggest: (p) => [rep("a", p) + rep("b", p + 1), rep("a", p + 1) + rep("b", p + 2)],
  },
];

export interface Split {
  x: string;
  y: string;
  z: string;
}

export const splitLabel = (s: Split) => `x="${s.x || "ε"}", y="${s.y}", z="${s.z || "ε"}"`;

/** Every legal decomposition: |xy| ≤ p and |y| > 0. */
export function legalSplits(s: string, p: number): Split[] {
  const out: Split[] = [];
  const cap = Math.min(p, s.length);
  for (let start = 0; start < cap; start++) {
    for (let end = start + 1; end <= cap; end++) {
      out.push({ x: s.slice(0, start), y: s.slice(start, end), z: s.slice(end) });
    }
  }
  return out;
}

export const pump = (s: Split, i: number) => s.x + s.y.repeat(Math.max(0, i)) + s.z;

/** Exponents 0..maxI for which xyⁱz leaves the language. */
export function breakingExponents(lang: PumpingLanguage, s: Split, maxI = 4): number[] {
  const out: number[] = [];
  for (let i = 0; i <= maxI; i++) if (!lang.member(pump(s, i))) out.push(i);
  return out;
}

/**
 * The adversary picks the decomposition that is hardest to break: the one with
 * the fewest working exponents, tie-broken by the largest smallest exponent.
 */
export function adversarySplit(lang: PumpingLanguage, s: string, p: number): Split | null {
  const options = legalSplits(s, p);
  if (!options.length) return null;
  let best = options[0]!;
  let bestScore = -Infinity;
  for (const opt of options) {
    const breaks = breakingExponents(lang, opt);
    const score = -breaks.length * 10 + (breaks[0] ?? 9);
    if (score > bestScore) {
      bestScore = score;
      best = opt;
    }
  }
  return best;
}

export interface Verdict {
  pumped: string;
  inLanguage: boolean;
  /** True when the student's exponent wins the round. */
  wins: boolean;
  message: string;
}

export function judge(lang: PumpingLanguage, s: Split, i: number): Verdict {
  const pumped = pump(s, i);
  const inLanguage = lang.member(pumped);
  return {
    pumped,
    inLanguage,
    wins: !inLanguage,
    message: inLanguage
      ? `xy^${i}z = "${pumped || "ε"}" is still in L — that exponent doesn't contradict anything. Try another i.`
      : `xy^${i}z = "${pumped || "ε"}" ∉ L. The decomposition is broken, so this p fails.`,
  };
}

export interface ChallengeCheck {
  ok: boolean;
  message: string;
}

/** Validates the student's chosen s before the adversary answers. */
export function checkCandidate(lang: PumpingLanguage, s: string, p: number): ChallengeCheck {
  const bad = [...s].find((c) => !lang.alphabet.includes(c));
  if (bad) return { ok: false, message: `"${bad}" is not in Σ = {${lang.alphabet.join(",")}}.` };
  if (s.length < p)
    return { ok: false, message: `|s| = ${s.length} but the lemma needs |s| ≥ p = ${p}.` };
  if (!lang.member(s)) return { ok: false, message: `"${s}" is not in L — pick a string from L.` };
  return { ok: true, message: `"${s}" ∈ L and |s| = ${s.length} ≥ ${p}. Over to the adversary.` };
}
