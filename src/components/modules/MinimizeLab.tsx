import { useEffect, useMemo, useState } from "react";
import { DFACanvas, type CanvasMode, type HighlightTone } from "@/components/DFACanvas";
import { DFA } from "@/lib/engine/dfa";
import { minimize } from "@/lib/engine/algorithms";
import { accessString, myhillNerodeTable, refinementRounds, cellKey } from "@/lib/engine/minimize";
import { dfaToMachine, layoutMachine, machineToDFA, useMachine, type Machine } from "@/lib/machine";
import { MousePointer2, Circle, Spline, Eraser, Undo2, Redo2 } from "lucide-react";
import { parseAlphabet } from "@/lib/alphabet";

interface Preset {
  name: string;
  hint: string;
  alphabet: string[];
  dfa: DFA;
}

const PRESETS: Preset[] = [
  {
    name: "Ends with 1 (bloated)",
    hint: "Four states, but two of them behave identically.",
    alphabet: ["0", "1"],
    dfa: new DFA({
      states: ["q0", "q1", "q2", "q3"],
      alphabet: ["0", "1"],
      transitions: {
        q0: { "0": "q2", "1": "q1" },
        q1: { "0": "q3", "1": "q1" },
        q2: { "0": "q2", "1": "q1" },
        q3: { "0": "q2", "1": "q1" },
      },
      startState: "q0",
      acceptStates: ["q1"],
    }),
  },
  {
    name: "Even number of 0s (bloated)",
    hint: "Parity needs two states; this one uses five.",
    alphabet: ["0", "1"],
    dfa: new DFA({
      states: ["a", "b", "c", "d", "e"],
      alphabet: ["0", "1"],
      transitions: {
        a: { "0": "b", "1": "c" },
        b: { "0": "c", "1": "d" },
        c: { "0": "a", "1": "e" },
        d: { "0": "e", "1": "b" },
        e: { "0": "d", "1": "c" },
      },
      startState: "a",
      acceptStates: ["a", "c", "e"],
    }),
  },
  {
    name: "Contains 01",
    hint: "Already minimal — prove it with the table.",
    alphabet: ["0", "1"],
    dfa: new DFA({
      states: ["s0", "s1", "s2"],
      alphabet: ["0", "1"],
      transitions: {
        s0: { "0": "s1", "1": "s0" },
        s1: { "0": "s1", "1": "s2" },
        s2: { "0": "s2", "1": "s2" },
      },
      startState: "s0",
      acceptStates: ["s2"],
    }),
  },
];

const TONES: HighlightTone[] = ["blue", "cyan", "amber", "rose"];

interface Props {
  active?: boolean;
  onContext?: (fn: () => string) => void;
}

