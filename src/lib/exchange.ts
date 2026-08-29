/**
 * Interchange formats for the app's own machines: Graphviz DOT, JFLAP (.jff),
 * LaTeX/TikZ and standalone SVG.
 *
 * Export is exact for all four. Import is deliberately scoped: JFLAP files are
 * parsed properly (the format is small and well specified), while DOT import
 * round-trips the shape this app emits — attribute-per-line digraphs with
 * `shape=doublecircle` finals and comma-separated edge labels. Arbitrary
 * hand-written DOT (subgraphs, clusters, HTML labels, default attribute
 * blocks) is out of scope and reported as such rather than silently mangled.
 */
import { layoutMachine, STATE_R, type Machine, type MachineTransition } from "./machine";

export interface ImportedMachine {
  machine: Machine;
  alphabet: string[];
}

export type ImportResult = { ok: true; data: ImportedMachine } | { ok: false; error: string };

const esc = (s: string) => s.replace(/"/g, '\\"');
const xmlEsc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const startOf = (m: Machine) => m.states.find((s) => s.isStart) ?? null;
const labelOf = (m: Machine, id: string) => m.states.find((s) => s.id === id)?.label ?? id;

/** Trigger a client-side download of a text payload. */
export function downloadText(filename: string, text: string, mime = "text/plain") {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 4000);
}

/* ------------------------------------------------------------------ DOT -- */

export function toDot(machine: Machine, name = "automaton"): string {
  const start = startOf(machine);
  const lines = [
    `digraph ${/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : "automaton"} {`,
    "  rankdir=LR;",
    '  node [shape=circle, fontname="Helvetica"];',
    '  edge [fontname="Helvetica"];',
    '  __start [shape=point, width=0.08, label=""];',
  ];
  for (const s of machine.states)
    lines.push(
      `  "${esc(s.label)}" [shape=${s.isAccepting ? "doublecircle" : "circle"}, pos="${Math.round(s.x)},${Math.round(-s.y)}"];`,
    );
  if (start) lines.push(`  __start -> "${esc(start.label)}";`);
  for (const t of machine.transitions)
    lines.push(
      `  "${esc(labelOf(machine, t.from))}" -> "${esc(labelOf(machine, t.to))}" [label="${esc(t.symbols.join(","))}"];`,
    );
  lines.push("}");
  return lines.join("\n");
}

export function fromDot(text: string): ImportResult {
  if (!/digraph/i.test(text)) return { ok: false, error: "That file is not a Graphviz digraph." };
  if (/\bsubgraph\b|\bcluster/i.test(text))
    return {
      ok: false,
      error: "Subgraphs and clusters aren't supported — import DOT exported by this app.",
    };

  const unquote = (s: string) =>
    s
      .trim()
      .replace(/^"(.*)"$/s, "$1")
      .replace(/\\"/g, '"');
  const states = new Map<string, { accepting: boolean; x?: number; y?: number }>();
  const edges: { from: string; to: string; symbols: string[] }[] = [];
  let startLabel: string | null = null;
  const seenOrder: string[] = [];

  const touch = (label: string) => {
    if (!states.has(label)) {
      states.set(label, { accepting: false });
      seenOrder.push(label);
    }
    return states.get(label)!;
  };

  const nodeName = String.raw`(?:"(?:[^"\\]|\\.)*"|[A-Za-z_][\w.]*)`;
  const edgeRe = new RegExp(
    `^\\s*(${nodeName})\\s*->\\s*(${nodeName})\\s*(\\[[^\\]]*\\])?\\s*;?\\s*$`,
  );
  const nodeRe = new RegExp(`^\\s*(${nodeName})\\s*(\\[[^\\]]*\\])\\s*;?\\s*$`);

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\/\/.*$/, "").trim();
    if (!line || /^(digraph|graph|}|\{|rankdir|node\b|edge\b|label\s*=)/i.test(line)) continue;

    const edge = edgeRe.exec(line);
    if (edge) {
      const from = unquote(edge[1]!);
      const to = unquote(edge[2]!);
      const attrs = edge[3] ?? "";
      if (/^__?start$/i.test(from) || /^(qi|start|init)$/i.test(from)) {
        startLabel = to;
        touch(to);
        continue;
      }
      touch(from);
      touch(to);
      const label = /label\s*=\s*("(?:[^"\\]|\\.)*"|[^,\]]+)/i.exec(attrs)?.[1];
      const symbols = label
        ? unquote(label)
            .split(/\s*,\s*/)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      const existing = edges.find((e) => e.from === from && e.to === to);
      if (existing) existing.symbols.push(...symbols.filter((s) => !existing.symbols.includes(s)));
      else edges.push({ from, to, symbols });
      continue;
    }

    const node = nodeRe.exec(line);
    if (node) {
      const label = unquote(node[1]!);
      if (/^__?start$/i.test(label)) continue;
      const attrs = node[2]!;
      const entry = touch(label);
      if (/shape\s*=\s*"?doublecircle/i.test(attrs)) entry.accepting = true;
      const pos = /pos\s*=\s*"(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)"/.exec(attrs);
      if (pos) {
        entry.x = Number(pos[1]);
        entry.y = -Number(pos[2]);
      }
    }
  }

  if (!states.size) return { ok: false, error: "No states found in that DOT file." };
  return { ok: true, data: build(seenOrder, states, edges, startLabel) };
}

