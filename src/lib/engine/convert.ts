/**
 * Universal interconversion primitives: DFA | NFA | ε-NFA | Regex.
 *
 * Most cells of the conversion matrix reduce to a handful of algorithms:
 *   - liftToNfa        : DFA → NFA / ε-NFA (an honest reinterpretation, not a computation)
 *   - removeEpsilons   : ε-NFA → NFA
 *   - NFA.toDFA()      : NFA / ε-NFA → DFA (existing subset construction)
 *   - regexToNFA/DFA   : Regex → ε-NFA (Thompson) / DFA (existing)
 *   - nfaToRegex       : any automaton → Regex (GNFA state elimination)
 */
import { DFA } from "./dfa";
import { EPS, NFA } from "./nfa";
import { findCounterexample, type Counterexample } from "./algorithms";
import { regexToDFA } from "./regex";
import type { Machine, MachineTransition } from "../machine";
import { layoutMachine } from "../machine";

export type RepId = "dfa" | "nfa" | "enfa" | "regex";

export const REPS: { id: RepId; label: string }[] = [
  { id: "dfa", label: "DFA" },
  { id: "nfa", label: "NFA" },
  { id: "enfa", label: "ε-NFA" },
  { id: "regex", label: "Regex" },
];

/* ────────────────────────── identity lift ────────────────────────── */

/**
 * A DFA already satisfies the NFA definition (singleton targets, no ε), so this
 * is a reinterpretation rather than a transformation. No decorative ε-edges.
 */
export function liftToNfa(dfa: DFA): NFA {
  const transitions: Record<string, Record<string, string[]>> = {};
  for (const [from, row] of Object.entries(dfa.transitions)) {
    transitions[from] = {};
    for (const [sym, to] of Object.entries(row)) if (to) transitions[from]![sym] = [to];
  }
  return new NFA({
    states: [...dfa.states],
    alphabet: [...dfa.alphabet],
    transitions,
    startStates: dfa.startState ? [dfa.startState] : [],
    acceptStates: [...dfa.acceptStates],
  });
}

export function hasEpsilon(nfa: NFA): boolean {
  return Object.values(nfa.transitions).some((row) => (row[EPS]?.length ?? 0) > 0);
}

/* ────────────────────────── ε-removal ────────────────────────── */

/** ε-NFA → NFA. Keeps nondeterminism; does NOT determinise. */
export function removeEpsilons(nfa: NFA): { nfa: NFA; steps: string[] } {
  const steps: string[] = [];
  if (!hasEpsilon(nfa)) {
    return {
      nfa: new NFA(nfa),
      steps: ["input has no ε-edges — passed through unchanged (identity)"],
    };
  }
  const transitions: Record<string, Record<string, string[]>> = {};
  const acceptStates: string[] = [];
  for (const q of nfa.states) {
    const closure = nfa.epsilonClosure([q]);
    steps.push(`ε-closure(${q}) = {${[...closure].join(",")}}`);
    for (const a of nfa.alphabet) {
      const targets = new Set<string>();
      for (const p of closure) for (const t of nfa.transitions[p]?.[a] ?? []) targets.add(t);
      if (targets.size) {
        transitions[q] ??= {};
        transitions[q]![a] = [...targets].sort();
        steps.push(`δ'(${q},${a}) = {${[...targets].sort().join(",")}}`);
      }
    }
    if ([...closure].some((s) => nfa.acceptStates.includes(s))) acceptStates.push(q);
  }
  steps.push(`accepting after ε-removal: {${acceptStates.join(",")}}`);
  return {
    nfa: new NFA({
      states: [...nfa.states],
      alphabet: [...nfa.alphabet],
      transitions,
      startStates: [...nfa.startStates],
      acceptStates,
    }),
    steps,
  };
}

/* ────────────────────────── GNFA state elimination ────────────────────────── */

