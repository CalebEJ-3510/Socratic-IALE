import type { ComponentType, ReactNode } from "react";
import {
  Circle,
  Eraser,
  LayoutGrid,
  MousePointer2,
  Redo2,
  Spline,
  Trash2,
  Undo2,
} from "lucide-react";
import type { CanvasMode } from "./DFACanvas";

const MODES: { mode: CanvasMode; icon: ComponentType<{ size?: number }>; title: string }[] = [
  { mode: "pointer", icon: MousePointer2, title: "Move / select (V)" },
  { mode: "state", icon: Circle, title: "Add state (S)" },
  { mode: "transition", icon: Spline, title: "Add transition (T)" },
  { mode: "delete", icon: Eraser, title: "Delete (D)" },
];

export function CanvasToolbar({
  mode,
  setMode,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onClear,
  onLayout,
  alphabet,
  children,
}: {
  mode: CanvasMode;
  setMode: (m: CanvasMode) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onClear?: () => void;
  onLayout?: () => void;
  alphabet?: string[];
  children?: ReactNode;
}) {
  return (
    <div className="canvas-toolbar">
      <div className="flex gap-1">
        {MODES.map((m) => (
          <button
            key={m.mode}
            className="tool-btn"
            data-active={mode === m.mode}
            title={m.title}
            aria-label={m.title}
            onClick={() => setMode(m.mode)}
          >
            <m.icon size={15} />
          </button>
        ))}
      </div>
      <span className="mx-1 h-5 w-px" style={{ background: "var(--border-subtle)" }} />
      {onUndo && (
        <button
          className="tool-btn"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo"
          aria-label="Undo"
        >
          <Undo2 size={15} />
        </button>
      )}
      {onRedo && (
        <button
          className="tool-btn"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo"
          aria-label="Redo"
        >
          <Redo2 size={15} />
        </button>
      )}
      {onClear && (
        <button
          className="tool-btn"
          onClick={onClear}
          title="Clear canvas"
          aria-label="Clear canvas"
        >
          <Trash2 size={15} />
        </button>
      )}
      {onLayout && (
        <button
          className="tool-btn"
          onClick={onLayout}
          title="Auto layout"
          aria-label="Auto layout"
        >
          <LayoutGrid size={15} />
        </button>
      )}
      {alphabet && (
        <span className="badge" data-tone="blue" style={{ fontFamily: "var(--font-mono-family)" }}>
          Σ = {"{"}
          {alphabet.join(",")}
          {"}"}
        </span>
      )}
      <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
