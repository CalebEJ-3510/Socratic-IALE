import { useMemo, useState } from "react";
import { DFACanvas } from "@/components/DFACanvas";
import { NFA, EPS } from "@/lib/engine/nfa";
import { dfaToMachine, layoutMachine } from "@/lib/machine";

interface Preset {
  name: string;
  description: string;
  alphabet: string[];
  nfa: NFA;
}

const PRESETS: Preset[] = [
  {
    name: "Ends with 1",
    description: "Nondeterministically guess where the final 1 is.",
    alphabet: ["0", "1"],
    nfa: new NFA({
      states: ["n0", "n1"],
      alphabet: ["0", "1"],
      transitions: { n0: { "0": ["n0"], "1": ["n0", "n1"] } },
      startStates: ["n0"],
      acceptStates: ["n1"],
    }),
  },
  {
    name: "Contains ab",
    description: "Guess the start of the block ab.",
    alphabet: ["a", "b"],
    nfa: new NFA({
      states: ["p0", "p1", "p2"],
      alphabet: ["a", "b"],
      transitions: {
        p0: { a: ["p0", "p1"], b: ["p0"] },
        p1: { b: ["p2"] },
        p2: { a: ["p2"], b: ["p2"] },
      },
      startStates: ["p0"],
      acceptStates: ["p2"],
    }),
  },
  {
    name: "Even length OR starts with a (ε)",
    description: "Two branches joined by ε-transitions from a single start state.",
    alphabet: ["a", "b"],
    nfa: new NFA({
      states: ["s", "e0", "e1", "a0", "a1"],
      alphabet: ["a", "b"],
      transitions: {
        s: { [EPS]: ["e0", "a0"] },
        e0: { a: ["e1"], b: ["e1"] },
        e1: { a: ["e0"], b: ["e0"] },
        a0: { a: ["a1"] },
        a1: { a: ["a1"], b: ["a1"] },
      },
      startStates: ["s"],
      acceptStates: ["e0", "a1"],
    }),
  },
  {
    name: "Third-to-last is 1",
    description: "Guess the position three symbols from the end.",
    alphabet: ["0", "1"],
    nfa: new NFA({
      states: ["t0", "t1", "t2", "t3"],
      alphabet: ["0", "1"],
      transitions: {
        t0: { "0": ["t0"], "1": ["t0", "t1"] },
        t1: { "0": ["t2"], "1": ["t2"] },
        t2: { "0": ["t3"], "1": ["t3"] },
      },
      startStates: ["t0"],
      acceptStates: ["t3"],
    }),
  },
];

