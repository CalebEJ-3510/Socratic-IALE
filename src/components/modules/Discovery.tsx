import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { GraduationCap, PackageOpen, Share2, Timer, Wrench } from "lucide-react";
import { DFACanvas, type CanvasMode, type HighlightTone } from "@/components/DFACanvas";
import { CanvasToolbar } from "@/components/CanvasToolbar";
import { ChallengePicker } from "@/components/ChallengePicker";
import { TimedPractice } from "@/components/TimedPractice";
import { ChallengeCreator } from "@/components/ChallengeCreator";
import { ExchangeMenu } from "@/components/ExchangeMenu";
import { ExamMode } from "@/components/ExamMode";
import {
  buildPack,
  hydratePackChallenge,
  loadPackFromLocation,
  packUrl,
  parsePack,
} from "@/lib/packs";
import { downloadText } from "@/lib/exchange";
import { FIXED_CHALLENGES, challengeGenerator, type Challenge } from "@/lib/engine/challenges";
import { DFA } from "@/lib/engine/dfa";
import { decodeShare, shareUrl } from "@/lib/share";
import { findCounterexample } from "@/lib/engine/algorithms";
import { validateDFA, validateWarnings } from "@/lib/engine/validate";
import { Storage } from "@/lib/storage";
import {
  dfaToMachine,
  layoutMachine,
  machineToDFA,
  positionsOf,
  starterMachine,
  useMachine,
} from "@/lib/machine";
import { useCanvasShortcuts } from "@/lib/useCanvasShortcuts";
import { buildDiscoveryContext } from "@/lib/tutor/context";
import type { TutorAction } from "@/lib/tutor/actions";
import { useCanvasAttention } from "@/lib/tutor/useCanvasAttention";

interface Feedback {
  tone: "accept" | "reject" | "blue";
  title: string;
  body: string;
}

