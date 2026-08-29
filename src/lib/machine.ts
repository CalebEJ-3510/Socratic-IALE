import { useCallback, useMemo, useRef, useState } from "react";
import { DFA, type TransitionMap } from "./engine/dfa";
import type { PositionMap } from "./storage";

export interface MachineState {
  id: string;
  label: string;
  x: number;
  y: number;
  isStart: boolean;
  isAccepting: boolean;
}
export interface MachineTransition {
  id: string;
  from: string;
  to: string;
  symbols: string[];
}
export interface Machine {
  states: MachineState[];
  transitions: MachineTransition[];
}

export const CANVAS_W = 700;
export const CANVAS_H = 420;
export const STATE_R = 28;

export const emptyMachine = (): Machine => ({ states: [], transitions: [] });

export function starterMachine(): Machine {
  return {
    states: [{ id: "s1", label: "q0", x: 160, y: 210, isStart: true, isAccepting: false }],
    transitions: [],
  };
}

export function machineToDFA(machine: Machine, alphabet: string[]): DFA {
  const label = (id: string) => machine.states.find((s) => s.id === id)?.label ?? id;
  const transitions: TransitionMap = {};
  for (const s of machine.states) transitions[s.label] = {};
  for (const t of machine.transitions) {
    const from = label(t.from);
    transitions[from] = transitions[from] ?? {};
    for (const sym of t.symbols) transitions[from][sym] = label(t.to);
  }
  return new DFA({
    states: machine.states.map((s) => s.label),
    alphabet,
    transitions,
    startState: machine.states.find((s) => s.isStart)?.label ?? null,
    acceptStates: machine.states.filter((s) => s.isAccepting).map((s) => s.label),
  });
}

const PAD = STATE_R + 12;
const clampX = (x: number) => Math.max(PAD, Math.min(CANVAS_W - PAD, x));
const clampY = (y: number) => Math.max(PAD, Math.min(CANVAS_H - PAD, y));

/**
 * Layered (Sugiyama-flavoured) seeding plus a force-directed refinement pass.
 *
 * Machines arriving from imports (DOT / JFLAP / packs / share links) carry no
 * coordinates at all, so the seed matters: BFS ranks from the start state give
 * a left-to-right reading order, barycentre ordering inside each rank reduces
 * crossings, and the spring/repulsion relaxation then evens out the spacing
 * without destroying that reading order.
 */
export function layoutMachine(machine: Machine): Machine {
  const n = machine.states.length;
  if (!n) return machine;
  const states = machine.states.map((s) => ({ ...s }));
  if (n === 1) {
    const only = states[0]!;
    return { ...machine, states: [{ ...only, x: CANVAS_W / 2, y: CANVAS_H / 2 }] };
  }

  const index = new Map(states.map((s, i) => [s.id, i]));
  const out: number[][] = states.map(() => []);
  const neighbours: number[][] = states.map(() => []);
  for (const t of machine.transitions) {
    const a = index.get(t.from);
    const b = index.get(t.to);
    if (a === undefined || b === undefined || a === b) continue;
    out[a]!.push(b);
    neighbours[a]!.push(b);
    neighbours[b]!.push(a);
  }

  // ---- 1. layer assignment: BFS from the start state ----
  const rank = new Array<number>(n).fill(-1);
  const startIdx = states.findIndex((s) => s.isStart);
  const roots = startIdx >= 0 ? [startIdx] : [0];
  let queue = roots.slice();
  roots.forEach((r) => (rank[r] = 0));
  while (queue.length) {
    const next: number[] = [];
    for (const i of queue)
      for (const j of out[i]!)
        if (rank[j] === -1) {
          rank[j] = rank[i]! + 1;
          next.push(j);
        }
    queue = next;
  }
  // Disconnected states get their own trailing columns rather than piling up.
  let maxRank = Math.max(0, ...rank);
  for (let i = 0; i < n; i++) if (rank[i] === -1) rank[i] = ++maxRank;

  const layers = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = rank[i]!;
    layers.set(r, [...(layers.get(r) ?? []), i]);
  }

  // ---- 2. seed coordinates, ordering each layer by its predecessors' barycentre ----
  const cols = maxRank + 1;
  const colW = (CANVAS_W - 2 * PAD) / Math.max(1, cols - 1 || 1);
  const order = new Map<number, number>();
  for (let r = 0; r <= maxRank; r++) {
    const layer = (layers.get(r) ?? []).slice();
    layer.sort((a, b) => bary(a) - bary(b));
    layer.forEach((i, k) => order.set(i, k));
    const count = layer.length;
    layer.forEach((i, k) => {
      const s = states[i]!;
      s.x = clampX(cols === 1 ? CANVAS_W / 2 : PAD + r * colW);
      s.y = clampY(((k + 1) / (count + 1)) * CANVAS_H);
    });
  }
  function bary(i: number): number {
    const prev = neighbours[i]!.filter((j) => rank[j]! < rank[i]!);
    if (!prev.length) return i;
    return prev.reduce((acc, j) => acc + (order.get(j) ?? j), 0) / prev.length;
  }

  // ---- 3. force-directed relaxation (springs on edges, repulsion everywhere) ----
  const ideal = STATE_R * 3.2;
  const minD = STATE_R * 2 + 26;
  const anchorX = states.map((s) => s.x);
  for (let iter = 0; iter < 220; iter++) {
    const cooling = 1 - iter / 220;
    const fx = new Array<number>(n).fill(0);
    const fy = new Array<number>(n).fill(0);

    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const a = states[i]!;
        const b = states[j]!;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d < 0.01) {
          dx = (i - j) * 0.5 + 0.1;
          dy = 0.7;
          d = Math.hypot(dx, dy);
        }
        const rep = (minD * minD * 1.4) / (d * d);
        fx[i]! -= (dx / d) * rep;
        fy[i]! -= (dy / d) * rep;
        fx[j]! += (dx / d) * rep;
        fy[j]! += (dy / d) * rep;
      }

    for (const t of machine.transitions) {
      const i = index.get(t.from);
      const j = index.get(t.to);
      if (i === undefined || j === undefined || i === j) continue;
      const a = states[i]!;
      const b = states[j]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.01;
      const spring = (d - ideal) * 0.06;
      fx[i]! += (dx / d) * spring;
      fy[i]! += (dy / d) * spring;
      fx[j]! -= (dx / d) * spring;
      fy[j]! -= (dy / d) * spring;
    }

    for (let i = 0; i < n; i++) {
      const s = states[i]!;
      // Keep the layered columns readable: x is pulled back to its rank.
      fx[i]! += (anchorX[i]! - s.x) * 0.22;
      const step = 6 * cooling + 0.5;
      s.x = clampX(s.x + Math.max(-step, Math.min(step, fx[i]!)));
      s.y = clampY(s.y + Math.max(-step, Math.min(step, fy[i]!)));
    }
  }

  // ---- 4. final hard de-overlap ----
  for (let pass = 0; pass < 4; pass++)
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const a = states[i]!;
        const b = states[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.01;
        if (d < minD) {
          const push = (minD - d) / 2;
          const ux = dx / d;
          const uy = dy / d;
          a.x = clampX(a.x - ux * push);
          a.y = clampY(a.y - uy * push);
          b.x = clampX(b.x + ux * push);
          b.y = clampY(b.y + uy * push);
        }
      }

  return { ...machine, states };
}

