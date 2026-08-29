import type { DFA } from "./dfa";

export interface ExistingEdge {
  from: string;
  to: string;
  symbols: string[];
}

export function checkTransitionConflict(
  existing: ExistingEdge[],
  fromId: string,
  toId: string,
  sym: string,
): { valid: true } | { valid: false; reason: string; conflictingTo: string } {
  for (const e of existing) {
    if (e.from !== fromId) continue;
    if (e.to === toId) continue;
    if (e.symbols.includes(sym))
      return {
        valid: false,
        reason: `Determinism: this state already reads "${sym}" somewhere else.`,
        conflictingTo: e.to,
      };
  }
  return { valid: true };
}

export function validateDFA(dfa: DFA): string[] {
  const errors: string[] = [];
  if (!dfa.states.length) return ["Add at least one state."];
  if (!dfa.startState) errors.push("No start state — right-click a state and set it as start.");
  if (!dfa.acceptStates.length)
    errors.push("No accepting state — a DFA that accepts nothing can't match a language.");
  const reachable = dfa.startState ? dfa.reachableStates() : new Set<string>();
  const missing: string[] = [];
  for (const s of reachable) {
    for (const sym of dfa.alphabet) {
      if (!dfa.transition(s, sym)) missing.push(`${s} on "${sym}"`);
    }
  }
  if (missing.length)
    errors.push(
      `Missing transitions: ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? "…" : ""}`,
    );
  return errors;
}

export function validateWarnings(dfa: DFA): string[] {
  const reachable = dfa.reachableStates();
  const unreachable = dfa.states.filter((s) => !reachable.has(s));
  return unreachable.length
    ? [`Unreachable states: ${unreachable.join(", ")} (won't affect the language).`]
    : [];
}
