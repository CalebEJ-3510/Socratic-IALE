import { useCallback, useEffect, useRef, useState } from "react";
import {
  CANVAS_H,
  CANVAS_W,
  STATE_R,
  type Machine,
  type MachineState,
  type MachineTransition,
} from "@/lib/machine";
import { checkTransitionConflict } from "@/lib/engine/validate";
import { exportSvgToPng } from "@/lib/svg-export";
import { ZoomIn, ZoomOut, Maximize2, Download } from "lucide-react";

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 3;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export type CanvasMode = "pointer" | "state" | "transition" | "delete";
export type HighlightTone = "blue" | "cyan" | "rose" | "amber";

const TONE_VAR: Record<HighlightTone, string> = {
  blue: "var(--signal-blue)",
  cyan: "var(--signal-cyan)",
  rose: "var(--signal-rose)",
  amber: "var(--signal-amber)",
};

interface Props {
  machine: Machine;
  onChange?: (next: Machine | ((prev: Machine) => Machine)) => void;
  editable?: boolean;
  alphabet: string[];
  allowNondet?: boolean;
  allowEpsilon?: boolean;
  mode?: CanvasMode;
  highlights?: Record<string, HighlightTone>;
  activeTransition?: { from: string; to: string } | null;
  /** Update without pushing an undo entry — used for every frame of a drag. */
  onTransientChange?: (next: Machine | ((prev: Machine) => Machine)) => void;
  /** Base filename for the PNG export. */
  exportName?: string;
  /** Tutor: grey out every edge that is not on this symbol. */
  isolateSymbol?: string | null;
  /** Tutor: small "?" markers on these state labels. */
  annotations?: string[];
  /** Tutor: emphasise one specific edge (by state labels). */
  highlightTransition?: { from: string; to: string; color?: HighlightTone } | null;
}

interface PendingEdge {
  from: string;
  to: string;
  symbols: string[];
  existingId: string | null;
  x: number;
  y: number;
}

