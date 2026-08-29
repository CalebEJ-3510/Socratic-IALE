import { DFA, type TransitionMap } from "./dfa";

export const EPS = "ε";

export interface NFASpec {
  states: string[];
  alphabet: string[];
  transitions: Record<string, Record<string, string[]>>;
  startStates: string[];
  acceptStates: string[];
}

export class NFA {
  states: string[];
  alphabet: string[];
  transitions: Record<string, Record<string, string[]>>;
  startStates: string[];
  acceptStates: string[];

  constructor(spec: Partial<NFASpec> = {}) {
    this.states = [...(spec.states ?? [])];
    this.alphabet = (spec.alphabet ?? []).filter((s) => s !== EPS);
    this.transitions = JSON.parse(JSON.stringify(spec.transitions ?? {}));
    this.startStates = [...(spec.startStates ?? [])];
    this.acceptStates = [...(spec.acceptStates ?? [])];
  }

  static setKey(set: Set<string>): string {
    return set.size ? [...set].sort().join(",") : "__EMPTY__";
  }

  epsilonClosure(set: Iterable<string>): Set<string> {
    const out = new Set<string>(set);
    const stack = [...out];
    while (stack.length) {
      const s = stack.pop()!;
      for (const t of this.transitions[s]?.[EPS] ?? []) {
        if (!out.has(t)) {
          out.add(t);
          stack.push(t);
        }
      }
    }
    return out;
  }

  move(set: Iterable<string>, sym: string): Set<string> {
    const out = new Set<string>();
    for (const s of set) for (const t of this.transitions[s]?.[sym] ?? []) out.add(t);
    return out;
  }

  toDFA(): { dfa: DFA; steps: string[] } {
    const steps: string[] = [];
    const start = this.epsilonClosure(this.startStates);
    const startKey = NFA.setKey(start);
    steps.push(
      `start: ε-closure({${[...this.startStates].join(",")}}) = {${[...start].join(",")}}`,
    );
    const states: string[] = [startKey];
    const transitions: TransitionMap = {};
    const acceptStates: string[] = [];
    const sets = new Map<string, Set<string>>([[startKey, start]]);
    const queue = [startKey];
    while (queue.length) {
      const key = queue.shift()!;
      const set = sets.get(key)!;
      if ([...set].some((s) => this.acceptStates.includes(s))) acceptStates.push(key);
      transitions[key] = {};
      for (const sym of this.alphabet) {
        const moved = this.move(set, sym);
        const closure = this.epsilonClosure(moved);
        const nk = NFA.setKey(closure);
        transitions[key][sym] = nk;
        steps.push(
          `δ({${[...set].join(",")}}, ${sym}) = ε-closure({${[...moved].join(",")}}) = {${[...closure].join(",")}}`,
        );
        if (!sets.has(nk)) {
          sets.set(nk, closure);
          states.push(nk);
          queue.push(nk);
        }
      }
    }
    steps.push(`done: ${states.length} DFA states`);
    return {
      dfa: new DFA({
        states,
        alphabet: this.alphabet,
        transitions,
        startState: startKey,
        acceptStates,
      }),
      steps,
    };
  }
}
