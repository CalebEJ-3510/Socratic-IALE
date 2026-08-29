/**
 * Screen-reader narration of the canvas.
 *
 * Reveal tier: safe in every module by construction. The narration is derived
 * only from the "Student machine:" block of the live module context — i.e. the
 * states and edges already drawn on screen — and never from a hidden target
 * language or a reference machine, neither of which appears in that block.
 */

const MACHINE = /Student machine: states \[(.*?)\]; edges \[(.*?)\]; alphabet \{(.*?)\}/;

export function narrateContext(context: string): string {
  const m = context.match(MACHINE);
  if (!m) return "The canvas is empty — there is nothing to describe yet.";

  const states = split(m[1] ?? "");
  const edges = m[2] === "none" ? [] : split(m[2] ?? "", ";");
  const alphabet = split(m[3] ?? "");

  const start = states.find((s) => s.includes("(start)"));
  const accepting = states.filter((s) => s.includes("(accept)"));
  const name = (s: string) => s.replace(/\((start|accept)\)/g, "").trim();

  const sentences = [
    `${states.length} ${states.length === 1 ? "state" : "states"} on the canvas: ${states.map(name).join(", ")}.`,
    start ? `The start state is ${name(start)}.` : "No start state is marked yet.",
    accepting.length
      ? `Accepting ${accepting.length === 1 ? "state" : "states"}: ${accepting.map(name).join(", ")}.`
      : "No accepting states yet.",
    `Alphabet: ${alphabet.join(", ") || "empty"}.`,
    edges.length
      ? `${edges.length} ${edges.length === 1 ? "transition" : "transitions"}: ${edges
          .map((e) => e.replace(/--(.*?)-->/, "on $1 goes to"))
          .join("; ")}.`
      : "No transitions drawn yet.",
  ];
  return sentences.join(" ");
}

function split(value: string, sep = ","): string[] {
  return value
    .split(sep)
    .map((s) => s.trim())
    .filter(Boolean);
}
