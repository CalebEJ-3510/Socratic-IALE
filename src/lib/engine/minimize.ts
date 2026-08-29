/**
 * Minimisation internals exposed for visualisation.
 *
 * `minimize()` in algorithms.ts returns only the final machine. Teaching
 * minimisation needs the *journey*: which states were still lumped together at
 * each refinement round, and — for the Myhill–Nerode view — the concrete
 * suffix that tells two states apart.
 */
import { DFA } from "./dfa";

export interface RefinementRound {
  /** 0 = the initial accept/reject split. */
  round: number;
  groups: string[][];
  /** Human-readable reason this round split something (empty on round 0). */
  note: string;
}

/** Moore refinement, recorded round by round over the completed, reachable DFA. */
export function refinementRounds(input: DFA): { dfa: DFA; rounds: RefinementRound[] } {
  const dfa = input.complete();
  if (!dfa.startState) return { dfa, rounds: [] };
  const reachable = [...dfa.reachableStates()];
  let groups: string[][] = [
    reachable.filter((s) => dfa.isAccepting(s)),
    reachable.filter((s) => !dfa.isAccepting(s)),
  ].filter((g) => g.length);

  const rounds: RefinementRound[] = [
    {
      round: 0,
      groups: groups.map((g) => [...g]),
      note: "Initial split: accepting states can never behave like non-accepting ones (ε already separates them).",
    },
  ];

  for (let r = 1; r < reachable.length + 2; r++) {
    const indexOf = new Map<string, number>();
    groups.forEach((g, i) => g.forEach((s) => indexOf.set(s, i)));
    const next: string[][] = [];
    const notes: string[] = [];
    for (const group of groups) {
      const buckets = new Map<string, string[]>();
      for (const s of group) {
        const sig = dfa.alphabet
          .map((sym) => indexOf.get(dfa.transition(s, sym) ?? "") ?? -1)
          .join("|");
        if (!buckets.has(sig)) buckets.set(sig, []);
        buckets.get(sig)!.push(s);
      }
      if (buckets.size > 1) {
        const culprit = dfa.alphabet.find((sym) => {
          const seen = new Set(group.map((s) => indexOf.get(dfa.transition(s, sym) ?? "") ?? -1));
          return seen.size > 1;
        });
        notes.push(
          `{${group.join(", ")}} splits on "${culprit ?? "?"}" — its members leave for different blocks.`,
        );
      }
      next.push(...buckets.values());
    }
    if (next.length === groups.length) break;
    groups = next;
    rounds.push({ round: r, groups: groups.map((g) => [...g]), note: notes.join(" ") });
  }

  return { dfa, rounds };
}

export interface DistinguishCell {
  a: string;
  b: string;
  distinguishable: boolean;
  /** Refinement round at which the pair got marked (-1 when equivalent). */
  round: number;
  /** Suffix w with exactly one of δ*(a,w), δ*(b,w) accepting. */
  witness: string;
}

const pk = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);

/** Table-filling: every unordered pair, with the suffix that separates it. */
export function myhillNerodeTable(input: DFA): {
  dfa: DFA;
  states: string[];
  cells: Map<string, DistinguishCell>;
  classes: string[][];
} {
  const dfa = input.complete();
  const states = [...dfa.reachableStates()];
  const cells = new Map<string, DistinguishCell>();

  for (let i = 0; i < states.length; i++) {
    for (let j = i + 1; j < states.length; j++) {
      const a = states[i]!;
      const b = states[j]!;
      const differs = dfa.isAccepting(a) !== dfa.isAccepting(b);
      cells.set(pk(a, b), {
        a,
        b,
        distinguishable: differs,
        round: differs ? 0 : -1,
        witness: differs ? "" : "",
      });
    }
  }

  for (let round = 1; ; round++) {
    let changed = false;
    for (const cell of cells.values()) {
      if (cell.distinguishable) continue;
      for (const sym of dfa.alphabet) {
        const na = dfa.transition(cell.a, sym);
        const nb = dfa.transition(cell.b, sym);
        if (!na || !nb || na === nb) continue;
        const child = cells.get(pk(na, nb));
        if (child?.distinguishable) {
          cell.distinguishable = true;
          cell.round = round;
          cell.witness = sym + child.witness;
          changed = true;
          break;
        }
      }
    }
    if (!changed) break;
  }

  // Equivalence classes = connected components of the "not distinguishable" relation.
  const classOf = new Map<string, number>();
  const classes: string[][] = [];
  for (const s of states) {
    if (classOf.has(s)) continue;
    const idx = classes.length;
    const members = states.filter((t) => t === s || cells.get(pk(s, t))?.distinguishable === false);
    members.forEach((m) => classOf.set(m, idx));
    classes.push(members);
  }

  return { dfa, states, cells, classes };
}

export const cellKey = pk;

/** Shortest string reaching a state — used to label Myhill–Nerode classes. */
export function accessString(dfa: DFA, target: string, maxLen = 12): string | null {
  if (!dfa.startState) return null;
  const queue: [string, string][] = [[dfa.startState, ""]];
  const seen = new Set([dfa.startState]);
  while (queue.length) {
    const [s, str] = queue.shift()!;
    if (s === target) return str;
    if (str.length >= maxLen) continue;
    for (const sym of dfa.alphabet) {
      const t = dfa.transition(s, sym);
      if (t && !seen.has(t)) {
        seen.add(t);
        queue.push([t, str + sym]);
      }
    }
  }
  return null;
}