export function Discovery({
  active,
  onContext,
}: {
  active: boolean;
  onContext: (ctx: () => string) => void;
}) {
  const [challenge, setChallenge] = useState<Challenge>(FIXED_CHALLENGES[0]!);
  const [index, setIndex] = useState(1);
  const [extra, setExtra] = useState<Challenge[]>([]);
  const [examples, setExamples] = useState<{ str: string; accept: boolean }[]>([]);
  const [attempts, setAttempts] = useState(0);
  const [solved, setSolved] = useState(false);
  const [hintIndex, setHintIndex] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [mode, setMode] = useState<CanvasMode>("pointer");
  const [highlights, setHighlights] = useState<Record<string, HighlightTone>>({});
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [regex, setRegex] = useState("");
  const [regexErr, setRegexErr] = useState<string | null>(null);
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [examOpen, setExamOpen] = useState(false);
  /** Alphabet of an imported machine, when it differs from the challenge's. */
  const [alphaOverride, setAlphaOverride] = useState<string[] | null>(null);
  const packInput = useRef<HTMLInputElement>(null);
  const { machine, commit, set, replace, undo, redo, canUndo, canRedo } =
    useMachine(starterMachine());
  const saveTimer = useRef<number | null>(null);
  /** Tutor difficulty bias (IALE_ADJUST_DIFFICULTY) applied to the next generated language. */
  const bias = useRef(0);
  const attention = useCanvasAttention(active, () => commit((m) => layoutMachine(m)));

  const alphabet = alphaOverride ?? challenge.alphabet;
  const dfa = useMemo(() => machineToDFA(machine, alphabet), [machine, alphabet]);
  const errors = useMemo(() => validateDFA(dfa), [dfa]);

  useCanvasShortcuts(active, setMode, { undo, redo });

  const setChallengeAndReset = useCallback(
    (ch: Challenge, idx: number) => {
      setChallenge(ch);
      setIndex(idx);
      setAlphaOverride(null);
      setAttempts(0);
      setHintIndex(0);
      setFeedback(null);
      setHighlights({});
      const progress = Storage.getProgress(ch.id).data;
      setSolved(!!progress?.solved);
      if (progress?.solved) setAttempts(progress.attempts);
      const shownAccepted = progress?.shownAccepted ?? ch.initialExamples.accepted;
      const shownRejected = progress?.shownRejected ?? ch.initialExamples.rejected;
      setExamples([
        ...shownAccepted.map((str) => ({ str, accept: true })),
        ...shownRejected.map((str) => ({ str, accept: false })),
      ]);
      const save = Storage.loadDFA(`discovery:${ch.id}`).data;
      if (save)
        replace(
          dfaToMachine(
            new (dfa.constructor as new (a: unknown) => never)(save.dfa) as never,
            save.positions,
          ),
        );
      else replace(starterMachine());
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [replace],
  );

  useEffect(() => {
    setChallengeAndReset(FIXED_CHALLENGES[0]!, 1);
    // A shared machine in the URL hash overrides the autosaved canvas.
    const shared = decodeShare(window.location.hash);
    if (shared) {
      try {
        replace(dfaToMachine(DFA.fromJSON(shared.d), shared.p));
        toast.success("Loaded shared machine from link");
      } catch {
        toast.error("That share link is malformed");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // debounced autosave
  useEffect(() => {
    if (!machine.states.length) return;
    setSaveState("saving");
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      Storage.saveDFA(`discovery:${challenge.id}`, dfa.toJSON(), positionsOf(machine));
      setSaveState("saved");
    }, 800);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machine, challenge.id]);

  // tutor context
  useEffect(() => {
    onContext(() =>
      buildDiscoveryContext({
        difficulty: challenge.difficulty,
        shownAccepted: examples.filter((e) => e.accept).map((e) => e.str || "ε"),
        shownRejected: examples.filter((e) => !e.accept).map((e) => e.str || "ε"),
        machine,
        alphabet,
        canvasErrors: errors,
        attempts,
        solved,
      }),
    );
  }, [onContext, challenge, examples, machine, alphabet, errors, attempts, solved]);

  const flashState = (label: string, tone: HighlightTone, ms = 1400) => {
    setHighlights((h) => ({ ...h, [label]: tone }));
    window.setTimeout(() => setHighlights(({ [label]: _drop, ...rest }) => rest), ms);
  };

  const runExample = (str: string) => {
    if (errors.length) {
      toast.error("Finish the machine first", { description: errors[0] });
      return;
    }
    const result = dfa.runWithTrace(str);
    const final = result.trace[result.trace.length - 1]?.state;
    toast[result.accepted ? "success" : "error"](
      `"${str || "ε"}" → your machine ${result.accepted ? "accepts" : result.crashed ? "crashes (reject)" : "rejects"}`,
      { description: final ? `Ends in ${final}` : undefined },
    );
    if (final) flashState(final, result.accepted ? "cyan" : "rose");
  };

  const addExample = (str: string, accept: boolean) => {
    setExamples((prev) => (prev.some((e) => e.str === str) ? prev : [...prev, { str, accept }]));
    Storage.setProgress(challenge.id, {
      shownAccepted: [
        ...examples.filter((e) => e.accept).map((e) => e.str),
        ...(accept ? [str] : []),
      ],
      shownRejected: [
        ...examples.filter((e) => !e.accept).map((e) => e.str),
        ...(accept ? [] : [str]),
      ],
    });
  };

  const check = () => {
    if (solved) return;
    if (alphaOverride && alphaOverride.join() !== challenge.alphabet.join()) {
      toast.error("Σ doesn't match this challenge", {
        description: `This hidden language is defined over {${challenge.alphabet.join(",")}}. Reset Σ or load a new challenge.`,
      });
      return;
    }
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);
    if (errors.length) {
      setFeedback({ tone: "blue", title: "Not a complete DFA yet", body: errors.join(" ") });
      return;
    }
    const ce = findCounterexample(challenge.dfa, dfa);
    if (!ce) {
      setSolved(true);
      Storage.recordSolve("discovery", challenge.id, nextAttempts);
      Storage.setProgress(challenge.id, { solved: true, attempts: nextAttempts });
      const warn = validateWarnings(dfa);
      setFeedback({
        tone: "accept",
        title: `Solved — the hidden language was "${challenge.name}"`,
        body: `${challenge.description}${warn.length ? ` ${warn[0]}` : ""} Attempts: ${nextAttempts}.`,
      });
      toast.success("Hypothesis confirmed 🎉", { description: challenge.name });
      return;
    }
    Storage.recordAttempt("discovery", challenge.id);
    Storage.appendMistake(
      dfa.isComplete() ? "accept" : "transition",
      challenge.id,
      `counterexample ${ce.string || "ε"} expected ${ce.expected}`,
    );
    addExample(ce.string, ce.expected === "accept");
    setFeedback({
      tone: "reject",
      title: `Counterexample: "${ce.string || "ε"}"`,
      body: `The language expects ${ce.expected.toUpperCase()}, your machine says ${ce.got.toUpperCase()}. It's been added to your example tape.`,
    });
  };

  const loadRandom = () => {
    // Difficulty bias from the tutor: "suffix" is the gentlest generator shape,
    // "countMod" the most demanding; no bias means a free random draw.
    const ch = challengeGenerator.random(
      bias.current > 0 ? "countMod" : bias.current < 0 ? "suffix" : undefined,
      alphaOverride ?? undefined,
    );
    if (!ch) {
      toast.error("Generator hiccup — try again");
      return;
    }
    setExtra((prev) => [ch, ...prev].slice(0, 12));
    setChallengeAndReset(ch, index + 1);
    toast("New hidden language loaded", {
      description: `${ch.difficulty} · Σ = {${ch.alphabet.join(",")}}`,
    });
  };

  const loadRegex = () => {
    const ch = challengeGenerator.fromRegex(regex.trim(), alphabet, {
      name: `Custom: ${regex.trim()}`,
    });
    if (!ch) {
      setRegexErr("That pattern doesn't parse over this alphabet.");
      return;
    }
    setRegexErr(null);
    setExtra((prev) => [ch, ...prev].slice(0, 12));
    setChallengeAndReset(ch, index + 1);
  };

  // tutor-driven actions
  useEffect(() => {
    const handler = (e: Event) => {
      if (!active) return;
      const action = (e as CustomEvent<TutorAction>).detail;
      if (action.type === "highlight") flashState(action.state, action.color, 3000);
      if (action.type === "test" || action.type === "animate") runExample(action.value);
      if (action.type === "showExample") addExample(action.str, action.accept);
      if (action.type === "adjustDifficulty") {
        bias.current = action.direction === "up" ? 1 : -1;
        toast(
          action.direction === "up"
            ? "Next language will be a step harder"
            : "Next language will be gentler",
        );
      }
      if (action.type === "challenge") {
        const ch = challengeGenerator.fromRegex(action.regex, action.alphabet, {
          name: action.name,
          difficulty: ["Easy", "Medium", "Hard"].includes(action.difficulty)
            ? (action.difficulty as Challenge["difficulty"])
            : "Easy",
          description: "Suggested by Socratic as targeted practice.",
        });
        if (ch) {
          Storage.saveAIChallenge({ ...ch, source: "ai" });
          setExtra((prev) => [ch, ...prev].slice(0, 12));
          setChallengeAndReset(ch, index + 1);
          toast.success("Socratic set you a practice challenge", { description: ch.name });
        } else {
          toast.error("Socratic suggested an invalid practice language", {
            description: "Its regex used symbols outside the alphabet — ask it to try again.",
          });
        }
      }
    };
    window.addEventListener("iale-tutor-action", handler);
    return () => window.removeEventListener("iale-tutor-action", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, dfa, errors, examples]);

  const unreachableWarn = useMemo(() => (solved ? validateWarnings(dfa) : []), [solved, dfa]);

  const clearUnreachable = () => {
    const reach = dfa.reachableStates();
    commit((m) => {
      const kept = m.states.filter((s) => reach.has(s.label));
      const ids = new Set(kept.map((s) => s.id));
      return {
        states: kept,
        transitions: m.transitions.filter((t) => ids.has(t.from) && ids.has(t.to)),
      };
    });
    toast.success("Unreachable states removed");
  };

  const share = () => {
    if (!machine.states.length) {
      toast.error("Nothing to share yet — add some states first");
      return;
    }
    const url = shareUrl(machine, alphabet);
    window.history.replaceState(null, "", url);
    void navigator.clipboard
      ?.writeText(url)
      .then(() => toast.success("Share link copied to clipboard"))
      .catch(() => toast("Share link is in the address bar"));
  };

  // ---- assignment packs -------------------------------------------------
  const adoptPack = useCallback(
    (name: string, challenges: Challenge[]) => {
      if (!challenges.length) return;
      challenges.forEach((c) => Storage.saveToLibrary(c));
      setExtra((prev) => [...challenges, ...prev].slice(0, 24));
      setChallengeAndReset(challenges[0]!, 1);
      toast.success(`Loaded pack "${name}"`, {
        description: `${challenges.length} challenge${challenges.length === 1 ? "" : "s"} added to your library`,
      });
    },
    [setChallengeAndReset],
  );

  useEffect(() => {
    void loadPackFromLocation().then((result) => {
      if (!result) return;
      if (!result.ok) {
        toast.error("Pack link failed", { description: result.error });
        return;
      }
      adoptPack(result.pack.name, result.pack.challenges.map(hydratePackChallenge));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const packChallenges = () => {
    const seen = new Map<string, Challenge>();
    for (const c of [...Storage.getLibrary(), ...extra, challenge]) seen.set(c.id, c);
    return [...seen.values()];
  };

  const exportPack = () => {
    const list = packChallenges();
    if (!list.length) {
      toast.error("Nothing to bundle yet — save some challenges to your library first");
      return;
    }
    const pack = buildPack("IALE assignment pack", list);
    downloadText("assignment-pack.iale.json", JSON.stringify(pack, null, 2), "application/json");
    toast.success(`Exported ${list.length} challenges as a pack`);
  };

  const copyPackLink = () => {
    const list = packChallenges();
    if (!list.length) {
      toast.error("Nothing to bundle yet");
      return;
    }
    const url = packUrl(buildPack("IALE assignment pack", list.slice(0, 8)));
    void navigator.clipboard
      ?.writeText(url)
      .then(() =>
        toast.success("Pack link copied", { description: "Opens straight into these challenges" }),
      )
      .catch(() => toast.error("Clipboard blocked — export the pack file instead"));
  };

  const importPackFile = async (file: File | null | undefined) => {
    if (!file) return;
    const result = parsePack(await file.text());
    if (!result.ok) {
      toast.error("Pack import failed", { description: result.error });
      return;
    }
    adoptPack(result.pack.name, result.pack.challenges.map(hydratePackChallenge));
  };

  const hints = challenge.hints ?? [
    "Think about what the machine must remember between symbols — that memory is your states.",
    "Compare two examples that differ by one symbol. Which one flips the verdict, and where?",
    "Check the accepting statuses last: which state must a successful run end in?",
  ];

  return (
    <div className="module-container">
      <aside className="module-panel-left" style={{ width: 360, flexShrink: 0 }}>
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="badge" data-tone="blue">
              Challenge {index}
            </span>
            <span
              className="badge"
              data-tone={
                challenge.difficulty === "Hard"
                  ? "reject"
                  : challenge.difficulty === "Medium"
                    ? "amber"
                    : "accept"
              }
            >
              {challenge.difficulty}
            </span>
            {saveState !== "idle" && (
              <span className="ml-auto text-[10px]" style={{ color: "var(--ink-disabled)" }}>
                {saveState === "saving" ? "saving…" : "saved"}
              </span>
            )}
          </div>
          <h2 className="text-lg">{solved ? challenge.name : "???"}</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--ink-muted)" }}>
            {solved
              ? challenge.description
              : "Infer the hidden language from the labelled tape, then build the DFA that decides it."}
          </p>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="section-label">Language tape</span>
            <span className="text-[10px]" style={{ color: "var(--ink-disabled)" }}>
              String / Result
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {examples.map((ex) => (
              <button
                key={`${ex.str}-${ex.accept}`}
                className="tape-row"
                data-verdict={ex.accept ? "accept" : "reject"}
                onClick={() => runExample(ex.str)}
                title="Run this string on your machine"
              >
                <span>{ex.str === "" ? "ε" : ex.str}</span>
                <span style={{ color: ex.accept ? "var(--signal-cyan)" : "var(--signal-rose)" }}>
                  {ex.accept ? "✓ accept" : "✗ reject"}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="lab-card">
          <div className="flex items-center justify-between">
            <span className="section-label">Hints</span>
            <button
              className="btn-ghost"
              onClick={() => setHintIndex((h) => Math.min(hints.length, h + 1))}
            >
              Reveal hint {Math.min(hints.length, hintIndex + 1)}
            </button>
          </div>
          <ol className="mt-2 flex flex-col gap-2 text-xs" style={{ color: "var(--ink-muted)" }}>
            {hints.slice(0, hintIndex).map((h, i) => (
              <li key={i}>
                <strong style={{ color: "var(--signal-blue)" }}>L{i + 1}.</strong> {h}
              </li>
            ))}
          </ol>
        </div>

        <div className="lab-card">
          <div className="section-label mb-2">Custom language (regex)</div>
          <div className="flex gap-2">
            <input
              className="field-input"
              placeholder="(0|1)*01"
              value={regex}
              onChange={(e) => setRegex(e.target.value)}
            />
            <button className="btn-ghost" onClick={loadRegex}>
              Load
            </button>
          </div>
          {regexErr && (
            <p className="mt-2 text-[11px]" style={{ color: "var(--signal-rose)" }}>
              {regexErr}
            </p>
          )}
        </div>

        <div className="lab-card">
          <div className="section-label mb-2">Assignment packs</div>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-ghost inline-flex items-center gap-1.5"
              onClick={() => packInput.current?.click()}
            >
              <PackageOpen size={13} /> Import pack
            </button>
            <button className="btn-ghost" onClick={exportPack}>
              Export pack
            </button>
            <button className="btn-ghost" onClick={copyPackLink}>
              Copy pack link
            </button>
          </div>
          <p className="mt-2 text-[10px]" style={{ color: "var(--ink-disabled)" }}>
            A pack bundles several challenges into one file, and ?pack=… links load one directly.
          </p>
          <input
            ref={packInput}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              void importPackFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>

        <ChallengePicker
          activeId={challenge.id}
          maskNames
          extra={extra}
          onPick={(c) =>
            setChallengeAndReset(
              c,
              FIXED_CHALLENGES.findIndex((f) => f.id === c.id) + 1 || index + 1,
            )
          }
        />
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
          onAlphabetChange={(next) => setAlphaOverride(next.length ? next : null)}
        >
          <button
            className="btn-ghost inline-flex items-center gap-1.5"
            title="Copy a shareable link to this machine"
            onClick={share}
          >
            <Share2 size={13} /> Share
          </button>
          <button
            className="btn-ghost inline-flex items-center gap-1.5"
            title="Build your own challenge"
            onClick={() => setCreatorOpen(true)}
          >
            <Wrench size={13} /> Create
          </button>
          <button
            className="btn-ghost inline-flex items-center gap-1.5"
            title="Timed accept/reject streak practice"
            onClick={() => setPracticeOpen(true)}
          >
            <Timer size={13} /> Practice
          </button>
          <button
            className="btn-ghost inline-flex items-center gap-1.5"
            title="Longer timed assessment — the tutor goes offline until it ends"
            onClick={() => setExamOpen(true)}
          >
            <GraduationCap size={13} /> Exam
          </button>
          <ExchangeMenu
            machine={machine}
            name={solved ? challenge.name : "automaton"}
            onImport={(imported, importedAlphabet) => {
              replace(imported);
              setAlphaOverride(importedAlphabet);
            }}
          />
          <button className="btn-ghost" onClick={loadRandom}>
            New challenge
          </button>
          <button className="btn-primary" onClick={check} disabled={solved}>
            {solved ? "Solved ✓" : "Check hypothesis"}
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
            borderTop: `2px solid ${
              feedback?.tone === "accept"
                ? "var(--signal-cyan)"
                : feedback?.tone === "reject"
                  ? "var(--signal-rose)"
                  : "var(--signal-blue)"
            }`,
            background: "color-mix(in srgb, var(--bg-panel) 70%, transparent)",
          }}
        >
          {feedback ? (
            <>
              <div
                className="text-sm font-semibold"
                style={{ fontFamily: "var(--font-display-family)" }}
              >
                {feedback.title}
              </div>
              <div className="text-xs" style={{ color: "var(--ink-muted)" }}>
                {feedback.body}
              </div>
              {!!unreachableWarn.length && (
                <button className="btn-ghost mt-1 self-start text-xs" onClick={clearUnreachable}>
                  Clear unreachable states?
                </button>
              )}
            </>
          ) : (
            <div className="text-xs" style={{ color: "var(--ink-muted)" }}>
              <strong style={{ color: "var(--ink-primary)" }}>S</strong> add state ·{" "}
              <strong style={{ color: "var(--ink-primary)" }}>T</strong> transition (click two
              states) · <strong style={{ color: "var(--ink-primary)" }}>V</strong> move ·
              right-click a state for start/accepting/rename · double-click toggles accepting.
              {attempts > 0 && ` · Attempts: ${attempts}`}
            </div>
          )}
        </div>
      </section>

      {practiceOpen && (
        <TimedPractice challenge={challenge} onClose={() => setPracticeOpen(false)} />
      )}
      {examOpen && (
        <ExamMode
          pool={[...FIXED_CHALLENGES, ...extra, ...Storage.getLibrary()]}
          onClose={() => setExamOpen(false)}
        />
      )}
      {creatorOpen && (
        <ChallengeCreator
          defaultAlphabet={alphabet}
          onClose={() => setCreatorOpen(false)}
          onLoad={(ch) => {
            setExtra((prev) => [ch, ...prev.filter((c) => c.id !== ch.id)].slice(0, 12));
            setChallengeAndReset(ch, index + 1);
          }}
        />
      )}
    </div>
  );
}
