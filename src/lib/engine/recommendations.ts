/**
 * Practice recommendations, derived from the app's existing mistake log and
 * solve history. Shared by the Analytics screen and the tutor panel so the
 * chat surfaces exactly the same cards the student would otherwise have to go
 * find on a separate screen — no second data store, no second ranking rule.
 */
import { FIXED_CHALLENGES, type Challenge } from "./challenges";
import { Storage } from "../storage";
import { dueCards } from "./spaced";

export const REC_REASON: Record<string, string> = {
  transition: "Missing transitions keep recurring — drill a small machine to completeness.",
  accept: "Accepting status is tripping you up — practice where runs must end.",
  crash: "Your machines crash mid-string — build total transition functions.",
  sink: "You're missing sink/trap states — learn when to give up cleanly.",
  hint: "Lots of hints used — try an easier language to rebuild confidence.",
};

export interface Recommendation {
  category: string;
  reason: string;
  challenge: Challenge;
}

export function buildRecommendations(limit = 3): Recommendation[] {
  // Spaced-repetition cards that have come due outrank raw mistake frequency:
  // they are the categories the schedule says need reinforcing right now.
  const due = dueCards();
  const seen = new Set<string>();
  const out: Recommendation[] = [];
  for (const c of due) {
    if (out.length >= limit) break;
    seen.add(c.category);
    out.push({
      category: c.category,
      reason: `Due for review — ${c.reason}`,
      challenge: c.challenge,
    });
  }
  if (out.length >= limit) return out;

  const mistakes = Storage.getMistakeSummary().data.filter((m) => !seen.has(m.category));
  const solvedIds = new Set(
    Object.keys(Storage.getStats().solves).map((k) => k.split(":").slice(1).join(":")),
  );
  const unsolved = FIXED_CHALLENGES.filter((c) => !solvedIds.has(c.id));
  return out.concat(
    mistakes.slice(0, limit - out.length).map((m, i) => ({
      category: m.category,
      reason: REC_REASON[m.category] ?? "Targeted practice based on your mistake log.",
      challenge: unsolved[i] ?? FIXED_CHALLENGES[i] ?? FIXED_CHALLENGES[0]!,
    })),
  );
}
