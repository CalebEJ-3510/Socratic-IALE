import { useEffect, useMemo, useState } from "react";
import { DFACanvas, type CanvasMode } from "@/components/DFACanvas";
import { DFA } from "@/lib/engine/dfa";
import { findCounterexample } from "@/lib/engine/algorithms";
import { OP_LABEL, productConstruction, type ProductOp } from "@/lib/engine/product";
import { dfaToMachine, layoutMachine, machineToDFA, useMachine } from "@/lib/machine";
import { MousePointer2, Circle, Spline, Eraser } from "lucide-react";
import { parseAlphabet } from "@/lib/alphabet";

const SEEDS: Record<"A" | "B", DFA> = {
  A: new DFA({
    states: ["a0", "a1"],
    alphabet: ["0", "1"],
    transitions: { a0: { "0": "a1", "1": "a0" }, a1: { "0": "a0", "1": "a1" } },
    startState: "a0",
    acceptStates: ["a0"],
  }),
  B: new DFA({
    states: ["b0", "b1"],
    alphabet: ["0", "1"],
    transitions: { b0: { "0": "b0", "1": "b1" }, b1: { "0": "b1", "1": "b0" } },
    startState: "b0",
    acceptStates: ["b0"],
  }),
};

const OPS: ProductOp[] = ["intersection", "union", "difference", "symmetric"];
const DEFAULT_ALPHABET = ["0", "1"];

interface Props {
  active?: boolean;
  onContext?: (fn: () => string) => void;
}