export interface GNFAStep {
  eliminated: string;
  states: string[];
  edges: { from: string; to: string; label: string }[];
  note: string;
}

const EMPTY = "∅";

function isAtomic(r: string): boolean {
  if (r.length === 1) return true;
  if (!r.startsWith("(") || !r.endsWith(")")) return false;
  let depth = 0;
  for (let i = 0; i < r.length; i++) {
    if (r[i] === "(") depth++;
    else if (r[i] === ")") {
      depth--;
      if (depth === 0 && i < r.length - 1) return false;
    }
  }
  return true;
}

const wrap = (r: string) => (isAtomic(r) ? r : `(${r})`);

function concat(a: string, b: string): string {
  if (a === EMPTY || b === EMPTY) return EMPTY;
  if (a === EPS) return b;
  if (b === EPS) return a;
  return `${wrap(a)}${wrap(b)}`;
}

function union(a: string | null, b: string | null): string {
  if (!a || a === EMPTY) return b ?? EMPTY;
  if (!b || b === EMPTY) return a;
  if (a === b) return a;
  return `${a}|${b}`;
}

function star(r: string): string {
  if (r === EMPTY || r === EPS) return EPS;
  return `${wrap(r)}*`;
}

/** Cosmetic tidy-up applied to the FINAL string only — intermediate steps stay raw. */
function cleanup(r: string): string {
  let out = r;
  for (let i = 0; i < 4; i++) {
    const next = out
      .replace(new RegExp(`${EPS}\\|${EPS}`, "g"), EPS)
      .replace(new RegExp(`\\(${EPS}\\)`, "g"), EPS)
      .replace(new RegExp(`${EPS}(?=[^*+?|)]|$)`, "g"), "")
      .replace(/\(([^()|]{1})\)/g, "$1");
    if (next === out || next === "") break;
    out = next;
  }
  return out || EPS;
}

/**
 * Any NFA (or ε-NFA, or lifted DFA) → regex, by GNFA state elimination.
 * Elimination order (lowest degree first) — not the cleanup pass — is what
 * actually determines how messy the raw result looks.
 */
export function nfaToRegex(nfa: NFA): { regex: string | null; steps: GNFAStep[] } {
  const S = "⟨S⟩";
  const F = "⟨F⟩";
  const steps: GNFAStep[] = [];
  if (!nfa.startStates.length) return { regex: null, steps };

  const R = new Map<string, string>();
  const key = (a: string, b: string) => `${a}\u0000${b}`;
  const get = (a: string, b: string) => R.get(key(a, b)) ?? null;
  const set = (a: string, b: string, v: string | null) => {
    if (!v || v === EMPTY) R.delete(key(a, b));
    else R.set(key(a, b), v);
  };

  for (const s of nfa.startStates) set(S, s, union(get(S, s), EPS));
  for (const s of nfa.acceptStates) set(s, F, union(get(s, F), EPS));
  for (const [from, row] of Object.entries(nfa.transitions)) {
    for (const [sym, tos] of Object.entries(row)) {
      for (const to of tos ?? []) set(from, to, union(get(from, to), sym));
    }
  }

  let remaining = nfa.states.filter((s) => s !== S && s !== F);
  const snapshot = (eliminated: string, note: string): GNFAStep => ({
    eliminated,
    note,
    states: [S, ...remaining, F],
    edges: [...R.entries()].map(([k, label]) => {
      const [from = "", to = ""] = k.split("\u0000");
      return { from, to, label };
    }),
  });

  steps.push(snapshot("—", "GNFA built: new start ⟨S⟩ and single final ⟨F⟩ wired in with ε."));

  while (remaining.length) {
    const degree = (q: string) =>
      [...R.keys()].filter((k) => {
        const [a = "", b = ""] = k.split("\u0000");
        return (a === q || b === q) && a !== b;
      }).length;
    remaining.sort((a, b) => degree(a) - degree(b));
    const q = remaining[0]!;
    remaining = remaining.slice(1);

    const self = get(q, q);
    const ins = [...R.keys()]
      .map((k) => k.split("\u0000") as [string, string])
      .filter(([a, b]) => b === q && a !== q);
    const outs = [...R.keys()]
      .map((k) => k.split("\u0000") as [string, string])
      .filter(([a, b]) => a === q && b !== q);

    for (const [i] of ins) {
      for (const [, j] of outs) {
        const mid = self
          ? concat(concat(get(i, q)!, star(self)), get(q, j)!)
          : concat(get(i, q)!, get(q, j)!);
        set(i, j, union(get(i, j), mid));
      }
    }
    for (const k of [...R.keys()]) {
      const [a = "", b = ""] = k.split("\u0000");
      if (a === q || b === q) R.delete(k);
    }
    steps.push(snapshot(q, `eliminated ${q}${self ? " (self-loop folded in as R(q,q)*)" : ""}`));
  }

  const answer = get(S, F);
  return { regex: answer ? cleanup(answer) : null, steps };
}