/* ---------------------------------------------------------------- JFLAP -- */

export function toJflap(machine: Machine): string {
  const idx = new Map(machine.states.map((s, i) => [s.id, i]));
  const lines = [
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    "<structure>",
    "  <type>fa</type>",
    "  <automaton>",
  ];
  for (const s of machine.states) {
    lines.push(`    <state id="${idx.get(s.id)}" name="${xmlEsc(s.label)}">`);
    lines.push(`      <x>${Math.round(s.x)}</x>`);
    lines.push(`      <y>${Math.round(s.y)}</y>`);
    if (s.isStart) lines.push("      <initial/>");
    if (s.isAccepting) lines.push("      <final/>");
    lines.push("    </state>");
  }
  for (const t of machine.transitions)
    for (const sym of t.symbols) {
      lines.push("    <transition>");
      lines.push(`      <from>${idx.get(t.from)}</from>`);
      lines.push(`      <to>${idx.get(t.to)}</to>`);
      lines.push(`      <read>${xmlEsc(sym)}</read>`);
      lines.push("    </transition>");
    }
  lines.push("  </automaton>", "</structure>");
  return lines.join("\n");
}

export function fromJflap(xml: string): ImportResult {
  if (typeof window === "undefined" || !("DOMParser" in window))
    return { ok: false, error: "JFLAP import needs a browser." };
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, "application/xml");
  } catch {
    return { ok: false, error: "That .jff file could not be parsed." };
  }
  if (doc.querySelector("parsererror")) return { ok: false, error: "Malformed JFLAP XML." };
  const type = doc.querySelector("type")?.textContent?.trim();
  if (type && type !== "fa")
    return {
      ok: false,
      error: `JFLAP "${type}" machines aren't supported — finite automata only.`,
    };

  const nodes = [...doc.querySelectorAll("state, block")];
  if (!nodes.length) return { ok: false, error: "No states found in that JFLAP file." };

  const byId = new Map<string, string>();
  const states = new Map<string, { accepting: boolean; x?: number; y?: number }>();
  const order: string[] = [];
  let startLabel: string | null = null;

  nodes.forEach((el, i) => {
    const id = el.getAttribute("id") ?? String(i);
    const label = el.getAttribute("name") || `q${i}`;
    byId.set(id, label);
    order.push(label);
    const x = Number(el.querySelector("x")?.textContent);
    const y = Number(el.querySelector("y")?.textContent);
    states.set(label, {
      accepting: !!el.querySelector("final"),
      ...(Number.isFinite(x) ? { x } : {}),
      ...(Number.isFinite(y) ? { y } : {}),
    });
    if (el.querySelector("initial")) startLabel = label;
  });

  const edges: { from: string; to: string; symbols: string[] }[] = [];
  for (const t of doc.querySelectorAll("transition")) {
    const from = byId.get(t.querySelector("from")?.textContent?.trim() ?? "");
    const to = byId.get(t.querySelector("to")?.textContent?.trim() ?? "");
    if (!from || !to) continue;
    const sym = t.querySelector("read")?.textContent ?? "";
    const symbol = sym.trim() === "" ? "ε" : sym.trim();
    const existing = edges.find((e) => e.from === from && e.to === to);
    if (existing) {
      if (!existing.symbols.includes(symbol)) existing.symbols.push(symbol);
    } else edges.push({ from, to, symbols: [symbol] });
  }

  return { ok: true, data: build(order, states, edges, startLabel) };
}

/* --------------------------------------------------------- LaTeX / TikZ -- */

export function toTikz(machine: Machine): string {
  const scale = 0.028; // canvas px -> tikz cm
  const start = startOf(machine);
  const body: string[] = [];
  for (const s of machine.states) {
    const opts = ["state", s.isStart ? "initial" : null, s.isAccepting ? "accepting" : null].filter(
      Boolean,
    );
    body.push(
      `  \\node[${opts.join(",")}] (${safeTikz(s.label)}) at (${(s.x * scale).toFixed(2)},${(-s.y * scale).toFixed(2)}) {$${texLabel(s.label)}$};`,
    );
  }
  body.push("  \\path[->]");
  for (const t of machine.transitions) {
    const from = safeTikz(labelOf(machine, t.from));
    const to = safeTikz(labelOf(machine, t.to));
    const bend = t.from === t.to ? "loop above" : "bend left=15";
    body.push(`    (${from}) edge[${bend}] node{${t.symbols.join(",")}} (${to})`);
  }
  body.push("  ;");
  return [
    "% Requires: \\usepackage{tikz} \\usetikzlibrary{automata,positioning}",
    "\\begin{tikzpicture}[shorten >=1pt,node distance=2.4cm,on grid,auto]",
    ...body,
    "\\end{tikzpicture}",
  ].join("\n");
}