export function CompareLab({ active, onContext }: Props) {
  const [tool, setTool] = useState<"product" | "equivalence">("product");
  const [op, setOp] = useState<ProductOp>("intersection");
  const [mode, setMode] = useState<CanvasMode>("pointer");
  const [probe, setProbe] = useState("");
  const [checked, setChecked] = useState(false);
  const [alphabet, setAlphabet] = useState<string[]>(DEFAULT_ALPHABET);

  const a = useMachine(layoutMachine(dfaToMachine(SEEDS.A)));
  const b = useMachine(layoutMachine(dfaToMachine(SEEDS.B)));

  const dfaA = useMemo(() => machineToDFA(a.machine, alphabet), [a.machine, alphabet]);
  const dfaB = useMemo(() => machineToDFA(b.machine, alphabet), [b.machine, alphabet]);

  const activeOp: ProductOp = tool === "equivalence" ? "symmetric" : op;
  const product = useMemo(() => productConstruction(dfaA, dfaB, activeOp), [dfaA, dfaB, activeOp]);
  const productMachine = useMemo(() => layoutMachine(dfaToMachine(product.dfa)), [product]);
  const counterexample = useMemo(() => findCounterexample(dfaA, dfaB), [dfaA, dfaB]);
  const samples = useMemo(() => product.dfa.sampleStrings({ maxLen: 6, count: 4 }), [product]);

  useEffect(() => setChecked(false), [dfaA, dfaB]);

  useEffect(() => {
    onContext?.(() =>
      [
        `Module: Compare (${tool === "product" ? `product construction, operation ${OP_LABEL[op]}` : "equivalence checker"}). Both machines are fully PUBLIC — describe them freely.`,
        `Machine A: ${dfaA.states.length} states, accepting [${dfaA.acceptStates.join(",")}].`,
        `Machine B: ${dfaB.states.length} states, accepting [${dfaB.acceptStates.join(",")}].`,
        tool === "product"
          ? `Product graph currently drawn: ${product.dfa.states.length} pair-states, ${product.dfa.acceptStates.length} accepting.`
          : `Student has run the equivalence check: ${checked}.`,
        "Sequencing rule: if the student has NOT run the equivalence check yet, do not state whether the machines agree and do not name the distinguishing string — ask them to predict a string that might separate the two and test it.",
      ].join("\n"),
    );
  }, [onContext, tool, op, dfaA, dfaB, product, checked]);

  const probeVerdict = probe
    ? { a: dfaA.run(probe), b: dfaB.run(probe), p: product.dfa.run(probe) }
    : null;

  const toolbar = (
    <>
      {(
        [
          ["pointer", MousePointer2],
          ["state", Circle],
          ["transition", Spline],
          ["delete", Eraser],
        ] as [CanvasMode, typeof Circle][]
      ).map(([m, Icon]) => (
        <button
          key={m}
          className="tool-btn"
          data-active={mode === m}
          title={m}
          onClick={() => setMode(m)}
        >
          <Icon size={15} />
        </button>
      ))}
    </>
  );

  return (
    <div className="module-container">
      <aside className="module-panel-left" style={{ width: 340, flexShrink: 0 }}>
        <div>
          <span className="badge" data-tone="amber">
            Compare
          </span>
          <h2 className="mt-2 text-lg">
            {tool === "product" ? "Product construction" : "Equivalence checker"}
          </h2>
          <p className="mt-1 text-xs" style={{ color: "var(--ink-muted)" }}>
            Edit machine A and machine B below; both tools run live on whatever you draw.
          </p>
        </div>

        <div className="flex gap-1">
          <button
            className="nav-tab"
            data-active={tool === "product"}
            onClick={() => setTool("product")}
          >
            Product lab
          </button>
          <button
            className="nav-tab"
            data-active={tool === "equivalence"}
            onClick={() => setTool("equivalence")}
          >
            Equivalence
          </button>
        </div>

        {tool === "product" ? (
          <>
            <div className="flex flex-col gap-1">
              <span className="section-label">Operation</span>
              {OPS.map((o) => (
                <button
                  key={o}
                  className="tape-row"
                  data-verdict={o === op ? "accept" : undefined}
                  onClick={() => setOp(o)}
                >
                  <span>{OP_LABEL[o]}</span>
                  <span style={{ color: "var(--ink-disabled)" }}>{o}</span>
                </button>
              ))}
            </div>
            <div className="lab-card">
              <span className="section-label">Pair states</span>
              <div className="mt-1 flex max-h-56 flex-col gap-0.5 overflow-y-auto text-[11px]">
                {product.pairs.map((pair) => (
                  <div key={pair.label} style={{ fontFamily: "var(--font-mono-family)" }}>
                    <span
                      style={{ color: pair.accepting ? "var(--signal-cyan)" : "var(--ink-muted)" }}
                    >
                      ({pair.left}, {pair.right})
                    </span>{" "}
                    <span style={{ color: "var(--ink-disabled)" }}>
                      A:{pair.leftAccepting ? "F" : "·"} B:{pair.rightAccepting ? "F" : "·"} via "
                      {pair.access || "ε"}"
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="lab-card">
              <span className="section-label">Sample strings in {OP_LABEL[op]}</span>
              <p className="mt-1 text-[11px]" style={{ fontFamily: "var(--font-mono-family)" }}>
                accept: {samples.accepted.map((s) => `"${s || "ε"}"`).join(", ") || "none found"}
              </p>
              <p className="mt-1 text-[11px]" style={{ fontFamily: "var(--font-mono-family)" }}>
                reject: {samples.rejected.map((s) => `"${s || "ε"}"`).join(", ") || "none found"}
              </p>
            </div>
          </>
        ) : (
          <div className="lab-card">
            <span className="section-label">Are A and B the same language?</span>
            <button className="btn-primary mt-2" onClick={() => setChecked(true)}>
              Run equivalence check
            </button>
            {checked && (
              <div className="mt-2 text-xs">
                {counterexample ? (
                  <>
                    <span className="badge" data-tone="rose">
                      not equivalent
                    </span>
                    <p className="mt-2">
                      Shortest distinguishing string: <code>{counterexample.string || "ε"}</code> —
                      A {counterexample.expected}s it, B {counterexample.got}s it.
                    </p>
                    <button
                      className="btn-ghost mt-2"
                      onClick={() => setProbe(counterexample.string)}
                    >
                      Load it into the probe
                    </button>
                  </>
                ) : (
                  <>
                    <span className="badge" data-tone="cyan">
                      equivalent
                    </span>
                    <p className="mt-2">
                      Every reachable pair in A △ B is non-accepting, so no string separates them.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <div className="lab-card">
          <span className="section-label">String probe</span>
          <input
            className="field-input mt-1 w-full"
            value={probe}
            placeholder="e.g. 0110"
            onChange={(e) => setProbe(e.target.value)}
          />
          {probeVerdict && (
            <div className="mt-2 flex flex-wrap gap-1">
              <span className="badge" data-tone={probeVerdict.a ? "cyan" : "rose"}>
                A {probeVerdict.a ? "accepts" : "rejects"}
              </span>
              <span className="badge" data-tone={probeVerdict.b ? "cyan" : "rose"}>
                B {probeVerdict.b ? "accepts" : "rejects"}
              </span>
              {tool === "product" && (
                <span className="badge" data-tone={probeVerdict.p ? "cyan" : "rose"}>
                  {OP_LABEL[op]} {probeVerdict.p ? "accepts" : "rejects"}
                </span>
              )}
            </div>
          )}
        </div>
      </aside>

      <section className="workbench">
        <div className="canvas-toolbar">
          {toolbar}
          <label
            className="ml-auto flex items-center gap-1 text-[11px]"
            style={{ fontFamily: "var(--font-mono-family)", color: "var(--ink-muted)" }}
            title="Alphabet — any symbols, comma separated"
          >
            Σ =
            <input
              className="field-input"
              style={{ width: 96, padding: "2px 6px", fontSize: 11 }}
              aria-label="Alphabet symbols"
              value={alphabet.join(",")}
              onChange={(e) => {
                const next = parseAlphabet(e.target.value);
                setAlphabet(next.length ? next : DEFAULT_ALPHABET);
              }}
            />
          </label>
        </div>
        <div
          className="dual-canvas grid min-h-0 flex-1 gap-px"
          style={{ gridTemplateColumns: "1fr 1fr", background: "var(--border-subtle)" }}
        >
          <div className="flex min-h-0 flex-col">
            <div className="section-label px-3 py-2">Machine A</div>
            <DFACanvas
              machine={a.machine}
              onChange={a.commit}
              onTransientChange={a.set}
              editable={active !== false}
              alphabet={alphabet}
              mode={mode}
              exportName="machine-a"
            />
          </div>
          <div className="flex min-h-0 flex-col">
            <div className="section-label px-3 py-2">Machine B</div>
            <DFACanvas
              machine={b.machine}
              onChange={b.commit}
              onTransientChange={b.set}
              editable={active !== false}
              alphabet={alphabet}
              mode={mode}
              exportName="machine-b"
            />
          </div>
          <div className="col-span-2 flex min-h-0 flex-col">
            <div className="section-label px-3 py-2">
              {tool === "product" ? OP_LABEL[op] : "A △ B (equivalence witness graph)"}
            </div>
            {tool === "product" || checked ? (
              <DFACanvas
                machine={productMachine}
                alphabet={alphabet}
                editable={false}
                mode="pointer"
                exportName="product"
              />
            ) : (
              <div
                className="canvas-surface flex items-center justify-center px-6 text-center text-xs"
                style={{ color: "var(--ink-disabled)" }}
              >
                Predict a string that might separate A and B, then run the check to see the witness
                graph.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
