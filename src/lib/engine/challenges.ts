import { DFA, type TransitionMap } from "./dfa";
import { regexToDFA, validateRegex } from "./regex";

export type Difficulty = "Easy" | "Medium" | "Hard";

export interface Challenge {
  id: string;
  name: string;
  difficulty: Difficulty;
  alphabet: string[];
  dfa: DFA;
  initialExamples: { accepted: string[]; rejected: string[] };
  description: string;
  hints?: string[];
  source?: "fixed" | "generated" | "regex" | "ai";
}

interface Spec {
  states: string[];
  alphabet: string[];
  start: string;
  accept: string[];
  delta: TransitionMap;
}

function buildDFA(spec: Spec): DFA {
  return new DFA({
    states: spec.states,
    alphabet: spec.alphabet,
    transitions: spec.delta,
    startState: spec.start,
    acceptStates: spec.accept,
  });
}

function modDFA(
  alphabet: string[],
  n: number,
  label: string,
  acceptResidues: number[],
  bitValue: (s: string) => number,
): Spec {
  const states = Array.from({ length: n }, (_, i) => `${label}${i}`);
  const delta: TransitionMap = {};
  states.forEach((s, i) => {
    const row: Record<string, string> = {};
    for (const sym of alphabet) row[sym] = `${label}${(i * alphabet.length + bitValue(sym)) % n}`;
    delta[s] = row;
  });
  return {
    states,
    alphabet,
    start: states[0] ?? `${label}0`,
    accept: acceptResidues.map((r) => `${label}${r}`),
    delta,
  };
}

const BIN = ["0", "1"];

