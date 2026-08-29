import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GraduationCap, Play, X } from "lucide-react";
import type { Challenge } from "@/lib/engine/challenges";
import { Storage, type ExamReport } from "@/lib/storage";

const DURATION_S = 8 * 60;
const QUESTIONS = 12;

/** Coarse concept tags used for the report card's mastery bars. */
export function conceptsOf(challenge: Challenge): string[] {
  const text = `${challenge.id} ${challenge.name} ${challenge.description}`.toLowerCase();
  const tags: string[] = [];
  if (/even|odd|parity/.test(text)) tags.push("Parity");
  if (/mod|divisib|multiple|count|number of/.test(text)) tags.push("Counting & modular");
  if (/end|suffix|last/.test(text)) tags.push("Suffixes");
  if (/start|begin|prefix|first/.test(text)) tags.push("Prefixes");
  if (/contain|substring|anywhere/.test(text)) tags.push("Substrings");
  if (/length|at least|at most|exactly/.test(text)) tags.push("Length constraints");
  return tags.length ? tags.slice(0, 2) : ["General pattern reading"];
}

interface Question {
  challenge: Challenge;
  str: string;
  expected: boolean;
  concepts: string[];
}

function shuffle<T>(items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function buildExam(pool: Challenge[]): Question[] {
  const picked = shuffle(pool).slice(0, Math.min(6, pool.length));
  const questions: Question[] = [];
  for (const challenge of picked) {
    const samples = challenge.dfa.sampleStrings({ maxLen: 6, count: 8 });
    const concepts = conceptsOf(challenge);
    const accepted = shuffle(samples.accepted).slice(0, 2);
    const rejected = shuffle(samples.rejected).slice(0, 2);
    for (const str of accepted) questions.push({ challenge, str, expected: true, concepts });
    for (const str of rejected) questions.push({ challenge, str, expected: false, concepts });
  }
  return shuffle(questions).slice(0, QUESTIONS);
}

/**
 * Exam mode: a longer timed set over the same accept/reject loop as timed
 * practice, ending in a report card with per-concept mastery bars. The tutor is
 * deliberately unavailable while a session is running — the app dispatches
 * `iale-exam-state` so the shell can close and lock the Socratic panel.
 */
export function ExamMode({ pool, onClose }: { pool: Challenge[]; onClose: () => void }) {
  const [phase, setPhase] = useState<"brief" | "running" | "report">("brief");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [at, setAt] = useState(0);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [timeLeft, setTimeLeft] = useState(DURATION_S);
  const [report, setReport] = useState<ExamReport | null>(null);
  const timer = useRef<number | null>(null);

  const finish = useCallback((qs: Question[], given: boolean[], spent: number) => {
    const byConcept = new Map<string, { correct: number; total: number }>();
    let score = 0;
    qs.forEach((q, i) => {
      const answered = i < given.length;
      const right = answered && given[i] === q.expected;
      if (right) score++;
      for (const c of q.concepts) {
        const entry = byConcept.get(c) ?? { correct: 0, total: 0 };
        entry.total++;
        if (right) entry.correct++;
        byConcept.set(c, entry);
      }
    });
    const built: ExamReport = {
      at: Date.now(),
      durationS: spent,
      score,
      total: qs.length,
      concepts: [...byConcept.entries()]
        .map(([concept, v]) => ({ concept, ...v }))
        .sort((a, b) => a.correct / a.total - b.correct / b.total),
      languages: [...new Set(qs.map((q) => q.challenge.name))],
    };
    Storage.saveExamReport(built);
    setReport(built);
    setPhase("report");
  }, []);

  // Countdown — only while a session is actually running.
  useEffect(() => {
    if (phase !== "running") return;
    timer.current = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          window.clearInterval(timer.current!);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [phase]);

  useEffect(() => {
    if (phase === "running" && timeLeft === 0) finish(questions, answers, DURATION_S);
  }, [timeLeft, phase, questions, answers, finish]);

  // Tell the shell to keep the tutor quiet for the duration of the session.
  useEffect(() => {
    const emit = (active: boolean) => {
      window.dispatchEvent(new CustomEvent("iale-exam-state", { detail: { active } }));
    };
    emit(phase === "running");
    return () => emit(false);
  }, [phase]);

  const start = () => {
    const qs = buildExam(pool);
    setQuestions(qs);
    setAnswers([]);
    setAt(0);
    setTimeLeft(DURATION_S);
    setPhase("running");
  };

  const answer = (picked: boolean) => {
    const given = [...answers, picked];
    setAnswers(given);
    if (given.length >= questions.length) finish(questions, given, DURATION_S - timeLeft);
    else setAt((i) => i + 1);
  };

  const current = questions[at];
  const pct = (timeLeft / DURATION_S) * 100;
  const tone =
    pct < 15 ? "var(--signal-rose)" : pct < 35 ? "var(--signal-amber)" : "var(--signal-blue)";
  const mmss = `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, "0")}`;
  const weakest = useMemo(
    () =>
      report?.concepts.filter((c: ExamReport["concepts"][number]) => c.correct / c.total < 0.7) ??
      [],
    [report],
  );

  return (
    <div
      className="fixed inset-0 z-[850] flex flex-col"
      style={{ background: "var(--bg-canvas)" }}
      role="dialog"
      aria-label="Exam mode"
    >
      <header
        className="flex h-14 shrink-0 items-center gap-4 px-5"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <span className="brand">
          <span className="brand-dot" />
          Exam Mode
        </span>
        {phase === "running" && (
          <>
            <div
              className="h-1.5 flex-1 overflow-hidden rounded-full"
              style={{ background: "var(--signal-blue-10)" }}
            >
              <div
                className="h-full rounded-full transition-[width] duration-1000 ease-linear"
                style={{ width: `${pct}%`, background: tone }}
              />
            </div>
            <span
              className="text-sm"
              style={{ fontFamily: "var(--font-mono-family)", color: tone }}
            >
              {mmss}
            </span>
            <span className="badge" data-tone="blue">
              Q{at + 1} / {questions.length}
            </span>
          </>
        )}
        <button
          className="tool-btn ml-auto"
          title={phase === "running" ? "Abandon exam" : "Close"}
          aria-label="Close exam mode"
          onClick={onClose}
        >
          <X size={15} />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
        {phase === "brief" && (
          <div className="lab-card max-w-lg text-center">
            <GraduationCap size={28} style={{ color: "var(--signal-blue)" }} className="mx-auto" />
            <h2 className="mt-2 text-xl">Timed assessment</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--ink-muted)" }}>
              {QUESTIONS} questions across up to six languages, {DURATION_S / 60} minutes, no hints.{" "}
              <strong>Socratic is offline for the duration</strong> — you get the tutor back with
              your report card, which breaks the result down per concept rather than into one
              number.
            </p>
            <button
              className="btn-primary mx-auto mt-5 inline-flex items-center gap-2"
              onClick={start}
            >
              <Play size={14} /> Begin exam
            </button>
          </div>
        )}

        {phase === "running" && current && (
          <div className="flex w-full max-w-xl flex-col items-center gap-6">
            <div className="lab-card w-full text-center">
              <div className="section-label">Language</div>
              <div className="mt-1 text-base font-semibold">{current.challenge.name}</div>
              <p className="mt-1 text-xs" style={{ color: "var(--ink-muted)" }}>
                {current.challenge.description}
              </p>
            </div>
            <div
              className="rounded-2xl border px-12 py-7 text-3xl tracking-[0.3em]"
              style={{
                fontFamily: "var(--font-mono-family)",
                borderColor: "var(--border-strong)",
                background: "var(--bg-panel)",
                boxShadow: "var(--shadow-panel)",
                color: "var(--ink-primary)",
              }}
            >
              {current.str === "" ? "ε" : current.str}
            </div>
            <div className="flex gap-4">
              <button
                className="btn-primary px-8 py-3 text-base"
                style={{ background: "var(--signal-cyan)" }}
                onClick={() => answer(true)}
              >
                ✓ In the language
              </button>
              <button
                className="btn-primary px-8 py-3 text-base"
                style={{ background: "var(--signal-rose)" }}
                onClick={() => answer(false)}
              >
                ✗ Not in the language
              </button>
            </div>
            <p className="text-[11px]" style={{ color: "var(--ink-disabled)" }}>
              No feedback until the exam ends.
            </p>
          </div>
        )}

        {phase === "report" && report && (
          <div className="lab-card w-full max-w-xl">
            <div className="text-center">
              <div className="text-3xl">
                {report.score / report.total >= 0.85
                  ? "🏆"
                  : report.score / report.total >= 0.6
                    ? "🌟"
                    : "📘"}
              </div>
              <h2 className="mt-1 text-xl">Report card</h2>
              <p className="mt-1 text-sm" style={{ color: "var(--ink-muted)" }}>
                {report.score} / {report.total} correct in{" "}
                {Math.max(1, Math.round(report.durationS / 60))} min across{" "}
                {report.languages.length} languages.
              </p>
            </div>

            <div className="mt-5 flex flex-col gap-3">
              <span className="section-label">Per-concept mastery</span>
              {report.concepts.map((c: ExamReport["concepts"][number]) => {
                const ratio = c.correct / c.total;
                const colour =
                  ratio >= 0.8
                    ? "var(--signal-cyan)"
                    : ratio >= 0.5
                      ? "var(--signal-amber)"
                      : "var(--signal-rose)";
                return (
                  <div key={c.concept}>
                    <div className="flex items-baseline justify-between text-xs">
                      <span>{c.concept}</span>
                      <span style={{ color: "var(--ink-muted)" }}>
                        {c.correct}/{c.total}
                      </span>
                    </div>
                    <div
                      className="mt-1 h-2 overflow-hidden rounded-full"
                      role="meter"
                      aria-label={`${c.concept} mastery`}
                      aria-valuenow={Math.round(ratio * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      style={{ background: "var(--signal-blue-10)" }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max(3, ratio * 100)}%`, background: colour }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="mt-4 text-xs" style={{ color: "var(--ink-muted)" }}>
              {weakest.length
                ? `Weakest ground: ${weakest.map((c: ExamReport["concepts"][number]) => c.concept).join(", ")}. Socratic is back online and can see this report — ask it what to drill next.`
                : "Solid across every concept in this set. Socratic is back online if you want a harder pack."}
            </p>

            <div className="mt-5 flex justify-center gap-2">
              <button className="btn-ghost" onClick={start}>
                New exam
              </button>
              <button className="btn-primary" onClick={onClose}>
                Back to the lab
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
