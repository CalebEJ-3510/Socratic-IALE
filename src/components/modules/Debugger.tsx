import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { DFACanvas, type CanvasMode, type HighlightTone } from "@/components/DFACanvas";
import { useCanvasAttention } from "@/lib/tutor/useCanvasAttention";
import { CanvasToolbar } from "@/components/CanvasToolbar";
import { ChallengePicker } from "@/components/ChallengePicker";
import { FIXED_CHALLENGES, type Challenge } from "@/lib/engine/challenges";
import {
  findCounterexample,
  getTraceHint,
  type Counterexample,
  type TraceHint,
} from "@/lib/engine/algorithms";
import { validateDFA } from "@/lib/engine/validate";
import { Storage } from "@/lib/storage";
import {
  dfaToMachine,
  layoutMachine,
  machineToDFA,
  starterMachine,
  useMachine,
} from "@/lib/machine";
import { useCanvasShortcuts } from "@/lib/useCanvasShortcuts";
import { buildDebuggerContext } from "@/lib/tutor/context";
import type { TutorAction } from "@/lib/tutor/actions";
import { reviewCard } from "@/lib/engine/spaced";

export function Debugger({
  active,
  onContext,
}: {
  active: boolean;
  onContext: (ctx: () => string) => void;
}) {
  const [challenge, setChallenge] = useState<Challenge>(FIXED_CHALLENGES[2]!);
  /** Misconception category this challenge was loaded to drill, if any. */
  const drillCategory = useRef<string | null>(null);
  const [mode, setMode] = useState<CanvasMode>("pointer");
  const [ce, setCe] = useState<Counterexample | null>(null);
  const [hint, setHint] = useState<TraceHint | null>(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [highlights, setHighlights] = useState<Record<string, HighlightTone>>({});
  const [result, setResult] = useState<{
    tone: "accept" | "reject";
    title: string;
    body: string;
  } | null>(null);
  const { machine, commit, set, replace, undo, redo, canUndo, canRedo } =
    useMachine(starterMachine());
  const attention = useCanvasAttention(active, () => commit((m) => layoutMachine(m)));

  const alphabet = challenge.alphabet;
  const dfa = useMemo(() => machineToDFA(machine, alphabet), [machine, alphabet]);
  const errors = useMemo(() => validateDFA(dfa), [dfa]);
  const trace = useMemo(() => (ce ? dfa.runWithTrace(ce.string) : null), [ce, dfa]);

  useCanvasShortcuts(active, setMode, { undo, redo });

  const load = useCallback(
    (ch: Challenge) => {
      setChallenge(ch);
      setCe(null);
      setHint(null);
      setHintLevel(0);
      setStep(0);
      setResult(null);
      setHighlights({});
      replace(starterMachine());
    },
    [replace],
  );

  useEffect(() => {
    onContext(() =>
      buildDebuggerContext({
        challengeName: challenge.name,
        reference: challenge.dfa,
        machine,
        alphabet,
        canvasErrors: errors,
        lastCounterexample: ce,
        hintLevelRevealed: hintLevel,
        description: challenge.description,
        difficulty: challenge.difficulty,
      }),
    );
  }, [onContext, challenge, machine, alphabet, errors, ce, hintLevel]);

  const debugDFA = () => {
    if (errors.length) {
      setResult({ tone: "reject", title: "Not a complete DFA yet", body: errors.join(" ") });
      return;
    }
    Storage.recordAttempt("debugger", challenge.id);
    const found = findCounterexample(challenge.dfa, dfa);
    if (!found) {
      setCe(null);
      setHint(null);
      Storage.recordSolve("debugger", challenge.id, 1);
      if (drillCategory.current) {
        reviewCard(drillCategory.current);
        drillCategory.current = null;
      }
      setResult({
        tone: "accept",
        title: "No counterexample exists",
        body: `Your machine decides "${challenge.name}" exactly. `,
      });
      toast.success("Machines are equivalent 🎉");
      return;
    }
    setCe(found);
    setHintLevel(0);
    setStep(0);
    setHint(getTraceHint(challenge.dfa, dfa, found.string));
    Storage.appendMistake(
      dfa.isComplete() ? "accept" : "crash",
      challenge.id,
      `ce ${found.string || "ε"}`,
    );
    setResult({
      tone: "reject",
      title: `Counterexample "${found.string || "ε"}"`,
      body: `Expected ${found.expected.toUpperCase()} · yours ${found.got.toUpperCase()}. Step the tape below to see where your run goes.`,
    });
  };

  const showHint = (level: number) => {
    if (!hint) {
      toast("Press “Debug my DFA” first so I have something concrete to point at.");
      return;
    }
    setHintLevel((l) => Math.max(l, level));
    Storage.appendMistake("hint", challenge.id, `level ${level}`);
    if (level === 3 && hint.divergeState) {
      setHighlights({ [hint.divergeState]: "amber" });
      window.setTimeout(() => setHighlights({}), 5000);
    }
  };

  useEffect(() => {
    if (!playing || !trace) return;
    const id = window.setTimeout(() => {
      setStep((s) => {
        if (s >= trace.trace.length - 1) {
          setPlaying(false);
          return s;
        }
        return s + 1;
      });
    }, 650);
    return () => window.clearTimeout(id);
  }, [playing, step, trace]);

  useEffect(() => {
    if (!trace) return;
    const state = trace.trace[Math.min(step, trace.trace.length - 1)]?.state;
    if (!state) return;
    const atEnd = step >= trace.trace.length - 1;
    setHighlights({ [state]: atEnd ? (trace.accepted ? "cyan" : "rose") : "blue" });
  }, [step, trace]);

  useEffect(() => {
    const handler = (e: Event) => {
      if (!active) return;
      const action = (e as CustomEvent<TutorAction>).detail;
      if (action.type === "highlight") {
        setHighlights({ [action.state]: action.color });
        window.setTimeout(() => setHighlights({}), 3000);
      }
      if (action.type === "hintLevel") showHint(action.level);
      if (action.type === "test" || action.type === "animate") {
        const r = dfa.runWithTrace(action.value);
        toast(`"${action.value || "ε"}" → your machine ${r.accepted ? "accepts" : "rejects"}`);
      }
    };
    // A recommendation card in the tutor chat asks the Debugger to open a drill.
    const onLoad = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string; category?: string }>).detail;
      const ch = FIXED_CHALLENGES.find((c) => c.id === detail?.id);
      if (ch) {
        drillCategory.current = detail?.category ?? null;
        load(ch);
        toast(`Loaded drill: ${ch.name}`);
      }
    };
    window.addEventListener("iale-tutor-action", handler);
    window.addEventListener("iale-load-challenge", onLoad);
    return () => {
      window.removeEventListener("iale-tutor-action", handler);
      window.removeEventListener("iale-load-challenge", onLoad);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, dfa, hint, load]);

  const hintTexts = hint ? [hint.level1, hint.level2, hint.level3] : [];

  return (
    <div className="module-container">
      <aside className="module-panel-left" style={{ width: 320, flexShrink: 0 }}>
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="badge" data-tone="blue">
              Debugger
            </span>
            <span className="badge">{challenge.difficulty}</span>
            <button
              className="btn-ghost ml-auto"
              onClick={() => {
                Storage.saveToLibrary(challenge);
                toast("Saved to library");
              }}
            >
              ☆ Save
            </button>
          </div>
          <h2 className="text-lg">{challenge.name}</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--ink-muted)" }}>
            {challenge.description}
          </p>
        </div>

        <div className="lab-card">
          <div className="section-label mb-2">Execution trace</div>
          {trace && ce ? (
            <>
              <div className="flex flex-wrap gap-1">
                {[...ce.string].map((c, i) => (
                  <span
                    key={i}
                    className="tape-cell"
                    data-state={i === step - 1 ? "current" : i < step - 1 ? "past" : "idle"}
                  >
                    {c}
                  </span>
                ))}
                {!ce.string && <span className="tape-cell">ε</span>}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button className="tool-btn" onClick={() => setStep((s) => Math.max(0, s - 1))}>
                  ◀
                </button>
                <button
                  className="tool-btn"
                  onClick={() => setPlaying((p) => !p)}
                  data-active={playing}
                >
                  {playing ? "❙❙" : "▶"}
                </button>
                <button
                  className="tool-btn"
                  onClick={() => setStep((s) => Math.min(trace.trace.length - 1, s + 1))}
                >
                  ▶|
                </button>
                <span className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
                  step {step}/{trace.trace.length - 1}
                </span>
              </div>
              <p className="mt-2 text-xs" style={{ color: "var(--ink-muted)" }}>
                {step === 0
                  ? `Start in ${trace.trace[0]?.state ?? "—"}.`
                  : trace.trace[step]
                    ? `Read "${trace.trace[step].symbol}" in ${trace.trace[step].fromState} → ${trace.trace[step].state}.`
                    : "Run stops here — a missing transition means reject."}
              </p>
            </>
          ) : (
            <p className="text-xs" style={{ color: "var(--ink-disabled)" }}>
              Build your attempt, then press “Debug my DFA”.
            </p>
          )}
        </div>

        <div className="lab-card">
          <div className="section-label mb-2">Socratic hints</div>
          <div className="flex gap-2">
            {[1, 2, 3].map((l) => (
              <button
                key={l}
                className="tool-btn"
                data-active={hintLevel >= l}
                onClick={() => showHint(l)}
              >
                L{l}
              </button>
            ))}
          </div>
          <ol className="mt-2 flex flex-col gap-2 text-xs" style={{ color: "var(--ink-muted)" }}>
            {hintTexts.slice(0, hintLevel).map((t, i) => (
              <li key={i}>
                <strong style={{ color: "var(--signal-blue)" }}>L{i + 1}.</strong> {t}
              </li>
            ))}
          </ol>
        </div>

        <ChallengePicker activeId={challenge.id} onPick={load} />
      </aside>

      <section className="workbench">
        <CanvasToolbar
          mode={mode}
          setMode={setMode}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          onClear={() => replace(starterMachine())}
          onLayout={() => commit((m) => layoutMachine(m))}
          alphabet={alphabet}
        >
          <button
            className="btn-ghost"
            onClick={() => replace(layoutMachine(dfaToMachine(challenge.dfa)))}
            title="Load a scrambled reference to repair"
          >
            Load reference
          </button>
          <button className="btn-primary" onClick={debugDFA}>
            Debug my DFA
          </button>
        </CanvasToolbar>

        <DFACanvas
          machine={machine}
          onChange={commit}
          onTransientChange={set}
          alphabet={alphabet}
          mode={mode}
          highlights={highlights}
          isolateSymbol={attention.isolateSymbol}
          annotations={attention.annotations}
          highlightTransition={attention.highlightTransition}
        />

        <div
          className="flex min-h-[64px] flex-col justify-center gap-1 px-4 py-3"
          style={{
            borderTop: `2px solid ${result?.tone === "accept" ? "var(--signal-cyan)" : result ? "var(--signal-rose)" : "var(--signal-blue)"}`,
            background: "color-mix(in srgb, var(--bg-panel) 70%, transparent)",
          }}
        >
          {result ? (
            <>
              <div
                className="flex items-center gap-2 text-sm font-semibold"
                style={{ fontFamily: "var(--font-display-family)" }}
              >
                {result.title}
                {ce && (
                  <>
                    <span className="badge" data-tone="accept">
                      expected {ce.expected}
                    </span>
                    <span className="badge" data-tone="reject">
                      yours {ce.got}
                    </span>
                  </>
                )}
              </div>
              <div className="text-xs" style={{ color: "var(--ink-muted)" }}>
                {result.body}
              </div>
            </>
          ) : (
            <div className="text-xs" style={{ color: "var(--ink-muted)" }}>
              Build a machine for this language, then let the lab find the shortest string where you
              disagree.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