/* ────────────────────────── verification ────────────────────────── */

export function verifyRegexAgainstDfa(
  regex: string,
  original: DFA,
): { equivalent: boolean; counterexample: Counterexample | null; error?: string } {
  const alphabet = original.alphabet.filter((s) => s !== EPS);
  const built = regexToDFA(regex, alphabet);
  if (!built)
    return { equivalent: false, counterexample: null, error: "Result did not parse as a regex." };
  const cex = findCounterexample(original, built);
  return { equivalent: !cex, counterexample: cex };
}

/* ────────────────────────── rendering helper ────────────────────────── */

/** NFA → editable/renderable Machine (multi-target edges collapsed per state pair). */
export function nfaToMachine(nfa: NFA): Machine {
  const states = nfa.states.map((label, i) => ({
    id: `n${i + 1}`,
    label,
    x: 0,
    y: 0,
    isStart: nfa.startStates.includes(label),
    isAccepting: nfa.acceptStates.includes(label),
  }));
  const idOf = (label: string) => states.find((s) => s.label === label)?.id ?? label;
  const edges = new Map<string, MachineTransition>();
  let n = 0;
  for (const [from, row] of Object.entries(nfa.transitions)) {
    for (const [sym, tos] of Object.entries(row)) {
      for (const to of tos ?? []) {
        if (!states.some((s) => s.label === to)) continue;
        const k = `${from}->${to}`;
        if (!edges.has(k))
          edges.set(k, { id: `e${++n}`, from: idOf(from), to: idOf(to), symbols: [] });
        const e = edges.get(k)!;
        if (!e.symbols.includes(sym)) e.symbols.push(sym);
      }
    }
  }
  return layoutMachine({ states, transitions: [...edges.values()] });
}

/** Machine → NFA (allows nondeterminism and ε). */
export function machineToNFA(machine: Machine, alphabet: string[]): NFA {
  const label = (id: string) => machine.states.find((s) => s.id === id)?.label ?? id;
  const transitions: Record<string, Record<string, string[]>> = {};
  for (const t of machine.transitions) {
    const from = label(t.from);
    const to = label(t.to);
    transitions[from] ??= {};
    for (const sym of t.symbols) {
      transitions[from]![sym] ??= [];
      if (!transitions[from]![sym]!.includes(to)) transitions[from]![sym]!.push(to);
    }
  }
  return new NFA({
    states: machine.states.map((s) => s.label),
    alphabet: alphabet.filter((s) => s !== EPS),
    transitions,
    startStates: machine.states.filter((s) => s.isStart).map((s) => s.label),
    acceptStates: machine.states.filter((s) => s.isAccepting).map((s) => s.label),
  });
}

/** Determinised view of any source, used as the oracle for verification. */
export function toDfa(nfa: NFA): DFA {
  return nfa.toDFA().dfa;
}
