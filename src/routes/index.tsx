import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import {
  ArrowRightLeft,
  Bot,
  Compass,
  FlaskConical,
  Moon,
  Bug,
  BarChart3,
  Layers,
  Swords,
  GitCompare,
  Sun,
  Workflow,
} from "lucide-react";
import { Converter } from "@/components/modules/Converter";
import { Discovery } from "@/components/modules/Discovery";
import { MutationLab } from "@/components/modules/MutationLab";
import { Debugger } from "@/components/modules/Debugger";
import { Analytics } from "@/components/modules/Analytics";
import { NFALab } from "@/components/modules/NFALab";
import { MinimizeLab } from "@/components/modules/MinimizeLab";
import { PumpingGame } from "@/components/modules/PumpingGame";
import { CompareLab } from "@/components/modules/CompareLab";
import { TutorPanel } from "@/components/TutorPanel";
import { useTheme } from "@/lib/theme";
import { Storage } from "@/lib/storage";
import { detectMisconceptions } from "@/lib/engine/algorithms";
import { onTutorAction } from "@/lib/tutor/actions";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "IALE — Interactive Automata Lab" },
      {
        name: "description",
        content:
          "Build, debug and mutate deterministic finite automata on a live canvas, with a Socratic AI tutor that never hands you the answer.",
      },
      { property: "og:title", content: "IALE — Interactive Automata Lab" },
      {
        property: "og:description",
        content:
          "Design DFAs by hand, discover hidden languages, and debug your machine against counterexamples.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type TabId =
  | "discovery"
  | "mutation"
  | "debugger"
  | "analytics"
  | "nfa"
  | "converter"
  | "minimizer"
  | "pumping"
  | "compare";

const TABS: { id: TabId; label: string; icon: typeof Compass }[] = [
  { id: "discovery", label: "Discovery", icon: Compass },
  { id: "mutation", label: "Mutation Lab", icon: FlaskConical },
  { id: "debugger", label: "Debugger", icon: Bug },
  { id: "nfa", label: "NFA Lab", icon: Workflow },
  { id: "converter", label: "Converter", icon: ArrowRightLeft },
  { id: "minimizer", label: "Minimizer", icon: Layers },
  { id: "compare", label: "Compare", icon: GitCompare },
  { id: "pumping", label: "Pumping Lemma", icon: Swords },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
];

function Index() {
  const [tab, setTab] = useState<TabId>("discovery");
  const [tutorOpen, setTutorOpen] = useState(false);
  /** The tutor is locked out while a timed exam session is running. */
  const [examActive, setExamActive] = useState(false);
  const { theme, toggle } = useTheme();
  const contexts = useRef<Partial<Record<TabId, () => string>>>({});

  const bind = useCallback(
    (id: TabId) => (fn: () => string) => {
      contexts.current[id] = fn;
    },
    [],
  );

  // Cross-module awareness: every module context is suffixed with the learner's
  // aggregate record so the tutor can connect today's slip to a recurring habit.
  const getContext = useCallback(() => {
    const base = contexts.current[tab]?.() ?? `Module: ${tab}. No context available.`;
    const habits = detectMisconceptions(Storage.getAllMistakes());
    const exam = Storage.getLastExamReport();
    const examLine = exam
      ? `Last exam: ${exam.score}/${exam.total}. Per-concept: ${exam.concepts
          .map((c) => `${c.concept} ${c.correct}/${c.total}`)
          .join("; ")}.`
      : "No exam taken yet.";
    return [
      base,
      examLine,
      `Learner record: attempted ${Storage.countAttemptedUnique()} unique challenges, solved ${Storage.countSolvedUnique()}.`,
      habits.length ? `Recurring habits: ${habits.join(" ")}` : "No recurring habit detected yet.",
    ].join("\n");
  }, [tab]);

  const goto = useCallback((next: string) => {
    if (TABS.some((t) => t.id === next)) setTab(next as TabId);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { type?: string; tab?: string };
      if (detail?.type === "gotoTab" && detail.tab) goto(detail.tab);
    };
    const examHandler = (e: Event) => {
      const active = !!(e as CustomEvent<{ active?: boolean }>).detail?.active;
      setExamActive(active);
      if (active) setTutorOpen(false);
    };
    window.addEventListener("iale-exam-state", examHandler);
    window.addEventListener("iale-tutor-action", handler);
    const offs = [
      onTutorAction("celebrate", () => toast.success("Nice work — that reasoning held up.")),
      onTutorAction("streakNudge", () =>
        toast("You're on a roll — want a harder language next?", {
          description: "Ask Socratic for a step up, or load a Hard challenge.",
        }),
      ),
    ];
    return () => {
      window.removeEventListener("iale-exam-state", examHandler);
      window.removeEventListener("iale-tutor-action", handler);
      offs.forEach((off) => off());
    };
  }, [goto]);

  return (
    <div className="lab-shell">
      <header className="app-header">
        <span className="brand">
          <span className="brand-dot" />
          IALE
        </span>
        <nav className="flex flex-wrap items-center gap-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className="nav-tab"
              data-active={tab === id}
              onClick={() => setTab(id)}
            >
              <span className="inline-flex items-center gap-1.5">
                <Icon size={14} />
                {label}
              </span>
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <button
            className="tool-btn"
            title={theme === "overcast" ? "Switch to dark" : "Switch to light"}
            onClick={toggle}
          >
            {theme === "overcast" ? <Moon size={15} /> : <Sun size={15} />}
          </button>
          <button
            className="tool-btn"
            data-active={tutorOpen}
            disabled={examActive}
            title={
              examActive
                ? "Socratic is offline during a timed exam"
                : "Socratic tutor (bring your own key)"
            }
            onClick={() => setTutorOpen((o) => !o)}
          >
            <Bot size={15} />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1">
          <ModulePane show={tab === "discovery"}>
            <Discovery active={tab === "discovery"} onContext={bind("discovery")} />
          </ModulePane>
          <ModulePane show={tab === "mutation"}>
            <MutationLab active={tab === "mutation"} onContext={bind("mutation")} />
          </ModulePane>
          <ModulePane show={tab === "debugger"}>
            <Debugger active={tab === "debugger"} onContext={bind("debugger")} />
          </ModulePane>
          <ModulePane show={tab === "nfa"}>
            <NFALab />
          </ModulePane>
          <ModulePane show={tab === "converter"}>
            <Converter active={tab === "converter"} onContext={bind("converter")} />
          </ModulePane>
          <ModulePane show={tab === "minimizer"}>
            <MinimizeLab active={tab === "minimizer"} onContext={bind("minimizer")} />
          </ModulePane>
          <ModulePane show={tab === "compare"}>
            <CompareLab active={tab === "compare"} onContext={bind("compare")} />
          </ModulePane>
          <ModulePane show={tab === "pumping"}>
            <PumpingGame active={tab === "pumping"} onContext={bind("pumping")} />
          </ModulePane>
          <ModulePane show={tab === "analytics"}>
            <Analytics active={tab === "analytics"} onContext={bind("analytics")} onGoto={goto} />
          </ModulePane>
        </main>
        <TutorPanel
          open={tutorOpen && !examActive}
          onClose={() => setTutorOpen(false)}
          moduleId={tab}
          getContext={getContext}
        />
      </div>
      <Toaster />
    </div>
  );
}

function ModulePane({ show, children }: { show: boolean; children: React.ReactNode }) {
  return (
    <div
      className="h-full min-h-0"
      style={{ display: show ? "flex" : "none", flexDirection: "column" }}
    >
      {children}
    </div>
  );
}
