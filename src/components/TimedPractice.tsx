import { useCallback, useEffect, useRef, useState } from "react";
import { Flame, Play, X } from "lucide-react";
import type { Challenge } from "@/lib/engine/challenges";

const DURATION_S = 90;

function randomString(alphabet: string[]): string {
  const len = Math.floor(Math.random() * 8); // 0..7
  let s = "";
  for (let i = 0; i < len; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)] ?? "0";
  return s;
}

interface Verdict {
  str: string;
  expected: boolean;
  picked: boolean;
}

/**
 * Timed streak practice: rapid-fire accept/reject calls against the current
 * challenge's language. 90 seconds, streak combos, no canvas.
 */
export function TimedPractice({
  challenge,
  onClose,
}: {
  challenge: Challenge;
  onClose: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [timeLeft, setTimeLeft] = useState(DURATION_S);
  const [current, setCurrent] = useState(() => randomString(challenge.alphabet));
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [last, setLast] = useState<Verdict | null>(null);
  const timer = useRef<number | null>(null);

  const expected = useCallback(
    (str: string) => challenge.dfa.runWithTrace(str).accepted,
    [challenge],
  );

  useEffect(() => {
    if (!running || finished) return;
    timer.current = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          if (timer.current) window.clearInterval(timer.current);
          setFinished(true);
          setRunning(false);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [running, finished]);

  const start = () => {
    setScore(0);
    setStreak(0);
    setBest(0);
    setLast(null);
    setTimeLeft(DURATION_S);
    setCurrent(randomString(challenge.alphabet));
    setFinished(false);
    setRunning(true);
  };

  const answer = (picked: boolean) => {
    if (!running) return;
    const exp = expected(current);
    const right = picked === exp;
    setLast({ str: current, expected: exp, picked });
    if (right) {
      const next = streak + 1;
      setStreak(next);
      setBest((b) => Math.max(b, next));
      setScore((s) => s + 1 + Math.floor(next / 5)); // combo bonus every 5
    } else {
      setStreak(0);
    }
    setCurrent(randomString(challenge.alphabet));
  };

  const pct = (timeLeft / DURATION_S) * 100;
  const tone =
    pct < 20 ? "var(--signal-rose)" : pct < 40 ? "var(--signal-amber)" : "var(--signal-blue)";

  return (
    <div
      className="fixed inset-0 z-[800] flex flex-col"
      style={{ background: "var(--bg-canvas)" }}
      role="dialog"
      aria-label="Timed practice"
    >
      <header
        className="flex h-14 shrink-0 items-center gap-4 px-5"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <span className="brand">
          <span className="brand-dot" />
          Timed Practice
        </span>
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full"
          style={{ background: "var(--signal-blue-10)" }}
        >
          <div
            className="h-full rounded-full transition-[width] duration-1000 ease-linear"
            style={{ width: `${pct}%`, background: tone }}
          />
        </div>
        <span className="text-sm" style={{ fontFamily: "var(--font-mono-family)", color: tone }}>
          {timeLeft}s
        </span>
        <span className="badge" data-tone="blue">
          Score {score}
        </span>
        <span className="badge" data-tone={streak >= 5 ? "amber" : "blue"}>
          <Flame size={11} className="mr-1 inline" />
          {streak}
        </span>
        <button className="tool-btn" title="Quit practice" onClick={onClose}>
          <X size={15} />
        </button>
      </header>

      {streak >= 5 && running && (
        <div
          className="absolute left-1/2 top-[72px] z-10 -translate-x-1/2 rounded-full px-4 py-1 text-xs font-bold"
          style={{ background: "var(--signal-amber)", color: "var(--bg-canvas)" }}
        >
          🔥 x{streak} STREAK!
        </div>
      )}

      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        {!running && !finished && (
          <div className="lab-card max-w-md text-center">
            <h2 className="text-xl">Accept or reject?</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--ink-muted)" }}>
              {DURATION_S} seconds. Strings flash by — call whether{" "}
              <strong>{challenge.name}</strong> accepts each one. Streaks of 5+ earn combo points.
            </p>
            <button
              className="btn-primary mx-auto mt-5 inline-flex items-center gap-2"
              onClick={start}
            >
              <Play size={14} /> Start
            </button>
          </div>
        )}

        {running && (
          <div className="flex flex-col items-center gap-8">
            <div
              className="rounded-2xl border px-12 py-8 text-4xl tracking-[0.3em]"
              style={{
                fontFamily: "var(--font-mono-family)",
                borderColor: last
                  ? last.expected === last.picked
                    ? "var(--signal-cyan)"
                    : "var(--signal-rose)"
                  : "var(--border-strong)",
                background: "var(--bg-panel)",
                boxShadow: "var(--shadow-panel)",
                color: "var(--ink-primary)",
              }}
            >
              {current === "" ? "ε" : current}
            </div>
            <div className="flex gap-4">
              <button
                className="btn-primary px-8 py-3 text-base"
                style={{ background: "var(--signal-cyan)" }}
                onClick={() => answer(true)}
              >
                ✓ Accept
              </button>
              <button
                className="btn-primary px-8 py-3 text-base"
                style={{ background: "var(--signal-rose)" }}
                onClick={() => answer(false)}
              >
                ✗ Reject
              </button>
            </div>
            {last && (
              <p
                className="text-xs"
                style={{
                  color:
                    last.expected === last.picked ? "var(--signal-cyan)" : "var(--signal-rose)",
                }}
              >
                "{last.str || "ε"}" → {last.expected ? "accept" : "reject"}{" "}
                {last.expected === last.picked ? "— correct" : "— missed"}
              </p>
            )}
          </div>
        )}

        {finished && (
          <div className="lab-card max-w-md text-center">
            <div className="text-4xl">{score >= 20 ? "🏆" : score >= 10 ? "🌟" : "✅"}</div>
            <h2 className="mt-2 text-xl">Time!</h2>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              {[
                { label: "Score", value: score },
                { label: "Best streak", value: best },
                { label: "Language", value: challenge.name },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl border p-3"
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  <div
                    className="text-lg font-bold"
                    style={{
                      color: "var(--signal-blue)",
                      fontFamily: "var(--font-display-family)",
                    }}
                  >
                    {s.value}
                  </div>
                  <div className="section-label mt-1">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="mt-5 flex justify-center gap-2">
              <button className="btn-primary" onClick={start}>
                Play again
              </button>
              <button className="btn-ghost" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