export function NFALab() {
  const [index, setIndex] = useState(0);
  const [converted, setConverted] = useState<{ steps: string[]; stateCount: number } | null>(null);
  const [logStep, setLogStep] = useState(0);
  const preset = PRESETS[index]!;

  const nfaMachine = useMemo(() => {
    const dfaLike = {
      states: preset.nfa.states,
      alphabet: [...preset.alphabet, EPS],
      transitions: Object.fromEntries(
        Object.entries(preset.nfa.transitions).map(([from, row]) => [
          from,
          Object.fromEntries(Object.entries(row).map(([sym, tos]) => [sym, tos[0]])),
        ]),
      ),
      startState: preset.nfa.startStates[0],
      acceptStates: preset.nfa.acceptStates,
    };
    // include all nondeterministic branches as extra edges by manual construction
    const machine = layoutMachine(
      dfaToMachine(
        new (
          Object.getPrototypeOf(preset.nfa.toDFA().dfa).constructor as new (a: unknown) => never
        )(dfaLike) as never,
      ),
    );
    const idOf = (label: string) => machine.states.find((s) => s.label === label)?.id;
    let n = machine.transitions.length;
    for (const [from, row] of Object.entries(preset.nfa.transitions)) {
      for (const [sym, tos] of Object.entries(row)) {
        for (const to of tos) {
          const f = idOf(from);
          const t = idOf(to);
          if (!f || !t) continue;
          const existing = machine.transitions.find((e) => e.from === f && e.to === t);
          if (existing) {
            if (!existing.symbols.includes(sym)) existing.symbols.push(sym);
          } else machine.transitions.push({ id: `x${++n}`, from: f, to: t, symbols: [sym] });
        }
      }
    }
    return machine;
  }, [preset]);

  const dfaMachine = useMemo(
    () => (converted ? layoutMachine(dfaToMachine(preset.nfa.toDFA().dfa)) : null),
    [converted, preset],
  );

  const convert = () => {
    const { dfa, steps } = preset.nfa.toDFA();
    setConverted({ steps, stateCount: dfa.states.length });
    setLogStep(0);
  };

  return (
    <div className="module-container">
      <aside className="module-panel-left" style={{ width: 340, flexShrink: 0 }}>
        <div>
          <span className="badge" data-tone="blue">
            NFA Lab
          </span>
          <h2 className="mt-2 text-lg">Subset construction</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--ink-muted)" }}>
            {preset.description} ε-edges are labelled{" "}
            <span style={{ fontFamily: "var(--font-mono-family)" }}>ε</span>.
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <span className="section-label">Presets</span>
          {PRESETS.map((p, i) => (
            <button
              key={p.name}
              className="tape-row"
              data-verdict={i === index ? "accept" : undefined}
              onClick={() => {
                setIndex(i);
                setConverted(null);
              }}
            >
              <span>{p.name}</span>
              <span style={{ color: "var(--ink-disabled)" }}>Σ={p.alphabet.join(",")}</span>
            </button>
          ))}
        </div>

        <div className="lab-card">
          <div className="mb-2 flex items-center justify-between">
            <span className="section-label">Construction log</span>
            {converted && (
              <span className="badge" data-tone="blue">
                {converted.stateCount} DFA states
              </span>
            )}
          </div>
          {converted ? (
            <>
              <div
                className="flex max-h-48 flex-col gap-1 overflow-y-auto text-[11px]"
                style={{ fontFamily: "var(--font-mono-family)" }}
              >
                {converted.steps.slice(0, logStep + 1).map((s, i) => (
                  <div
                    key={i}
                    style={{ color: i === logStep ? "var(--ink-primary)" : "var(--ink-muted)" }}
                  >
                    {s}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <button className="tool-btn" onClick={() => setLogStep((s) => Math.max(0, s - 1))}>
                  ◀
                </button>
                <button className="tool-btn" onClick={() => setLogStep(converted.steps.length - 1)}>
                  ▶▶
                </button>
                <button
                  className="tool-btn"
                  onClick={() => setLogStep((s) => Math.min(converted.steps.length - 1, s + 1))}
                >
                  ▶|
                </button>
              </div>
            </>
          ) : (
            <p className="text-xs" style={{ color: "var(--ink-disabled)" }}>
              Press “Convert to DFA” to watch ε-closures become single states.
            </p>
          )}
        </div>
      </aside>

      <section className="workbench">
        <div className="canvas-toolbar">
          <span className="badge" data-tone="blue">
            Σ = {"{"}
            {preset.alphabet.join(",")}
            {"}"}
          </span>
          <div className="ml-auto">
            <button className="btn-primary" onClick={convert}>
              Convert to DFA
            </button>
          </div>
        </div>
        <div
          className="dual-canvas grid flex-1 min-h-0 gap-px"
          style={{ gridTemplateColumns: "1fr 1fr", background: "var(--border-subtle)" }}
        >
          <div className="flex min-h-0 flex-col">
            <div className="section-label px-3 py-2">NFA (preset)</div>
            <DFACanvas
              machine={nfaMachine}
              alphabet={[...preset.alphabet, EPS]}
              editable={false}
              allowNondet
              allowEpsilon
              mode="pointer"
            />
          </div>
          <div className="flex min-h-0 flex-col">
            <div className="section-label px-3 py-2">Result DFA</div>
            {dfaMachine ? (
              <DFACanvas
                machine={dfaMachine}
                alphabet={preset.alphabet}
                editable={false}
                mode="pointer"
              />
            ) : (
              <div
                className="canvas-surface flex items-center justify-center text-xs"
                style={{ color: "var(--ink-disabled)" }}
              >
                No result yet
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
