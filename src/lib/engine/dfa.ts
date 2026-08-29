/** Deterministic finite automaton. Pure, never throws. */
export type TransitionMap = Record<string, Record<string, string>>;

export interface DFAJSON {
  states: string[];
  alphabet: string[];
  transitions: TransitionMap;
  startState: string | null;
  acceptStates: string[];
}

export const SINK = "__SINK__";

export class DFA {
  states: string[];
  alphabet: string[];
  transitions: TransitionMap;
  startState: string | null;
  acceptStates: string[];

  constructor(spec: Partial<DFAJSON> = {}) {
    this.states = [...(spec.states ?? [])];
    this.alphabet = [...(spec.alphabet ?? [])];
    this.transitions = JSON.parse(JSON.stringify(spec.transitions ?? {}));
    this.startState = spec.startState ?? null;
    this.acceptStates = [...(spec.acceptStates ?? [])];
  }

  transition(state: string | null, sym: string): string | null {
    if (!state) return null;
    const row = this.transitions[state];
    if (!row) return null;
    return row[sym] ?? null;
  }

  isAccepting(state: string | null): boolean {
    return !!state && this.acceptStates.includes(state);
  }

  run(input: string): boolean {
    let cur = this.startState;
    if (!cur) return false;
    for (const sym of input) {
      cur = this.transition(cur, sym);
      if (!cur) return false;
    }
    return this.isAccepting(cur);
  }

  runWithTrace(input: string) {
    const trace: {
      state: string | null;
      symbol: string | null;
      fromState: string | null;
      position: number;
    }[] = [];
    let cur = this.startState;
    trace.push({ state: cur, symbol: null, fromState: null, position: 0 });
    if (!cur) return { accepted: false, trace, crashed: true, crashAt: 0 };
    let i = 0;
    for (const sym of input) {
      const next = this.transition(cur, sym);
      if (!next) return { accepted: false, trace, crashed: true, crashAt: i };
      trace.push({ state: next, symbol: sym, fromState: cur, position: i + 1 });
      cur = next;
      i++;
    }
    return { accepted: this.isAccepting(cur), trace, crashed: false, crashAt: -1 };
  }

  reachableStates(): Set<string> {
    const seen = new Set<string>();
    if (!this.startState) return seen;
    const queue = [this.startState];
    seen.add(this.startState);
    while (queue.length) {
      const s = queue.shift()!;
      for (const sym of this.alphabet) {
        const t = this.transition(s, sym);
        if (t && !seen.has(t)) {
          seen.add(t);
          queue.push(t);
        }
      }
    }
    return seen;
  }

  isComplete(): boolean {
    for (const s of this.reachableStates()) {
      for (const sym of this.alphabet) if (!this.transition(s, sym)) return false;
    }
    return true;
  }

  /** Total DFA: routes missing transitions to a fresh sink with self-loops. */
  complete(): DFA {
    let sink = SINK;
    while (this.states.includes(sink)) sink += "_";
    const reachable = this.reachableStates();
    const states = [...reachable];
    const transitions: TransitionMap = {};
    let needSink = false;
    for (const s of states) {
      transitions[s] = {};
      for (const sym of this.alphabet) {
        const t = this.transition(s, sym);
        if (t) transitions[s][sym] = t;
        else {
          transitions[s][sym] = sink;
          needSink = true;
        }
      }
    }
    if (needSink) {
      states.push(sink);
      const sinkRow: Record<string, string> = {};
      for (const sym of this.alphabet) sinkRow[sym] = sink;
      transitions[sink] = sinkRow;
    }
    return new DFA({
      states,
      alphabet: this.alphabet,
      transitions,
      startState: this.startState,
      acceptStates: this.acceptStates.filter((a) => reachable.has(a)),
    });
  }

  /** Product automaton accepting the symmetric difference, over the UNION alphabet. */
  symmetricDifferenceWith(other: DFA): DFA {
    const alphabet = Array.from(new Set([...this.alphabet, ...other.alphabet]));
    const a = new DFA({ ...this.toJSON(), alphabet }).complete();
    const b = new DFA({ ...other.toJSON(), alphabet }).complete();
    if (!a.startState || !b.startState) {
      return new DFA({ states: [], alphabet, transitions: {}, startState: null, acceptStates: [] });
    }
    const key = (x: string, y: string) => `${x}||${y}`;
    const states: string[] = [];
    const transitions: TransitionMap = {};
    const acceptStates: string[] = [];
    const start = key(a.startState, b.startState);
    const queue: [string, string][] = [[a.startState, b.startState]];
    const seen = new Set([start]);
    states.push(start);
    while (queue.length) {
      const [x, y] = queue.shift()!;
      const k = key(x, y);
      if (a.isAccepting(x) !== b.isAccepting(y)) acceptStates.push(k);
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
          queue.push([nx, ny]);
        }
      }
    }
    return new DFA({ states, alphabet, transitions, startState: start, acceptStates });
  }

  findShortestAccepted(maxLen = 25): string | null {
    if (!this.startState) return null;
    const queue: [string, string][] = [[this.startState, ""]];
    const seen = new Set([this.startState]);
    while (queue.length) {
      const [s, str] = queue.shift()!;
      if (this.isAccepting(s)) return str;
      if (str.length >= maxLen) continue;
      for (const sym of this.alphabet) {
        const t = this.transition(s, sym);
        if (t && !seen.has(t)) {
          seen.add(t);
          queue.push([t, str + sym]);
        }
      }
    }
    return null;
  }

  sampleStrings({ maxLen = 8, count = 15 }: { maxLen?: number; count?: number } = {}) {
    const accepted: string[] = [];
    const rejected: string[] = [];
    const queue: string[] = [""];
    const seen = new Set([""]);
    let visited = 0;
    while (queue.length && visited < 300) {
      const str = queue.shift()!;
      visited++;
      if (this.run(str)) {
        if (accepted.length < count) accepted.push(str);
      } else if (rejected.length < count) rejected.push(str);
      if (accepted.length >= count && rejected.length >= count) break;
      if (str.length >= maxLen) continue;
      for (const sym of this.alphabet) {
        const next = str + sym;
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    return { accepted, rejected };
  }

  clone(): DFA {
    return new DFA(this.toJSON());
  }

  toJSON(): DFAJSON {
    return {
      states: [...this.states],
      alphabet: [...this.alphabet],
      transitions: JSON.parse(JSON.stringify(this.transitions)),
      startState: this.startState,
      acceptStates: [...this.acceptStates],
    };
  }

  static fromJSON(obj: DFAJSON | null | undefined): DFA {
    return new DFA(obj ?? {});
  }
}
