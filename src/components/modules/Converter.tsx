import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Copy, Wand2 } from "lucide-react";
import { DFACanvas, type CanvasMode } from "@/components/DFACanvas";
import { CanvasToolbar } from "@/components/CanvasToolbar";
import { DFA } from "@/lib/engine/dfa";
import { EPS, NFA } from "@/lib/engine/nfa";
import { regexToNFA, validateRegex } from "@/lib/engine/regex";
import {
  REPS,
  liftToNfa,
  machineToNFA,
  nfaToMachine,
  nfaToRegex,
  removeEpsilons,
  toDfa,
  verifyRegexAgainstDfa,
  type GNFAStep,
  type RepId,
} from "@/lib/engine/convert";
import {
  dfaToMachine,
  layoutMachine,
  machineToDFA,
  starterMachine,
  type Machine,
} from "@/lib/machine";
import { Storage } from "@/lib/storage";
import { onTutorAction } from "@/lib/tutor/actions";
import { buildConverterContext } from "@/lib/tutor/context";

const SAVE_ID = "converter-source";

type Result =
  | {
      kind: "machine";
      machine: Machine;
      alphabet: string[];
      steps: string[];
      identity: boolean;
      note: string;
    }
  | {
      kind: "regex";
      regex: string | null;
      steps: string[];
      gnfa: GNFAStep[];
      verified: { equivalent: boolean; counterexample: { string: string } | null; error?: string };
    };

