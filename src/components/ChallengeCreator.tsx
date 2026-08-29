import { useState } from "react";
import { toast } from "sonner";
import { Download, Play, X, Wrench } from "lucide-react";
import { challengeGenerator, type Challenge, type Difficulty } from "@/lib/engine/challenges";
import { Storage } from "@/lib/storage";

/**
 * Challenge Creator: students build their own hidden-language challenges from a
 * regex, preview the sample strings, download the challenge as .json, or load
 * it straight into Discovery.
 */
export function ChallengeCreator({
  defaultAlphabet,
  onClose,
  onLoad,
}: {
  defaultAlphabet: string[];
  onClose: () => void;
  onLoad: (ch: Challenge) => void;
}) {
  const [name, setName] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("Medium");
  const [alphabetRaw, setAlphabetRaw] = useState(defaultAlphabet.join(","));
  const [regex, setRegex] = useState("");
  const [built, setBuilt] = useState<Challenge | null>(null);
  const [error, setError] = useState<string | null>(null);

  const build = () => {
    const alphabet = [
      ...new Set(
        alphabetRaw
          .split(/[,\s]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ];
    if (!alphabet.length) {
      setError("Give at least one alphabet symbol.");
      return;
    }
    if (!regex.trim()) {
      setError("Enter a regex for the hidden language.");
      return;
    }
    const ch = challengeGenerator.fromRegex(regex.trim(), alphabet, {
      name: name.trim() || `Custom: ${regex.trim()}`,
      difficulty,
      description: `Student-built language: ${regex.trim()}`,
    });
    if (!ch) {
      setBuilt(null);
      setError("That pattern doesn't parse over this alphabet.");
      return;
    }
    setError(null);
    setBuilt(ch);
  };

  const download = () => {
    if (!built) return;
    const payload = {
      id: built.id,
      name: built.name,
      difficulty: built.difficulty,
      alphabet: built.alphabet,
      description: built.description,
      dfa: built.dfa.toJSON(),
      hints: built.hints ?? [],
      source: "regex",
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${
      built.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "challenge"
    }.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-[700] flex items-center justify-center p-4"
      style={{ background: "var(--overlay-scrim)" }}
      role="dialog"
      aria-label="Challenge creator"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-[700px] rounded-2xl border p-5"
        style={{
          background: "var(--bg-panel)",
          borderColor: "var(--border-strong)",
          boxShadow: "var(--shadow-panel)",
        }}
      >
        <div className="flex items-center gap-2">
          <Wrench size={16} style={{ color: "var(--signal-blue)" }} />
          <h2 className="text-lg">Challenge creator</h2>
          <button className="tool-btn ml-auto" title="Close" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        <div className="mt-4 grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="flex flex-col gap-3">
            <div>
              <label className="section-label">Name</label>
              <input
                className="field-input"
                placeholder="Ends with 01"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="section-label">Difficulty</label>
              <select
                className="field-input"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              >
                <option>Easy</option>
                <option>Medium</option>
                <option>Hard</option>
              </select>
            </div>
            <div>
              <label className="section-label">Alphabet (comma-separated)</label>
              <input
                className="field-input"
                value={alphabetRaw}
                onChange={(e) => setAlphabetRaw(e.target.value)}
              />
            </div>
            <div>
              <label className="section-label">Hidden language (regex)</label>
              <input
                className="field-input"
                placeholder="(0|1)*01"
                value={regex}
                onChange={(e) => setRegex(e.target.value)}
                style={{ fontFamily: "var(--font-mono-family)" }}
              />
            </div>
            <button className="btn-primary mt-1" onClick={build}>
              Build & preview
            </button>
            {error && (
              <p className="text-[11.5px]" style={{ color: "var(--signal-rose)" }}>
                {error}
              </p>
            )}
          </div>

          <div
            className="rounded-xl border p-3"
            style={{ borderColor: "var(--border-subtle)", background: "var(--bg-panel-raised)" }}
          >
            <div className="section-label mb-2">Preview</div>
            {!built ? (
              <p className="text-xs" style={{ color: "var(--ink-disabled)" }}>
                Build the DFA to preview the strings it accepts and rejects.
              </p>
            ) : (
              <>
                <div className="text-sm font-semibold">{built.name}</div>
                <p className="mt-0.5 text-[11px]" style={{ color: "var(--ink-muted)" }}>
                  {built.dfa.states.length} states · Σ = {"{"}
                  {built.alphabet.join(",")}
                  {"}"}
                </p>
                <div className="mt-3 flex flex-col gap-1">
                  {built.initialExamples.accepted.slice(0, 3).map((s) => (
                    <div key={`a-${s}`} className="tape-row" data-verdict="accept">
                      <span>{s === "" ? "ε" : s}</span>
                      <span style={{ color: "var(--signal-cyan)" }}>✓ accept</span>
                    </div>
                  ))}
                  {built.initialExamples.rejected.slice(0, 3).map((s) => (
                    <div key={`r-${s}`} className="tape-row" data-verdict="reject">
                      <span>{s === "" ? "ε" : s}</span>
                      <span style={{ color: "var(--signal-rose)" }}>✗ reject</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="btn-ghost inline-flex items-center gap-1.5" onClick={download}>
                    <Download size={13} /> Download .json
                  </button>
                  <button
                    className="btn-primary inline-flex items-center gap-1.5"
                    onClick={() => {
                      Storage.saveAIChallenge(built);
                      onLoad(built);
                      toast.success("Challenge loaded into Discovery", { description: built.name });
                      onClose();
                    }}
                  >
                    <Play size={13} /> Load into Discovery
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