export const FIXED_CHALLENGES: Challenge[] = [
  {
    id: "ends-with-0",
    name: "Ends with 0",
    difficulty: "Easy",
    alphabet: BIN,
    description: "Binary strings whose last symbol is 0.",
    initialExamples: { accepted: ["0", "10", "110"], rejected: ["1", "01", "111"] },
    dfa: buildDFA({
      states: ["q0", "q1"],
      alphabet: BIN,
      start: "q0",
      accept: ["q1"],
      delta: { q0: { "0": "q1", "1": "q0" }, q1: { "0": "q1", "1": "q0" } },
    }),
  },
  {
    id: "even-ones",
    name: "Even number of 1s",
    difficulty: "Easy",
    alphabet: BIN,
    description: "Binary strings containing an even count of 1s (zero counts as even).",
    initialExamples: { accepted: ["", "11", "0110"], rejected: ["1", "01", "111"] },
    dfa: buildDFA({
      states: ["even", "odd"],
      alphabet: BIN,
      start: "even",
      accept: ["even"],
      delta: { even: { "0": "even", "1": "odd" }, odd: { "0": "odd", "1": "even" } },
    }),
  },
  {
    id: "contains-101",
    name: "Contains 101",
    difficulty: "Medium",
    alphabet: BIN,
    description: "Binary strings with 101 somewhere inside.",
    initialExamples: { accepted: ["101", "0101", "1011"], rejected: ["", "1", "1001"] },
    dfa: buildDFA({
      states: ["s0", "s1", "s2", "s3"],
      alphabet: BIN,
      start: "s0",
      accept: ["s3"],
      delta: {
        s0: { "0": "s0", "1": "s1" },
        s1: { "0": "s2", "1": "s1" },
        s2: { "0": "s0", "1": "s3" },
        s3: { "0": "s3", "1": "s3" },
      },
    }),
  },
  {
    id: "divisible-by-3",
    name: "Binary value divisible by 3",
    difficulty: "Medium",
    alphabet: BIN,
    description: "Read as a binary number (MSB first), the value is a multiple of 3.",
    initialExamples: { accepted: ["", "0", "11", "110"], rejected: ["1", "10", "101"] },
    dfa: buildDFA(modDFA(BIN, 3, "r", [0], (s) => Number(s))),
  },
  {
    id: "no-consecutive-0s",
    name: "No two 0s in a row",
    difficulty: "Medium",
    alphabet: BIN,
    description: "Binary strings that never contain 00.",
    initialExamples: { accepted: ["", "0", "101", "010"], rejected: ["00", "100", "0011"] },
    dfa: buildDFA({
      states: ["ok", "saw0", "dead"],
      alphabet: BIN,
      start: "ok",
      accept: ["ok", "saw0"],
      delta: {
        ok: { "0": "saw0", "1": "ok" },
        saw0: { "0": "dead", "1": "ok" },
        dead: { "0": "dead", "1": "dead" },
      },
    }),
  },
  {
    id: "length-div-by-3",
    name: "Length divisible by 3",
    difficulty: "Easy",
    alphabet: BIN,
    description: "Strings whose length is a multiple of 3.",
    initialExamples: { accepted: ["", "010", "111000"], rejected: ["1", "10", "1111"] },
    dfa: buildDFA({
      states: ["l0", "l1", "l2"],
      alphabet: BIN,
      start: "l0",
      accept: ["l0"],
      delta: {
        l0: { "0": "l1", "1": "l1" },
        l1: { "0": "l2", "1": "l2" },
        l2: { "0": "l0", "1": "l0" },
      },
    }),
  },
  {
    id: "a-followed-by-b",
    name: "Every a is immediately followed by b",
    difficulty: "Medium",
    alphabet: ["a", "b"],
    description: "Over {a,b}: each a must be directly followed by a b.",
    initialExamples: { accepted: ["", "b", "ab", "abab"], rejected: ["a", "aa", "aba"] },
    dfa: buildDFA({
      states: ["ok", "sawA", "dead"],
      alphabet: ["a", "b"],
      start: "ok",
      accept: ["ok"],
      delta: {
        ok: { a: "sawA", b: "ok" },
        sawA: { a: "dead", b: "ok" },
        dead: { a: "dead", b: "dead" },
      },
    }),
  },
  {
    id: "starts-with-01",
    name: "Starts with 01",
    difficulty: "Easy",
    alphabet: BIN,
    description: "Binary strings whose first two symbols are 0 then 1.",
    initialExamples: { accepted: ["01", "010", "0111"], rejected: ["", "0", "10", "00"] },
    dfa: buildDFA({
      states: ["s0", "s1", "s2", "s3"],
      alphabet: BIN,
      start: "s0",
      accept: ["s2"],
      delta: {
        s0: { "0": "s1", "1": "s3" },
        s1: { "0": "s3", "1": "s2" },
        s2: { "0": "s2", "1": "s2" },
        s3: { "0": "s3", "1": "s3" },
      },
    }),
  },
  {
    id: "not-contains-00",
    name: "Avoids the block 00",
    difficulty: "Medium",
    alphabet: BIN,
    description: "Binary strings in which the block 00 never appears.",
    initialExamples: { accepted: ["", "1", "01", "1010"], rejected: ["00", "0010", "1001"] },
    dfa: buildDFA({
      states: ["q0", "q1", "q2"],
      alphabet: BIN,
      start: "q0",
      accept: ["q0", "q1"],
      delta: {
        q0: { "0": "q1", "1": "q0" },
        q1: { "0": "q2", "1": "q0" },
        q2: { "0": "q2", "1": "q2" },
      },
    }),
  },
  {
    id: "odd-as-even-bs",
    name: "Odd number of a's and even number of b's",
    difficulty: "Hard",
    alphabet: ["a", "b"],
    description: "Over {a,b}: the a-count is odd and the b-count is even.",
    initialExamples: { accepted: ["a", "abb", "aaa"], rejected: ["", "ab", "aa", "b"] },
    dfa: buildDFA({
      states: ["ee", "eo", "oe", "oo"],
      alphabet: ["a", "b"],
      start: "ee",
      accept: ["oe"],
      delta: {
        ee: { a: "oe", b: "eo" },
        eo: { a: "oo", b: "ee" },
        oe: { a: "ee", b: "oo" },
        oo: { a: "eo", b: "oe" },
      },
    }),
  },
  {
    id: "binary-div-by-5",
    name: "Binary value divisible by 5",
    difficulty: "Hard",
    alphabet: BIN,
    description: "Read MSB first, the binary value is a multiple of 5.",
    initialExamples: { accepted: ["", "0", "101", "1010"], rejected: ["1", "11", "1001"] },
    dfa: buildDFA(modDFA(BIN, 5, "m", [0], (s) => Number(s))),
  },
  {
    id: "strict-alternating",
    name: "Strictly alternating symbols",
    difficulty: "Hard",
    alphabet: BIN,
    description: "No two equal symbols ever appear next to each other.",
    initialExamples: { accepted: ["", "0", "1", "0101", "1010"], rejected: ["00", "11", "0110"] },
    dfa: buildDFA({
      states: ["start", "last0", "last1", "dead"],
      alphabet: BIN,
      start: "start",
      accept: ["start", "last0", "last1"],
      delta: {
        start: { "0": "last0", "1": "last1" },
        last0: { "0": "dead", "1": "last1" },
        last1: { "0": "last0", "1": "dead" },
        dead: { "0": "dead", "1": "dead" },
      },
    }),
  },
];

