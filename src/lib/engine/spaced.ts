/**
 * Spaced-repetition queue over the mistake log.
 *
 * Each misconception category is a "card". Reviewing a card (finishing a drill
 * that targets it) pushes its next due date out along a fixed ladder; making
 * the same mistake again knocks the card back to the first interval.
 */
import { Storage, type DrillReview } from "../storage";
import { FIXED_CHALLENGES, type Challenge } from "./challenges";
import { REC_REASON } from "./recommendations";

const DAY = 24 * 60 * 60 * 1000;
/** Leitner-style ladder, in days. */
export const INTERVALS = [1, 3, 7, 16, 35];

export const CATEGORY_LABEL: Record<string, string> = {
  transition: "Missing transitions",
  accept: "Accepting status",
  crash: "Mid-string crashes",
  sink: "Trap / sink states",
  hint: "Heavy hint use",
};

export interface QueueCard {
  category: string;
  label: string;
  reason: string;
  /** How many successful reviews so far. */
  box: number;
  dueAt: number;
  overdueDays: number;
  mistakeCount: number;
  lastMistakeAt: number | null;
  challenge: Challenge;
}

export function intervalFor(box: number): number {
  return (INTERVALS[Math.min(box, INTERVALS.length - 1)] ?? 35) * DAY;
}

function pickChallenge(category: string, index: number): Challenge {
  const solved = new Set(
    Object.keys(Storage.getStats().solves).map((k) => k.split(":").slice(1).join(":")),
  );
  const pool = FIXED_CHALLENGES.filter((c) => !solved.has(c.id));
  const source = pool.length ? pool : FIXED_CHALLENGES;
  return source[index % source.length] ?? FIXED_CHALLENGES[0]!;
}

/** Every tracked card, soonest-due first. */
export function buildQueue(now = Date.now()): QueueCard[] {
  const mistakes = Storage.getAllMistakes();
  const reviews = Storage.getDrillReviews();
  const byCategory = new Map<string, { count: number; last: number }>();
  for (const m of mistakes) {
    const prev = byCategory.get(m.category) ?? { count: 0, last: 0 };
    byCategory.set(m.category, {
      count: prev.count + 1,
      last: Math.max(prev.last, m.timestamp),
    });
  }
  const cards: QueueCard[] = [];
  let i = 0;
  for (const [category, agg] of byCategory) {
    const review: DrillReview | undefined = reviews[category];
    // A mistake logged after the last review resets the card to box 0.
    const stale = review ? agg.last > review.reviewedAt : true;
    const box = stale ? 0 : review!.box;
    const base = review && !stale ? review.reviewedAt : agg.last;
    const dueAt = base + intervalFor(box);
    cards.push({
      category,
      label: CATEGORY_LABEL[category] ?? category,
      reason: REC_REASON[category] ?? "Targeted practice based on your mistake log.",
      box,
      dueAt,
      overdueDays: Math.floor((now - dueAt) / DAY),
      mistakeCount: agg.count,
      lastMistakeAt: agg.last || null,
      challenge: pickChallenge(category, i++),
    });
  }
  return cards.sort((a, b) => a.dueAt - b.dueAt);
}

export function dueCards(now = Date.now()): QueueCard[] {
  return buildQueue(now).filter((c) => c.dueAt <= now);
}

/** Called when a drill for this misconception is completed successfully. */
export function reviewCard(category: string) {
  const reviews = Storage.getDrillReviews();
  const box = Math.min((reviews[category]?.box ?? -1) + 1, INTERVALS.length - 1);
  Storage.recordDrillReview(category, box);
  return box;
}

export function describeDue(now = Date.now()): string {
  const due = dueCards(now);
  if (!due.length) return "No drills are due right now.";
  return `Due drills: ${due.map((c) => `${c.label} (${c.overdueDays <= 0 ? "today" : `${c.overdueDays}d overdue`})`).join(", ")}.`;
}
