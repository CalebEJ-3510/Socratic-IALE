import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileDown, FileUp } from "lucide-react";
import type { Machine } from "@/lib/machine";
import { downloadText, importMachineFile, toDot, toJflap, toSvg, toTikz } from "@/lib/exchange";

/**
 * Export the canvas to the formats courses already use (Graphviz DOT, JFLAP
 * .jff, LaTeX/TikZ, SVG) and import DOT/JFLAP back in.
 */
export function ExchangeMenu({
  machine,
  name = "automaton",
  onImport,
}: {
  machine: Machine;
  name?: string;
  onImport: (machine: Machine, alphabet: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "automaton";

  const guard = (fn: () => void) => () => {
    if (!machine.states.length) {
      toast.error("Nothing to export yet — add some states first");
      return;
    }
    fn();
    setOpen(false);
  };

  const exports = [
    {
      label: "Graphviz DOT (.dot)",
      run: guard(() => downloadText(`${slug}.dot`, toDot(machine, slug), "text/vnd.graphviz")),
    },
    {
      label: "JFLAP (.jff)",
      run: guard(() => downloadText(`${slug}.jff`, toJflap(machine), "application/xml")),
    },
    {
      label: "LaTeX / TikZ (.tex)",
      run: guard(() => downloadText(`${slug}.tex`, toTikz(machine), "text/x-tex")),
    },
    {
      label: "Vector image (.svg)",
      run: guard(() => downloadText(`${slug}.svg`, toSvg(machine), "image/svg+xml")),
    },
  ];

  const onFile = async (f: File | null | undefined) => {
    if (!f) return;
    const result = importMachineFile(f.name, await f.text());
    if (!result.ok) {
      toast.error("Import failed", { description: result.error });
      return;
    }
    onImport(result.data.machine, result.data.alphabet);
    toast.success(`Imported ${f.name}`, {
      description: `${result.data.machine.states.length} states · Σ = {${result.data.alphabet.join(",")}}`,
    });
    setOpen(false);
  };

  return (
    <div className="relative" ref={wrap}>
      <button
        className="btn-ghost inline-flex items-center gap-1.5"
        title="Export or import DOT, JFLAP, TikZ, SVG"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <FileDown size={13} /> Formats
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-30 w-56 rounded-2xl border p-1.5"
          style={{
            background: "var(--bg-panel)",
            borderColor: "var(--border-strong)",
            boxShadow: "var(--shadow-panel)",
          }}
        >
          <div className="section-label px-2 py-1">Export</div>
          {exports.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              className="w-full rounded-lg px-2 py-1.5 text-left text-xs hover:bg-[color:var(--signal-blue-10)]"
              onClick={item.run}
            >
              {item.label}
            </button>
          ))}
          <div className="section-label px-2 pt-2">Import</div>
          <button
            role="menuitem"
            className="inline-flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-[color:var(--signal-blue-10)]"
            onClick={() => file.current?.click()}
          >
            <FileUp size={12} /> DOT or JFLAP file…
          </button>
          <p className="px-2 pb-1 pt-1 text-[10px]" style={{ color: "var(--ink-disabled)" }}>
            JFLAP is parsed fully; DOT import covers this app's own export shape, not arbitrary
            hand-written graphs.
          </p>
          <input
            ref={file}
            type="file"
            accept=".dot,.gv,.jff,.xml"
            className="hidden"
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      )}
    </div>
  );
}