function edgeGeometry(a: MachineState, b: MachineState, curved: boolean) {
  if (a.id === b.id) {
    return {
      path: `M ${a.x - 14} ${a.y - STATE_R + 4} C ${a.x - 54} ${a.y - 78}, ${a.x + 54} ${a.y - 78}, ${a.x + 14} ${a.y - STATE_R + 4}`,
      labelX: a.x,
      labelY: a.y - 74,
    };
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
  if (!curved) {
    // Label sits ON the line (the paint-order halo punches a gap through it).
    return {
      path: `M ${sx} ${sy} L ${ex} ${ey}`,
      labelX: (sx + ex) / 2,
      labelY: (sy + ey) / 2 + 4.5,
    };
  }
  const bend = 42;
  const mx = (sx + ex) / 2 - uy * bend;
  const my = (sy + ey) / 2 + ux * bend;
  // Quadratic midpoint = average of endpoints and control point — again, on the curve.
  return {
    path: `M ${sx} ${sy} Q ${mx} ${my} ${ex} ${ey}`,
    labelX: (sx + ex + 2 * mx) / 4,
    labelY: (sy + ey + 2 * my) / 4 + 4.5,
  };
}

export function DFACanvas({
  machine,
  onChange,
  editable = true,
  alphabet,
  allowNondet = false,
  allowEpsilon = false,
  mode = "pointer",
  highlights = {},
  activeTransition = null,
  onTransientChange,
  exportName = "automaton",
  isolateSymbol = null,
  annotations = [],
  highlightTransition = null,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const worldRef = useRef<SVGGElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [transFrom, setTransFrom] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const [pending, setPending] = useState<PendingEdge | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const [panning, setPanning] = useState<{ px: number; py: number } | null>(null);

  const drag = onTransientChange ?? onChange;
  const symbolChoices = allowEpsilon ? [...alphabet, "ε"] : alphabet;

  /** Screen point -> canvas (world) coordinates, accounting for viewBox, pan and zoom. */
  const toLocal = useCallback((e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    const world = worldRef.current;
    if (!svg) return { x: 0, y: 0 };
    const ctm = world?.getScreenCTM();
    if (ctm) {
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const p = pt.matrixTransform(ctm.inverse());
      return { x: p.x, y: p.y };
    }
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_H,
    };
  }, []);

  /** Screen point -> untransformed viewBox coordinates (for pan maths + popovers). */
  const toViewBox = useCallback((e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  /** World point -> percentage of the viewBox, so HTML popovers track the canvas. */
  const toPct = useCallback(
    (x: number, y: number) => ({
      left: ((view.x + x * view.zoom) / CANVAS_W) * 100,
      top: ((view.y + y * view.zoom) / CANVAS_H) * 100,
    }),
    [view],
  );

  const zoomAt = useCallback((factor: number, anchor?: { x: number; y: number }) => {
    setView((v) => {
      const next = clampZoom(v.zoom * factor);
      if (next === v.zoom) return v;
      const ax = anchor?.x ?? CANVAS_W / 2;
      const ay = anchor?.y ?? CANVAS_H / 2;
      const k = next / v.zoom;
      return { zoom: next, x: ax - (ax - v.x) * k, y: ay - (ay - v.y) * k };
    });
  }, []);

  const resetView = useCallback(() => setView({ zoom: 1, x: 0, y: 0 }), []);

  // Non-passive wheel listener: React's onWheel is passive, so preventDefault is ignored there.
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
  wheelRef.current = (e: WheelEvent) => {
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
    zoomAt(Math.exp(-dy * 0.0018), toViewBox(e));
  };
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      wheelRef.current(e);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  // Any tool switch must drop in-progress interaction state, otherwise the
  // dangling transition ghost keeps following the cursor in other modes.
  useEffect(() => {
    setTransFrom(null);
    setGhost(null);
    setPending(null);
    setMenu(null);
    setRenaming(null);
    setConfirmDelete(null);
    setDragging(null);
    setPanning(null);
  }, [mode, editable]);

  const hitState = useCallback(
    (x: number, y: number) =>
      machine.states.find((s) => Math.hypot(s.x - x, s.y - y) <= STATE_R + 4) ?? null,
    [machine.states],
  );

  /** Nearest transition within a grab radius, so edges can be selected/deleted too. */
  const hitTransition = useCallback(
    (x: number, y: number) => {
      let best: { t: MachineTransition; d: number } | null = null;
      for (const t of machine.transitions) {
        const a = machine.states.find((s) => s.id === t.from);
        const b = machine.states.find((s) => s.id === t.to);
        if (!a || !b) continue;
        const curved = machine.transitions.some(
          (o) => o.from === t.to && o.to === t.from && o.id !== t.id,
        );
        const g = edgeGeometry(a, b, curved);
        let d = Math.hypot(g.labelX - x, g.labelY - y);
        if (a.id !== b.id) {
          // point-to-segment distance along the state-centre line
          const vx = b.x - a.x;
          const vy = b.y - a.y;
          const len2 = vx * vx + vy * vy || 1;
          const tt = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / len2));
          const px = a.x + tt * vx;
          const py = a.y + tt * vy;
          d = Math.min(d, Math.hypot(px - x, py - y) + (curved ? 22 : 0));
        }
        if (d <= 16 && (!best || d < best.d)) best = { t, d };
      }
      return best?.t ?? null;
    },
    [machine],
  );

  const deleteTransition = useCallback(
    (id: string) => {
      onChange?.((prev) => ({ ...prev, transitions: prev.transitions.filter((t) => t.id !== id) }));
      setSelectedEdge(null);
    },
    [onChange],
  );

  const nextLabel = useCallback(() => {
    let i = 0;
    const used = new Set(machine.states.map((s) => s.label));
    while (used.has(`q${i}`)) i++;
    return `q${i}`;
  }, [machine.states]);

  const addStateAt = (x: number, y: number) => {
    onChange?.((prev) => {
      const id = `s${Date.now().toString(36)}${Math.floor(Math.random() * 999)}`;
      const label = nextLabel();
      return {
        ...prev,
        states: [
          ...prev.states,
          {
            id,
            label,
            x: Math.max(STATE_R + 6, Math.min(CANVAS_W - STATE_R - 6, x)),
            y: Math.max(STATE_R + 6, Math.min(CANVAS_H - STATE_R - 6, y)),
            isStart: prev.states.length === 0,
            isAccepting: false,
          },
        ],
      };
    });
  };

  const deleteState = (id: string) => {
    onChange?.((prev) => {
      const states = prev.states.filter((s) => s.id !== id);
      const first = states[0];
      if (first && !states.some((s) => s.isStart)) states[0] = { ...first, isStart: true };
      return { states, transitions: prev.transitions.filter((t) => t.from !== id && t.to !== id) };
    });
    setSelected(null);
    setConfirmDelete(null);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    setMenu(null);
    const { x, y } = toLocal(e);
    const hit = hitState(x, y);
    // Middle button, or space/shift + drag, pans from anywhere.
    if (e.button === 1 || e.shiftKey) {
      const vb = toViewBox(e);
      setPanning({ px: vb.x - view.x, py: vb.y - view.y });
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    if (!editable) {
      setSelected(hit?.id ?? null);
      return;
    }
    if (mode === "state") {
      if (!hit) addStateAt(x, y);
      return;
    }
    if (mode === "delete") {
      if (hit) {
        if (confirmDelete === hit.id) deleteState(hit.id);
        else {
          setConfirmDelete(hit.id);
          window.setTimeout(() => setConfirmDelete((c) => (c === hit.id ? null : c)), 3000);
        }
        return;
      }
      const edge = hitTransition(x, y);
      if (edge) deleteTransition(edge.id);
      return;
    }
    if (mode === "transition") {
      if (!hit) {
        setTransFrom(null);
        setGhost(null);
        return;
      }
      if (!transFrom) {
        setTransFrom(hit.id);
        setGhost({ x, y });
        return;
      }
      const existing =
        machine.transitions.find((t) => t.from === transFrom && t.to === hit.id) ?? null;
      setPending({
        from: transFrom,
        to: hit.id,
        symbols: existing ? [...existing.symbols] : [],
        existingId: existing?.id ?? null,
        x: hit.x,
        y: hit.y,
      });
      setTransFrom(null);
      setGhost(null);
      return;
    }
    // pointer: select + drag only, never creates
    if (hit) {
      setSelected(hit.id);
      setSelectedEdge(null);
      setDragging(hit.id);
      if (onTransientChange) onChange?.((prev) => prev); // one undo entry per drag

      (e.target as Element).setPointerCapture?.(e.pointerId);
    } else {
      setSelected(null);
      const edge = hitTransition(x, y);
      setSelectedEdge(edge?.id ?? null);
      if (edge) return;
      // Empty-space drag pans the canvas.
      const vb = toViewBox(e);
      setPanning({ px: vb.x - view.x, py: vb.y - view.y });
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (panning) {
      const vb = toViewBox(e);
      setView((v) => ({ ...v, x: vb.x - panning.px, y: vb.y - panning.py }));
      return;
    }
    const { x, y } = toLocal(e);
    if (mode === "transition" && transFrom) setGhost({ x, y });
    if (!dragging || !editable) return;
    drag?.((prev) => ({
      ...prev,
      states: prev.states.map((s) =>
        s.id === dragging
          ? {
              ...s,
              x: Math.max(STATE_R + 4, Math.min(CANVAS_W - STATE_R - 4, x)),
              y: Math.max(STATE_R + 4, Math.min(CANVAS_H - STATE_R - 4, y)),
            }
          : s,
      ),
    }));
  };

  const onPointerUp = () => {
    setDragging(null);
    setPanning(null);
  };

  const applyPending = () => {
    if (!pending) return;
    onChange?.((prev) => {
      const others = prev.transitions.filter((t) => t.id !== pending.existingId);
      if (!pending.symbols.length) return { ...prev, transitions: others };
      const edge: MachineTransition = {
        id: pending.existingId ?? `t${Date.now().toString(36)}`,
        from: pending.from,
        to: pending.to,
        symbols: [...pending.symbols],
      };
      return { ...prev, transitions: [...others, edge] };
    });
    setPending(null);
  };

  const toggleSymbol = (sym: string) => {
    setPending((p) =>
      p
        ? {
            ...p,
            symbols: p.symbols.includes(sym)
              ? p.symbols.filter((s) => s !== sym)
              : [...p.symbols, sym],
          }
        : p,
    );
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (e.key === "Escape") {
        setPending(null);
        setMenu(null);
        setTransFrom(null);
        setRenaming(null);
      }
      if (e.key === "Escape") setSelectedEdge(null);
      if ((e.key === "Delete" || e.key === "Backspace") && editable) {
        if (selectedEdge) deleteTransition(selectedEdge);
        else if (selected) deleteState(selected);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, selectedEdge, editable, deleteTransition]);

  const byId = (id: string) => machine.states.find((s) => s.id === id);
  const existingEdges = machine.transitions.map((t) => ({
    from: t.from,
    to: t.to,
    symbols: t.symbols,
  }));

  return (
    <div className="canvas-surface" onContextMenu={(e) => e.preventDefault()}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full touch-none select-none"
        style={{
          cursor: panning
            ? "grabbing"
            : mode === "state"
              ? "copy"
              : mode === "delete"
                ? "not-allowed"
                : mode === "transition"
                  ? "crosshair"
                  : "default",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(e) => {
          if (!editable) return;
          const { x, y } = toLocal(e);
          const hit = hitState(x, y);
          if (hit)
            onChange?.((prev) => ({
              ...prev,
              states: prev.states.map((s) =>
                s.id === hit.id ? { ...s, isAccepting: !s.isAccepting } : s,
              ),
            }));
          else addStateAt(x, y);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (!editable) return;
          const { x, y } = toLocal(e);
          const hit = hitState(x, y);
          if (hit) setMenu({ id: hit.id, x: hit.x, y: hit.y });
        }}
      >
        <defs>
          <pattern id="lab-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1.2" cy="1.2" r="1.2" fill="var(--grid-line)" />
          </pattern>
          <marker
            id="arr"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--border-strong)" />
          </marker>
          <marker
            id="arr-hl"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--signal-blue)" />
          </marker>
          <filter id="state-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect width={CANVAS_W} height={CANVAS_H} fill="url(#lab-grid)" />

        <g ref={worldRef} transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
          {mode === "transition" && transFrom && ghost && byId(transFrom) && (
            <line
              x1={byId(transFrom)!.x}
              y1={byId(transFrom)!.y}
              x2={ghost.x}
              y2={ghost.y}
              stroke="var(--signal-blue)"
              strokeWidth="2"
              strokeDasharray="6 5"
              opacity="0.8"
            />
          )}

          {machine.transitions.map((t) => {
            const a = byId(t.from);
            const b = byId(t.to);
            if (!a || !b) return null;
            const hasReverse = machine.transitions.some(
              (o) => o.from === t.to && o.to === t.from && o.id !== t.id,
            );
            const g = edgeGeometry(a, b, hasReverse);
            const active =
              (activeTransition &&
                a.label === activeTransition.from &&
                b.label === activeTransition.to) ||
              (highlightTransition &&
                a.label === highlightTransition.from &&
                b.label === highlightTransition.to);
            const isSelEdge = selectedEdge === t.id;
            const dimmed = !!isolateSymbol && !t.symbols.includes(isolateSymbol);
            const tone = active
              ? highlightTransition?.color
                ? TONE_VAR[highlightTransition.color]
                : "var(--signal-blue)"
              : isSelEdge
                ? "var(--signal-amber)"
                : "var(--border-strong)";
            return (
              <g key={t.id} opacity={dimmed ? 0.18 : 1}>
                <path
                  d={g.path}
                  fill="none"
                  stroke={tone}
                  strokeWidth={active || isSelEdge ? 3 : 2}
                  markerEnd={active ? "url(#arr-hl)" : "url(#arr)"}
                  opacity={active ? 1 : 0.85}
                />
                <text
                  x={g.labelX}
                  y={g.labelY}
                  textAnchor="middle"
                  fontFamily="var(--font-mono-family)"
                  fontSize="13"
                  fill={
                    active
                      ? "var(--signal-blue)"
                      : isSelEdge
                        ? "var(--signal-amber)"
                        : "var(--ink-primary)"
                  }
                  style={{ paintOrder: "stroke", stroke: "var(--bg-canvas)", strokeWidth: 6 }}
                >
                  {isolateSymbol
                    ? t.symbols.filter((s) => s === isolateSymbol).join(",") || t.symbols.join(",")
                    : t.symbols.join(",")}
                </text>
                {isSelEdge && editable && (
                  <text
                    x={g.labelX}
                    y={g.labelY + 16}
                    textAnchor="middle"
                    fontSize="9.5"
                    fill="var(--signal-amber)"
                  >
                    press Delete to remove
                  </text>
                )}
              </g>
            );
          })}

          {machine.states.map((s) => {
            const tone = highlights[s.label];
            const isSel = selected === s.id || transFrom === s.id;
            const confirming = confirmDelete === s.id;
            const stroke = confirming
              ? "var(--signal-amber)"
              : tone
                ? TONE_VAR[tone]
                : isSel
                  ? "var(--signal-blue)"
                  : "var(--border-strong)";
            return (
              <g
                key={s.id}
                style={{
                  cursor:
                    editable && mode === "pointer"
                      ? dragging === s.id
                        ? "grabbing"
                        : "grab"
                      : "inherit",
                }}
              >
                {s.isStart && (
                  <path
                    d={`M ${s.x - STATE_R - 30} ${s.y} L ${s.x - STATE_R - 5} ${s.y}`}
                    stroke="var(--signal-blue)"
                    strokeWidth="2.5"
                    markerEnd="url(#arr-hl)"
                  />
                )}
                {tone && (
                  <circle
                    cx={s.x}
                    cy={s.y}
                    r={STATE_R + 8}
                    fill="none"
                    stroke={TONE_VAR[tone]}
                    strokeWidth="1.5"
                    opacity="0.55"
                    filter="url(#state-glow)"
                  />
                )}
                {s.isAccepting && (
                  <circle
                    cx={s.x}
                    cy={s.y}
                    r={STATE_R + 5}
                    fill="none"
                    stroke={stroke}
                    strokeWidth="1.8"
                  />
                )}
                <circle
                  cx={s.x}
                  cy={s.y}
                  r={STATE_R}
                  fill={
                    tone
                      ? `color-mix(in srgb, ${TONE_VAR[tone]} 22%, var(--bg-panel))`
                      : "var(--bg-panel-raised)"
                  }
                  stroke={stroke}
                  strokeWidth={isSel || tone ? 2.6 : 1.8}
                />
                <text
                  x={s.x}
                  y={s.y + 4.5}
                  textAnchor="middle"
                  fontFamily="var(--font-mono-family)"
                  fontSize="13"
                  fill="var(--ink-primary)"
                >
                  {s.label}
                </text>
                {annotations.includes(s.label) && (
                  <text
                    x={s.x + STATE_R - 2}
                    y={s.y - STATE_R + 2}
                    textAnchor="middle"
                    fontSize="15"
                    fontWeight="700"
                    fill="var(--signal-amber)"
                  >
                    ?
                  </text>
                )}
                {confirming && (
                  <text
                    x={s.x}
                    y={s.y + STATE_R + 20}
                    textAnchor="middle"
                    fontSize="10"
                    fill="var(--signal-amber)"
                  >
                    click again to delete
                  </text>
                )}
              </g>
            );
          })}

          {!machine.states.length && (
            <text
              x={CANVAS_W / 2}
              y={CANVAS_H / 2}
              textAnchor="middle"
              fill="var(--ink-disabled)"
              fontSize="14"
            >
              Click to add a state
            </text>
          )}
        </g>
      </svg>

      <div className="canvas-view-controls">
        <button className="tool-btn" title="Zoom in (scroll up)" onClick={() => zoomAt(1.2)}>
          <ZoomIn size={15} />
        </button>
        <button className="tool-btn" title="Zoom out (scroll down)" onClick={() => zoomAt(1 / 1.2)}>
          <ZoomOut size={15} />
        </button>
        <button className="tool-btn" title="Reset view" onClick={resetView}>
          <Maximize2 size={15} />
        </button>
        <button
          className="tool-btn"
          title="Export canvas as PNG"
          onClick={() => {
            void exportSvgToPng(svgRef.current, { filename: `${exportName}.png` });
          }}
        >
          <Download size={15} />
        </button>
        <span className="canvas-zoom-readout">{Math.round(view.zoom * 100)}%</span>
      </div>

      {pending && (
        <div
          className="absolute z-20 w-[min(280px,90%)] rounded-2xl border p-3"
          style={{
            left: `min(calc(100% - 290px), ${toPct(pending.x, pending.y).left}%)`,
            top: `min(calc(100% - 150px), ${toPct(pending.x, pending.y).top}%)`,
            background: "var(--bg-panel)",
            borderColor: "var(--border-strong)",
            boxShadow: "var(--shadow-panel)",
          }}
        >
          <div className="section-label mb-2">
            {byId(pending.from)?.label} → {byId(pending.to)?.label}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {symbolChoices.map((sym) => {
              const on = pending.symbols.includes(sym);
              const conflict =
                !allowNondet &&
                !on &&
                checkTransitionConflict(
                  existingEdges.filter((e) => e.to !== pending.to),
                  pending.from,
                  pending.to,
                  sym,
                ).valid === false;
              return (
                <button
                  key={sym}
                  className="chip"
                  data-on={on}
                  data-blocked={conflict}
                  disabled={conflict}
                  onClick={() => toggleSymbol(sym)}
                  title={
                    conflict
                      ? "Determinism: this symbol is already used from this state"
                      : undefined
                  }
                >
                  {sym}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setPending(null)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={applyPending}>
              Done
            </button>
          </div>
        </div>
      )}

      {menu && (
        <div
          className="absolute z-20 w-52 overflow-hidden rounded-xl border py-1 text-xs"
          style={{
            left: `min(calc(100% - 215px), ${toPct(menu.x, menu.y).left}%)`,
            top: `min(calc(100% - 160px), ${toPct(menu.x, menu.y).top}%)`,
            background: "var(--bg-panel)",
            borderColor: "var(--border-strong)",
            boxShadow: "var(--shadow-panel)",
          }}
        >
          {renaming?.id === menu.id ? (
            <form
              className="p-2"
              onSubmit={(e) => {
                e.preventDefault();
                const value = renaming.value.trim();
                if (value)
                  onChange?.((prev) => ({
                    ...prev,
                    states: prev.states.map((s) => (s.id === menu.id ? { ...s, label: value } : s)),
                  }));
                setRenaming(null);
                setMenu(null);
              }}
            >
              <input
                autoFocus
                className="field-input"
                value={renaming.value}
                onChange={(e) => setRenaming({ id: menu.id, value: e.target.value })}
              />
            </form>
          ) : (
            <>
              <MenuItem
                label="Set as start"
                onClick={() => {
                  onChange?.((prev) => ({
                    ...prev,
                    states: prev.states.map((s) => ({ ...s, isStart: s.id === menu.id })),
                  }));
                  setMenu(null);
                }}
              />
              <MenuItem
                label="Toggle accepting"
                onClick={() => {
                  onChange?.((prev) => ({
                    ...prev,
                    states: prev.states.map((s) =>
                      s.id === menu.id ? { ...s, isAccepting: !s.isAccepting } : s,
                    ),
                  }));
                  setMenu(null);
                }}
              />
              <MenuItem
                label="Rename…"
                onClick={() => setRenaming({ id: menu.id, value: byId(menu.id)?.label ?? "" })}
              />
              <MenuItem label="Delete state" tone="reject" onClick={() => deleteState(menu.id)} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  tone,
}: {
  label: string;
  onClick: () => void;
  tone?: "reject";
}) {
  return (
    <button
      className="block w-full px-3 py-2 text-left transition-colors hover:bg-[var(--signal-blue-10)]"
      style={{ color: tone === "reject" ? "var(--signal-rose)" : "var(--ink-primary)" }}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