export function MinimizeLab({ active, onContext }: Props) {
  const [presetIndex, setPresetIndex] = useState(0);
  const preset = PRESETS[presetIndex]!;
  const { machine, commit, set, replace, undo, redo, canUndo, canRedo } = useMachine(
    layoutMachine(dfaToMachine(preset.dfa)),
  );
  const [mode, setMode] = useState<CanvasMode>("pointer");
  const [round, setRound] = useState(0);
  const [showTable, setShowTable] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [selectedPair, setSelectedPair] = useState<{ a: string; b: string } | null>(null);
  const [alphaOverride, setAlphaOverride] = useState<string[] | null>(null);
  const alphabet = alphaOverride ?? preset.alphabet;

  const loadPreset = (i: number) => {
    setPresetIndex(i);
    setAlphaOverride(null);
    replace(layoutMachine(dfaToMachine(PRESETS[i]!.dfa)));
    setRound(0);
    setShowTable(false);
    setShowResult(false);
    setSelectedPair(null);
  };

  const dfa = useMemo(() => machineToDFA(machine, alphabet), [machine, alphabet]);
  const { rounds } = useMemo(() => refinementRounds(dfa), [dfa]);
  const table = useMemo(() => myhillNerodeTable(dfa), [dfa]);
  const minimal = useMemo(() => minimize(dfa), [dfa]);
  const minimalMachine: Machine = useMemo(() => layoutMachine(dfaToMachine(minimal)), [minimal]);

  const currentRound = rounds[Math.min(round, Math.max(0, rounds.length - 1))];
  const highlights = useMemo(() => {
    const out: Record<string, HighlightTone> = {};
    currentRound?.groups.forEach((g, i) => {
      g.forEach((s) => {
        out[s] = TONES[i % TONES.length]!;
      });
    });
    return out;
  }, [currentRound]);

  const savings = dfa.reachableStates().size - minimal.states.length;

  useEffect(() => {
    onContext?.(() =>
      [
        "Module: Minimizer (Myhill–Nerode). The student's machine and every revealed refinement round are fully PUBLIC — discuss them freely.",
        `Machine: ${dfa.states.length} states, alphabet {${alphabet.join(",")}}.`,
        `Refinement rounds available: ${rounds.length}. Revealed through round ${round}.`,
        `Partition shown now: ${(currentRound?.groups ?? []).map((g) => `{${g.join(",")}}`).join(" ")}`,
        `Distinguishability table opened: ${showTable}. Minimal result revealed: ${showResult}.`,
        "Sequencing rule: never state the outcome of a refinement round the student has not revealed yet, and never name the minimal state count before they reveal the result — ask them to find a distinguishing suffix themselves first.",
      ].join("\n"),
    );
  }, [onContext, dfa, alphabet, rounds.length, round, currentRound, showTable, showResult]);

  const pairCell = selectedPair ? table.cells.get(cellKey(selectedPair.a, selectedPair.b)) : null;

  return (
    <div className="module-container">
      <aside className="module-panel-left" style={{ width: 360, flexShrink: 0 }}>
        <div>
          <span className="badge" data-tone="cyan">
            Minimizer
          </span>
          <h2 className="mt-2 text-lg">Partition refinement</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--ink-muted)" }}>
            {preset.hint} Colours on the canvas are the current equivalence blocks.
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <span className="section-label">Presets</span>
          {PRESETS.map((p, i) => (
            <button
              key={p.name}
              className="tape-row"
              data-verdict={i === presetIndex ? "accept" : undefined}
              onClick={() => loadPreset(i)}
            >
              <span>{p.name}</span>
            </button>
          ))}
        </div>

        <div className="lab-card">
          <div className="mb-2 flex items-center justify-between">
            <span className="section-label">Refinement rounds</span>
            <span className="badge" data-tone="blue">
              round {currentRound?.round ?? 0} / {Math.max(0, rounds.length - 1)}
            </span>
          </div>
          <div className="flex flex-col gap-1 text-[11px]">
            {rounds.slice(0, round + 1).map((r) => (
              <div
                key={r.round}
                style={{ color: r.round === round ? "var(--ink-primary)" : "var(--ink-muted)" }}
              >
                <span style={{ fontFamily: "var(--font-mono-family)" }}>
                  {r.groups.map((g) => `{${g.join(",")}}`).join(" ")}
                </span>
                {r.note && <div className="mt-0.5">{r.note}</div>}
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <button className="tool-btn" onClick={() => setRound((r) => Math.max(0, r - 1))}>
              ◀
            </button>
            <button
              className="tool-btn"
              onClick={() => setRound((r) => Math.min(rounds.length - 1, r + 1))}
            >
              ▶|
            </button>
            <button className="tool-btn" onClick={() => setRound(Math.max(0, rounds.length - 1))}>
              ▶▶
            </button>
            <button className="btn-ghost ml-auto" onClick={() => setShowTable((v) => !v)}>
              {showTable ? "Hide table" : "Myhill–Nerode table"}
            </button>
          </div>
        </div>

        {showTable && (
          <div className="lab-card">
            <span className="section-label">Distinguishability table</span>
            <p className="mt-1 text-[11px]" style={{ color: "var(--ink-muted)" }}>
              Click a cell to see the suffix that separates the pair.
            </p>
            <div className="mt-2 overflow-auto">
              <table className="text-[10px]" style={{ borderCollapse: "collapse" }}>
                <tbody>
                  {table.states.slice(1).map((rowState) => (
                    <tr key={rowState}>
                      <th
                        className="pr-1 text-right"
                        style={{ color: "var(--ink-muted)", fontWeight: 500 }}
                      >
                        {rowState}
                      </th>
                      {table.states.slice(0, -1).map((colState) => {
                        const ri = table.states.indexOf(rowState);
                        const ci = table.states.indexOf(colState);
                        if (ci >= ri) return <td key={colState} />;
                        const cell = table.cells.get(cellKey(rowState, colState));
                        const marked = cell?.distinguishable;
                        return (
                          <td key={colState} style={{ padding: 1 }}>
                            <button
                              onClick={() => setSelectedPair({ a: rowState, b: colState })}
                              style={{
                                width: 26,
                                height: 22,
                                border: "1px solid var(--border-subtle)",
                                background: marked
                                  ? "color-mix(in oklab, var(--signal-rose) 22%, transparent)"
                                  : "color-mix(in oklab, var(--signal-cyan) 18%, transparent)",
                                color: "var(--ink-primary)",
                                fontFamily: "var(--font-mono-family)",
                              }}
                            >
                              {marked ? cell!.round : "≡"}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr>
                    <th />
                    {table.states.slice(0, -1).map((s) => (
                      <th
                        key={s}
                        className="text-center"
                        style={{ color: "var(--ink-muted)", fontWeight: 500 }}
                      >
                        {s}
                      </th>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            {pairCell && (
              <p className="mt-2 text-[11px]">
                {pairCell.distinguishable ? (
                  <>
                    <strong>{pairCell.a}</strong> ≁ <strong>{pairCell.b}</strong>: reading{" "}
                    <code>{pairCell.witness || "ε"}</code> from one accepts and from the other
                    rejects (marked in round {pairCell.round}).
                  </>
                ) : (
                  <>
                    <strong>{pairCell.a}</strong> ≡ <strong>{pairCell.b}</strong>: no suffix tells
                    them apart, so they collapse into one Myhill–Nerode class.
                  </>
                )}
              </p>
            )}
          </div>
        )}

        <div className="lab-card">
          <span className="section-label">Myhill–Nerode classes</span>
          <div className="mt-1 flex flex-col gap-1 text-[11px]">
            {table.classes.map((cls, i) => (
              <div key={i} style={{ fontFamily: "var(--font-mono-family)" }}>
                <span style={{ color: `var(--signal-${TONES[i % TONES.length]})` }}>●</span> [
                {accessString(table.dfa, cls[0] ?? "") || "ε"}] = {"{"}
                {cls.join(", ")}
                {"}"}
              </div>
            ))}
          </div>
          <button className="btn-primary mt-2" onClick={() => setShowResult(true)}>
            Reveal minimal DFA
          </button>
          {showResult && (
            <p className="mt-2 text-[11px]" style={{ color: "var(--ink-muted)" }}>
              {savings > 0
                ? `${savings} state(s) removed — ${minimal.states.length} classes remain.`
                : "Already minimal: every pair has a distinguishing suffix."}
            </p>
          )}
        </div>
      </aside>

      <section className="workbench">
        <div className="canvas-toolbar">
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
          <button className="tool-btn" disabled={!canUndo} onClick={undo} title="Undo">
            <Undo2 size={15} />
          </button>
          <button className="tool-btn" disabled={!canRedo} onClick={redo} title="Redo">
            <Redo2 size={15} />
          </button>
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
                setAlphaOverride(next.length ? next : null);
              }}
            />
          </label>
        </div>
        <div
          className="dual-canvas grid min-h-0 flex-1 gap-px"
          style={{ gridTemplateColumns: "1fr 1fr", background: "var(--border-subtle)" }}
        >
          <div className="flex min-h-0 flex-col">
            <div className="section-label px-3 py-2">Your machine (blocks coloured)</div>
            <DFACanvas
              machine={machine}
              onChange={commit}
              onTransientChange={set}
              editable={active !== false}
              alphabet={alphabet}
              mode={mode}
              highlights={highlights}
              exportName="minimizer"
            />
          </div>
          <div className="flex min-h-0 flex-col">
            <div className="section-label px-3 py-2">Minimal DFA</div>
            {showResult ? (
              <DFACanvas
                machine={minimalMachine}
                alphabet={alphabet}
                editable={false}
                mode="pointer"
                exportName="minimal"
              />
            ) : (
              <div
                className="canvas-surface flex items-center justify-center px-6 text-center text-xs"
                style={{ color: "var(--ink-disabled)" }}
              >
                Step the refinement through to the end, then reveal the collapsed machine.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
