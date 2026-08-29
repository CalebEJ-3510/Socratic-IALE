import { useEffect, useState } from "react";
import { FIXED_CHALLENGES, type Challenge, type Difficulty } from "@/lib/engine/challenges";
import { Storage } from "@/lib/storage";

const GROUPS: Difficulty[] = ["Easy", "Medium", "Hard"];

export function ChallengePicker({
  activeId,
  onPick,
  extra,
  maskNames = false,
}: {
  activeId: string | null;
  onPick: (c: Challenge) => void;
  extra?: Challenge[];
  /** Discovery mode: never spoil the name of a language the learner hasn't solved yet. */
  maskNames?: boolean;
}) {
  const [open, setOpen] = useState<string | null>("Easy");
  const [ai, setAi] = useState<Challenge[]>([]);
  const [library, setLibrary] = useState<Challenge[]>([]);
  const [solvedIds, setSolvedIds] = useState<Set<string>>(new Set());

  const refresh = () => {
    setAi(Storage.getAIChallenges());
    setLibrary(Storage.getLibrary());
    setSolvedIds(
      new Set(Object.keys(Storage.getStats().solves).map((k) => k.split(":").slice(1).join(":"))),
    );
  };

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener("iale-ai-challenge-updated", handler);
    window.addEventListener("iale-library-updated", handler);
    window.addEventListener("iale-data-cleared", handler);
    window.addEventListener("iale-stats-updated", handler);
    return () => {
      window.removeEventListener("iale-ai-challenge-updated", handler);
      window.removeEventListener("iale-library-updated", handler);
      window.removeEventListener("iale-data-cleared", handler);
      window.removeEventListener("iale-stats-updated", handler);
    };
  }, []);

  const sections: { key: string; label: string; items: Challenge[] }[] = [
    ...GROUPS.map((g) => ({
      key: g,
      label: g,
      items: FIXED_CHALLENGES.filter((c) => c.difficulty === g),
    })),
    { key: "custom", label: "Custom / generated", items: extra ?? [] },
    { key: "library", label: `Library ${library.length}`, items: library },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="section-label">All challenges</div>
      {sections.map((s) => (
        <div
          key={s.key}
          className="overflow-hidden rounded-xl border"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <button
            className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold"
            onClick={() => setOpen((o) => (o === s.key ? null : s.key))}
            style={{ background: "color-mix(in srgb, var(--bg-panel-raised) 30%, transparent)" }}
          >
            <span>{s.label}</span>
            <span style={{ color: "var(--ink-disabled)" }}>{s.items.length}</span>
          </button>
          {open === s.key && (
            <div className="flex flex-col">
              {!s.items.length && (
                <div className="px-3 py-2 text-xs" style={{ color: "var(--ink-disabled)" }}>
                  Nothing here yet.
                </div>
              )}
              {s.items.map((c, i) => {
                const hidden = maskNames && !solvedIds.has(c.id);
                return (
                  <div key={c.id} className="flex items-center gap-1 px-2 py-1">
                    <button
                      className="flex-1 truncate rounded-lg px-2 py-1.5 text-left text-xs transition-colors"
                      onClick={() => onPick(c)}
                      title={hidden ? "Hidden until you solve it" : c.name}
                      style={{
                        background: activeId === c.id ? "var(--signal-blue-15)" : "transparent",
                        color: activeId === c.id ? "var(--ink-primary)" : "var(--ink-muted)",
                        fontFamily: hidden ? "var(--font-mono, monospace)" : undefined,
                      }}
                    >
                      {activeId === c.id ? "● " : ""}
                      {hidden ? `${s.label} #${i + 1} · locked` : c.name}
                    </button>
                    <button
                      className="tool-btn"
                      style={{ height: 26, minWidth: 26, padding: 0 }}
                      title={Storage.isInLibrary(c.id) ? "Saved to library" : "Save to library"}
                      onClick={() => {
                        Storage.saveToLibrary(c);
                        refresh();
                      }}
                    >
                      {Storage.isInLibrary(c.id) ? "✓" : "☆"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
      {!!ai.length && (
        <div className="lab-card">
          <div className="section-label mb-2">AI challenges {ai.length}</div>
          <div className="flex flex-col gap-1">
            {ai.map((c) => (
              <div key={c.id} className="flex items-center gap-1">
                <button className="flex-1 truncate text-left text-xs" onClick={() => onPick(c)}>
                  {c.name}
                </button>
                <button
                  className="tool-btn"
                  style={{ height: 24, minWidth: 24, padding: 0 }}
                  onClick={() => {
                    Storage.deleteAIChallenge(c.id);
                    refresh();
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