export function dfaToMachine(dfa: DFA, positions?: PositionMap): Machine {
  const states: MachineState[] = dfa.states.map((label, i) => ({
    id: `s${i + 1}`,
    label,
    x: positions?.[label]?.x ?? 0,
    y: positions?.[label]?.y ?? 0,
    isStart: dfa.startState === label,
    isAccepting: dfa.acceptStates.includes(label),
  }));
  const idOf = (label: string) => states.find((s) => s.label === label)?.id ?? label;
  const edges = new Map<string, MachineTransition>();
  let n = 0;
  for (const [from, row] of Object.entries(dfa.transitions)) {
    for (const [sym, to] of Object.entries(row)) {
      if (!states.some((s) => s.label === to)) continue;
      const key = `${from}->${to}`;
      if (!edges.has(key))
        edges.set(key, { id: `t${++n}`, from: idOf(from), to: idOf(to), symbols: [] });
      const edge = edges.get(key)!;
      if (!edge.symbols.includes(sym)) edge.symbols.push(sym);
    }
  }
  const machine: Machine = { states, transitions: [...edges.values()] };
  return positions && Object.keys(positions).length ? machine : layoutMachine(machine);
}

export function positionsOf(machine: Machine): PositionMap {
  return Object.fromEntries(machine.states.map((s) => [s.label, { x: s.x, y: s.y }]));
}

/** Editable machine with 50-step undo/redo history. */
export function useMachine(initial: Machine = starterMachine()) {
  const [machine, setMachine] = useState<Machine>(initial);
  const past = useRef<Machine[]>([]);
  const future = useRef<Machine[]>([]);
  const [version, setVersion] = useState(0);

  const commit = useCallback((next: Machine | ((prev: Machine) => Machine)) => {
    setMachine((prev) => {
      past.current = [...past.current, prev].slice(-50);
      future.current = [];
      setVersion((v) => v + 1);
      return typeof next === "function" ? (next as (p: Machine) => Machine)(prev) : next;
    });
  }, []);

  /** Update without creating a history entry (e.g. every frame of a drag). */
  const set = useCallback((next: Machine | ((prev: Machine) => Machine)) => {
    setMachine((prev) =>
      typeof next === "function" ? (next as (p: Machine) => Machine)(prev) : next,
    );
  }, []);

  const replace = useCallback((next: Machine) => {
    past.current = [];
    future.current = [];
    setVersion((v) => v + 1);
    setMachine(next);
  }, []);

  const undo = useCallback(() => {
    setMachine((prev) => {
      const p = past.current.pop();
      if (!p) return prev;
      future.current = [...future.current, prev].slice(-50);
      setVersion((v) => v + 1);
      return p;
    });
  }, []);

  const redo = useCallback(() => {
    setMachine((prev) => {
      const f = future.current.pop();
      if (!f) return prev;
      past.current = [...past.current, prev].slice(-50);
      setVersion((v) => v + 1);
      return f;
    });
  }, []);

  const flags = useMemo(
    () => ({ canUndo: past.current.length > 0, canRedo: future.current.length > 0 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  );

  return { machine, commit, set, replace, undo, redo, ...flags };
}
