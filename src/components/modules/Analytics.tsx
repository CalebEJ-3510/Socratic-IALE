import { useEffect, useState } from "react";
import { FIXED_CHALLENGES } from "@/lib/engine/challenges";
import { detectMisconceptions } from "@/lib/engine/algorithms";
import { Storage } from "@/lib/storage";
import { buildRecommendations } from "@/lib/engine/recommendations";
import { buildQueue, dueCards } from "@/lib/engine/spaced";
import { buildAnalyticsContext } from "@/lib/tutor/context";

const CATEGORY_LABEL: Record<string, string> = {
  transition: "Missing transitions",
  accept: "Wrong accepting status",
  crash: "Machine crashes mid-string",
  hint: "Hints requested",
  sink: "Missing sink/trap state",
};

export function Analytics({
  active,
  onContext,
  onGoto,
}: {
  active: boolean;
  onContext: (ctx: () => string) => void;
  onGoto: (tab: string) => void;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (active) setTick((t) => t + 1);
  }, [active]);
  useEffect(() => {
    const handler = () => setTick((t) => t + 1);
    window.addEventListener("iale-data-cleared", handler);
    return () => window.removeEventListener("iale-data-cleared", handler);
  }, []);

  const attempted = Storage.countAttemptedUnique();
  const solved = Storage.countSolvedUnique();
  const mistakes = Storage.getMistakeSummary().data;
  const max = Math.max(1, ...mistakes.map((m) => m.count));
  const recs = buildRecommendations(3);
  const misconceptions = detectMisconceptions(Storage.getAllMistakes());
  const queue = buildQueue();
  const due = dueCards();

  useEffect(() => {
    onContext(() =>
      buildAnalyticsContext({
        attempted,
        solved,
        topMistakes: mistakes.slice(0, 3).map((m) => m.category),
      }),
    );
  }, [onContext, attempted, solved, mistakes]);

  return (
    <div className="module-container" style={{ overflowY: "auto" }} key={tick}>
      <div className="mx-auto w-full max-w-[960px] p-6">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <h2 className="text-2xl">Learning analytics</h2>
          <div className="ml-auto flex gap-2">
            <button className="btn-ghost" onClick={() => window.print()}>
              Export report
            </button>
            <button
              className="btn-ghost"
              style={{ color: "var(--signal-rose)", borderColor: "rgba(244,63,94,0.4)" }}
              onClick={() => {
                if (confirm("Erase all local progress, saves and mistake logs?"))
                  Storage.clearAllData();
              }}
            >
              🗑 Reset all data
            </button>
            <button
              className="btn-ghost"
              style={{ color: "var(--signal-rose)", borderColor: "rgba(244,63,94,0.4)" }}
              title="Also wipes tutor API settings and theme"
              onClick={() => {
                if (confirm("Factory reset — erase progress, saves, tutor settings AND theme?")) {
                  Storage.clearAllWithSettings();
                  window.location.reload();
                }
              }}
            >
              Factory reset
            </button>
          </div>
        </div>

        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}
        >
          {[
            { label: "Challenges attempted", value: attempted },
            { label: "Challenges solved", value: solved },
            {
              label: "Top mistake",
              value: mistakes[0]
                ? (CATEGORY_LABEL[mistakes[0].category] ?? mistakes[0].category)
                : "—",
            },
          ].map((c) => (
            <div key={c.label} className="lab-card">
              <div className="section-label">{c.label}</div>
              <div
                className="mt-1 text-2xl"
                style={{ fontFamily: "var(--font-display-family)", color: "var(--signal-blue)" }}
              >
                {c.value}
              </div>
            </div>
          ))}
        </div>

        <div className="lab-card mt-4">
          <div className="section-label mb-3">Mistake profile</div>
          {!mistakes.length && (
            <p className="text-xs" style={{ color: "var(--ink-disabled)" }}>
              No mistakes logged yet — go break something in Discovery.
            </p>
          )}
          <div className="flex flex-col gap-2">
            {mistakes.map((m) => (
              <div key={m.category} className="flex items-center gap-3">
                <span className="w-[180px] shrink-0 text-xs" style={{ color: "var(--ink-muted)" }}>
                  {CATEGORY_LABEL[m.category] ?? m.category}
                </span>
                <div
                  className="h-2 flex-1 overflow-hidden rounded-full"
                  style={{ background: "var(--signal-blue-10)" }}
                >
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${(m.count / max) * 100}%`, background: "var(--signal-blue)" }}
                  />
                </div>
                <span
                  className="w-8 text-right text-xs"
                  style={{ fontFamily: "var(--font-mono-family)" }}
                >
                  {m.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {!!queue.length && (
          <div className="lab-card mt-4">
            <div className="section-label mb-3">
              Due for review {due.length ? `(${due.length})` : ""}
            </div>
            <div className="flex flex-col gap-2">
              {queue.map((c) => {
                const isDue = c.dueAt <= Date.now();
                return (
                  <div key={c.category} className="flex flex-wrap items-center gap-2">
                    <span className="badge" data-tone={isDue ? "amber" : "blue"}>
                      {isDue
                        ? c.overdueDays <= 0
                          ? "today"
                          : `${c.overdueDays}d overdue`
                        : `in ${Math.max(1, Math.ceil((c.dueAt - Date.now()) / 86400000))}d`}
                    </span>
                    <span className="text-xs">{c.label}</span>
                    <span className="text-[11px]" style={{ color: "var(--ink-disabled)" }}>
                      box {c.box + 1} · {c.mistakeCount} mistakes
                    </span>
                    <button
                      className="btn-ghost ml-auto text-xs"
                      onClick={() => {
                        window.dispatchEvent(
                          new CustomEvent("iale-load-challenge", {
                            detail: { id: c.challenge.id, category: c.category },
                          }),
                        );
                        onGoto("debugger");
                      }}
                    >
                      Drill now →
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!!misconceptions.length && (
          <div className="lab-card mt-4">
            <div className="section-label mb-2">Recurring misconceptions</div>
            <ul className="flex flex-col gap-2 text-xs" style={{ color: "var(--ink-muted)" }}>
              {misconceptions.map((m) => (
                <li key={m}>• {m}</li>
              ))}
            </ul>
            <button className="btn-primary mt-3" onClick={() => onGoto("debugger")}>
              Drill this in the Debugger
            </button>
          </div>
        )}

        {!!mistakes.length && (
          <div className="mt-4">
            <div className="section-label mb-3">Recommended next</div>
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}
            >
              {recs.map((r) => (
                <div key={`${r.reason}-${r.challenge.id}`} className="lab-card">
                  <div className="flex items-center justify-between">
                    <span
                      className="badge"
                      data-tone={
                        r.challenge.difficulty === "Hard"
                          ? "reject"
                          : r.challenge.difficulty === "Medium"
                            ? "amber"
                            : "accept"
                      }
                    >
                      {r.challenge.difficulty}
                    </span>
                  </div>
                  <div className="mt-2 text-sm font-semibold">{r.challenge.name}</div>
                  <p className="mt-1 text-xs" style={{ color: "var(--ink-muted)" }}>
                    {r.reason}
                  </p>
                  <button className="btn-ghost mt-3 text-xs" onClick={() => onGoto("discovery")}>
                    Try in Discovery →
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4">
          <div className="section-label mb-3">DFA zoo</div>
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))" }}
          >
            {FIXED_CHALLENGES.map((c) => (
              <div key={c.id} className="lab-card">
                <div className="flex items-center justify-between">
                  <span
                    className="badge"
                    data-tone={
                      c.difficulty === "Hard"
                        ? "reject"
                        : c.difficulty === "Medium"
                          ? "amber"
                          : "accept"
                    }
                  >
                    {c.difficulty}
                  </span>
                  <span
                    className="text-[10px]"
                    style={{ color: "var(--ink-disabled)", fontFamily: "var(--font-mono-family)" }}
                  >
                    {c.dfa.states.length} states
                  </span>
                </div>
                <div className="mt-2 text-sm font-semibold">{c.name}</div>
                <p className="mt-1 text-xs" style={{ color: "var(--ink-muted)" }}>
                  {c.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