const safeTikz = (label: string) => label.replace(/[^A-Za-z0-9]/g, "_");
const texLabel = (label: string) => label.replace(/^([A-Za-z]+)(\d+)$/, "$1_{$2}");

/* ------------------------------------------------------------------ SVG -- */

/** Standalone, theme-independent SVG rendering built from machine data. */
export function toSvg(machine: Machine, width = 700, height = 420): string {
  const parts: string[] = [];
  const start = startOf(machine);
  for (const t of machine.transitions) {
    const a = machine.states.find((s) => s.id === t.from);
    const b = machine.states.find((s) => s.id === t.to);
    if (!a || !b) continue;
    if (a.id === b.id) {
      parts.push(
        `<path d="M ${a.x - 14} ${a.y - STATE_R + 4} C ${a.x - 54} ${a.y - 78}, ${a.x + 54} ${a.y - 78}, ${a.x + 14} ${a.y - STATE_R + 4}" fill="none" stroke="#334155" stroke-width="1.6" marker-end="url(#arrow)"/>`,
        `<text x="${a.x}" y="${a.y - 78}" text-anchor="middle" font-size="12" fill="#0f172a">${xmlEsc(t.symbols.join(","))}</text>`,
      );
      continue;
    }
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d;
    const uy = dy / d;
    const sx = a.x + ux * (STATE_R + 2);
    const sy = a.y + uy * (STATE_R + 2);
    const ex = b.x - ux * (STATE_R + 9);
    const ey = b.y - uy * (STATE_R + 9);
    parts.push(
      `<line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="#334155" stroke-width="1.6" marker-end="url(#arrow)"/>`,
      `<text x="${((sx + ex) / 2).toFixed(1)}" y="${((sy + ey) / 2 - 6).toFixed(1)}" text-anchor="middle" font-size="12" fill="#0f172a">${xmlEsc(t.symbols.join(","))}</text>`,
    );
  }
  for (const s of machine.states) {
    if (s.isAccepting)
      parts.push(
        `<circle cx="${s.x}" cy="${s.y}" r="${STATE_R - 5}" fill="none" stroke="#0f172a" stroke-width="1.4"/>`,
      );
    parts.push(
      `<circle cx="${s.x}" cy="${s.y}" r="${STATE_R}" fill="#ffffff" stroke="#0f172a" stroke-width="1.8"/>`,
      `<text x="${s.x}" y="${s.y + 4}" text-anchor="middle" font-size="13" font-family="monospace" fill="#0f172a">${xmlEsc(s.label)}</text>`,
    );
  }
  if (start)
    parts.push(
      `<line x1="${start.x - STATE_R - 34}" y1="${start.y}" x2="${start.x - STATE_R - 4}" y2="${start.y}" stroke="#0f172a" stroke-width="1.8" marker-end="url(#arrow)"/>`,
    );
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#334155"/></marker></defs>',
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    ...parts,
    "</svg>",
  ].join("\n");
}

/* -------------------------------------------------------------- shared -- */

function build(
  order: string[],
  states: Map<string, { accepting: boolean; x?: number; y?: number }>,
  edges: { from: string; to: string; symbols: string[] }[],
  startLabel: string | null,
): ImportedMachine {
  const hasPositions = [...states.values()].every((s) => s.x !== undefined && s.y !== undefined);
  const idOf = new Map<string, string>();
  const machineStates = order.map((label, i) => {
    const s = states.get(label)!;
    const id = `s${i + 1}`;
    idOf.set(label, id);
    return {
      id,
      label,
      x: s.x ?? 0,
      y: s.y ?? 0,
      isStart: startLabel ? label === startLabel : i === 0,
      isAccepting: s.accepting,
    };
  });
  const transitions: MachineTransition[] = edges.map((e, i) => ({
    id: `t${i + 1}`,
    from: idOf.get(e.from)!,
    to: idOf.get(e.to)!,
    symbols: e.symbols.length ? e.symbols : [""],
  }));
  const alphabet = [...new Set(edges.flatMap((e) => e.symbols))]
    .filter((s) => s && s !== "ε")
    .sort();
  const machine: Machine = { states: machineStates, transitions };
  return {
    machine: hasPositions ? machine : layoutMachine(machine),
    alphabet: alphabet.length ? alphabet : ["0", "1"],
  };
}

/** Dispatch an imported file to the right parser by extension/content sniffing. */
export function importMachineFile(filename: string, text: string): ImportResult {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".jff") || lower.endsWith(".xml") || /<structure[\s>]/i.test(text))
    return fromJflap(text);
  if (lower.endsWith(".dot") || lower.endsWith(".gv") || /digraph/i.test(text))
    return fromDot(text);
  return { ok: false, error: "Unrecognised file — expected .jff (JFLAP) or .dot (Graphviz)." };
}
