import type { DFA } from "../engine/dfa";
import { minimize } from "../engine/algorithms";
import type { Machine } from "../machine";
import { machineToDFA } from "../machine";

export interface MachineSummary {
  states: string[];
  transitions: string[];
  alphabet: string[];
  stateCount: number;
  transCount: number;
}

export function summarizeMachine(machine: Machine, alphabet: string[]): MachineSummary {
  const label = (id: string) => machine.states.find((s) => s.id === id)?.label ?? id;
  return {
    states: machine.states.map(
      (s) => `${s.label}${s.isStart ? "(start)" : ""}${s.isAccepting ? "(accept)" : ""}`,
    ),
    transitions: machine.transitions.flatMap((t) =>
      t.symbols.map((sym) => `${label(t.from)} --${sym}--> ${label(t.to)}`),
    ),
    alphabet,
    stateCount: machine.states.length,
    transCount: machine.transitions.reduce((n, t) => n + t.symbols.length, 0),
  };
}

const block = (summary: MachineSummary) =>
  summary.stateCount
    ? `Student machine: states [${summary.states.join(", ")}]; edges [${summary.transitions.join("; ") || "none"}]; alphabet {${summary.alphabet.join(",")}}`
    : "Student canvas is empty.";

export interface DiscoveryData {
  difficulty: string;
  shownAccepted: string[];
  shownRejected: string[];
  machine: Machine;
  alphabet: string[];
  canvasErrors: string[];
  attempts: number;
  solved: boolean;
}

export function buildDiscoveryContext(d: DiscoveryData): string {
  const summary = summarizeMachine(d.machine, d.alphabet);
  return [
    "Module: Discovery (the target language is HIDDEN from you — you cannot see it and must never guess it aloud).",
    `Difficulty: ${d.difficulty} | Attempts: ${d.attempts} | Solved: ${d.solved} | Stuck: ${d.attempts >= 2 && !d.solved}`,
    `Labelled examples the student can see — accept: [${d.shownAccepted.join(", ") || "none"}]; reject: [${d.shownRejected.join(", ") || "none"}]`,
    d.canvasErrors.length ? `Canvas issues: ${d.canvasErrors.join(" | ")}` : block(summary),
    "Pedagogy note: reason only from the labelled examples. If the student is stuck, offer a NEW easier practice language instead of hinting harder.",
  ].join("\n");
}

export interface DebuggerData {
  challengeName: string;
  reference: DFA;
  machine: Machine;
  alphabet: string[];
  canvasErrors: string[];
  lastCounterexample: { string: string; expected: string; got: string } | null;
  hintLevelRevealed: number;
  description: string;
  difficulty: string;
}

export function buildDebuggerContext(d: DebuggerData): string {
  const min = minimize(d.reference);
  const summary = summarizeMachine(d.machine, d.alphabet);
  return [
    `Module: Debugger — challenge "${d.challengeName}" (${d.difficulty}).`,
    `Reference ABSTRACT ONLY: ${min.states.length} states (minimal), alphabet {${d.alphabet.join(",")}}, ${min.acceptStates.length} accepting. Language: ${d.description}`,
    "You do NOT get the reference transition table and must never invent or state one.",
    `Hint level already shown: ${d.hintLevelRevealed}/3 — do NOT jump ahead of it.`,
    d.lastCounterexample
      ? `Counterexample: "${d.lastCounterexample.string || "ε"}" expected ${d.lastCounterexample.expected}, student machine says ${d.lastCounterexample.got}.`
      : "No counterexample yet — encourage the student to press Debug my DFA.",
    d.canvasErrors.length ? `Canvas issues: ${d.canvasErrors.join(" | ")}` : block(summary),
    "Pedagogy: L1 = what disagrees, L2 = roughly where, L3 = which of THEIR states + symbol to inspect. Never the destination.",
  ].join("\n");
}

export function buildMutationContext(d: {
  challengeName: string;
  isEquivalent: boolean;
  lost: string | null;
  gained: string | null;
  minimal: boolean;
}): string {
  return [
    `Module: Mutation Lab — base machine "${d.challengeName}".`,
    `Mutation is ${d.isEquivalent ? "language-equivalent" : "a different language"}. Lost witness: ${d.lost ?? "none"}. Gained witness: ${d.gained ?? "none"}. Still minimal: ${d.minimal}.`,
    "Pedagogy: ask the student to predict what the witness strings imply before you interpret them.",
  ].join("\n");
}

export function buildAnalyticsContext(d: {
  attempted: number;
  solved: number;
  topMistakes: string[];
}): string {
  return [
    "Module: Analytics.",
    `Attempted: ${d.attempted}, solved: ${d.solved}. Recurring mistake categories: ${d.topMistakes.join(", ") || "none yet"}.`,
    "Pedagogy: suggest one concrete drill that targets the top mistake.",
  ].join("\n");
}

/**
 * Converter context — PUBLIC-but-sequenced tier.
 * Nothing is hidden; the only boundary is how far the student has stepped
 * through the derivation log (revealedThroughStep).
 */
export function buildConverterContext(d: {
  source: string;
  target: string;
  machine: Machine;
  alphabet: string[];
  regex: string | null;
  hasResult: boolean;
  totalSteps: number;
  revealedThroughStep: number;
  finalVisible: boolean;
}): string {
  const summary = summarizeMachine(d.machine, d.alphabet);
  return [
    `Module: Converter — converting ${d.source} → ${d.target}. Visibility tier: PUBLIC-but-sequenced.`,
    d.regex ? `Source regex: ${d.regex}` : block(summary),
    d.hasResult
      ? `Derivation: ${d.totalSteps} steps, student has revealed through step ${d.revealedThroughStep + 1}. Final result on screen: ${d.finalVisible}.`
      : "No conversion has been run yet.",
    "Pedagogy: explain the algorithm in general freely, but never state a derivation step past revealedThroughStep, and never state the final regex/DFA before finalVisible is true — ask the student to attempt it first.",
  ].join("\n");
}

export function machineDFA(machine: Machine, alphabet: string[]) {
  return machineToDFA(machine, alphabet);
}