export function Converter({
  active,
  onContext,
}: {
  active: boolean;
  onContext?: (fn: () => string) => void;
}) {
  const [source, setSource] = useState<RepId>("dfa");
  const [target, setTarget] = useState<RepId>("regex");
  const [machine, setMachine] = useState<Machine>(() => starterMachine());
  const [regexInput, setRegexInput] = useState("(0|1)*1");
  const [alphabetText, setAlphabetText] = useState("0,1");
  const [mode, setMode] = useState<CanvasMode>("pointer");
  const [result, setResult] = useState<Result | null>(null);
  const [logStep, setLogStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isolate, setIsolate] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<string[]>([]);
  const [highlights, setHighlights] = useState<Record<string, "blue" | "cyan" | "rose" | "amber">>(
    {},
  );

  const alphabet = useMemo(
    () => [...new Set(alphabetText.split(/[,\s]+/).filter(Boolean))],
    [alphabetText],
  );
  const allowEpsilon = source === "enfa";
  const allowNondet = source !== "dfa";
  const regexCheck = useMemo(() => validateRegex(regexInput, alphabet), [regexInput, alphabet]);

  /* ── persistence through the shared Storage layer ── */
  useEffect(() => {
    const saved = Storage.loadDFA(SAVE_ID).data;
    if (saved?.dfa?.states?.length)
      setMachine(dfaToMachine(DFA.fromJSON(saved.dfa), saved.positions));
  }, []);

  useEffect(() => {
    if (!machine.states.length) return;
    Storage.saveDFA(
      SAVE_ID,
      machineToDFA(machine, alphabet).toJSON(),
      Object.fromEntries(machine.states.map((s) => [s.label, { x: s.x, y: s.y }])),
    );
  }, [machine, alphabet]);

  const sourceNfa = useCallback((): NFA | null => {
    if (source === "regex") {
      if (!regexCheck.valid) return null;
      return regexToNFA(regexInput, alphabet);
    }
    if (source === "dfa") return liftToNfa(machineToDFA(machine, alphabet));
    return machineToNFA(machine, alphabet);
  }, [source, regexInput, regexCheck.valid, alphabet, machine]);

  const convert = useCallback(() => {
    setError(null);
    setLogStep(0);
    const nfa = sourceNfa();
    if (!nfa) {
      setError(regexCheck.error ?? "Nothing to convert yet.");
      return;
    }
    if (target === "regex") {
      const { regex, steps } = nfaToRegex(nfa);
      const verified = regex
        ? verifyRegexAgainstDfa(regex, toDfa(nfa))
        : {
            equivalent: true,
            counterexample: null,
            error: "Empty language — no regex exists (∅).",
          };
      setResult({
        kind: "regex",
        regex,
        gnfa: steps,
        steps: steps.map((s) => `eliminate ${s.eliminated}: ${s.note}`),
        verified,
      });
      return;
    }
    if (target === "dfa") {
      const { dfa, steps } = nfa.toDFA();
      setResult({
        kind: "machine",
        machine: layoutMachine(dfaToMachine(dfa)),
        alphabet,
        steps,
        identity: false,
        note: "Subset construction: each DFA state is a set of NFA states.",
      });
      return;
    }
    if (target === "nfa") {
      const { nfa: out, steps } = removeEpsilons(nfa);
      const identity = source === "dfa" || source === "nfa";
      setResult({
        kind: "machine",
        machine: nfaToMachine(out),
        alphabet,
        steps: identity ? [] : steps,
        identity,
        note:
          source === "dfa"
            ? "A DFA already satisfies the NFA definition — this is a reinterpretation, not a computation."
            : source === "nfa"
              ? "Already an NFA with no ε-edges — identity."
              : "ε-edges removed; nondeterminism kept (no determinisation).",
      });
      return;
    }
    // target = ε-NFA
    setResult({
      kind: "machine",
      machine: nfaToMachine(nfa),
      alphabet: [...alphabet, EPS],
      steps: [],
      identity: source !== "regex",
      note:
        source === "regex"
          ? "Thompson's construction — its output genuinely contains ε-edges."
          : "An automaton with zero ε-edges is already a valid ε-NFA — identity, no fake ε-edges added.",
    });
  }, [sourceNfa, target, source, alphabet, regexCheck.error]);

  /* ── tutor context (PUBLIC tier: nothing hidden here) ── */
  useEffect(() => {
    onContext?.(() =>
      buildConverterContext({
        source,
        target,
        machine,
        alphabet,
        regex: source === "regex" ? regexInput : null,
        hasResult: !!result,
        totalSteps: result?.steps.length ?? 0,
        revealedThroughStep: result?.steps.length ? logStep : -1,
        finalVisible: !!result && (result.steps.length === 0 || logStep >= result.steps.length - 1),
      }),
    );
  }, [onContext, source, target, machine, alphabet, regexInput, result, logStep]);

  /* Tell the guard how far the derivation has been revealed. */
  useEffect(() => {
    const finalVisible =
      !!result && (result.steps.length === 0 || logStep >= result.steps.length - 1);
    window.dispatchEvent(
      new CustomEvent("iale-reveal-state", { detail: { moduleId: "converter", finalVisible } }),
    );
  }, [result, logStep]);

  /* ── tutor canvas-control vocabulary ── */
  useEffect(() => {
    const offs = [
      onTutorAction("isolateSymbol", (a) => setIsolate(a.symbol)),
      onTutorAction("annotateState", (a) => setAnnotations((s) => [...new Set([...s, a.state])])),
      onTutorAction("simplifyLayout", () => setMachine((m) => layoutMachine(m))),
      onTutorAction("highlight", (a) => setHighlights((h) => ({ ...h, [a.state]: a.color }))),
      onTutorAction("animateElimination", (a) =>
        setHighlights((h) => ({ ...h, [a.state]: "rose" })),
      ),
      onTutorAction("zoomTo", (a) => setHighlights((h) => ({ ...h, [a.state]: "cyan" }))),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  if (!active) return null;

  const targets = REPS.filter((r) => r.id !== source);
  const sameNote = REPS.find((r) => r.id === target && r.id === source);

  return (
    <div className="module-container">
      <aside className="module-panel-left" style={{ width: 340, flexShrink: 0 }}>
        <div>
          <span className="badge" data-tone="blue">
            Converter
          </span>
          <h2 className="mt-2 text-lg">Universal conversion lab</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--ink-muted)" }}>
            Any representation to any other: DFA, NFA, ε-NFA and regular expressions. Every regex
            result is proved correct by counterexample search.
          </p>
        </div>

        <div className="lab-card">
          <span className="section-label">From</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {REPS.map((r) => (
              <button
                key={r.id}
                className="nav-tab"
                data-active={source === r.id}
                onClick={() => {
                  setSource(r.id);
                  setResult(null);
                  if (target === r.id) setTarget(r.id === "regex" ? "dfa" : "regex");
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
          <span className="section-label mt-3 block">To</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {targets.map((r) => (
              <button
                key={r.id}
                className="nav-tab"
                data-active={target === r.id}
                onClick={() => {
                  setTarget(r.id);
                  setResult(null);
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
          <label className="section-label mt-3 block">Alphabet</label>
          <input
            className="field-input"
            value={alphabetText}
            onChange={(e) => setAlphabetText(e.target.value)}
          />
          <button className="btn-primary mt-3 w-full" onClick={convert} disabled={!!sameNote}>
            <span className="inline-flex items-center justify-center gap-1.5">
              <ArrowRightLeft size={14} /> Convert
            </span>
          </button>
          {error && (
            <p className="mt-2 text-[11.5px]" style={{ color: "var(--signal-rose)" }}>
              {error}
            </p>
          )}
        </div>

        <div className="lab-card">
          <div className="mb-2 flex items-center justify-between">
            <span className="section-label">Derivation log</span>
            {result && result.kind === "machine" && !result.identity && (
              <span className="badge" data-tone="blue">
                {result.steps.length} steps
              </span>
            )}
          </div>
          {result && result.steps.length ? (
            <>
              <div
                className="flex max-h-56 flex-col gap-1 overflow-y-auto text-[11px]"
                style={{ fontFamily: "var(--font-mono-family)" }}
              >
                {result.steps.slice(0, logStep + 1).map((s, i) => (
                  <div
                    key={i}
                    style={{ color: i === logStep ? "var(--ink-primary)" : "var(--ink-muted)" }}
                  >
                    {s}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  className="tool-btn"
                  title="Back"
                  onClick={() => setLogStep((s) => Math.max(0, s - 1))}
                >
                  ◀
                </button>
                <button
                  className="tool-btn"
                  title="Play to end"
                  onClick={() => setLogStep(result.steps.length - 1)}
                >
                  ▶▶
                </button>
                <button
                  className="tool-btn"
                  title="Next step"
                  onClick={() => setLogStep((s) => Math.min(result.steps.length - 1, s + 1))}
                >
                  ▶|
                </button>
              </div>
            </>
          ) : (
            <p className="text-xs" style={{ color: "var(--ink-disabled)" }}>
              {result && result.kind === "machine" && result.identity
                ? result.note
                : "Run a conversion to step through subset construction, ε-removal or state elimination."}
            </p>
          )}
        </div>
      </aside>

      <section className="workbench">
        <div className="canvas-toolbar">
          <span className="badge" data-tone="blue">
            {REPS.find((r) => r.id === source)?.label} → {REPS.find((r) => r.id === target)?.label}
          </span>
          {isolate && (
            <button
              className="tool-btn"
              title="Clear symbol isolation"
              onClick={() => setIsolate(null)}
            >
              showing only “{isolate}” ✕
            </button>
          )}
          {annotations.length > 0 && (
            <button
              className="tool-btn"
              title="Clear tutor markers"
              onClick={() => setAnnotations([])}
            >
              clear ? markers
            </button>
          )}
          {source !== "regex" && (
            <div className="ml-auto">
              <CanvasToolbar
                mode={mode}
                setMode={setMode}
                onLayout={() => setMachine((m) => layoutMachine(m))}
                onClear={() => setMachine({ states: [], transitions: [] })}
              />
            </div>
          )}
        </div>

        <div
          className="dual-canvas grid flex-1 min-h-0 gap-px"
          style={{ gridTemplateColumns: "1fr 1fr", background: "var(--border-subtle)" }}
        >
          <div className="flex min-h-0 flex-col">
            <div className="section-label px-3 py-2">
              Source — {REPS.find((r) => r.id === source)?.label}
            </div>
            {source === "regex" ? (
              <div className="canvas-surface flex flex-col gap-2 p-4">
                <label className="section-label">Regular expression</label>
                <input
                  className="field-input"
                  style={{ fontFamily: "var(--font-mono-family)" }}
                  value={regexInput}
                  onChange={(e) => setRegexInput(e.target.value)}
                />
                <p
                  className="text-[11.5px]"
                  style={{ color: regexCheck.valid ? "var(--signal-cyan)" : "var(--signal-rose)" }}
                >
                  {regexCheck.valid ? "✓ parses over Σ" : regexCheck.error}
                </p>
              </div>
            ) : (
              <DFACanvas
                machine={machine}
                onChange={setMachine}
                alphabet={alphabet}
                allowNondet={allowNondet}
                allowEpsilon={allowEpsilon}
                mode={mode}
                highlights={highlights}
                isolateSymbol={isolate}
                annotations={annotations}
                exportName="converter-source"
              />
            )}
          </div>

          <div className="flex min-h-0 flex-col">
            <div className="section-label px-3 py-2">
              Result — {REPS.find((r) => r.id === target)?.label}
            </div>
            {result?.kind === "machine" ? (
              <DFACanvas
                machine={result.machine}
                alphabet={result.alphabet}
                editable={false}
                allowNondet
                allowEpsilon
                mode="pointer"
                exportName="converter-result"
              />
            ) : result?.kind === "regex" ? (
              <div className="canvas-surface flex flex-col gap-3 p-4">
                <span className="section-label">Regular expression</span>
                <div
                  className="rounded-xl border p-3 text-sm"
                  style={{
                    fontFamily: "var(--font-mono-family)",
                    borderColor: "var(--border-strong)",
                    background: "var(--bg-panel-raised)",
                    wordBreak: "break-all",
                  }}
                >
                  {result.regex ?? "∅ (empty language)"}
                </div>
                <div className="flex gap-2">
                  <button
                    className="tool-btn"
                    title="Copy regex"
                    onClick={() => result.regex && void navigator.clipboard.writeText(result.regex)}
                  >
                    <Copy size={14} />
                  </button>
                  <span
                    className="badge"
                    data-tone={result.verified.equivalent ? "accept" : "reject"}
                  >
                    {result.verified.equivalent
                      ? "✓ equivalent — tested via counterexample search"
                      : `these differ on "${result.verified.counterexample?.string || "ε"}"`}
                  </span>
                </div>
                <p className="text-[11.5px]" style={{ color: "var(--ink-muted)" }}>
                  <Wand2 size={11} className="inline" /> Elimination order (lowest degree first) is
                  what determines how messy the raw result looks — the cleanup pass is cosmetic
                  only.
                </p>
              </div>
            ) : (
              <div
                className="canvas-surface flex items-center justify-center p-6 text-center text-xs"
                style={{ color: "var(--ink-disabled)" }}
              >
                {sameNote
                  ? `Already a ${sameNote.label} — nothing to convert.`
                  : "No result yet — press Convert."}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
