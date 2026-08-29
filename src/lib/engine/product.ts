/**
 * Generalised product construction.
 *
 * `DFA.symmetricDifferenceWith` already builds the product graph for the
 * equivalence check; this is the same walk with a pluggable acceptance rule so
 * intersection / union / difference / symmetric difference all come from one
 * traversal (and one set of pair labels the UI can render).
 */
import { DFA, type TransitionMap } from "./dfa";

export type ProductOp = "intersection" | "union" | "difference" | "symmetric";

export const OP_LABEL: Record<ProductOp, string> = {
  intersection: "A ∩ B",
  union: "A ∪ B",
  difference: "A \\ B",
  symmetric: "A △ B",
};

export const OP_RULE: Record<ProductOp, (a: boolean, b: boolean) => boolean> = {
  intersection: (a, b) => a && b,
  union: (a, b) => a || b,
  difference: (a, b) => a && !b,
  symmetric: (a, b) => a !== b,
};

export interface ProductPair {
  /** Label used in the resulting DFA. */
  label: string;
  left: string;
  right: string;
  accepting: boolean;
  leftAccepting: boolean;
  rightAccepting: boolean;
  /** Shortest string reaching this pair. */
  access: string;
}

export interface ProductResult {
  dfa: DFA;
  pairs: ProductPair[];
  alphabet: string[];
  op: ProductOp;
}

export function productConstruction(left: DFA, right: DFA, op: ProductOp): ProductResult {
  const alphabet = Array.from(new Set([...left.alphabet, ...right.alphabet])).sort();
  const a = new DFA({ ...left.toJSON(), alphabet }).complete();
  const b = new DFA({ ...right.toJSON(), alphabet }).complete();
  const rule = OP_RULE[op];
  const pretty = (s: string) => (s.startsWith("__SINK__") ? "∅" : s);
  const key = (x: string, y: string) => `${pretty(x)},${pretty(y)}`;

  if (!a.startState || !b.startState) {
    return {
      dfa: new DFA({ states: [], alphabet, transitions: {}, startState: null, acceptStates: [] }),
      pairs: [],
      alphabet,
      op,
    };
  }

  const start = key(a.startState, b.startState);
  const states: string[] = [start];
  const transitions: TransitionMap = {};
  const acceptStates: string[] = [];
  const pairs: ProductPair[] = [];
  const seen = new Set([start]);
  const queue: [string, string, string][] = [[a.startState, b.startState, ""]];

  while (queue.length) {
    const [x, y, access] = queue.shift()!;
    const k = key(x, y);
    const la = a.isAccepting(x);
    const rb = b.isAccepting(y);
    const accepting = rule(la, rb);
    if (accepting) acceptStates.push(k);
    pairs.push({
      label: k,
      left: pretty(x),
      right: pretty(y),
      accepting,
      leftAccepting: la,
      rightAccepting: rb,
      access,
    });
    transitions[k] = {};
    for (const sym of alphabet) {
      const nx = a.transition(x, sym);
      const ny = b.transition(y, sym);
      if (!nx || !ny) continue;
      const nk = key(nx, ny);
      transitions[k][sym] = nk;
      if (!seen.has(nk)) {
        seen.add(nk);
        states.push(nk);
        queue.push([nx, ny, access + sym]);
      }
    }
  }

  return {
    dfa: new DFA({ states, alphabet, transitions, startState: start, acceptStates }),
    pairs,
    alphabet,
    op,
  };
}

/** A few short strings that show the operation doing its job. */
export function opWitnesses(left: DFA, right: DFA, op: ProductOp, count = 4) {
  const { dfa } = productConstruction(left, right, op);
  const { accepted, rejected } = dfa.sampleStrings({ maxLen: 7, count });
  return { accepted, rejected };
}
