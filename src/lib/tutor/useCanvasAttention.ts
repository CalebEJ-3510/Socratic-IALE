/**
 * Shared canvas-attention wiring for tutor actions.
 *
 * Reveal tier: whatever the host module already is. Every action here operates
 * on layout and attention only — highlighting, dimming, annotating, re-laying
 * out — never on facts the tutor is not allowed to know. That is why one hook
 * can serve Discovery (SECRET), Debugger (ABSTRACT) and Converter/Mutation
 * (PUBLIC) without leaking anything: it cannot express content.
 */
import { useEffect, useState } from "react";
import type { HighlightTone } from "@/components/DFACanvas";
import { onTutorAction } from "./actions";

export interface CanvasAttention {
  isolateSymbol: string | null;
  annotations: string[];
  highlightTransition: { from: string; to: string; color?: HighlightTone } | null;
  clear: () => void;
}

export function useCanvasAttention(
  active: boolean,
  onSimplifyLayout?: () => void,
): CanvasAttention {
  const [isolateSymbol, setIsolate] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<string[]>([]);
  const [highlightTransition, setHighlightTransition] =
    useState<CanvasAttention["highlightTransition"]>(null);

  useEffect(() => {
    if (!active) return;
    const offs = [
      onTutorAction("isolateSymbol", (a) => setIsolate(a.symbol)),
      onTutorAction("annotateState", (a) => setAnnotations((s) => [...new Set([...s, a.state])])),
      onTutorAction("highlightTransition", (a) =>
        setHighlightTransition({ from: a.from, to: a.to, color: a.color }),
      ),
      onTutorAction("simplifyLayout", () => onSimplifyLayout?.()),
    ];
    return () => offs.forEach((off) => off());
  }, [active, onSimplifyLayout]);

  return {
    isolateSymbol,
    annotations,
    highlightTransition,
    clear: () => {
      setIsolate(null);
      setAnnotations([]);
      setHighlightTransition(null);
    },
  };
}