function samplesFor(dfa: DFA, count = 4) {
  const { accepted, rejected } = dfa.sampleStrings({ maxLen: 7, count });
  return { accepted: accepted.slice(0, count), rejected: rejected.slice(0, count) };
}

type GenType = "suffix" | "contains" | "notContains" | "countMod" | "lengthMod";

export const challengeGenerator = {
  random(forceType?: GenType): Challenge | null {
    const types: GenType[] = ["suffix", "contains", "notContains", "countMod", "lengthMod"];
    const type = forceType ?? types[Math.floor(Math.random() * types.length)] ?? "suffix";
    const alphabet = BIN;
    const rnd = () => alphabet[Math.floor(Math.random() * alphabet.length)] ?? "0";
    const pattern = `${rnd()}${rnd()}${Math.random() < 0.4 ? rnd() : ""}`;
    let regex = "";
    let name = "";
    let description = "";
    let difficulty: Difficulty = "Medium";

    switch (type) {
      case "suffix":
        regex = `(0|1)*${pattern}`;
        name = `Ends with ${pattern}`;
        description = `Binary strings whose final symbols are ${pattern}.`;
        difficulty = "Easy";
        break;
      case "contains":
        regex = `(0|1)*${pattern}(0|1)*`;
        name = `Contains ${pattern}`;
        description = `Binary strings containing the block ${pattern}.`;
        break;
      case "notContains": {
        const base = regexToDFA(`(0|1)*${pattern}(0|1)*`, alphabet);
        if (!base) return null;
        const total = base.complete();
        const dfa = new DFA({
          ...total.toJSON(),
          acceptStates: total.states.filter((s) => !total.isAccepting(s)),
        });
        return {
          id: `gen-notcontains-${Date.now()}`,
          name: `Avoids ${pattern}`,
          difficulty: "Medium",
          alphabet,
          dfa,
          description: `Binary strings that never contain the block ${pattern}.`,
          initialExamples: samplesFor(dfa),
          source: "generated",
        };
      }
      case "countMod": {
        const sym = rnd();
        const other = alphabet.find((s) => s !== sym)!;
        const parity = Math.random() < 0.5 ? "even" : "odd";
        const dfa = buildDFA({
          states: ["p0", "p1"],
          alphabet,
          start: "p0",
          accept: [parity === "even" ? "p0" : "p1"],
          delta: { p0: { [sym]: "p1", [other]: "p0" }, p1: { [sym]: "p0", [other]: "p1" } },
        });
        return {
          id: `gen-countmod-${Date.now()}`,
          name: `${parity === "even" ? "Even" : "Odd"} number of ${sym}s`,
          difficulty: "Easy",
          alphabet,
          dfa,
          description: `Binary strings with an ${parity} count of ${sym}.`,
          initialExamples: samplesFor(dfa),
          source: "generated",
        };
      }
      case "lengthMod": {
        const n = 2 + Math.floor(Math.random() * 3);
        const dfa = buildDFA({
          states: Array.from({ length: n }, (_, i) => `L${i}`),
          alphabet,
          start: "L0",
          accept: ["L0"],
          delta: Object.fromEntries(
            Array.from({ length: n }, (_, i) => [
              `L${i}`,
              Object.fromEntries(alphabet.map((s) => [s, `L${(i + 1) % n}`])),
            ]),
          ),
        });
        return {
          id: `gen-lengthmod-${Date.now()}`,
          name: `Length divisible by ${n}`,
          difficulty: n > 3 ? "Medium" : "Easy",
          alphabet,
          dfa,
          description: `Strings whose length is a multiple of ${n}.`,
          initialExamples: samplesFor(dfa),
          source: "generated",
        };
      }
    }

    const dfa = regexToDFA(regex, alphabet);
    if (!dfa) return null;
    return {
      id: `gen-${type}-${Date.now()}`,
      name,
      difficulty,
      alphabet,
      dfa,
      description,
      initialExamples: samplesFor(dfa),
      source: "generated",
    };
  },

  fromRegex(
    regex: string,
    alphabet: string[],
    meta?: { name?: string; difficulty?: Difficulty; description?: string },
  ): Challenge | null {
    const check = validateRegex(regex, alphabet);
    if (!check.valid) return null;
    const dfa = regexToDFA(regex, alphabet);
    if (!dfa || !dfa.states.length) return null;
    return {
      id: `regex-${Date.now()}`,
      name: meta?.name ?? "Custom language",
      difficulty: meta?.difficulty ?? "Medium",
      alphabet,
      dfa,
      description: meta?.description ?? "A language you defined yourself.",
      initialExamples: samplesFor(dfa, 5),
      source: "regex",
    };
  },
};
