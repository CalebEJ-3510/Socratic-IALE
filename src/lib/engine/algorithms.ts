import { DFA, type TransitionMap } from "./dfa";

export interface Counterexample {
  string: string;
  expected: "accept" | "reject";
  got: "accept" | "reject";
}

/** Shortest string on which the two machines disagree, or null if equivalent. */
export function findCounterexample(dfa1: DFA, dfa2: DFA, maxLen = 25): Counterexample | null {
  if (!dfa1.startState || !dfa2.startState) return null;
  const product = dfa1.symmetricDifferenceWith(dfa2);
  if (!product.startState) return null;
  const queue: [string, string][] = [[product.startState, ""]];
  const seen = new Set([product.startState]);
  while (queue.length) {
    const [state, str] = queue.shift()!;
    if (product.isAccepting(state)) {
      return {
        string: str,
        expected: dfa1.run(str) ? "accept" : "reject",
        got: dfa2.run(str) ? "accept" : "reject",
      };
    }
    if (str.length >= maxLen) continue;
    for (const sym of product.alphabet) {
      const next = product.transition(state, sym);
      if (next && !seen.has(next)) {
        seen.add(next);
        queue.push([next, str + sym]);
      }
    }
  }
  return null;
}

export function isEquivalent(dfa1: DFA, dfa2: DFA): boolean {
  return findCounterexample(dfa1, dfa2) === null;
}

/** Moore partition refinement. */
export function minimize(input: DFA): DFA {
  const dfa = input.complete();
  if (!dfa.startState) return dfa;
  const reachable = [...dfa.reachableStates()];
  let groups: string[][] = [
    reachable.filter((s) => dfa.isAccepting(s)),
    reachable.filter((s) => !dfa.isAccepting(s)),
  ].filter((g) => g.length);

  for (;;) {
    const indexOf = new Map<string, number>();
    groups.forEach((g, i) => g.forEach((s) => indexOf.set(s, i)));
    const next: string[][] = [];
    for (const group of groups) {
      const buckets = new Map<string, string[]>();
      for (const s of group) {
        const sig = dfa.alphabet
          .map((sym) => indexOf.get(dfa.transition(s, sym) ?? "") ?? -1)
          .join("|");
        if (!buckets.has(sig)) buckets.set(sig, []);
        buckets.get(sig)!.push(s);
      }
      next.push(...buckets.values());
    }
    if (next.length === groups.length) break;
    groups = next;
  }

  const repOf = new Map<string, string>();
  groups.forEach((g) => {
    const rep = g[0];
    if (rep === undefined) return;
    g.forEach((s) => repOf.set(s, rep));
  });
  const states = groups.map((g) => g[0]).filter((s): s is string => s !== undefined);
  const transitions: TransitionMap = {};
  for (const rep of states) {
    const row: Record<string, string> = {};
    for (const sym of dfa.alphabet) {
      const t = dfa.transition(rep, sym);
      if (t) row[sym] = repOf.get(t) ?? t;
    }
    transitions[rep] = row;
  }
  return new DFA({
    states,
    alphabet: dfa.alphabet,
    transitions,
    startState: repOf.get(dfa.startState) ?? dfa.startState,
    acceptStates: states.filter((s) => dfa.isAccepting(s)),
  });
}

function complement(dfa: DFA): DFA {
  const total = dfa.complete();
  return new DFA({
    ...total.toJSON(),
    acceptStates: total.states.filter((s) => !total.isAccepting(s)),
  });
}

function witness(a: DFA, b: DFA, maxLen = 12): string | null {
  // shortest string accepted by a but rejected by b
  const prod = a.symmetricDifferenceWith(b);
  if (!prod.startState) return null;
  const queue: [string, string][] = [[prod.startState, ""]];
  const seen = new Set([prod.startState]);
  while (queue.length) {
    const [s, str] = queue.shift()!;
    if (a.run(str) && !b.run(str)) return str;
    if (str.length >= maxLen) continue;
    for (const sym of prod.alphabet) {
      const t = prod.transition(s, sym);
      if (t && !seen.has(t)) {
        seen.add(t);
        queue.push([t, str + sym]);
      }
    }
  }
  return null;
}

export interface LanguageDiff {
  lostExample: string | null;
  gainedExample: string | null;
  isEquivalent: boolean;
  isStillMinimal: boolean;
}

