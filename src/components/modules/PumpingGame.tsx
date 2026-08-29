import { useEffect, useMemo, useState } from "react";
import {
  PUMPING_LANGUAGES,
  adversarySplit,
  checkCandidate,
  judge,
  legalSplits,
  pump,
  splitLabel,
  type Split,
  type Verdict,
} from "@/lib/engine/pumping";
import { Storage } from "@/lib/storage";
import { Swords, RotateCcw } from "lucide-react";

type Phase = "pick-p" | "pick-s" | "adversary" | "pick-i" | "won" | "lost";

interface Props {
  active?: boolean;
  onContext?: (fn: () => string) => void;
}

export function PumpingGame({ onContext }: Props) {
  const [langIndex, setLangIndex] = useState(0);
  const lang = PUMPING_LANGUAGES[langIndex]!;
  const [p, setP] = useState(0);
  const [phase, setPhase] = useState<Phase>("pick-p");
  const [candidate, setCandidate] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [split, setSplit] = useState<Split | null>(null);
  const [exponent, setExponent] = useState("2");
  const [verdicts, setVerdicts] = useState<Verdict[]>([]);
  const [transcript, setTranscript] = useState<string[]>([]);

  const log = (line: string) => setTranscript((t) => [...t, line]);

  const reset = (index = langIndex) => {
    setLangIndex(index);
    setP(0);
    setPhase("pick-p");
    setCandidate("");
    setNote(null);
    setSplit(null);
    setExponent("2");
    setVerdicts([]);
    setTranscript([]);
  };

  const startRound = () => {
    const chosen = 2 + Math.floor(Math.random() * 3);
    setP(chosen);
    setPhase("pick-s");
    setNote(null);
    log(`Adversary: "Suppose L is regular. I claim a pumping length p = ${chosen}."`);
  };

  const submitCandidate = () => {
    const check = checkCandidate(lang, candidate.trim(), p);
    setNote(check.message);
    if (!check.ok) return;
    log(`You: s = "${candidate.trim()}"`);
    const s = adversarySplit(lang, candidate.trim(), p);
    if (!s) {
      setNote("No legal decomposition exists — pick a longer string.");
      return;
    }
    setSplit(s);
    setPhase("pick-i");
    log(`Adversary: "Then s = xyz with ${splitLabel(s)} — and every xyⁱz stays in L."`);
  };

  const submitExponent = () => {
    if (!split) return;
    const i = Math.max(0, Math.min(6, Number(exponent) || 0));
    const v = judge(lang, split, i);
    setVerdicts((vs) => [...vs, v]);
    log(`You: i = ${i} → "${v.pumped || "ε"}" ${v.inLanguage ? "∈ L" : "∉ L"}`);
    if (v.wins) {
      setPhase("won");
      log('Adversary: "…fine. That decomposition is dead. The contradiction stands."');
      Storage.recordSolve("pumping", lang.id, verdicts.length + 1);
    } else {
      setNote(v.message);
      if (verdicts.length + 1 >= 4) {
        setPhase("lost");
        Storage.appendMistake(
          "pumping",
          lang.id,
          `Four exponents tried on ${splitLabel(split)} without leaving ${lang.name}.`,
        );
      }
    }
  };

  const splitCount = useMemo(
    () => (candidate.trim() && p ? legalSplits(candidate.trim(), p).length : 0),
    [candidate, p],
  );

  useEffect(() => {
    onContext?.(() =>
      [
        `Module: Pumping-lemma game — language ${lang.name}: ${lang.formal} (this language is NOT regular; there is no automaton for it).`,
        `Phase: ${phase}. p = ${p || "not chosen"}. Student's s = "${candidate || "none"}".`,
        split
          ? `Adversary decomposition on the board: ${splitLabel(split)}.`
          : "No decomposition on the board yet.",
        `Exponents tried: ${verdicts.map((v) => `"${v.pumped}" ${v.inLanguage ? "in L" : "not in L"}`).join("; ") || "none"}.`,
        "HARD RULE for this module: never state which exponent i breaks the decomposition, and never hand the student a string s. Ask what quantity the language counts, what the constraint |xy| ≤ p forces y to consist of, and what happens to that count when y repeats.",
      ].join("\n"),
    );
  }, [onContext, lang, phase, p, candidate, split, verdicts]);

  return (
    <div className="module-container">
      <aside className="module-panel-left" style={{ width: 360, flexShrink: 0 }}>
        <div>
          <span className="badge" data-tone="rose">
            Pumping Lemma
          </span>
          <h2 className="mt-2 text-lg">Beat the adversary</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--ink-muted)" }}>
            The app defends the claim “L is regular”. You refute it: pick s, then break the
            decomposition it hands you.
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <span className="section-label">Languages</span>
          {PUMPING_LANGUAGES.map((l, i) => (
            <button
              key={l.id}
              className="tape-row"
              data-verdict={i === langIndex ? "accept" : undefined}
              onClick={() => reset(i)}
            >
              <span>{l.name}</span>
              <span style={{ color: "var(--ink-disabled)" }}>Σ={l.alphabet.join(",")}</span>
            </button>
          ))}
        </div>

        <div className="lab-card">
          <span className="section-label">Why it's not regular</span>
          <p className="mt-1 text-[11px]" style={{ color: "var(--ink-muted)" }}>
            {lang.intuition}
          </p>
          <p className="mt-2 text-xs" style={{ fontFamily: "var(--font-mono-family)" }}>
            {lang.formal}
          </p>
        </div>

        <div className="lab-card">
          <span className="section-label">Membership sandbox</span>
          <MemberProbe test={lang.member} />
        </div>
      </aside>

      <section className="workbench">
        <div className="canvas-toolbar">
          <span className="badge" data-tone="rose">
            <Swords size={12} className="mr-1 inline" />
            {phase === "won" ? "you win" : phase === "lost" ? "adversary holds" : phase}
          </span>
          {p > 0 && (
            <span className="badge" data-tone="amber">
              p = {p}
            </span>
          )}
          <button className="btn-ghost ml-auto" onClick={() => reset()}>
            <RotateCcw size={13} className="mr-1 inline" />
            Restart
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="mx-auto flex max-w-2xl flex-col gap-3">
            <div className="lab-card">
              <span className="section-label">Transcript</span>
              <div className="mt-2 flex flex-col gap-1 text-xs">
                {transcript.length ? (
                  transcript.map((line, i) => (
                    <div key={i} style={{ fontFamily: "var(--font-mono-family)" }}>
                      {line}
                    </div>
                  ))
                ) : (
                  <span style={{ color: "var(--ink-disabled)" }}>
                    Start the round and the adversary will commit to a pumping length.
                  </span>
                )}
              </div>
            </div>

            {phase === "pick-p" && (
              <button className="btn-primary" onClick={startRound}>
                Let the adversary choose p
              </button>
            )}

            {phase === "pick-s" && (
              <div className="lab-card">
                <span className="section-label">Your move: choose s ∈ L with |s| ≥ {p}</span>
                <div className="mt-2 flex gap-2">
                  <input
                    className="field-input flex-1"
                    value={candidate}
                    placeholder={lang.suggest(p)[0]}
                    onChange={(e) => setCandidate(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitCandidate()}
                  />
                  <button className="btn-primary" onClick={submitCandidate}>
                    Commit s
                  </button>
                </div>
                {splitCount > 0 && (
                  <p className="mt-2 text-[11px]" style={{ color: "var(--ink-disabled)" }}>
                    {splitCount} legal decomposition(s) with |xy| ≤ {p}.
                  </p>
                )}
              </div>
            )}

            {split && (
              <div className="lab-card">
                <span className="section-label">Adversary's decomposition</span>
                <div className="mt-2 flex flex-wrap gap-1 text-sm">
                  <SplitChip label="x" value={split.x} tone="blue" />
                  <SplitChip label="y" value={split.y} tone="rose" />
                  <SplitChip label="z" value={split.z} tone="cyan" />
                </div>
                <p className="mt-2 text-[11px]" style={{ color: "var(--ink-muted)" }}>
                  |xy| = {split.x.length + split.y.length} ≤ {p}, |y| = {split.y.length} &gt; 0.
                </p>
              </div>
            )}

            {(phase === "pick-i" || phase === "lost") && split && (
              <div className="lab-card">
                <span className="section-label">Your move: choose i so that xyⁱz ∉ L</span>
                <div className="mt-2 flex gap-2">
                  <input
                    className="field-input"
                    style={{ width: 90 }}
                    value={exponent}
                    onChange={(e) => setExponent(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitExponent()}
                  />
                  <button className="btn-primary" onClick={submitExponent}>
                    Pump it
                  </button>
                  <span
                    className="ml-2 self-center text-[11px]"
                    style={{ color: "var(--ink-muted)" }}
                  >
                    preview: {pump(split, Math.max(0, Number(exponent) || 0)) || "ε"}
                  </span>
                </div>
              </div>
            )}

            {note && (
              <div className="lab-card" style={{ borderColor: "var(--signal-amber)" }}>
                <p className="text-xs">{note}</p>
              </div>
            )}

            {phase === "won" && (
              <div className="lab-card" style={{ borderColor: "var(--signal-cyan)" }}>
                <p className="text-sm">
                  Contradiction reached — no pumping length survives, so {lang.name} is not regular.
                </p>
                <button className="btn-ghost mt-2" onClick={() => reset()}>
                  Play another round
                </button>
              </div>
            )}

            {phase === "lost" && (
              <div className="lab-card" style={{ borderColor: "var(--signal-rose)" }}>
                <p className="text-sm">
                  The adversary is still standing. Look again at what y is made of — the constraint
                  |xy| ≤ p pins it inside the first block.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function SplitChip({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <span className="chip" data-tone={tone} style={{ fontFamily: "var(--font-mono-family)" }}>
      {label} = {value || "ε"}
    </span>
  );
}

function MemberProbe({ test }: { test: (s: string) => boolean }) {
  const [value, setValue] = useState("");
  const inL = test(value);
  return (
    <>
      <input
        className="field-input mt-1 w-full"
        value={value}
        placeholder="type any string"
        onChange={(e) => setValue(e.target.value)}
      />
      <p className="mt-2 text-[11px]">
        <span className="badge" data-tone={inL ? "cyan" : "rose"}>
          {value || "ε"} {inL ? "∈ L" : "∉ L"}
        </span>
      </p>
    </>
  );
}
