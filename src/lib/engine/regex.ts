import { DFA } from "./dfa";
import { EPS, NFA } from "./nfa";

/** Thompson construction fragment. */
interface Frag {
  start: string;
  accept: string;
  trans: Record<string, Record<string, string[]>>;
  states: string[];
}

class Builder {
  private n = 0;
  alphabet: string[];

  constructor(alphabet: string[]) {
    this.alphabet = alphabet;
  }

  private id() {
    return `n${this.n++}`;
  }

  private empty(): Frag {
    const s = this.id();
    const a = this.id();
    return { start: s, accept: a, trans: {}, states: [s, a] };
  }

  private add(f: Frag, from: string, sym: string, to: string) {
    f.trans[from] = f.trans[from] ?? {};
    f.trans[from][sym] = f.trans[from][sym] ?? [];
    if (!f.trans[from][sym].includes(to)) f.trans[from][sym].push(to);
  }

  literal(sym: string): Frag {
    const f = this.empty();
    this.add(f, f.start, sym, f.accept);
    return f;
  }

  epsilon(): Frag {
    const f = this.empty();
    this.add(f, f.start, EPS, f.accept);
    return f;
  }

  private merge(a: Frag, b: Frag): Record<string, Record<string, string[]>> {
    const out: Record<string, Record<string, string[]>> = JSON.parse(JSON.stringify(a.trans));
    for (const [from, row] of Object.entries(b.trans)) {
      out[from] = out[from] ?? {};
      for (const [sym, tos] of Object.entries(row)) {
        out[from][sym] = Array.from(new Set([...(out[from][sym] ?? []), ...tos]));
      }
    }
    return out;
  }

  concat(a: Frag, b: Frag): Frag {
    const f: Frag = {
      start: a.start,
      accept: b.accept,
      trans: this.merge(a, b),
      states: [...a.states, ...b.states],
    };
    this.add(f, a.accept, EPS, b.start);
    return f;
  }

  union(a: Frag, b: Frag): Frag {
    const s = this.id();
    const acc = this.id();
    const f: Frag = {
      start: s,
      accept: acc,
      trans: this.merge(a, b),
      states: [...a.states, ...b.states, s, acc],
    };
    this.add(f, s, EPS, a.start);
    this.add(f, s, EPS, b.start);
    this.add(f, a.accept, EPS, acc);
    this.add(f, b.accept, EPS, acc);
    return f;
  }

  star(a: Frag): Frag {
    const s = this.id();
    const acc = this.id();
    const f: Frag = {
      start: s,
      accept: acc,
      trans: JSON.parse(JSON.stringify(a.trans)),
      states: [...a.states, s, acc],
    };
    this.add(f, s, EPS, a.start);
    this.add(f, s, EPS, acc);
    this.add(f, a.accept, EPS, a.start);
    this.add(f, a.accept, EPS, acc);
    return f;
  }

  optional(a: Frag): Frag {
    return this.union(a, this.epsilon());
  }

  plus(a: Frag): Frag {
    const s = this.id();
    const acc = this.id();
    const f: Frag = {
      start: s,
      accept: acc,
      trans: JSON.parse(JSON.stringify(a.trans)),
      states: [...a.states, s, acc],
    };
    this.add(f, s, EPS, a.start);
    this.add(f, a.accept, EPS, a.start);
    this.add(f, a.accept, EPS, acc);
    return f;
  }

  toNFA(f: Frag): NFA {
    return new NFA({
      states: Array.from(new Set(f.states)),
      alphabet: this.alphabet,
      transitions: f.trans,
      startStates: [f.start],
      acceptStates: [f.accept],
    });
  }
}

class Parser {
  private i = 0;
  constructor(
    private src: string,
    private b: Builder,
  ) {}

  private peek() {
    return this.src[this.i];
  }

  parse(): Frag {
    const f = this.parseUnion();
    if (this.i < this.src.length) throw new Error(`Unexpected "${this.peek()}" at ${this.i}`);
    return f;
  }

  private parseUnion(): Frag {
    let left = this.parseConcat();
    while (this.peek() === "|") {
      this.i++;
      left = this.b.union(left, this.parseConcat());
    }
    return left;
  }

  private parseConcat(): Frag {
    let out: Frag | null = null;
    while (this.i < this.src.length && this.peek() !== "|" && this.peek() !== ")") {
      const atom = this.parseQuantified();
      out = out ? this.b.concat(out, atom) : atom;
    }
    return out ?? this.b.epsilon();
  }

  private parseQuantified(): Frag {
    let a = this.parseAtom();
    for (;;) {
      const c = this.peek();
      if (c === "*") {
        this.i++;
        a = this.b.star(a);
      } else if (c === "+") {
        this.i++;
        a = this.b.plus(a);
      } else if (c === "?") {
        this.i++;
        a = this.b.optional(a);
      } else break;
    }
    return a;
  }

  private unionOf(symbols: string[]): Frag {
    if (!symbols.length) return this.b.epsilon();
    return symbols.map((s) => this.b.literal(s)).reduce((acc, f) => this.b.union(acc, f));
  }

  private parseAtom(): Frag {
    const c = this.peek();
    if (c === undefined) throw new Error("Unexpected end of pattern");
    if (c === "(") {
      this.i++;
      const inner = this.parseUnion();
      if (this.peek() !== ")") throw new Error("Missing closing )");
      this.i++;
      return inner;
    }
    if (c === "[") return this.parseClass();
    if (c === ".") {
      this.i++;
      return this.unionOf(this.b.alphabet);
    }
    if (c === "\\") {
      this.i++;
      const lit = this.peek();
      if (lit === undefined) throw new Error("Dangling escape");
      this.i++;
      return this.b.literal(lit);
    }
    if (c === ")" || c === "*" || c === "+" || c === "?" || c === "|")
      throw new Error(`Unexpected "${c}" at ${this.i}`);
    this.i++;
    if (c === "ε") return this.b.epsilon();
    return this.b.literal(c);
  }

  private parseClass(): Frag {
    this.i++; // [
    let negate = false;
    if (this.peek() === "^") {
      negate = true;
      this.i++;
    }
    const chars: string[] = [];
    while (this.i < this.src.length && this.peek() !== "]") {
      const c = this.src[this.i++] ?? "";
      const lookahead = this.src[this.i + 1];
      if (this.peek() === "-" && lookahead && lookahead !== "]") {
        this.i++;
        const end = this.src[this.i++] ?? c;
        for (let k = c.charCodeAt(0); k <= end.charCodeAt(0); k++)
          chars.push(String.fromCharCode(k));
      } else chars.push(c);
    }
    if (this.peek() !== "]") throw new Error("Missing closing ]");
    this.i++;
    const set = negate
      ? this.b.alphabet.filter((s) => !chars.includes(s))
      : chars.filter((c) => this.b.alphabet.includes(c));
    return this.unionOf(set);
  }
}

export function regexToNFA(regex: string, alphabet: string[]): NFA {
  const b = new Builder(alphabet);
  const frag = new Parser(regex, b).parse();
  return b.toNFA(frag);
}

export function regexToDFA(regex: string, alphabet: string[]): DFA | null {
  try {
    return regexToNFA(regex, alphabet).toDFA().dfa;
  } catch {
    return null;
  }
}

export function validateRegex(
  regex: string,
  alphabet: string[],
): { valid: boolean; error?: string } {
  if (!regex || !regex.trim()) return { valid: false, error: "Pattern is empty." };
  try {
    regexToNFA(regex, alphabet);
    return { valid: true };
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : "Invalid pattern." };
  }
}
