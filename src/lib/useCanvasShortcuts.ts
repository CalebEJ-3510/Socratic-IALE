import { useEffect } from "react";
import type { CanvasMode } from "@/components/DFACanvas";

const MAP: Record<string, CanvasMode> = { v: "pointer", s: "state", t: "transition", d: "delete" };

export function useCanvasShortcuts(
  enabled: boolean,
  setMode: (m: CanvasMode) => void,
  handlers: { undo?: () => void; redo?: () => void } = {},
) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) handlers.redo?.();
        else handlers.undo?.();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handlers.redo?.();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const mode = MAP[e.key.toLowerCase()];
      if (mode) {
        e.preventDefault();
        setMode(mode);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, setMode, handlers]);
}