export function languageDiff(orig: DFA, mutated: DFA): LanguageDiff {
  const ce = findCounterexample(orig, mutated);
  const lost = witness(orig, mutated);
  const gained = witness(mutated, orig);
  const minimal = minimize(mutated);
  return {
    lostExample: lost,
    gainedExample: gained,
    isEquivalent: ce === null,
    isStillMinimal: minimal.states.length >= mutated.reachableStates().size,
  };
}

export interface TraceHint {
  level1: string;
  level2: string;
  level3: string;
  divergeIndex: number;
  divergeState: string | null;
  prefix: string;
  sym: string | null;
  crashed: boolean;
}

/** Label-agnostic graduated hints. Never names a destination state. */
export function getTraceHint(ref: DFA, student: DFA, wrongStr: string): TraceHint {
  const st = student.runWithTrace(wrongStr);
  const expected = ref.run(wrongStr) ? "accept" : "reject";
  const level1 = `On "${wrongStr || "ε"}" the reference language says ${expected}, but your machine says ${
    st.accepted ? "accept" : "reject"
  }. What is it about this string that matters?`;

  if (st.crashed) {
    const last = st.trace[st.trace.length - 1]?.state ?? null;
    const sym = wrongStr[st.crashAt] ?? null;
    return {
      level1,
      level2: `Your machine stops early: it runs out of a transition after reading ${st.crashAt} symbol(s). Every state needs an outgoing edge for every symbol.`,
      level3: `Look at the state you are sitting in after the prefix "${wrongStr.slice(0, st.crashAt) || "ε"}" and ask: what should happen when it reads "${sym}"?`,
      divergeIndex: st.crashAt,
      divergeState: last,
      prefix: wrongStr.slice(0, st.crashAt),
      sym,
      crashed: true,
    };
  }

  // earliest prefix after which the two machines' futures differ
  for (let i = 1; i <= wrongStr.length; i++) {
    const prefix = wrongStr.slice(0, i);
    let refState: string | null = ref.startState;
    let stState: string | null = student.startState;
    for (const c of prefix) {
      refState = ref.transition(refState, c);
      stState = student.transition(stState, c);
    }
    const suffix = wrongStr.slice(i);
    const refTail = refState ? ref.run(prefix + suffix) : false;
    const stTail = stState ? student.run(prefix + suffix) : false;
    if (refTail !== stTail && refState && stState) {
      const prevPrefix = wrongStr.slice(0, i - 1);
      let prevState: string | null = student.startState;
      for (const c of prevPrefix) prevState = student.transition(prevState, c);
      return {
        level1,
        level2: `Your run and the language part ways around symbol ${i} of "${wrongStr}". Read the prefix "${prevPrefix || "ε"}" again — is the state you land in really the right "memory" for what you've seen?`,
        level3: `Inspect the state you reach after "${prevPrefix || "ε"}" and its edge for "${wrongStr[i - 1]}". Does that edge preserve the information the language needs?`,
        divergeIndex: i,
        divergeState: prevState,
        prefix: prevPrefix,
        sym: wrongStr[i - 1] ?? null,
        crashed: false,
      };
    }
  }

  let finalState: string | null = student.startState;
  for (const c of wrongStr) finalState = student.transition(finalState, c);
  return {
    level1,
    level2: `Your path through the machine is fine — the disagreement is about accepting status at the end of "${wrongStr || "ε"}".`,
    level3: `Look at the state you land in after "${wrongStr || "ε"}". Should a run that ends there be accepted?`,
    divergeIndex: -1,
    divergeState: finalState,
    prefix: wrongStr,
    sym: null,
    crashed: false,
  };
}

const MISCONCEPTION_TEXT: Record<string, string> = {
  sink: "You often forget the trap/sink state: once a string is doomed, the machine still needs somewhere to live for every remaining symbol.",
  accept:
    "Accepting status keeps slipping: a state is accepting because *ending* there means success, not because it is reachable.",
  transition:
    "Transitions are the recurring gap: every state needs exactly one edge per alphabet symbol.",
  crash:
    "Your machines tend to crash mid-string — that's a missing transition, and a crash counts as reject.",
};

export function detectMisconceptions(history: { category: string }[]): string[] {
  const counts = new Map<string, number>();
  for (const h of history) counts.set(h.category, (counts.get(h.category) ?? 0) + 1);
  const out: string[] = [];
  for (const [cat, n] of counts)
    if (n >= 2 && MISCONCEPTION_TEXT[cat]) out.push(MISCONCEPTION_TEXT[cat]);
  return out;
}
